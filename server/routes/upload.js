/**
 * Upload Routes
 * File upload, AI generation endpoints
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const { sanitizeInput, getRandomLuckyPrompt } = require('../utils/validation');
const { readJSONFile, writeJSONFile } = require('../utils/data-store');
const { addDeviceLog } = require('../utils/state');
const imageProcessing = require('../services/image-processing');
const statistics = require('../services/statistics');

/**
 * Create upload routes
 * @param {Object} options - Configuration options
 * @param {Object} options.upload - Multer upload middleware
 * @param {string} options.uploadDir - Upload directory path
 * @param {Object} options.openai - OpenAI client instance
 * @returns {express.Router} Express router
 */
function createUploadRoutes({ upload, uploadDir, openai }) {
    const router = express.Router();

    /**
     * Upload image to history (preview before applying)
     * Fast upload - saves original only, dithering happens when user clicks "Apply"
     * POST /api/upload
     */
    router.post('/upload', upload.single('image'), async (req, res) => {
        try {
            if (!req.file) {
                console.error('Upload failed: No file in request');
                return res.status(400).json({ error: 'No file uploaded' });
            }

            console.log(`Uploading image for preview: ${req.file.originalname}`, {
                size: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
                mimetype: req.file.mimetype,
                originalname: req.file.originalname
            });

            // Read file and compute hash for duplicate detection
            const fileBuffer = await fs.readFile(req.file.path);
            const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 16);

            // Check for duplicate by hash
            const imagesArchive = (await readJSONFile('images.json')) || {};
            const existingEntry = Object.entries(imagesArchive).find(([_, img]) => img.contentHash === fileHash);

            if (existingEntry) {
                const [existingId, existingImage] = existingEntry;
                console.log(`Duplicate image detected (hash: ${fileHash}), returning existing: ${existingId}`);

                // Clean up uploaded file
                await fs.unlink(req.file.path);

                addDeviceLog(`Duplicate upload detected: "${req.file.originalname}" matches existing image`);

                return res.json({
                    success: true,
                    imageId: existingId,
                    title: existingImage.title,
                    message: 'This image already exists in your collection.',
                    duplicate: true
                });
            }

            const imageId = uuidv4();
            const timestamp = Date.now();

            // Create optimized original and thumbnail in parallel for faster uploads
            const [optimizedOriginalBuffer, thumbnailBuffer] = await Promise.all([
                // Optimized version for web display (max 800px wide, maintain aspect ratio)
                sharp(req.file.path)
                    .rotate() // Auto-rotate based on EXIF
                    .resize(800, null, {
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .jpeg({ quality: 85 })
                    .toBuffer(),
                // Thumbnail for web preview (300x400)
                sharp(req.file.path)
                    .rotate() // Auto-rotate based on EXIF
                    .resize(300, 400, { fit: 'inside' })
                    .png()
                    .toBuffer()
            ]);

            // Encode as base64
            const originalImageBase64 = optimizedOriginalBuffer.toString('base64');
            const thumbnailBase64 = thumbnailBuffer.toString('base64');

            const title = `Uploaded: ${req.file.originalname}`;

            // Store in images archive for history (original only, dithered image created on apply)
            // Note: imagesArchive was already loaded above for duplicate detection
            imagesArchive[imageId] = {
                title: title,
                imageId: imageId,
                timestamp: timestamp,
                rotation: 0,
                originalImage: originalImageBase64, // Optimized version for preview
                originalImageMime: 'image/jpeg', // Optimized as JPEG
                thumbnail: thumbnailBase64,
                aiGenerated: false,
                uploadedFilename: req.file.originalname,
                contentHash: fileHash // For duplicate detection
            };
            await writeJSONFile('images.json', imagesArchive);

            // Add to history (metadata + thumbnail)
            const history = (await readJSONFile('history.json')) || [];
            history.unshift({
                imageId: imageId,
                title: title,
                thumbnail: thumbnailBase64,
                timestamp: timestamp,
                aiGenerated: false,
                uploadedFilename: req.file.originalname
            });

            // Keep only last 50 images in history to prevent JSON from growing too large
            if (history.length > 50) {
                const removedItems = history.splice(50);
                // Clean up old images from archive
                for (const item of removedItems) {
                    delete imagesArchive[item.imageId];
                }
                await writeJSONFile('images.json', imagesArchive);
            }
            await writeJSONFile('history.json', history);

            // Clean up uploaded file
            await fs.unlink(req.file.path);

            console.log(`Image uploaded for preview: ${imageId}`);
            addDeviceLog(`New image uploaded for preview: "${req.file.originalname}"`);

            res.json({
                success: true,
                imageId: imageId,
                title: title,
                message: 'Image uploaded. Adjust crop/zoom and click Apply to display.'
            });
        } catch (error) {
            console.error('Error uploading image:', error);
            if (req.file?.path) {
                try {
                    await fs.unlink(req.file.path);
                } catch {}
            }
            res.status(500).json({ error: 'Error uploading image: ' + error.message });
        }
    });

    /**
     * AI Image Generation endpoint
     * POST /api/generate-art
     */
    router.post('/generate-art', async (req, res) => {
        try {
            if (!openai) {
                return res.status(503).json({
                    error: 'AI generation not available. OPENAI_API_KEY not configured.'
                });
            }

            const { prompt, rotation, sleepDuration, quality, style, imageStyle } = req.body;

            if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
                return res.status(400).json({ error: 'Prompt is required' });
            }

            console.log(`Generating AI art with prompt: "${prompt}"`);

            // Input validation - use settings default if not provided
            const settings = (await readJSONFile('settings.json')) || { defaultSleepDuration: 3600000000 };
            const sleepMs = parseInt(sleepDuration) || settings.defaultSleepDuration;
            const rotationDegrees = parseInt(rotation) || 0;
            const imageQuality = quality === 'hd' ? 'high' : 'medium';
            const artStyle = style || 'balanced';

            // Enhanced prompt engineering for e-ink display optimization
            let styleGuidance = '';
            let compositionRules = '';

            switch(artStyle) {
                case 'minimalist':
                    styleGuidance = 'Minimalist style with clean geometric shapes, strong contrast between elements';
                    compositionRules = 'The composition extends to all four edges of the canvas with no empty margins or borders. Content bleeds off the edges naturally.';
                    break;
                case 'detailed':
                    styleGuidance = 'Highly detailed artwork with intricate patterns, rich textures, and complex visual elements throughout';
                    compositionRules = 'Every part of the canvas from edge to edge is filled with detailed elements. The pattern or subject extends beyond the visible frame.';
                    break;
                case 'abstract':
                    styleGuidance = 'Bold abstract art with strong geometric or organic shapes, high contrast colors and forms';
                    compositionRules = 'Abstract shapes and patterns fill the entire canvas edge to edge, bleeding off all sides. No negative space at the borders.';
                    break;
                case 'line-art':
                    styleGuidance = 'Pen and ink drawing style with confident linework, similar to woodblock prints or linocuts';
                    compositionRules = 'The illustration fills the frame completely with the subject extending to the edges. Think full-bleed poster design.';
                    break;
                default: // balanced
                    styleGuidance = 'Artistic composition optimized for digital display with good contrast and visual interest';
                    compositionRules = 'Use a full-bleed composition where the subject or pattern extends to all edges. No white borders or empty margins around the artwork.';
            }

            const enhancedPrompt = `${prompt}. ${styleGuidance}. COMPOSITION RULES: ${compositionRules} This artwork must fill a tall vertical portrait frame completely with NO empty borders, NO colored bars on top or bottom, NO whitespace margins. The subject extends naturally beyond all four edges of the frame like a full-bleed poster or magazine cover. Absolutely NO letterboxing or pillarboxing.`;

            console.log(`Enhanced prompt: ${enhancedPrompt}`);

            // Generate image with GPT-4o image generation (gpt-image-1)
            const response = await openai.images.generate({
                model: 'gpt-image-1',
                prompt: enhancedPrompt,
                n: 1,
                size: '1024x1536',
                quality: imageQuality
            });

            const imageBase64 = response.data[0].b64_json;
            console.log(`AI image generated (base64, ${imageBase64 ? imageBase64.length : 0} chars)`);

            // Track OpenAI API usage
            statistics.trackOpenAICall('gpt-image-1', 0, 0, true, {
                endpoint: 'images.generate',
                size: '1024x1536',
                quality: imageQuality,
                style: artStyle
            });

            // Decode base64 to buffer
            const imageBuffer = Buffer.from(imageBase64, 'base64');

            // Save to temporary file
            const tempFilePath = path.join(uploadDir, `ai-gen-${Date.now()}.png`);
            await fs.writeFile(tempFilePath, imageBuffer);

            // Convert to RGB format for e-ink display (with rotation and auto-crop)
            const rgbBuffer = await imageProcessing.convertImageToRGB(tempFilePath, rotationDegrees, 1200, 1600, {
                autoCropWhitespace: true,
                enhanceContrast: true,
                ditherAlgorithm: 'floyd-steinberg'
            });

            // Create optimized version for web display
            const optimizedOriginalBuffer = await sharp(imageBuffer)
                .resize(800, null, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 85 })
                .toBuffer();

            // Create thumbnail for web preview
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
                quality: imageQuality
            };

            await writeJSONFile('current.json', current);

            // Store metadata in images archive
            const imagesArchive = (await readJSONFile('images.json')) || {};
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
                quality: imageQuality
            };
            await writeJSONFile('images.json', imagesArchive);

            // Add to history
            const history = (await readJSONFile('history.json')) || [];
            history.unshift({
                imageId: imageId,
                title: current.title,
                thumbnail: thumbnailBase64,
                timestamp: current.timestamp,
                aiGenerated: true,
                originalPrompt: prompt,
                artStyle: artStyle,
                quality: imageQuality,
                rotation: rotationDegrees
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

            // Clean up temp file
            await fs.unlink(tempFilePath);

            console.log(`AI art generated and processed successfully`);
            addDeviceLog(`New AI art generated: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}" (${artStyle} style)`);

            res.json({
                success: true,
                current,
                revisedPrompt: response.data[0].revised_prompt
            });
        } catch (error) {
            console.error('Error generating AI art:', error);

            // Track failed OpenAI API call
            statistics.trackOpenAICall('gpt-image-1', 0, 0, false, {
                endpoint: 'images.generate',
                error: error.message
            });

            res.status(500).json({
                error: 'Error generating AI art: ' + error.message
            });
        }
    });

    /**
     * Lucky prompt helper - expands simple cues into a detailed art prompt
     * POST /api/lucky-prompt
     */
    router.post('/lucky-prompt', async (req, res) => {
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
            vibe && `Vibe: ${vibe}`
        ].filter(Boolean);

        if (!openai) {
            return res.status(503).json({
                error: 'AI generation not available. OPENAI_API_KEY not configured.'
            });
        }

        try {
            let userContent;
            let temperature;

            if (currentPrompt) {
                // Enhance/expand existing prompt
                temperature = 0.8;
                userContent = `Take this existing prompt and enhance it with more vivid details, stronger contrast elements, and full-bleed composition guidance:\n\n"${currentPrompt}"\n\nExpand it into a complete, detailed prompt (under 80 words) for creating gallery-worthy art with dramatic visual impact.`;
            } else if (cueParts.length > 0) {
                // Use provided cues
                temperature = 0.9;
                userContent = `Use the following loose guidance to create a vivid prompt:\n${cueParts.join('\n')}\n\nDeliver one complete prompt ready for image generation, highlighting full-bleed composition, dramatic lighting, and strong contrast suitable for a striking art poster.`;
            } else {
                // Generate from random theme
                temperature = 1.1;
                const inspirationSeed = getRandomLuckyPrompt();
                userContent = `Surprise me with a fresh, inspiring idea for a portrait-oriented AI artwork with bold visual impact. Lean into ${inspirationSeed}. Make sure the prompt enforces full-bleed composition, edge-to-edge detail, and dramatic contrast.`;
            }

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                max_tokens: 220,
                temperature,
                messages: [
                    {
                        role: 'system',
                        content: 'You are curating prompts for an AI art gallery. Generate prompts that create museum-quality, gallery-worthy artwork with strong visual impact. Focus on bold compositions, rich textures, dramatic contrast, and full-bleed designs that command attention. Think poster art, fine art prints, and striking visuals. Respond with a single vivid prompt under 80 words.'
                    },
                    {
                        role: 'user',
                        content: userContent
                    }
                ]
            });

            const candidate = response?.choices?.[0]?.message?.content?.trim();

            // Track OpenAI API usage
            statistics.trackOpenAICall('gpt-4o-mini',
                response.usage?.prompt_tokens || 0,
                response.usage?.completion_tokens || 0,
                true, {
                    endpoint: 'chat.completions',
                    temperature,
                    hasPrompt: !!currentPrompt,
                    hasCues: cueParts.length > 0
                });

            if (!candidate) {
                console.warn('OpenAI returned no content for lucky prompt');
                return res.status(502).json({
                    error: 'AI did not return a prompt. Please try again.'
                });
            }

            const generatedPrompt = candidate.replace(/^"+|"+$/g, '');

            // Build response with context
            const responseData = {
                prompt: generatedPrompt,
                source: 'openai'
            };

            if (currentPrompt) {
                responseData.enhanced = true;
                responseData.original = currentPrompt;
            } else if (cueParts.length > 0) {
                responseData.inspiration = cueParts;
            }

            res.json(responseData);
        } catch (error) {
            console.error('Error generating lucky prompt with OpenAI:', error);

            // Track failed OpenAI API call
            statistics.trackOpenAICall('gpt-4o-mini', 0, 0, false, {
                endpoint: 'chat.completions',
                error: error.message
            });

            res.status(502).json({
                error: 'Unable to generate prompt right now. Please try again shortly.'
            });
        }
    });

    return router;
}

module.exports = createUploadRoutes;
