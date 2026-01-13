/**
 * Semantic Search API Routes
 * Art discovery using OpenAI Vector Stores + file_search
 * With intelligent fallback to museum API keyword search
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import openaiSearch from '../services/openai-search';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils/error';

const log = loggers.api;

/** Search result artwork */
interface SearchResultArtwork {
  id: string;
  title: string;
  artist: string;
  date?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  score?: number;
}

/** Interaction record */
interface Interaction {
  artworkId: string;
  action: 'like' | 'display' | 'skip' | 'dislike';
  metadata: {
    title?: string;
    artist?: string;
    style?: string;
    [key: string]: unknown;
  };
  timestamp: number;
}

/** Artwork to index */
interface ArtworkToIndex {
  id: string;
  imageUrl: string;
  title?: string;
  artist?: string;
  date?: string;
  source?: string;
  thumbnailUrl?: string;
}

const INTERACTIONS_FILE = path.join(__dirname, '..', '..', '..', 'data', 'user-interactions.json');

/**
 * Record user interaction
 */
async function recordInteraction(
  artworkId: string,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    let interactions: Interaction[] = [];
    try {
      const data = await fs.readFile(INTERACTIONS_FILE, 'utf8');
      interactions = JSON.parse(data) as Interaction[];
    } catch {
      // File doesn't exist yet
    }

    interactions.push({
      artworkId,
      action: action as Interaction['action'],
      metadata: {
        title: (metadata.title as string) || '',
        artist: (metadata.artist as string) || '',
        style: (metadata.style as string) || '',
        ...metadata,
      },
      timestamp: Date.now(),
    });

    // Keep last 100 interactions
    if (interactions.length > 100) {
      interactions = interactions.slice(-100);
    }

    await fs.mkdir(path.dirname(INTERACTIONS_FILE), { recursive: true });
    await fs.writeFile(INTERACTIONS_FILE, JSON.stringify(interactions, null, 2));
  } catch (error) {
    log.error('Failed to record interaction', {
      error: getErrorMessage(error),
    });
  }
}

/**
 * Get user interaction history
 */
async function getUserInteractionHistory(): Promise<Interaction[]> {
  try {
    const data = await fs.readFile(INTERACTIONS_FILE, 'utf8');
    const interactions = JSON.parse(data) as Interaction[];

    // Filter to positive interactions (like, display)
    // Weight: like = 2x, display = 1x
    const weighted: Interaction[] = [];
    for (const interaction of interactions) {
      if (interaction.action === 'like') {
        weighted.push(interaction);
        weighted.push(interaction); // Add twice for higher weight
      } else if (interaction.action === 'display') {
        weighted.push(interaction);
      }
    }

    return weighted;
  } catch {
    return [];
  }
}

/**
 * Build a natural language taste query from user interactions
 */
