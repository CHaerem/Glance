/**
 * Image Routes
 * Current image, binary stream, preview endpoints
 */

import { Router, Request, Response, RequestHandler } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

import { isInNightSleep, calculateNightSleepDuration } from '../utils/time';
import { validateImageData, sanitizeInput } from '../utils/validation';
import { readJSONFile, writeJSONFile, ensureDir } from '../utils/data-store';
import { addDeviceLog } from '../utils/state';
import { getErrorMessage } from '../utils/error';
import imageProcessing, { SPECTRA_6_PALETTE } from '../services/image-processing';
import { loggers } from '../services/logger';
import type { ServerSettings, FileRequest, CurrentData, PlaylistData } from '../types';

const log = loggers.api;

/** Image route dependencies */
export interface ImageRouteDeps {
  upload: { single: (fieldName: string) => RequestHandler };
  uploadDir: string;
}

/**
 * Create image routes
 */
export function createImageRoutes({ upload, uploadDir }: ImageRouteDeps): Router {
  const router = Router();

  /**
   * Get current image metadata for ESP32 (without image data)
   * GET /api/current.json
   */
  router.get('/current.json', async (_req: Request, res: Response) => {
    try {
      // Check if playlist is active and advance if needed
      const playlist: PlaylistData | null = await readJSONFile('playlist.json');
      if (playlist?.active && playlist.images && playlist.images.length > 0) {
        const now = Date.now();
        const timeSinceLastUpdate = now - (playlist.lastUpdate || 0);
        const intervalMs = (playlist.interval || 3600000000) / 1000;

        if (timeSinceLastUpdate >= intervalMs) {
          let nextImageId: string | undefined;

          if (playlist.mode === 'random') {
            nextImageId = playlist.images[Math.floor(Math.random() * playlist.images.length)];
          } else {
            playlist.currentIndex = ((playlist.currentIndex || 0) + 1) % playlist.images.length;
            nextImageId = playlist.images[playlist.currentIndex];
          }

          const imagesArchive: Record<string, CurrentData> =
            (await readJSONFile('images.json')) || {};
          const imageData = nextImageId ? imagesArchive[nextImageId] : undefined;

          if (imageData) {
            const currentData = {
              ...imageData,
              sleepDuration: playlist.interval,
              timestamp: now,
            };
            await writeJSONFile('current.json', currentData);
            playlist.lastUpdate = now;
            await writeJSONFile('playlist.json', playlist);
            log.debug('Playlist advanced', { nextImageId, mode: playlist.mode });
          }
        }
      }

      const current: CurrentData = (await readJSONFile('current.json')) || {
        title: 'Glance Display',
        imageId: '',
        timestamp: Date.now(),
        sleepDuration: 3600000000,
      };

      const settings: ServerSettings = (await readJSONFile('settings.json')) || {};
      const devServerHost =
        settings.devMode && settings.devServerHost ? settings.devServerHost : null;

      let sleepDuration = current.sleepDuration || 3600000000;
      let nightSleepActive = false;

      if (isInNightSleep(settings)) {
        sleepDuration = calculateNightSleepDuration(settings);
        nightSleepActive = true;
      }

      const metadata = {
        hasImage: !!(current.image || current.imageId),
        title: current.title || 'Glance Display',
        imageId: current.imageId || 'default',
        timestamp: current.timestamp || Date.now(),
        sleepDuration: sleepDuration,
        rotation: current.rotation || 0,
        devServerHost: devServerHost,
      };

      const nightSleepLog = nightSleepActive ? ' [night sleep]' : '';
      log.debug('Serving metadata', {
        hasImage: metadata.hasImage,
        imageId: metadata.imageId,
        sleepDuration: metadata.sleepDuration,
        devServer: devServerHost,
        nightSleep: nightSleepActive,
      });
      addDeviceLog(
        `Device fetched image metadata: ${metadata.imageId} (sleep: ${Math.round(metadata.sleepDuration / 60000000)}min)${devServerHost ? ' [dev mode]' : ''}${nightSleepLog}`
      );
      res.json(metadata);
    } catch (error) {
      log.error('Error getting current', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get current image with full data for web UI (with caching)
   * GET /api/current-full.json
   */
  router.get('/current-full.json', async (_req: Request, res: Response) => {
    try {
      const current: CurrentData = (await readJSONFile('current.json')) || {
        title: 'Glance Display',
        imageId: '',
        timestamp: Date.now(),
        sleepDuration: 3600000000,
      };

      res.set({
        'Cache-Control': 'public, max-age=5',
        ETag: `"${current.imageId}-${current.timestamp}"`,
      });

      log.debug('Serving full current data for web UI', { imageId: current.imageId });
      res.json(current);
    } catch (error) {
      log.error('Error getting current full', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Serve raw binary image data for PSRAM streaming
   * GET /api/image.bin
   */
  router.get('/image.bin', async (_req: Request, res: Response) => {
    try {
      const current: CurrentData = (await readJSONFile('current.json')) || {};

      if (!current?.image) {
        res.status(404).send('No image available');
        return;
      }

      log.debug('Serving raw binary image data for PSRAM streaming');

      const binaryData = Buffer.from(current.image, 'base64');

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': binaryData.length.toString(),
        'Cache-Control': 'no-cache',
      });

      log.debug('Sending raw image data', { bytes: binaryData.length });
      addDeviceLog(`Device downloaded image data: ${(binaryData.length / 1024 / 1024).toFixed(2)}MB`);
      res.send(binaryData);
    } catch (error) {
      log.error('Error serving binary image', {
        error: getErrorMessage(error),
      });
      res.status(500).send('Error serving binary image');
    }
  });

  /**
   * Update current image (for web interface or manual updates)
   * POST /api/current
   */
  router.post('/current', async (req: Request, res: Response) => {
    try {
      const { title, image, sleepDuration, isText } = req.body as {
        title?: string;
        image?: string;
        sleepDuration?: number | string;
        isText?: boolean;
      };

      const settings: ServerSettings = (await readJSONFile('settings.json')) || {
        defaultSleepDuration: 3600000000,
      };
      const sanitizedTitle = sanitizeInput(title);
      const sleepMs = parseInt(String(sleepDuration)) || settings.defaultSleepDuration || 3600000000;

      if (image && !validateImageData(image)) {
        res.status(400).json({ error: 'Invalid image data' });
        return;
      }

      let imageData = '';

      if (image) {
        if (isText) {
          const sanitizedText = sanitizeInput(image);
          const textImageBuffer = await imageProcessing.createTextImage(sanitizedText);
          imageData = textImageBuffer.toString('base64');
        } else if (image.startsWith('data:image/')) {
          const base64Data = image.split(',')[1];
          if (!base64Data) {
            res.status(400).json({ error: 'Invalid image data format' });
            return;
          }
          const imageBuffer = Buffer.from(base64Data, 'base64');

          const tempPath = path.join(uploadDir, 'temp-' + Date.now() + '.png');
          await ensureDir(uploadDir);
          await fs.writeFile(tempPath, imageBuffer);

          const rgbBuffer = await imageProcessing.convertImageToRGB(tempPath, 0, 1200, 1600);
          log.debug('RGB buffer converted', { bytes: rgbBuffer.length });
          imageData = rgbBuffer.toString('base64');

          await fs.unlink(tempPath);
        } else {
          imageData = image;
        }
      }

      const current = {
        title: sanitizedTitle || 'Glance Display',
        image: imageData,
        imageId: imageData ? uuidv4() : '',
        timestamp: Date.now(),
        sleepDuration: sleepMs,
      };

      await writeJSONFile('current.json', current);

      log.info('Image updated', { title: sanitizedTitle, imageId: current.imageId });

      res.json({ success: true, current });
    } catch (error) {
      log.error('Error updating current', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error: ' + (getErrorMessage(error)) });
    }
  });

  /**
   * Art gallery preview endpoint - shows exact e-ink display output
   * POST /api/preview
   */
  router.post('/preview', upload.single('image'), async (req: FileRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      log.debug('Generating art gallery preview', { filename: req.file.originalname });

      const ditherAlgorithm = ((req.body.ditherAlgorithm as string) || 'floyd-steinberg') as
        | 'floyd-steinberg'
        | 'atkinson'
        | 'none';
      const enhanceContrast = req.body.enhanceContrast !== 'false';
      const sharpen = req.body.sharpen === 'true';

      const ditheredRgbBuffer = await imageProcessing.convertImageToRGB(
        req.file.path,
        0,
        1200,
        1600,
        {
          ditherAlgorithm,
          enhanceContrast,
          sharpen,
        }
      );

      const previewBuffer = await sharp(ditheredRgbBuffer, {
        raw: {
          width: 1200,
          height: 1600,
          channels: 3,
        },
      })
        .resize(600, 800, { fit: 'fill' })
        .png()
        .toBuffer();

      await fs.unlink(req.file.path);

      res.json({
        success: true,
        preview: `data:image/png;base64,${previewBuffer.toString('base64')}`,
        rgbSize: Math.round(ditheredRgbBuffer.length / 1024),
        originalName: req.file.originalname,
        processingInfo: {
          algorithm: ditherAlgorithm,
          enhanceContrast,
          sharpen,
          paletteColors: SPECTRA_6_PALETTE.length,
        },
      });
    } catch (error) {
      log.error('Error generating art gallery preview', {
        error: getErrorMessage(error),
      });
      const fileReq = req as FileRequest;
      if (fileReq.file?.path) {
        try {
          await fs.unlink(fileReq.file.path);
        } catch {
          // Ignore cleanup errors
        }
      }
      res.status(500).json({
        error: 'Error generating art preview: ' + (getErrorMessage(error)),
      });
    }
  });

  /**
   * Bhutan flag endpoint for ESP32 fallback display
   * GET /api/bhutan.bin
   */
  router.get('/bhutan.bin', async (_req: Request, res: Response) => {
    try {
      const svgPath = path.join(__dirname, '..', '..', '..', 'bhutan.svg');

      const exists = await fs
        .access(svgPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        res.status(404).json({ error: 'Bhutan SVG not found' });
        return;
      }

      const svgBuffer = await fs.readFile(svgPath);

      const pngBuffer = await sharp(svgBuffer)
        .resize(1200, 1600, {
          fit: 'fill',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer();

      const { data: rgbData, info } = await sharp(pngBuffer)
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });

      if (info.channels !== 3) {
        throw new Error(`Bhutan PNG conversion produced ${info.channels} channels, expected 3`);
      }

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': rgbData.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      });

      res.send(rgbData);
      log.debug('Served Bhutan flag RGB data', { bytes: rgbData.length });
    } catch (error) {
      log.error('Error serving Bhutan flag', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Failed to process Bhutan flag' });
    }
  });

  return router;
}

export default createImageRoutes;
