/**
 * Image Proxy Routes
 *
 * Serves cached images from local disk.
 * Downloads and caches on first request.
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  cacheImage,
  getCachedPath,
  getCacheStats,
  isCached,
} from '../services/image-cache';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils';

const log = loggers.api;

export function createImageProxyRouter(): Router {
  const router = Router();

  /**
   * GET /api/image-proxy
   * Proxy and cache remote images
   *
   * Query params:
   * - url: Original image URL (required)
   * - size: 'small' (200px) or 'medium' (400px) for thumbnail
   */
  router.get('/', async (req: Request, res: Response) => {
    const { url, size } = req.query;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Missing url parameter' });
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    // Validate size
    const thumbSize = size === 'small' || size === 'medium' ? size : undefined;

    try {
      // Check if already cached
      let cachedPath = getCachedPath(url, thumbSize);

      if (!cachedPath) {
        // Download and cache
        const entry = await cacheImage(url);

        if (!entry) {
          // Failed to cache - redirect to original
          res.redirect(url);
          return;
        }

        cachedPath = getCachedPath(url, thumbSize);
      }

      if (!cachedPath || !fs.existsSync(cachedPath)) {
        // Fallback to original
        res.redirect(url);
        return;
      }

      // Serve from cache
      const ext = path.extname(cachedPath).toLowerCase();
      const contentType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : 'image/jpeg';

      // Set cache headers (cache for 1 year since content won't change)
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Cache', isCached(url) ? 'HIT' : 'MISS');

      // Stream file
      const stream = fs.createReadStream(cachedPath);
      stream.pipe(res);
    } catch (error) {
      log.error('Image proxy error', { url: url.substring(0, 100), error: getErrorMessage(error) });
      // Fallback to redirect
      res.redirect(url);
    }
  });

  /**
   * GET /api/image-proxy/stats
   * Get cache statistics
   */
  router.get('/stats', (_req: Request, res: Response) => {
    const stats = getCacheStats();
    res.json({
      images: stats.totalImages,
      size: stats.totalSize,
      sizeFormatted: `${(stats.totalSize / 1024 / 1024).toFixed(1)} MB`,
      cacheDir: stats.cacheDir,
      lastUpdated: stats.lastUpdated,
    });
  });

  return router;
}
