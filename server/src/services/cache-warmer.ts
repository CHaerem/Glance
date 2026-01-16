/**
 * Cache Warmer Service
 *
 * Pre-fetches and caches images on server startup.
 * Runs in the background to populate the cache with:
 * - Today's gallery images
 * - Playlist preview images
 * - Discover feature images
 * - Local library images (if available)
 */

import { cacheImagesBackground, initImageCache, getCacheStats } from './image-cache';
import { loggers } from './logger';
import { getErrorMessage } from '../utils';

const log = loggers.api;

// URLs to pre-warm (relative to server)
const WARM_ENDPOINTS = [
  '/api/gallery/today',
  '/api/playlists',
  '/api/discover',
];

/**
 * Extract image URLs from API response
 */
function extractImageUrls(data: unknown): string[] {
  const urls: string[] = [];

  function extract(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach(extract);
      return;
    }

    const record = obj as Record<string, unknown>;

    // Check for image URL fields
    for (const key of ['imageUrl', 'thumbnailUrl', 'preview', 'thumbnail']) {
      if (typeof record[key] === 'string' && record[key]) {
        const url = record[key] as string;
        // Only cache external URLs (not data: or local)
        if (url.startsWith('http://') || url.startsWith('https://')) {
          urls.push(url);
        }
      }
    }

    // Recurse into nested objects
    for (const value of Object.values(record)) {
      extract(value);
    }
  }

  extract(data);
  return [...new Set(urls)]; // Dedupe
}

/**
 * Warm the cache by fetching common content
 */
export async function warmCache(serverPort: number = 3000): Promise<void> {
  log.info('Starting cache warm-up...');

  const allUrls: string[] = [];

  for (const endpoint of WARM_ENDPOINTS) {
    try {
      const response = await fetch(`http://localhost:${serverPort}${endpoint}`);

      if (response.ok) {
        const data = await response.json();
        const urls = extractImageUrls(data);
        allUrls.push(...urls);
        log.debug('Extracted URLs from endpoint', { endpoint, count: urls.length });
      }
    } catch (error) {
      log.warn('Failed to fetch endpoint for cache warming', { endpoint, error: getErrorMessage(error) });
    }
  }

  if (allUrls.length > 0) {
    log.info('Warming cache with images', { count: allUrls.length });
    await cacheImagesBackground(allUrls);
  }

  const stats = getCacheStats();
  log.info('Cache warm-up complete', {
    totalImages: stats.totalImages,
    size: `${(stats.totalSize / 1024 / 1024).toFixed(1)}MB`,
  });
}

/**
 * Initialize cache and start warming
 */
export async function initCacheWarmer(serverPort: number = 3000): Promise<void> {
  // Initialize cache directories
  await initImageCache();

  // Start warming in background (don't block server startup)
  setTimeout(() => {
    warmCache(serverPort).catch((error) => {
      log.error('Cache warm-up failed', { error });
    });
  }, 5000); // Wait 5s for server to be ready
}

/**
 * Schedule periodic cache warming (e.g., every 6 hours)
 */
export function scheduleCacheWarming(serverPort: number = 3000, intervalHours: number = 6): void {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  setInterval(() => {
    warmCache(serverPort).catch((error) => {
      log.error('Scheduled cache warm-up failed', { error });
    });
  }, intervalMs);

  log.info('Cache warming scheduled', { intervalHours });
}
