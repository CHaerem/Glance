/**
 * Image URL Validator
 * Validates and caches image URL availability
 *
 * All Wikimedia filenames are validated on first use and cached.
 * No manual "verified" list - the cache IS the verification.
 */

import { loggers } from '../services/logger';
import { TtlCache, TTL } from './cache';
import { getErrorMessage } from './error';

const log = loggers.api;

/** Warmup result */
interface WarmupResult {
  valid: number;
  invalid: number;
  invalidFiles?: string[];
}

/** Cache stats */
interface CacheStats {
  totalEntries: number;
  validUrls: number;
  invalidUrls: number;
}

/** Artwork with wikimedia field - base interface for filtering */
interface WikimediaArtwork {
  wikimedia?: string;
}

// Cache for validated URLs (valid for 24 hours)
const validationCache = new TtlCache<boolean>({ ttl: TTL.ONE_DAY });

/**
 * Check if a URL is accessible (returns 200 after following redirects)
 * Uses HEAD request for efficiency, follows redirects to check final status
 */
export async function isUrlAccessible(
  url: string,
  timeout: number = 8000
): Promise<boolean> {
  // Check cache first
  const cached = validationCache.get(url);
  if (cached !== null) {
    return cached;
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
        Range: 'bytes=0-0', // Only fetch first byte to minimize bandwidth
      },
    });

    clearTimeout(timeoutId);

    // Check if final response is successful (after redirects)
    const valid = response.ok;

    // Cache the result
    validationCache.set(url, valid);

    if (!valid) {
      log.debug('Image URL not accessible', { url, status: response.status });
    }

    return valid;
  } catch (error) {
    // Cache negative results too
    validationCache.set(url, false);
    log.debug('Image URL check failed', {
      url,
      error: getErrorMessage(error),
    });
    return false;
  }
}

/**
 * Build Wikimedia Commons URL from filename
 * Handles both raw and pre-encoded filenames to avoid double-encoding
 */
export function getWikimediaUrl(filename: string, width: number = 1200): string {
  // Normalize: decode first if already encoded, then encode properly
  // This prevents double-encoding (e.g., %C3%A9 becoming %25C3%25A9)
  let normalizedFilename: string;
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
export async function isWikimediaFileValid(filename: string): Promise<boolean> {
  const url = getWikimediaUrl(filename, 400); // Use smaller size for validation
  return isUrlAccessible(url);
}

/**
 * Filter artworks to only include those with valid images
 * Validates in parallel for efficiency
 */
export async function filterValidArtworks<T>(
  artworks: T[],
  getImageUrl: (artwork: T) => string | null | undefined
): Promise<T[]> {
  if (!artworks || artworks.length === 0) return [];

  const validationResults = await Promise.all(
    artworks.map(async (artwork) => {
      const url = getImageUrl(artwork);
      if (!url) return { artwork, valid: false };

      const valid = await isUrlAccessible(url);
      return { artwork, valid };
    })
  );

  const validArtworks = validationResults.filter((r) => r.valid).map((r) => r.artwork);

  const invalidCount = artworks.length - validArtworks.length;
  if (invalidCount > 0) {
    log.info('Filtered out artworks with invalid images', {
      total: artworks.length,
      valid: validArtworks.length,
      invalid: invalidCount,
    });
  }

  return validArtworks;
}

/**
 * Validate artworks with Wikimedia filenames
 * All files are validated (using cache for performance)
 */
export async function filterValidWikimediaArtworks<T extends WikimediaArtwork>(
  artworks: T[]
): Promise<T[]> {
  if (!artworks || artworks.length === 0) return [];

  return filterValidArtworks(
    artworks.filter((a) => a.wikimedia),
    (artwork) => (artwork.wikimedia ? getWikimediaUrl(artwork.wikimedia, 400) : null)
  );
}

/**
 * Pre-warm the validation cache with a list of filenames
 * Call this at server startup with all known filenames
 */
export async function warmupCache(filenames: string[]): Promise<WarmupResult> {
  if (!filenames || filenames.length === 0) return { valid: 0, invalid: 0 };

  log.info('Starting cache warmup', { count: filenames.length });

  // Validate in batches to avoid overwhelming Wikimedia
  const BATCH_SIZE = 10;
  const BATCH_DELAY = 500; // ms between batches

  let validCount = 0;
  let invalidCount = 0;
  const invalidFiles: string[] = [];

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
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
    }
  }

  if (invalidFiles.length > 0) {
    log.warn('Found invalid Wikimedia filenames during warmup', {
      invalidFiles,
      count: invalidFiles.length,
    });
  }

  log.info('Cache warmup complete', { valid: validCount, invalid: invalidCount });

  return { valid: validCount, invalid: invalidCount, invalidFiles };
}

/**
 * Check if a filename has been validated (exists in cache with valid=true)
 */
export function isFilenameValidated(filename: string): boolean {
  const url = getWikimediaUrl(filename, 400);
  const cached = validationCache.get(url);
  return cached === true;
}

/**
 * Clear validation cache (useful for testing or manual refresh)
 */
export function clearValidationCache(): void {
  validationCache.clear();
  log.info('Cleared image validation cache');
}

/**
 * Get cache stats
 */
export function getCacheStats(): CacheStats {
  let valid = 0;
  let invalid = 0;

  for (const isValid of validationCache.values()) {
    if (isValid) valid++;
    else invalid++;
  }

  return {
    totalEntries: validationCache.size,
    validUrls: valid,
    invalidUrls: invalid,
  };
}
