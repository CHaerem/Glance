/**
 * Playlists API Routes
 * Curated and dynamic playlist endpoints
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { loggers } = require('../services/logger');
const log = loggers.api;
const { filterValidWikimediaArtworks, getWikimediaUrl, isUrlAccessible } = require('../utils/image-validator');

// Load playlists data
const PLAYLISTS_PATH = path.join(__dirname, '..', 'data', 'playlists.json');
let playlistsData = { playlists: [] };

try {
    if (fs.existsSync(PLAYLISTS_PATH)) {
        playlistsData = JSON.parse(fs.readFileSync(PLAYLISTS_PATH, 'utf8'));
        log.info('Loaded playlists', { count: playlistsData.playlists.length });
    }
} catch (error) {
    log.error('Failed to load playlists', { error: error.message });
}

// Cache for dynamic playlist results (1 hour TTL)
const dynamicCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Get all playlists (metadata only)
 * GET /api/playlists
 */
router.get('/', (req, res) => {
    try {
        const playlists = playlistsData.playlists.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type,
            description: p.description,
            source: p.source || null,
            // Include preview image (first artwork for classic, null for dynamic)
            preview: p.artworks && p.artworks.length > 0
                ? `https://commons.wikimedia.org/wiki/Special:FilePath/${p.artworks[0].wikimedia}?width=400`
                : null,
            artworkCount: p.artworks ? p.artworks.length : null
        }));

        res.json({ playlists });
    } catch (error) {
        log.error('Error getting playlists', { error: error.message });
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Get artworks from a specific playlist
 * GET /api/playlists/:playlistId
 */
router.get('/:playlistId', async (req, res) => {
    try {
        const { playlistId } = req.params;
        const playlist = playlistsData.playlists.find(p => p.id === playlistId);

        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        // Classic playlist - return static artworks with validated images
        if (playlist.type === 'classic' && playlist.artworks) {
            // Validate Wikimedia images and filter out broken ones
            const validatedArtworks = await filterValidWikimediaArtworks(playlist.artworks);

            const artworks = validatedArtworks.map(artwork => {
                const imageUrl = getWikimediaUrl(artwork.wikimedia, 1200);
                return {
                    title: artwork.title,
                    artist: artwork.artist,
                    year: artwork.year,
                    imageUrl: imageUrl,
                    thumbnail: getWikimediaUrl(artwork.wikimedia, 400),
                    source: 'curated'
                };
            });

            return res.json({
                id: playlist.id,
                name: playlist.name,
                type: playlist.type,
                description: playlist.description,
                source: playlist.source,
                artworks: artworks
            });
        }

        // Dynamic playlist - use AI search
        if ((playlist.type === 'dynamic' || playlist.type === 'seasonal') && playlist.searchQuery) {
            // Check cache
            const cacheKey = `${playlistId}-${playlist.searchQuery}`;
            const cached = dynamicCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
                return res.json({
                    id: playlist.id,
                    name: playlist.name,
                    type: playlist.type,
                    description: playlist.description,
                    artworks: cached.artworks,
                    cached: true
                });
            }

            // Use OpenAI search if available
            let artworks = [];
            try {
                const openaiSearch = require('../services/openai-search');
                if (openaiSearch && openaiSearch.searchByText) {
                    const results = await openaiSearch.searchByText(playlist.searchQuery, 20);
                    artworks = results || [];
                }
            } catch (searchError) {
                log.warn('Dynamic playlist search failed, using fallback', {
                    playlistId,
                    error: searchError.message
                });

                // Fallback to museum API keyword search
                try {
                    const { searchMuseumAPIs } = require('../services/museum-api');
                    const results = await searchMuseumAPIs(playlist.searchQuery, 20);
                    artworks = results || [];
                } catch (fallbackError) {
                    log.error('Fallback search also failed', { error: fallbackError.message });
                }
            }

            // Cache results
            dynamicCache.set(cacheKey, {
                artworks,
                timestamp: Date.now()
            });

            return res.json({
                id: playlist.id,
                name: playlist.name,
                type: playlist.type,
                description: playlist.description,
                artworks: artworks,
                cached: false
            });
        }

        // Fallback
        res.json({
            id: playlist.id,
            name: playlist.name,
            type: playlist.type,
            description: playlist.description,
            artworks: []
        });

    } catch (error) {
        log.error('Error getting playlist', { playlistId: req.params.playlistId, error: error.message });
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * Refresh a dynamic playlist (clear cache and refetch)
 * POST /api/playlists/:playlistId/refresh
 */
router.post('/:playlistId/refresh', async (req, res) => {
    try {
        const { playlistId } = req.params;
        const playlist = playlistsData.playlists.find(p => p.id === playlistId);

        if (!playlist) {
            return res.status(404).json({ error: "Playlist not found" });
        }

        if (playlist.type === 'classic') {
            return res.status(400).json({ error: "Classic playlists cannot be refreshed" });
        }

        // Clear cache for this playlist
        for (const key of dynamicCache.keys()) {
            if (key.startsWith(playlistId)) {
                dynamicCache.delete(key);
            }
        }

        // Redirect to GET to fetch fresh results
        res.redirect(`/api/playlists/${playlistId}`);

    } catch (error) {
        log.error('Error refreshing playlist', { playlistId: req.params.playlistId, error: error.message });
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
