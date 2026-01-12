/**
 * Image URL Validator
 * Validates and caches image URL availability
 *
 * All Wikimedia filenames are validated on first use and cached.
 * No manual "verified" list - the cache IS the verification.
 */

const { loggers } = require('../services/logger');
const log = loggers.api;

// Cache for validated URLs (valid for 24 hours)
const validationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// Track initialization state
let initializationPromise = null;

/**
 * Check if a URL is accessible (returns 200 after following redirects)
 * Uses HEAD request for efficiency, follows redirects to check final status
 */
async function isUrlAccessible(url, timeout = 8000) {
    // Check cache first
    const cached = validationCache.get(url);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.valid;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Use GET with redirect: 'follow' to check the final destination
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Glance/1.0 (Art Gallery Display; contact@example.com)',
                'Range': 'bytes=0-0' // Only fetch first byte to minimize bandwidth
            }
        });

        clearTimeout(timeoutId);

        // Check if final response is successful (after redirects)
        const valid = response.ok;

        // Cache the result
        validationCache.set(url, { valid, timestamp: Date.now() });

        if (!valid) {
            log.debug('Image URL not accessible', { url, status: response.status });
        }

        return valid;
    } catch (error) {
        // Cache negative results too
        validationCache.set(url, { valid: false, timestamp: Date.now() });
        log.debug('Image URL check failed', { url, error: error.message });
        return false;
    }
}

/**
 * Build Wikimedia Commons URL from filename
 * Handles both raw and pre-encoded filenames to avoid double-encoding
 */
function getWikimediaUrl(filename, width = 1200) {
    // Normalize: decode first if already encoded, then encode properly
    // This prevents double-encoding (e.g., %C3%A9 becoming %25C3%25A9)
    let normalizedFilename;
    try {
        // Try to decode (handles already-encoded filenames like "Caf%C3%A9")
        normalizedFilename = decodeURIComponent(filename);
    } catch {
        // If decode fails (invalid encoding), use as-is
        normalizedFilename = filename;
    }
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(normalizedFilename)}?width=${width}`;
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
 * All files are validated (using cache for performance)
 */
async function filterValidWikimediaArtworks(artworks) {
    if (!artworks || artworks.length === 0) return [];

    return filterValidArtworks(
        artworks.filter(a => a.wikimedia),
        (artwork) => getWikimediaUrl(artwork.wikimedia, 400)
    );
}

/**
 * Pre-warm the validation cache with a list of filenames
 * Call this at server startup with all known filenames
 */
async function warmupCache(filenames) {
    if (!filenames || filenames.length === 0) return { valid: 0, invalid: 0 };

    log.info('Starting cache warmup', { count: filenames.length });

    // Validate in batches to avoid overwhelming Wikimedia
    const BATCH_SIZE = 10;
    const BATCH_DELAY = 500; // ms between batches

    let validCount = 0;
    let invalidCount = 0;
    const invalidFiles = [];

    for (let i = 0; i < filenames.length; i += BATCH_SIZE) {
        const batch = filenames.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(
            batch.map(async (filename) => {
                const url = getWikimediaUrl(filename, 400);
                const valid = await isUrlAccessible(url);
                return { filename, valid };
            })
        );

        for (const { filename, valid } of results) {
            if (valid) {
                validCount++;
            } else {
                invalidCount++;
                invalidFiles.push(filename);
            }
        }

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < filenames.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
    }

    if (invalidFiles.length > 0) {
        log.warn('Found invalid Wikimedia filenames during warmup', {
            invalidFiles,
            count: invalidFiles.length
        });
    }

    log.info('Cache warmup complete', { valid: validCount, invalid: invalidCount });

    return { valid: validCount, invalid: invalidCount, invalidFiles };
}

/**
 * Check if a filename has been validated (exists in cache with valid=true)
 */
function isFilenameValidated(filename) {
    const url = getWikimediaUrl(filename, 400);
    const cached = validationCache.get(url);
    return !!(cached && cached.valid && (Date.now() - cached.timestamp) < CACHE_TTL);
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
    isFilenameValidated,
    getWikimediaUrl,
    filterValidArtworks,
    filterValidWikimediaArtworks,
    warmupCache,
    clearValidationCache,
    getCacheStats
};
