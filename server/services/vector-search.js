const { QdrantClient } = require('@qdrant/js-client-rest');
const clipEmbeddings = require('./clip-embeddings');
const crypto = require('crypto');

/**
 * Vector Search Service
 * Simple architecture following artwork-similarity-search reference
 */
class VectorSearchService {
    constructor() {
        this.client = null;
        this.collectionName = 'artworks';
        this.vectorSize = 512; // CLIP vector dimension
        this.initialized = false;
    }

    /**
     * Initialize Qdrant client and ensure collection exists
     */
    async initialize() {
        if (this.initialized) return;

        const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';

        try {
            console.log(`Connecting to Qdrant at ${qdrantUrl}...`);
            this.client = new QdrantClient({ url: qdrantUrl });

            // Check if collection exists
            const collections = await this.client.getCollections();
            const collectionExists = collections.collections.some(
                c => c.name === this.collectionName
            );

            if (!collectionExists) {
                console.log(`Creating collection: ${this.collectionName}`);
                await this.client.createCollection(this.collectionName, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    }
                });
                console.log('✓ Collection created');
            } else {
                console.log('✓ Collection already exists');
            }

            this.initialized = true;
            console.log('✓ Vector search service ready');

        } catch (error) {
            console.error('Failed to initialize Qdrant:', error.message);
            console.error('Make sure Qdrant is running: docker run -p 6333:6333 qdrant/qdrant');
            throw error;
        }
    }

    /**
     * Generate a deterministic UUID from an artwork ID
     * This ensures the same artwork always gets the same UUID
     */
    generatePointId(artworkId) {
        // Create a UUID v5 using artwork ID
        const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard DNS namespace UUID
        return crypto.createHash('sha1')
            .update(namespace + artworkId)
            .digest('hex')
            .substring(0, 32)
            .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }

    /**
     * Index an artwork (generate embedding and store in Qdrant)
     * @param {Object} artwork - Artwork metadata
     * @param {string} artwork.id - Unique artwork ID
     * @param {string} artwork.imageUrl - URL to artwork image
     * @param {string} artwork.title - Artwork title
     * @param {string} artwork.artist - Artist name
     * @param {string} artwork.date - Creation date
     * @param {string} artwork.source - Source/museum
     */
    async indexArtwork(artwork) {
        await this.initialize();
        await clipEmbeddings.initialize();

        try {
            console.log(`Indexing artwork: ${artwork.title} by ${artwork.artist}`);

            // Generate embedding for artwork image
            const embedding = await clipEmbeddings.embedImage(artwork.imageUrl);

            // Generate UUID for Qdrant (required format)
            const pointId = this.generatePointId(artwork.id);

            // Store in Qdrant
            await this.client.upsert(this.collectionName, {
                wait: true,
                points: [
                    {
                        id: pointId,
                        vector: embedding,
                        payload: {
                            artworkId: artwork.id, // Store original ID in payload
                            title: artwork.title,
                            artist: artwork.artist || 'Unknown',
                            date: artwork.date || '',
                            source: artwork.source || '',
                            imageUrl: artwork.imageUrl,
                            thumbnailUrl: artwork.thumbnailUrl || artwork.imageUrl
                        }
                    }
                ]
            });

            console.log(`✓ Indexed: ${artwork.title}`);

        } catch (error) {
            console.error(`Failed to index ${artwork.title}:`, error.message);
            console.error('Full error:', error);
            throw error;
        }
    }

    /**
     * Search for similar artworks using text query
     * @param {string} query - Natural language search query
     * @param {number} limit - Number of results to return
     * @returns {Promise<Array>} Array of similar artworks with scores
     */
    async searchByText(query, limit = 20) {
        await this.initialize();
        await clipEmbeddings.initialize();

        try {
            console.log(`Text search: "${query}"`);

            // Generate embedding for query text
            const queryEmbedding = await clipEmbeddings.embedText(query);

            // Search Qdrant
            const results = await this.client.search(this.collectionName, {
                vector: queryEmbedding,
                limit: limit,
                with_payload: true
            });

            console.log(`✓ Found ${results.length} results (top score: ${results[0]?.score?.toFixed(3)})`);

            return results.map(hit => ({
                id: hit.payload.artworkId || hit.id, // Use artworkId from payload
                score: hit.score,
                ...hit.payload
            }));

        } catch (error) {
            console.error('Text search error:', error.message);
            throw error;
        }
    }

    /**
     * Find visually similar artworks to a given artwork ID
     * @param {string} artworkId - ID of source artwork
     * @param {number} limit - Number of results to return
     * @returns {Promise<Array>} Array of similar artworks with scores
     */
    async searchSimilar(artworkId, limit = 20) {
        await this.initialize();

        try {
            console.log(`Finding similar to artwork ID: ${artworkId}`);

            // Convert artwork ID to Qdrant point ID (UUID)
            const pointId = this.generatePointId(artworkId);

            // Get the source artwork's vector
            const sourceArtwork = await this.client.retrieve(this.collectionName, {
                ids: [pointId],
                with_vector: true
            });

            if (!sourceArtwork || sourceArtwork.length === 0) {
                throw new Error('Artwork not found');
            }

            const sourceVector = sourceArtwork[0].vector;

            // Search for similar vectors
            const results = await this.client.search(this.collectionName, {
                vector: sourceVector,
                limit: limit + 1, // +1 because source will be included
                with_payload: true
            });

            // Filter out the source artwork itself
            const filtered = results.filter(hit => hit.payload.artworkId !== artworkId);

            console.log(`✓ Found ${filtered.length} similar artworks`);

            return filtered.slice(0, limit).map(hit => ({
                id: hit.payload.artworkId || hit.id,
                score: hit.score,
                ...hit.payload
            }));

        } catch (error) {
            console.error('Similar search error:', error.message);
            throw error;
        }
    }

    /**
     * Get collection statistics
     * @returns {Promise<Object>} Collection stats
     */
    async getStats() {
        await this.initialize();

        try {
            const info = await this.client.getCollection(this.collectionName);
            return {
                totalArtworks: info.points_count,
                vectorSize: this.vectorSize,
                model: 'CLIP ViT-B/32'
            };
        } catch (error) {
            console.error('Stats error:', error.message);
            return {
                totalArtworks: 0,
                vectorSize: this.vectorSize,
                model: 'CLIP ViT-B/32',
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
}

module.exports = new VectorSearchService();
