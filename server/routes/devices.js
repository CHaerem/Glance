/**
 * Device Routes
 * Device status reporting, commands endpoints
 */

const express = require('express');

const { isInNightSleep, calculateNightSleepDuration } = require('../utils/time');
const { validateDeviceId, sanitizeInput } = require('../utils/validation');
const { readJSONFile, writeJSONFile } = require('../utils/data-store');
const { addDeviceLog } = require('../utils/state');
const { loggers } = require('../services/logger');

/**
 * Send low battery notification via webhook
 */
async function sendBatteryNotification(deviceId, batteryPercent, batteryVoltage, level) {
    try {
        const settings = (await readJSONFile('settings.json')) || {};
        const webhookUrl = settings.notificationWebhook;

        if (!webhookUrl) {
            return; // No webhook configured
        }

        const payload = {
            event: 'low_battery',
            level: level, // 'low' or 'critical'
            device: deviceId,
            battery: {
                percent: batteryPercent,
                voltage: batteryVoltage
            },
            message: level === 'critical'
                ? `CRITICAL: Battery at ${batteryPercent}% (${batteryVoltage}V) - device may shut down soon`
                : `Low battery: ${batteryPercent}% (${batteryVoltage}V) - consider charging`,
            timestamp: new Date().toISOString()
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Battery notification webhook failed: ${response.status}`);
        } else {
            console.log(`Battery notification sent for ${deviceId}: ${level}`);
        }
    } catch (error) {
        console.error('Error sending battery notification:', error);
    }
}

/**
 * Create device routes
 * @returns {express.Router} Express router
 */
function createDeviceRoutes() {
    const router = express.Router();

    /**
     * Device status reporting (replaces GitHub Actions)
     * POST /api/device-status
     */
    router.post('/device-status', async (req, res) => {
        try {
            const { deviceId, status } = req.body;

            if (!validateDeviceId(deviceId) || !status || typeof status !== 'object') {
                return res.status(400).json({ error: 'Valid deviceId and status object required' });
            }

            // Check if device used fallback (couldn't reach dev server)
            if (status.usedFallback === true) {
                const settings = (await readJSONFile('settings.json')) || {};
                if (settings.devMode) {
                    console.log(`[Dev Mode] Device ${deviceId} couldn't reach dev server ${settings.devServerHost}, auto-disabling dev mode`);
                    addDeviceLog(`Dev server ${settings.devServerHost} unreachable, disabled dev mode`);

                    settings.devMode = false;
                    await writeJSONFile('settings.json', settings);
                }
            }

            // Load existing devices
            const devices = (await readJSONFile('devices.json')) || {};
            const previousDevice = devices[deviceId] || {};

            // Calculate battery percentage from voltage first
            const batteryVoltage = parseFloat(status.batteryVoltage) || 0;

            // Detect charging - trust ESP32's explicit isCharging state first
            const previousVoltage = previousDevice.batteryVoltage || 0;
            const voltageDelta = batteryVoltage - previousVoltage;

            let isCharging = false;

            // Priority 1: Trust ESP32's charging detection (firmware v1.0.0+)
            if (typeof status.isCharging === 'boolean') {
                isCharging = status.isCharging;
            }
            // Priority 2: Fallback voltage rise detection for old firmware
            // Raised threshold from 0.05V to 0.15V to reduce false positives from battery recovery
            else if (previousVoltage > 0 && voltageDelta > 0.15) {
                isCharging = true;
                loggers.battery.info('Charging detected via voltage rise', {
                    deviceId,
                    previousVoltage,
                    currentVoltage: batteryVoltage,
                    delta: parseFloat(voltageDelta.toFixed(3))
                });
            }

            let lastChargeTimestamp = previousDevice.lastChargeTimestamp || null;

            if (isCharging && !previousDevice.isCharging) {
                lastChargeTimestamp = Date.now();
                loggers.battery.info('Device started charging', { deviceId, voltage: batteryVoltage });
                addDeviceLog(`Device ${deviceId} started charging`);
            }

            // Track battery history
            const batteryHistory = previousDevice.batteryHistory || [];
            const isDisplayUpdate = status.status === 'display_updating' || status.status === 'display_complete';

            if (batteryVoltage > 0) {
                batteryHistory.push({
                    timestamp: Date.now(),
                    voltage: batteryVoltage,
                    isCharging: isCharging,
                    isDisplayUpdate: isDisplayUpdate
                });
                if (batteryHistory.length > 100) {
                    batteryHistory.shift();
                }
            }

            // Track signal strength history
            const signalHistory = previousDevice.signalHistory || [];
            const signalStrength = parseInt(status.signalStrength) || 0;

            if (signalStrength !== 0) {
                signalHistory.push({
                    timestamp: Date.now(),
                    rssi: signalStrength
                });
                if (signalHistory.length > 100) {
                    signalHistory.shift();
                }
            }

            // Track usage statistics
            const usageStats = previousDevice.usageStats || {
                totalWakes: 0,
                totalDisplayUpdates: 0,
                totalVoltageDrop: 0,
                lastFullCharge: null,
                wakesThisCycle: 0,
                displayUpdatesThisCycle: 0,
                voltageAtFullCharge: null,
                // Per-operation battery consumption tracking
                displayUpdateVoltageDrop: 0,  // Voltage drop during display updates
                nonDisplayVoltageDrop: 0,     // Voltage drop during non-display wakes
                otaUpdateVoltageDrop: 0,      // Voltage drop during OTA updates
                otaUpdateCount: 0             // Number of OTA updates
            };

            // Track battery sessions (charge cycles) for long-term analysis
            const batterySessions = previousDevice.batterySessions || [];
            const currentSession = previousDevice.currentSession || null;

            // Track individual operation samples with firmware version
            const operationSamples = previousDevice.operationSamples || [];

            // Get firmware version for tracking
            const firmwareVersion = sanitizeInput(status.firmwareVersion) || previousDevice.firmwareVersion || 'unknown';

            // Handle charge cycle transitions
            if (isCharging && !previousDevice.isCharging) {
                // Starting to charge - close current session if exists
                if (currentSession && currentSession.startTime) {
                    const completedSession = {
                        ...currentSession,
                        endTime: Date.now(),
                        endVoltage: previousVoltage,
                        endPercent: previousDevice.batteryPercent || 0,
                        duration: Date.now() - currentSession.startTime
                    };
                    batterySessions.push(completedSession);
                    // Keep last 20 sessions
                    if (batterySessions.length > 20) {
                        batterySessions.shift();
                    }
                    loggers.battery.info('Battery session completed', {
                        deviceId,
                        wakes: completedSession.wakes,
                        displayUpdates: completedSession.displayUpdates,
                        totalVoltageDropMv: Math.round(completedSession.totalVoltageDrop * 1000),
                        durationMs: completedSession.duration,
                        firmwareVersions: completedSession.firmwareVersions
                    });
                }

                usageStats.lastFullCharge = Date.now();
                usageStats.voltageAtFullCharge = batteryVoltage;
                usageStats.wakesThisCycle = 0;
                usageStats.displayUpdatesThisCycle = 0;
            }

            // Track OTA updates
            const isOtaUpdate = status.status === 'ota_updating' || status.status === 'ota_complete';

            // Initialize or update current session when on battery
            let newCurrentSession = currentSession;
            if (!isCharging && previousDevice.isCharging) {
                // Just unplugged - start new session
                newCurrentSession = {
                    startTime: Date.now(),
                    startVoltage: batteryVoltage,
                    startPercent: batteryPercent,
                    firmwareVersions: [firmwareVersion],
                    wakes: 0,
                    displayUpdates: 0,
                    otaUpdates: 0,
                    totalVoltageDrop: 0,
                    displayVoltageDrop: 0,
                    wakeVoltageDrop: 0,
                    otaVoltageDrop: 0
                };
                loggers.battery.info('New battery session started', {
                    deviceId,
                    voltage: batteryVoltage,
                    percent: batteryPercent,
                    firmwareVersion
                });
            } else if (!isCharging && currentSession) {
                newCurrentSession = { ...currentSession };
                // Track firmware version changes within session
                if (!newCurrentSession.firmwareVersions.includes(firmwareVersion)) {
                    newCurrentSession.firmwareVersions.push(firmwareVersion);
                }
            }

            if (!isCharging && previousVoltage > 0) {
                usageStats.totalWakes++;
                usageStats.wakesThisCycle++;

                if (isDisplayUpdate) {
                    usageStats.totalDisplayUpdates++;
                    usageStats.displayUpdatesThisCycle++;
                }

                if (isOtaUpdate) {
                    usageStats.otaUpdateCount = (usageStats.otaUpdateCount || 0) + 1;
                }

                // Track voltage drop by operation type
                const drop = voltageDelta < 0 ? Math.abs(voltageDelta) : 0;
                if (drop > 0) {
                    usageStats.totalVoltageDrop += drop;

                    if (isDisplayUpdate) {
                        usageStats.displayUpdateVoltageDrop = (usageStats.displayUpdateVoltageDrop || 0) + drop;
                    } else if (isOtaUpdate) {
                        usageStats.otaUpdateVoltageDrop = (usageStats.otaUpdateVoltageDrop || 0) + drop;
                    } else {
                        usageStats.nonDisplayVoltageDrop = (usageStats.nonDisplayVoltageDrop || 0) + drop;
                    }

                    // Update current session stats
                    if (newCurrentSession) {
                        newCurrentSession.wakes++;
                        newCurrentSession.totalVoltageDrop += drop;
                        if (isDisplayUpdate) {
                            newCurrentSession.displayUpdates++;
                            newCurrentSession.displayVoltageDrop += drop;
                        } else if (isOtaUpdate) {
                            newCurrentSession.otaUpdates++;
                            newCurrentSession.otaVoltageDrop += drop;
                        } else {
                            newCurrentSession.wakeVoltageDrop += drop;
                        }
                    }

                    // Record individual operation sample for granular analysis
                    const operationType = isDisplayUpdate ? 'display' : (isOtaUpdate ? 'ota' : 'wake');
                    operationSamples.push({
                        timestamp: Date.now(),
                        type: operationType,
                        voltageBefore: previousVoltage,
                        voltageAfter: batteryVoltage,
                        voltageDrop: drop,
                        firmwareVersion: firmwareVersion,
                        signalStrength: signalStrength
                    });
                    // Keep last 200 samples
                    if (operationSamples.length > 200) {
                        operationSamples.shift();
                    }
                }
            }

            // Calculate battery percentage from voltage
            let batteryPercent = parseInt(status.batteryPercent);

            if (!batteryPercent && batteryVoltage > 0) {
                if (batteryVoltage >= 4.2) batteryPercent = 100;
                else if (batteryVoltage >= 4.0) batteryPercent = 80 + ((batteryVoltage - 4.0) / 0.2) * 20;
                else if (batteryVoltage >= 3.7) batteryPercent = 50 + ((batteryVoltage - 3.7) / 0.3) * 30;
                else if (batteryVoltage >= 3.5) batteryPercent = 30 + ((batteryVoltage - 3.5) / 0.2) * 20;
                else if (batteryVoltage >= 3.3) batteryPercent = 10 + ((batteryVoltage - 3.3) / 0.2) * 20;
                else if (batteryVoltage >= 3.0) batteryPercent = ((batteryVoltage - 3.0) / 0.3) * 10;
                else batteryPercent = 0;
                batteryPercent = Math.round(batteryPercent);
            }

            // Track brownout count and history
            const brownoutCount = parseInt(status.brownoutCount) || 0;
            const previousBrownoutCount = previousDevice.brownoutCount || 0;
            const brownoutHistory = previousDevice.brownoutHistory || [];

            // Alert on new brownouts and record in history
            if (brownoutCount > previousBrownoutCount) {
                const newBrownouts = brownoutCount - previousBrownoutCount;
                loggers.device.warn('Brownout detected', {
                    deviceId,
                    brownoutCount,
                    newBrownouts,
                    voltage: batteryVoltage,
                    percent: batteryPercent,
                    status: sanitizeInput(status.status)
                });
                addDeviceLog(`Brownout detected (count: ${brownoutCount}) at ${batteryVoltage}V (${batteryPercent}%)`);

                // Record brownout event for analysis
                brownoutHistory.push({
                    timestamp: Date.now(),
                    brownoutNumber: brownoutCount,
                    batteryVoltage: batteryVoltage,
                    batteryPercent: batteryPercent,
                    status: sanitizeInput(status.status) || 'unknown',
                    displayUpdatesThisCycle: usageStats.displayUpdatesThisCycle || 0,
                    wakesThisCycle: usageStats.wakesThisCycle || 0
                });

                // Keep last 50 brownout events
                if (brownoutHistory.length > 50) {
                    brownoutHistory.shift();
                }
            }

            // Track firmware version and OTA updates (firmwareVersion already set above for session tracking)
            const previousVersion = previousDevice.firmwareVersion || null;
            const otaHistory = previousDevice.otaHistory || [];

            // Detect OTA update completion (version changed)
            if (firmwareVersion && previousVersion && firmwareVersion !== previousVersion) {
                const otaEvent = {
                    timestamp: Date.now(),
                    fromVersion: previousVersion,
                    toVersion: firmwareVersion,
                    success: true
                };
                otaHistory.push(otaEvent);
                if (otaHistory.length > 10) {
                    otaHistory.shift(); // Keep last 10 OTA events
                }
                loggers.ota.info('OTA update successful', {
                    deviceId,
                    fromVersion: previousVersion,
                    toVersion: firmwareVersion
                });
                addDeviceLog(`OTA Update successful: ${previousVersion} -> ${firmwareVersion}`);
            }

            // Track OTA status changes
            const deviceStatus = sanitizeInput(status.status) || 'unknown';
            const previousStatus = previousDevice.status;

            // Detect OTA failure (status changed to ota_failed)
            if (deviceStatus === 'ota_failed' && previousStatus !== 'ota_failed') {
                const otaEvent = {
                    timestamp: Date.now(),
                    fromVersion: firmwareVersion || previousVersion,
                    toVersion: 'unknown',
                    success: false,
                    error: 'OTA update failed'
                };
                otaHistory.push(otaEvent);
                if (otaHistory.length > 10) {
                    otaHistory.shift();
                }
                loggers.ota.error('OTA update failed', {
                    deviceId,
                    firmwareVersion: firmwareVersion || previousVersion
                });
                addDeviceLog(`OTA Update failed`);
            }

            // Update device status
            devices[deviceId] = {
                batteryVoltage: batteryVoltage,
                batteryPercent: batteryPercent || 0,
                isCharging: isCharging,
                lastChargeTimestamp: lastChargeTimestamp,
                batteryHistory: batteryHistory,
                usageStats: usageStats,
                // Long-term tracking for analysis
                batterySessions: batterySessions,
                currentSession: isCharging ? null : newCurrentSession,
                operationSamples: operationSamples,
                signalStrength: signalStrength,
                signalHistory: signalHistory,
                freeHeap: parseInt(status.freeHeap) || 0,
                bootCount: parseInt(status.bootCount) || 0,
                brownoutCount: brownoutCount,
                brownoutHistory: brownoutHistory,
                firmwareVersion: firmwareVersion !== 'unknown' ? firmwareVersion : (previousDevice.firmwareVersion || null),
                otaHistory: otaHistory,
                status: deviceStatus,
                lastSeen: Date.now(),
                deviceId: sanitizeInput(deviceId),
            };

            await writeJSONFile('devices.json', devices);

            // Low battery alerts
            const previousPercent = previousDevice.batteryPercent || 100;
            if (!isCharging && batteryPercent > 0) {
                if (batteryPercent < 15 && previousPercent >= 15) {
                    loggers.battery.error('Critical battery level', {
                        deviceId,
                        percent: batteryPercent,
                        voltage: batteryVoltage
                    });
                    addDeviceLog(`CRITICAL: Battery at ${batteryPercent}% - device may shut down soon`);
                    sendBatteryNotification(deviceId, batteryPercent, batteryVoltage, 'critical');
                } else if (batteryPercent < 30 && previousPercent >= 30) {
                    loggers.battery.warn('Low battery level', {
                        deviceId,
                        percent: batteryPercent,
                        voltage: batteryVoltage
                    });
                    addDeviceLog(`Low battery: ${batteryPercent}% - consider charging`);
                    sendBatteryNotification(deviceId, batteryPercent, batteryVoltage, 'low');
                }
            }

            // Structured device status log
            loggers.device.info('Device status received', {
                deviceId,
                voltage: batteryVoltage,
                percent: batteryPercent,
                isCharging,
                signalStrength: parseInt(status.signalStrength) || 0,
                status: status.status,
                firmwareVersion
            });
            addDeviceLog(`Device ${deviceId} reported: Battery ${batteryVoltage}V (${batteryPercent}%)${isCharging ? ' [Charging]' : ''}, Signal ${status.signalStrength}dBm, Status: ${status.status}`);

            res.json({ success: true });
        } catch (error) {
            console.error('Error updating device status:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Get ESP32 device status for admin interface
     * GET /api/esp32-status
     */
    router.get('/esp32-status', async (req, res) => {
        try {
            const devices = (await readJSONFile('devices.json')) || {};

            // Find most recently seen device
            let deviceId = process.env.DEVICE_ID;
            let deviceStatus = deviceId ? devices[deviceId] : null;

            if (!deviceStatus) {
                let latestSeen = 0;
                for (const [id, device] of Object.entries(devices)) {
                    if (device.lastSeen && device.lastSeen > latestSeen) {
                        latestSeen = device.lastSeen;
                        deviceId = id;
                        deviceStatus = device;
                    }
                }
            }

            if (!deviceStatus) {
                return res.json({
                    state: 'offline',
                    batteryVoltage: null,
                    batteryPercent: null,
                    isCharging: false,
                    lastChargeTimestamp: null,
                    signalStrength: null,
                    lastSeen: null,
                    sleepDuration: null,
                    deviceId: null
                });
            }

            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            const isOnline = deviceStatus.lastSeen > fiveMinutesAgo;

            const current = (await readJSONFile('current.json')) || {};
            const settings = (await readJSONFile('settings.json')) || {};

            let sleepDuration = current.sleepDuration || 3600000000;
            if (isInNightSleep(settings)) {
                sleepDuration = calculateNightSleepDuration(settings);
            }

            // Smart battery estimation
            let batteryEstimate = null;
            const stats = deviceStatus.usageStats;

            if (stats && stats.totalWakes >= 3 && !deviceStatus.isCharging) {
                const avgDropPerWake = stats.totalVoltageDrop / stats.totalWakes;
                const displayUpdateRatio = stats.totalDisplayUpdates / stats.totalWakes;
                const voltageRemaining = deviceStatus.batteryVoltage - 3.3;

                if (avgDropPerWake > 0 && voltageRemaining > 0) {
                    const remainingCycles = Math.floor(voltageRemaining / avgDropPerWake);
                    const sleepHours = sleepDuration / (1000000 * 60 * 60);
                    const estimatedHours = Math.round(remainingCycles * sleepHours);
                    const confidence = Math.min(100, Math.round((stats.totalWakes / 20) * 100));

                    batteryEstimate = {
                        hoursRemaining: estimatedHours,
                        cyclesRemaining: remainingCycles,
                        confidence: confidence,
                        avgDropPerWake: Math.round(avgDropPerWake * 1000) / 1000,
                        displayUpdateRatio: Math.round(displayUpdateRatio * 100),
                        dataPoints: stats.totalWakes
                    };
                }
            }

            // Compute per-firmware version statistics from operation samples
            const firmwareStats = {};
            const samples = deviceStatus.operationSamples || [];
            for (const sample of samples) {
                const ver = sample.firmwareVersion || 'unknown';
                if (!firmwareStats[ver]) {
                    firmwareStats[ver] = {
                        version: ver,
                        displayDrops: [],
                        wakeDrops: [],
                        otaDrops: [],
                        totalSamples: 0,
                        firstSeen: sample.timestamp,
                        lastSeen: sample.timestamp
                    };
                }
                const fs = firmwareStats[ver];
                fs.totalSamples++;
                fs.lastSeen = Math.max(fs.lastSeen, sample.timestamp);
                fs.firstSeen = Math.min(fs.firstSeen, sample.timestamp);

                if (sample.type === 'display') {
                    fs.displayDrops.push(sample.voltageDrop);
                } else if (sample.type === 'ota') {
                    fs.otaDrops.push(sample.voltageDrop);
                } else {
                    fs.wakeDrops.push(sample.voltageDrop);
                }
            }

            // Calculate averages for each firmware version
            const firmwareAnalysis = Object.values(firmwareStats).map(fs => {
                const avgDisplay = fs.displayDrops.length > 0
                    ? fs.displayDrops.reduce((a, b) => a + b, 0) / fs.displayDrops.length
                    : null;
                const avgWake = fs.wakeDrops.length > 0
                    ? fs.wakeDrops.reduce((a, b) => a + b, 0) / fs.wakeDrops.length
                    : null;
                const avgOta = fs.otaDrops.length > 0
                    ? fs.otaDrops.reduce((a, b) => a + b, 0) / fs.otaDrops.length
                    : null;

                return {
                    version: fs.version,
                    displayCount: fs.displayDrops.length,
                    wakeCount: fs.wakeDrops.length,
                    otaCount: fs.otaDrops.length,
                    totalSamples: fs.totalSamples,
                    avgDisplayDropMv: avgDisplay ? Math.round(avgDisplay * 1000) : null,
                    avgWakeDropMv: avgWake ? Math.round(avgWake * 1000) : null,
                    avgOtaDropMv: avgOta ? Math.round(avgOta * 1000) : null,
                    firstSeen: fs.firstSeen,
                    lastSeen: fs.lastSeen
                };
            }).sort((a, b) => b.lastSeen - a.lastSeen);

            res.json({
                state: isOnline ? 'online' : 'offline',
                deviceId: deviceId,
                batteryVoltage: deviceStatus.batteryVoltage,
                batteryPercent: deviceStatus.batteryPercent,
                isCharging: deviceStatus.isCharging,
                lastChargeTimestamp: deviceStatus.lastChargeTimestamp,
                batteryHistory: deviceStatus.batteryHistory || [],
                batteryEstimate: batteryEstimate,
                usageStats: stats || null,
                // Long-term analytics
                batterySessions: deviceStatus.batterySessions || [],
                currentSession: deviceStatus.currentSession || null,
                operationSamples: samples,
                firmwareAnalysis: firmwareAnalysis,
                signalStrength: deviceStatus.signalStrength,
                signalHistory: deviceStatus.signalHistory || [],
                lastSeen: deviceStatus.lastSeen,
                sleepDuration: sleepDuration,
                freeHeap: deviceStatus.freeHeap,
                brownoutCount: deviceStatus.brownoutCount || 0,
                brownoutHistory: deviceStatus.brownoutHistory || [],
                firmwareVersion: deviceStatus.firmwareVersion || null,
                otaHistory: deviceStatus.otaHistory || [],
                status: deviceStatus.status,
                currentImage: current.title || null
            });
        } catch (error) {
            console.error('Error getting ESP32 status:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Send command to device
     * POST /api/device-command/:deviceId
     */
    router.post('/device-command/:deviceId', async (req, res) => {
        try {
            const { deviceId } = req.params;
            const { command, duration } = req.body;

            if (!validateDeviceId(deviceId)) {
                return res.status(400).json({ error: 'Valid deviceId required' });
            }

            const validCommands = ['stay_awake', 'force_update', 'update_now', 'enable_streaming', 'disable_streaming'];
            if (!validCommands.includes(command)) {
                return res.status(400).json({
                    error: 'Invalid command. Valid commands: ' + validCommands.join(', '),
                });
            }

            const devices = (await readJSONFile('devices.json')) || {};

            if (!devices[deviceId]) {
                return res.status(404).json({ error: 'Device not found' });
            }

            const isRecentlyActive = Date.now() - devices[deviceId].lastSeen < 300000;

            const deviceCommand = {
                command,
                duration: parseInt(duration) || 300000,
                timestamp: Date.now(),
                deviceId: sanitizeInput(deviceId),
            };

            let commands = (await readJSONFile('commands.json')) || {};
            if (!commands[deviceId]) {
                commands[deviceId] = [];
            }

            commands[deviceId].push(deviceCommand);

            if (commands[deviceId].length > 10) {
                commands[deviceId] = commands[deviceId].slice(-10);
            }

            await writeJSONFile('commands.json', commands);

            console.log(`Command '${command}' sent to device: ${deviceId}`);

            const message = isRecentlyActive
                ? `Command sent to ${deviceId}`
                : `Command queued for ${deviceId} (device currently asleep - will execute on next wake)`;

            res.json({
                success: true,
                message,
                isRecentlyActive,
                lastSeen: devices[deviceId].lastSeen,
            });
        } catch (error) {
            console.error('Error sending device command:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Get commands for device (ESP32 polls this)
     * GET /api/commands/:deviceId
     */
    router.get('/commands/:deviceId', async (req, res) => {
        try {
            const { deviceId } = req.params;

            if (!validateDeviceId(deviceId)) {
                return res.status(400).json({ error: 'Valid deviceId required' });
            }

            const commands = (await readJSONFile('commands.json')) || {};
            const deviceCommands = commands[deviceId] || [];

            // Clear commands after sending
            if (deviceCommands.length > 0) {
                commands[deviceId] = [];
                await writeJSONFile('commands.json', commands);
            }

            res.json({ commands: deviceCommands });
        } catch (error) {
            console.error('Error getting commands:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Get all devices
     * GET /api/devices
     */
    router.get('/devices', async (_req, res) => {
        try {
            const devices = (await readJSONFile('devices.json')) || {};
            res.json(devices);
        } catch (error) {
            console.error('Error getting devices:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}

module.exports = createDeviceRoutes;
