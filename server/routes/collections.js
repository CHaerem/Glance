/**
 * Collections API Routes
 * Curated art collection endpoints
 */

const express = require('express');
const router = express.Router();
const { CURATED_COLLECTIONS } = require('../services/museum-api');
const { loggers } = require('../services/logger');
const log = loggers.api;

/**
 * Get curated collections list
 * GET /api/collections
 */
router.get('/', (req, res) => {
    try {
        const collections = Object.entries(CURATED_COLLECTIONS).map(([id, collection]) => ({
            id,
            name: collection.name,
            description: collection.description,
            count: collection.artworks.length
        }));

        res.json({ collections });
    } catch (error) {
        log.error('Error getting collections', { error: error.message });
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Get artworks from a specific collection
 * GET /api/collections/:collectionId
 */
router.get('/:collectionId', (req, res) => {
    try {
        const { collectionId } = req.params;
        const collection = CURATED_COLLECTIONS[collectionId];

        if (!collection) {
            return res.status(404).json({ error: "Collection not found" });
        }

        // Convert artworks to response format
        const artworks = collection.artworks.map(artwork => {
            const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${artwork.wikimedia}?width=1200`;
            return {
                title: `${artwork.title} (${artwork.year})`,
                artist: artwork.artist,
                imageUrl: imageUrl,
                thumbnail: imageUrl,
                source: "curated",
                year: artwork.year,
                popularity: artwork.popularity
            };
        });

        res.json({
            id: collectionId,
            name: collection.name,
            description: collection.description,
            artworks: artworks
        });
    } catch (error) {
        log.error('Error getting collection', { error: error.message });
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
