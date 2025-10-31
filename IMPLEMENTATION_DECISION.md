# Glance AI Art Search - Implementation Decision

Based on comprehensive research, here are the concrete decisions and implementation plan.

## Research Validation ✓

Your research confirms the state-of-the-art approach:

✅ **Embedding-based search** is the solution (not keyword matching)
✅ **SigLIP 2 / Jina-CLIP v2** outperform original CLIP (2021)
✅ **Vector databases** enable fast similarity search at scale
✅ **Taste profiling** via averaged embeddings is proven approach
✅ **Hybrid deployment** (pre-compute + local search) works on Raspberry Pi

## Architecture Decisions

### Decision 1: Which Model?

**Recommendation: SigLIP 2** (`google/siglip2-base-patch16-224`)

**Rationale:**
- ✅ Released Feb 2025 (newest)
- ✅ "Outperforms at all scales" per your research
- ✅ 768 dimensions (richer than CLIP's 512)
- ✅ Already used in WikiArt models (proven for art)
- ✅ Free on Hugging Face
- ✅ Open-source, well-documented

**Alternative:** Jina-CLIP v2
- Pros: 98% Flickr30k accuracy, excellent multilingual
- Cons: Larger (0.9B params), may be slower on Pi
- Use case: If multilingual support is critical

**Decision: Start with SigLIP 2, can upgrade to Jina-CLIP v2 if needed**

### Decision 2: Which Vector Database?

**Recommendation: Qdrant** (self-hosted)

**Rationale:**
- ✅ Purpose-built for vector search (not an extension)
- ✅ Excellent performance on modest hardware
- ✅ Clean REST API + Node.js client
- ✅ Free and open-source
- ✅ Proven in artwork-similarity-search project
- ✅ Runs in Docker on Raspberry Pi
- ✅ Supports hybrid search (vectors + metadata filters)

**Comparison:**

| Database | Pros | Cons | Best For |
|----------|------|------|----------|
| **Qdrant** | Fast, purpose-built, great API | New dependency | Production |
| SQLite + VSS | Familiar, simple, no new tools | Extension setup, slower | Prototyping |
| PostgreSQL + pgVector | Battle-tested, mature | Heavier, overkill for 10K | Large scale |
| Pinecone | Managed, zero setup | $70+/mo, internet required | Enterprise |

**Decision: Qdrant for production, SQLite+VSS for quick testing**

### Decision 3: Implementation Approach?

**Recommendation: Hybrid - Adapt + Build**

**Phase 1: Quick Validation (Week 1)**
- Clone `artwork-similarity-search` by Otman404
- Replace with Glance data
- Validate SigLIP 2 + Qdrant works well
- Measure search quality on your art collection

**Phase 2: Custom Integration (Week 2-3)**
- Extract learnings from Phase 1
- Build clean integration into Glance
- Add user preference tracking
- Implement personalized recommendations

**Rationale:**
- ✅ Learn from working code (de-risk)
- ✅ Validate approach quickly (1 week)
- ✅ Build production system properly (custom)
- ✅ Don't waste time on solved problems

### Decision 4: Deployment Strategy?

**Recommendation: Hybrid (Pre-compute + Local)**

**Architecture:**
```
┌─────────────────────────────────────────────────────┐
│ One-Time Setup (on powerful machine or API)        │
│                                                     │
│ 10K artworks → SigLIP 2 API → Generate embeddings  │
│                                 ↓                   │
│                          Store in Qdrant           │
│                          (~30MB data)              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Runtime (on Raspberry Pi)                           │
│                                                     │
│ User query → SigLIP 2 (local) → Query embedding    │
│               ↓                                     │
│          Qdrant vector search (local, <50ms)       │
│               ↓                                     │
│          Return similar artworks                   │
└─────────────────────────────────────────────────────┘
```

**Cost Analysis:**
- One-time: 10K embeddings via HF API = ~$1-2
- Runtime: $0/month (all local)
- Query speed: <200ms on Raspberry Pi 4

**Rationale:**
- ✅ Zero ongoing costs
- ✅ Fast local queries
- ✅ Works offline
- ✅ Scales to 100K+ artworks

## Implementation Plan

### Week 1: Rapid Validation

**Day 1-2: Setup & Clone**
```bash
# Clone reference implementation
git clone https://github.com/Otman404/artwork-similarity-search
cd artwork-similarity-search

# Install dependencies
pip install -r requirements.txt

# Start Qdrant in Docker
docker run -p 6333:6333 qdrant/qdrant

# Test with sample artworks
python embed_artworks.py --model google/siglip2-base-patch16-224
```

**Day 3-4: Test with Glance Data**
- Export 100 artworks from Glance curated collection
- Generate SigLIP 2 embeddings
- Upload to Qdrant
- Test search quality:
  - "peaceful blue impressionist paintings"
  - "dramatic renaissance portraits"
  - Visual similarity on Water Lilies

**Day 5: Measure & Document**
- Measure search relevance (target: 85%+ in top-5)
- Measure query speed (target: <500ms)
- Document findings in comparison to current system

**Deliverable:** Validation report confirming approach works

### Week 2: Glance Integration (Backend)

**Day 1: Project Structure**
```
server/
├── services/
│   ├── embedding-service.js      # SigLIP 2 wrapper
│   └── vector-db.js               # Qdrant client
├── models/
│   └── artwork.js                 # Artwork model with embeddings
├── routes/
│   ├── search.js                  # Embedding-based search API
│   └── recommendations.js         # Personalized recommendations
└── scripts/
    └── generate-embeddings.js     # Batch embedding generation
```

**Day 2-3: Core Services**

File: `server/services/embedding-service.js`
```javascript
const { HfInference } = require('@huggingface/inference');

class EmbeddingService {
    constructor() {
        this.hf = new HfInference(process.env.HF_TOKEN);
        this.model = 'google/siglip2-base-patch16-224';
    }

    async embedImage(imageUrl) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const embedding = await this.hf.featureExtraction({
            model: this.model,
            data: blob
        });
        return Array.from(embedding);
    }

    async embedText(query) {
        const embedding = await this.hf.featureExtraction({
            model: this.model,
            data: query
        });
        return Array.from(embedding);
    }
}

module.exports = new EmbeddingService();
```

File: `server/services/vector-db.js`
```javascript
const { QdrantClient } = require('@qdrant/js-client-rest');

class VectorDatabase {
    constructor() {
        this.client = new QdrantClient({
            url: process.env.QDRANT_URL || 'http://localhost:6333'
        });
        this.collectionName = 'artworks';
    }

    async createCollection() {
        await this.client.createCollection(this.collectionName, {
            vectors: {
                size: 768,  // SigLIP 2 dimensions
                distance: 'Cosine'
            }
        });
    }

    async upsertArtwork(artworkId, embedding, metadata) {
        await this.client.upsert(this.collectionName, {
            points: [{
                id: artworkId,
                vector: embedding,
                payload: metadata  // title, artist, date, etc.
            }]
        });
    }

    async search(queryEmbedding, limit = 20, filters = null) {
        const results = await this.client.search(this.collectionName, {
            vector: queryEmbedding,
            limit,
            filter: filters,
            with_payload: true
        });
        return results;
    }
}

module.exports = new VectorDatabase();
```

**Day 4-5: API Endpoints**

File: `server/routes/search.js`
```javascript
const express = require('express');
const router = express.Router();
const embeddingService = require('../services/embedding-service');
const vectorDb = require('../services/vector-db');

// Text-to-image search
router.post('/search', async (req, res) => {
    try {
        const { query } = req.body;

        // Generate embedding for text query
        const queryEmbedding = await embeddingService.embedText(query);

        // Find similar artworks
        const results = await vectorDb.search(queryEmbedding, 20);

        res.json({
            query,
            results: results.map(r => ({
                id: r.id,
                score: r.score,
                ...r.payload
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Visual similarity search (More Like This)
router.post('/similar', async (req, res) => {
    try {
        const { artworkId } = req.body;

        // Get artwork's embedding from Qdrant
        const artwork = await vectorDb.client.retrieve(
            vectorDb.collectionName,
            { ids: [artworkId], with_vector: true }
        );

        if (!artwork.length) {
            return res.status(404).json({ error: 'Artwork not found' });
        }

        // Find similar artworks (exclude original)
        const results = await vectorDb.search(artwork[0].vector, 21);
        const filtered = results.filter(r => r.id !== artworkId).slice(0, 20);

        res.json({
            sourceArtwork: artwork[0].payload,
            results: filtered.map(r => ({
                id: r.id,
                similarity: r.score,
                ...r.payload
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
```

### Week 3: User Preferences & Frontend

**Day 1-2: User Preference System**

File: `server/routes/recommendations.js`
```javascript
const express = require('express');
const router = express.Router();
const vectorDb = require('../services/vector-db');

// Track user like/dislike
router.post('/user/action', async (req, res) => {
    const { artworkId, action } = req.body;  // action: 'like', 'dislike', 'display'

    // Store in database
    await db.query(
        'INSERT INTO user_actions (artwork_id, action_type) VALUES (?, ?)',
        [artworkId, action]
    );

    // Update taste profile
    await updateUserTasteProfile();

    res.json({ success: true });
});

// Calculate user taste profile
async function updateUserTasteProfile() {
    // Get all liked artworks
    const likedIds = await db.query(`
        SELECT artwork_id FROM user_actions
        WHERE action_type = 'like'
        ORDER BY timestamp DESC
        LIMIT 50
    `);

    // Get their embeddings from Qdrant
    const artworks = await vectorDb.client.retrieve(
        vectorDb.collectionName,
        { ids: likedIds.map(r => r.artwork_id), with_vector: true }
    );

    // Average embeddings to create taste vector
    const tasteVector = new Array(768).fill(0);
    for (const artwork of artworks) {
        for (let i = 0; i < 768; i++) {
            tasteVector[i] += artwork.vector[i];
        }
    }
    for (let i = 0; i < 768; i++) {
        tasteVector[i] /= artworks.length;
    }

    // Store taste profile
    await db.query(
        'UPDATE user_profile SET taste_embedding = ? WHERE id = 1',
        [JSON.stringify(tasteVector)]
    );
}

// Get personalized recommendations
router.get('/recommendations', async (req, res) => {
    try {
        // Get user taste profile
        const profile = await db.query('SELECT taste_embedding FROM user_profile WHERE id = 1');

        if (!profile.length) {
            return res.json({ results: [] });
        }

        const tasteVector = JSON.parse(profile[0].taste_embedding);

        // Find artworks similar to taste
        const results = await vectorDb.search(tasteVector, 20);

        res.json({
            results: results.map(r => ({
                id: r.id,
                matchScore: r.score,
                ...r.payload
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
```

**Day 3-5: Frontend Integration**

Update `public/js/main.js`:
- Replace `searchArt()` to call `/api/search`
- Replace `findSimilarArt()` to call `/api/similar`
- Add like button to artworks
- Add "Recommended for You" section

### Week 4: Production Deployment

**Day 1-2: Batch Embedding Generation**
```javascript
// scripts/generate-embeddings.js
const embeddingService = require('../services/embedding-service');
const vectorDb = require('../services/vector-db');
const db = require('../database');

async function generateAllEmbeddings() {
    const artworks = await db.query('SELECT * FROM artworks');

    console.log(`Generating embeddings for ${artworks.length} artworks...`);

    for (let i = 0; i < artworks.length; i++) {
        const artwork = artworks[i];
        console.log(`[${i+1}/${artworks.length}] ${artwork.title}`);

        try {
            // Generate embedding
            const embedding = await embeddingService.embedImage(artwork.image_url);

            // Store in Qdrant
            await vectorDb.upsertArtwork(artwork.id, embedding, {
                title: artwork.title,
                artist: artwork.artist,
                date: artwork.date,
                imageUrl: artwork.image_url,
                thumbnailUrl: artwork.thumbnail_url
            });

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`Failed: ${artwork.title}`, error);
        }
    }

    console.log('✓ All embeddings generated!');
}

generateAllEmbeddings();
```

**Day 3: Optimize for Raspberry Pi**
- Set up Qdrant on Pi with Docker
- Test query performance
- Optimize memory usage
- Set up monitoring

**Day 4-5: Testing & Documentation**
- End-to-end testing
- Performance benchmarks
- User guide
- Deployment documentation

## Success Metrics

**Search Quality (measured on test queries):**
- Target: 85%+ relevance in top-5 results
- Current baseline: ~50% after filtering

**Performance:**
- Target: <500ms query time on Raspberry Pi
- Current baseline: ~2s with GPT-4 API

**Cost:**
- Target: $0/month after initial setup
- Current baseline: $1-2/month

**User Satisfaction (qualitative):**
- "Peaceful blue" returns actually peaceful blue art
- "More Like This" returns visually similar pieces
- Recommendations match user taste after 10+ likes

## Risk Mitigation

**Risk 1: Model too slow on Raspberry Pi**
- Mitigation: Use quantized model (INT8)
- Fallback: Keep query encoding on external API, local search only

**Risk 2: Qdrant memory usage too high**
- Mitigation: Qdrant optimizes for memory automatically
- Fallback: Use SQLite + VSS extension (lighter)

**Risk 3: Embedding quality not good enough**
- Mitigation: Test multiple models (SigLIP 2, Jina-CLIP v2)
- Fallback: Hybrid with current GPT-4 filtering

**Risk 4: Integration complexity**
- Mitigation: Phase 1 validation de-risks approach
- Fallback: Use simpler architecture (SQLite only)

## Next Steps

**Immediate (Today):**
1. ✅ Research completed - Decision document created
2. ⬜ Set up Hugging Face account (free)
3. ⬜ Start Qdrant in Docker locally
4. ⬜ Clone artwork-similarity-search for reference

**This Week:**
1. ⬜ Phase 1 validation with 100 artworks
2. ⬜ Measure search quality vs current system
3. ⬜ Decision: Proceed with full implementation?

**Next 2 Weeks:**
1. ⬜ Build Glance integration
2. ⬜ Implement user preferences
3. ⬜ Deploy to Raspberry Pi

**Decision Point:** After Week 1 validation, confirm this approach improves search quality enough to justify implementation effort.

---

**Ready to start implementation? The research is done, the path is clear.**
