/**
 * Image Routes
 * Current image, binary stream, preview endpoints
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const { getOsloTimestamp, isInNightSleep, calculateNightSleepDuration } = require('../utils/time');
const { validateImageData, sanitizeInput } = require('../utils/validation');
const { readJSONFile, writeJSONFile, ensureDir } = require('../utils/data-store');
const { addDeviceLog } = require('../utils/state');
const imageProcessing = require('../services/image-processing');

// Spectra 6 palette for preview info
const SPECTRA_6_PALETTE = [
    { name: 'Black', rgb: [0, 0, 0] },
    { name: 'White', rgb: [255, 255, 255] },
    { name: 'Red', rgb: [255, 0, 0] },
    { name: 'Yellow', rgb: [255, 255, 0] },
    { name: 'Blue', rgb: [0, 0, 255] },
    { name: 'Green', rgb: [0, 255, 0] }
];

/**
 * Create image routes
 * @param {Object} options - Configuration options
 * @param {Object} options.upload - Multer upload middleware
 * @param {string} options.uploadDir - Upload directory path
 * @returns {express.Router} Express router
 */
function createImageRoutes({ upload, uploadDir }) {
    const router = express.Router();

    /**
     * Get current image metadata for ESP32 (without image data)
     * GET /api/current.json
     */
    router.get('/current.json', async (req, res) => {
        try {
            // Check if playlist is active and advance if needed
            const playlist = await readJSONFile('playlist.json');
            if (playlist && playlist.active && playlist.images && playlist.images.length > 0) {
                const now = Date.now();
                const timeSinceLastUpdate = now - (playlist.lastUpdate || 0);
                const intervalMs = playlist.interval / 1000; // Convert microseconds to milliseconds

                // If enough time has passed, advance to next image
                if (timeSinceLastUpdate >= intervalMs) {
                    let nextImageId;

                    if (playlist.mode === 'random') {
                        nextImageId = playlist.images[Math.floor(Math.random() * playlist.images.length)];
                    } else {
                        // Sequential mode
                        playlist.currentIndex = ((playlist.currentIndex || 0) + 1) % playlist.images.length;
                        nextImageId = playlist.images[playlist.currentIndex];
                    }

                    // Load the next image from archive
                    const imagesArchive = (await readJSONFile('images.json')) || {};
                    const imageData = imagesArchive[nextImageId];

                    if (imageData) {
                        // Update current.json with next playlist image
                        const currentData = {
                            ...imageData,
                            sleepDuration: playlist.interval,
                            timestamp: now
                        };
                        await writeJSONFile('current.json', currentData);

                        // Update playlist with new timestamp
                        playlist.lastUpdate = now;
                        await writeJSONFile('playlist.json', playlist);

                        console.log(`Playlist advanced to image ${nextImageId} (${playlist.mode} mode)`);
                    }
                }
            }

            const current = (await readJSONFile('current.json')) || {
                title: 'Glance Display',
                imageId: '',
                timestamp: Date.now(),
                sleepDuration: 3600000000, // 1 hour in microseconds
            };

            // Get dev mode settings
            const settings = (await readJSONFile('settings.json')) || {};
            const devServerHost = (settings.devMode && settings.devServerHost) ? settings.devServerHost : null;

            // Determine sleep duration based on night sleep mode
            let sleepDuration = current.sleepDuration || 3600000000;
            let nightSleepActive = false;

            if (isInNightSleep(settings)) {
                sleepDuration = calculateNightSleepDuration(settings);
                nightSleepActive = true;
            }

            // Send metadata only (no image data)
            const metadata = {
                hasImage: !!(current.image || current.imageId),
                title: current.title || 'Glance Display',
                imageId: current.imageId || 'default',
                timestamp: current.timestamp || Date.now(),
                sleepDuration: sleepDuration,
                rotation: current.rotation || 0,
                devServerHost: devServerHost // ESP32 will try this server first if present
            };

            const nightSleepLog = nightSleepActive ? ' [night sleep]' : '';
            console.log(`Serving metadata: hasImage=${metadata.hasImage}, imageId=${metadata.imageId}, sleep=${metadata.sleepDuration}us, devServer=${devServerHost || 'none'}${nightSleepLog}`);
            addDeviceLog(`Device fetched image metadata: ${metadata.imageId} (sleep: ${Math.round(metadata.sleepDuration/60000000)}min)${devServerHost ? ' [dev mode]' : ''}${nightSleepLog}`);
            res.json(metadata);
        } catch (error) {
            console.error('Error getting current:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Get current image with full data for web UI (with caching)
     * GET /api/current-full.json
     */
    router.get('/current-full.json', async (req, res) => {
        try {
            const current = (await readJSONFile('current.json')) || {
                title: 'Glance Display',
                imageId: '',
                timestamp: Date.now(),
                sleepDuration: 3600000000,
            };

            // Add caching headers to reduce requests from web UI
            res.set({
                'Cache-Control': 'public, max-age=5', // Cache for 5 seconds
                'ETag': `"${current.imageId}-${current.timestamp}"` // Cache based on imageId and timestamp
            });

            // Return full data including image for web UI
            console.log(`Serving full current data for web UI: imageId=${current.imageId}`);
            res.json(current);
        } catch (error) {
            console.error('Error getting current full:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Serve raw binary image data for PSRAM streaming
     * GET /api/image.bin
     */
    router.get('/image.bin', async (req, res) => {
        try {
            const current = (await readJSONFile('current.json')) || {};

            if (!current || !current.image) {
                return res.status(404).send('No image available');
            }

            console.log('Serving raw binary image data for PSRAM streaming');

            // Convert base64 to binary buffer
            const binaryData = Buffer.from(current.image, 'base64');

            // Set headers for binary data
            res.set({
                'Content-Type': 'application/octet-stream',
                'Content-Length': binaryData.length,
                'Cache-Control': 'no-cache'
            });

            console.log(`Sending ${binaryData.length} bytes of raw image data`);
            addDeviceLog(`Device downloaded image data: ${(binaryData.length / 1024 / 1024).toFixed(2)}MB`);
            res.send(binaryData);

        } catch (error) {
            console.error('Error serving binary image:', error);
            res.status(500).send('Error serving binary image');
        }
    });

    /**
     * Update current image (for web interface or manual updates)
     * POST /api/current
     */
    router.post('/current', async (req, res) => {
        try {
            const { title, image, sleepDuration, isText } = req.body;

            // Input validation - use settings default if not provided
            const settings = (await readJSONFile('settings.json')) || { defaultSleepDuration: 3600000000 };
            const sanitizedTitle = sanitizeInput(title);
            const sleepMs = parseInt(sleepDuration) || settings.defaultSleepDuration;

            if (image && !validateImageData(image)) {
                return res.status(400).json({ error: 'Invalid image data' });
            }

            let imageData = '';

            if (image) {
                if (isText) {
                    // Convert text to e-ink image
                    const sanitizedText = sanitizeInput(image);
                    const textImageBuffer = await imageProcessing.createTextImage(sanitizedText);
                    imageData = textImageBuffer.toString('base64');
                } else if (image.startsWith('data:image/')) {
                    // Handle base64 image upload from web interface
                    const base64Data = image.split(',')[1];
                    const imageBuffer = Buffer.from(base64Data, 'base64');

                    // Save temporary file
                    const tempPath = path.join(uploadDir, 'temp-' + Date.now() + '.png');
                    await ensureDir(uploadDir);
                    await fs.writeFile(tempPath, imageBuffer);

                    // Convert to RGB format for ESP32 processing
                    const rgbBuffer = await imageProcessing.convertImageToRGB(tempPath, 0, 1200, 1600);
                    console.log(`RGB buffer size: ${rgbBuffer.length} bytes`);
                    imageData = rgbBuffer.toString('base64');

                    // Clean up temp file
                    await fs.unlink(tempPath);
                } else {
                    // Assume it's already processed base64 data
                    imageData = image;
                }
            }

            const current = {
                title: sanitizedTitle || 'Glance Display',
                image: imageData,
                imageId: imageData ? uuidv4() : '',
                timestamp: Date.now(),
                sleepDuration: sleepMs,
            };

            await writeJSONFile('current.json', current);

            // Log the update
            console.log(`Image updated: ${sanitizedTitle} (${current.imageId})`);

            res.json({ success: true, current });
        } catch (error) {
            console.error('Error updating current:', error);
            res.status(500).json({ error: 'Internal server error: ' + error.message });
        }
    });

    /**
     * Art gallery preview endpoint - shows exact e-ink display output
     * POST /api/preview
     */
    router.post('/preview', upload.single('image'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            console.log(`Generating art gallery preview for: ${req.file.originalname}`);

            // Get dithering options from request
            const ditherAlgorithm = req.body.ditherAlgorithm || 'floyd-steinberg';
            const enhanceContrast = req.body.enhanceContrast !== 'false';
            const sharpen = req.body.sharpen === 'true';

            // Process image exactly as it will be sent to ESP32
            const ditheredRgbBuffer = await imageProcessing.convertImageToRGB(req.file.path, 0, 1200, 1600, {
                ditherAlgorithm,
                enhanceContrast,
                sharpen
            });

            // Create preview PNG from the dithered RGB data (half size for web)
            const previewBuffer = await sharp(ditheredRgbBuffer, {
                raw: {
                    width: 1200,
                    height: 1600,
                    channels: 3
                }
            })
            .resize(600, 800, { fit: 'fill' })
            .png()
            .toBuffer();

            // Clean up uploaded file
            await fs.unlink(req.file.path);

            res.json({
                success: true,
                preview: `data:image/png;base64,${previewBuffer.toString('base64')}`,
                rgbSize: Math.round(ditheredRgbBuffer.length / 1024), // Size in KB
                originalName: req.file.originalname,
                processingInfo: {
                    algorithm: ditherAlgorithm,
                    enhanceContrast,
                    sharpen,
                    paletteColors: SPECTRA_6_PALETTE.length
                }
            });
        } catch (error) {
            console.error('Error generating art gallery preview:', error);
            if (req.file?.path) {
                try {
                    await fs.unlink(req.file.path);
                } catch {}
            }
            res.status(500).json({ error: 'Error generating art preview: ' + error.message });
        }
    });

    /**
     * Bhutan flag endpoint for ESP32 fallback display
     * GET /api/bhutan.bin
     */
    router.get('/bhutan.bin', async (req, res) => {
        try {
            const svgPath = path.join(__dirname, '..', 'bhutan.svg');

            // Check if bhutan.svg exists
            if (!await fs.access(svgPath).then(() => true).catch(() => false)) {
                return res.status(404).json({ error: 'Bhutan SVG not found' });
            }

            // Read SVG file
            const svgBuffer = await fs.readFile(svgPath);

            // Convert SVG to PNG using sharp
            const pngBuffer = await sharp(svgBuffer)
                .resize(1200, 1600, {
                    fit: 'fill',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .png()
                .toBuffer();

            // Convert PNG to RGB buffer (1200x1600x3 = 5,760,000 bytes)
            const { data: rgbData, info } = await sharp(pngBuffer)
                .toColourspace('srgb')
                .raw()
                .toBuffer({ resolveWithObject: true });

            if (info.channels !== 3) {
                throw new Error(`Bhutan PNG conversion produced ${info.channels} channels, expected 3`);
            }

            res.set({
                'Content-Type': 'application/octet-stream',
                'Content-Length': rgbData.length,
                'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            });

            res.send(rgbData);
            console.log(`Served Bhutan flag RGB data: ${rgbData.length} bytes`);

        } catch (error) {
            console.error('Error serving Bhutan flag:', error);
            res.status(500).json({ error: 'Failed to process Bhutan flag' });
        }
    });

    return router;
}

module.exports = createImageRoutes;
