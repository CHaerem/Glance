# Glance Art Gallery - Improvement Roadmap

This document outlines planned improvements for the Glance e-ink art gallery browsing feature.

## Current Status

✅ **Implemented**:
- Four major museum sources (Met, ARTIC, Cleveland, Rijksmuseum)
- Parallel API searching with error handling
- Smart filtering to exclude book pages and photographs
- Basic pagination with "load more"
- Interleaved results from multiple sources
- In-memory caching infrastructure (added but not yet integrated)

## Planned Improvements

### 1. **Caching Layer** (HIGH PRIORITY)
**Problem**: Met API frequently rate limits, causing slow searches
**Solution**:
- Use existing `artSearchCache` for 24-hour caching
- Cache popular searches (Mona Lisa, Van Gogh, Monet, Madonna)
- Cache individual museum responses separately
- Implement cache warming for common queries

**Files to modify**: `server/server.js` (lines 1665-1992)

### 2. **Search Result Ranking** (HIGH PRIORITY)
**Problem**: Results are just interleaved, not ranked by quality
**Solution**:
- Score artworks based on:
  - Exact artist name match (+10 points)
  - Paintings over prints (+5 points)
  - Earlier works over modern (+3 points)
  - Higher resolution images (+2 points)
- Sort merged results by score before pagination

**Implementation**:
```javascript
function scoreArtwork(artwork, query) {
    let score = 0;
    const lowerQuery = query.toLowerCase();
    const lowerArtist = artwork.artist.toLowerCase();
    const lowerTitle = artwork.title.toLowerCase();

    if (lowerArtist.includes(lowerQuery)) score += 10;
    if (lowerTitle.includes(lowerQuery)) score += 5;
    if (artwork.department?.toLowerCase().includes('painting')) score += 5;

    return score;
}
```

### 3. **Source Badges in UI** (MEDIUM PRIORITY)
**Problem**: Users don't know which museum provided which artwork
**Solution**:
- Add museum badges to thumbnails
- Color-code by source:
  - Met: Blue
  - ARTIC: Red
  - Cleveland: Green
  - Rijksmuseum: Orange
- Show source name on hover

**Files to modify**: `server/simple-ui.html` (lines 1257-1265)

### 4. **Advanced Search Filters** (MEDIUM PRIORITY)
**Features**:
- Search by artist name specifically
- Filter by time period (Renaissance, Baroque, Impressionism, Modern, etc.)
- Filter by artwork type (paintings, prints, drawings, sculptures)
- Search by color palette

**UI mockup**:
```html
<div class="filter-bar">
    <select id="artworkType">
        <option value="">All Types</option>
        <option value="painting">Paintings</option>
        <option value="drawing">Drawings</option>
        <option value="print">Prints</option>
    </select>

    <select id="timePeriod">
        <option value="">All Periods</option>
        <option value="renaissance">Renaissance</option>
        <option value="baroque">Baroque</option>
        <option value="impressionism">Impressionism</option>
        <option value="modern">Modern</option>
    </select>
</div>
```

### 5. **Improved Pagination** (MEDIUM PRIORITY)
**Problem**: Re-fetches all results on each page load
**Solution**:
- Track offset for each museum separately
- Fetch only next batch incrementally
- Show per-museum loading states
- Implement infinite scroll as alternative to "load more"

### 6. **Similar Artworks Feature** (LOW PRIORITY)
**When viewing an artwork, show**:
- More works by same artist
- Works from same time period
- Works with similar subjects
- Works from same museum department

**New endpoint**: `GET /api/art/similar/:artworkId`

### 7. **Better Error Handling** (HIGH PRIORITY)
**Current issues**:
- Silent failures when museums are down
- No feedback about rate limiting
- User doesn't know why searches return few results

**Improvements**:
- Show which museums are currently available
- Display "Searching..." with museum logos
- Show messages like: "No results from Met (rate limited), showing 20 from 3 other museums"
- Add retry button for failed museums

**Response format**:
```json
{
    "results": [...],
    "total": 20,
    "hasMore": true,
    "sources": {
        "met": {"status": "rate_limited", "count": 0},
        "artic": {"status": "ok", "count": 12},
        "cleveland": {"status": "ok", "count": 5},
        "rijks": {"status": "ok", "count": 3}
    }
}
```

### 8. **Favorites & Collections** (LOW PRIORITY)
**Features**:
- Star/favorite individual artworks
- Create named collections
- Export collection as playlist
- Share collection link

**New endpoints**:
- `POST /api/favorites` - Add to favorites
- `GET /api/favorites` - List favorites
- `POST /api/collections` - Create collection
- `GET /api/collections/:id` - Get collection

**Storage**: Store in `favorites.json` and `collections.json`

### 9. **Performance Optimizations** (MEDIUM PRIORITY)
**Optimizations**:
- Lazy load images in browse grid (Intersection Observer)
- Pre-fetch thumbnails for next page
- Use WebP format for thumbnails
- Add service worker for offline browsing
- Compress thumbnail URLs
- Cache thumbnails in browser localStorage

**Libraries to add**:
- `sharp` already available for WebP conversion
- Native Intersection Observer API
- Service Worker API

### 10. **Smart Search Suggestions** (LOW PRIORITY)
**Features**:
- Show popular searches below search box
- Autocomplete artist names
- Suggest corrections ("Did you mean: Da Vinci?")
- Show recent searches

**Popular searches to suggest**:
- Monet, Van Gogh, Picasso, Da Vinci
- Impressionism, Renaissance, Modern Art
- Landscape, Portrait, Still Life

**Implementation**:
```javascript
const popularSearches = [
    "Monet", "Van Gogh", "Picasso", "Da Vinci", "Rembrandt",
    "Impressionism", "Renaissance", "Baroque",
    "Landscape", "Portrait", "Madonna"
];
```

## Implementation Priority

### Phase 1 (Critical - Do First):
1. Integrate caching layer to solve rate limiting
2. Add error handling with source status feedback
3. Implement result ranking/sorting

### Phase 2 (High Value):
4. Add source badges to UI
5. Improve pagination with incremental loading
6. Add performance optimizations (lazy loading)

### Phase 3 (Nice to Have):
7. Advanced search filters
8. Smart search suggestions
9. Similar artworks feature
10. Favorites and collections

## Testing Checklist

After implementing improvements, test:
- [ ] Mona Lisa search returns quality results
- [ ] Madonna search returns religious artworks
- [ ] Popular artist searches (Monet, Van Gogh) work well
- [ ] Caching reduces API calls for repeat searches
- [ ] Error messages show when museums are unavailable
- [ ] Source badges display correctly
- [ ] Pagination doesn't duplicate results
- [ ] Performance is smooth with 100+ results
- [ ] Works on mobile devices
- [ ] E-ink display receives properly formatted images

## Notes

- Maintain calm technology aesthetic throughout
- Keep UI minimal and distraction-free
- Prioritize e-ink display optimization
- All images must work with Floyd-Steinberg dithering
- Respect museum API rate limits with caching
