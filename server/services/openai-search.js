/**
 * OpenAI Agentic Art Search Service
 * Uses gpt-5-mini with function tools to intelligently search museum APIs
 *
 * The AI decides which museums to search, what terms to use,
 * and curates the best results based on the user's intent.
 *
 * Optimized for speed with parallel museum searches.
 */

const OpenAI = require('openai');
const { loggers } = require('./logger');
const { performArtSearch } = require('./museum-api');
const log = loggers.api;

// Individual museum search functions for tool use
const museumSearchers = {
    async searchMetMuseum(query, limit = 10) {
        const url = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            if (!data.objectIDs?.length) return [];

            // Fetch objects IN PARALLEL for speed (fetch more than needed to account for filtering)
            const objectPromises = data.objectIDs.slice(0, limit * 3).map(async (id) => {
                try {
                    const objRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
                    const obj = await objRes.json();
                    if (obj.primaryImage && obj.isPublicDomain) {
                        return {
                            id: `met-${obj.objectID}`,
                            title: obj.title || 'Untitled',
                            artist: obj.artistDisplayName || 'Unknown',
                            date: obj.objectDate || '',
                            imageUrl: obj.primaryImage,
                            thumbnailUrl: obj.primaryImageSmall || obj.primaryImage,
                            source: 'The Met Museum',
                            department: obj.department || ''
                        };
                    }
                } catch (e) { /* skip */ }
                return null;
            });

            const objects = await Promise.all(objectPromises);
            return objects.filter(Boolean).slice(0, limit);
        } catch (e) {
            log.warn('Met search failed', { error: e.message });
            return [];
        }
    },

    async searchArtInstituteChicago(query, limit = 10) {
        const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&limit=${limit}&fields=id,title,artist_display,date_display,image_id,is_public_domain`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            return (data.data || [])
                .filter(a => a.image_id && a.is_public_domain)
                .map(a => ({
                    id: `artic-${a.id}`,
                    title: a.title || 'Untitled',
                    artist: a.artist_display || 'Unknown',
                    date: a.date_display || '',
                    imageUrl: `https://www.artic.edu/iiif/2/${a.image_id}/full/1200,/0/default.jpg`,
                    thumbnailUrl: `https://www.artic.edu/iiif/2/${a.image_id}/full/400,/0/default.jpg`,
                    source: 'Art Institute of Chicago'
                }));
        } catch (e) {
            log.warn('ARTIC search failed', { error: e.message });
            return [];
        }
    },

    async searchRijksmuseum(query, limit = 10) {
        const url = `https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&imgonly=true&ps=${limit}&q=${encodeURIComponent(query)}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            return (data.artObjects || [])
                .filter(a => a.webImage?.url)
                .map(a => ({
                    id: `rijks-${a.objectNumber}`,
                    title: a.title || 'Untitled',
                    artist: a.principalOrFirstMaker || 'Unknown',
                    date: '',
                    imageUrl: a.webImage.url,
                    thumbnailUrl: a.webImage.url,
                    source: 'Rijksmuseum'
                }));
        } catch (e) {
            log.warn('Rijksmuseum search failed', { error: e.message });
            return [];
        }
    },

    async searchClevelandMuseum(query, limit = 10) {
        const url = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query)}&has_image=1&limit=${limit}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            return (data.data || [])
                .filter(a => a.images?.web?.url)
                .map(a => ({
                    id: `cma-${a.id}`,
                    title: a.title || 'Untitled',
                    artist: a.creators?.[0]?.description || 'Unknown',
                    date: a.creation_date || '',
                    imageUrl: a.images.web.url,
                    thumbnailUrl: a.images.web.url,
                    source: 'Cleveland Museum of Art'
                }));
        } catch (e) {
            log.warn('Cleveland search failed', { error: e.message });
            return [];
        }
    },

    async searchHarvardArtMuseums(query, limit = 10) {
        const apiKey = process.env.HARVARD_API_KEY || '3ae93cb0-e tried-11e9-8a5f-c9e6a8b73a1d';
        const url = `https://api.harvardartmuseums.org/object?apikey=${apiKey}&q=${encodeURIComponent(query)}&hasimage=1&size=${limit}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            return (data.records || [])
                .filter(a => a.primaryimageurl)
                .map(a => ({
                    id: `harvard-${a.id}`,
                    title: a.title || 'Untitled',
                    artist: a.people?.[0]?.name || 'Unknown',
                    date: a.dated || '',
                    imageUrl: a.primaryimageurl,
                    thumbnailUrl: a.primaryimageurl,
                    source: 'Harvard Art Museums'
                }));
        } catch (e) {
            log.warn('Harvard search failed', { error: e.message });
            return [];
        }
    }
};

