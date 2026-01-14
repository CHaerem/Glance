/**
 * Art API Routes
 * Search, smart-search, similar, random, and import endpoints
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

import { performArtSearch } from '../services/museum-api';
import imageProcessing from '../services/image-processing';
import statistics from '../services/statistics';
import { readJSONFile, writeJSONFile, ensureDir } from '../utils/data-store';
import { addDeviceLog } from '../utils/state';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils/error';
import { apiKeyAuth } from '../middleware/auth';
import type { ServerSettings } from '../types';

const log = loggers.api;

/** Art route dependencies */
export interface ArtRouteDeps {
  openai: OpenAI | null;
  uploadDir: string;
}

/** Artwork result from random search */
interface RandomArtwork {
  id: string;
  title: string;
  artist: string;
  date: string;
  imageUrl: string;
  thumbnailUrl: string;
  department: string;
  culture: string;
  source: string;
}

/** Search parameters from AI */
interface SearchParams {
  searchTerms?: string[];
  styles?: string[];
  colors?: string[];
  moods?: string[];
  subjects?: string[];
}

/** Similarity parameters from AI */
interface SimilarityParams {
  searchTerms: string[];
  reasoning: string;
}

/** Image archive entry */
interface ImageArchiveEntry {
  title: string;
  artist?: string;
  source?: string;
  imageId: string;
  image: string;
  timestamp: number;
  sleepDuration: number;
  rotation: number;
  originalImage: string;
  originalImageMime: string;
}

/** History entry */
interface HistoryEntry {
  imageId: string;
  title: string;
  artist?: string;
  source?: string;
  timestamp: number;
  thumbnail: string;
  aiGenerated: boolean;
}

/**
 * Create art routes with dependencies
 */
