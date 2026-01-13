/**
 * Device Routes
 * Device status reporting, commands endpoints
 */

import { Router, Request, Response } from 'express';

import { isInNightSleep, calculateNightSleepDuration } from '../utils/time';
import { validateDeviceId, sanitizeInput } from '../utils/validation';
import { readJSONFile, writeJSONFile } from '../utils/data-store';
import { addDeviceLog } from '../utils/state';
import { getErrorMessage } from '../utils/error';
import { loggers } from '../services/logger';
import { apiKeyAuth } from '../middleware/auth';
import type {
  ServerSettings,
  CurrentData,
  DeviceStatus,
  DeviceCommand,
  DeviceStatusPayload,
  ProfilingPayload,
  BatteryHistoryEntry,
  SignalHistoryEntry,
  UsageStats,
  BatterySession,
  OperationSample,
  BrownoutEvent,
  OTAEvent,
  ProfilingEntry,
  ChargingSource,
} from '../types';

const log = loggers.device;

// Local type aliases for backward compatibility
type DeviceData = DeviceStatus;
type BrownoutHistoryEntry = BrownoutEvent;
type OtaHistoryEntry = OTAEvent;
type CommandData = DeviceCommand;

/**
 * Send low battery notification via webhook
 */
async function sendBatteryNotification(
  deviceId: string,
  batteryPercent: number,
  batteryVoltage: number,
  level: 'low' | 'critical'
): Promise<void> {
  try {
    const settings: ServerSettings = (await readJSONFile('settings.json')) || {};
    const webhookUrl = settings.notificationWebhook;

    if (!webhookUrl) {
      return;
    }

    const payload = {
      event: 'low_battery',
      level: level,
      device: deviceId,
      battery: {
        percent: batteryPercent,
        voltage: batteryVoltage,
      },
      message:
        level === 'critical'
          ? `CRITICAL: Battery at ${batteryPercent}% (${batteryVoltage}V) - device may shut down soon`
          : `Low battery: ${batteryPercent}% (${batteryVoltage}V) - consider charging`,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      log.error('Battery notification webhook failed', { status: response.status });
    } else {
      log.info('Battery notification sent', { deviceId, level });
    }
  } catch (error) {
    log.error('Error sending battery notification', {
      error: getErrorMessage(error),
    });
  }
}

/**
 * Create device routes
 */
