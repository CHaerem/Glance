/**
 * Featured Picks API Routes
 * Curated picks, trending, personalized recommendations, seasonal themes
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { CURATED_COLLECTIONS } = require('../services/museum-api');
const vectorSearch = require('../services/vector-search');
const { loggers } = require('../services/logger');
const log = loggers.api;

const INTERACTIONS_FILE = path.join(__dirname, '../data/user-interactions.json');
const HISTORY_FILE = path.join(__dirname, '../data/history.json');

/**
 * Get staff picks - curated best artworks by popularity
 * GET /api/featured/staff-picks
 */
router.get('/staff-picks', (req, res) => {
    try {
        const { limit = 12 } = req.query;

        // Aggregate top artworks by popularity from all curated collections
        const allArtworks = [];
        for (const [collectionId, collection] of Object.entries(CURATED_COLLECTIONS)) {
            collection.artworks.forEach(art => {
                const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${art.wikimedia}?width=1200`;
                allArtworks.push({
                    id: `curated-${collectionId}-${art.title.toLowerCase().replace(/\s+/g, '-')}`,
                    title: art.title,
                    artist: art.artist,
                    year: art.year,
                    date: String(art.year),
                    popularity: art.popularity,
                    imageUrl: imageUrl,
                    thumbnailUrl: imageUrl,
                    source: 'curated',
                    collection: collectionId
                });
            });
        }

        // Sort by popularity (highest first) and return top picks
        allArtworks.sort((a, b) => b.popularity - a.popularity);
        const staffPicks = allArtworks.slice(0, parseInt(limit));

        res.json({
            title: 'Staff Picks',
            description: 'Our curators\' favorite artworks',
            artworks: staffPicks
        });

    } catch (error) {
        log.error('Error getting staff picks', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get trending artworks based on recent display/interaction history
 * GET /api/featured/trending
 */
router.get('/trending', async (req, res) => {
    try {
        const { limit = 12 } = req.query;

        // Load interaction history
        let interactions = [];
        try {
            const data = await fs.readFile(INTERACTIONS_FILE, 'utf8');
            interactions = JSON.parse(data);
        } catch (err) {
            // No interactions yet
        }

        // Load display history
        let history = [];
        try {
            const data = await fs.readFile(HISTORY_FILE, 'utf8');
            history = JSON.parse(data);
        } catch (err) {
            // No history yet
        }

        // Count interactions per artwork (last 7 days)
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const artworkCounts = new Map();

        // Count from interactions
        for (const interaction of interactions) {
            if (interaction.timestamp > oneWeekAgo &&
                (interaction.action === 'display' || interaction.action === 'like')) {
                const current = artworkCounts.get(interaction.artworkId) || { count: 0, data: null };
                current.count += interaction.action === 'like' ? 2 : 1;
                artworkCounts.set(interaction.artworkId, current);
            }
        }

        // Enrich with history data
        for (const item of history) {
            const current = artworkCounts.get(item.imageId) || { count: 0, data: null };
            if (!current.data && item.title) {
                current.data = {
                    id: item.imageId,
                    title: item.title,
                    artist: item.artist || 'Unknown',
                    thumbnailUrl: item.thumbnail,
                    imageUrl: item.thumbnail,
                    source: item.source || 'history'
                };
            }
            artworkCounts.set(item.imageId, current);
        }

        // Sort by count and filter to those with data
        const trending = Array.from(artworkCounts.entries())
            .filter(([id, data]) => data.data)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, parseInt(limit))
            .map(([id, data]) => ({
                ...data.data,
                trendScore: data.count
            }));

        // If not enough trending items, supplement with staff picks
        if (trending.length < parseInt(limit)) {
            const staffPicksResponse = await new Promise((resolve) => {
                const mockReq = { query: { limit: parseInt(limit) - trending.length } };
                const mockRes = {
                    json: (data) => resolve(data)
                };
                router.handle({ method: 'GET', url: '/staff-picks', query: mockReq.query }, mockRes, () => {});
            }).catch(() => ({ artworks: [] }));

            // Fallback: just add curated items directly
            const existingIds = new Set(trending.map(t => t.id));
            const allArtworks = [];
            for (const [collectionId, collection] of Object.entries(CURATED_COLLECTIONS)) {
                collection.artworks.forEach(art => {
                    const id = `curated-${collectionId}-${art.title.toLowerCase().replace(/\s+/g, '-')}`;
                    if (!existingIds.has(id)) {
                        const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${art.wikimedia}?width=1200`;
                        allArtworks.push({
                            id,
                            title: art.title,
                            artist: art.artist,
                            date: String(art.year),
                            imageUrl,
                            thumbnailUrl: imageUrl,
                            source: 'curated',
                            trendScore: 0
                        });
                    }
                });
            }
            trending.push(...allArtworks.slice(0, parseInt(limit) - trending.length));
        }

        res.json({
            title: 'Trending',
            description: 'Popular artworks this week',
            artworks: trending
        });

    } catch (error) {
        log.error('Error getting trending', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get personalized recommendations based on taste profile
 * GET /api/featured/for-you
 */
router.get('/for-you', async (req, res) => {
    try {
        const { limit = 12 } = req.query;

        // Load interaction history
        let interactions = [];
        try {
            const data = await fs.readFile(INTERACTIONS_FILE, 'utf8');
            interactions = JSON.parse(data);
        } catch (err) {
            // No interactions yet
        }

        // Filter to positive interactions
        const positiveInteractions = interactions.filter(
            i => i.action === 'like' || i.action === 'display'
        );

        // If no interactions, fall back to staff picks
        if (positiveInteractions.length === 0) {
            const allArtworks = [];
            for (const [collectionId, collection] of Object.entries(CURATED_COLLECTIONS)) {
                collection.artworks.forEach(art => {
                    const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${art.wikimedia}?width=1200`;
                    allArtworks.push({
                        id: `curated-${collectionId}-${art.title.toLowerCase().replace(/\s+/g, '-')}`,
                        title: art.title,
                        artist: art.artist,
                        date: String(art.year),
                        imageUrl,
                        thumbnailUrl: imageUrl,
                        source: 'curated'
                    });
                });
            }
            // Shuffle for variety
            for (let i = allArtworks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allArtworks[i], allArtworks[j]] = [allArtworks[j], allArtworks[i]];
            }

            return res.json({
                title: 'For You',
                description: 'Start exploring to get personalized recommendations',
                artworks: allArtworks.slice(0, parseInt(limit)),
                metadata: {
                    personalized: false,
                    reason: 'No interaction history yet'
                }
            });
        }

        // Build taste profile and get recommendations from vector search
        try {
            const artworkIds = [...new Set(positiveInteractions.map(i => i.artworkId))];
            const vectors = [];

            for (const artworkId of artworkIds.slice(0, 10)) { // Use last 10 interactions
                try {
                    const pointId = vectorSearch.generatePointId(artworkId);
                    const result = await vectorSearch.client.retrieve(vectorSearch.collectionName, {
                        ids: [pointId],
                        with_vector: true
                    });
                    if (result && result.length > 0) {
                        vectors.push(result[0].vector);
                    }
                } catch (err) {
                    // Skip artwork if not in vector DB
                }
            }

            if (vectors.length > 0) {
                // Average vectors for taste profile
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

                // Search for similar artworks
                const results = await vectorSearch.client.search(vectorSearch.collectionName, {
                    vector: tasteVector,
                    limit: parseInt(limit),
                    with_payload: true
                });

                const recommendations = results.map(r => ({
                    id: r.payload.artworkId || r.id,
                    title: r.payload.title,
                    artist: r.payload.artist,
                    date: r.payload.date,
                    imageUrl: r.payload.imageUrl,
                    thumbnailUrl: r.payload.thumbnailUrl,
                    source: r.payload.source || 'recommended',
                    matchScore: r.score
                }));

                return res.json({
                    title: 'For You',
                    description: 'Based on your taste',
                    artworks: recommendations,
                    metadata: {
                        personalized: true,
                        interactionCount: positiveInteractions.length,
                        vectorCount: vectors.length
                    }
                });
            }
        } catch (err) {
            log.warn('Vector search unavailable for recommendations', { error: err.message });
        }

        // Fallback to curated if vector search fails
        const allArtworks = [];
        for (const [collectionId, collection] of Object.entries(CURATED_COLLECTIONS)) {
            collection.artworks.forEach(art => {
                const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${art.wikimedia}?width=1200`;
                allArtworks.push({
                    id: `curated-${collectionId}-${art.title.toLowerCase().replace(/\s+/g, '-')}`,
                    title: art.title,
                    artist: art.artist,
                    date: String(art.year),
                    imageUrl,
                    thumbnailUrl: imageUrl,
                    source: 'curated'
                });
            });
        }

        res.json({
            title: 'For You',
            description: 'Curated selections',
            artworks: allArtworks.slice(0, parseInt(limit)),
            metadata: {
                personalized: false,
                reason: 'Vector search unavailable'
            }
        });

    } catch (error) {
        log.error('Error getting recommendations', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get seasonal themed artworks
 * GET /api/featured/seasonal
 */
router.get('/seasonal', async (req, res) => {
    try {
        const { limit = 12 } = req.query;

        const now = new Date();
        const month = now.getMonth() + 1; // 1-12

        // Determine season and theme
        let seasonTitle, seasonQuery;
        if (month === 12 || month <= 2) {
            seasonTitle = 'Winter Wonderland';
            seasonQuery = 'snow winter cold landscape ice frost';
        } else if (month <= 5) {
            seasonTitle = 'Spring Blooms';
            seasonQuery = 'flowers spring garden bloom cherry blossom';
        } else if (month <= 8) {
            seasonTitle = 'Summer Light';
            seasonQuery = 'summer sun beach bright warm light';
        } else {
            seasonTitle = 'Autumn Colors';
            seasonQuery = 'autumn fall harvest golden leaves orange';
        }

        log.debug('Seasonal search', { season: seasonTitle, query: seasonQuery });

        // Use semantic search for seasonal artworks
        try {
            const results = await vectorSearch.searchByText(seasonQuery, parseInt(limit));

            return res.json({
                title: seasonTitle,
                description: `Seasonal artworks for ${getSeasonName(month)}`,
                artworks: results.map(r => ({
                    id: r.id,
                    title: r.title,
                    artist: r.artist,
                    date: r.date,
                    imageUrl: r.imageUrl,
                    thumbnailUrl: r.thumbnailUrl,
                    source: r.source || 'seasonal',
                    similarity: r.score
                })),
                metadata: {
                    season: getSeasonName(month),
                    query: seasonQuery
                }
            });
        } catch (err) {
            log.warn('Vector search unavailable for seasonal', { error: err.message });
        }

        // Fallback: return curated items if vector search unavailable
        const allArtworks = [];
        for (const [collectionId, collection] of Object.entries(CURATED_COLLECTIONS)) {
            collection.artworks.forEach(art => {
                const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${art.wikimedia}?width=1200`;
                allArtworks.push({
                    id: `curated-${collectionId}-${art.title.toLowerCase().replace(/\s+/g, '-')}`,
                    title: art.title,
                    artist: art.artist,
                    date: String(art.year),
                    imageUrl,
                    thumbnailUrl: imageUrl,
                    source: 'curated'
                });
            });
        }

        res.json({
            title: seasonTitle,
            description: `Curated artworks`,
            artworks: allArtworks.slice(0, parseInt(limit))
        });

    } catch (error) {
        log.error('Error getting seasonal', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

function getSeasonName(month) {
    if (month === 12 || month <= 2) return 'winter';
    if (month <= 5) return 'spring';
    if (month <= 8) return 'summer';
    return 'autumn';
}

module.exports = router;
