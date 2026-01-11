/**
 * Semantic Search API Routes
 * Art discovery using OpenAI Vector Stores + file_search
 * With intelligent fallback to museum API keyword search
 */

const express = require('express');
const router = express.Router();
const openaiSearch = require('../services/openai-search');
const { loggers } = require('../services/logger');
const log = loggers.api;

/**
 * Search artworks by natural language query (semantic search)
 * POST /api/semantic/search
 * Body: { query: "peaceful blue impressionist landscape", limit: 20 }
 */
router.post('/search', async (req, res) => {
    try {
        const { query, limit = 20 } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        log.debug('Semantic search', { query });

        // Search using OpenAI (with automatic fallback)
        const results = await openaiSearch.searchByText(query, parseInt(limit));

        res.json({
            results: results.map(r => ({
                id: r.id,
                title: r.title,
                artist: r.artist,
                date: r.date,
                imageUrl: r.imageUrl,
                thumbnailUrl: r.thumbnailUrl,
                similarity: r.score
            })),
            metadata: {
                query,
                resultsCount: results.length,
                searchType: 'semantic',
                model: 'OpenAI'
            }
        });

    } catch (error) {
        log.error('Semantic search error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * Find visually similar artworks
 * POST /api/semantic/similar
 * Body: { artworkId: "abc123", limit: 20 }
 */
router.post('/similar', async (req, res) => {
    try {
        const { artworkId, limit = 20 } = req.body;

        if (!artworkId) {
            return res.status(400).json({ error: 'artworkId is required' });
        }

        log.debug('Finding similar artwork', { artworkId });

        // Find similar artworks
        const results = await openaiSearch.searchSimilar(artworkId, parseInt(limit));

        res.json({
            results: results.map(r => ({
                id: r.id,
                title: r.title,
                artist: r.artist,
                date: r.date,
                imageUrl: r.imageUrl,
                thumbnailUrl: r.thumbnailUrl,
                similarity: r.score
            })),
            metadata: {
                sourceArtworkId: artworkId,
                resultsCount: results.length,
                searchType: 'similar',
                model: 'OpenAI'
            }
        });

    } catch (error) {
        log.error('Similar artwork error', { error: error.message });

        if (error.message === 'Artwork not found') {
            return res.status(404).json({ error: 'Artwork not found' });
        }

        res.status(500).json({ error: error.message });
    }
});

/**
 * Get search service statistics
 * GET /api/semantic/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await openaiSearch.getStats();
        res.json(stats);
    } catch (error) {
        log.error('Stats error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get personalized recommendations based on user taste profile
 * GET /api/semantic/recommendations?limit=20
 *
 * Taste profile is built from:
 * - Artworks user displayed on device
 * - Artworks user explicitly liked
 * - Extracted into keywords for semantic search
 */
router.get('/recommendations', async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        // Get user's interaction history
        const interactions = await getUserInteractionHistory();

        if (interactions.length === 0) {
            return res.json({
                results: [],
                metadata: {
                    message: 'No interaction history yet. Display or like some artworks first!',
                    searchType: 'personalized'
                }
            });
        }

        log.debug('Building taste profile', { interactionCount: interactions.length });

        // Build taste query from interaction patterns
        const tasteQuery = await buildTasteQuery(interactions);

        log.debug('Taste query', { query: tasteQuery });

        // Search for artworks matching taste profile
        const results = await openaiSearch.searchByText(tasteQuery, parseInt(limit));

        // Filter out artworks the user has already interacted with
        const interactedIds = new Set(interactions.map(i => i.artworkId));
        const filtered = results.filter(r => !interactedIds.has(r.id));

        log.debug('Found personalized recommendations', { count: filtered.length });

        res.json({
            results: filtered.map(r => ({
                id: r.id,
                title: r.title,
                artist: r.artist,
                date: r.date,
                imageUrl: r.imageUrl,
                thumbnailUrl: r.thumbnailUrl,
                matchScore: r.score
            })),
            metadata: {
                interactionCount: interactions.length,
                resultsCount: filtered.length,
                searchType: 'personalized',
                tasteQuery
            }
        });

    } catch (error) {
        log.error('Recommendations error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * Record user interaction (like, display, skip)
 * POST /api/semantic/interaction
 * Body: { artworkId, action: "like" | "display" | "skip", metadata: { title, artist } }
 */
router.post('/interaction', async (req, res) => {
    try {
        const { artworkId, action, metadata = {} } = req.body;

        if (!artworkId || !action) {
            return res.status(400).json({ error: 'artworkId and action are required' });
        }

        if (!['like', 'display', 'skip', 'dislike'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action type' });
        }

        // Store interaction with metadata for taste profile building
        await recordInteraction(artworkId, action, metadata);

        res.json({ success: true });

    } catch (error) {
        log.error('Interaction recording error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

/**
 * Index a single artwork (admin/dev use)
 * POST /api/semantic/index
 * Body: { id, imageUrl, title, artist, date, source, thumbnailUrl }
 */
router.post('/index', async (req, res) => {
    try {
        const artwork = req.body;

        if (!artwork.id || !artwork.imageUrl) {
            return res.status(400).json({ error: 'id and imageUrl are required' });
        }

        await openaiSearch.indexArtwork(artwork);

        res.json({
            success: true,
            message: `Indexed: ${artwork.title}`
        });

    } catch (error) {
        log.error('Index error', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

// Helper functions for taste profile
const fs = require('fs').promises;
const path = require('path');

const INTERACTIONS_FILE = path.join(__dirname, '../data/user-interactions.json');

async function recordInteraction(artworkId, action, metadata = {}) {
    try {
        let interactions = [];
        try {
            const data = await fs.readFile(INTERACTIONS_FILE, 'utf8');
            interactions = JSON.parse(data);
        } catch (err) {
            // File doesn't exist yet
        }

        interactions.push({
            artworkId,
            action,
            metadata: {
                title: metadata.title || '',
                artist: metadata.artist || '',
                style: metadata.style || '',
                ...metadata
            },
            timestamp: Date.now()
        });

        // Keep last 100 interactions
        if (interactions.length > 100) {
            interactions = interactions.slice(-100);
        }

        await fs.mkdir(path.dirname(INTERACTIONS_FILE), { recursive: true });
        await fs.writeFile(INTERACTIONS_FILE, JSON.stringify(interactions, null, 2));
    } catch (error) {
        log.error('Failed to record interaction', { error: error.message });
    }
}

async function getUserInteractionHistory() {
    try {
        const data = await fs.readFile(INTERACTIONS_FILE, 'utf8');
        const interactions = JSON.parse(data);

        // Filter to positive interactions (like, display)
        // Weight: like = 2x, display = 1x
        const weighted = [];
        for (const interaction of interactions) {
            if (interaction.action === 'like') {
                weighted.push(interaction);
                weighted.push(interaction); // Add twice for higher weight
            } else if (interaction.action === 'display') {
                weighted.push(interaction);
            }
        }

        return weighted;
    } catch (error) {
        return [];
    }
}

/**
 * Build a natural language taste query from user interactions
 * Instead of averaging vectors, we extract patterns from metadata
 */
async function buildTasteQuery(interactions) {
    // Extract unique artists, styles, and keywords from interactions
    const artists = new Map();
    const styles = new Map();
    const titles = [];

    for (const interaction of interactions) {
        const meta = interaction.metadata || {};

        if (meta.artist) {
            artists.set(meta.artist, (artists.get(meta.artist) || 0) + 1);
        }

        if (meta.style) {
            styles.set(meta.style, (styles.get(meta.style) || 0) + 1);
        }

        if (meta.title) {
            titles.push(meta.title);
        }
    }

    // Sort by frequency and take top items
    const topArtists = [...artists.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

    const topStyles = [...styles.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([style]) => style);

    // Build natural language query
    const queryParts = [];

    if (topArtists.length > 0) {
        queryParts.push(`artworks by or similar to ${topArtists.join(', ')}`);
    }

    if (topStyles.length > 0) {
        queryParts.push(`in ${topStyles.join(' or ')} style`);
    }

    if (queryParts.length === 0) {
        // Fallback to a generic discovery query if no patterns found
        return 'beautiful classical art masterpieces';
    }

    return queryParts.join(' ');
}

module.exports = router;
