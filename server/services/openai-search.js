/**
 * OpenAI Search Service
 * Uses OpenAI Vector Stores + file_search for semantic art search
 * Replaces Qdrant/CLIP with managed OpenAI infrastructure
 */

const OpenAI = require('openai');
const { loggers } = require('./logger');
const { performArtSearch } = require('./museum-api');
const log = loggers.api;

class OpenAISearchService {
    constructor() {
        this.client = null;
        this.vectorStoreId = null;
        this.initialized = false;
        this.fallbackOnly = false;
    }

    /**
     * Initialize OpenAI client and verify Vector Store exists
     */
    async initialize() {
        if (this.initialized) return;

        const apiKey = process.env.OPENAI_API_KEY;
        this.vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;

        if (!apiKey) {
            log.warn('OPENAI_API_KEY not set, falling back to keyword search only');
            this.fallbackOnly = true;
            this.initialized = true;
            return;
        }

        try {
            this.client = new OpenAI({ apiKey });

            if (this.vectorStoreId) {
                // Verify Vector Store exists
                const vectorStore = await this.client.vectorStores.retrieve(this.vectorStoreId);
                log.info('Connected to OpenAI Vector Store', {
                    id: vectorStore.id,
                    name: vectorStore.name,
                    fileCount: vectorStore.file_counts?.completed || 0
                });
            } else {
                log.warn('OPENAI_VECTOR_STORE_ID not set, semantic search will use query enhancement only');
            }

            this.initialized = true;
            log.info('OpenAI search service ready');

        } catch (error) {
            log.error('Failed to initialize OpenAI search', { error: error.message });
            this.fallbackOnly = true;
            this.initialized = true;
        }
    }

    /**
     * Search for artworks using natural language query
     * Uses file_search if Vector Store available, falls back to keyword search
     * @param {string} query - Natural language search query
     * @param {number} limit - Number of results to return
     * @returns {Promise<Array>} Array of artworks with scores
     */
    async searchByText(query, limit = 20) {
        await this.initialize();

        log.debug('OpenAI search', { query, hasVectorStore: !!this.vectorStoreId });

        // If no Vector Store, use enhanced keyword search
        if (this.fallbackOnly || !this.vectorStoreId) {
            return this._keywordSearchWithEnhancement(query, limit);
        }

        try {
            // Use Responses API with file_search tool
            const response = await this.client.responses.create({
                model: 'gpt-4o-mini',
                input: `Search for artworks matching: "${query}". Return the most relevant results.`,
                tools: [{
                    type: 'file_search',
                    vector_store_ids: [this.vectorStoreId]
                }],
                tool_choice: 'auto'
            });

            // Parse results from file_search
            const results = this._parseFileSearchResults(response, limit);

            if (results.length > 0) {
                log.debug('OpenAI search results', { count: results.length });
                return results;
            }

            // Fall back to keyword search if no results
            log.debug('No file_search results, falling back to keyword search');
            return this._keywordSearchWithEnhancement(query, limit);

        } catch (error) {
            log.error('OpenAI search error, falling back', { error: error.message });
            return this._keywordSearchWithEnhancement(query, limit);
        }
    }

    /**
     * Find visually similar artworks
     * For OpenAI, we search by the artwork's metadata
     * @param {string} artworkId - ID of source artwork
     * @param {number} limit - Number of results to return
     * @returns {Promise<Array>} Array of similar artworks
     */
    async searchSimilar(artworkId, limit = 20) {
        await this.initialize();

        log.debug('Finding similar artworks', { artworkId });

        // For similar search, we need to find the artwork first
        // Then search for artworks with similar characteristics
        try {
            // Try to find artwork metadata from our data
            const artworkMeta = await this._getArtworkMetadata(artworkId);

            if (artworkMeta) {
                // Build a query from the artwork's characteristics
                const similarQuery = `Artworks similar to "${artworkMeta.title}" by ${artworkMeta.artist}.
                    Style: ${artworkMeta.style || 'classical'}.
                    Looking for similar mood, colors, and subject matter.`;

                const results = await this.searchByText(similarQuery, limit + 1);

                // Filter out the source artwork
                return results.filter(r => r.id !== artworkId).slice(0, limit);
            }

            // If we can't find metadata, do a basic search
            return this.searchByText(`artwork similar to ${artworkId}`, limit);

        } catch (error) {
            log.error('Similar search error', { error: error.message });
            throw error;
        }
    }

    /**
     * Get search service statistics
     * @returns {Promise<Object>} Service stats
     */
    async getStats() {
        await this.initialize();

        if (this.fallbackOnly || !this.vectorStoreId) {
            return {
                totalArtworks: 0,
                vectorSize: 'N/A',
                model: 'OpenAI (keyword fallback)',
                status: 'fallback_only'
            };
        }

        try {
            const vectorStore = await this.client.vectorStores.retrieve(this.vectorStoreId);
            return {
                totalArtworks: vectorStore.file_counts?.completed || 0,
                vectorSize: 1536,
                model: 'OpenAI text-embedding-3-small',
                vectorStoreId: this.vectorStoreId,
                status: 'active'
            };
        } catch (error) {
            log.error('Stats error', { error: error.message });
            return {
                totalArtworks: 0,
                vectorSize: 'N/A',
                model: 'OpenAI',
                error: error.message
            };
        }
    }

    /**
     * Check if service is available
     * @returns {boolean}
     */
    isAvailable() {
        return this.initialized;
    }

