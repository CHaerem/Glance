/**
 * Log Routes
 * Logging, serial stream, diagnostics endpoints
 */

const express = require('express');

const { validateDeviceId, sanitizeInput } = require('../utils/validation');
const { readJSONFile, writeJSONFile } = require('../utils/data-store');
const { deviceLogs } = require('../utils/state');
const { loggers } = require('../services/logger');
const log = loggers.api;

/**
 * Create log routes
 * @returns {express.Router} Express router
 */
function createLogRoutes() {
    const router = express.Router();

    /**
     * ESP32 log reporting
     * POST /api/logs
     */
    router.post('/logs', async (req, res) => {
        try {
            const { deviceId, logs, logLevel } = req.body;

            if (!validateDeviceId(deviceId) || !logs) {
                return res.status(400).json({ error: 'Valid deviceId and logs required' });
            }

            // Load existing logs
            const allLogs = (await readJSONFile('logs.json')) || {};

            // Initialize device logs if not exists
            if (!allLogs[deviceId]) {
                allLogs[deviceId] = [];
            }

            // Add new log entry
            const logEntry = {
                timestamp: Date.now(),
                level: sanitizeInput(logLevel) || 'INFO',
                message: sanitizeInput(logs),
                deviceTime: parseInt(req.body.deviceTime) || Date.now(),
            };

            allLogs[deviceId].push(logEntry);

            // Keep only last 1000 log entries per device
            if (allLogs[deviceId].length > 1000) {
                allLogs[deviceId] = allLogs[deviceId].slice(-1000);
            }

            await writeJSONFile('logs.json', allLogs);

            log.debug('Log received from device', { deviceId, logs });

            res.json({ success: true });
        } catch (error) {
            log.error('Error storing logs', { error: error.message });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * ESP32 serial stream reporting for real-time monitoring
     * POST /api/serial-stream
     */
    router.post('/serial-stream', async (req, res) => {
        try {
            const { deviceId, serialOutput, streamEvent, timestamp, bufferSize } = req.body;

            if (!validateDeviceId(deviceId)) {
                return res.status(400).json({ error: 'Valid deviceId required' });
            }

            // Load existing streams
            const allStreams = (await readJSONFile('serial-streams.json')) || {};

            // Initialize device streams if not exists
            if (!allStreams[deviceId]) {
                allStreams[deviceId] = {
                    isStreaming: false,
                    lastActivity: Date.now(),
                    chunks: []
                };
            }

            if (streamEvent) {
                // Handle stream control events
                if (streamEvent === 'started') {
                    allStreams[deviceId].isStreaming = true;
                    allStreams[deviceId].lastActivity = Date.now();
                    log.debug('Serial streaming started', { deviceId });
                } else if (streamEvent === 'stopped') {
                    allStreams[deviceId].isStreaming = false;
                    log.debug('Serial streaming stopped', { deviceId });
                }
            } else if (serialOutput) {
                // Handle actual serial output data
                const streamChunk = {
                    timestamp: Date.now(),
                    deviceTime: parseInt(timestamp) || Date.now(),
                    output: sanitizeInput(serialOutput),
                    bufferSize: parseInt(bufferSize) || 0,
                };

                allStreams[deviceId].chunks.push(streamChunk);
                allStreams[deviceId].lastActivity = Date.now();

                // Keep only last 100 chunks per device
                if (allStreams[deviceId].chunks.length > 100) {
                    allStreams[deviceId].chunks = allStreams[deviceId].chunks.slice(-100);
                }

                log.debug('Serial stream chunk received', { deviceId, length: serialOutput.length });
            }

            await writeJSONFile('serial-streams.json', allStreams);

            res.json({ success: true });
        } catch (error) {
            log.error('Error storing serial stream', { error: error.message });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Get logs for a device
     * GET /api/logs/:deviceId
     */
    router.get('/logs/:deviceId', async (req, res) => {
        try {
            const { deviceId } = req.params;
            const { limit = 100 } = req.query;

            const allLogs = (await readJSONFile('logs.json')) || {};
            const deviceLogsData = allLogs[deviceId] || [];

            // Return last N logs
            const logs = deviceLogsData.slice(-parseInt(limit));

            res.json({ deviceId, logs });
        } catch (error) {
            log.error('Error getting logs', { error: error.message });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Get all device logs from logs.json (historical)
     * GET /api/device-logs-history
     */
    router.get('/device-logs-history', async (_req, res) => {
        try {
            const allLogs = (await readJSONFile('logs.json')) || {};
            res.json(allLogs);
        } catch (error) {
            log.error('Error getting all logs', { error: error.message });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Get serial streams for a device
     * GET /api/serial-stream/:deviceId
     */
    router.get('/serial-stream/:deviceId', async (req, res) => {
        try {
            const { deviceId } = req.params;
            const { limit = 50 } = req.query;

            const allStreams = (await readJSONFile('serial-streams.json')) || {};
            const deviceStream = allStreams[deviceId] || {
                isStreaming: false,
                lastActivity: 0,
                chunks: []
            };

            // Return last N chunks
            const chunks = deviceStream.chunks.slice(-parseInt(limit));

            res.json({
                deviceId,
                isStreaming: deviceStream.isStreaming,
                lastActivity: deviceStream.lastActivity,
                chunks
            });
        } catch (error) {
            log.error('Error getting serial streams', { error: error.message });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Get all serial streams
     * GET /api/serial-streams
     */
    router.get('/serial-streams', async (_req, res) => {
        try {
            const allStreams = (await readJSONFile('serial-streams.json')) || {};
            res.json(allStreams);
        } catch (error) {
            log.error('Error getting all serial streams', { error: error.message });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Combined device logs (activity + detailed ESP32 logs)
     * GET /api/device-logs-combined
     */
    router.get('/device-logs-combined', async (req, res) => {
        try {
            const { limit = 100, level } = req.query;
            const deviceId = process.env.DEVICE_ID || 'esp32-001';

            // Get ESP32 detailed logs from logs.json
            const allLogs = (await readJSONFile('logs.json')) || {};
            const esp32Logs = allLogs[deviceId] || [];

            // Get high-level activity logs from memory
            const activityLogs = deviceLogs || [];

            // Combine and sort by timestamp
            const combined = [];

            // Add ESP32 logs with structured format
            esp32Logs.forEach(log => {
                combined.push({
                    timestamp: log.timestamp,
                    level: log.level || 'INFO',
                    message: log.message,
                    source: 'esp32',
                    deviceTime: log.deviceTime
                });
            });

            // Add activity logs (parse timestamp from message)
            activityLogs.forEach(logStr => {
                // Parse: [2025-01-05 12:34:56] message
                const match = logStr.match(/\[([^\]]+)\] (.+)/);
                if (match) {
                    const timeStr = match[1];
                    const message = match[2];
                    const timestamp = new Date(timeStr).getTime() || Date.now();
                    combined.push({
                        timestamp,
                        level: 'INFO',
                        message,
                        source: 'server'
                    });
                }
            });

            // Sort by timestamp (newest first)
            combined.sort((a, b) => b.timestamp - a.timestamp);

            // Filter by level if specified
            let filtered = combined;
            if (level) {
                filtered = combined.filter(log => log.level === level.toUpperCase());
            }

            // Limit results
            const limited = filtered.slice(0, parseInt(limit));

            res.json({
                deviceId,
                logs: limited,
                total: filtered.length
            });
        } catch (error) {
            log.error('Error getting combined logs', { error: error.message });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Wake cycle diagnostics
     * GET /api/wake-cycle-diagnostics
     */
    router.get('/wake-cycle-diagnostics', async (_req, res) => {
        try {
            const deviceId = process.env.DEVICE_ID || 'esp32-001';
            const allLogs = (await readJSONFile('logs.json')) || {};
            const esp32Logs = allLogs[deviceId] || [];

            // Get last 50 logs to analyze latest wake cycle
            const recentLogs = esp32Logs.slice(-50);

            // Find wake cycle boundaries
            const wakeCycles = [];
            let currentCycle = null;

            recentLogs.forEach(log => {
                const msg = log.message.toLowerCase();

                // Start of wake cycle
                if (msg.includes('awakened') || msg.includes('boot count')) {
                    if (currentCycle) {
                        wakeCycles.push(currentCycle);
                    }
                    currentCycle = {
                        startTime: log.timestamp,
                        events: [],
                        errors: []
                    };
                }

                if (currentCycle) {
                    currentCycle.events.push({
                        time: log.timestamp,
                        message: log.message,
                        level: log.level
                    });

                    if (log.level === 'ERROR' || msg.includes('error') || msg.includes('failed')) {
                        currentCycle.errors.push(log.message);
                    }

                    // Mark end of cycle
                    if (msg.includes('entering deep sleep') || msg.includes('sleeping')) {
                        currentCycle.endTime = log.timestamp;
                        currentCycle.duration = currentCycle.endTime - currentCycle.startTime;
                        wakeCycles.push(currentCycle);
                        currentCycle = null;
                    }
                }
            });

            // Add incomplete current cycle if exists
            if (currentCycle) {
                currentCycle.endTime = Date.now();
                currentCycle.duration = currentCycle.endTime - currentCycle.startTime;
                currentCycle.incomplete = true;
                wakeCycles.push(currentCycle);
            }

            // Get latest cycle
            const latestCycle = wakeCycles.length > 0 ? wakeCycles[wakeCycles.length - 1] : null;

            res.json({
                deviceId,
                latestCycle,
                recentCycles: wakeCycles.slice(-5),
                totalCycles: wakeCycles.length
            });
        } catch (error) {
            log.error('Error getting wake cycle diagnostics', { error: error.message });
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}

module.exports = createLogRoutes;
