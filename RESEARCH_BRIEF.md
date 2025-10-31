# Glance AI Search - Research Brief

## The Goal

Build an intelligent art recommendation system for Glance that:

1. **Semantic Search**: Find artwork by "vibe" not just keywords
   - "peaceful blue impressionist paintings" → Returns actual peaceful, blue-toned Impressionist works
   - Not just keyword matching ("blue" in title/description)

2. **Visual Similarity**: "More Like This" based on actual visual content
   - Click on Monet's Water Lilies → Returns similar Impressionist landscapes
   - NOT unrelated items like "Beaded Bag" that happen to match text metadata

3. **User Personalization**: Learn what the user likes and recommend accordingly
   - Track which art user displays/likes
   - Build "taste profile" from preferences
   - Recommend art matching their aesthetic preferences
   - Balance familiar styles with discovery

4. **Scalability**: Support growing collection
   - Currently: ~200 curated artworks
   - Future: 10,000+ artworks from 8 museum APIs
   - Must work efficiently on Raspberry Pi

## Current System & Problems

### What We Have Now (After Recent Improvements)

**Architecture:**
```
User query → GPT-4 Turbo extracts parameters → Keyword search museums → AI filters results
```

**Recent improvements made:**
- ✅ Fixed query duplication bug
- ✅ Switched to GPT-4 Turbo (10x cost reduction)
- ✅ Added AI result filtering (removes obviously irrelevant results)

**Cost:** ~$1-2/month for 1000 searches

### Current Limitations

**Test Results (from evaluation):**

1. **Poor Semantic Understanding**
   - Query: "peaceful blue impressionist paintings"
   - Expected: Monet, Pissarro, Sisley
   - Got (before filtering): Cardinal by El Greco, Silver Tureen by Chardin
   - Got (after filtering): Better, but only 6/30 results relevant

2. **Visual Similarity Fails**
   - Query: "More like Monet's Water Lilies"
   - Expected: Other Impressionist landscapes
   - Got (before filtering): "Beaded Bag" by Pit River Tribe (Native American craft!)
   - Root cause: AI generates search terms like "1900s art" → matches "Early 1900s" in bag description

3. **No Visual Understanding**
   - System only uses text metadata (title, artist, date, description)
   - Cannot analyze actual image content (color palette, composition, style)
   - Two visually similar paintings with different metadata = not matched

4. **No Personalization**
   - No memory of what user likes
   - Every search is independent
   - Cannot build taste profile or recommendations

### Why Current Approach is Limited

**The fundamental issue:**
```
Museum APIs only support keyword search
    ↓
Keywords can't capture visual/aesthetic similarity
    ↓
"Peaceful" is not in museum metadata
    ↓
AI tries to map "peaceful" → keywords, but fails
```

**Example of the problem:**
- Two paintings of serene blue water scenes
- One is "Water Lilies, 1906" by Monet
- Other is "The Lake, 1899" by Unknown Artist
- Museum keyword search: No connection (different title, artist, date)
- Human/Visual AI: Obviously similar (both peaceful blue water)

## The Solution Space: Embedding-Based Search

### What Are Embeddings?

**Concept**: Convert images and text into numerical vectors that capture semantic meaning.

```
Image of Monet's Water Lilies    → [0.2, 0.8, -0.3, 0.1, ...]  (768 numbers)
Text: "peaceful blue landscape"   → [0.1, 0.9, -0.2, 0.0, ...]  (768 numbers)
Image of Beaded Bag               → [0.9, -0.5, 0.1, 0.7, ...]  (768 numbers)
```

**Key property**: Similar things have vectors close together (measured by cosine distance)

```
Distance(Water Lilies, "peaceful blue") = 0.05  (very close!)
Distance(Water Lilies, Beaded Bag) = 0.87       (very far!)
```

### How It Solves Our Problems

**1. Semantic Search**
```
User: "peaceful blue impressionist paintings"
    ↓
Convert text to embedding
    ↓
Find artwork embeddings nearest to this vector
    ↓
Returns: Actual artworks with peaceful blue aesthetic
```

**2. Visual Similarity**
```
User: "More like this" on Water Lilies
    ↓
Get Water Lilies' image embedding (stored in DB)
    ↓
Find nearest artwork embeddings
    ↓
Returns: Visually similar paintings (composition, color, style)
```

