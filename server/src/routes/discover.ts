/**
 * Discover API Routes
 * Curated exploration experience for the Glance art gallery
 */

import { Router, Request, Response } from 'express';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils';
import { Artwork } from '../types';
import {
  isLocalLibraryAvailable,
  getAvailableMovements,
  getRandomLocalArtworks,
  getArtworksByMovement,
  getLibraryStats,
} from '../services/local-library';

const log = loggers.api;

// Movement metadata for display
const MOVEMENT_INFO: Record<string, { name: string; period: string; description: string; color: string }> = {
  'renaissance': {
    name: 'Renaissance',
    period: '14th-17th century',
    description: 'Rebirth of classical ideals, perspective, and humanism',
    color: '#8B4513',
  },
  'baroque': {
    name: 'Baroque',
    period: '17th-18th century',
    description: 'Drama, rich color, and grandeur in art and architecture',
    color: '#4A0E0E',
  },
  'rococo': {
    name: 'Rococo',
    period: '18th century',
    description: 'Ornate elegance, pastel colors, and playful themes',
    color: '#D4A5A5',
  },
  'romanticism': {
    name: 'Romanticism',
    period: 'Late 18th-19th century',
    description: 'Emotion, nature, and the sublime over reason',
    color: '#2C3E50',
  },
  'realism': {
    name: 'Realism',
    period: '19th century',
    description: 'Everyday life depicted without idealization',
    color: '#5D4E37',
  },
  'impressionism': {
    name: 'Impressionism',
    period: '1860s-1880s',
    description: 'Light, color, and movement captured in fleeting moments',
    color: '#87CEEB',
  },
  'post-impressionism': {
    name: 'Post-Impressionism',
    period: '1880s-1910s',
    description: 'Bold colors and expressive forms beyond Impressionism',
    color: '#FF6B35',
  },
  'symbolism': {
    name: 'Symbolism',
    period: '1880s-1910s',
    description: 'Dreams, myths, and the mysterious inner world',
    color: '#6B5B95',
  },
  'art-nouveau': {
    name: 'Art Nouveau',
    period: '1890-1910',
    description: 'Organic forms, flowing lines, and decorative beauty',
    color: '#228B22',
  },
  'expressionism': {
    name: 'Expressionism',
    period: '1905-1920s',
    description: 'Raw emotion and psychological intensity',
    color: '#DC143C',
  },
  'fauvism': {
    name: 'Fauvism',
    period: '1904-1908',
    description: 'Wild, vivid colors freed from reality',
    color: '#FF4500',
  },
  'cubism': {
    name: 'Cubism',
    period: '1907-1920s',
    description: 'Fragmented forms and multiple perspectives',
    color: '#696969',
  },
  'surrealism': {
    name: 'Surrealism',
    period: '1920s-1950s',
    description: 'Dreams, the unconscious, and impossible realities',
    color: '#9932CC',
  },
  'abstract-expressionism': {
    name: 'Abstract Expressionism',
    period: '1940s-1950s',
    description: 'Spontaneous, emotional abstraction on large canvases',
    color: '#1A1A1A',
  },
  'pop-art': {
    name: 'Pop Art',
    period: '1950s-1960s',
    description: 'Mass culture, consumerism, and bold graphics',
    color: '#FF1493',
  },
  'minimalism': {
    name: 'Minimalism',
    period: '1960s-1970s',
    description: 'Simplicity, geometric forms, and essential elements',
    color: '#F5F5F5',
  },
};

// Time-based mood suggestions
function getMoodForTime(): { mood: string; query: string; description: string } {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 9) {
    return { mood: 'morning calm', query: 'serene landscape sunrise', description: 'Peaceful scenes to start your day' };
  } else if (hour >= 9 && hour < 12) {
    return { mood: 'bright energy', query: 'vibrant colorful impressionist', description: 'Energizing colors for the morning' };
  } else if (hour >= 12 && hour < 14) {
    return { mood: 'midday pause', query: 'garden flowers nature', description: 'Natural beauty for your break' };
  } else if (hour >= 14 && hour < 17) {
    return { mood: 'afternoon focus', query: 'geometric abstract modern', description: 'Clean lines and bold forms' };
  } else if (hour >= 17 && hour < 20) {
    return { mood: 'golden hour', query: 'sunset warm golden light', description: 'Warm tones as the day winds down' };
  } else if (hour >= 20 && hour < 23) {
    return { mood: 'evening contemplation', query: 'night stars mysterious', description: 'Reflective and atmospheric works' };
  } else {
    return { mood: 'night owl', query: 'dark moody dramatic', description: 'Deep, contemplative pieces for late hours' };
  }
}

