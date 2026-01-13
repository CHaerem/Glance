/**
 * Collections API Routes
 * Curated art collection endpoints
 */

import { Router, Request, Response } from 'express';
import { CURATED_COLLECTIONS, CuratedArtwork } from '../services/museum-api';
import { loggers } from '../services/logger';
import { filterValidWikimediaArtworks, getWikimediaUrl } from '../utils/image-validator';

const log = loggers.api;

/** Collection list item response */
interface CollectionListItem {
  id: string;
  name: string;
  description: string;
  count: number;
}

/** Featured artwork response */
interface FeaturedArtwork {
  title: string;
  artist: string;
  year: string;
  imageUrl: string;
  thumbnail: string;
  source: string;
  popularity?: number;
  collectionId: string;
}

/** Collection artwork response */
interface CollectionArtwork {
  title: string;
  artist: string;
  imageUrl: string;
  thumbnail: string;
  source: string;
  year: string;
  popularity?: number;
}

/** Extended artwork with collection info */
interface ArtworkWithCollection extends CuratedArtwork {
  collectionId: string;
  collectionName: string;
}

/**
 * Create collections router
 */
export function createCollectionsRouter(): Router {
  const router = Router();

  /**
   * Get featured artworks (most popular, instantly loaded)
   * GET /api/collections/featured
   *
   * Returns all curated artworks without requiring cache validation.
   * Curated artworks are manually selected and should be reliable.
   */
  router.get('/featured', (_req: Request, res: Response) => {
    try {
      const limit = parseInt(_req.query.limit as string) || 20;

      // Collect all artworks from all curated collections
      // No validation required - curated collections are manually verified
      const allArtworks: ArtworkWithCollection[] = [];
      for (const [collectionId, collection] of Object.entries(CURATED_COLLECTIONS)) {
        for (const artwork of collection.artworks) {
          if (artwork.wikimedia) {
            allArtworks.push({
              ...artwork,
              collectionId,
              collectionName: collection.name,
            });
          }
        }
      }

      // Sort by popularity (highest first) and take top N
      const featured: FeaturedArtwork[] = allArtworks
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, limit)
        .map((artwork) => {
          const imageUrl = getWikimediaUrl(artwork.wikimedia!, 1200);
          return {
            title: artwork.title,
            artist: artwork.artist,
            year: artwork.year,
            imageUrl: imageUrl,
            thumbnail: getWikimediaUrl(artwork.wikimedia!, 400),
            source: 'curated',
            popularity: artwork.popularity,
            collectionId: artwork.collectionId,
          };
        });

      // Cache featured artworks for 10 minutes
      res.set('Cache-Control', 'public, max-age=600');
      res.json({ artworks: featured });
    } catch (error) {
      log.error('Error getting featured artworks', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get curated collections list
   * GET /api/collections
   */
  router.get('/', (_req: Request, res: Response) => {
    try {
      const collections: CollectionListItem[] = Object.entries(CURATED_COLLECTIONS).map(
        ([id, collection]) => ({
          id,
          name: collection.name,
          description: collection.description,
          count: collection.artworks.length,
        })
      );

      // Cache collections list for 10 minutes
      res.set('Cache-Control', 'public, max-age=600');
      res.json({ collections });
    } catch (error) {
      log.error('Error getting collections', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get artworks from a specific collection
   * GET /api/collections/:collectionId
   */
  router.get('/:collectionId', async (req: Request, res: Response) => {
    try {
      const collectionId = req.params.collectionId;
      if (!collectionId) {
        res.status(400).json({ error: 'Collection ID required' });
        return;
      }
      const collection = CURATED_COLLECTIONS[collectionId];

      if (!collection) {
        res.status(404).json({ error: 'Collection not found' });
        return;
      }

      // Validate Wikimedia images and filter out broken ones
      const validatedArtworks = await filterValidWikimediaArtworks(collection.artworks);

      // Convert artworks to response format
      const artworks: CollectionArtwork[] = validatedArtworks.map((artwork) => {
        const imageUrl = getWikimediaUrl(artwork.wikimedia!, 1200);
        return {
          title: `${artwork.title} (${artwork.year})`,
          artist: artwork.artist,
          imageUrl: imageUrl,
          thumbnail: imageUrl,
          source: 'curated',
          year: artwork.year,
          popularity: artwork.popularity,
        };
      });

      // Cache specific collection for 10 minutes
      res.set('Cache-Control', 'public, max-age=600');
      res.json({
        id: collectionId,
        name: collection.name,
        description: collection.description,
        artworks: artworks,
      });
    } catch (error) {
      log.error('Error getting collection', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createCollectionsRouter;
