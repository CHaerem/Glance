/**
 * Playlists API Routes
 * Curated and dynamic playlist endpoints
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { loggers } from '../services/logger';
import { filterValidWikimediaArtworks, getWikimediaUrl, TtlCache, TTL, getErrorMessage } from '../utils';
import type { Artwork } from '../types';

const log = loggers.api;

/** Playlist artwork structure */
interface PlaylistArtwork {
  title: string;
  artist: string;
  year: string;
  wikimedia: string;
}

/** Playlist definition */
interface Playlist {
  id: string;
  name: string;
  type: 'classic' | 'dynamic' | 'seasonal';
  description: string;
  source?: string;
  searchQuery?: string;
  artworks?: PlaylistArtwork[];
}

/** Playlists data file structure */
interface PlaylistsData {
  playlists: Playlist[];
}

/** Playlist list item response */
interface PlaylistListItem {
  id: string;
  name: string;
  type: string;
  description: string;
  source: string | null;
  preview: string | null;
  artworkCount: number | null;
}

/** Artwork response */
interface ArtworkResponse {
  title: string;
  artist: string;
  year?: string;
  imageUrl: string;
  thumbnail: string;
  source: string;
}

// Load playlists data
const PLAYLISTS_PATH = path.join(__dirname, '..', '..', 'data', 'playlists.json');
let playlistsData: PlaylistsData = { playlists: [] };

try {
  if (fs.existsSync(PLAYLISTS_PATH)) {
    playlistsData = JSON.parse(fs.readFileSync(PLAYLISTS_PATH, 'utf8')) as PlaylistsData;
    log.info('Loaded playlists', { count: playlistsData.playlists.length });
  }
} catch (error) {
  log.error('Failed to load playlists', {
    error: getErrorMessage(error),
  });
}

// Cache for dynamic playlist results (1 hour TTL)
const dynamicCache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_HOUR });

/**
 * Create playlists router
 */
export function createPlaylistsRouter(): Router {
  const router = Router();

  /**
   * Get all playlists (metadata only)
   * GET /api/playlists
   */
  router.get('/', (_req: Request, res: Response) => {
    try {
      const playlists: PlaylistListItem[] = playlistsData.playlists.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        description: p.description,
        source: p.source || null,
        // Include preview image (first artwork for classic, null for dynamic)
        preview:
          p.artworks && p.artworks.length > 0
            ? `https://commons.wikimedia.org/wiki/Special:FilePath/${p.artworks[0]!.wikimedia}?width=400`
            : null,
        artworkCount: p.artworks ? p.artworks.length : null,
      }));

      // Cache playlist metadata for 5 minutes (rarely changes)
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ playlists });
    } catch (error) {
      log.error('Error getting playlists', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get artworks from a specific playlist
   * GET /api/playlists/:playlistId
   */
  router.get('/:playlistId', async (req: Request, res: Response) => {
    try {
      const playlistId = req.params.playlistId;
      if (!playlistId) {
        res.status(400).json({ error: 'Playlist ID required' });
        return;
      }

      const playlist = playlistsData.playlists.find((p) => p.id === playlistId);

      if (!playlist) {
        res.status(404).json({ error: 'Playlist not found' });
        return;
      }

      // Classic playlist - return static artworks with validated images
      if (playlist.type === 'classic' && playlist.artworks) {
        // Validate Wikimedia images and filter out broken ones
        const validatedArtworks = await filterValidWikimediaArtworks(playlist.artworks);

        const artworks: ArtworkResponse[] = validatedArtworks.map((artwork) => {
          const imageUrl = getWikimediaUrl(artwork.wikimedia, 1200);
          return {
            title: artwork.title,
            artist: artwork.artist,
            year: artwork.year,
            imageUrl: imageUrl,
            thumbnail: getWikimediaUrl(artwork.wikimedia, 400),
            source: 'curated',
          };
        });

        // Cache classic playlists for 10 minutes (static content)
        res.set('Cache-Control', 'public, max-age=600');
        res.json({
          id: playlist.id,
          name: playlist.name,
          type: playlist.type,
          description: playlist.description,
          source: playlist.source,
          artworks: artworks,
        });
        return;
      }

      // Dynamic playlist - use AI search
      if ((playlist.type === 'dynamic' || playlist.type === 'seasonal') && playlist.searchQuery) {
        // Check cache
        const cacheKey = `${playlistId}-${playlist.searchQuery}`;
        const cachedArtworks = dynamicCache.get(cacheKey);
        if (cachedArtworks) {
          res.set('Cache-Control', 'public, max-age=300');
          res.json({
            id: playlist.id,
            name: playlist.name,
            type: playlist.type,
            description: playlist.description,
            artworks: cachedArtworks,
            cached: true,
          });
          return;
        }

        // Use OpenAI search if available
        let artworks: Artwork[] = [];
        try {
          // Dynamic import to avoid circular dependencies
          const openaiSearchModule = await import('../services/openai-search');
          const openaiSearch = openaiSearchModule.default;
          if (openaiSearch && openaiSearch.searchByText) {
            const results = await openaiSearch.searchByText(playlist.searchQuery, 20);
            artworks = results || [];
          }
        } catch (searchError) {
          log.warn('Dynamic playlist search failed, using fallback', {
            playlistId,
            error: searchError instanceof Error ? searchError.message : String(searchError),
          });

          // Fallback to museum API keyword search
          try {
            const { performArtSearch } = await import('../services/museum-api');
            const results = await performArtSearch(playlist.searchQuery, 20);
            artworks = results.results || [];
          } catch (fallbackError) {
            log.error('Fallback search also failed', {
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            });
          }
        }

        // Cache results
        dynamicCache.set(cacheKey, artworks);

        // Cache dynamic playlists for 5 minutes on client
        res.set('Cache-Control', 'public, max-age=300');
        res.json({
          id: playlist.id,
          name: playlist.name,
          type: playlist.type,
          description: playlist.description,
          artworks: artworks,
          cached: false,
        });
        return;
      }

      // Fallback
      res.json({
        id: playlist.id,
        name: playlist.name,
        type: playlist.type,
        description: playlist.description,
        artworks: [],
      });
    } catch (error) {
      log.error('Error getting playlist', {
        playlistId: req.params.playlistId,
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Refresh a dynamic playlist (clear cache and refetch)
   * POST /api/playlists/:playlistId/refresh
   */
  router.post('/:playlistId/refresh', async (req: Request, res: Response) => {
    try {
      const playlistId = req.params.playlistId;
      if (!playlistId) {
        res.status(400).json({ error: 'Playlist ID required' });
        return;
      }

      const playlist = playlistsData.playlists.find((p) => p.id === playlistId);

      if (!playlist) {
        res.status(404).json({ error: 'Playlist not found' });
        return;
      }

      if (playlist.type === 'classic') {
        res.status(400).json({ error: 'Classic playlists cannot be refreshed' });
        return;
      }

      // Clear cache for this playlist
      dynamicCache.deleteByPrefix(playlistId);

      // Redirect to GET to fetch fresh results
      res.redirect(`/api/playlists/${playlistId}`);
    } catch (error) {
      log.error('Error refreshing playlist', {
        playlistId: req.params.playlistId,
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createPlaylistsRouter;
