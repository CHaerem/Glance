/**
 * Upload Routes
 * File upload, AI generation endpoints
 */

import { Router, Request, Response, RequestHandler } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

import { sanitizeInput, getRandomLuckyPrompt } from '../utils/validation';
import { readJSONFile, writeJSONFile } from '../utils/data-store';
import { addDeviceLog } from '../utils/state';
import { getErrorMessage } from '../utils/error';
import imageProcessing from '../services/image-processing';
import statistics from '../services/statistics';
import { loggers } from '../services/logger';
import { apiKeyAuth } from '../middleware/auth';
import type { ServerSettings, FileRequest } from '../types';

const log = loggers.api;

/** Upload route dependencies */
export interface UploadRouteDeps {
  upload: { single: (fieldName: string) => RequestHandler };
  uploadDir: string;
  openai: OpenAI | null;
}

/** Image archive entry */
interface ImageArchiveEntry {
  title: string;
  imageId: string;
  timestamp: number;
  rotation: number;
  originalImage?: string;
  originalImageMime?: string;
  thumbnail?: string;
  aiGenerated: boolean;
  uploadedFilename?: string;
  contentHash?: string;
  image?: string;
  sleepDuration?: number;
  originalPrompt?: string;
  artStyle?: string;
  quality?: string;
}

/** History entry for uploads */
interface UploadHistoryEntry {
  imageId: string;
  title: string;
  thumbnail?: string;
  timestamp: number;
  aiGenerated: boolean;
  uploadedFilename?: string;
  originalPrompt?: string;
  artStyle?: string;
  quality?: string;
  rotation?: number;
}

/**
 * Create upload routes
 */
