# Glance AI Search Improvements

## Current Issues (From Testing)

1. **Query duplication** - Fixed ✓
2. **Poor semantic understanding** - "peaceful blue" doesn't filter results
3. **Irrelevant similarity results** - "Water Lilies" → "Beaded Bag"
4. **No result quality filtering**
5. **No personalization or learning**

## Proposed Architecture

### Phase 1: Quick Wins (Immediate)

#### 1.1 Add AI Result Filtering ✓
After getting search results, use GPT-4 to validate relevance:

```javascript
// Filter results through AI
const filteredResults = await filterResultsWithAI(
    results,
    originalQuery,
    extractedParams
);
```

**Cost**: ~$0.002 per search (minimal)
**Impact**: High - removes obviously wrong results

#### 1.2 Switch to GPT-4 Turbo
- Current: `gpt-4` (expensive, slower)
- Proposed: `gpt-4-turbo-preview` (10x cheaper, faster)
- Cost: $0.01 → $0.001 per request

#### 1.3 Add Result Re-ranking
Sort results by relevance score from AI filtering.

### Phase 2: Embedding-Based Similarity (Short-term)

#### 2.1 Model Selection

**Text Embeddings:**
- **OpenAI `text-embedding-3-small`** (Recommended)
  - Dimensions: 1536
  - Cost: $0.02 / 1M tokens (~$0.0001 per artwork)
  - Performance: Excellent for semantic similarity
  - Speed: Fast

Alternative:
- **OpenAI `text-embedding-3-large`**
  - Dimensions: 3072
  - Cost: $0.13 / 1M tokens
  - Use case: If small doesn't work well

**Why embeddings?**
- Semantic similarity instead of keyword matching
- "peaceful blue landscape" finds similar vibes, not just keywords
- Works across languages and synonyms

#### 2.2 Architecture

```
Artwork → Generate description → Embed → Store in DB
                                           ↓
User query → Embed → Find nearest vectors → Return similar art
```

**Storage:**
- SQLite with vector extension (`sqlite-vss`) for local deployment
- Or PostgreSQL with `pgvector` for cloud

**Implementation:**
```javascript
// Generate embeddings for artwork
async function embedArtwork(artwork) {
    const description = `${artwork.title} by ${artwork.artist}.
        ${artwork.department}. ${artwork.date}.
        Style: ${artwork.style || 'unknown'}.`;

    const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: description
    });

    return embedding.data[0].embedding;
}

// Find similar artworks
async function findSimilarByEmbedding(artworkId) {
    const embedding = await getEmbedding(artworkId);
    return db.query(`
        SELECT *, vector_distance(embedding, ?) as similarity
        FROM artworks
        ORDER BY similarity
        LIMIT 20
    `, [embedding]);
}
```

### Phase 3: User Preferences & Personalization (Medium-term)

#### 3.1 Database Schema

**SQLite Schema:**

```sql
-- Core artwork metadata
CREATE TABLE artworks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    date TEXT,
    department TEXT,
    source TEXT,
    image_url TEXT,
    thumbnail_url TEXT,
    embedding BLOB,  -- 1536 floats for text-embedding-3-small
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User interactions
CREATE TABLE user_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork_id TEXT NOT NULL,
    action_type TEXT NOT NULL,  -- 'view', 'like', 'dislike', 'display', 'skip'
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artwork_id) REFERENCES artworks(id)
);

-- User preference profile
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY,
    preference_embedding BLOB,  -- Aggregated taste vector
    favorite_artists TEXT,      -- JSON array
    favorite_styles TEXT,       -- JSON array
    favorite_periods TEXT,      -- JSON array
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Search history
CREATE TABLE search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    extracted_params TEXT,  -- JSON
    results_count INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Display history (what's been shown on e-ink)
CREATE TABLE display_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork_id TEXT NOT NULL,
    displayed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_rating INTEGER,  -- 1-5 stars, or NULL
    FOREIGN KEY (artwork_id) REFERENCES artworks(id)
);
```

#### 3.2 Personalization Algorithm

**Building User Taste Profile:**

