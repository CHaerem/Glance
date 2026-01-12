/**
 * Collections API Routes
 * Curated art collection endpoints
 */

const express = require('express');
const router = express.Router();
const { CURATED_COLLECTIONS } = require('../services/museum-api');
const { loggers } = require('../services/logger');
const log = loggers.api;
const { filterValidWikimediaArtworks, getWikimediaUrl, isFilenameValidated } = require('../utils/image-validator');

/**
 * Get featured artworks (most popular, instantly loaded)
 * GET /api/collections/featured
 */
router.get('/featured', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        // Collect all artworks from all collections with their popularity
        // Only include verified filenames for instant, guaranteed loading
        const allArtworks = [];
        for (const [collectionId, collection] of Object.entries(CURATED_COLLECTIONS)) {
            for (const artwork of collection.artworks) {
                if (artwork.wikimedia && isFilenameValidated(artwork.wikimedia)) {
                    allArtworks.push({
                        ...artwork,
                        collectionId,
                        collectionName: collection.name
                    });
                }
            }
        }

        // Sort by popularity (highest first) and take top N
        const featured = allArtworks
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
            .slice(0, limit)
            .map(artwork => {
                const imageUrl = getWikimediaUrl(artwork.wikimedia, 1200);
                return {
                    title: artwork.title,
                    artist: artwork.artist,
                    year: artwork.year,
                    imageUrl: imageUrl,
                    thumbnail: getWikimediaUrl(artwork.wikimedia, 400),
                    source: "curated",
                    popularity: artwork.popularity,
                    collectionId: artwork.collectionId
                };
            });

        res.json({ artworks: featured });
    } catch (error) {
        log.error('Error getting featured artworks', { error: error.message });
        res.status(500).json({ error: "Internal server error" });
    }
});

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
router.get('/:collectionId', async (req, res) => {
    try {
        const { collectionId } = req.params;
        const collection = CURATED_COLLECTIONS[collectionId];

        if (!collection) {
            return res.status(404).json({ error: "Collection not found" });
        }

        // Validate Wikimedia images and filter out broken ones
        const validatedArtworks = await filterValidWikimediaArtworks(collection.artworks);

        // Convert artworks to response format
        const artworks = validatedArtworks.map(artwork => {
            const imageUrl = getWikimediaUrl(artwork.wikimedia, 1200);
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