async function buildTasteQuery(interactions: Interaction[]): Promise<string> {
  // Extract unique artists, styles, and keywords from interactions
  const artists = new Map<string, number>();
  const styles = new Map<string, number>();

  for (const interaction of interactions) {
    const meta = interaction.metadata || {};

    if (meta.artist) {
      artists.set(meta.artist, (artists.get(meta.artist) || 0) + 1);
    }

    if (meta.style) {
      styles.set(meta.style, (styles.get(meta.style) || 0) + 1);
    }
  }

  // Sort by frequency and take top items
  const topArtists = [...artists.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  const topStyles = [...styles.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([style]) => style);

  // Build natural language query
  const queryParts: string[] = [];

  if (topArtists.length > 0) {
    queryParts.push(`artworks by or similar to ${topArtists.join(', ')}`);
  }

  if (topStyles.length > 0) {
    queryParts.push(`in ${topStyles.join(' or ')} style`);
  }

  if (queryParts.length === 0) {
    // Fallback to a generic discovery query if no patterns found
    return 'beautiful classical art masterpieces';
  }

  return queryParts.join(' ');
}

/**
 * Create semantic search router
 */
export function createSemanticSearchRouter(): Router {
  const router = Router();

  /**
   * Search artworks by natural language query (semantic search)
   * POST /api/semantic/search
   */
  router.post('/search', async (req: Request, res: Response) => {
    try {
      const { query, limit = 20 } = req.body as { query?: string; limit?: number | string };

      if (!query) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }

      log.debug('Semantic search', { query });

      // Search using OpenAI (with automatic fallback)
      const results = await openaiSearch.searchByText(query, parseInt(String(limit)));

      res.json({
        results: results.map((r: SearchResultArtwork) => ({
          id: r.id,
          title: r.title,
          artist: r.artist,
          date: r.date,
          imageUrl: r.imageUrl,
          thumbnailUrl: r.thumbnailUrl,
          similarity: r.score,
        })),
        metadata: {
          query,
          resultsCount: results.length,
          searchType: 'semantic',
          model: 'OpenAI',
        },
      });
    } catch (error) {
      log.error('Semantic search error', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  /**
   * Find visually similar artworks
   * POST /api/semantic/similar
   */
  router.post('/similar', async (req: Request, res: Response) => {
    try {
      const { artworkId, limit = 20 } = req.body as { artworkId?: string; limit?: number | string };

      if (!artworkId) {
        res.status(400).json({ error: 'artworkId is required' });
        return;
      }

      log.debug('Finding similar artwork', { artworkId });

      // Find similar artworks
      const results = await openaiSearch.searchSimilar(artworkId, parseInt(String(limit)));

      res.json({
        results: results.map((r: SearchResultArtwork) => ({
          id: r.id,
          title: r.title,
          artist: r.artist,
          date: r.date,
          imageUrl: r.imageUrl,
          thumbnailUrl: r.thumbnailUrl,
          similarity: r.score,
        })),
        metadata: {
          sourceArtworkId: artworkId,
          resultsCount: results.length,
          searchType: 'similar',
          model: 'OpenAI',
        },
      });
    } catch (error) {
      log.error('Similar artwork error', {
        error: getErrorMessage(error),
      });

      if (error instanceof Error && error.message === 'Artwork not found') {
        res.status(404).json({ error: 'Artwork not found' });
        return;
      }

      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  /**
   * Get search service statistics
   * GET /api/semantic/stats
   */
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await openaiSearch.getStats();
      res.json(stats);
    } catch (error) {
      log.error('Stats error', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  /**
   * Get personalized recommendations based on user taste profile
   * GET /api/semantic/recommendations?limit=20
   */
  router.get('/recommendations', async (req: Request, res: Response) => {
    try {
      const limitParam = (req.query.limit as string | undefined) || '20';

      // Get user's interaction history
      const interactions = await getUserInteractionHistory();

      if (interactions.length === 0) {
        res.json({
          results: [],
          metadata: {
            message: 'No interaction history yet. Display or like some artworks first!',
            searchType: 'personalized',
          },
        });
        return;
      }

      log.debug('Building taste profile', { interactionCount: interactions.length });

      // Build taste query from interaction patterns
      const tasteQuery = await buildTasteQuery(interactions);

      log.debug('Taste query', { query: tasteQuery });

      // Search for artworks matching taste profile
      const results = await openaiSearch.searchByText(tasteQuery, parseInt(limitParam));

      // Filter out artworks the user has already interacted with
      const interactedIds = new Set(interactions.map((i) => i.artworkId));
      const filtered = results.filter((r: SearchResultArtwork) => !interactedIds.has(r.id));

      log.debug('Found personalized recommendations', { count: filtered.length });

      res.json({
        results: filtered.map((r: SearchResultArtwork) => ({
          id: r.id,
          title: r.title,
          artist: r.artist,
          date: r.date,
          imageUrl: r.imageUrl,
          thumbnailUrl: r.thumbnailUrl,
          matchScore: r.score,
        })),
        metadata: {
          interactionCount: interactions.length,
          resultsCount: filtered.length,
          searchType: 'personalized',
          tasteQuery,
        },
      });
    } catch (error) {
      log.error('Recommendations error', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  /**
   * Record user interaction (like, display, skip)
   * POST /api/semantic/interaction
   */
  router.post('/interaction', async (req: Request, res: Response) => {
    try {
      const { artworkId, action, metadata = {} } = req.body as {
        artworkId?: string;
        action?: string;
        metadata?: Record<string, unknown>;
      };

      if (!artworkId || !action) {
        res.status(400).json({ error: 'artworkId and action are required' });
        return;
      }

      if (!['like', 'display', 'skip', 'dislike'].includes(action)) {
        res.status(400).json({ error: 'Invalid action type' });
        return;
      }

      // Store interaction with metadata for taste profile building
      await recordInteraction(artworkId, action, metadata);

      res.json({ success: true });
    } catch (error) {
      log.error('Interaction recording error', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  /**
   * Index a single artwork (admin/dev use)
   * POST /api/semantic/index
   */
  router.post('/index', async (req: Request, res: Response) => {
    try {
      const artwork = req.body as ArtworkToIndex;

      if (!artwork.id || !artwork.imageUrl) {
        res.status(400).json({ error: 'id and imageUrl are required' });
        return;
      }

      // Note: indexArtwork is not implemented in the current OpenAI search service
      // This endpoint is a placeholder for future functionality
      log.warn('Index endpoint called but indexing is not implemented', { artworkId: artwork.id });

      res.json({
        success: true,
        message: `Index request received for: ${artwork.title} (indexing not implemented)`,
      });
    } catch (error) {
      log.error('Index error', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  return router;
}

export default createSemanticSearchRouter;
