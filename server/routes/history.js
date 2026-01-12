/**
 * History API Routes
 * Image history, my collection, and playlist management
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const imageProcessing = require('../services/image-processing');
const { readJSONFile, writeJSONFile, ensureDir } = require('../utils/data-store');
const { addDeviceLog } = require('../utils/state');
const { loggers } = require('../services/logger');
const { apiKeyAuth } = require('../middleware/auth');
const log = loggers.api;

/**
 * Create history routes
 * @param {Object} options - Configuration options
 * @param {string} options.uploadDir - Upload directory path
 * @returns {express.Router} Express router
 */
function createHistoryRoutes({ uploadDir }) {
    const router = express.Router();

    /**
     * Get image history
     * GET /api/history
     */
    router.get('/history', async (_req, res) => {
        try {
            const history = (await readJSONFile("history.json")) || [];
            res.json(history);
        } catch (error) {
            log.error('Error getting history', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Get full image data by ID
     * GET /api/images/:imageId
     */
    router.get('/images/:imageId', async (req, res) => {
        try {
            const { imageId } = req.params;
            const imagesArchive = (await readJSONFile("images.json")) || {};

            if (!imagesArchive[imageId]) {
                return res.status(404).json({ error: "Image not found" });
            }

            res.json(imagesArchive[imageId]);
        } catch (error) {
            log.error('Error getting image', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Load image from history by ID
     * POST /api/history/:imageId/load
     */
    router.post('/history/:imageId/load', async (req, res) => {
        try {
            const { imageId } = req.params;
            const { rotation, cropX, cropY, zoomLevel } = req.body;

            const imagesArchive = (await readJSONFile("images.json")) || {};
            let imageData = imagesArchive[imageId];

            if (!imageData) {
                return res.status(404).json({ error: "Image not found in archive" });
            }

            const rotationDegrees = rotation !== undefined ? parseInt(rotation) : (imageData.rotation || 0);
            const cropXVal = cropX !== undefined ? parseFloat(cropX) : 50;
            const cropYVal = cropY !== undefined ? parseFloat(cropY) : 50;
            const zoomVal = zoomLevel !== undefined ? parseFloat(zoomLevel) : 1.0;

            const needsRegenerate = !imageData.image ||
                rotationDegrees !== (imageData.rotation || 0) ||
                cropXVal !== 50 || cropYVal !== 50 || zoomVal !== 1.0;

            if (needsRegenerate) {
                if (!imageData.originalImage) {
                    return res.status(400).json({ error: "Cannot reprocess image: original not available" });
                }

                log.debug('Regenerating processed image', { imageId, rotation: rotationDegrees, cropX: cropXVal, cropY: cropYVal, zoom: zoomVal });

                const originalBuffer = Buffer.from(imageData.originalImage, 'base64');
                const tempPath = path.join(uploadDir, `reload-${Date.now()}.png`);
                await ensureDir(uploadDir);
                await fs.writeFile(tempPath, originalBuffer);

                const targetWidth = (rotationDegrees === 90 || rotationDegrees === 270) ? 1600 : 1200;
                const targetHeight = (rotationDegrees === 90 || rotationDegrees === 270) ? 1200 : 1600;

                const rgbBuffer = await imageProcessing.convertImageToRGB(
                    tempPath,
                    rotationDegrees,
                    targetWidth,
                    targetHeight,
                    {
                        ditherAlgorithm: 'floyd-steinberg',
                        enhanceContrast: true,
                        sharpen: false,
                        cropX: cropXVal,
                        cropY: cropYVal,
                        zoomLevel: zoomVal
                    }
                );

                imageData = {
                    ...imageData,
                    image: rgbBuffer.toString("base64"),
                    rotation: rotationDegrees
                };

                await fs.unlink(tempPath);
            }

            const settings = (await readJSONFile("settings.json")) || { defaultSleepDuration: 3600000000 };

            const currentData = {
                ...imageData,
                sleepDuration: settings.defaultSleepDuration,
                timestamp: Date.now()
            };

            await writeJSONFile("current.json", currentData);
            log.info('Loaded image from history', { imageId, title: imageData.title, rotation: rotationDegrees });
            addDeviceLog(`Applied image from history: "${imageData.title || imageId}" (rotation: ${rotationDegrees}°)`);

            res.json({ success: true, current: currentData });
        } catch (error) {
            log.error('Error loading from history', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Delete image from history
     * DELETE /api/history/:imageId
     * Protected: Requires API key when accessed externally via Funnel
     */
    router.delete('/history/:imageId', apiKeyAuth, async (req, res) => {
        try {
            const { imageId } = req.params;
            let history = (await readJSONFile("history.json")) || [];

            const originalLength = history.length;
            history = history.filter(item => item.imageId !== imageId);

            if (history.length === originalLength) {
                return res.status(404).json({ error: "Image not found in history" });
            }

            await writeJSONFile("history.json", history);

            const imagesArchive = (await readJSONFile("images.json")) || {};
            delete imagesArchive[imageId];
            await writeJSONFile("images.json", imagesArchive);

            log.info('Deleted image from history', { imageId });

            res.json({ success: true, message: "Image deleted from history" });
        } catch (error) {
            log.error('Error deleting from history', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Get my collection (all user's art)
     * GET /api/my-collection
     */
    router.get('/my-collection', async (req, res) => {
        try {
            const history = (await readJSONFile("history.json")) || [];
            const collection = (await readJSONFile("my-collection.json")) || [];

            const myCollection = [
                ...history.map(item => ({
                    ...item,
                    collectionType: item.source || 'generated',
                    addedToCollection: Date.now()
                })),
                ...collection.map(item => ({
                    ...item,
                    collectionType: 'added'
                }))
            ];

            myCollection.sort((a, b) => (b.addedToCollection || 0) - (a.addedToCollection || 0));

            res.json(myCollection);
        } catch (error) {
            log.error('Error getting my collection', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Add artwork to my collection
     * POST /api/my-collection
     */
    router.post('/my-collection', async (req, res) => {
        try {
            const { imageUrl, title, artist, year, thumbnail, collectionId, wikimedia } = req.body;

            if (!imageUrl || !title) {
                return res.status(400).json({ error: "imageUrl and title are required" });
            }

            const collection = (await readJSONFile("my-collection.json")) || [];

            const exists = collection.some(item => item.imageUrl === imageUrl);
            if (exists) {
                return res.status(400).json({ error: "Artwork already in collection" });
            }

            const collectionItem = {
                id: uuidv4(),
                imageUrl,
                title,
                artist: artist || 'Unknown',
                year,
                thumbnail: thumbnail || imageUrl,
                collectionId,
                wikimedia,
                addedToCollection: Date.now()
            };

            collection.unshift(collectionItem);
            await writeJSONFile("my-collection.json", collection);

            log.info('Added to collection', { title, artist });

            res.json({
                success: true,
                message: "Added to collection",
                item: collectionItem
            });
        } catch (error) {
            log.error('Error adding to collection', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Remove artwork from my collection
     * DELETE /api/my-collection/:id
     * Protected: Requires API key when accessed externally via Funnel
     */
    router.delete('/my-collection/:id', apiKeyAuth, async (req, res) => {
        try {
            const { id } = req.params;
            let collection = (await readJSONFile("my-collection.json")) || [];

            const originalLength = collection.length;
            collection = collection.filter(item => item.id !== id);

            if (collection.length === originalLength) {
                return res.status(404).json({ error: "Item not found in collection" });
            }

            await writeJSONFile("my-collection.json", collection);
            log.info('Removed from collection', { id });

            res.json({ success: true, message: "Removed from collection" });
        } catch (error) {
            log.error('Error removing from collection', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Create/update playlist
     * POST /api/playlist
     */
    router.post('/playlist', async (req, res) => {
        try {
            const { images, mode, interval } = req.body;

            if (!images || !Array.isArray(images) || images.length === 0) {
                return res.status(400).json({ error: "Please provide an array of image IDs" });
            }

            if (!mode || !["sequential", "random"].includes(mode)) {
                return res.status(400).json({ error: "Mode must be 'sequential' or 'random'" });
            }

            if (!interval || interval < 300000000) {
                return res.status(400).json({ error: "Interval must be at least 5 minutes (300000000 microseconds)" });
            }

            const history = (await readJSONFile("history.json")) || [];
            const validImages = images.filter(imageId =>
                history.some(item => item.imageId === imageId)
            );

            if (validImages.length === 0) {
                return res.status(400).json({ error: "No valid images found in history" });
            }

            // Deduplicate images by source URL or title+artist to prevent same artwork appearing multiple times
            const imagesArchive = (await readJSONFile("images.json")) || {};
            const seenImages = new Map();
            const dedupedImages = [];

            for (const imageId of validImages) {
                const imageData = imagesArchive[imageId];
                if (!imageData) continue;

                // Create unique key based on source URL or title+artist combo
                const key = imageData.sourceUrl || imageData.originalUrl ||
                    `${imageData.title || 'untitled'}|${imageData.artist || 'unknown'}`;

                if (!seenImages.has(key)) {
                    seenImages.set(key, imageId);
                    dedupedImages.push(imageId);
                }
            }

            if (dedupedImages.length === 0) {
                return res.status(400).json({ error: "No valid unique images found" });
            }

            const duplicatesRemoved = validImages.length - dedupedImages.length;
            if (duplicatesRemoved > 0) {
                log.debug('Playlist: removed duplicate images', { duplicatesRemoved });
            }

            const playlistConfig = {
                images: dedupedImages,
                mode,
                interval,
                currentIndex: 0,
                active: true,
                createdAt: Date.now(),
                lastUpdate: Date.now()
            };

            await writeJSONFile("playlist.json", playlistConfig);

            const firstImageId = mode === "random"
                ? dedupedImages[Math.floor(Math.random() * dedupedImages.length)]
                : dedupedImages[0];

            // imagesArchive already loaded above for deduplication
            const imageData = imagesArchive[firstImageId];

            if (imageData) {
                const currentData = {
                    ...imageData,
                    sleepDuration: interval,
                    timestamp: Date.now()
                };

                await writeJSONFile("current.json", currentData);
                log.info('Started playlist', { imageCount: dedupedImages.length, firstImageId });
            }

            res.json({
                success: true,
                message: `Playlist created with ${dedupedImages.length} images${duplicatesRemoved > 0 ? ` (${duplicatesRemoved} duplicate(s) removed)` : ''}`,
                config: playlistConfig
            });
        } catch (error) {
            log.error('Error creating playlist', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Get current playlist configuration
     * GET /api/playlist
     */
    router.get('/playlist', async (_req, res) => {
        try {
            const playlist = await readJSONFile("playlist.json");
            res.json(playlist || { active: false, images: [], mode: 'sequential', interval: 3600000000 });
        } catch (error) {
            log.error('Error getting playlist', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Update playlist settings (toggle active, change mode/interval)
     * PATCH /api/playlist
     */
    router.patch('/playlist', async (req, res) => {
        try {
            let playlist = await readJSONFile("playlist.json");

            if (!playlist) {
                return res.status(404).json({ error: "No playlist exists" });
            }

            // Update only provided fields
            if (req.body.active !== undefined) {
                playlist.active = req.body.active;
            }
            if (req.body.mode && ['sequential', 'random'].includes(req.body.mode)) {
                playlist.mode = req.body.mode;
            }
            if (req.body.interval && req.body.interval >= 300000000) {
                playlist.interval = req.body.interval;
            }

            await writeJSONFile("playlist.json", playlist);
            log.info('Playlist updated', { active: playlist.active, mode: playlist.mode });

            res.json(playlist);
        } catch (error) {
            log.error('Error updating playlist', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Delete/clear playlist
     * DELETE /api/playlist
     * Protected: Requires API key when accessed externally via Funnel
     */
    router.delete('/playlist', apiKeyAuth, async (_req, res) => {
        try {
            await writeJSONFile("playlist.json", { active: false, images: [], mode: 'sequential', interval: 3600000000 });
            log.info('Playlist cleared');
            res.json({ success: true, message: "Playlist cleared" });
        } catch (error) {
            log.error('Error deleting playlist', { error: error.message });
            res.status(500).json({ error: "Internal server error" });
        }
    });

    return router;
}

module.exports = createHistoryRoutes;
