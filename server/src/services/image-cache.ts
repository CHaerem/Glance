/**
 * Image Cache Service
 *
 * Downloads and caches images locally on the Pi for faster serving.
 * Generates thumbnails for web display.
 *
 * Features:
 * - Local disk caching of museum images
 * - Thumbnail generation (200px, 400px)
 * - Pre-warming cache on startup
 * - Background downloading
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { loggers } from './logger';
import { getErrorMessage } from '../utils';

const log = loggers.image;

// Cache directory
const CACHE_DIR = process.env.IMAGE_CACHE_DIR || path.join(__dirname, '../../data/image-cache');
const THUMBS_DIR = path.join(CACHE_DIR, 'thumbs');
const ORIGINALS_DIR = path.join(CACHE_DIR, 'originals');
const INDEX_FILE = path.join(CACHE_DIR, 'index.json');

// Thumbnail sizes
const THUMB_SIZES = {
  small: 200,
  medium: 400,
};

// Cache index (in-memory for fast lookups)
interface CacheEntry {
  urlHash: string;
  originalUrl: string;
  filename: string;
  thumbnails: {
    small?: string;
    medium?: string;
  };
  width?: number;
  height?: number;
  size: number;
  cachedAt: string;
  lastAccessed: string;
}

interface CacheIndex {
  version: number;
  entries: Record<string, CacheEntry>;
  stats: {
    totalImages: number;
    totalSize: number;
    lastUpdated: string;
  };
}

let cacheIndex: CacheIndex = {
  version: 1,
  entries: {},
  stats: {
    totalImages: 0,
    totalSize: 0,
    lastUpdated: new Date().toISOString(),
  },
};

// Pending downloads to avoid duplicates
const pendingDownloads = new Map<string, Promise<CacheEntry | null>>();

/**
 * Initialize the cache directories and load index
 */
export async function initImageCache(): Promise<void> {
  try {
    // Create directories
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    await fs.promises.mkdir(THUMBS_DIR, { recursive: true });
    await fs.promises.mkdir(ORIGINALS_DIR, { recursive: true });

    // Load existing index
    if (fs.existsSync(INDEX_FILE)) {
      const data = await fs.promises.readFile(INDEX_FILE, 'utf-8');
      cacheIndex = JSON.parse(data);
      log.info('Image cache loaded', {
        images: cacheIndex.stats.totalImages,
        size: `${(cacheIndex.stats.totalSize / 1024 / 1024).toFixed(1)}MB`,
      });
    } else {
      await saveIndex();
      log.info('Image cache initialized');
    }
  } catch (error) {
    log.error('Failed to initialize image cache', { error: getErrorMessage(error) });
  }
}

/**
 * Save cache index to disk
 */
async function saveIndex(): Promise<void> {
  cacheIndex.stats.lastUpdated = new Date().toISOString();
  await fs.promises.writeFile(INDEX_FILE, JSON.stringify(cacheIndex, null, 2));
}

/**
 * Generate a hash for a URL
 */
function hashUrl(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex');
}

/**
 * Get file extension from URL or content-type
 */
function getExtension(url: string, contentType?: string): string {
  if (contentType) {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
    if (contentType.includes('png')) return '.png';
    if (contentType.includes('webp')) return '.webp';
    if (contentType.includes('gif')) return '.gif';
  }

  const urlPath = new URL(url).pathname;
  const ext = path.extname(urlPath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }

  return '.jpg'; // Default
}

/**
 * Check if an image is cached
 */
export function isCached(url: string): boolean {
  const hash = hashUrl(url);
  return hash in cacheIndex.entries;
}

/**
 * Get cached image path
 */
export function getCachedPath(url: string, size?: 'small' | 'medium'): string | null {
  const hash = hashUrl(url);
  const entry = cacheIndex.entries[hash];

  if (!entry) return null;

  if (size && entry.thumbnails[size]) {
    return path.join(THUMBS_DIR, entry.thumbnails[size]!);
  }

  return path.join(ORIGINALS_DIR, entry.filename);
}

/**
 * Get cache entry for a URL
 */
export function getCacheEntry(url: string): CacheEntry | null {
  const hash = hashUrl(url);
  return cacheIndex.entries[hash] || null;
}

/**
 * Download and cache an image
 */
export async function cacheImage(url: string): Promise<CacheEntry | null> {
  const hash = hashUrl(url);

  // Already cached?
  if (cacheIndex.entries[hash]) {
    // Update last accessed
    cacheIndex.entries[hash].lastAccessed = new Date().toISOString();
    return cacheIndex.entries[hash];
  }

  // Already downloading?
  if (pendingDownloads.has(hash)) {
    return pendingDownloads.get(hash)!;
  }

  // Start download
  const downloadPromise = downloadAndCache(url, hash);
  pendingDownloads.set(hash, downloadPromise);

  try {
    const result = await downloadPromise;
    return result;
  } finally {
    pendingDownloads.delete(hash);
  }
}