    /**
     * Index an artwork (upload to Vector Store)
     * @param {Object} artwork - Artwork metadata
     */
    async indexArtwork(artwork) {
        await this.initialize();

        if (!this.vectorStoreId) {
            log.warn('Cannot index artwork: no Vector Store configured');
            return;
        }

        try {
            // Create a file with artwork metadata for Vector Store
            const artworkContent = JSON.stringify({
                id: artwork.id,
                title: artwork.title,
                artist: artwork.artist || 'Unknown',
                date: artwork.date || '',
                source: artwork.source || '',
                imageUrl: artwork.imageUrl,
                thumbnailUrl: artwork.thumbnailUrl || artwork.imageUrl,
                // Add searchable text
                searchText: `${artwork.title} by ${artwork.artist || 'Unknown'}. ${artwork.date || ''}`
            }, null, 2);

            // Upload file to Vector Store
            const file = await this.client.files.create({
                file: new Blob([artworkContent], { type: 'application/json' }),
                purpose: 'assistants'
            });

            await this.client.vectorStores.files.create(this.vectorStoreId, {
                file_id: file.id
            });

            log.debug('Artwork indexed', { title: artwork.title });

        } catch (error) {
            log.error('Failed to index artwork', { title: artwork.title, error: error.message });
            throw error;
        }
    }

    /**
     * Enhanced keyword search using GPT to expand query
     * @private
     */
    async _keywordSearchWithEnhancement(query, limit) {
        try {
            let searchTerms = [query];

            // Use GPT to expand the query if available
            if (this.client && !this.fallbackOnly) {
                try {
                    const expansion = await this.client.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [{
                            role: 'system',
                            content: 'You are a helpful art search assistant. Given a search query, expand it into 2-3 specific search terms that would help find relevant artworks. Return only the terms, comma-separated.'
                        }, {
                            role: 'user',
                            content: `Expand this art search query: "${query}"`
                        }],
                        max_tokens: 100,
                        temperature: 0.7
                    });

                    const expanded = expansion.choices[0]?.message?.content || '';
                    searchTerms = expanded.split(',').map(t => t.trim()).filter(t => t.length > 0);

                    if (searchTerms.length === 0) {
                        searchTerms = [query];
                    }

                    log.debug('Query expanded', { original: query, expanded: searchTerms });
                } catch (err) {
                    log.warn('Query expansion failed', { error: err.message });
                }
            }

            // Search museum APIs with expanded terms
            const allResults = [];
            for (const term of searchTerms.slice(0, 3)) {
                try {
                    const searchResult = await performArtSearch(term, Math.ceil(limit / searchTerms.length));
                    if (searchResult.results) {
                        allResults.push(...searchResult.results);
                    }
                } catch (err) {
                    log.warn('Museum search failed for term', { term, error: err.message });
                }
            }

            // Deduplicate by ID and return
            const seen = new Set();
            const unique = allResults.filter(art => {
                if (seen.has(art.id)) return false;
                seen.add(art.id);
                return true;
            });

            return unique.slice(0, limit).map(art => ({
                id: art.id,
                title: art.title,
                artist: art.artist,
                date: art.date,
                imageUrl: art.imageUrl,
                thumbnailUrl: art.thumbnailUrl,
                source: art.source,
                score: 0.5 // No real similarity score for keyword search
            }));

        } catch (error) {
            log.error('Keyword search failed', { error: error.message });
            return [];
        }
    }

    /**
     * Parse results from file_search tool response
     * @private
     */
    _parseFileSearchResults(response, limit) {
        const results = [];

        try {
            // Extract content from response
            if (response.output && Array.isArray(response.output)) {
                for (const item of response.output) {
                    if (item.type === 'file_search_call' && item.file_search_call?.results) {
                        for (const result of item.file_search_call.results) {
                            try {
                                // Parse the JSON content from the file
                                const content = JSON.parse(result.text || '{}');
                                if (content.id) {
                                    results.push({
                                        id: content.id,
                                        title: content.title || 'Unknown',
                                        artist: content.artist || 'Unknown',
                                        date: content.date || '',
                                        imageUrl: content.imageUrl,
                                        thumbnailUrl: content.thumbnailUrl || content.imageUrl,
                                        source: content.source || 'curated',
                                        score: result.score || 0.8
                                    });
                                }
                            } catch (parseErr) {
                                // Skip unparseable results
                            }
                        }
                    }
                }
            }
        } catch (error) {
            log.warn('Error parsing file_search results', { error: error.message });
        }

        return results.slice(0, limit);
    }

    /**
     * Get artwork metadata from local data
     * @private
     */
    async _getArtworkMetadata(artworkId) {
        // Try to find in curated collections
        const fs = require('fs').promises;
        const path = require('path');

        try {
            const collectionsPath = path.join(__dirname, '../data/curated-collections.json');
            const data = await fs.readFile(collectionsPath, 'utf8');
            const collections = JSON.parse(data);

            for (const [collectionId, collection] of Object.entries(collections)) {
                for (const artwork of collection.artworks) {
                    const id = `${collectionId}-${artwork.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                    if (id === artworkId || artwork.title === artworkId) {
                        return {
                            id,
                            title: artwork.title,
                            artist: artwork.artist,
                            date: artwork.year,
                            collection: collection.name
                        };
                    }
                }
            }
        } catch (err) {
            // Ignore errors reading file
        }

        return null;
    }
}

module.exports = new OpenAISearchService();
