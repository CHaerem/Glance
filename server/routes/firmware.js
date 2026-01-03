/**
 * Firmware OTA Routes
 * Provides firmware version info and binary download for ESP32 OTA updates
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createFirmwareRoutes({ dataDir, firmwareVersion, buildDate }) {
    const router = express.Router();

    const firmwarePath = path.join(dataDir, 'firmware.bin');
    const firmwareInfoPath = path.join(dataDir, 'firmware-info.json');

    /**
     * Get firmware version info
     * GET /firmware/version
     *
     * Response: {
     *   version: string,      // Firmware version (semver or git SHA)
     *   buildDate: number,    // Unix timestamp
     *   size: number,         // File size in bytes
     *   sha256: string,       // SHA256 hash of firmware
     *   minBattery: number    // Minimum battery voltage for OTA (default 3.6V)
     * }
     */
    router.get('/version', async (req, res) => {
        try {
            // Check if firmware exists
            if (!fs.existsSync(firmwarePath)) {
                return res.status(404).json({
                    error: 'No firmware available',
                    message: 'Upload firmware.bin to the data directory'
                });
            }

            // Try to read cached firmware info
            let firmwareInfo;
            if (fs.existsSync(firmwareInfoPath)) {
                try {
                    firmwareInfo = JSON.parse(fs.readFileSync(firmwareInfoPath, 'utf8'));
                } catch (e) {
                    console.warn('Failed to parse firmware-info.json, regenerating...');
                }
            }

            // Get current file stats
            const stats = fs.statSync(firmwarePath);
            const currentMtime = stats.mtime.getTime();

            // Regenerate info if missing or file has changed
            if (!firmwareInfo || firmwareInfo.mtime !== currentMtime) {
                console.log('Generating firmware info...');

                // Calculate SHA256
                const fileBuffer = fs.readFileSync(firmwarePath);
                const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

                firmwareInfo = {
                    version: firmwareVersion || 'unknown',
                    buildDate: buildDate ? new Date(buildDate).getTime() : Date.now(),
                    size: stats.size,
                    sha256: sha256,
                    minBattery: 3.6,
                    mtime: currentMtime
                };

                // Cache the info
                fs.writeFileSync(firmwareInfoPath, JSON.stringify(firmwareInfo, null, 2));
                console.log(`Firmware info cached: v${firmwareInfo.version}, ${firmwareInfo.size} bytes`);
            }

            // Return info (without internal mtime field)
            res.json({
                version: firmwareInfo.version,
                buildDate: firmwareInfo.buildDate,
                size: firmwareInfo.size,
                sha256: firmwareInfo.sha256,
                minBattery: firmwareInfo.minBattery
            });

        } catch (error) {
            console.error('Error getting firmware info:', error);
            res.status(500).json({ error: 'Failed to get firmware info' });
        }
    });

    /**
     * Download firmware binary
     * GET /firmware/download
     *
     * Response: Binary firmware data with appropriate headers
     */
    router.get('/download', async (req, res) => {
        try {
            if (!fs.existsSync(firmwarePath)) {
                return res.status(404).json({ error: 'Firmware not found' });
            }

            const stats = fs.statSync(firmwarePath);
            const deviceId = req.query.deviceId || 'unknown';

            console.log(`Firmware download requested by device: ${deviceId}`);

            res.set({
                'Content-Type': 'application/octet-stream',
                'Content-Length': stats.size,
                'Content-Disposition': 'attachment; filename="firmware.bin"',
                'Cache-Control': 'no-cache'
            });

            const stream = fs.createReadStream(firmwarePath);
            stream.pipe(res);

            stream.on('end', () => {
                console.log(`Firmware download complete for device: ${deviceId} (${stats.size} bytes)`);
            });

            stream.on('error', (err) => {
                console.error('Error streaming firmware:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error streaming firmware' });
                }
            });

        } catch (error) {
            console.error('Error serving firmware:', error);
            res.status(500).json({ error: 'Failed to serve firmware' });
        }
    });

    /**
     * Get firmware status
     * GET /firmware/status
     *
     * Response: { available: boolean, version?: string, size?: number }
     */
    router.get('/status', (req, res) => {
        const available = fs.existsSync(firmwarePath);

        if (available) {
            const stats = fs.statSync(firmwarePath);
            res.json({
                available: true,
                version: firmwareVersion || 'unknown',
                size: stats.size,
                path: firmwarePath
            });
        } else {
            res.json({
                available: false,
                message: 'No firmware.bin in data directory'
            });
        }
    });

    return router;
}

module.exports = createFirmwareRoutes;
