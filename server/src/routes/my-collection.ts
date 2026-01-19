/**
 * My Collection Routes
 * Personal art collection and taste-based recommendations
 */

import { Router, Request, Response } from 'express';
import tasteGuideService from '../services/taste-guide';
import { performArtSearch } from '../services/museum-api';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils/error';
import type { Artwork } from '../types';

const log = loggers.api.child({ component: 'my-collection' });

/**
 * Create my-collection router
 */
export function createMyCollectionRouter(): Router {
  const router = Router();

  /**
   * Get the user's collection
   * GET /api/my-collection
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const collection = await tasteGuideService.getCollection();
      res.json({
        count: collection.length,
        artworks: collection.map((item) => ({
          id: item.id,
          title: item.title,
          artist: item.artist,
          date: item.date,
          source: item.source,
          imageUrl: item.imageUrl,
          thumbnailUrl: item.thumbnailUrl,
          addedAt: item.addedAt,
          reframe: item.reframe,  // Include saved crop/zoom settings
        })),
      });
    } catch (error) {
      log.error('Failed to get collection', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to get collection' });
    }
  });

  /**
   * Add artwork to collection
   * POST /api/my-collection
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const artwork = req.body as Artwork;

      if (!artwork.title || !artwork.imageUrl) {
        res.status(400).json({ error: 'Artwork must have title and imageUrl' });
        return;
      }

      // Generate ID if not provided
      if (!artwork.id) {
        artwork.id = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      }

      const result = await tasteGuideService.addToCollection(artwork);
      res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
      log.error('Failed to add to collection', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to add artwork to collection' });
    }
  });

  /**
   * Remove artwork from collection
   * DELETE /api/my-collection/:artworkId
   */
  router.delete('/:artworkId', async (req: Request, res: Response) => {
    try {
      const artworkId = req.params.artworkId;
      if (!artworkId) {
        res.status(400).json({ error: 'Artwork ID required' });
        return;
      }

      const result = await tasteGuideService.removeFromCollection(artworkId);
      res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      log.error('Failed to remove from collection', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to remove artwork from collection' });
    }
  });

  /**
   * Update reframe settings for a collection item
   * PATCH /api/my-collection/:artworkId/reframe
   */
  router.patch('/:artworkId/reframe', async (req: Request, res: Response) => {
    try {
      const artworkId = req.params.artworkId;
      const { reframe } = req.body;

      if (!artworkId) {
        res.status(400).json({ error: 'Artwork ID required' });
        return;
      }

      if (!reframe || typeof reframe !== 'object') {
        res.status(400).json({ error: 'Reframe settings required' });
        return;
      }

      const result = await tasteGuideService.updateReframe(artworkId, reframe);
      res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      log.error('Failed to update reframe', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to update reframe settings' });
    }
  });

  /**
   * Check if artwork is in collection
   * GET /api/my-collection/check/:artworkId
   */
  router.get('/check/:artworkId', async (req: Request, res: Response) => {
    try {
      const artworkId = req.params.artworkId;
      if (!artworkId) {
        res.status(400).json({ error: 'Artwork ID required' });
        return;
      }

      const isInCollection = await tasteGuideService.isInCollection(artworkId);
      res.json({ inCollection: isInCollection });
    } catch (error) {
      log.error('Failed to check collection', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to check collection' });
    }
  });

  /**
   * Get taste profile
   * GET /api/my-collection/taste-profile
   */
  router.get('/taste-profile', async (_req: Request, res: Response) => {
    try {
      const profile = await tasteGuideService.getTasteProfile();

      if (!profile) {
        res.json({
          hasProfile: false,
          message: 'Add at least one artwork to your collection to build your taste profile',
        });
        return;
      }

      res.json({
        hasProfile: true,
        profile,
      });
    } catch (error) {
      log.error('Failed to get taste profile', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to get taste profile' });
    }
  });

  /**
   * Get personalized recommendations
   * GET /api/my-collection/recommendations
   */
  router.get('/recommendations', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 12;

      // Search function wrapper for the taste guide service
      const searchFn = async (query: string, searchLimit: number): Promise<Artwork[]> => {
        const result = await performArtSearch(query, searchLimit);
        return result.results || [];
      };

      const recommendations = await tasteGuideService.getRecommendations(searchFn, limit);

      if (recommendations.length === 0) {
        res.json({
          hasRecommendations: false,
          message: 'Add artworks to your collection to get personalized recommendations',
          recommendations: [],
        });
        return;
      }

      res.json({
        hasRecommendations: true,
        count: recommendations.length,
        recommendations,
      });
    } catch (error) {
      log.error('Failed to get recommendations', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to get recommendations' });
    }
  });

  /**
   * Get collection summary (for chat context)
   * GET /api/my-collection/summary
   */
  router.get('/summary', async (_req: Request, res: Response) => {
    try {
      const summary = await tasteGuideService.getCollectionSummary();
      res.json({ summary });
    } catch (error) {
      log.error('Failed to get collection summary', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to get collection summary' });
    }
  });

  return router;
}

export default createMyCollectionRouter;
