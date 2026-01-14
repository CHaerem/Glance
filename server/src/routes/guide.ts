/**
 * Art Guide Chat Routes
 * Agentic art discovery API endpoints.
 */

import { Router, Request, Response } from 'express';
import guideChatService from '../services/guide-chat';
import { performArtSearch } from '../services/museum-api';
import imageProcessing from '../services/image-processing';
import { readJSONFile, writeJSONFile, ensureDir } from '../utils/data-store';
import { addDeviceLog } from '../utils/state';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils/error';
import type { Artwork, ServerSettings } from '../types';
import type { GuideDependencies } from '../services/guide-chat';
import sharp from 'sharp';
import path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

const log = loggers.api.child({ component: 'guide-routes' });

/** Request body for chat endpoint */
interface ChatRequest {
  message: string;
  sessionId?: string;
}

/** Current data structure */
interface CurrentData {
  title: string;
  artist?: string;
  source?: string;
  imageId: string;
  image?: string;
  timestamp: number;
  sleepDuration: number;
  rotation?: number;
  originalImage?: string;
  originalImageMime?: string;
}

/** Guide route dependencies */
export interface GuideRouteDeps {
  uploadDir: string;
}

/**
 * Create guide routes
 */
export function createGuideRoutes({ uploadDir }: GuideRouteDeps = { uploadDir: './uploads' }): Router {
  const router = Router();

  /**
   * Display an artwork on the e-ink frame
   */
  async function displayArtwork(artwork: Artwork): Promise<{ success: boolean; message: string }> {
    try {
      if (!artwork.imageUrl) {
        return { success: false, message: 'Artwork has no image URL' };
      }

      log.info('Guide displaying artwork', { title: artwork.title, artist: artwork.artist });

      // Fetch the image
      let imageResponse: globalThis.Response;
      try {
        imageResponse = await fetch(artwork.imageUrl);
      } catch (fetchError) {
        log.error('Failed to fetch image', { error: getErrorMessage(fetchError) });
        return { success: false, message: 'Failed to fetch artwork image' };
      }

      if (!imageResponse.ok) {
        return { success: false, message: `Failed to fetch image: HTTP ${imageResponse.status}` };
      }

      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

      await ensureDir(uploadDir);
      const tempPath = path.join(uploadDir, `temp-${Date.now()}.jpg`);
      await fs.writeFile(tempPath, imageBuffer);

      // Process for e-ink
      const targetWidth = 1200;
      const targetHeight = 1600;

      const ditheredRgbBuffer = await imageProcessing.convertImageToRGB(
        tempPath,
        0, // rotation
        targetWidth,
        targetHeight,
        {
          ditherAlgorithm: 'floyd-steinberg',
          enhanceContrast: true,
          sharpen: false,
          cropX: 50,
          cropY: 50,
          zoomLevel: 1.0,
        }
      );

      // Create thumbnail
      const thumbnailBuffer = await sharp(ditheredRgbBuffer, {
        raw: { width: targetWidth, height: targetHeight, channels: 3 },
      })
        .resize(300, 400, { fit: 'fill' })
        .png()
        .toBuffer();

      await fs.unlink(tempPath);

      const imageId = uuidv4();

      const settings: ServerSettings = (await readJSONFile('settings.json')) || {
        defaultSleepDuration: 3600000000,
      };

      const currentData: CurrentData = {
        title: artwork.title || 'Artwork',
        artist: artwork.artist || 'Unknown',
        source: artwork.source || 'museum',
        imageId: imageId,
        image: ditheredRgbBuffer.toString('base64'),
        timestamp: Date.now(),
        sleepDuration: settings.defaultSleepDuration || 3600000000,
        rotation: 0,
        originalImage: imageBuffer.toString('base64'),
        originalImageMime: imageResponse.headers.get('content-type') || 'image/jpeg',
      };

      await writeJSONFile('current.json', currentData);

      // Update archive and history
      const imagesArchive: Record<string, CurrentData> = (await readJSONFile('images.json')) || {};
      imagesArchive[imageId] = currentData;
      await writeJSONFile('images.json', imagesArchive);

      interface HistoryEntry {
        imageId: string;
        title: string;
        artist?: string;
        source?: string;
        timestamp: number;
        thumbnail: string;
        aiGenerated: boolean;
      }

      const history: HistoryEntry[] = (await readJSONFile('history.json')) || [];
      history.unshift({
        imageId: imageId,
        title: currentData.title,
        artist: currentData.artist,
        source: currentData.source,
        timestamp: currentData.timestamp,
        thumbnail: thumbnailBuffer.toString('base64'),
        aiGenerated: false,
      });

      if (history.length > 100) {
        const removed = history.slice(100);
        for (const item of removed) {
          delete imagesArchive[item.imageId];
        }
        await writeJSONFile('images.json', imagesArchive);
      }
      await writeJSONFile('history.json', history);

      log.info('Guide displayed artwork', { title: artwork.title, imageId });
      addDeviceLog(`Guide displayed: "${artwork.title}" by ${artwork.artist || 'Unknown'}`);

      return { success: true, message: `Displaying "${artwork.title}"` };
    } catch (error) {
      log.error('Guide display failed', { error: getErrorMessage(error) });
      return { success: false, message: 'Failed to display artwork' };
    }
  }

  /**
   * Get current display info
   */
  async function getCurrentDisplay(): Promise<{ artwork?: Artwork; title?: string; artist?: string } | null> {
    try {
      const current: CurrentData | null = await readJSONFile('current.json');
      if (!current) {
        return null;
      }

      return {
        title: current.title,
        artist: current.artist,
        artwork: {
          id: current.imageId,
          title: current.title,
          artist: current.artist || 'Unknown',
          date: '',
          source: current.source || 'unknown',
          imageUrl: '',
          thumbnailUrl: '',
        },
      };
    } catch (error) {
      log.error('Failed to get current display', { error: getErrorMessage(error) });
      return null;
    }
  }

  /**
   * POST /api/guide/chat
   * Send a message to the art guide and get a response with optional actions
   */
  router.post('/chat', async (req: Request<object, object, ChatRequest>, res: Response) => {
    try {
      const { message, sessionId = 'default' } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      if (message.length > 1000) {
        res.status(400).json({ error: 'Message too long (max 1000 characters)' });
        return;
      }

      log.info('Guide chat request', { sessionId, messageLength: message.length });

      // Create dependencies for the guide
      const deps: GuideDependencies = {
        searchFn: async (query: string, limit: number): Promise<Artwork[]> => {
          const result = await performArtSearch(query, limit);
          return result.results;
        },
        displayFn: displayArtwork,
        getCurrentDisplayFn: getCurrentDisplay,
      };

      const response = await guideChatService.chat(sessionId, message, deps);

      res.json({
        message: response.message,
        actions: response.actions,
        results: response.results || [],
        resultCount: response.results?.length || 0,
        displayed: response.displayed,
      });
    } catch (error) {
      log.error('Guide chat error', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  });

  /**
   * GET /api/guide/history
   * Get conversation history for a session
   */
  router.get('/history', (req: Request, res: Response) => {
    const sessionId = (req.query.sessionId as string) || 'default';
    const history = guideChatService.getHistory(sessionId);
    res.json({ messages: history });
  });

  /**
   * DELETE /api/guide/chat
   * Clear conversation history for a session
   */
  router.delete('/chat', (req: Request, res: Response) => {
    const sessionId = (req.query.sessionId as string) || 'default';
    guideChatService.clearSession(sessionId);
    res.json({ success: true, message: 'Conversation cleared' });
  });

  return router;
}
