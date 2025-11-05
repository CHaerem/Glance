const {
    AutoTokenizer,
    CLIPTextModelWithProjection,
    CLIPVisionModelWithProjection,
    AutoProcessor,
    RawImage
} = require('@xenova/transformers');

/**
 * CLIP Embedding Service using Transformers.js
 * Local model - no API costs, works offline
 * Based on reference: artwork-similarity-search by Otman404
 */
class CLIPEmbeddingService {
    constructor() {
        this.textModel = null;
        this.visionModel = null;
        this.tokenizer = null;
        this.processor = null;
        this.model = 'Xenova/clip-vit-base-patch32'; // CLIP model (512 dimensions)
        this.initialized = false;
        this.initPromise = null;
    }

    /**
     * Initialize the CLIP model (auto-downloads on first run)
     * Model size: ~600MB (cached after first download)
     */
    async initialize() {
        if (this.initialized) return;

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = (async () => {
            try {
                console.log('Loading CLIP model (this may take a minute on first run)...');
                console.log('Model will be cached in ~/.cache/huggingface/');

                // Load tokenizer for text
                this.tokenizer = await AutoTokenizer.from_pretrained(this.model);

                // Load text model
                this.textModel = await CLIPTextModelWithProjection.from_pretrained(this.model);

                // Load vision processor and model
                this.processor = await AutoProcessor.from_pretrained(this.model);
                this.visionModel = await CLIPVisionModelWithProjection.from_pretrained(this.model);

                this.initialized = true;
                console.log('✓ CLIP model loaded and ready');
            } catch (error) {
                console.error('Failed to initialize CLIP model:', error);
                throw error;
            }
        })();

        return this.initPromise;
    }

    /**
     * Generate embedding for an image URL
     * @param {string} imageUrl - URL to artwork image
     * @returns {Promise<number[]>} 512-dimensional vector
     */
    async embedImage(imageUrl) {
        await this.initialize();

        try {
            console.log(`Generating embedding for image: ${imageUrl.substring(0, 60)}...`);

            // Load and process image
            const image = await RawImage.fromURL(imageUrl);

            // Preprocess image
            const image_inputs = await this.processor(image);

            // Generate embedding
            const { image_embeds } = await this.visionModel(image_inputs);

            // Convert to array and normalize
            const embedding = Array.from(image_embeds.data);

            // Normalize the embedding
            const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
            const normalized = embedding.map(val => val / magnitude);

            console.log(`✓ Generated image embedding (${normalized.length} dimensions)`);
            return normalized;

        } catch (error) {
            console.error('Image embedding error:', error.message);
            throw error;
        }
    }

    /**
     * Generate embedding for text query
     * @param {string} text - Natural language query
     * @returns {Promise<number[]>} 512-dimensional vector
     */
    async embedText(text) {
        await this.initialize();

        try {
            console.log(`Generating embedding for text: "${text}"`);

            // Tokenize text
            const text_inputs = await this.tokenizer(text, { padding: true, truncation: true });

            // Generate embedding
            const { text_embeds } = await this.textModel(text_inputs);

            // Convert to array and normalize
            const embedding = Array.from(text_embeds.data);

            // Normalize the embedding
            const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
            const normalized = embedding.map(val => val / magnitude);

            console.log(`✓ Generated text embedding (${normalized.length} dimensions)`);
            return normalized;

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
     * Check if model is ready
     * @returns {boolean}
     */
    isReady() {
        return this.initialized;
    }
}

module.exports = new CLIPEmbeddingService();
