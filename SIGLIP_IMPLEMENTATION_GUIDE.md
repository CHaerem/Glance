# Using SigLIP 2 for Glance Art Similarity

## How SigLIP 2 Works for Glance

SigLIP 2 converts both **images** and **text** into the same 768-dimensional vector space. Artworks that are visually similar have vectors close together. Text descriptions also get vectors, so you can search images with natural language.

### The Magic: Everything Becomes Numbers

```
"Water Lilies" image    → [0.2, 0.8, -0.3, ...] (768 numbers)
"Monet landscape"       → [0.1, 0.9, -0.2, ...] (768 numbers)
"Beaded Bag" image      → [0.9, -0.5, 0.1, ...] (768 numbers)

Distance between Water Lilies and Monet: 0.05 (very similar!)
Distance between Water Lilies and Beaded Bag: 0.87 (very different!)
```

## Implementation for Glance

### Step 1: Install Dependencies

```bash
cd /Users/christopherhaerem/Privat/Glance/server
npm install @huggingface/inference
```

### Step 2: Create SigLIP Service

**File: `server/services/siglip-embeddings.js`**

```javascript
const { HfInference } = require('@huggingface/inference');

class SigLIPService {
    constructor() {
        this.hf = new HfInference(process.env.HF_TOKEN);
        this.model = 'google/siglip2-base-patch16-224';
    }

    /**
     * Generate embedding for an image URL
     * @param {string} imageUrl - URL to artwork image
     * @returns {Promise<number[]>} 768-dimensional vector
     */
    async embedImage(imageUrl) {
        try {
            // Fetch image
            const response = await fetch(imageUrl);
            const imageBlob = await response.blob();

            // Generate embedding
            const embedding = await this.hf.featureExtraction({
                model: this.model,
                data: imageBlob
            });

            return Array.from(embedding);
        } catch (error) {
            console.error('Image embedding error:', error);
            throw error;
        }
    }

    /**
     * Generate embedding for text query
     * @param {string} text - Natural language query
     * @returns {Promise<number[]>} 768-dimensional vector
     */
    async embedText(text) {
        try {
            const embedding = await this.hf.featureExtraction({
                model: this.model,
                data: text
            });

            return Array.from(embedding);
        } catch (error) {
            console.error('Text embedding error:', error);
            throw error;
        }
    }

    /**
     * Calculate similarity between two embeddings
     * @param {number[]} embeddingA - First vector
     * @param {number[]} embeddingB - Second vector
     * @returns {number} Similarity score (0-1, higher = more similar)
     */
    cosineSimilarity(embeddingA, embeddingB) {
        const dotProduct = embeddingA.reduce((sum, a, i) => sum + a * embeddingB[i], 0);
        const magA = Math.sqrt(embeddingA.reduce((sum, a) => sum + a * a, 0));
        const magB = Math.sqrt(embeddingB.reduce((sum, b) => sum + b * b, 0));
        return dotProduct / (magA * magB);
    }

    /**
     * Find most similar artworks to a query embedding
     * @param {number[]} queryEmbedding - Vector to search for
     * @param {Array} artworkEmbeddings - Array of {id, embedding} objects
     * @param {number} limit - Number of results
     * @returns {Array} Sorted array of {id, similarity} objects
     */
    findSimilar(queryEmbedding, artworkEmbeddings, limit = 20) {
        // Calculate similarity for each artwork
        const scored = artworkEmbeddings.map(art => ({
            id: art.id,
            similarity: this.cosineSimilarity(queryEmbedding, art.embedding)
        }));

        // Sort by similarity (highest first)
        scored.sort((a, b) => b.similarity - a.similarity);

        return scored.slice(0, limit);
    }
}

module.exports = new SigLIPService();
```

### Step 3: Database Schema

**File: `server/database/schema.sql`**