**3. User Preferences**
```
User likes: Monet, Hokusai, Kandinsky
    ↓
Average their embeddings → "taste vector"
    ↓
Find artworks nearest to taste vector
    ↓
Returns: Personalized recommendations
```

## Research Questions to Answer

### 1. Model Selection

**Options identified:**

| Model | Released | Dimensions | Key Features | Status |
|-------|----------|-----------|--------------|--------|
| **CLIP** (OpenAI) | 2021 | 512 | Original, widely used, proven | Mature |
| **SigLIP** (Google) | 2023 | 768 | Better than CLIP, more efficient | Stable |
| **SigLIP 2** (Google) | Feb 2025 | 768 | Latest, best performance | New |
| **Jina CLIP v2** | Dec 2024 | 768 | Multilingual, better retrieval | New |
| **Nomic Embed Vision** | 2024 | ? | Shares space with text model | New |

**Research needed:**
- Which model has best performance on artwork specifically?
- Are there art-specific fine-tuned versions available?
- What's the trade-off between model size and quality?
- Can we run locally on Raspberry Pi or need API?

### 2. Implementation Approach

**Option A: Build from Scratch**
- Full control and integration with Glance
- Learn system deeply
- Time: 2-3 weeks
- Links:
  - Hugging Face: https://huggingface.co/@huggingface/inference
  - SigLIP 2: https://huggingface.co/google/siglip2-base-patch16-224

**Option B: Adapt Existing Project**
- Faster to working system
- Less control over architecture
- Time: 2-3 days
- Links:
  - artwork-similarity-search: https://github.com/Otman404/artwork-similarity-search
  - clip-image-search: https://github.com/kingyiusuen/clip-image-search
  - OpenAI-Clip-Image-Search: https://github.com/jarvisx17/OpenAI-Clip-Image-Search

**Option C: Use Pre-computed Embeddings**
- WikiArt dataset with CLIP embeddings: https://archive.org/details/WikiArt_dataset
- 200K artworks already embedded
- Mix with your own museum data
- Time: 1 week

**Research needed:**
- How well do existing projects integrate with Node.js/Express?
- What's the code quality and maintainability?
- Can we extend them for user preferences?
- Is WikiArt dataset license compatible with our use?

### 3. Infrastructure

**Database options:**

| Database | Vector Support | Complexity | Cost | Performance |
|----------|---------------|------------|------|-------------|
| **SQLite + sqlite-vss** | Extension | Low | Free | Good for <100K |
| **PostgreSQL + pgvector** | Extension | Medium | Free | Excellent |
| **Qdrant** | Native vector DB | Medium | Free (self-host) | Excellent |
| **Pinecone** | Managed vector DB | Low | $70+/mo | Excellent |
| **Weaviate** | Native vector DB | Medium | Free (self-host) | Excellent |

**Research needed:**
- Which works best on Raspberry Pi?
- What's the query performance at 10K, 50K, 100K artworks?
- How complex is setup and maintenance?
- Can it handle concurrent users?

### 4. Deployment Strategy

**Option A: Hugging Face Inference API**
- Pros: Fast to implement, managed infrastructure
- Cons: API costs (~$0.0001/embedding), requires internet
- Best for: MVP/testing

**Option B: Local Inference (Transformers.js)**
- Pros: Zero cost, works offline, private
- Cons: Slower inference on CPU, larger disk space (~350MB model)
- Best for: Production after validation

**Option C: Hybrid**
- Generate embeddings via API (one-time)
- Store in database
- All searches are local (no API calls)
- Best for: Glance use case!

**Research needed:**
- Can Raspberry Pi 4 run CLIP/SigLIP inference efficiently?
- What's the inference time: CPU vs GPU?
- Is there a quantized/optimized model for ARM?

## Key Research Areas

### 1. Art-Specific Model Performance

**Questions:**
- Has anyone benchmarked CLIP vs SigLIP vs others on artwork?
- Are there art-specific fine-tuned models? (e.g., WikiArt-tuned)
- Does SigLIP 2 perform better than CLIP for art specifically?

**Where to look:**
- Papers With Code: https://paperswithcode.com/
- Research: "Does CLIP perceive art the same way we do?" - https://arxiv.org/html/2505.05229v1
- Hugging Face model hub: https://huggingface.co/models?other=embeddings

### 2. Production Implementations

**Questions:**
- What are real museums using? (Met, Rijksmuseum, etc.)
- What works at scale (100K+ artworks)?
- What's the typical architecture?