export function createArtRoutes({ openai, uploadDir }: ArtRouteDeps): Router {
  const router = Router();

  /**
   * Search artworks
   * GET /api/art/search?q=query&limit=20&offset=0
   */
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const { q: query, limit = '20', offset = '0' } = req.query as {
        q?: string;
        limit?: string;
        offset?: string;
      };
      const result = await performArtSearch(query || '', parseInt(limit), parseInt(offset));
      res.json(result);
    } catch (error) {
      log.error('Error searching art', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        error: 'Internal server error: ' + (getErrorMessage(error)),
      });
    }
  });

  /**
   * AI-powered smart search
   * POST /api/art/smart-search
   */
  router.post('/smart-search', async (req: Request, res: Response) => {
    try {
      const { query } = req.body as { query?: string };

      if (!query) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }

      if (!openai) {
        log.info('OpenAI not configured, using simple search');
        res.redirect(307, `/api/art/search?q=${encodeURIComponent(query)}`);
        return;
      }

      log.info('Smart search query', { query });

      const completion = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You are an art search assistant. Extract search parameters from user queries.
Return a JSON object with:
- searchTerms: array of specific search terms (artist names, artwork titles, subjects)
- styles: array of art styles (impressionist, renaissance, modern, abstract, etc.)
- colors: array of colors mentioned (blue, warm, vibrant, monochrome, etc.)
- moods: array of moods (peaceful, dramatic, bold, calm, energetic, etc.)
- subjects: array of subjects (landscape, portrait, still life, nature, urban, etc.)

Example:
Query: "peaceful blue impressionist paintings"
Response: {
  "searchTerms": ["impressionist", "paintings"],
  "styles": ["impressionist"],
  "colors": ["blue"],
  "moods": ["peaceful"],
  "subjects": ["paintings"]
}`,
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
      });

      statistics.trackOpenAICall(
        'gpt-5-mini',
        completion.usage?.prompt_tokens || 0,
        completion.usage?.completion_tokens || 0,
        true,
        {
          endpoint: 'chat.completions',
          purpose: 'smart-search',
          query: query.substring(0, 50),
        }
      );

      let searchParams: SearchParams;
      try {
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error('No content in response');
        searchParams = JSON.parse(content) as SearchParams;
      } catch (parseError) {
        log.error('Failed to parse OpenAI response', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        res.redirect(307, `/api/art/search?q=${encodeURIComponent(query)}`);
        return;
      }

      log.debug('Extracted search parameters', { searchParams });

      const searchQuery =
        [...(searchParams.searchTerms || []), ...(searchParams.styles || []), ...(searchParams.subjects || [])]
          .join(' ')
          .trim() || query;

      const searchResults = await performArtSearch(searchQuery, 20);

      res.json({
        results: searchResults.results || [],
        metadata: {
          originalQuery: query,
          searchQuery: searchQuery,
          parameters: searchParams,
        },
      });
    } catch (error) {
      log.error('Smart search error', {
        error: getErrorMessage(error),
      });

      if (openai) {
        statistics.trackOpenAICall('gpt-5-mini', 0, 0, false, {
          endpoint: 'chat.completions',
          purpose: 'smart-search',
          error: getErrorMessage(error),
        });
      }

      res.status(500).json({
        error: 'Search failed: ' + (getErrorMessage(error)),
      });
    }
  });

  /**
   * Find similar artworks using AI
   * POST /api/art/similar
   */
  router.post('/similar', async (req: Request, res: Response) => {
    try {
      const { title, artist, date, department, source } = req.body as {
        title?: string;
        artist?: string;
        date?: string;
        department?: string;
        source?: string;
      };

      if (!title && !artist) {
        res.status(400).json({ error: 'Title or artist is required' });
        return;
      }

      if (!openai) {
        log.info('OpenAI not configured, using simple similarity search');
        const fallbackQuery = artist || (title?.split(' ').slice(0, 3).join(' ') ?? '');
        res.redirect(307, `/api/art/search?q=${encodeURIComponent(fallbackQuery)}`);
        return;
      }

      log.info('Finding similar artworks', { title, artist });

      const completion = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You are an art curator helping users discover similar artworks. Given an artwork's metadata, generate search terms to find similar pieces.

Consider:
- Art movement/style (Impressionism, Renaissance, Abstract, etc.)
- Subject matter (landscape, portrait, still life, etc.)
- Time period and cultural context
- Artistic techniques and medium
- Similar artists from the same movement

Return a JSON object with:
- searchTerms: array of 3-5 specific search terms (artist names, movements, subjects)
- reasoning: brief explanation of similarity criteria (one sentence)

Example:
Input: "Water Lilies" by Claude Monet, 1906, Impressionism
Output: {
  "searchTerms": ["impressionist paintings", "landscape", "nature", "Pissarro", "Renoir"],
  "reasoning": "Other Impressionist landscape paintings with natural subjects by contemporary artists"
}`,
          },
          {
            role: 'user',
            content: `Find artworks similar to:
Title: ${title}
Artist: ${artist || 'Unknown'}
Date: ${date || 'Unknown'}
Department/Type: ${department || 'Unknown'}
Source: ${source || 'Unknown'}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      statistics.trackOpenAICall(
        'gpt-4',
        completion.usage?.prompt_tokens || 0,
        completion.usage?.completion_tokens || 0,
        true,
        {
          endpoint: 'chat.completions',
          purpose: 'similar-artwork',
          artwork: `${title} by ${artist}`.substring(0, 50),
        }
      );

      let similarityParams: SimilarityParams;
      try {
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error('No content in response');
        similarityParams = JSON.parse(content) as SimilarityParams;
      } catch (parseError) {
        log.error('Failed to parse OpenAI response', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        const fallbackQuery = artist || (title?.split(' ').slice(0, 3).join(' ') ?? '');
        res.redirect(307, `/api/art/search?q=${encodeURIComponent(fallbackQuery)}`);
        return;
      }

      log.debug('Similarity search terms', {
        searchTerms: similarityParams.searchTerms,
        reasoning: similarityParams.reasoning,
      });

      const searchQuery = similarityParams.searchTerms.join(' ');
      const searchResults = await performArtSearch(searchQuery, 30);

      const filteredResults = (searchResults.results || []).filter(
        (artwork: { title: string; artist: string }) => {
          if (artwork.title === title && artwork.artist === artist) {
            return false;
          }
          return true;
        }
      );

      res.json({
        results: filteredResults.slice(0, 20),
        metadata: {
          originalArtwork: { title, artist, date, department },
          searchTerms: similarityParams.searchTerms,
          reasoning: similarityParams.reasoning,
        },
      });
    } catch (error) {
      log.error('Similar artwork search error', {
        error: getErrorMessage(error),
      });

      if (openai) {
        statistics.trackOpenAICall('gpt-4', 0, 0, false, {
          endpoint: 'chat.completions',
          purpose: 'similar-artwork',
          error: getErrorMessage(error),
        });
      }

      res.status(500).json({
        error: 'Similar search failed: ' + (getErrorMessage(error)),
      });
    }
  });

  /**
   * Get random artwork from multiple sources
   * GET /api/art/random
   */
  router.get('/random', async (_req: Request, res: Response) => {
    try {
      log.info('Getting random artwork from multiple sources');

      const artDepartments = [
        'European Paintings',
        'Modern and Contemporary Art',
        'Drawings and Prints',
        'Asian Art',
        'American Paintings and Sculpture',
        'The Robert Lehman Collection',
        'Photographs',
      ];

      const tryMet = async (): Promise<RandomArtwork | null> => {
        try {
          const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=painting`;
          const searchResponse = await fetch(searchUrl);

          const contentType = searchResponse.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            return null;
          }

          const searchData = (await searchResponse.json()) as { objectIDs?: number[] };

          if (!searchData.objectIDs || searchData.objectIDs.length === 0) {
            return null;
          }

          for (let attempt = 0; attempt < 20; attempt++) {
            const randomId = searchData.objectIDs[Math.floor(Math.random() * searchData.objectIDs.length)];
            const objectUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${randomId}`;

            try {
              const objectResponse = await fetch(objectUrl);
              const objectContentType = objectResponse.headers.get('content-type');
              if (!objectContentType || !objectContentType.includes('application/json')) {
                continue;
              }

              const objectData = (await objectResponse.json()) as {
                objectID: number;
                title?: string;
                artistDisplayName?: string;
                objectDate?: string;
                primaryImage?: string;
                primaryImageSmall?: string;
                department?: string;
                culture?: string;
                isPublicDomain?: boolean;
              };

              const isArtwork =
                objectData.primaryImage && objectData.isPublicDomain && artDepartments.includes(objectData.department || '');

              if (isArtwork) {
                log.debug('Found random Met artwork', { title: objectData.title });
                return {
                  id: `met-${objectData.objectID}`,
                  title: objectData.title || 'Untitled',
                  artist: objectData.artistDisplayName || 'Unknown Artist',
                  date: objectData.objectDate || '',
                  imageUrl: objectData.primaryImage!,
                  thumbnailUrl: objectData.primaryImageSmall || objectData.primaryImage!,
                  department: objectData.department || '',
                  culture: objectData.culture || '',
                  source: 'The Met Museum',
                };
              }
            } catch {
              continue;
            }
          }

          return null;
        } catch (error) {
          log.error('Error getting random Met artwork', {
            error: getErrorMessage(error),
          });
          return null;
        }
      };

      const tryArtic = async (): Promise<RandomArtwork | null> => {
        try {
          const articUrl = `https://api.artic.edu/api/v1/artworks/search?q=painting&limit=100&fields=id,title,artist_display,date_display,image_id,is_public_domain,department_title`;
          const articResponse = await fetch(articUrl);

          const contentType = articResponse.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            return null;
          }

          const articData = (await articResponse.json()) as {
            data?: Array<{
              id: number;
              title?: string;
              artist_display?: string;
              date_display?: string;
              image_id?: string;
              is_public_domain?: boolean;
              department_title?: string;
            }>;
          };

          if (!articData.data || articData.data.length === 0) {
            return null;
          }

          const validArtworks = articData.data.filter(
            (artwork) => artwork.image_id && artwork.is_public_domain && artwork.department_title
          );

          if (validArtworks.length === 0) {
            return null;
          }

          const randomArtwork = validArtworks[Math.floor(Math.random() * validArtworks.length)]!;

          log.debug('Found random ARTIC artwork', { title: randomArtwork.title });
          return {
            id: `artic-${randomArtwork.id}`,
            title: randomArtwork.title || 'Untitled',
            artist: randomArtwork.artist_display || 'Unknown Artist',
            date: randomArtwork.date_display || '',
            imageUrl: `https://www.artic.edu/iiif/2/${randomArtwork.image_id}/full/1200,/0/default.jpg`,
            thumbnailUrl: `https://www.artic.edu/iiif/2/${randomArtwork.image_id}/full/400,/0/default.jpg`,
            department: randomArtwork.department_title || '',
            culture: '',
            source: 'Art Institute of Chicago',
          };
        } catch (error) {
          log.error('Error getting random ARTIC artwork', {
            error: getErrorMessage(error),
          });
          return null;
        }
      };

      const tryCleveland = async (): Promise<RandomArtwork | null> => {
        try {
          const cmaUrl = `https://openaccess-api.clevelandart.org/api/artworks/?cc=1&has_image=1&limit=100`;
          const cmaResponse = await fetch(cmaUrl);

          const contentType = cmaResponse.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            return null;
          }

          const cmaData = (await cmaResponse.json()) as {
            data?: Array<{
              id: number;
              title?: string;
              creators?: Array<{ description?: string }>;
              tombstone?: string;
              creation_date?: string;
              images?: { web?: { url?: string } };
              share_license_status?: string;
              department?: string;
              culture?: string[];
            }>;
          };

          if (!cmaData.data || cmaData.data.length === 0) {
            return null;
          }

          const validArtworks = cmaData.data.filter(
            (artwork) => artwork.images?.web?.url && artwork.share_license_status === 'cc0'
          );

          if (validArtworks.length === 0) {
            return null;
          }

          const randomArtwork = validArtworks[Math.floor(Math.random() * validArtworks.length)]!;

          log.debug('Found random CMA artwork', { title: randomArtwork.title });
          return {
            id: `cma-${randomArtwork.id}`,
            title: randomArtwork.title || 'Untitled',
            artist: randomArtwork.creators?.[0]?.description || randomArtwork.tombstone || 'Unknown Artist',
            date: randomArtwork.creation_date || '',
            imageUrl: randomArtwork.images!.web!.url!,
            thumbnailUrl: randomArtwork.images!.web!.url!,
            department: randomArtwork.department || '',
            culture: randomArtwork.culture?.[0] || '',
            source: 'Cleveland Museum of Art',
          };
        } catch (error) {
          log.error('Error getting random CMA artwork', {
            error: getErrorMessage(error),
          });
          return null;
        }
      };

      const tryRijksmuseum = async (): Promise<RandomArtwork | null> => {
        try {
          const rijksUrl = `https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&imgonly=true&ps=100`;
          const rijksResponse = await fetch(rijksUrl);

          const contentType = rijksResponse.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            return null;
          }

          const rijksData = (await rijksResponse.json()) as {
            artObjects?: Array<{
              objectNumber: string;
              title?: string;
              principalOrFirstMaker?: string;
              dating?: { presentingDate?: string };
              webImage?: { url?: string };
              permitDownload?: boolean;
            }>;
          };

          if (!rijksData.artObjects || rijksData.artObjects.length === 0) {
            return null;
          }

          const validArtworks = rijksData.artObjects.filter((artwork) => artwork.webImage?.url && artwork.permitDownload);

          if (validArtworks.length === 0) {
            return null;
          }

          const randomArtwork = validArtworks[Math.floor(Math.random() * validArtworks.length)]!;

          log.debug('Found random Rijksmuseum artwork', { title: randomArtwork.title });
          return {
            id: `rijks-${randomArtwork.objectNumber}`,
            title: randomArtwork.title || 'Untitled',
            artist: randomArtwork.principalOrFirstMaker || 'Unknown Artist',
            date: randomArtwork.dating?.presentingDate || '',
            imageUrl: randomArtwork.webImage!.url!,
            thumbnailUrl: randomArtwork.webImage!.url!,
            department: '',
            culture: '',
            source: 'Rijksmuseum',
          };
        } catch (error) {
          log.error('Error getting random Rijksmuseum artwork', {
            error: getErrorMessage(error),
          });
          return null;
        }
      };

      const sources = [tryMet, tryArtic, tryCleveland, tryRijksmuseum];
      const shuffled = sources.sort(() => Math.random() - 0.5);

      let artwork: RandomArtwork | null = null;
      for (const trySource of shuffled) {
        artwork = await trySource();
        if (artwork) break;
      }

      if (!artwork) {
        res.status(404).json({ error: 'Could not find suitable artwork from any source' });
        return;
      }

      res.json(artwork);
    } catch (error) {
      log.error('Error getting random art', {
        error: getErrorMessage(error),
      });
      res.status(500).json({
        error: 'Internal server error: ' + (getErrorMessage(error)),
      });
    }
  });

  /**
   * Import artwork from URL
   * POST /api/art/import
   */
  router.post('/import', apiKeyAuth, async (req: Request, res: Response) => {
    try {
      const { imageUrl, title, artist, source, rotation, cropX, cropY, zoomLevel } = req.body as {
        imageUrl?: string;
        title?: string;
        artist?: string;
        source?: string;
        rotation?: number;
        cropX?: number | string;
        cropY?: number | string;
        zoomLevel?: number | string;
      };

      if (!imageUrl) {
        res.status(400).json({ error: 'Image URL required' });
        return;
      }

      const rotationDegrees = rotation || 0;
      const cropXVal = cropX !== undefined ? parseFloat(String(cropX)) : 50;
      const cropYVal = cropY !== undefined ? parseFloat(String(cropY)) : 50;
      const zoomVal = zoomLevel !== undefined ? parseFloat(String(zoomLevel)) : 1.0;

      log.info('Importing artwork', {
        title,
        imageUrl,
        rotation: rotationDegrees,
        cropX: cropXVal,
        cropY: cropYVal,
        zoom: zoomVal,
      });

      let imageResponse: globalThis.Response;
      try {
        imageResponse = await fetch(imageUrl);
      } catch (fetchError) {
        log.error('Failed to fetch image from URL', {
          error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        });
        res.status(400).json({
          error: `Failed to fetch image: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
        });
        return;
      }

      if (!imageResponse.ok) {
        log.error('Image fetch failed', { status: imageResponse.status });
        res.status(400).json({ error: `Failed to fetch image: HTTP ${imageResponse.status}` });
        return;
      }

      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      log.debug('Downloaded image', { bytes: imageBuffer.length });

      await ensureDir(uploadDir);

      const tempPath = path.join(uploadDir, `temp-${Date.now()}.jpg`);
      await fs.writeFile(tempPath, imageBuffer);
      log.debug('Saved to temp file', { tempPath });

      const targetWidth = rotationDegrees === 90 || rotationDegrees === 270 ? 1600 : 1200;
      const targetHeight = rotationDegrees === 90 || rotationDegrees === 270 ? 1200 : 1600;

      log.debug('Processing image for e-ink display');
      const ditheredRgbBuffer = await imageProcessing.convertImageToRGB(
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
      log.debug('Image processed and dithered');

      const thumbnailWidth = rotationDegrees === 90 || rotationDegrees === 270 ? 400 : 300;
      const thumbnailHeight = rotationDegrees === 90 || rotationDegrees === 270 ? 300 : 400;

      const thumbnailBuffer = await sharp(ditheredRgbBuffer, {
        raw: {
          width: targetWidth,
          height: targetHeight,
          channels: 3,
        },
      })
        .resize(thumbnailWidth, thumbnailHeight, { fit: 'fill' })
        .png()
        .toBuffer();

      await fs.unlink(tempPath);

      const imageId = uuidv4();

      const settings: ServerSettings = (await readJSONFile('settings.json')) || {
        defaultSleepDuration: 3600000000,
      };

      const currentData: ImageArchiveEntry = {
        title: title || 'Artwork',
        artist: artist || 'Unknown',
        source: source || 'external',
        imageId: imageId,
        image: ditheredRgbBuffer.toString('base64'),
        timestamp: Date.now(),
        sleepDuration: settings.defaultSleepDuration || 3600000000,
        rotation: rotationDegrees,
        originalImage: imageBuffer.toString('base64'),
        originalImageMime: imageResponse.headers.get('content-type') || 'image/jpeg',
      };

      await writeJSONFile('current.json', currentData);

      const imagesArchive: Record<string, ImageArchiveEntry> = (await readJSONFile('images.json')) || {};
      imagesArchive[imageId] = currentData;
      await writeJSONFile('images.json', imagesArchive);

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

      log.info('Imported artwork', { title, source, artist: artist || 'Unknown' });
      addDeviceLog(`Applied artwork from browse: "${title}" by ${artist || 'Unknown'}`);

      res.json({ success: true, message: 'Artwork imported successfully' });
    } catch (error) {
      log.error('Error importing art', {
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({
        error: 'Internal server error: ' + (getErrorMessage(error)),
        details: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  return router;
}

export default createArtRoutes;
