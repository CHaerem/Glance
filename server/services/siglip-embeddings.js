const { HfInference } = require('@huggingface/inference');

/**
 * SigLIP 2 Embedding Service
 * Converts images and text into 768-dimensional vectors for semantic similarity
 */
class SigLIPService {
    constructor() {
        this.hf = null;
        this.model = 'google/siglip-base-patch16-224';
        this.initialized = false;
    }

    /**
     * Initialize the Hugging Face client
     */
    initialize() {
        if (this.initialized) return;

        const hfToken = process.env.HF_TOKEN;
        if (!hfToken) {
            console.warn('HF_TOKEN not set - SigLIP embeddings will not be available');
            return;
        }

        this.hf = new HfInference(hfToken);
        this.initialized = true;
        console.log('✓ SigLIP service initialized');
    }

    /**
     * Generate embedding for an image URL
     * @param {string} imageUrl - URL to artwork image
     * @returns {Promise<number[]>} 768-dimensional vector
     */
    async embedImage(imageUrl) {
        this.initialize();

        if (!this.initialized) {
            throw new Error('SigLIP service not initialized - HF_TOKEN required');
        }

        try {
            console.log(`Generating embedding for image: ${imageUrl.substring(0, 50)}...`);

            // Fetch image
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }

            const imageBlob = await response.blob();

            // Generate embedding using SigLIP
            const embedding = await this.hf.featureExtraction({
                model: this.model,
                data: imageBlob
            });

            // Convert to array if needed
            const embeddingArray = Array.isArray(embedding) ? embedding : Array.from(embedding);

            console.log(`✓ Generated embedding (${embeddingArray.length} dimensions)`);
            return embeddingArray;

        } catch (error) {
            console.error('Image embedding error:', error.message);
            throw error;
        }
    }

    /**
     * Generate embedding for text query
     * @param {string} text - Natural language query
     * @returns {Promise<number[]>} 768-dimensional vector
     */
    async embedText(text) {
        this.initialize();

        if (!this.initialized) {
            throw new Error('SigLIP service not initialized - HF_TOKEN required');
        }

        try {
            console.log(`Generating embedding for text: "${text}"`);

            const embedding = await this.hf.featureExtraction({
                model: this.model,
                data: text
            });

            // Convert to array if needed
            const embeddingArray = Array.isArray(embedding) ? embedding : Array.from(embedding);

            console.log(`✓ Generated text embedding (${embeddingArray.length} dimensions)`);
            return embeddingArray;

        } catch (error) {
            console.error('Text embedding error:', error.message);
            throw error;
        }
    }

    /**
     * Calculate cosine similarity between two embeddings
     * @param {number[]} embeddingA - First vector
     * @param {number[]} embeddingB - Second vector
     * @returns {number} Similarity score (0-1, higher = more similar)
     */
    cosineSimilarity(embeddingA, embeddingB) {
        if (embeddingA.length !== embeddingB.length) {
            throw new Error('Embeddings must have same dimension');
        }

        const dotProduct = embeddingA.reduce((sum, a, i) => sum + a * embeddingB[i], 0);
        const magA = Math.sqrt(embeddingA.reduce((sum, a) => sum + a * a, 0));
        const magB = Math.sqrt(embeddingB.reduce((sum, b) => sum + b * b, 0));

        if (magA === 0 || magB === 0) {
            return 0;
        }

        return dotProduct / (magA * magB);
    }

    /**
     * Find most similar artworks to a query embedding
     * @param {number[]} queryEmbedding - Vector to search for
     * @param {Array} artworkEmbeddings - Array of {id, embedding, ...} objects
     * @param {number} limit - Number of results
     * @returns {Array} Sorted array of artworks with similarity scores
     */
    findSimilar(queryEmbedding, artworkEmbeddings, limit = 20) {
        console.log(`Finding similar artworks (${artworkEmbeddings.length} candidates)`);

        // Calculate similarity for each artwork
        const scored = artworkEmbeddings.map(art => ({
            ...art,
            similarity: this.cosineSimilarity(queryEmbedding, art.embedding)
        }));

        // Sort by similarity (highest first)
        scored.sort((a, b) => b.similarity - a.similarity);

        const results = scored.slice(0, limit);
        console.log(`✓ Found ${results.length} similar artworks (top score: ${results[0]?.similarity?.toFixed(3)})`);

        return results;
    }

    /**
     * Check if service is available
     * @returns {boolean}
     */
    isAvailable() {
        return !!process.env.HF_TOKEN;
    }
}

module.exports = new SigLIPService();