// Tool definitions for gpt-5-mini
const searchTools = [
    {
        type: 'function',
        function: {
            name: 'search_met_museum',
            description: 'Search The Metropolitan Museum of Art. Best for: diverse collection spanning 5000 years, European paintings, American art, Asian art, Egyptian art, medieval art.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search terms (artist name, artwork title, style, subject, period)' },
                    limit: { type: 'number', description: 'Max results (default 10)' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_art_institute_chicago',
            description: 'Search Art Institute of Chicago. Best for: Impressionism, Post-Impressionism, American art, modern art. Famous for Seurat, Monet, Hopper, Wood.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search terms' },
                    limit: { type: 'number', description: 'Max results (default 10)' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_rijksmuseum',
            description: 'Search Rijksmuseum Amsterdam. Best for: Dutch Golden Age, Rembrandt, Vermeer, Dutch Masters, 17th century Dutch painting.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search terms' },
                    limit: { type: 'number', description: 'Max results (default 10)' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_cleveland_museum',
            description: 'Search Cleveland Museum of Art. Best for: Asian art, European paintings, medieval art, African art. Strong encyclopedic collection.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search terms' },
                    limit: { type: 'number', description: 'Max results (default 10)' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_harvard_art_museums',
            description: 'Search Harvard Art Museums. Best for: academic collections, prints, drawings, photographs, Asian art, European art.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search terms' },
                    limit: { type: 'number', description: 'Max results (default 10)' }
                },
                required: ['query']
            }
        }
    }
];

class OpenAIAgentSearch {
    constructor() {
        this.client = null;
        this.initialized = false;
        this.model = 'gpt-5-mini'; // Fast, smart, and cost-effective for tool orchestration
    }

    async initialize() {
        if (this.initialized) return;

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            log.warn('OPENAI_API_KEY not set, using basic keyword search');
            this.initialized = true;
            return;
        }