```sql
-- Artwork metadata and embeddings
CREATE TABLE IF NOT EXISTS artworks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    date TEXT,
    department TEXT,
    source TEXT,
    image_url TEXT,
    thumbnail_url TEXT,
    siglip_embedding BLOB,  -- 768 floats (768 * 4 bytes = 3KB per artwork)
    embedding_version TEXT DEFAULT 'siglip2-base',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist);
CREATE INDEX IF NOT EXISTS idx_artworks_source ON artworks(source);

-- User interactions for preference building
CREATE TABLE IF NOT EXISTS user_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork_id TEXT NOT NULL,
    action_type TEXT NOT NULL,  -- 'like', 'dislike', 'display', 'skip'
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artwork_id) REFERENCES artworks(id)
);

-- User taste profile (aggregated embedding)
CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    taste_embedding BLOB,  -- Average of liked artwork embeddings
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Step 4: Generate Embeddings for Artwork

**Add to `server/server.js`:**

```javascript
const siglip = require('./services/siglip-embeddings');
const db = require('better-sqlite3')('glance.db');

// When importing artwork from museums
async function importArtwork(artwork) {
    try {
        // Generate embedding for artwork image
        console.log(`Generating embedding for: ${artwork.title}`);
        const embedding = await siglip.embedImage(artwork.imageUrl);

        // Store artwork with embedding
        db.prepare(`
            INSERT OR REPLACE INTO artworks
            (id, title, artist, date, department, source, image_url, thumbnail_url, siglip_embedding)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            artwork.id,
            artwork.title,
            artwork.artist,
            artwork.date,
            artwork.department,
            artwork.source,
            artwork.imageUrl,
            artwork.thumbnailUrl,
            Buffer.from(new Float32Array(embedding).buffer)
        );

        console.log(`✓ Embedded: ${artwork.title}`);
    } catch (error) {
        console.error(`Failed to embed ${artwork.title}:`, error);
    }
}

// Batch process existing collection
async function generateEmbeddingsForCollection() {
    const artworks = db.prepare('SELECT * FROM artworks WHERE siglip_embedding IS NULL').all();

    console.log(`Generating embeddings for ${artworks.length} artworks...`);

    for (const artwork of artworks) {
        await importArtwork(artwork);
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
    }

    console.log('✓ All embeddings generated!');
}
```

### Step 5: Update Search API

**Replace smart-search with SigLIP search:**

```javascript
// Text-to-image search: "peaceful blue impressionist paintings"
app.post('/api/art/search-by-vibe', async (req, res) => {
    try {
        const { query } = req.body;

        console.log(`Visual search: "${query}"`);

        // 1. Convert text query to embedding
        const queryEmbedding = await siglip.embedText(query);

        // 2. Load all artwork embeddings from database
        const artworks = db.prepare(`
            SELECT id, title, artist, date, image_url, thumbnail_url, siglip_embedding
            FROM artworks
            WHERE siglip_embedding IS NOT NULL
        `).all();

        // Convert BLOB back to arrays
        const artworkEmbeddings = artworks.map(art => ({
            ...art,
            embedding: Array.from(new Float32Array(art.siglip_embedding.buffer))
        }));

        // 3. Find most similar artworks
        const results = siglip.findSimilar(queryEmbedding, artworkEmbeddings, 20);

        // 4. Enrich with full artwork data
        const enrichedResults = results.map(result => {
            const artwork = artworks.find(a => a.id === result.id);
            return {
                ...artwork,
                similarity: result.similarity,
                siglip_embedding: undefined  // Don't send embedding to client
            };
        });

        res.json({
            query,
            results: enrichedResults
        });

    } catch (error) {
        console.error('Visual search error:', error);
        res.status(500).json({ error: error.message });
    }
});
```

### Step 6: Update "More Like This"

**Visual similarity based on actual image content:**

```javascript
app.post('/api/art/similar-visual', async (req, res) => {
    try {
        const { artworkId } = req.body;

        // 1. Get source artwork's embedding
        const sourceArtwork = db.prepare(`
            SELECT * FROM artworks WHERE id = ?
        `).get(artworkId);

        if (!sourceArtwork || !sourceArtwork.siglip_embedding) {
            return res.status(404).json({ error: 'Artwork not found' });
        }

        const sourceEmbedding = Array.from(
            new Float32Array(sourceArtwork.siglip_embedding.buffer)
        );

        // 2. Find visually similar artworks
        const allArtworks = db.prepare(`
            SELECT id, title, artist, date, image_url, thumbnail_url, siglip_embedding
            FROM artworks
            WHERE id != ? AND siglip_embedding IS NOT NULL
        `).all(artworkId);

        const artworkEmbeddings = allArtworks.map(art => ({
            ...art,
            embedding: Array.from(new Float32Array(art.siglip_embedding.buffer))
        }));

        const results = siglip.findSimilar(sourceEmbedding, artworkEmbeddings, 20);

        // 3. Return results with similarity scores
        const enrichedResults = results.map(result => {
            const artwork = allArtworks.find(a => a.id === result.id);
            return {
                id: artwork.id,
                title: artwork.title,
                artist: artwork.artist,
                date: artwork.date,
                imageUrl: artwork.image_url,
                thumbnailUrl: artwork.thumbnail_url,
                similarity: result.similarity
            };
        });

        res.json({
            sourceArtwork: {
                title: sourceArtwork.title,
                artist: sourceArtwork.artist
            },
            results: enrichedResults
        });

    } catch (error) {
        console.error('Similar artwork error:', error);
        res.status(500).json({ error: error.message });
    }
});
```

### Step 7: User Preferences

**Build personalized recommendations:**

```javascript
// Track when user likes an artwork
app.post('/api/user/like', async (req, res) => {
    const { artworkId } = req.body;

    db.prepare(`
        INSERT INTO user_actions (artwork_id, action_type)
        VALUES (?, 'like')
    `).run(artworkId);

    // Update user taste profile
    await updateUserTasteProfile();

    res.json({ success: true });
});

// Calculate user's taste profile
async function updateUserTasteProfile() {
    // Get all liked artworks
    const likedArtworks = db.prepare(`
        SELECT a.siglip_embedding
        FROM artworks a
        JOIN user_actions ua ON a.id = ua.artwork_id
        WHERE ua.action_type = 'like'
        AND a.siglip_embedding IS NOT NULL
    `).all();

    if (likedArtworks.length === 0) return;

    // Convert to arrays
    const embeddings = likedArtworks.map(art =>
        Array.from(new Float32Array(art.siglip_embedding.buffer))
    );

    // Average all embeddings to create taste profile
    const tasteEmbedding = new Array(768).fill(0);
    for (const embedding of embeddings) {
        for (let i = 0; i < 768; i++) {
            tasteEmbedding[i] += embedding[i];
        }
    }
    for (let i = 0; i < 768; i++) {
        tasteEmbedding[i] /= embeddings.length;
    }

    // Store user taste profile
    db.prepare(`
        INSERT OR REPLACE INTO user_profile (id, taste_embedding, updated_at)
        VALUES (1, ?, CURRENT_TIMESTAMP)
    `).run(Buffer.from(new Float32Array(tasteEmbedding).buffer));
}

// Get personalized recommendations
app.get('/api/art/recommendations', async (req, res) => {
    try {
        // Get user taste profile
        const profile = db.prepare('SELECT taste_embedding FROM user_profile WHERE id = 1').get();

        if (!profile) {
            return res.json({ results: [] }); // No profile yet
        }

        const tasteEmbedding = Array.from(new Float32Array(profile.taste_embedding.buffer));

        // Get artworks not recently shown
        const allArtworks = db.prepare(`
            SELECT id, title, artist, date, image_url, thumbnail_url, siglip_embedding
            FROM artworks
            WHERE siglip_embedding IS NOT NULL
            AND id NOT IN (
                SELECT artwork_id FROM user_actions
                WHERE timestamp > datetime('now', '-7 days')
            )
        `).all();

        const artworkEmbeddings = allArtworks.map(art => ({
            ...art,
            embedding: Array.from(new Float32Array(art.siglip_embedding.buffer))
        }));

        // Find artworks similar to user's taste
        const results = siglip.findSimilar(tasteEmbedding, artworkEmbeddings, 20);

        res.json({
            results: results.map(r => {
                const artwork = allArtworks.find(a => a.id === r.id);
                return {
                    id: artwork.id,
                    title: artwork.title,
                    artist: artwork.artist,
                    imageUrl: artwork.image_url,
                    matchScore: r.similarity
                };
            })
        });

    } catch (error) {
        console.error('Recommendations error:', error);
        res.status(500).json({ error: error.message });
    }
});
```

## Usage Examples

### Example 1: Text-to-Image Search

```bash
curl -X POST http://localhost:3000/api/art/search-by-vibe \
  -H "Content-Type: application/json" \
  -d '{"query": "peaceful blue impressionist landscape with water"}'
```

**Result:** Returns actual Monet water lilies, Pissarro landscapes, etc.

### Example 2: More Like This

```bash
curl -X POST http://localhost:3000/api/art/similar-visual \
  -H "Content-Type: application/json" \
  -d '{"artworkId": "monet-water-lilies-1906"}'
```

**Result:** Returns visually similar Impressionist landscapes, not random crafts!

### Example 3: Personalized Recommendations

```bash
# User likes some artworks
curl -X POST http://localhost:3000/api/user/like \
  -d '{"artworkId": "monet-water-lilies"}'

curl -X POST http://localhost:3000/api/user/like \
  -d '{"artworkId": "hokusai-great-wave"}'

# Get recommendations based on taste
curl http://localhost:3000/api/art/recommendations
```

**Result:** Returns art similar to peaceful blue paintings + Japanese art

## Frontend Integration

**Update `public/js/main.js`:**

```javascript
// Replace searchArt() function
async function searchArt() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    const grid = document.getElementById('artGrid');
    grid.innerHTML = '<div class="loading">Searching with visual AI...</div>';

    try {
        // Use SigLIP visual search
        const response = await fetch('/api/art/search-by-vibe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const data = await response.json();
        currentArtResults = data.results || [];
        displayArtResults();
    } catch (error) {
        console.error('Search failed:', error);
        grid.innerHTML = '<div class="loading">Search failed</div>';
    }
}

// Replace findSimilarArt() function
async function findSimilarArt() {
    if (!selectedModalArt) return;

    closeModal();
    switchMode('explore');

    const grid = document.getElementById('artGrid');
    grid.innerHTML = '<div class="loading">Finding visually similar artworks...</div>';

    try {
        const response = await fetch('/api/art/similar-visual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ artworkId: selectedModalArt.id })
        });

        const data = await response.json();
        currentArtResults = data.results || [];
        displayArtResults();
    } catch (error) {
        console.error('Similar search failed:', error);
        grid.innerHTML = '<div class="loading">Search failed</div>';
    }
}
```

## Performance & Cost

### One-time Setup
- Generate embeddings for 10,000 artworks
- Time: ~30 minutes (at 5 artworks/sec)
- Cost: ~$1-2 (Hugging Face API)

### Ongoing Usage
- Search: ~200ms (local vector comparison)
- Cost: $0 after initial embedding generation
- No API calls for similarity search!

### Storage
- 10,000 artworks × 3KB per embedding = 30MB
- Tiny compared to image storage

## Migration Path

### Phase 1: Hugging Face API (This week)
✓ Quick to implement
✓ Validate it works well
✓ Low initial cost

### Phase 2: Local SigLIP (Next month)
✓ Download model to Raspberry Pi
✓ Zero ongoing API costs
✓ Faster inference
✓ Works offline

```bash
# Install Transformers.js for local inference
npm install @xenova/transformers

# Use local model
const { pipeline } = require('@xenova/transformers');
const extractor = await pipeline('feature-extraction',
    'Xenova/siglip-base-patch16-224');
```

## Next Steps

1. **Today**: Create Hugging Face account (free tier)
2. **Tomorrow**: Implement SigLIP service
3. **Day 3**: Generate embeddings for curated collection
4. **Day 4**: Test search quality vs current system
5. **Week 2**: Roll out to production

Ready to implement?