**Where to look:**
- Depict (Indian museums): Mentioned in search results
- MIT MosAIc (Met + Rijksmuseum): https://news.mit.edu/2020/algorithm-finds-hidden-connections-between-paintings-met-museum-0729
- Blog posts: https://otmaneboughaba.com/posts/artwork-similarity-search/

### 3. Performance & Cost

**Questions:**
- What's realistic query time on Raspberry Pi?
- How much does embedding generation cost?
- Can we cache/optimize?

**Where to look:**
- Benchmarks in existing projects
- Raspberry Pi ML communities
- Cost calculators for HF/Replicate

### 4. User Preference Algorithms

**Questions:**
- How to build taste profile from liked artworks?
- How to balance familiarity vs discovery?
- How much data needed before personalization works?

**Where to look:**
- Research: "Personalized Visual Art Recommendation" - https://github.com/Bekyilma/Personalized-Visual-Art-Recommendation
- ArtEmis dataset: https://www.artemisdataset.org/
- Recommendation system literature

## Success Criteria

How will we know if the solution works?

**Quantitative Metrics:**
1. **Search Relevance**: 85%+ of top-5 results should be relevant
   - Current: ~50% after filtering
   - Target: 85%+ with embeddings

2. **Similarity Quality**: Visual "More Like This" should return same style/period
   - Current: 40% relevant
   - Target: 90%+ relevant

3. **Query Speed**: <500ms for search on Raspberry Pi
   - Current: ~2s (GPT-4 API call)
   - Target: <500ms (local vector search)

4. **Cost**: <$5/month for 1000 searches
   - Current: $1-2/month (after improvements)
   - Target: $0/month (after initial embedding generation)

**Qualitative Metrics:**
1. Does "peaceful blue impressionist" actually return peaceful blue artworks?
2. Does "More Like This" on Water Lilies return Impressionist landscapes?
3. After liking 10 artworks, do recommendations match user taste?
4. Can user discover new artists similar to favorites?

## Next Steps for Research

### Phase 1: Model Evaluation (1-2 days)
1. Read research papers on CLIP/SigLIP for art
2. Find benchmarks comparing models on artwork
3. Check if art-specific fine-tuned models exist
4. Decision: Which model to use?

### Phase 2: Implementation Strategy (1 day)
1. Review GitHub projects in detail
2. Assess code quality and extensibility
3. Check if WikiArt embeddings are usable
4. Decision: Build, adapt, or use pre-computed?

### Phase 3: Infrastructure Planning (1 day)
1. Test vector database options on Raspberry Pi
2. Benchmark query performance with sample data
3. Test local vs API inference speed
4. Decision: Database and deployment approach?

### Phase 4: POC/Prototype (3-5 days)
1. Implement minimal viable system
2. Test on 100 artworks
3. Measure metrics
4. Validate approach before full build

## Documentation Created

1. **AI_SEARCH_IMPROVEMENTS.md** - Initial analysis and roadmap
2. **CLIP_IMPLEMENTATION_PLAN.md** - Original CLIP proposal
3. **SIGLIP_IMPLEMENTATION_GUIDE.md** - Complete SigLIP implementation guide
4. **RESEARCH_BRIEF.md** (this file) - Comprehensive research brief

## Current Status

**What we've accomplished:**
- ✅ Identified current system limitations through testing
- ✅ Implemented quick wins (deduplication, GPT-4 Turbo, filtering)
- ✅ Researched embedding-based approaches
- ✅ Found existing implementations and resources
- ✅ Mapped out solution space

**Where we are:**
- 🔄 Deciding on best approach for Glance
- Need: Deep research on options
- Next: Make informed decision and implement

**Key decision points:**
1. Which model? (CLIP, SigLIP, SigLIP 2, Jina CLIP v2)
2. Which implementation? (Build, adapt, pre-computed)
3. Which database? (SQLite, PostgreSQL, Qdrant, etc.)
4. Which deployment? (API, local, hybrid)

## Questions for User

After your research, we need to decide:

1. **Priority**: Speed to working system vs. perfect integration?
2. **Technical comfort**: Willing to learn new tools (Qdrant, etc.) or prefer familiar (SQLite)?
3. **Maintenance**: Prefer simple/maintainable or optimized/complex?
4. **Future vision**: Just Glance or potentially serve multiple users/displays?

---

**Ready for deep research!** Use this as foundation to explore each option and make informed decision.
