/**
 * Collections API Routes
 * Curated art collection endpoints and AI-powered playlists
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { CURATED_COLLECTIONS } = require('../services/museum-api');
const openaiSearch = require('../services/openai-search');
const { loggers } = require('../services/logger');
const log = loggers.api;

// Load playlists data
const PLAYLISTS = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'curated-playlists.json'), 'utf8')
).playlists;

// Simple in-memory cache for playlist results (1 hour TTL)
const playlistCache = new Map();
const PLAYLIST_CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
 * Get all playlists
 * GET /api/collections/playlists
 * NOTE: Must be defined before /:collectionId to avoid matching "playlists" as ID
 */
router.get('/playlists', (req, res) => {
    try {
        const playlists = PLAYLISTS.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            description: p.description
        }));

        res.json({ playlists });
    } catch (error) {
        log.error('Error getting playlists', { error: error.message });
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Get playlist artworks (AI-powered search)
 * GET /api/collections/playlists/:playlistId
 * NOTE: Must be defined before /:collectionId
 */
router.get('/playlists/:playlistId', async (req, res) => {
    try {
        const { playlistId } = req.params;
        const playlist = PLAYLISTS.find(p => p.id === playlistId);

        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        // Check cache first
        const cacheKey = `playlist:${playlistId}`;
        const cached = playlistCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < PLAYLIST_CACHE_TTL) {
            log.debug('Serving cached playlist', { playlistId });
            return res.json(cached.data);
        }

        // Use AI search to get artworks matching the playlist theme
        log.info('Fetching playlist artworks', { playlistId, query: playlist.searchQuery });
        const results = await openaiSearch.searchByText(playlist.searchQuery, 30);

        const response = {
            id: playlist.id,
            name: playlist.name,
            type: playlist.type,
            description: playlist.description,
            artworks: results
        };

        // Cache the results
        playlistCache.set(cacheKey, {
            data: response,
            timestamp: Date.now()
        });

        res.json(response);
    } catch (error) {
        log.error('Error getting playlist', { error: error.message });
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