export function createDeviceRoutes(): Router {
  const router = Router();

  /**
   * Device status reporting
   * POST /api/device-status
   */
  router.post('/device-status', async (req: Request, res: Response) => {
    try {
      const { deviceId, status, profiling } = req.body as {
        deviceId?: string;
        status?: DeviceStatusPayload;
        profiling?: ProfilingPayload;
      };

      if (!validateDeviceId(deviceId) || !status || typeof status !== 'object') {
        res.status(400).json({ error: 'Valid deviceId and status object required' });
        return;
      }

      // Check if device used fallback
      if (status.usedFallback === true) {
        const settings: ServerSettings = (await readJSONFile('settings.json')) || {};
        if (settings.devMode) {
          log.info('Dev mode disabled - device used fallback', {
            deviceId,
            devServerHost: settings.devServerHost,
          });
          addDeviceLog(`Dev server ${settings.devServerHost} unreachable, disabled dev mode`);

          settings.devMode = false;
          await writeJSONFile('settings.json', settings);
        }
      }

      // Load existing devices
      const devices: Record<string, DeviceData> = (await readJSONFile('devices.json')) || {};
      const previousDevice = devices[deviceId!] || ({} as Partial<DeviceData>);

      // Calculate battery percentage from voltage
      const batteryVoltage = parseFloat(String(status.batteryVoltage)) || 0;

      let batteryPercent = parseInt(String(status.batteryPercent));
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

      // Detect charging using voltage trend analysis
      const previousVoltage = previousDevice.batteryVoltage || 0;
      const voltageDelta = batteryVoltage - previousVoltage;
      const batteryHistory: BatteryHistoryEntry[] = previousDevice.batteryHistory || [];

      let isCharging = false;
      let chargingSource: ChargingSource = 'none';

      // Priority 1: ESP32's charging detection
      if (typeof status.isCharging === 'boolean') {
        isCharging = status.isCharging;
        chargingSource = 'esp32';
      }
      // Priority 2: Fallback voltage rise detection
      else if (previousVoltage > 0 && voltageDelta > 0.15) {
        isCharging = true;
        chargingSource = 'voltage_rise';
        loggers.battery.info('Charging detected via voltage rise', {
          deviceId,
          previousVoltage,
          currentVoltage: batteryVoltage,
          delta: parseFloat(voltageDelta.toFixed(3)),
        });
      }

      // Priority 3: Override using voltage trend analysis
      if (isCharging && chargingSource === 'esp32' && batteryHistory.length >= 3) {
        const recentReadings = batteryHistory.slice(-5);
        let voltageTrend = 0;
        for (let i = 1; i < recentReadings.length; i++) {
          voltageTrend += recentReadings[i]!.voltage - recentReadings[i - 1]!.voltage;
        }
        voltageTrend = voltageTrend / (recentReadings.length - 1);

        if (voltageTrend <= 0.01) {
          isCharging = false;
          chargingSource = 'trend_override';
          loggers.battery.info('Charging status overridden by voltage trend', {
            deviceId,
            esp32Said: true,
            trend: parseFloat(voltageTrend.toFixed(4)),
            recentVoltages: recentReadings.map((r) => r.voltage),
            reason: 'Voltage stable/falling indicates not charging',
          });
        }
      }

      let lastChargeTimestamp = previousDevice.lastChargeTimestamp || null;

      if (isCharging && !previousDevice.isCharging) {
        lastChargeTimestamp = Date.now();
        loggers.battery.info('Device started charging', { deviceId, voltage: batteryVoltage });
        addDeviceLog(`Device ${deviceId} started charging`);
      }

      // Track battery history
      const isDisplayUpdate = status.status === 'display_updating' || status.status === 'display_complete';

      if (batteryVoltage > 0) {
        batteryHistory.push({
          timestamp: Date.now(),
          voltage: batteryVoltage,
          isCharging: isCharging,
          isDisplayUpdate: isDisplayUpdate,
        });
        if (batteryHistory.length > 100) {
          batteryHistory.shift();
        }
      }

      // Track signal strength history
      const signalHistory: SignalHistoryEntry[] = previousDevice.signalHistory || [];
      const signalStrength = parseInt(String(status.signalStrength)) || 0;

      if (signalStrength !== 0) {
        signalHistory.push({
          timestamp: Date.now(),
          rssi: signalStrength,
        });
        if (signalHistory.length > 100) {
          signalHistory.shift();
        }
      }

      // Track usage statistics
      const usageStats: UsageStats = previousDevice.usageStats || {
        totalWakes: 0,
        totalDisplayUpdates: 0,
        totalVoltageDrop: 0,
        lastFullCharge: null,
        wakesThisCycle: 0,
        displayUpdatesThisCycle: 0,
        voltageAtFullCharge: null,
        displayUpdateVoltageDrop: 0,
        nonDisplayVoltageDrop: 0,
        otaUpdateVoltageDrop: 0,
        otaUpdateCount: 0,
      };

      // Track battery sessions
      const batterySessions: BatterySession[] = previousDevice.batterySessions || [];
      const currentSession = previousDevice.currentSession || null;

      // Track individual operation samples
      const operationSamples: OperationSample[] = previousDevice.operationSamples || [];

      // Get firmware version
      const firmwareVersion =
        sanitizeInput(status.firmwareVersion) || previousDevice.firmwareVersion || 'unknown';

      // Handle charge cycle transitions
      if (isCharging && !previousDevice.isCharging) {
        if (currentSession && currentSession.startTime) {
          const completedSession: BatterySession = {
            ...currentSession,
            endTime: Date.now(),
            endVoltage: previousVoltage,
            endPercent: previousDevice.batteryPercent || 0,
            duration: Date.now() - currentSession.startTime,
          };
          batterySessions.push(completedSession);
          if (batterySessions.length > 20) {
            batterySessions.shift();
          }
          loggers.battery.info('Battery session completed', {
            deviceId,
            wakes: completedSession.wakes,
            displayUpdates: completedSession.displayUpdates,
            totalVoltageDropMv: Math.round(completedSession.totalVoltageDrop * 1000),
            durationMs: completedSession.duration,
            firmwareVersions: completedSession.firmwareVersions,
          });
        }

        usageStats.lastFullCharge = Date.now();
        usageStats.voltageAtFullCharge = batteryVoltage;
        usageStats.wakesThisCycle = 0;
        usageStats.displayUpdatesThisCycle = 0;
      }

      // Track OTA updates
      const isOtaUpdate = status.status === 'ota_updating' || status.status === 'ota_complete';

      // Initialize or update current session
      let newCurrentSession = currentSession;
      if (!isCharging && previousDevice.isCharging) {
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
          otaVoltageDrop: 0,
        };
        loggers.battery.info('New battery session started', {
          deviceId,
          voltage: batteryVoltage,
          percent: batteryPercent,
          firmwareVersion,
        });
      } else if (!isCharging && currentSession) {
        newCurrentSession = { ...currentSession };
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

          const operationType = isDisplayUpdate ? 'display' : isOtaUpdate ? 'ota' : 'wake';
          operationSamples.push({
            timestamp: Date.now(),
            type: operationType,
            voltageBefore: previousVoltage,
            voltageAfter: batteryVoltage,
            voltageDrop: drop,
            firmwareVersion: firmwareVersion,
            signalStrength: signalStrength,
          });
          if (operationSamples.length > 200) {
            operationSamples.shift();
          }
        }
      }

      // Track brownout count and history
      const brownoutCount = parseInt(String(status.brownoutCount)) || 0;
      const previousBrownoutCount = previousDevice.brownoutCount || 0;
      const brownoutHistory: BrownoutHistoryEntry[] = previousDevice.brownoutHistory || [];

      if (brownoutCount > previousBrownoutCount) {
        const newBrownouts = brownoutCount - previousBrownoutCount;
        loggers.device.warn('Brownout detected', {
          deviceId,
          brownoutCount,
          newBrownouts,
          voltage: batteryVoltage,
          percent: batteryPercent,
          status: sanitizeInput(status.status),
        });
        addDeviceLog(`Brownout detected (count: ${brownoutCount}) at ${batteryVoltage}V (${batteryPercent}%)`);

        brownoutHistory.push({
          timestamp: Date.now(),
          brownoutNumber: brownoutCount,
          batteryVoltage: batteryVoltage,
          batteryPercent: batteryPercent,
          status: sanitizeInput(status.status) || 'unknown',
          displayUpdatesThisCycle: usageStats.displayUpdatesThisCycle || 0,
          wakesThisCycle: usageStats.wakesThisCycle || 0,
        });

        if (brownoutHistory.length > 50) {
          brownoutHistory.shift();
        }
      }

      // Track firmware version and OTA updates
      const previousVersion = previousDevice.firmwareVersion || null;
      const otaHistory: OtaHistoryEntry[] = previousDevice.otaHistory || [];

      if (firmwareVersion && previousVersion && firmwareVersion !== previousVersion) {
        const otaEvent: OtaHistoryEntry = {
          timestamp: Date.now(),
          fromVersion: previousVersion,
          toVersion: firmwareVersion,
          success: true,
        };
        otaHistory.push(otaEvent);
        if (otaHistory.length > 10) {
          otaHistory.shift();
        }
        loggers.ota.info('OTA update successful', {
          deviceId,
          fromVersion: previousVersion,
          toVersion: firmwareVersion,
        });
        addDeviceLog(`OTA Update successful: ${previousVersion} -> ${firmwareVersion}`);
      }

      // Track OTA status changes
      const deviceStatus = sanitizeInput(status.status) || 'unknown';
      const previousStatus = previousDevice.status;

      if (deviceStatus === 'ota_failed' && previousStatus !== 'ota_failed') {
        const otaEvent: OtaHistoryEntry = {
          timestamp: Date.now(),
          fromVersion: firmwareVersion || previousVersion || 'unknown',
          toVersion: 'unknown',
          success: false,
          error: 'OTA update failed',
        };
        otaHistory.push(otaEvent);
        if (otaHistory.length > 10) {
          otaHistory.shift();
        }
        loggers.ota.error('OTA update failed', {
          deviceId,
          firmwareVersion: firmwareVersion || previousVersion,
        });
        addDeviceLog(`OTA Update failed`);
      }

      // Process profiling telemetry data
      let profilingHistory: ProfilingEntry[] = previousDevice.profilingHistory || [];
      if (profiling && typeof profiling === 'object') {
        profilingHistory.push({
          timestamp: new Date().toISOString(),
          displayInitMs: parseInt(String(profiling.displayInitMs)) || 0,
          wifiConnectMs: parseInt(String(profiling.wifiConnectMs)) || 0,
          otaCheckMs: parseInt(String(profiling.otaCheckMs)) || 0,
          metadataFetchMs: parseInt(String(profiling.metadataFetchMs)) || 0,
          imageDownloadMs: parseInt(String(profiling.imageDownloadMs)) || 0,
          displayRefreshMs: parseInt(String(profiling.displayRefreshMs)) || 0,
          totalWakeMs: parseInt(String(profiling.totalWakeMs)) || 0,
          hasDisplayUpdate: profiling.hasDisplayUpdate === true,
          batteryVoltage: batteryVoltage,
          firmwareVersion: firmwareVersion,
          signalStrength: signalStrength,
        });
        if (profilingHistory.length > 100) {
          profilingHistory.shift();
        }
      }

      // Update device status
      devices[deviceId!] = {
        batteryVoltage: batteryVoltage,
        batteryPercent: isCharging ? null : batteryPercent || 0,
        isCharging: isCharging,
        chargingSource: chargingSource,
        lastChargeTimestamp: lastChargeTimestamp,
        batteryHistory: batteryHistory,
        usageStats: usageStats,
        batterySessions: batterySessions,
        currentSession: isCharging ? null : newCurrentSession,
        operationSamples: operationSamples,
        signalStrength: signalStrength,
        signalHistory: signalHistory,
        freeHeap: parseInt(String(status.freeHeap)) || 0,
        bootCount: parseInt(String(status.bootCount)) || 0,
        brownoutCount: brownoutCount,
        brownoutHistory: brownoutHistory,
        firmwareVersion: firmwareVersion !== 'unknown' ? firmwareVersion : previousDevice.firmwareVersion || null,
        otaHistory: otaHistory,
        profilingHistory: profilingHistory,
        status: deviceStatus,
        lastSeen: Date.now(),
        deviceId: sanitizeInput(deviceId) || '',
      };

      await writeJSONFile('devices.json', devices);

      // Low battery alerts
      const previousPercent = previousDevice.batteryPercent || 100;
      if (!isCharging && batteryPercent > 0) {
        if (batteryPercent < 15 && previousPercent >= 15) {
          loggers.battery.error('Critical battery level', {
            deviceId,
            percent: batteryPercent,
            voltage: batteryVoltage,
          });
          addDeviceLog(`CRITICAL: Battery at ${batteryPercent}% - device may shut down soon`);
          sendBatteryNotification(deviceId!, batteryPercent, batteryVoltage, 'critical');
        } else if (batteryPercent < 30 && previousPercent >= 30) {
          loggers.battery.warn('Low battery level', {
            deviceId,
            percent: batteryPercent,
            voltage: batteryVoltage,
          });
          addDeviceLog(`Low battery: ${batteryPercent}% - consider charging`);
          sendBatteryNotification(deviceId!, batteryPercent, batteryVoltage, 'low');
        }
      }

      loggers.device.info('Device status received', {
        deviceId,
        voltage: batteryVoltage,
        percent: batteryPercent,
        isCharging,
        signalStrength: parseInt(String(status.signalStrength)) || 0,
        status: status.status,
        firmwareVersion,
      });
      addDeviceLog(
        `Device ${deviceId} reported: Battery ${batteryVoltage}V (${batteryPercent}%)${isCharging ? ' [Charging]' : ''}, Signal ${status.signalStrength}dBm, Status: ${status.status}`
      );

      res.json({ success: true });
    } catch (error) {
      log.error('Error updating device status', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get ESP32 device status for admin interface
   * GET /api/esp32-status
   */
  router.get('/esp32-status', async (_req: Request, res: Response) => {
    try {
      const devices: Record<string, DeviceData> = (await readJSONFile('devices.json')) || {};

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
        res.json({
          state: 'offline',
          batteryVoltage: null,
          batteryPercent: null,
          isCharging: false,
          lastChargeTimestamp: null,
          signalStrength: null,
          lastSeen: null,
          sleepDuration: null,
          deviceId: null,
        });
        return;
      }

      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const isOnline = deviceStatus.lastSeen > fiveMinutesAgo;

      const current: CurrentData = (await readJSONFile('current.json')) || {};
      const settings: ServerSettings = (await readJSONFile('settings.json')) || {};

      let sleepDuration = current.sleepDuration || 3600000000;
      if (isInNightSleep(settings)) {
        sleepDuration = calculateNightSleepDuration(settings);
      }

      // Smart battery estimation
      let batteryEstimate: {
        hoursRemaining: number;
        cyclesRemaining: number;
        confidence: number;
        avgDropPerWake: number;
        displayUpdateRatio: number;
        dataPoints: number;
      } | null = null;
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
            dataPoints: stats.totalWakes,
          };
        }
      }

      // Compute per-firmware version statistics
      const firmwareStats: Record<
        string,
        {
          version: string;
          displayDrops: number[];
          wakeDrops: number[];
          otaDrops: number[];
          totalSamples: number;
          firstSeen: number;
          lastSeen: number;
        }
      > = {};
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
            lastSeen: sample.timestamp,
          };
        }
        const fs = firmwareStats[ver]!;
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

      const firmwareAnalysis = Object.values(firmwareStats)
        .map((fs) => {
          const avgDisplay =
            fs.displayDrops.length > 0 ? fs.displayDrops.reduce((a, b) => a + b, 0) / fs.displayDrops.length : null;
          const avgWake = fs.wakeDrops.length > 0 ? fs.wakeDrops.reduce((a, b) => a + b, 0) / fs.wakeDrops.length : null;
          const avgOta = fs.otaDrops.length > 0 ? fs.otaDrops.reduce((a, b) => a + b, 0) / fs.otaDrops.length : null;

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
            lastSeen: fs.lastSeen,
          };
        })
        .sort((a, b) => b.lastSeen - a.lastSeen);

      res.json({
        state: isOnline ? 'online' : 'offline',
        deviceId: deviceId,
        batteryVoltage: deviceStatus.batteryVoltage,
        batteryPercent: deviceStatus.batteryPercent,
        isCharging: deviceStatus.isCharging,
        chargingSource: deviceStatus.chargingSource || 'unknown',
        lastChargeTimestamp: deviceStatus.lastChargeTimestamp,
        batteryHistory: deviceStatus.batteryHistory || [],
        batteryEstimate: batteryEstimate,
        usageStats: stats || null,
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
        profilingHistory: deviceStatus.profilingHistory || [],
        status: deviceStatus.status,
        currentImage: current.title || null,
      });
    } catch (error) {
      log.error('Error getting ESP32 status', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Send command to device
   * POST /api/device-command/:deviceId
   */
  router.post('/device-command/:deviceId', apiKeyAuth, async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;
      const { command, duration } = req.body as { command?: string; duration?: string | number };

      if (!validateDeviceId(deviceId)) {
        res.status(400).json({ error: 'Valid deviceId required' });
        return;
      }

      const validCommands = ['stay_awake', 'force_update', 'update_now', 'enable_streaming', 'disable_streaming'];
      if (!command || !validCommands.includes(command)) {
        res.status(400).json({
          error: 'Invalid command. Valid commands: ' + validCommands.join(', '),
        });
        return;
      }

      const devices: Record<string, DeviceData> = (await readJSONFile('devices.json')) || {};

      if (!devices[deviceId!]) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }

      const isRecentlyActive = Date.now() - devices[deviceId!]!.lastSeen < 300000;

      const deviceCommand: CommandData = {
        command: command as DeviceCommand['command'],
        duration: parseInt(String(duration)) || 300000,
        timestamp: Date.now(),
        deviceId: sanitizeInput(deviceId) || '',
      };

      const commands: Record<string, CommandData[]> = (await readJSONFile('commands.json')) || {};
      if (!commands[deviceId!]) {
        commands[deviceId!] = [];
      }

      commands[deviceId!]!.push(deviceCommand);

      if (commands[deviceId!]!.length > 10) {
        commands[deviceId!] = commands[deviceId!]!.slice(-10);
      }

      await writeJSONFile('commands.json', commands);

      log.info('Command sent to device', { command, deviceId });

      const message = isRecentlyActive
        ? `Command sent to ${deviceId}`
        : `Command queued for ${deviceId} (device currently asleep - will execute on next wake)`;

      res.json({
        success: true,
        message,
        isRecentlyActive,
        lastSeen: devices[deviceId!]!.lastSeen,
      });
    } catch (error) {
      log.error('Error sending device command', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get commands for device (ESP32 polls this)
   * GET /api/commands/:deviceId
   */
  router.get('/commands/:deviceId', async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;

      if (!validateDeviceId(deviceId)) {
        res.status(400).json({ error: 'Valid deviceId required' });
        return;
      }

      const commands: Record<string, CommandData[]> = (await readJSONFile('commands.json')) || {};
      const deviceCommands = commands[deviceId!] || [];

      if (deviceCommands.length > 0) {
        commands[deviceId!] = [];
        await writeJSONFile('commands.json', commands);
      }

      res.json({ commands: deviceCommands });
    } catch (error) {
      log.error('Error getting commands', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get all devices
   * GET /api/devices
   */
  router.get('/devices', async (_req: Request, res: Response) => {
    try {
      const devices = (await readJSONFile('devices.json')) || {};
      res.json(devices);
    } catch (error) {
      log.error('Error getting devices', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createDeviceRoutes;
