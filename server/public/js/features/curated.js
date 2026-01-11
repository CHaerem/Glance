/**
 * Curated Picks Module
 * Staff picks, trending, personalized recommendations, seasonal themes
 */

// Module state
let curatedCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch curated picks with caching
 * @param {string} type - Curated type (staff-picks, trending, for-you, seasonal)
 * @param {number} limit - Max results to return
 * @returns {Promise<Object>} Curated data
 */
async function fetchCuratedPicks(type, limit = 12) {
    // Check cache
    const cacheKey = `${type}-${limit}`;
    const cached = curatedCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    try {
        const response = await fetch(`/api/featured/${type}?limit=${limit}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${type}: ${response.status}`);
        }

        const data = await response.json();

        // Cache the result
        curatedCache[cacheKey] = {
            data,
            timestamp: Date.now()
        };

        return data;
    } catch (error) {
        console.error(`Error fetching ${type}:`, error);
        return { title: type, artworks: [], error: error.message };
    }
}

/**
 * Get staff picks
 * @param {number} limit - Max results
 * @returns {Promise<Object>} Staff picks data
 */
async function getStaffPicks(limit = 12) {
    return fetchCuratedPicks('staff-picks', limit);
}

/**
 * Get trending artworks
 * @param {number} limit - Max results
 * @returns {Promise<Object>} Trending data
 */
async function getTrending(limit = 12) {
    return fetchCuratedPicks('trending', limit);
}

/**
 * Get personalized recommendations
 * @param {number} limit - Max results
 * @returns {Promise<Object>} For you data
 */
async function getForYou(limit = 12) {
    return fetchCuratedPicks('for-you', limit);
}

/**
 * Get seasonal themed artworks
 * @param {number} limit - Max results
 * @returns {Promise<Object>} Seasonal data
 */
async function getSeasonal(limit = 12) {
    return fetchCuratedPicks('seasonal', limit);
}

/**
 * Get all curated sections
 * @param {number} limit - Max results per section
 * @returns {Promise<Object>} All curated data
 */
async function getAllCurated(limit = 8) {
    const [staffPicks, trending, forYou, seasonal] = await Promise.all([
        getStaffPicks(limit),
        getTrending(limit),
        getForYou(limit),
        getSeasonal(limit)
    ]);

    return {
        'staff-picks': staffPicks,
        trending,
        'for-you': forYou,
        seasonal
    };
}

/**
 * Clear curated cache
 */
function clearCuratedCache() {
    curatedCache = {};
}

/**
 * Render a horizontal scroll of curated items (compact cards)
 * @param {Array} artworks - Artworks to render
 * @returns {string} HTML string
 */
function renderCuratedScroll(artworks) {
    if (!artworks || artworks.length === 0) {
        return '<div class="curated-empty">No artworks available</div>';
    }

    return artworks.map(art => {
        const title = art.title || 'Untitled';
        const artist = art.artist || 'Unknown';
        const imageUrl = art.thumbnailUrl || art.imageUrl || art.thumbnail;
        const artJson = JSON.stringify(art).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

        return `
            <div class="curated-card" onclick='window.previewArt(${artJson.replace(/&quot;/g, "&#34;")})'>
                <div class="curated-card-image">
                    <img src="${imageUrl}" alt="${title}" loading="lazy">
                </div>
                <div class="curated-card-info">
                    <div class="curated-card-title">${truncate(title, 20)}</div>
                    <div class="curated-card-artist">${truncate(artist, 18)}</div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Truncate text with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLen - Max length
 * @returns {string} Truncated string
 */
function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

// Export to window for use in main.js
window.fetchCuratedPicks = fetchCuratedPicks;
window.getStaffPicks = getStaffPicks;
window.getTrending = getTrending;
window.getForYou = getForYou;
window.getSeasonal = getSeasonal;
window.getAllCurated = getAllCurated;
window.clearCuratedCache = clearCuratedCache;
window.renderCuratedScroll = renderCuratedScroll;
