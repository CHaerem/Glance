/**
 * Smart Categories API Routes
 * Browse art by subject, mood, and color using semantic search
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const vectorSearch = require('../services/vector-search');
const { loggers } = require('../services/logger');
const log = loggers.api;

// Load categories configuration
const CATEGORIES = require('../data/smart-categories.json');

/**
 * Get all smart categories configuration
 * GET /api/categories
 */
router.get('/', (req, res) => {
    try {
        res.json(CATEGORIES);
    } catch (error) {
        log.error('Error getting categories', { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Browse artworks by category
 * GET /api/categories/:type/:id
 * :type = subjects | moods | colors
 * :id = category id (e.g., landscape, peaceful, blue)
 */
router.get('/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const { limit = 30 } = req.query;

        // Validate category type
        const categoryList = CATEGORIES[type];
        if (!categoryList) {
            return res.status(400).json({
                error: 'Invalid category type',
                validTypes: Object.keys(CATEGORIES)
            });
        }

        // Find the specific category
        const category = categoryList.find(c => c.id === id);
        if (!category) {
            return res.status(404).json({
                error: 'Category not found',
                validCategories: categoryList.map(c => c.id)
            });
        }

        log.debug('Browsing by category', { type, id, query: category.query });

        // Use semantic search with category query
        const results = await vectorSearch.searchByText(category.query, parseInt(limit));

        res.json({
            category: {
                type,
                id,
                label: category.label,
                query: category.query
            },
            results: results.map(r => ({
                id: r.id,
                title: r.title,
                artist: r.artist,
                date: r.date,
                source: r.source,
                imageUrl: r.imageUrl,
                thumbnailUrl: r.thumbnailUrl,
                similarity: r.score
            })),
            metadata: {
                resultsCount: results.length,
                searchType: 'category-browse',
                model: 'CLIP ViT-B/32'
            }
        });

    } catch (error) {
        log.error('Category browse error', { error: error.message });

        if (error.message.includes('Qdrant')) {
            return res.status(503).json({
                error: 'Vector search unavailable',
                hint: 'Semantic search requires Qdrant to be running'
            });
        }

        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