        this.client = new OpenAI({ apiKey });
        this.initialized = true;
        log.info('OpenAI agent search initialized', { model: this.model });
    }

    /**
     * Agentic art search - AI orchestrates museum API searches in parallel
     */
    async searchByText(query, limit = 20) {
        await this.initialize();

        log.info('Agentic art search', { query, limit });

        // Fallback to basic search if no OpenAI
        if (!this.client) {
            return this._fallbackSearch(query, limit);
        }

        try {
            // Let AI decide which museums to search
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert art curator helping users discover artwork for their e-ink display.

Your task:
1. Understand what the user is looking for (mood, style, artist, period, subject)
2. Search the most relevant museums using the provided tools
3. Search 2-3 museums with appropriate queries to find diverse results
4. Return results that best match the user's intent

Consider:
- For Dutch masters → prioritize Rijksmuseum
- For Impressionism → prioritize Art Institute of Chicago
- For diverse/general queries → use Met Museum
- For Asian art → Cleveland or Harvard
- Vary your search terms to get diverse results`
                    },
                    {
                        role: 'user',
                        content: `Find artwork matching: "${query}". Return up to ${limit} results.`
                    }
                ],
                tools: searchTools,
                tool_choice: 'auto',
                max_tokens: 1000
            });

            // Execute tool calls IN PARALLEL for speed
            const toolCalls = response.choices[0]?.message?.tool_calls || [];

            const searchPromises = toolCalls.map(async (toolCall) => {
                const args = JSON.parse(toolCall.function.arguments);
                const searchLimit = args.limit || 10;

                const searchFn = {
                    'search_met_museum': museumSearchers.searchMetMuseum,
                    'search_art_institute_chicago': museumSearchers.searchArtInstituteChicago,
                    'search_rijksmuseum': museumSearchers.searchRijksmuseum,
                    'search_cleveland_museum': museumSearchers.searchClevelandMuseum,
                    'search_harvard_art_museums': museumSearchers.searchHarvardArtMuseums
                }[toolCall.function.name];

                if (!searchFn) return [];

                const results = await searchFn(args.query, searchLimit);
                log.debug('Tool call executed', {
                    tool: toolCall.function.name,
                    query: args.query,
                    results: results.length
                });
                return results;
            });

            // Wait for all searches to complete in parallel
            const resultsArrays = await Promise.all(searchPromises);
            const allResults = resultsArrays.flat();

            // If no tool calls, fallback
            if (allResults.length === 0) {
                log.debug('No tool calls made, using fallback');
                return this._fallbackSearch(query, limit);
            }

            // Deduplicate and limit
            const seen = new Set();
            const unique = allResults.filter(art => {
                const key = `${art.title}-${art.artist}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            log.info('Agentic search complete', {
                toolCalls: toolCalls.length,
                totalResults: unique.length
            });

            return unique.slice(0, limit).map(art => ({
                ...art,
                score: 0.9 // High confidence from agentic search
            }));

        } catch (error) {
            log.error('Agentic search failed', { error: error.message });
            return this._fallbackSearch(query, limit);
        }
    }

    /**
     * Find similar artworks based on an artwork's characteristics
     */
    async searchSimilar(artworkId, limit = 20) {
        await this.initialize();

        // Extract info from artwork ID format (e.g., "met-12345", "artic-678")
        const [source, id] = artworkId.split('-');

        // Build a query based on the artwork
        const similarQuery = `artwork similar to ${artworkId}`;

        if (this.client) {
            try {
                const response = await this.client.chat.completions.create({
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: `You are an art expert. Given an artwork ID, determine what similar artworks to search for.
Consider the likely artist, style, period, and subject matter based on the source museum and ID.
Search for artworks with similar characteristics.`
                        },
                        {
                            role: 'user',
                            content: `Find artworks similar to: ${artworkId} (from ${source}). Return ${limit} similar pieces.`
                        }
                    ],
                    tools: searchTools,
                    tool_choice: 'auto',
                    max_tokens: 500
                });

                // Execute searches IN PARALLEL
                const toolCalls = response.choices[0]?.message?.tool_calls || [];

                const searchPromises = toolCalls.map(async (toolCall) => {
                    const args = JSON.parse(toolCall.function.arguments);
                    const searchFn = {
                        'search_met_museum': museumSearchers.searchMetMuseum,
                        'search_art_institute_chicago': museumSearchers.searchArtInstituteChicago,
                        'search_rijksmuseum': museumSearchers.searchRijksmuseum,
                        'search_cleveland_museum': museumSearchers.searchClevelandMuseum,
                        'search_harvard_art_museums': museumSearchers.searchHarvardArtMuseums
                    }[toolCall.function.name];
                    return searchFn ? searchFn(args.query, args.limit || 10) : [];
                });

                const resultsArrays = await Promise.all(searchPromises);
                const allResults = resultsArrays.flat();

                // Filter out the source artwork
                const filtered = allResults.filter(a => a.id !== artworkId);
                return filtered.slice(0, limit).map(art => ({ ...art, score: 0.8 }));

            } catch (error) {
                log.error('Similar search failed', { error: error.message });
            }
        }

        return this._fallbackSearch(similarQuery, limit);
    }

    /**
     * Fallback to basic museum API search
     */
    async _fallbackSearch(query, limit) {
        log.debug('Using fallback search', { query });
        const result = await performArtSearch(query, limit);
        return (result.results || []).map(art => ({
            ...art,
            score: 0.5
        }));
    }

    /**
     * Get service statistics
     */
    async getStats() {
        return {
            model: this.model,
            type: 'agentic',
            museums: ['Met', 'ARTIC', 'Rijksmuseum', 'Cleveland', 'Harvard'],
            status: this.client ? 'active' : 'fallback_only'
        };
    }

    /**
     * Check if service is available
     */
    isAvailable() {
        return this.initialized;
    }
}

module.exports = new OpenAIAgentSearch();
