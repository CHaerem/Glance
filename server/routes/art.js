/**
 * Art API Routes
 * Search, smart-search, similar, random, and import endpoints
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const { performArtSearch } = require('../services/museum-api');
const imageProcessing = require('../services/image-processing');
const statistics = require('../services/statistics');
const { readJSONFile, writeJSONFile, ensureDir } = require('../utils/data-store');
const { addDeviceLog } = require('../utils/state');
const { loggers } = require('../services/logger');
const { apiKeyAuth } = require('../middleware/auth');
const log = loggers.api;

/**
 * Create art routes with dependencies
 * @param {Object} options - Configuration options
 * @param {Object} options.openai - OpenAI client instance (optional)
 * @param {string} options.uploadDir - Upload directory path
 * @returns {express.Router} Express router
 */
function createArtRoutes({ openai, uploadDir }) {
    const router = express.Router();

    /**
     * Search artworks
     * GET /api/art/search?q=query&limit=20&offset=0
     */
    router.get('/search', async (req, res) => {
        try {
            const { q: query, limit = 20, offset = 0 } = req.query;
            const result = await performArtSearch(query, parseInt(limit), parseInt(offset));
            res.json(result);
        } catch (error) {
            log.error('Error searching art', { error });
            res.status(500).json({ error: "Internal server error: " + error.message });
        }
    });

    /**
     * AI-powered smart search
     * POST /api/art/smart-search
     */
    router.post('/smart-search', async (req, res) => {
        try {
            const { query } = req.body;

            if (!query) {
                return res.status(400).json({ error: "Query is required" });
            }

            if (!openai) {
                log.info('OpenAI not configured, using simple search');
                return res.redirect(307, `/api/art/search?q=${encodeURIComponent(query)}`);
            }

            log.info('Smart search query', { query });

            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
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
}`
                    },
                    {
                        role: "user",
                        content: query
                    }
                ],
                temperature: 0.3,
                max_tokens: 300
            });

            statistics.trackOpenAICall('gpt-4',
                completion.usage?.prompt_tokens || 0,
                completion.usage?.completion_tokens || 0,
                true, {
                    endpoint: 'chat.completions',
                    purpose: 'smart-search',
                    query: query.substring(0, 50)
                });

            let searchParams;
            try {
                const content = completion.choices[0].message.content;
                searchParams = JSON.parse(content);
            } catch (parseError) {
                log.error('Failed to parse OpenAI response', { error: parseError });
                return res.redirect(307, `/api/art/search?q=${encodeURIComponent(query)}`);
            }

            log.debug('Extracted search parameters', { searchParams });

            const searchQuery = [
                ...(searchParams.searchTerms || []),
                ...(searchParams.styles || []),
                ...(searchParams.subjects || [])
            ].join(" ").trim() || query;

            const searchResults = await performArtSearch(searchQuery, 20);

            res.json({
                results: searchResults.results || [],
                metadata: {
                    originalQuery: query,
                    searchQuery: searchQuery,
                    parameters: searchParams
                }
            });

        } catch (error) {
            log.error('Smart search error', { error });

            if (openai) {
                statistics.trackOpenAICall('gpt-4', 0, 0, false, {
                    endpoint: 'chat.completions',
                    purpose: 'smart-search',
                    error: error.message
                });
            }

            res.status(500).json({ error: "Search failed: " + error.message });
        }
    });

    /**
     * Find similar artworks using AI
     * POST /api/art/similar
     */
    router.post('/similar', async (req, res) => {
        try {
            const { title, artist, date, department, source } = req.body;

            if (!title && !artist) {
                return res.status(400).json({ error: "Title or artist is required" });
            }

            if (!openai) {
                log.info('OpenAI not configured, using simple similarity search');
                const fallbackQuery = artist || title.split(' ').slice(0, 3).join(' ');
                return res.redirect(307, `/api/art/search?q=${encodeURIComponent(fallbackQuery)}`);
            }

            log.info('Finding similar artworks', { title, artist });

            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
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
}`
                    },
                    {
                        role: "user",
                        content: `Find artworks similar to:
Title: ${title}
Artist: ${artist || 'Unknown'}
Date: ${date || 'Unknown'}
Department/Type: ${department || 'Unknown'}
Source: ${source || 'Unknown'}`
                    }
                ],
                temperature: 0.7,
                max_tokens: 200
            });

            statistics.trackOpenAICall('gpt-4',
                completion.usage?.prompt_tokens || 0,
                completion.usage?.completion_tokens || 0,
                true, {
                    endpoint: 'chat.completions',
                    purpose: 'similar-artwork',
                    artwork: `${title} by ${artist}`.substring(0, 50)
                });

            let similarityParams;
            try {
                const content = completion.choices[0].message.content;
                similarityParams = JSON.parse(content);
            } catch (parseError) {
                log.error('Failed to parse OpenAI response', { error: parseError });
                const fallbackQuery = artist || title.split(' ').slice(0, 3).join(' ');
                return res.redirect(307, `/api/art/search?q=${encodeURIComponent(fallbackQuery)}`);
            }

            log.debug('Similarity search terms', { searchTerms: similarityParams.searchTerms, reasoning: similarityParams.reasoning });

            const searchQuery = similarityParams.searchTerms.join(" ");
            const searchResults = await performArtSearch(searchQuery, 30);

            const filteredResults = (searchResults.results || []).filter(artwork => {
                if (artwork.title === title && artwork.artist === artist) {
                    return false;
                }
                return true;
            });

            res.json({
                results: filteredResults.slice(0, 20),
                metadata: {
                    originalArtwork: { title, artist, date, department },
                    searchTerms: similarityParams.searchTerms,
                    reasoning: similarityParams.reasoning
                }
            });

        } catch (error) {
            log.error('Similar artwork search error', { error });

            if (openai) {
                statistics.trackOpenAICall('gpt-4', 0, 0, false, {
                    endpoint: 'chat.completions',
                    purpose: 'similar-artwork',
                    error: error.message
                });
            }

            res.status(500).json({ error: "Similar search failed: " + error.message });
        }
    });

    /**
     * Get random artwork from multiple sources
     * GET /api/art/random
     */
    router.get('/random', async (req, res) => {
        try {
            log.info('Getting random artwork from multiple sources');

            const artDepartments = [
                "European Paintings",
                "Modern and Contemporary Art",
                "Drawings and Prints",
                "Asian Art",
                "American Paintings and Sculpture",
                "The Robert Lehman Collection",
                "Photographs"
            ];

            const tryMet = async () => {
                try {
                    const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=painting`;
                    const searchResponse = await fetch(searchUrl);

                    const contentType = searchResponse.headers.get("content-type");
                    if (!contentType || !contentType.includes("application/json")) {
                        return null;
                    }

                    const searchData = await searchResponse.json();

                    if (!searchData.objectIDs || searchData.objectIDs.length === 0) {
                        return null;
                    }

                    for (let attempt = 0; attempt < 20; attempt++) {
                        const randomId = searchData.objectIDs[Math.floor(Math.random() * searchData.objectIDs.length)];
                        const objectUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${randomId}`;

                        try {
                            const objectResponse = await fetch(objectUrl);
                            const objectContentType = objectResponse.headers.get("content-type");
                            if (!objectContentType || !objectContentType.includes("application/json")) {
                                continue;
                            }

                            const objectData = await objectResponse.json();

                            const isArtwork = objectData.primaryImage &&
                                              objectData.isPublicDomain &&
                                              artDepartments.includes(objectData.department);

                            if (isArtwork) {
                                log.debug('Found random Met artwork', { title: objectData.title });
                                return {
                                    id: `met-${objectData.objectID}`,
                                    title: objectData.title || "Untitled",
                                    artist: objectData.artistDisplayName || "Unknown Artist",
                                    date: objectData.objectDate || "",
                                    imageUrl: objectData.primaryImage,
                                    thumbnailUrl: objectData.primaryImageSmall || objectData.primaryImage,
                                    department: objectData.department || "",
                                    culture: objectData.culture || "",
                                    source: "The Met Museum"
                                };
                            }
                        } catch {
                            continue;
                        }
                    }

                    return null;
                } catch (error) {
                    log.error('Error getting random Met artwork', { error: error.message });
                    return null;
                }
            };

            const tryArtic = async () => {
                try {
                    const articUrl = `https://api.artic.edu/api/v1/artworks/search?q=painting&limit=100&fields=id,title,artist_display,date_display,image_id,is_public_domain,department_title`;
                    const articResponse = await fetch(articUrl);

                    const contentType = articResponse.headers.get("content-type");
                    if (!contentType || !contentType.includes("application/json")) {
                        return null;
                    }

                    const articData = await articResponse.json();

                    if (!articData.data || articData.data.length === 0) {
                        return null;
                    }

                    const validArtworks = articData.data.filter(artwork =>
                        artwork.image_id &&
                        artwork.is_public_domain &&
                        artwork.department_title
                    );

                    if (validArtworks.length === 0) {
                        return null;
                    }

                    const randomArtwork = validArtworks[Math.floor(Math.random() * validArtworks.length)];

                    log.debug('Found random ARTIC artwork', { title: randomArtwork.title });
                    return {
                        id: `artic-${randomArtwork.id}`,
                        title: randomArtwork.title || "Untitled",
                        artist: randomArtwork.artist_display || "Unknown Artist",
                        date: randomArtwork.date_display || "",
                        imageUrl: `https://www.artic.edu/iiif/2/${randomArtwork.image_id}/full/1200,/0/default.jpg`,
                        thumbnailUrl: `https://www.artic.edu/iiif/2/${randomArtwork.image_id}/full/400,/0/default.jpg`,
                        department: randomArtwork.department_title || "",
                        culture: "",
                        source: "Art Institute of Chicago"
                    };
                } catch (error) {
                    log.error('Error getting random ARTIC artwork', { error: error.message });
                    return null;
                }
            };

            const tryCleveland = async () => {
                try {
                    const cmaUrl = `https://openaccess-api.clevelandart.org/api/artworks/?cc=1&has_image=1&limit=100`;
                    const cmaResponse = await fetch(cmaUrl);

                    const contentType = cmaResponse.headers.get("content-type");
                    if (!contentType || !contentType.includes("application/json")) {
                        return null;
                    }

                    const cmaData = await cmaResponse.json();

                    if (!cmaData.data || cmaData.data.length === 0) {
                        return null;
                    }

                    const validArtworks = cmaData.data.filter(artwork =>
                        artwork.images?.web?.url &&
                        artwork.share_license_status === "cc0"
                    );

                    if (validArtworks.length === 0) {
                        return null;
                    }

                    const randomArtwork = validArtworks[Math.floor(Math.random() * validArtworks.length)];

                    log.debug('Found random CMA artwork', { title: randomArtwork.title });
                    return {
                        id: `cma-${randomArtwork.id}`,
                        title: randomArtwork.title || "Untitled",
                        artist: randomArtwork.creators?.[0]?.description || randomArtwork.tombstone || "Unknown Artist",
                        date: randomArtwork.creation_date || "",
                        imageUrl: randomArtwork.images.web.url,
                        thumbnailUrl: randomArtwork.images.web.url,
                        department: randomArtwork.department || "",
                        culture: randomArtwork.culture?.[0] || "",
                        source: "Cleveland Museum of Art"
                    };
                } catch (error) {
                    log.error('Error getting random CMA artwork', { error: error.message });
                    return null;
                }
            };

            const tryRijksmuseum = async () => {
                try {
                    const rijksUrl = `https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&imgonly=true&ps=100`;
                    const rijksResponse = await fetch(rijksUrl);

                    const contentType = rijksResponse.headers.get("content-type");
                    if (!contentType || !contentType.includes("application/json")) {
                        return null;
                    }

                    const rijksData = await rijksResponse.json();

                    if (!rijksData.artObjects || rijksData.artObjects.length === 0) {
                        return null;
                    }

                    const validArtworks = rijksData.artObjects.filter(artwork =>
                        artwork.webImage?.url &&
                        artwork.permitDownload
                    );

                    if (validArtworks.length === 0) {
                        return null;
                    }

                    const randomArtwork = validArtworks[Math.floor(Math.random() * validArtworks.length)];

                    log.debug('Found random Rijksmuseum artwork', { title: randomArtwork.title });
                    return {
                        id: `rijks-${randomArtwork.objectNumber}`,
                        title: randomArtwork.title || "Untitled",
                        artist: randomArtwork.principalOrFirstMaker || "Unknown Artist",
                        date: randomArtwork.dating?.presentingDate || "",
                        imageUrl: randomArtwork.webImage.url,
                        thumbnailUrl: randomArtwork.webImage.url,
                        department: "",
                        culture: "",
                        source: "Rijksmuseum"
                    };
                } catch (error) {
                    log.error('Error getting random Rijksmuseum artwork', { error: error.message });
                    return null;
                }
            };

            const sources = [tryMet, tryArtic, tryCleveland, tryRijksmuseum];
            const shuffled = sources.sort(() => Math.random() - 0.5);

            let artwork = null;
            for (const trySource of shuffled) {
                artwork = await trySource();
                if (artwork) break;
            }

            if (!artwork) {
                return res.status(404).json({ error: "Could not find suitable artwork from any source" });
            }

            res.json(artwork);
        } catch (error) {
            log.error('Error getting random art', { error });
            res.status(500).json({ error: "Internal server error: " + error.message });
        }
    });

    /**
     * Import artwork from URL
     * POST /api/art/import
     * Requires API key for external requests (sends to e-ink display)
     */
    router.post('/import', apiKeyAuth, async (req, res) => {
        try {
            const { imageUrl, title, artist, source, rotation, cropX, cropY, zoomLevel } = req.body;

            if (!imageUrl) {
                return res.status(400).json({ error: "Image URL required" });
            }

            const rotationDegrees = rotation || 0;
            const cropXVal = cropX !== undefined ? parseFloat(cropX) : 50;
            const cropYVal = cropY !== undefined ? parseFloat(cropY) : 50;
            const zoomVal = zoomLevel !== undefined ? parseFloat(zoomLevel) : 1.0;
            log.info('Importing artwork', { title, imageUrl, rotation: rotationDegrees, cropX: cropXVal, cropY: cropYVal, zoom: zoomVal });

            let imageResponse;
            try {
                imageResponse = await fetch(imageUrl);
            } catch (fetchError) {
                log.error('Failed to fetch image from URL', { error: fetchError.message });
                return res.status(400).json({ error: `Failed to fetch image: ${fetchError.message}` });
            }

            if (!imageResponse.ok) {
                log.error('Image fetch failed', { status: imageResponse.status });
                return res.status(400).json({ error: `Failed to fetch image: HTTP ${imageResponse.status}` });
            }

            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
            log.debug('Downloaded image', { bytes: imageBuffer.length });

            await ensureDir(uploadDir);

            const tempPath = path.join(uploadDir, `temp-${Date.now()}.jpg`);
            await fs.writeFile(tempPath, imageBuffer);
            log.debug('Saved to temp file', { tempPath });

            const targetWidth = (rotationDegrees === 90 || rotationDegrees === 270) ? 1600 : 1200;
            const targetHeight = (rotationDegrees === 90 || rotationDegrees === 270) ? 1200 : 1600;

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
                    zoomLevel: zoomVal
                }
            );
            log.debug('Image processed and dithered');

            const thumbnailWidth = (rotationDegrees === 90 || rotationDegrees === 270) ? 400 : 300;
            const thumbnailHeight = (rotationDegrees === 90 || rotationDegrees === 270) ? 300 : 400;

            const thumbnailBuffer = await sharp(ditheredRgbBuffer, {
                raw: {
                    width: targetWidth,
                    height: targetHeight,
                    channels: 3
                }
            })
            .resize(thumbnailWidth, thumbnailHeight, { fit: "fill" })
            .png()
            .toBuffer();

            await fs.unlink(tempPath);

            const imageId = uuidv4();

            const settings = (await readJSONFile("settings.json")) || { defaultSleepDuration: 3600000000 };

            const currentData = {
                title: title || "Artwork",
                artist: artist || "Unknown",
                source: source || "external",
                imageId: imageId,
                image: ditheredRgbBuffer.toString("base64"),
                timestamp: Date.now(),
                sleepDuration: settings.defaultSleepDuration,
                rotation: rotationDegrees,
                originalImage: imageBuffer.toString("base64"),
                originalImageMime: imageResponse.headers.get("content-type") || "image/jpeg"
            };

            await writeJSONFile("current.json", currentData);

            const imagesArchive = (await readJSONFile("images.json")) || {};
            imagesArchive[imageId] = currentData;
            await writeJSONFile("images.json", imagesArchive);

            const history = (await readJSONFile("history.json")) || [];
            history.unshift({
                imageId: imageId,
                title: currentData.title,
                artist: currentData.artist,
                source: currentData.source,
                timestamp: currentData.timestamp,
                thumbnail: thumbnailBuffer.toString("base64"),
                aiGenerated: false
            });

            if (history.length > 100) {
                const removed = history.slice(100);
                for (const item of removed) {
                    delete imagesArchive[item.imageId];
                }
                await writeJSONFile("images.json", imagesArchive);
            }
            await writeJSONFile("history.json", history);

            log.info('Imported artwork', { title, source, artist: artist || 'Unknown' });
            addDeviceLog(`Applied artwork from browse: "${title}" by ${artist || 'Unknown'}`);

            res.json({ success: true, message: "Artwork imported successfully" });
        } catch (error) {
            log.error('Error importing art', { error: error.message, stack: error.stack });
            res.status(500).json({
                error: "Internal server error: " + error.message,
                details: error.stack
            });
        }
    });

    return router;
}

module.exports = createArtRoutes;
