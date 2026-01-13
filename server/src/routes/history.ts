/**
 * History API Routes
 * Image history, my collection, and playlist management
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import imageProcessing from '../services/image-processing';
import { readJSONFile, writeJSONFile, ensureDir } from '../utils/data-store';
import { addDeviceLog } from '../utils/state';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils/error';
import { apiKeyAuth } from '../middleware/auth';
import type { ServerSettings, PlaylistData } from '../types';

const log = loggers.api;

/** History route dependencies */
export interface HistoryRouteDeps {
  uploadDir: string;
}

/** History item in history.json */
interface HistoryItem {
  imageId: string;
  title?: string;
  artist?: string;
  source?: string;
  addedToCollection?: number;
}

/** Image data in archive */
interface ImageData {
  title?: string;
  artist?: string;
  image?: string;
  originalImage?: string;
  rotation?: number;
  sourceUrl?: string;
  originalUrl?: string;
}

/** Collection item */
interface CollectionItem {
  id: string;
  imageUrl: string;
  title: string;
  artist: string;
  year?: string;
  thumbnail?: string;
  collectionId?: string;
  wikimedia?: string;
  addedToCollection: number;
}

/**
 * Create history routes
 */
export function createHistoryRoutes({ uploadDir }: HistoryRouteDeps): Router {
  const router = Router();

  /**
   * Get image history
   * GET /api/history
   */
  router.get('/history', async (_req: Request, res: Response) => {
    try {
      const history: HistoryItem[] = (await readJSONFile('history.json')) || [];
      res.json(history);
    } catch (error) {
      log.error('Error getting history', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get full image data by ID
   * GET /api/images/:imageId
   */
  router.get('/images/:imageId', async (req: Request, res: Response) => {
    try {
      const { imageId } = req.params;
      const imagesArchive: Record<string, ImageData> = (await readJSONFile('images.json')) || {};

      if (!imageId || !imagesArchive[imageId]) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }

      res.json(imagesArchive[imageId]);
    } catch (error) {
      log.error('Error getting image', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Load image from history by ID
   * POST /api/history/:imageId/load
   */
  router.post('/history/:imageId/load', async (req: Request, res: Response) => {
    try {
      const { imageId } = req.params;
      const { rotation, cropX, cropY, zoomLevel } = req.body as {
        rotation?: number | string;
        cropX?: number | string;
        cropY?: number | string;
        zoomLevel?: number | string;
      };

      const imagesArchive: Record<string, ImageData> = (await readJSONFile('images.json')) || {};
      let imageData = imageId ? imagesArchive[imageId] : undefined;

      if (!imageData) {
        res.status(404).json({ error: 'Image not found in archive' });
        return;
      }

      const rotationDegrees =
        rotation !== undefined ? parseInt(String(rotation)) : imageData.rotation || 0;
      const cropXVal = cropX !== undefined ? parseFloat(String(cropX)) : 50;
      const cropYVal = cropY !== undefined ? parseFloat(String(cropY)) : 50;
      const zoomVal = zoomLevel !== undefined ? parseFloat(String(zoomLevel)) : 1.0;

      const needsRegenerate =
        !imageData.image ||
        rotationDegrees !== (imageData.rotation || 0) ||
        cropXVal !== 50 ||
        cropYVal !== 50 ||
        zoomVal !== 1.0;

      if (needsRegenerate) {
        if (!imageData.originalImage) {
          res.status(400).json({ error: 'Cannot reprocess image: original not available' });
          return;
        }

        log.debug('Regenerating processed image', {
          imageId,
          rotation: rotationDegrees,
          cropX: cropXVal,
          cropY: cropYVal,
          zoom: zoomVal,
        });

        const originalBuffer = Buffer.from(imageData.originalImage, 'base64');
        const tempPath = path.join(uploadDir, `reload-${Date.now()}.png`);
        await ensureDir(uploadDir);
        await fs.writeFile(tempPath, originalBuffer);

        const targetWidth = rotationDegrees === 90 || rotationDegrees === 270 ? 1600 : 1200;
        const targetHeight = rotationDegrees === 90 || rotationDegrees === 270 ? 1200 : 1600;

        const rgbBuffer = await imageProcessing.convertImageToRGB(
          tempPath,
          rotationDegrees,
          targetWidth,
          targetHeight,
          {
            ditherAlgorithm: 'floyd-steinberg',
            enhanceContrast: true,
            sharpen: false,
            cropX: cropXVal,
            cropY: cropYVal,
            zoomLevel: zoomVal,
          }
        );

        imageData = {
          ...imageData,
          image: rgbBuffer.toString('base64'),
          rotation: rotationDegrees,
        };

        await fs.unlink(tempPath);
      }

      const settings: ServerSettings = (await readJSONFile('settings.json')) || {
        defaultSleepDuration: 3600000000,
      };

      const currentData = {
        ...imageData,
        sleepDuration: settings.defaultSleepDuration,
        timestamp: Date.now(),
      };

      await writeJSONFile('current.json', currentData);
      log.info('Loaded image from history', {
        imageId,
        title: imageData.title,
        rotation: rotationDegrees,
      });
      addDeviceLog(
        `Applied image from history: "${imageData.title || imageId}" (rotation: ${rotationDegrees}°)`
      );

      res.json({ success: true, current: currentData });
    } catch (error) {
      log.error('Error loading from history', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Delete image from history
   * DELETE /api/history/:imageId
   */
  router.delete('/history/:imageId', apiKeyAuth, async (req: Request, res: Response) => {
    try {
      const { imageId } = req.params;
      let history: HistoryItem[] = (await readJSONFile('history.json')) || [];

      const originalLength = history.length;
      history = history.filter((item) => item.imageId !== imageId);

      if (history.length === originalLength) {
        res.status(404).json({ error: 'Image not found in history' });
        return;
      }

      await writeJSONFile('history.json', history);

      const imagesArchive: Record<string, ImageData> = (await readJSONFile('images.json')) || {};
      if (imageId) {
        delete imagesArchive[imageId];
      }
      await writeJSONFile('images.json', imagesArchive);

      log.info('Deleted image from history', { imageId });

      res.json({ success: true, message: 'Image deleted from history' });
    } catch (error) {
      log.error('Error deleting from history', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get my collection (all user's art)
   * GET /api/my-collection
   */
  router.get('/my-collection', async (_req: Request, res: Response) => {
    try {
      const history: HistoryItem[] = (await readJSONFile('history.json')) || [];
      const collection: CollectionItem[] = (await readJSONFile('my-collection.json')) || [];

      const myCollection = [
        ...history.map((item) => ({
          ...item,
          collectionType: item.source || 'generated',
          addedToCollection: Date.now(),
        })),
        ...collection.map((item) => ({
          ...item,
          collectionType: 'added',
        })),
      ];

      myCollection.sort((a, b) => (b.addedToCollection || 0) - (a.addedToCollection || 0));

      res.json(myCollection);
    } catch (error) {
      log.error('Error getting my collection', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Add artwork to my collection
   * POST /api/my-collection
   */
  router.post('/my-collection', async (req: Request, res: Response) => {
    try {
      const { imageUrl, title, artist, year, thumbnail, collectionId, wikimedia } = req.body as {
        imageUrl?: string;
        title?: string;
        artist?: string;
        year?: string;
        thumbnail?: string;
        collectionId?: string;
        wikimedia?: string;
      };

      if (!imageUrl || !title) {
        res.status(400).json({ error: 'imageUrl and title are required' });
        return;
      }

      const collection: CollectionItem[] = (await readJSONFile('my-collection.json')) || [];

      const exists = collection.some((item) => item.imageUrl === imageUrl);
      if (exists) {
        res.status(400).json({ error: 'Artwork already in collection' });
        return;
      }

      const collectionItem: CollectionItem = {
        id: uuidv4(),
        imageUrl,
        title,
        artist: artist || 'Unknown',
        year,
        thumbnail: thumbnail || imageUrl,
        collectionId,
        wikimedia,
        addedToCollection: Date.now(),
      };

      collection.unshift(collectionItem);
      await writeJSONFile('my-collection.json', collection);

      log.info('Added to collection', { title, artist });

      res.json({
        success: true,
        message: 'Added to collection',
        item: collectionItem,
      });
    } catch (error) {
      log.error('Error adding to collection', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Remove artwork from my collection
   * DELETE /api/my-collection/:id
   */
  router.delete('/my-collection/:id', apiKeyAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      let collection: CollectionItem[] = (await readJSONFile('my-collection.json')) || [];

      const originalLength = collection.length;
      collection = collection.filter((item) => item.id !== id);

      if (collection.length === originalLength) {
        res.status(404).json({ error: 'Item not found in collection' });
        return;
      }

      await writeJSONFile('my-collection.json', collection);
      log.info('Removed from collection', { id });

      res.json({ success: true, message: 'Removed from collection' });
    } catch (error) {
      log.error('Error removing from collection', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Create/update playlist
   * POST /api/playlist
   */
  router.post('/playlist', async (req: Request, res: Response) => {
    try {
      const { images, mode, interval } = req.body as {
        images?: string[];
        mode?: string;
        interval?: number;
      };

      if (!images || !Array.isArray(images) || images.length === 0) {
        res.status(400).json({ error: 'Please provide an array of image IDs' });
        return;
      }

      if (!mode || !['sequential', 'random'].includes(mode)) {
        res.status(400).json({ error: "Mode must be 'sequential' or 'random'" });
        return;
      }

      if (!interval || interval < 300000000) {
        res.status(400).json({
          error: 'Interval must be at least 5 minutes (300000000 microseconds)',
        });
        return;
      }

      const history: HistoryItem[] = (await readJSONFile('history.json')) || [];
      const validImages = images.filter((imageId) =>
        history.some((item) => item.imageId === imageId)
      );

      if (validImages.length === 0) {
        res.status(400).json({ error: 'No valid images found in history' });
        return;
      }

      const imagesArchive: Record<string, ImageData> = (await readJSONFile('images.json')) || {};
      const seenImages = new Map<string, string>();
      const dedupedImages: string[] = [];

      for (const imageId of validImages) {
        const imgData = imagesArchive[imageId];
        if (!imgData) continue;

        const key =
          imgData.sourceUrl ||
          imgData.originalUrl ||
          `${imgData.title || 'untitled'}|${imgData.artist || 'unknown'}`;

        if (!seenImages.has(key)) {
          seenImages.set(key, imageId);
          dedupedImages.push(imageId);
        }
      }

      if (dedupedImages.length === 0) {
        res.status(400).json({ error: 'No valid unique images found' });
        return;
      }

      const duplicatesRemoved = validImages.length - dedupedImages.length;
      if (duplicatesRemoved > 0) {
        log.debug('Playlist: removed duplicate images', { duplicatesRemoved });
      }

      const playlistConfig: PlaylistData = {
        images: dedupedImages,
        mode: mode as 'sequential' | 'random',
        interval,
        currentIndex: 0,
        active: true,
        createdAt: Date.now(),
        lastUpdate: Date.now(),
      };

      await writeJSONFile('playlist.json', playlistConfig);

      const firstImageId =
        mode === 'random'
          ? dedupedImages[Math.floor(Math.random() * dedupedImages.length)]!
          : dedupedImages[0]!;

      const imageData = imagesArchive[firstImageId];

      if (imageData) {
        const currentData = {
          ...imageData,
          sleepDuration: interval,
          timestamp: Date.now(),
        };

        await writeJSONFile('current.json', currentData);
        log.info('Started playlist', { imageCount: dedupedImages.length, firstImageId });
      }

      res.json({
        success: true,
        message: `Playlist created with ${dedupedImages.length} images${duplicatesRemoved > 0 ? ` (${duplicatesRemoved} duplicate(s) removed)` : ''}`,
        config: playlistConfig,
      });
    } catch (error) {
      log.error('Error creating playlist', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get current playlist configuration
   * GET /api/playlist
   */
  router.get('/playlist', async (_req: Request, res: Response) => {
    try {
      const playlist = await readJSONFile('playlist.json');
      res.json(
        playlist || { active: false, images: [], mode: 'sequential', interval: 3600000000 }
      );
    } catch (error) {
      log.error('Error getting playlist', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Update playlist settings (toggle active, change mode/interval)
   * PATCH /api/playlist
   */
  router.patch('/playlist', async (req: Request, res: Response) => {
    try {
      const playlist: Partial<PlaylistData> | null = await readJSONFile('playlist.json');

      if (!playlist) {
        res.status(404).json({ error: 'No playlist exists' });
        return;
      }

      const { active, mode, interval } = req.body as {
        active?: boolean;
        mode?: string;
        interval?: number;
      };

      if (active !== undefined) {
        playlist.active = active;
      }
      if (mode && ['sequential', 'random'].includes(mode)) {
        playlist.mode = mode as 'sequential' | 'random';
      }
      if (interval && interval >= 300000000) {
        playlist.interval = interval;
      }

      await writeJSONFile('playlist.json', playlist);
      log.info('Playlist updated', { active: playlist.active, mode: playlist.mode });

      res.json(playlist);
    } catch (error) {
      log.error('Error updating playlist', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Delete/clear playlist
   * DELETE /api/playlist
   */
  router.delete('/playlist', apiKeyAuth, async (_req: Request, res: Response) => {
    try {
      await writeJSONFile('playlist.json', {
        active: false,
        images: [],
        mode: 'sequential',
        interval: 3600000000,
      });
      log.info('Playlist cleared');
      res.json({ success: true, message: 'Playlist cleared' });
    } catch (error) {
      log.error('Error deleting playlist', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createHistoryRoutes;
