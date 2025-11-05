/**
 * Semantic Search API Routes
 * Visual similarity search using CLIP embeddings + Qdrant
 * Architecture based on: artwork-similarity-search by Otman404
 */

const express = require('express');
const router = express.Router();
const vectorSearch = require('../services/vector-search');

/**
 * Search artworks by natural language query (text-to-image search)
 * POST /api/semantic/search
 * Body: { query: "peaceful blue impressionist landscape", limit: 20 }
 */
router.post('/search', async (req, res) => {
    try {
        const { query, limit = 20 } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        console.log(`Semantic search: "${query}"`);

        // Search using vector similarity
        const results = await vectorSearch.searchByText(query, parseInt(limit));

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
                searchType: 'text-to-image',
                model: 'CLIP ViT-B/32'
            }
        });

    } catch (error) {
        console.error('Semantic search error:', error);

        if (error.message.includes('Qdrant')) {
            return res.status(503).json({
                error: 'Vector search unavailable. Is Qdrant running?',
                hint: 'Run: docker run -p 6333:6333 qdrant/qdrant'
            });
        }

        res.status(500).json({ error: error.message });
    }
});

/**
 * Find visually similar artworks (image-to-image search)
 * POST /api/semantic/similar
 * Body: { artworkId: "abc123", limit: 20 }
 */
router.post('/similar', async (req, res) => {
    try {
        const { artworkId, limit = 20 } = req.body;

        if (!artworkId) {
            return res.status(400).json({ error: 'artworkId is required' });
        }

        console.log(`Finding similar to artwork: ${artworkId}`);

        // Find visually similar artworks
        const results = await vectorSearch.searchSimilar(artworkId, parseInt(limit));

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
                searchType: 'image-to-image',
                model: 'CLIP ViT-B/32'
            }
        });

    } catch (error) {
        console.error('Similar artwork error:', error);

        if (error.message === 'Artwork not found') {
            return res.status(404).json({ error: 'Artwork not found in vector database' });
        }

        res.status(500).json({ error: error.message });
    }
});

/**
 * Get vector search statistics
 * GET /api/semantic/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await vectorSearch.getStats();
        res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
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
 * - Averaged into a single taste vector
 */
router.get('/recommendations', async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        // Get user's interaction history (from main server data)
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

        console.log(`Building taste profile from ${interactions.length} interactions...`);

        // Build taste profile by averaging embeddings
        const tasteVector = await buildTasteProfile(interactions);

        // Search for artworks similar to taste profile
        const results = await vectorSearch.client.search(vectorSearch.collectionName, {
            vector: tasteVector,
            limit: parseInt(limit),
            with_payload: true
        });

        console.log(`✓ Found ${results.length} personalized recommendations`);

        res.json({
            results: results.map(r => ({
                id: r.payload.artworkId || r.id,
                title: r.payload.title,
                artist: r.payload.artist,
                date: r.payload.date,
                imageUrl: r.payload.imageUrl,
                thumbnailUrl: r.payload.thumbnailUrl,
                matchScore: r.score
            })),
            metadata: {
                interactionCount: interactions.length,
                resultsCount: results.length,
                searchType: 'personalized',
                model: 'CLIP ViT-B/32'
            }
        });

    } catch (error) {
        console.error('Recommendations error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Record user interaction (like, display, skip)
 * POST /api/semantic/interaction
 * Body: { artworkId, action: "like" | "display" | "skip" }
 */
router.post('/interaction', async (req, res) => {
    try {
        const { artworkId, action } = req.body;

        if (!artworkId || !action) {
            return res.status(400).json({ error: 'artworkId and action are required' });
        }

        if (!['like', 'display', 'skip', 'dislike'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action type' });
        }

        // Store interaction (we'll use simple JSON file for now)
        await recordInteraction(artworkId, action);

        res.json({ success: true });

    } catch (error) {
        console.error('Interaction recording error:', error);
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

        await vectorSearch.indexArtwork(artwork);

        res.json({
            success: true,
            message: `Indexed: ${artwork.title}`
        });

    } catch (error) {
        console.error('Index error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper functions for taste profile
const fs = require('fs').promises;
const path = require('path');

const INTERACTIONS_FILE = path.join(__dirname, '../data/user-interactions.json');

async function recordInteraction(artworkId, action) {
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
            timestamp: Date.now()
        });

        // Keep last 100 interactions
        if (interactions.length > 100) {
            interactions = interactions.slice(-100);
        }

        await fs.mkdir(path.dirname(INTERACTIONS_FILE), { recursive: true });
        await fs.writeFile(INTERACTIONS_FILE, JSON.stringify(interactions, null, 2));
    } catch (error) {
        console.error('Failed to record interaction:', error);
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

async function buildTasteProfile(interactions) {
    // Get vectors for all interacted artworks
    const artworkIds = [...new Set(interactions.map(i => i.artworkId))];

    console.log(`Fetching vectors for ${artworkIds.length} artworks...`);

    const vectors = [];
    for (const artworkId of artworkIds) {
        try {
            // Convert artwork ID to Qdrant point ID (UUID)
            const pointId = vectorSearch.generatePointId(artworkId);

            const result = await vectorSearch.client.retrieve(vectorSearch.collectionName, {
                ids: [pointId],
                with_vector: true
            });

            if (result && result.length > 0) {
                vectors.push(result[0].vector);
            }
        } catch (err) {
            console.warn(`Could not find vector for artwork ${artworkId}`);
        }
    }

    if (vectors.length === 0) {
        throw new Error('No vectors found for user interactions');
    }

    console.log(`Averaging ${vectors.length} vectors to build taste profile...`);

    // Average all vectors to create taste profile
    const dimensions = vectors[0].length;
    const tasteVector = new Array(dimensions).fill(0);

    for (const vector of vectors) {
        for (let i = 0; i < dimensions; i++) {
            tasteVector[i] += vector[i];
        }
    }

    for (let i = 0; i < dimensions; i++) {
        tasteVector[i] /= vectors.length;
    }

    return tasteVector;
}

module.exports = router;