/**
 * Create discover router
 */
export function createDiscoverRouter(): Router {
  const router = Router();

  /**
   * Get curated discovery feed
   * Returns featured content, movements, and recommendations
   * GET /api/discover
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const libraryAvailable = isLocalLibraryAvailable();
      const stats = libraryAvailable ? await getLibraryStats() : null;
      const movements = libraryAvailable ? await getAvailableMovements() : [];

      // Get featured movement (rotates daily)
      const today = new Date();
      const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
      const featuredMovementIndex = dayOfYear % movements.length;
      const featuredMovement = movements[featuredMovementIndex];

      // Get featured artworks from that movement
      let featuredArtworks: Artwork[] = [];
      if (featuredMovement) {
        featuredArtworks = await getArtworksByMovement(featuredMovement.id, 4);
      }

      // Get time-based mood suggestion
      const mood = getMoodForTime();

      // Enrich movements with metadata
      const enrichedMovements = movements.map(m => ({
        ...m,
        ...(MOVEMENT_INFO[m.id] || { name: m.id, period: '', description: '', color: '#666' }),
      }));

      res.json({
        libraryAvailable,
        stats,
        featured: featuredMovement ? {
          movement: {
            ...featuredMovement,
            ...(MOVEMENT_INFO[featuredMovement.id] || {}),
          },
          artworks: featuredArtworks,
        } : null,
        mood,
        movements: enrichedMovements,
      });
    } catch (error) {
      log.error('Error getting discover feed', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get movements with artwork counts
   * GET /api/discover/movements
   */
  router.get('/movements', async (_req: Request, res: Response) => {
    try {
      if (!isLocalLibraryAvailable()) {
        res.json({ movements: [], available: false });
        return;
      }

      const movements = await getAvailableMovements();

      // Enrich with metadata
      const enriched = movements.map(m => ({
        id: m.id,
        count: m.count,
        ...(MOVEMENT_INFO[m.id] || { name: m.id, period: '', description: '', color: '#666' }),
      }));

      res.json({ movements: enriched, available: true });
    } catch (error) {
      log.error('Error getting movements', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get artworks from a specific movement
   * GET /api/discover/movements/:id
   */
  router.get('/movements/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      if (!id) {
        res.status(400).json({ error: 'Movement ID required' });
        return;
      }

      if (!isLocalLibraryAvailable()) {
        res.status(404).json({ error: 'Local library not available' });
        return;
      }

      const artworks = await getArtworksByMovement(id, limit);
      const movementInfo = MOVEMENT_INFO[id] || { name: id, period: '', description: '', color: '#666' };

      res.json({
        movement: { id, ...movementInfo },
        artworks,
        count: artworks.length,
      });
    } catch (error) {
      log.error('Error getting movement artworks', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get random discovery picks
   * GET /api/discover/random
   */
  router.get('/random', async (req: Request, res: Response) => {
    try {
      const count = Math.min(parseInt(req.query.count as string) || 8, 20);
      const movement = req.query.movement as string | undefined;

      if (!isLocalLibraryAvailable()) {
        res.json({ artworks: [], available: false });
        return;
      }

      const artworks = await getRandomLocalArtworks(count, movement);

      res.json({ artworks, count: artworks.length });
    } catch (error) {
      log.error('Error getting random artworks', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get mood-based suggestions
   * GET /api/discover/mood
   */
  router.get('/mood', async (_req: Request, res: Response) => {
    try {
      const mood = getMoodForTime();

      // Get some random artworks that might match the mood
      let artworks: Artwork[] = [];
      if (isLocalLibraryAvailable()) {
        artworks = await getRandomLocalArtworks(6);
      }

      res.json({
        ...mood,
        artworks,
      });
    } catch (error) {
      log.error('Error getting mood suggestions', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createDiscoverRouter;
