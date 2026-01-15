/**
 * Gallery API Routes
 * Today's Gallery with famous masterpieces
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { loggers } from '../services/logger';
import { TtlCache, TTL, getErrorMessage } from '../utils';
import type { Artwork } from '../types';

const log = loggers.api;

/** Masterpiece definition from data file */
interface Masterpiece {
  id: string;
  title: string;
  artist: string;
  date: string;
  source: string;
  searchQuery: string;
}

/** Masterpieces data file structure */
interface MasterpiecesData {
  description: string;
  masterpieces: Masterpiece[];
}

/** Gallery artwork response */
interface GalleryArtwork {
  id: string;
  title: string;
  artist: string;
  date: string;
  imageUrl: string;
  thumbnailUrl: string;
  source: string;
}

// Load masterpieces data
const MASTERPIECES_PATH = path.join(__dirname, '..', '..', '..', 'data', 'famous-masterpieces.json');
let masterpiecesData: MasterpiecesData = { description: '', masterpieces: [] };

try {
  if (fs.existsSync(MASTERPIECES_PATH)) {
    masterpiecesData = JSON.parse(fs.readFileSync(MASTERPIECES_PATH, 'utf8')) as MasterpiecesData;
    log.info('Loaded famous masterpieces', { count: masterpiecesData.masterpieces.length });
  }
} catch (error) {
  log.error('Failed to load famous masterpieces', {
    error: getErrorMessage(error),
  });
}

// Cache for gallery results (24 hour TTL for daily rotation)
const galleryCache = new TtlCache<GalleryArtwork[]>({ ttl: TTL.ONE_DAY });

// Cache for search results (1 hour TTL)
const searchCache = new TtlCache<Artwork | null>({ ttl: TTL.ONE_HOUR });

/**
 * Get a seeded random number generator for consistent daily selection
 */
