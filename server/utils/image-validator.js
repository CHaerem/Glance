/**
 * Image URL Validator
 * Validates and caches image URL availability
 */

const { loggers } = require('../services/logger');
const log = loggers.api;

// Cache for validated URLs (valid for 24 hours)
const validationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Check if a URL is accessible (returns 200 or redirect)
 * Uses HEAD request for efficiency
 */
async function isUrlAccessible(url, timeout = 5000) {
    // Check cache first
    const cached = validationCache.get(url);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.valid;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Glance/1.0 (Art Gallery Display; contact@example.com)'
            }
        });

        clearTimeout(timeoutId);

        const valid = response.ok || (response.status >= 300 && response.status < 400);

        // Cache the result
        validationCache.set(url, { valid, timestamp: Date.now() });

        if (!valid) {
            log.debug('Image URL not accessible', { url, status: response.status });
        }

        return valid;
    } catch (error) {
        // Cache negative results too (but maybe shorter TTL)
        validationCache.set(url, { valid: false, timestamp: Date.now() });
        log.debug('Image URL check failed', { url, error: error.message });
        return false;
    }
}

/**
 * Build Wikimedia Commons URL from filename
 */
function getWikimediaUrl(filename, width = 1200) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
}

/**
 * Validate a Wikimedia filename
 */
async function isWikimediaFileValid(filename) {
    const url = getWikimediaUrl(filename, 400); // Use smaller size for validation
    return isUrlAccessible(url);
}

/**
 * Filter artworks to only include those with valid images
 * Validates in parallel for efficiency
 */
async function filterValidArtworks(artworks, getImageUrl) {
    if (!artworks || artworks.length === 0) return [];

    const validationResults = await Promise.all(
        artworks.map(async (artwork) => {
            const url = getImageUrl(artwork);
            if (!url) return { artwork, valid: false };

            const valid = await isUrlAccessible(url);
            return { artwork, valid };
        })
    );

    const validArtworks = validationResults
        .filter(r => r.valid)
        .map(r => r.artwork);

    const invalidCount = artworks.length - validArtworks.length;
    if (invalidCount > 0) {
        log.info('Filtered out artworks with invalid images', {
            total: artworks.length,
            valid: validArtworks.length,
            invalid: invalidCount
        });
    }

    return validArtworks;
}

/**
 * Validate artworks with Wikimedia filenames
 */
async function filterValidWikimediaArtworks(artworks) {
    return filterValidArtworks(artworks, (artwork) => {
        if (!artwork.wikimedia) return null;
        return getWikimediaUrl(artwork.wikimedia, 400);
    });
}

/**
 * Clear validation cache (useful for testing or manual refresh)
 */
function clearValidationCache() {
    validationCache.clear();
    log.info('Cleared image validation cache');
}

/**
 * Get cache stats
 */
function getCacheStats() {
    let valid = 0;
    let invalid = 0;

    for (const entry of validationCache.values()) {
        if (entry.valid) valid++;
        else invalid++;
    }

    return {
        totalEntries: validationCache.size,
        validUrls: valid,
        invalidUrls: invalid
    };
}

module.exports = {
    isUrlAccessible,
    isWikimediaFileValid,
    getWikimediaUrl,
    filterValidArtworks,
    filterValidWikimediaArtworks,
    clearValidationCache,
    getCacheStats
};
