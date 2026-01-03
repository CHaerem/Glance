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
            console.error("Error getting history:", error);
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
            console.error("Error getting image:", error);
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

                console.log(`Regenerating processed image for ${imageId} with rotation ${rotationDegrees}°, crop (${cropXVal}%, ${cropYVal}%), zoom ${zoomVal}x...`);

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
            console.log(`Loaded image ${imageId} from history: ${imageData.title} (rotation: ${rotationDegrees}°)`);
            addDeviceLog(`Applied image from history: "${imageData.title || imageId}" (rotation: ${rotationDegrees}°)`);

            res.json({ success: true, current: currentData });
        } catch (error) {
            console.error("Error loading from history:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Delete image from history
     * DELETE /api/history/:imageId
     */
    router.delete('/history/:imageId', async (req, res) => {
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

            console.log(`Deleted image ${imageId} from history and archive`);

            res.json({ success: true, message: "Image deleted from history" });
        } catch (error) {
            console.error("Error deleting from history:", error);
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
            console.error("Error getting my collection:", error);
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

            console.log(`Added "${title}" by ${artist} to collection`);

            res.json({
                success: true,
                message: "Added to collection",
                item: collectionItem
            });
        } catch (error) {
            console.error("Error adding to collection:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * Remove artwork from my collection
     * DELETE /api/my-collection/:id
     */
    router.delete('/my-collection/:id', async (req, res) => {
        try {
            const { id } = req.params;
            let collection = (await readJSONFile("my-collection.json")) || [];

            const originalLength = collection.length;
            collection = collection.filter(item => item.id !== id);

            if (collection.length === originalLength) {
                return res.status(404).json({ error: "Item not found in collection" });
            }

            await writeJSONFile("my-collection.json", collection);
            console.log(`Removed item ${id} from collection`);

            res.json({ success: true, message: "Removed from collection" });
        } catch (error) {
            console.error("Error removing from collection:", error);
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

            const playlistConfig = {
                images: validImages,
                mode,
                interval,
                currentIndex: 0,
                active: true,
                createdAt: Date.now(),
                lastUpdate: Date.now()
            };

            await writeJSONFile("playlist.json", playlistConfig);

            const firstImageId = mode === "random"
                ? validImages[Math.floor(Math.random() * validImages.length)]
                : validImages[0];

            const imagesArchive = (await readJSONFile("images.json")) || {};
            const imageData = imagesArchive[firstImageId];

            if (imageData) {
                const currentData = {
                    ...imageData,
                    sleepDuration: interval,
                    timestamp: Date.now()
                };

                await writeJSONFile("current.json", currentData);
                console.log(`Started playlist with ${validImages.length} images, first image: ${firstImageId}`);
            }

            res.json({
                success: true,
                message: `Playlist started with ${validImages.length} images`,
                config: playlistConfig
            });
        } catch (error) {
            console.error("Error creating playlist:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    return router;
}

module.exports = createHistoryRoutes;