export function createUploadRoutes({ upload, uploadDir, openai }: UploadRouteDeps): Router {
  const router = Router();

  /**
   * Upload image to history (preview before applying)
   * POST /api/upload
   */
  router.post(
    '/upload',
    apiKeyAuth,
    upload.single('image'),
    async (req: FileRequest, res: Response) => {
      try {
        if (!req.file) {
          log.error('Upload failed: No file in request');
          res.status(400).json({ error: 'No file uploaded' });
          return;
        }

        log.debug('Uploading image for preview', {
          filename: req.file.originalname,
          size: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
          mimetype: req.file.mimetype,
        });

        // Read file and compute hash for duplicate detection
        const fileBuffer = await fs.readFile(req.file.path);
        const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 16);

        // Check for duplicate by hash
        const imagesArchive: Record<string, ImageArchiveEntry> =
          (await readJSONFile('images.json')) || {};
        const existingEntry = Object.entries(imagesArchive).find(
          ([, img]) => img.contentHash === fileHash
        );

        if (existingEntry) {
          const [existingId, existingImage] = existingEntry;
          log.debug('Duplicate image detected', { hash: fileHash, existingId });

          await fs.unlink(req.file.path);

          addDeviceLog(
            `Duplicate upload detected: "${req.file.originalname}" matches existing image`
          );

          res.json({
            success: true,
            imageId: existingId,
            title: existingImage.title,
            message: 'This image already exists in your collection.',
            duplicate: true,
          });
          return;
        }

        const imageId = uuidv4();
        const timestamp = Date.now();

        // Create optimized original and thumbnail in parallel
        const [optimizedOriginalBuffer, thumbnailBuffer] = await Promise.all([
          sharp(req.file.path)
            .rotate()
            .resize(800, undefined, {
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ quality: 85 })
            .toBuffer(),
          sharp(req.file.path)
            .rotate()
            .resize(300, 400, { fit: 'inside' })
            .png()
            .toBuffer(),
        ]);

        const originalImageBase64 = optimizedOriginalBuffer.toString('base64');
        const thumbnailBase64 = thumbnailBuffer.toString('base64');

        const title = `Uploaded: ${req.file.originalname}`;

        imagesArchive[imageId] = {
          title: title,
          imageId: imageId,
          timestamp: timestamp,
          rotation: 0,
          originalImage: originalImageBase64,
          originalImageMime: 'image/jpeg',
          thumbnail: thumbnailBase64,
          aiGenerated: false,
          uploadedFilename: req.file.originalname,
          contentHash: fileHash,
        };
        await writeJSONFile('images.json', imagesArchive);

        const history: UploadHistoryEntry[] = (await readJSONFile('history.json')) || [];
        history.unshift({
          imageId: imageId,
          title: title,
          thumbnail: thumbnailBase64,
          timestamp: timestamp,
          aiGenerated: false,
          uploadedFilename: req.file.originalname,
        });

        // Keep only last 50 images in history
        if (history.length > 50) {
          const removedItems = history.splice(50);
          for (const item of removedItems) {
            delete imagesArchive[item.imageId];
          }
          await writeJSONFile('images.json', imagesArchive);
        }
        await writeJSONFile('history.json', history);

        await fs.unlink(req.file.path);

        log.info('Image uploaded for preview', { imageId });
        addDeviceLog(`New image uploaded for preview: "${req.file.originalname}"`);

        res.json({
          success: true,
          imageId: imageId,
          title: title,
          message: 'Image uploaded. Adjust crop/zoom and click Apply to display.',
        });
      } catch (error) {
        log.error('Error uploading image', {
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
          error: 'Error uploading image: ' + (getErrorMessage(error)),
        });
      }
    }
  );

  /**
   * AI Image Generation endpoint
   * POST /api/generate-art
   */
  router.post('/generate-art', apiKeyAuth, async (req: Request, res: Response) => {
    try {
      if (!openai) {
        res.status(503).json({
          error: 'AI generation not available. OPENAI_API_KEY not configured.',
        });
        return;
      }

      const { prompt, rotation, sleepDuration, quality, style } = req.body as {
        prompt?: string;
        rotation?: string | number;
        sleepDuration?: string | number;
        quality?: string;
        style?: string;
      };

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        res.status(400).json({ error: 'Prompt is required' });
        return;
      }

      log.info('Generating AI art', { prompt });

      const settings: ServerSettings = (await readJSONFile('settings.json')) || {
        defaultSleepDuration: 3600000000,
      };
      const sleepMs = parseInt(String(sleepDuration)) || settings.defaultSleepDuration || 3600000000;
      const rotationDegrees = parseInt(String(rotation)) || 0;
      const imageQuality = quality === 'hd' ? 'high' : 'medium';
      const artStyle = style || 'balanced';

      // Enhanced prompt engineering
      let styleGuidance = '';
      let compositionRules = '';

      switch (artStyle) {
        case 'minimalist':
          styleGuidance = 'Minimalist style with clean geometric shapes, strong contrast between elements';
          compositionRules = 'The composition extends to all four edges of the canvas with no empty margins or borders.';
          break;
        case 'detailed':
          styleGuidance = 'Highly detailed artwork with intricate patterns, rich textures, and complex visual elements throughout';
          compositionRules = 'Every part of the canvas from edge to edge is filled with detailed elements.';
          break;
        case 'abstract':
          styleGuidance = 'Bold abstract art with strong geometric or organic shapes, high contrast colors and forms';
          compositionRules = 'Abstract shapes and patterns fill the entire canvas edge to edge.';
          break;
        case 'line-art':
          styleGuidance = 'Pen and ink drawing style with confident linework, similar to woodblock prints or linocuts';
          compositionRules = 'The illustration fills the frame completely with the subject extending to the edges.';
          break;
        default:
          styleGuidance = 'Artistic composition optimized for digital display with good contrast and visual interest';
          compositionRules = 'Use a full-bleed composition where the subject or pattern extends to all edges.';
      }

      const enhancedPrompt = `${prompt}. ${styleGuidance}. COMPOSITION RULES: ${compositionRules} This artwork must fill a tall vertical portrait frame completely with NO empty borders.`;

      log.debug('Enhanced prompt', { enhancedPrompt });

      const response = await openai.images.generate({
        model: 'gpt-image-1.5',
        prompt: enhancedPrompt,
        n: 1,
        size: '1024x1536',
        quality: imageQuality as 'low' | 'medium' | 'high',
      });

      const imageBase64 = response.data?.[0]?.b64_json;
      log.debug('AI image generated', { base64Length: imageBase64 ? imageBase64.length : 0 });

      statistics.trackOpenAICall('gpt-image-1.5', 0, 0, true, {
        endpoint: 'images.generate',
        size: '1024x1536',
        quality: imageQuality,
        style: artStyle,
      });

      if (!imageBase64) {
        throw new Error('No image data returned from OpenAI');
      }

      const imageBuffer = Buffer.from(imageBase64, 'base64');
      const tempFilePath = path.join(uploadDir, `ai-gen-${Date.now()}.png`);
      await fs.writeFile(tempFilePath, imageBuffer);

      const rgbBuffer = await imageProcessing.convertImageToRGB(
        tempFilePath,
        rotationDegrees,
        1200,
        1600,
        {
          autoCropWhitespace: true,
          enhanceContrast: true,
          ditherAlgorithm: 'floyd-steinberg',
        }
      );

      const optimizedOriginalBuffer = await sharp(imageBuffer)
        .resize(800, undefined, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(300, 400, { fit: 'inside' })
        .png()
        .toBuffer();

      const originalImageBase64 = optimizedOriginalBuffer.toString('base64');
      const thumbnailBase64 = thumbnailBuffer.toString('base64');

      const imageId = uuidv4();
      const current = {
        title: `AI Generated: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`,
        image: rgbBuffer.toString('base64'),
        originalImage: originalImageBase64,
        originalImageMime: 'image/jpeg',
        imageId: imageId,
        timestamp: Date.now(),
        sleepDuration: sleepMs,
        rotation: rotationDegrees,
        aiGenerated: true,
        originalPrompt: prompt,
        artStyle: artStyle,
        quality: imageQuality,
      };

      await writeJSONFile('current.json', current);

      const imagesArchive: Record<string, ImageArchiveEntry> =
        (await readJSONFile('images.json')) || {};
      imagesArchive[imageId] = {
        title: current.title,
        imageId: imageId,
        timestamp: current.timestamp,
        sleepDuration: current.sleepDuration,
        rotation: current.rotation,
        originalImage: originalImageBase64,
        originalImageMime: 'image/jpeg',
        thumbnail: thumbnailBase64,
        aiGenerated: true,
        originalPrompt: prompt,
        artStyle: artStyle,
        quality: imageQuality,
      };
      await writeJSONFile('images.json', imagesArchive);

      const history: UploadHistoryEntry[] = (await readJSONFile('history.json')) || [];
      history.unshift({
        imageId: imageId,
        title: current.title,
        thumbnail: thumbnailBase64,
        timestamp: current.timestamp,
        aiGenerated: true,
        originalPrompt: prompt,
        artStyle: artStyle,
        quality: imageQuality,
        rotation: rotationDegrees,
      });

      if (history.length > 50) {
        const removedItems = history.splice(50);
        for (const item of removedItems) {
          delete imagesArchive[item.imageId];
        }
        await writeJSONFile('images.json', imagesArchive);
      }
      await writeJSONFile('history.json', history);

      await fs.unlink(tempFilePath);

      log.info('AI art generated successfully', {
        prompt: prompt.substring(0, 50),
        style: artStyle,
      });
      addDeviceLog(
        `New AI art generated: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}" (${artStyle} style)`
      );

      res.json({
        success: true,
        current,
        revisedPrompt: response.data?.[0]?.revised_prompt,
      });
    } catch (error) {
      log.error('Error generating AI art', {
        error: getErrorMessage(error),
      });

      statistics.trackOpenAICall('gpt-image-1', 0, 0, false, {
        endpoint: 'images.generate',
        error: getErrorMessage(error),
      });

      res.status(500).json({
        error: 'Error generating AI art: ' + (getErrorMessage(error)),
      });
    }
  });

  /**
   * Lucky prompt helper
   * POST /api/lucky-prompt
   */
  router.post('/lucky-prompt', apiKeyAuth, async (req: Request, res: Response) => {
    const body = req.body || {};
    const currentPrompt = sanitizeInput(body.currentPrompt || '');
    const idea = sanitizeInput(body.idea || '');
    const mood = sanitizeInput(body.mood || '');
    const theme = sanitizeInput(body.theme || '');
    const vibe = sanitizeInput(body.vibe || '');

    const cueParts = [
      idea && `Concept: ${idea}`,
      theme && `Theme: ${theme}`,
      mood && `Mood: ${mood}`,
      vibe && `Vibe: ${vibe}`,
    ].filter((p): p is string => Boolean(p));

    if (!openai) {
      res.status(503).json({
        error: 'AI generation not available. OPENAI_API_KEY not configured.',
      });
      return;
    }

    try {
      let userContent: string;
      let temperature: number;

      if (currentPrompt) {
        temperature = 0.8;
        userContent = `Take this existing prompt and enhance it with more vivid details, stronger contrast elements, and full-bleed composition guidance:\n\n"${currentPrompt}"\n\nExpand it into a complete, detailed prompt (under 80 words) for creating gallery-worthy art with dramatic visual impact.`;
      } else if (cueParts.length > 0) {
        temperature = 0.9;
        userContent = `Use the following loose guidance to create a vivid prompt:\n${cueParts.join('\n')}\n\nDeliver one complete prompt ready for image generation, highlighting full-bleed composition, dramatic lighting, and strong contrast suitable for a striking art poster.`;
      } else {
        temperature = 1.0;
        const inspirationSeed = getRandomLuckyPrompt();
        userContent = `Surprise me with a fresh, inspiring idea for a portrait-oriented AI artwork with bold visual impact. Lean into ${inspirationSeed}. Make sure the prompt enforces full-bleed composition, edge-to-edge detail, and dramatic contrast.`;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        max_completion_tokens: 1000, // Needs room for reasoning tokens + output
        temperature,
        messages: [
          {
            role: 'system',
            content:
              'You are curating prompts for an AI art gallery. Generate prompts that create museum-quality, gallery-worthy artwork with strong visual impact. Focus on bold compositions, rich textures, dramatic contrast, and full-bleed designs that command attention. Think poster art, fine art prints, and striking visuals. Respond with a single vivid prompt under 80 words.',
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
      });

      const candidate = response?.choices?.[0]?.message?.content?.trim();
      const finishReason = response?.choices?.[0]?.finish_reason;
      const refusal = response?.choices?.[0]?.message?.refusal;

      // Debug logging for empty responses
      if (!candidate) {
        log.warn('OpenAI response details', {
          hasChoices: !!response?.choices?.length,
          finishReason,
          refusal,
          usage: response?.usage,
        });
      }

      statistics.trackOpenAICall(
        'gpt-4o-mini',
        response.usage?.prompt_tokens || 0,
        response.usage?.completion_tokens || 0,
        true,
        {
          endpoint: 'chat.completions',
          temperature,
          hasPrompt: !!currentPrompt,
          hasCues: cueParts.length > 0,
        }
      );

      if (!candidate) {
        log.warn('OpenAI returned no content for lucky prompt');
        res.status(502).json({
          error: 'AI did not return a prompt. Please try again.',
        });
        return;
      }

      const generatedPrompt = candidate.replace(/^"+|"+$/g, '');

      const responseData: Record<string, unknown> = {
        prompt: generatedPrompt,
        source: 'openai',
      };

      if (currentPrompt) {
        responseData.enhanced = true;
        responseData.original = currentPrompt;
      } else if (cueParts.length > 0) {
        responseData.inspiration = cueParts;
      }

      res.json(responseData);
    } catch (error) {
      log.error('Error generating lucky prompt with OpenAI', {
        error: getErrorMessage(error),
      });

      statistics.trackOpenAICall('gpt-4o-mini', 0, 0, false, {
        endpoint: 'chat.completions',
        error: getErrorMessage(error),
      });

      res.status(502).json({
        error: 'Unable to generate prompt right now. Please try again shortly.',
      });
    }
  });

  return router;
}

export default createUploadRoutes;