function seededRandom(seed: number): () => number {
  return function () {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

/**
 * Get today's date seed (changes at midnight)
 */
function getTodaySeed(): number {
  const now = new Date();
  // Use UTC date to ensure consistency
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

/**
 * Select N items from array using seeded randomness
 * Tries to avoid selecting same artist twice
 */
function selectDailyMasterpieces(masterpieces: Masterpiece[], count: number, seed: number): Masterpiece[] {
  if (masterpieces.length === 0) return [];

  const random = seededRandom(seed);
  const selected: Masterpiece[] = [];
  const usedArtists = new Set<string>();
  const available = [...masterpieces];

  // Shuffle using seeded random
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [available[i], available[j]] = [available[j]!, available[i]!];
  }

  // Select items, preferring different artists
  for (const item of available) {
    if (selected.length >= count) break;

    // Prefer items from artists we haven't used yet
    if (!usedArtists.has(item.artist)) {
      selected.push(item);
      usedArtists.add(item.artist);
    }
  }

  // If we couldn't get enough with unique artists, fill with remaining
  if (selected.length < count) {
    for (const item of available) {
      if (selected.length >= count) break;
      if (!selected.includes(item)) {
        selected.push(item);
      }
    }
  }

  return selected;
}

/**
 * Search for artwork and convert to gallery format
 */
async function searchForArtwork(masterpiece: Masterpiece): Promise<GalleryArtwork | null> {
  // Check cache first
  const cacheKey = `search-${masterpiece.id}`;
  const cached = searchCache.get(cacheKey);
  if (cached !== undefined) {
    if (cached === null) return null;
    return {
      id: masterpiece.id,
      title: cached.title || masterpiece.title,
      artist: cached.artist || masterpiece.artist,
      date: cached.date || masterpiece.date,
      imageUrl: cached.imageUrl || '',
      thumbnailUrl: cached.thumbnailUrl || cached.imageUrl || '',
      source: cached.source || masterpiece.source,
    };
  }

  try {
    // Try OpenAI semantic search first for better results
    const openaiSearchModule = await import('../services/openai-search');
    const openaiSearch = openaiSearchModule.default;

    if (openaiSearch && openaiSearch.searchByText) {
      const results = await openaiSearch.searchByText(masterpiece.searchQuery, 1);
      if (results && results.length > 0) {
        const result = results[0]!;
        searchCache.set(cacheKey, result);
        return {
          id: masterpiece.id,
          title: result.title || masterpiece.title,
          artist: result.artist || masterpiece.artist,
          date: result.date || masterpiece.date,
          imageUrl: result.imageUrl || '',
          thumbnailUrl: result.thumbnailUrl || result.imageUrl || '',
          source: result.source || masterpiece.source,
        };
      }
    }
  } catch (searchError) {
    log.debug('OpenAI search failed for masterpiece, trying fallback', {
      id: masterpiece.id,
      error: searchError instanceof Error ? searchError.message : String(searchError),
    });
  }

  // Fallback to museum API
  try {
    const { performArtSearch } = await import('../services/museum-api');
    const results = await performArtSearch(masterpiece.searchQuery, 1);
    if (results.results && results.results.length > 0) {
      const result = results.results[0]!;
      searchCache.set(cacheKey, result);
      return {
        id: masterpiece.id,
        title: result.title || masterpiece.title,
        artist: result.artist || masterpiece.artist,
        date: result.date || masterpiece.date,
        imageUrl: result.imageUrl || '',
        thumbnailUrl: result.thumbnailUrl || result.imageUrl || '',
        source: result.source || masterpiece.source,
      };
    }
  } catch (fallbackError) {
    log.warn('Fallback search also failed for masterpiece', {
      id: masterpiece.id,
      error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
    });
  }

  // Cache null result to avoid repeated failed searches
  searchCache.set(cacheKey, null);
  return null;
}

/**
 * Create gallery router
 */
export function createGalleryRouter(): Router {
  const router = Router();

  /**
   * Get Today's Gallery
   * Returns 8 famous masterpieces, rotated daily
   * GET /api/gallery/today
   */
  router.get('/today', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const seed = getTodaySeed();
      const cacheKey = `today-${seed}`;

      // Check cache unless refresh requested
      if (!forceRefresh) {
        const cached = galleryCache.get(cacheKey);
        if (cached) {
          res.set('Cache-Control', 'public, max-age=300');
          res.json({
            date: new Date().toISOString().split('T')[0],
            artworks: cached,
            cached: true,
          });
          return;
        }
      }

      // Select today's masterpieces
      const selectedMasterpieces = selectDailyMasterpieces(masterpiecesData.masterpieces, 8, seed);

      // Search for each masterpiece in parallel
      const artworkPromises = selectedMasterpieces.map((m) => searchForArtwork(m));
      const artworkResults = await Promise.all(artworkPromises);

      // Filter out failed searches
      const artworks = artworkResults.filter((a): a is GalleryArtwork => a !== null && a.imageUrl !== '');

      // Cache results
      galleryCache.set(cacheKey, artworks);

      log.info('Generated Today\'s Gallery', {
        date: new Date().toISOString().split('T')[0],
        requested: selectedMasterpieces.length,
        found: artworks.length,
      });

      res.set('Cache-Control', 'public, max-age=300');
      res.json({
        date: new Date().toISOString().split('T')[0],
        artworks: artworks,
        cached: false,
      });
    } catch (error) {
      log.error('Error getting Today\'s Gallery', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Refresh Today's Gallery (force new selection)
   * POST /api/gallery/today/refresh
   */
  router.post('/today/refresh', async (_req: Request, res: Response) => {
    try {
      // Use a different seed for refresh (add random component)
      const baseSeed = getTodaySeed();
      const refreshSeed = baseSeed + Math.floor(Math.random() * 1000);

      // Select new masterpieces
      const selectedMasterpieces = selectDailyMasterpieces(masterpiecesData.masterpieces, 8, refreshSeed);

      // Search for each masterpiece in parallel
      const artworkPromises = selectedMasterpieces.map((m) => searchForArtwork(m));
      const artworkResults = await Promise.all(artworkPromises);

      // Filter out failed searches
      const artworks = artworkResults.filter((a): a is GalleryArtwork => a !== null && a.imageUrl !== '');

      // Update cache with new selection
      const cacheKey = `today-${baseSeed}`;
      galleryCache.set(cacheKey, artworks);

      log.info('Refreshed Today\'s Gallery', {
        found: artworks.length,
      });

      res.json({
        date: new Date().toISOString().split('T')[0],
        artworks: artworks,
        refreshed: true,
      });
    } catch (error) {
      log.error('Error refreshing Today\'s Gallery', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get all masterpieces (for debugging/admin)
   * GET /api/gallery/masterpieces
   */
  router.get('/masterpieces', (_req: Request, res: Response) => {
    res.json({
      count: masterpiecesData.masterpieces.length,
      masterpieces: masterpiecesData.masterpieces.map((m) => ({
        id: m.id,
        title: m.title,
        artist: m.artist,
        date: m.date,
      })),
    });
  });

  return router;
}

export default createGalleryRouter;