```javascript
// Calculate user's preference vector from their interactions
async function updateUserPreferenceEmbedding() {
    // Get user's liked/displayed artworks
    const likedArtworks = await db.query(`
        SELECT a.embedding
        FROM artworks a
        JOIN user_actions ua ON a.id = ua.artwork_id
        WHERE ua.action_type IN ('like', 'display')
        AND ua.timestamp > datetime('now', '-90 days')
    `);

    // Average embeddings to create taste profile
    const tasteVector = averageEmbeddings(
        likedArtworks.map(a => a.embedding)
    );

    await db.query(`
        UPDATE user_preferences
        SET preference_embedding = ?, updated_at = CURRENT_TIMESTAMP
    `, [tasteVector]);
}

// Personalized recommendations
async function getPersonalizedRecommendations(limit = 20) {
    const userPreference = await getUserPreferenceEmbedding();

    // Find artworks similar to user's taste profile
    return db.query(`
        SELECT *,
               vector_distance(embedding, ?) as similarity,
               (SELECT COUNT(*) FROM user_actions
                WHERE artwork_id = a.id
                AND timestamp > datetime('now', '-30 days')) as recent_views
        FROM artworks a
        WHERE recent_views = 0  -- Don't show recently viewed
        ORDER BY similarity ASC
        LIMIT ?
    `, [userPreference, limit]);
}
```

#### 3.3 Smart Features

**1. Novelty vs Familiarity Balance**
```javascript
// Mix familiar styles with new discoveries
const recommendations = [
    ...await getPersonalizedRecommendations(12),  // 60% familiar
    ...await getExplorationRecommendations(8)     // 40% discovery
];
```

**2. Mood-Based Selection**
```javascript
// User can set mood for display rotation
await setDisplayMood('peaceful');  // Uses mood embeddings
```

**3. Artist Discovery**
```javascript
// If user likes Monet, suggest Pissarro, Renoir
async function discoverSimilarArtists(favoriteArtist) {
    const artistEmbedding = await getArtistStyleEmbedding(favoriteArtist);
    return findSimilarArtists(artistEmbedding);
}
```

**4. Collection Analytics**
```javascript
// Show user their taste breakdown
{
    "topStyles": ["Impressionism 45%", "Japanese Art 20%", "Abstract 15%"],
    "topArtists": ["Monet", "Hokusai", "Kandinsky"],
    "topPeriods": ["1870-1920", "Edo Period"],
    "colorPreferences": ["blue 35%", "green 25%", "earth tones 20%"]
}
```

### Phase 4: Advanced AI (Long-term)

#### 4.1 GPT-4 Vision for Image Analysis
- Analyze actual artwork images
- Extract visual features (composition, color palette, mood)
- Better similarity matching based on visual content

#### 4.2 Multi-Modal Embeddings
- Combine text and image embeddings
- CLIP model for image understanding
- Match artworks by visual similarity, not just metadata

#### 4.3 Collaborative Filtering
- If multiple users, learn from collective preferences
- "Users who liked Monet also liked..."

## Implementation Plan

### Week 1: Quick Wins
- [x] Fix query duplication
- [ ] Add AI result filtering
- [ ] Switch to GPT-4 Turbo
- [ ] Test and validate improvements

### Week 2-3: Embeddings
- [ ] Set up SQLite with vector support
- [ ] Generate embeddings for curated collection
- [ ] Implement embedding-based similarity search
- [ ] Migrate existing searches to use embeddings

### Week 4-5: User Preferences
- [ ] Design and create database schema
- [ ] Implement user action tracking
- [ ] Build preference profile calculation
- [ ] Add personalized recommendations API

### Week 6+: Advanced Features
- [ ] Mood-based filtering
- [ ] Artist discovery
- [ ] Collection analytics dashboard
- [ ] GPT-4 Vision integration (optional)

## Cost Analysis

**Current (per month, 1000 searches):**
- GPT-4 queries: ~$10-20

**Proposed (per month, 1000 searches):**
- GPT-4 Turbo queries: ~$1-2
- Embedding generation (one-time, 10,000 artworks): ~$1
- Embedding queries: Free (local vector search)
- Storage: ~10MB for embeddings

**ROI:** Better results, 10x cost reduction, enables personalization.

## Success Metrics

1. **Relevance**: % of top-5 results rated as relevant
2. **User engagement**: Time spent browsing, artworks displayed
3. **Diversity**: Variety in recommended artworks
4. **Discovery**: % of new artists/styles user explores
5. **Satisfaction**: User ratings of displayed artworks

## Technical Stack

**Database:**
- SQLite with `sqlite-vss` extension (vector search)
- Or PostgreSQL with `pgvector` for cloud deployment

**AI Models:**
- Chat: `gpt-4-turbo-preview` (cost-effective)
- Embeddings: `text-embedding-3-small` (fast, accurate)
- Future: `gpt-4-vision-preview` for image analysis

**Libraries:**
- `openai` - API client
- `better-sqlite3` - SQLite driver
- `sqlite-vss` - Vector similarity search
- `vector-js` - Vector math utilities

## Next Steps

1. Implement AI result filtering (today)
2. Set up test environment with embeddings
3. Run A/B tests: current vs embeddings
4. Design final database schema
5. Implement user preference tracking
