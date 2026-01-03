/**
 * System API Routes
 * Health, settings, stats, build info, and system information
 */

const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;

const statistics = require('../services/statistics');
const { readJSONFile, writeJSONFile } = require('../utils/data-store');
const { getOsloTimestamp } = require('../utils/time');
const { getServerLogs, getDeviceLogs } = require('../utils/state');

/**
 * Create system routes
 * @param {Object} options - Configuration options
 * @param {string} options.imageVersion - Current image version
 * @param {string} options.buildDate - Build date string
 * @param {string} options.buildDateHuman - Human-readable build date
 * @returns {express.Router} Express router
 */
function createSystemRoutes({ imageVersion, buildDate, buildDateHuman }) {
    const router = express.Router();

    /**
     * Health check
     * GET /health
     */
    router.get('/health', (req, res) => {
        res.json({ status: "healthy", timestamp: Date.now() });
    });

    /**
     * Build info
     * GET /api/build-info
     */
    router.get('/build-info', (_req, res) => {
        res.json({
            version: imageVersion,
            buildDate: buildDate,
            buildDateHuman: buildDateHuman,
            timestamp: Date.now()
        });
    });

    /**
     * System information
     * GET /api/system-info
     */
    router.get('/system-info', (_req, res) => {
        res.json({
            version: process.env.DOCKER_IMAGE_VERSION || 'local',
            nodeVersion: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
        });
    });

    /**
     * Get statistics
     * GET /api/stats?range=all
     */
    router.get('/stats', (req, res) => {
        try {
            const timeRange = req.query.range || 'all';
            const stats = statistics.getStats(timeRange);
            res.json(stats);
        } catch (error) {
            console.error("Error retrieving stats:", error);
            res.status(500).json({ error: "Failed to retrieve statistics" });
        }
    });

    /**
     * Reset statistics
     * POST /api/stats/reset
     */
    router.post('/stats/reset', async (req, res) => {
        try {
            await statistics.resetStats();
            res.json({ success: true, message: "Statistics reset successfully" });
        } catch (error) {
            console.error("Error resetting stats:", error);
            res.status(500).json({ error: "Failed to reset statistics" });
        }
    });

    /**
     * Get server logs
     * GET /api/logs
     */
    router.get('/logs', (_req, res) => {
        res.json({ logs: getServerLogs() });
    });

    /**
     * Get device activity logs
     * GET /api/device-logs
     */
    router.get('/device-logs', (_req, res) => {
        res.json({ logs: getDeviceLogs() });
    });

    /**
     * Get current time (for ESP32 clock alignment)
     * GET /api/time
     */
    router.get('/time', (_req, res) => {
        const now = new Date();
        res.json({
            epoch: now.getTime(),
            iso: now.toISOString(),
            oslo: getOsloTimestamp()
        });
    });

    /**
     * Get client IP (for admin panel)
     * GET /api/client-ip
     */
    router.get('/client-ip', (req, res) => {
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                         req.headers['x-real-ip'] ||
                         req.socket.remoteAddress ||
                         req.ip;

        let cleanIp = clientIp;
        if (cleanIp === '::1' || cleanIp === '::ffff:127.0.0.1') {
            cleanIp = '127.0.0.1';
        } else if (cleanIp?.startsWith('::ffff:')) {
            cleanIp = cleanIp.substring(7);
        }

        if (cleanIp === '127.0.0.1' || cleanIp === '::1') {
            const networkInterfaces = os.networkInterfaces();

            for (const interfaceName of Object.keys(networkInterfaces)) {
                const interfaces = networkInterfaces[interfaceName];
                for (const iface of interfaces) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        cleanIp = iface.address;
                        break;
                    }
                }
                if (cleanIp !== '127.0.0.1') break;
            }
        }

        res.json({ ip: cleanIp });
    });

    /**
     * Get settings
     * GET /api/settings
     */
    router.get('/settings', async (_req, res) => {
        try {
            const settings = (await readJSONFile("settings.json")) || {
                defaultSleepDuration: 3600000000,
                devMode: true,
                devServerHost: "host.local:3000",
                defaultOrientation: "portrait",
                nightSleepEnabled: false,
                nightSleepStartHour: 23,
                nightSleepEndHour: 5
            };
            res.json(settings);
        } catch (error) {
            console.error("Error reading settings:", error);
            res.status(500).json({ error: "Failed to read settings" });
        }
    });

    /**
     * Update settings
     * PUT /api/settings
     */
    router.put('/settings', async (req, res) => {
        try {
            const { defaultSleepDuration, devMode, devServerHost, defaultOrientation, nightSleepEnabled, nightSleepStartHour, nightSleepEndHour } = req.body;

            const existingSettings = (await readJSONFile("settings.json")) || {};

            if (defaultSleepDuration !== undefined) {
                const MIN_SLEEP = 5 * 60 * 1000000;
                const MAX_SLEEP = 24 * 60 * 60 * 1000000;

                if (defaultSleepDuration < MIN_SLEEP || defaultSleepDuration > MAX_SLEEP) {
                    return res.status(400).json({
                        error: "Sleep duration must be between 5 minutes and 24 hours (in microseconds)"
                    });
                }
                existingSettings.defaultSleepDuration = parseInt(defaultSleepDuration);
            }

            if (devMode !== undefined) {
                existingSettings.devMode = Boolean(devMode);
            }

            if (devServerHost !== undefined) {
                existingSettings.devServerHost = String(devServerHost);
            }

            if (defaultOrientation !== undefined) {
                if (defaultOrientation !== "portrait" && defaultOrientation !== "landscape") {
                    return res.status(400).json({
                        error: "Default orientation must be 'portrait' or 'landscape'"
                    });
                }
                existingSettings.defaultOrientation = defaultOrientation;
            }

            if (nightSleepEnabled !== undefined) {
                existingSettings.nightSleepEnabled = Boolean(nightSleepEnabled);
            }

            if (nightSleepStartHour !== undefined) {
                const startHour = parseInt(nightSleepStartHour);
                if (startHour < 0 || startHour > 23) {
                    return res.status(400).json({
                        error: "Night sleep start hour must be between 0 and 23"
                    });
                }
                existingSettings.nightSleepStartHour = startHour;
            }

            if (nightSleepEndHour !== undefined) {
                const endHour = parseInt(nightSleepEndHour);
                if (endHour < 0 || endHour > 23) {
                    return res.status(400).json({
                        error: "Night sleep end hour must be between 0 and 23"
                    });
                }
                existingSettings.nightSleepEndHour = endHour;
            }

            await writeJSONFile("settings.json", existingSettings);

            if (defaultSleepDuration !== undefined) {
                const current = (await readJSONFile("current.json")) || {};
                current.sleepDuration = existingSettings.defaultSleepDuration;
                await writeJSONFile("current.json", current);
            }

            if (devMode !== undefined) {
                const current = (await readJSONFile("current.json")) || {};
                current.devMode = existingSettings.devMode;
                current.devServerHost = existingSettings.devServerHost;
                await writeJSONFile("current.json", current);
            }

            const nightSleepLog = existingSettings.nightSleepEnabled ? `, nightSleep=${existingSettings.nightSleepStartHour}:00-${existingSettings.nightSleepEndHour}:00` : '';
            console.log(`Settings updated: sleep=${existingSettings.defaultSleepDuration}µs, devMode=${existingSettings.devMode}, orientation=${existingSettings.defaultOrientation}${nightSleepLog}`);
            res.json({ success: true, settings: existingSettings });
        } catch (error) {
            console.error("Error updating settings:", error);
            res.status(500).json({ error: "Failed to update settings" });
        }
    });

    return router;
}

module.exports = createSystemRoutes;