/**
 * Download image and create thumbnails
 */
async function downloadAndCache(url: string, hash: string): Promise<CacheEntry | null> {
  try {
    log.debug('Downloading image', { url: url.substring(0, 100) });

    // Fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Glance/1.0; +https://github.com/glance)',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.warn('Failed to download image', { url: url.substring(0, 100), status: response.status });
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const ext = getExtension(url, contentType);
    const filename = `${hash}${ext}`;

    // Save original
    const buffer = Buffer.from(await response.arrayBuffer());
    const originalPath = path.join(ORIGINALS_DIR, filename);
    await fs.promises.writeFile(originalPath, buffer);

    // Get image dimensions
    let width: number | undefined;
    let height: number | undefined;

    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width;
      height = metadata.height;
    } catch {
      // Ignore metadata errors
    }

    // Generate thumbnails
    const thumbnails: CacheEntry['thumbnails'] = {};

    for (const [sizeName, sizeValue] of Object.entries(THUMB_SIZES)) {
      try {
        const thumbFilename = `${hash}_${sizeName}.jpg`;
        const thumbPath = path.join(THUMBS_DIR, thumbFilename);

        await sharp(buffer)
          .resize(sizeValue, sizeValue, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toFile(thumbPath);

        thumbnails[sizeName as keyof typeof thumbnails] = thumbFilename;
      } catch (error) {
        log.warn('Failed to generate thumbnail', { sizeName, error: getErrorMessage(error) });
      }
    }

    // Create cache entry
    const entry: CacheEntry = {
      urlHash: hash,
      originalUrl: url,
      filename,
      thumbnails,
      width,
      height,
      size: buffer.length,
      cachedAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
    };

    // Update index
    cacheIndex.entries[hash] = entry;
    cacheIndex.stats.totalImages++;
    cacheIndex.stats.totalSize += buffer.length;

    // Save index periodically (not on every image)
    if (cacheIndex.stats.totalImages % 10 === 0) {
      await saveIndex();
    }

    log.debug('Image cached', {
      hash,
      size: `${(buffer.length / 1024).toFixed(1)}KB`,
      thumbnails: Object.keys(thumbnails),
    });

    return entry;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      log.warn('Image download timed out', { url: url.substring(0, 100) });
    } else {
      log.warn('Failed to cache image', { url: url.substring(0, 100), error: getErrorMessage(error) });
    }
    return null;
  }
}

/**
 * Cache multiple images in the background
 */
export async function cacheImagesBackground(urls: string[]): Promise<void> {
  const uncached = urls.filter((url) => url && !isCached(url));

  if (uncached.length === 0) {
    return;
  }

  log.info('Background caching images', { count: uncached.length });

  // Cache in parallel with concurrency limit
  const concurrency = 3;
  const chunks: string[][] = [];

  for (let i = 0; i < uncached.length; i += concurrency) {
    chunks.push(uncached.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map((url) => cacheImage(url).catch(() => null)));
  }

  await saveIndex();
  log.info('Background caching complete', { cached: uncached.length });
}

/**
 * Get proxy URL for an image
 */
export function getProxyUrl(originalUrl: string, size?: 'small' | 'medium'): string {
  const params = new URLSearchParams({ url: originalUrl });
  if (size) {
    params.set('size', size);
  }
  return `/api/image-proxy?${params.toString()}`;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheIndex['stats'] & { cacheDir: string } {
  return {
    ...cacheIndex.stats,
    cacheDir: CACHE_DIR,
  };
}

/**
 * Clear old cache entries (older than 30 days)
 */
export async function cleanupCache(maxAgeDays: number = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffTime = cutoff.getTime();

  let removed = 0;

  for (const [hash, entry] of Object.entries(cacheIndex.entries)) {
    const lastAccessed = new Date(entry.lastAccessed).getTime();

    if (lastAccessed < cutoffTime) {
      // Remove files
      try {
        const originalPath = path.join(ORIGINALS_DIR, entry.filename);
        if (fs.existsSync(originalPath)) {
          await fs.promises.unlink(originalPath);
        }

        for (const thumbFile of Object.values(entry.thumbnails)) {
          if (thumbFile) {
            const thumbPath = path.join(THUMBS_DIR, thumbFile);
            if (fs.existsSync(thumbPath)) {
              await fs.promises.unlink(thumbPath);
            }
          }
        }

        // Update stats
        cacheIndex.stats.totalImages--;
        cacheIndex.stats.totalSize -= entry.size;

        // Remove from index
        delete cacheIndex.entries[hash];
        removed++;
      } catch (error) {
        log.warn('Failed to remove cache entry', { hash, error: getErrorMessage(error) });
      }
    }
  }

  if (removed > 0) {
    await saveIndex();
    log.info('Cache cleanup complete', { removed });
  }

  return removed;
}
