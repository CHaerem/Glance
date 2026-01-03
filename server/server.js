// Load environment variables from .env file
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const sharp = require("sharp");
const rateLimit = require("express-rate-limit");
const OpenAI = require("openai");

// Utility modules
const { formatBuildDate, getOsloTime, getOsloTimestamp, isInNightSleep, calculateNightSleepDuration } = require("./utils/time");
const { validateDeviceId, validateImageData, sanitizeInput, getRandomLuckyPrompt } = require("./utils/validation");
const { ensureDataDir, ensureDir, readJSONFile, writeJSONFile, getDataDir } = require("./utils/data-store");

// Services
const imageProcessing = require("./services/image-processing");
const statistics = require("./services/statistics");
const { performArtSearch, getCuratedCollections, CURATED_COLLECTIONS } = require("./services/museum-api");


const app = express();
const PORT = process.env.PORT || 3000;
const IMAGE_VERSION = process.env.IMAGE_VERSION || "local";
const BUILD_DATE = process.env.BUILD_DATE || "unknown";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

// Initialize OpenAI client if API key is available
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;


// Dev mode is now handled client-side:
// - Production server includes devServerHost in /api/current.json
// - ESP32 tries dev server first, falls back to production if unreachable
// - ESP32 reports fallback in device-status, which auto-disables dev mode



const BUILD_DATE_HUMAN = formatBuildDate(BUILD_DATE);

const UPLOAD_DIR = path.join(__dirname, "uploads");


// Configure multer for file uploads
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, UPLOAD_DIR);
	},
	filename: (req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
		cb(null, uniqueSuffix + path.extname(file.originalname));
	},
});

const upload = multer({
	storage: storage,
	limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit (handles iPhone photos)
	fileFilter: (req, file, cb) => {
		const allowedTypes = /jpeg|jpg|png|gif|bmp|webp/;
		const extname = allowedTypes.test(
			path.extname(file.originalname).toLowerCase()
		);
		const mimetype = allowedTypes.test(file.mimetype);

		if (mimetype && extname) {
			return cb(null, true);
		} else {
			cb(new Error("Only image files are allowed!"));
		}
	},
});

// Rate limiting disabled for development

// Upload rate limiting also disabled for development

// Middleware
app.use(cors());
// app.use(limiter); // Rate limiting disabled for development
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));
app.use("/uploads", express.static(UPLOAD_DIR));

// Load statistics on startup
statistics.loadStats().catch(err => console.error('Failed to load stats on startup:', err));


// API Routes

// Get current image metadata for ESP32 (without image data)
app.get("/api/current.json", async (req, res) => {
	try {
		// Check if playlist is active and advance if needed
		const playlist = await readJSONFile("playlist.json");
		if (playlist && playlist.active && playlist.images && playlist.images.length > 0) {
			const now = Date.now();
			const timeSinceLastUpdate = now - (playlist.lastUpdate || 0);
			const intervalMs = playlist.interval / 1000; // Convert microseconds to milliseconds

			// If enough time has passed, advance to next image
			if (timeSinceLastUpdate >= intervalMs) {
				let nextImageId;

				if (playlist.mode === "random") {
					nextImageId = playlist.images[Math.floor(Math.random() * playlist.images.length)];
				} else {
					// Sequential mode
					playlist.currentIndex = ((playlist.currentIndex || 0) + 1) % playlist.images.length;
					nextImageId = playlist.images[playlist.currentIndex];
				}

				// Load the next image from archive
				const imagesArchive = (await readJSONFile("images.json")) || {};
				const imageData = imagesArchive[nextImageId];

				if (imageData) {
					// Update current.json with next playlist image
					const currentData = {
						...imageData,
						sleepDuration: playlist.interval,
						timestamp: now
					};
					await writeJSONFile("current.json", currentData);

					// Update playlist with new timestamp
					playlist.lastUpdate = now;
					await writeJSONFile("playlist.json", playlist);

					console.log(`Playlist advanced to image ${nextImageId} (${playlist.mode} mode)`);
				}
			}
		}

		const current = (await readJSONFile("current.json")) || {
			title: "Glance Display",
			imageId: "",
			timestamp: Date.now(),
			sleepDuration: 3600000000, // 1 hour in microseconds
		};

		// Get dev mode settings
		const settings = (await readJSONFile("settings.json")) || {};
		const devServerHost = (settings.devMode && settings.devServerHost) ? settings.devServerHost : null;

		// Determine sleep duration based on night sleep mode
		let sleepDuration = current.sleepDuration || 3600000000;
		let nightSleepActive = false;

		if (isInNightSleep(settings)) {
			sleepDuration = calculateNightSleepDuration(settings);
			nightSleepActive = true;
		}

		// Send metadata only (no image data)
		const metadata = {
			hasImage: !!(current.image || current.imageId),
			title: current.title || "Glance Display",
			imageId: current.imageId || "default",
			timestamp: current.timestamp || Date.now(),
			sleepDuration: sleepDuration,
			rotation: current.rotation || 0,
			devServerHost: devServerHost // ESP32 will try this server first if present
		};

		const nightSleepLog = nightSleepActive ? ' [night sleep]' : '';
		console.log(`Serving metadata: hasImage=${metadata.hasImage}, imageId=${metadata.imageId}, sleep=${metadata.sleepDuration}us, devServer=${devServerHost || 'none'}${nightSleepLog}`);
		addDeviceLog(`Device fetched image metadata: ${metadata.imageId} (sleep: ${Math.round(metadata.sleepDuration/60000000)}min)${devServerHost ? ' [dev mode]' : ''}${nightSleepLog}`);
		res.json(metadata);
	} catch (error) {
		console.error("Error getting current:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get current image with full data for web UI (with caching)
app.get("/api/current-full.json", async (req, res) => {
	try {
		const current = (await readJSONFile("current.json")) || {
			title: "Glance Display",
			imageId: "",
			timestamp: Date.now(),
			sleepDuration: 3600000000,
		};

		// Add caching headers to reduce requests from web UI
		res.set({
			'Cache-Control': 'public, max-age=5', // Cache for 5 seconds
			'ETag': `"${current.imageId}-${current.timestamp}"` // Cache based on imageId and timestamp
		});

		// Return full data including image for web UI
		console.log(`Serving full current data for web UI: imageId=${current.imageId}`);
		res.json(current);
	} catch (error) {
		console.error("Error getting current full:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// NEW: Serve raw binary image data for PSRAM streaming
app.get("/api/image.bin", async (req, res) => {
	try {
		const current = (await readJSONFile("current.json")) || {};
		
		if (!current || !current.image) {
			return res.status(404).send("No image available");
		}
		
		console.log("Serving raw binary image data for PSRAM streaming");
		
		// Convert base64 to binary buffer
		const binaryData = Buffer.from(current.image, 'base64');
		
		// Set headers for binary data
		res.set({
			'Content-Type': 'application/octet-stream',
			'Content-Length': binaryData.length,
			'Cache-Control': 'no-cache'
		});
		
		console.log(`Sending ${binaryData.length} bytes of raw image data`);
		addDeviceLog(`Device downloaded image data: ${(binaryData.length / 1024 / 1024).toFixed(2)}MB`);
		res.send(binaryData);
		
	} catch (error) {
		console.error("Error serving binary image:", error);
		res.status(500).send("Error serving binary image");
	}
});

// Update current image (for web interface or manual updates)
app.post("/api/current", async (req, res) => {
	try {
		const { title, image, sleepDuration, isText } = req.body;

		// Input validation - use settings default if not provided
		const settings = (await readJSONFile("settings.json")) || { defaultSleepDuration: 3600000000 };
		const sanitizedTitle = sanitizeInput(title);
		const sleepMs = parseInt(sleepDuration) || settings.defaultSleepDuration;

		if (image && !validateImageData(image)) {
			return res.status(400).json({ error: "Invalid image data" });
		}

		let imageData = "";

		if (image) {
			if (isText) {
				// Convert text to e-ink image
				const sanitizedText = sanitizeInput(image);
				const textImageBuffer = await imageProcessing.createTextImage(sanitizedText);
				imageData = textImageBuffer.toString("base64");
			} else if (image.startsWith("data:image/")) {
				// Handle base64 image upload from web interface
				const base64Data = image.split(",")[1];
				const imageBuffer = Buffer.from(base64Data, "base64");

				// Save temporary file
				const tempPath = path.join(UPLOAD_DIR, "temp-" + Date.now() + ".png");
				await ensureDir(UPLOAD_DIR);
				await fs.writeFile(tempPath, imageBuffer);

				// Convert to RGB format for ESP32 processing
				const rgbBuffer = await imageProcessing.convertImageToRGB(tempPath, 0, 1200, 1600);
				console.log(`RGB buffer size: ${rgbBuffer.length} bytes`);
				console.log(`RGB buffer type: ${typeof rgbBuffer}, is Buffer: ${Buffer.isBuffer(rgbBuffer)}`);
				imageData = rgbBuffer.toString("base64");
				console.log(`Base64 length: ${imageData.length}, first 50 chars: ${imageData.substring(0, 50)}`);

				// Clean up temp file
				await fs.unlink(tempPath);
			} else {
				// Assume it's already processed base64 data
				imageData = image;
			}
		}

		const current = {
			title: sanitizedTitle || "Glance Display",
			image: imageData,
			imageId: imageData ? uuidv4() : "",
			timestamp: Date.now(),
			sleepDuration: sleepMs,
		};

		await writeJSONFile("current.json", current);

		// Log the update
		console.log(`Image updated: ${sanitizedTitle} (${current.imageId})`);

		res.json({ success: true, current });
	} catch (error) {
		console.error("Error updating current:", error);
		res.status(500).json({ error: "Internal server error: " + error.message });
	}
});

// Art gallery preview endpoint - shows exact e-ink display output
app.post("/api/preview", upload.single("image"), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: "No file uploaded" });
		}

		console.log(`Generating art gallery preview for: ${req.file.originalname}`);

		// Get dithering options from request
		const ditherAlgorithm = req.body.ditherAlgorithm || 'floyd-steinberg';
		const enhanceContrast = req.body.enhanceContrast !== 'false';
		const sharpen = req.body.sharpen === 'true';

		// Process image exactly as it will be sent to ESP32
		const ditheredRgbBuffer = await imageProcessing.convertImageToRGB(req.file.path, 0, 1200, 1600, {
			ditherAlgorithm,
			enhanceContrast,
			sharpen
		});

		// Create preview PNG from the dithered RGB data (half size for web)
		const previewBuffer = await sharp(ditheredRgbBuffer, {
			raw: {
				width: 1200,
				height: 1600,
				channels: 3
			}
		})
		.resize(600, 800, { fit: "fill" })
		.png()
		.toBuffer();

		// Clean up uploaded file
		await fs.unlink(req.file.path);

		res.json({
			success: true,
			preview: `data:image/png;base64,${previewBuffer.toString("base64")}`,
			rgbSize: Math.round(ditheredRgbBuffer.length / 1024), // Size in KB
			originalName: req.file.originalname,
			processingInfo: {
				algorithm: ditherAlgorithm,
				enhanceContrast,
				sharpen,
				paletteColors: SPECTRA_6_PALETTE.length
			}
		});
	} catch (error) {
		console.error("Error generating art gallery preview:", error);
		if (req.file?.path) {
			try {
				await fs.unlink(req.file.path);
			} catch {}
		}
		res
			.status(500)
			.json({ error: "Error generating art preview: " + error.message });
	}
});

// Upload image to history (preview before applying)
// Fast upload - saves original only, dithering happens when user clicks "Apply"
app.post("/api/upload", upload.single("image"), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: "No file uploaded" });
		}

		console.log(`Uploading image for preview: ${req.file.originalname}`);

		const imageId = uuidv4();
		const timestamp = Date.now();

		// Create optimized original and thumbnail in parallel for faster uploads
		const [optimizedOriginalBuffer, thumbnailBuffer] = await Promise.all([
			// Optimized version for web display (max 800px wide, maintain aspect ratio)
			sharp(req.file.path)
				.rotate() // Auto-rotate based on EXIF
				.resize(800, null, {
					fit: "inside",
					withoutEnlargement: true
				})
				.jpeg({ quality: 85 })
				.toBuffer(),
			// Thumbnail for web preview (300x400)
			sharp(req.file.path)
				.rotate() // Auto-rotate based on EXIF
				.resize(300, 400, { fit: "inside" })
				.png()
				.toBuffer()
		]);

		// NOTE: Skip dithering here - it will happen when user clicks "Apply to Display"
		// This makes uploads much faster and allows user to adjust crop/zoom first

		// Encode as base64
		const originalImageBase64 = optimizedOriginalBuffer.toString("base64");
		const thumbnailBase64 = thumbnailBuffer.toString("base64");

		const title = `Uploaded: ${req.file.originalname}`;

		// Store in images archive for history (original only, dithered image created on apply)
		const imagesArchive = (await readJSONFile("images.json")) || {};
		imagesArchive[imageId] = {
			title: title,
			imageId: imageId,
			timestamp: timestamp,
			rotation: 0,
			originalImage: originalImageBase64, // Optimized version for preview
			originalImageMime: 'image/jpeg', // Optimized as JPEG
			thumbnail: thumbnailBase64,
			aiGenerated: false,
			uploadedFilename: req.file.originalname
			// Note: 'image' (processed RGB) will be generated when user applies with adjustments
		};
		await writeJSONFile("images.json", imagesArchive);

		// Add to history (metadata + thumbnail)
		const history = (await readJSONFile("history.json")) || [];
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
			await writeJSONFile("images.json", imagesArchive);
		}
		await writeJSONFile("history.json", history);

		// Clean up uploaded file
		await fs.unlink(req.file.path);

		console.log(`Image uploaded for preview: ${imageId}`);
		addDeviceLog(`New image uploaded for preview: "${req.file.originalname}"`);

		res.json({
			success: true,
			imageId: imageId,
			title: title,
			message: "Image uploaded. Adjust crop/zoom and click Apply to display."
		});
	} catch (error) {
		console.error("Error uploading image:", error);
		if (req.file?.path) {
			try {
				await fs.unlink(req.file.path);
			} catch {}
		}
		res.status(500).json({ error: "Error uploading image: " + error.message });
	}
});

// AI Image Generation endpoint
app.post("/api/generate-art", async (req, res) => {
	try {
		if (!openai) {
			return res.status(503).json({
				error: "AI generation not available. OPENAI_API_KEY not configured."
			});
		}

		const { prompt, rotation, sleepDuration, quality, style, imageStyle } = req.body;

		if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
			return res.status(400).json({ error: "Prompt is required" });
		}

		console.log(`Generating AI art with prompt: "${prompt}"`);

		// Input validation - use settings default if not provided
		const settings = (await readJSONFile("settings.json")) || { defaultSleepDuration: 3600000000 };
		const sleepMs = parseInt(sleepDuration) || settings.defaultSleepDuration;
		const rotationDegrees = parseInt(rotation) || 0;
		// gpt-image-1 quality: 'low', 'medium', 'high', 'auto'
		// Map old 'standard'/'hd' to new quality levels
		const imageQuality = quality === 'hd' ? 'high' : 'medium';
		const artStyle = style || 'balanced';

		// Enhanced prompt engineering for e-ink display optimization
		// DALL-E 3 tends to add margins/whitespace, so we need VERY explicit instructions
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

		// CRITICAL: Very explicit instructions to avoid DALL-E's known issue with portrait borders
		// DALL-E 3 1024x1792 (portrait) is the closest to our 3:4 display ratio
		// Known issue: DALL-E 3 portrait images often have colored borders/spaces
		// Solution: Extremely explicit prompts + auto-crop whitespace + use "cover" resize
		const enhancedPrompt = `${prompt}. ${styleGuidance}. COMPOSITION RULES: ${compositionRules} This artwork must fill a tall vertical portrait frame completely with NO empty borders, NO colored bars on top or bottom, NO whitespace margins. The subject extends naturally beyond all four edges of the frame like a full-bleed poster or magazine cover. Absolutely NO letterboxing or pillarboxing.`;

		console.log(`Enhanced prompt: ${enhancedPrompt}`);

		// Generate image with GPT-4o image generation (gpt-image-1)
		// This is OpenAI's most advanced image generator (replaced DALL-E 3 in March 2025)
		// Better at: text rendering, prompt following, diverse styles, world knowledge
		// Supported sizes: 1024x1024, 1024x1536 (portrait), 1536x1024 (landscape)
		// Using 1024x1536 (portrait, 2:3) - closest available to display's 3:4 ratio
		// Will be center-cropped from 2:3 to 3:4 (crops ~11% from left/right)
		// Note: gpt-image-1 only supports: model, prompt, n, size, quality
		// Does NOT support: style, response_format, background (use separate parameters for those)
		const response = await openai.images.generate({
			model: "gpt-image-1", // Latest GPT-4o image generation (March 2025+)
			prompt: enhancedPrompt,
			n: 1,
			size: "1024x1536", // Portrait format (2:3) - closest match to display's 3:4 ratio
			quality: imageQuality // 'low', 'medium', 'high', or 'auto'
		});

		// gpt-image-1 returns base64-encoded image data directly (not a URL like DALL-E 3)
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
		const tempFilePath = path.join(UPLOAD_DIR, `ai-gen-${Date.now()}.png`);
		await fs.writeFile(tempFilePath, imageBuffer);

		// Convert to RGB format for e-ink display (with rotation and auto-crop)
		const rgbBuffer = await imageProcessing.convertImageToRGB(tempFilePath, rotationDegrees, 1200, 1600, {
			autoCropWhitespace: true,  // Auto-crop whitespace margins from AI images
			enhanceContrast: true,     // Boost contrast for e-ink
			ditherAlgorithm: 'floyd-steinberg'
		});

		// Create optimized version for web display (max 800px wide, maintain aspect ratio)
		const optimizedOriginalBuffer = await sharp(imageBuffer)
			.resize(800, null, {
				fit: "inside",
				withoutEnlargement: true
			})
			.jpeg({ quality: 85 })
			.toBuffer();

		// Create thumbnail for web preview (300x400)
		const thumbnailBuffer = await sharp(imageBuffer)
			.resize(300, 400, { fit: "inside" })
			.png()
			.toBuffer();

		const originalImageBase64 = optimizedOriginalBuffer.toString("base64");
		const thumbnailBase64 = thumbnailBuffer.toString("base64");

		const imageId = uuidv4();
		const current = {
			title: `AI Generated: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`,
			image: rgbBuffer.toString("base64"),
			originalImage: originalImageBase64,
			originalImageMime: "image/jpeg", // Optimized as JPEG
			imageId: imageId,
			timestamp: Date.now(),
			sleepDuration: sleepMs,
			rotation: rotationDegrees,
			aiGenerated: true,
			originalPrompt: prompt,
			artStyle: artStyle,
			quality: imageQuality
		};

		await writeJSONFile("current.json", current);

		// Store metadata in images archive (not full RGB data to prevent JSON size issues)
		const imagesArchive = (await readJSONFile("images.json")) || {};
		imagesArchive[imageId] = {
			title: current.title,
			imageId: imageId,
			timestamp: current.timestamp,
			sleepDuration: current.sleepDuration,
			rotation: current.rotation,
			originalImage: originalImageBase64, // Optimized version for preview
			originalImageMime: "image/jpeg", // Optimized as JPEG
			thumbnail: thumbnailBase64,
			aiGenerated: true,
			originalPrompt: prompt,
			artStyle: artStyle,
			quality: imageQuality
			// Note: We don't store the large 'image' (processed RGB) field
		};
		await writeJSONFile("images.json", imagesArchive);

		// Add to history (only metadata + thumbnail)
		const history = (await readJSONFile("history.json")) || [];
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
			// Clean up old images from archive
			for (const item of removedItems) {
				delete imagesArchive[item.imageId];
			}
			await writeJSONFile("images.json", imagesArchive);
		}
		await writeJSONFile("history.json", history);

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
		console.error("Error generating AI art:", error);

		// Track failed OpenAI API call
		statistics.trackOpenAICall('gpt-image-1', 0, 0, false, {
			endpoint: 'images.generate',
			error: error.message
		});

		res.status(500).json({
			error: "Error generating AI art: " + error.message
		});
	}
});

// Lucky prompt helper - expands simple cues into a detailed art prompt
app.post("/api/lucky-prompt", async (req, res) => {
	const body = req.body || {};
	const currentPrompt = sanitizeInput(body.currentPrompt || "");
	const idea = sanitizeInput(body.idea || "");
	const mood = sanitizeInput(body.mood || "");
	const theme = sanitizeInput(body.theme || "");
	const vibe = sanitizeInput(body.vibe || "");

	const cueParts = [
		idea && `Concept: ${idea}`,
		theme && `Theme: ${theme}`,
		mood && `Mood: ${mood}`,
		vibe && `Vibe: ${vibe}`
	].filter(Boolean);

	if (!openai) {
		return res.status(503).json({
			error: "AI generation not available. OPENAI_API_KEY not configured."
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
			userContent = `Use the following loose guidance to create a vivid prompt:\n${cueParts.join(
				"\n"
			)}\n\nDeliver one complete prompt ready for image generation, highlighting full-bleed composition, dramatic lighting, and strong contrast suitable for a striking art poster.`;
		} else {
			// Generate from random theme
			temperature = 1.1;
			const inspirationSeed = getRandomLuckyPrompt();
			userContent = `Surprise me with a fresh, inspiring idea for a portrait-oriented AI artwork with bold visual impact. Lean into ${inspirationSeed}. Make sure the prompt enforces full-bleed composition, edge-to-edge detail, and dramatic contrast.`;
		}

		const response = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			max_tokens: 220,
			temperature,
			messages: [
				{
					role: "system",
					content:
						"You are curating prompts for an AI art gallery. Generate prompts that create museum-quality, gallery-worthy artwork with strong visual impact. Focus on bold compositions, rich textures, dramatic contrast, and full-bleed designs that command attention. Think poster art, fine art prints, and striking visuals. Respond with a single vivid prompt under 80 words."
				},
				{
					role: "user",
					content: userContent
				}
			]
		});

		const candidate =
			response?.choices?.[0]?.message?.content?.trim();

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
			console.warn("OpenAI returned no content for lucky prompt");
			return res.status(502).json({
				error: "AI did not return a prompt. Please try again."
			});
		}

		const generatedPrompt = candidate.replace(/^"+|"+$/g, "");

		// Build response with context
		const responseData = {
			prompt: generatedPrompt,
			source: "openai"
		};

		if (currentPrompt) {
			responseData.enhanced = true;
			responseData.original = currentPrompt;
		} else if (cueParts.length > 0) {
			responseData.inspiration = cueParts;
		}

		res.json(responseData);
	} catch (error) {
		console.error("Error generating lucky prompt with OpenAI:", error);

		// Track failed OpenAI API call
		statistics.trackOpenAICall('gpt-4o-mini', 0, 0, false, {
			endpoint: 'chat.completions',
			error: error.message
		});

		res.status(502).json({
			error: "Unable to generate prompt right now. Please try again shortly."
		});
	}
});

// File upload endpoint
app.post(
	"/api/upload",
	// uploadLimiter, // Rate limiting disabled for development
	upload.single("image"),
	async (req, res) => {
		try {
			if (!req.file) {
				return res.status(400).json({ error: "No file uploaded" });
			}

			const { title, sleepDuration, rotation } = req.body;

			// Input validation - use settings default if not provided
			const settings = (await readJSONFile("settings.json")) || { defaultSleepDuration: 3600000000 };
			const sanitizedTitle = sanitizeInput(title);
			const sleepMs = parseInt(sleepDuration) || settings.defaultSleepDuration;
			const rotationDegrees = parseInt(rotation) || 0;

			// Read original uploaded file for thumbnail
			const originalImageBuffer = await fs.readFile(req.file.path);
			const originalImageBase64 = originalImageBuffer.toString("base64");
			const mimeType = req.file.mimetype || "image/jpeg";

			// Convert uploaded image to RGB format for e-ink display (with rotation)
			const rgbBuffer = await imageProcessing.convertImageToRGB(req.file.path, rotationDegrees, 1200, 1600);
			console.log(`RGB buffer size: ${rgbBuffer.length} bytes`);
			console.log(`RGB buffer type: ${typeof rgbBuffer}, is Buffer: ${Buffer.isBuffer(rgbBuffer)}`);

			const imageData = rgbBuffer.toString("base64");
			console.log(`Base64 length: ${imageData.length}, first 50 chars: ${imageData.substring(0, 50)}`);
			console.log(`Expected base64 size: ${Math.ceil(rgbBuffer.length * 4/3)} bytes`);

			const imageId = uuidv4();
			const current = {
				title: sanitizedTitle || `Uploaded: ${req.file.originalname}`,
				image: imageData,
				originalImage: originalImageBase64,
				originalImageMime: mimeType,
				imageId: imageId,
				timestamp: Date.now(),
				sleepDuration: sleepMs,
				rotation: rotationDegrees,
				aiGenerated: false,
				uploadedFilename: req.file.originalname
			};

			await writeJSONFile("current.json", current);

			// Store full image in images archive for history access
			const imagesArchive = (await readJSONFile("images.json")) || {};
			imagesArchive[imageId] = current;
			await writeJSONFile("images.json", imagesArchive);

			// Add to history (only metadata + thumbnail)
			const history = (await readJSONFile("history.json")) || [];
			history.unshift({
				imageId: imageId,
				title: current.title,
				thumbnail: originalImageBase64,
				timestamp: current.timestamp,
				aiGenerated: false,
				uploadedFilename: req.file.originalname,
				rotation: rotationDegrees
			});
			// Keep only last 50 images in history
			if (history.length > 50) {
				const removedItems = history.splice(50);
				// Clean up old images from archive
				for (const item of removedItems) {
					delete imagesArchive[item.imageId];
				}
				await writeJSONFile("images.json", imagesArchive);
			}
			await writeJSONFile("history.json", history);

			// Clean up uploaded file
			await fs.unlink(req.file.path);

			console.log(`File uploaded and processed: ${req.file.originalname}`);

			res.json({ success: true, current });
		} catch (error) {
			console.error("Error processing upload:", error);
			console.error("Error stack:", error.stack);
			
			// Clean up uploaded file on error
			if (req.file?.path) {
				try {
					await fs.unlink(req.file.path);
				} catch (cleanupError) {
					console.error("Error cleaning up file:", cleanupError);
				}
			}
			
			res
				.status(500)
				.json({ error: "Error processing upload: " + error.message });
		}
	}
);

// Device status reporting (replaces GitHub Actions)
app.post("/api/device-status", async (req, res) => {
	try {
		const { deviceId, status } = req.body;

		if (!validateDeviceId(deviceId) || !status || typeof status !== "object") {
			return res
				.status(400)
				.json({ error: "Valid deviceId and status object required" });
		}

		// Check if device used fallback (couldn't reach dev server)
		if (status.usedFallback === true) {
			const settings = (await readJSONFile("settings.json")) || {};
			if (settings.devMode) {
				console.log(`[Dev Mode] Device ${deviceId} couldn't reach dev server ${settings.devServerHost}, auto-disabling dev mode`);
				addDeviceLog(`⚠️  Dev server ${settings.devServerHost} unreachable, disabled dev mode`);

				settings.devMode = false;
				await writeJSONFile("settings.json", settings);
			}
		}

		// Load existing devices
		const devices = (await readJSONFile("devices.json")) || {};
		const previousDevice = devices[deviceId] || {};

		// Calculate battery percentage from voltage first (needed for charging detection)
		const batteryVoltage = parseFloat(status.batteryVoltage) || 0;

		// Detect charging: either explicit flag OR voltage rising significantly
		let isCharging = status.isCharging === true;
		const previousVoltage = previousDevice.batteryVoltage || 0;
		const voltageDelta = batteryVoltage - previousVoltage;

		// If voltage increased by more than 0.05V, likely charging
		// (Normal discharge doesn't show voltage increases)
		if (!isCharging && previousVoltage > 0 && voltageDelta > 0.05) {
			isCharging = true;
			console.log(`[Battery] Charging detected via voltage rise: ${previousVoltage}V → ${batteryVoltage}V (+${voltageDelta.toFixed(2)}V)`);
		}

		let lastChargeTimestamp = previousDevice.lastChargeTimestamp || null;

		// Update lastChargeTimestamp if currently charging and wasn't charging before
		if (isCharging && !previousDevice.isCharging) {
			lastChargeTimestamp = Date.now();
			console.log(`[Battery] Device ${deviceId} started charging`);
			addDeviceLog(`🔋 Device ${deviceId} started charging`);
		}

		// Track battery history (keep last 100 readings)
		// Include whether this was a display update for energy modeling
		const batteryHistory = previousDevice.batteryHistory || [];
		const isDisplayUpdate = status.status === 'display_updating' || status.status === 'display_complete';

		if (batteryVoltage > 0) {
			batteryHistory.push({
				timestamp: Date.now(),
				voltage: batteryVoltage,
				isCharging: isCharging,
				isDisplayUpdate: isDisplayUpdate
			});
			// Keep only last 100 readings
			if (batteryHistory.length > 100) {
				batteryHistory.shift();
			}
		}

		// Track signal strength history (keep last 100 readings)
		const signalHistory = previousDevice.signalHistory || [];
		const signalStrength = parseInt(status.signalStrength) || 0;

		if (signalStrength !== 0) {
			signalHistory.push({
				timestamp: Date.now(),
				rssi: signalStrength
			});
			if (signalHistory.length > 100) {
				signalHistory.shift();
			}
		}

		// Track usage statistics for battery estimation
		const usageStats = previousDevice.usageStats || {
			totalWakes: 0,
			totalDisplayUpdates: 0,
			totalVoltageDrop: 0,
			lastFullCharge: null,
			wakesThisCycle: 0,
			displayUpdatesThisCycle: 0,
			voltageAtFullCharge: null
		};

		// If we just started charging, save the cycle stats
		if (isCharging && !previousDevice.isCharging) {
			usageStats.lastFullCharge = Date.now();
			usageStats.voltageAtFullCharge = batteryVoltage;
			usageStats.wakesThisCycle = 0;
			usageStats.displayUpdatesThisCycle = 0;
		}

		// Count this wake (only when not charging)
		if (!isCharging && previousVoltage > 0) {
			usageStats.totalWakes++;
			usageStats.wakesThisCycle++;
			if (isDisplayUpdate) {
				usageStats.totalDisplayUpdates++;
				usageStats.displayUpdatesThisCycle++;
			}
			// Track voltage drop from last reading
			if (voltageDelta < 0) {
				usageStats.totalVoltageDrop += Math.abs(voltageDelta);
			}
		}

		// Calculate battery percentage from voltage (LiPo discharge curve)
		let batteryPercent = parseInt(status.batteryPercent);

		// If ESP32 doesn't send percent, calculate it from voltage
		if (!batteryPercent && batteryVoltage > 0) {
			// LiPo voltage to percentage mapping (approximate)
			if (batteryVoltage >= 4.2) batteryPercent = 100;
			else if (batteryVoltage >= 4.0) batteryPercent = 80 + ((batteryVoltage - 4.0) / 0.2) * 20;
			else if (batteryVoltage >= 3.7) batteryPercent = 50 + ((batteryVoltage - 3.7) / 0.3) * 30;
			else if (batteryVoltage >= 3.5) batteryPercent = 30 + ((batteryVoltage - 3.5) / 0.2) * 20;
			else if (batteryVoltage >= 3.3) batteryPercent = 10 + ((batteryVoltage - 3.3) / 0.2) * 20;
			else if (batteryVoltage >= 3.0) batteryPercent = ((batteryVoltage - 3.0) / 0.3) * 10;
			else batteryPercent = 0;
			batteryPercent = Math.round(batteryPercent);
		}

		// Update device status with sanitized data
		devices[deviceId] = {
			batteryVoltage: batteryVoltage,
			batteryPercent: batteryPercent || 0,
			isCharging: isCharging,
			lastChargeTimestamp: lastChargeTimestamp,
			batteryHistory: batteryHistory,
			usageStats: usageStats,
			signalStrength: signalStrength,
			signalHistory: signalHistory,
			freeHeap: parseInt(status.freeHeap) || 0,
			bootCount: parseInt(status.bootCount) || 0,
			status: sanitizeInput(status.status) || "unknown",
			lastSeen: Date.now(),
			deviceId: sanitizeInput(deviceId),
		};

		await writeJSONFile("devices.json", devices);

		// Low battery alerts (only if not charging)
		const previousPercent = previousDevice.batteryPercent || 100;
		if (!isCharging && batteryPercent > 0) {
			// Critical battery alert (<15%)
			if (batteryPercent < 15 && previousPercent >= 15) {
				console.log(`[Battery] CRITICAL: Device ${deviceId} at ${batteryPercent}%`);
				addDeviceLog(`⚠️ CRITICAL: Battery at ${batteryPercent}% - device may shut down soon`);
				sendBatteryNotification(deviceId, batteryPercent, batteryVoltage, 'critical');
			}
			// Low battery alert (<30%)
			else if (batteryPercent < 30 && previousPercent >= 30) {
				console.log(`[Battery] LOW: Device ${deviceId} at ${batteryPercent}%`);
				addDeviceLog(`🔋 Low battery: ${batteryPercent}% - consider charging`);
				sendBatteryNotification(deviceId, batteryPercent, batteryVoltage, 'low');
			}
		}

		const batteryInfo = `${batteryVoltage}V (${batteryPercent}%)${isCharging ? ' [Charging]' : ''}`;
		const logMessage = `Device ${deviceId} reported: Battery ${batteryInfo}, Signal ${status.signalStrength}dBm, Status: ${status.status}`;
		console.log(logMessage);
		addDeviceLog(logMessage);

		res.json({ success: true });
	} catch (error) {
		console.error("Error updating device status:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get ESP32 device status for admin interface
app.get("/api/esp32-status", async (req, res) => {
	try {
		const devices = (await readJSONFile("devices.json")) || {};

		// Find most recently seen device (auto-detect active device)
		let deviceId = process.env.DEVICE_ID;
		let deviceStatus = deviceId ? devices[deviceId] : null;

		if (!deviceStatus) {
			// Find device with most recent lastSeen
			let latestSeen = 0;
			for (const [id, device] of Object.entries(devices)) {
				if (device.lastSeen && device.lastSeen > latestSeen) {
					latestSeen = device.lastSeen;
					deviceId = id;
					deviceStatus = device;
				}
			}
		}

		if (!deviceStatus) {
			return res.json({
				state: 'offline',
				batteryVoltage: null,
				batteryPercent: null,
				isCharging: false,
				lastChargeTimestamp: null,
				signalStrength: null,
				lastSeen: null,
				sleepDuration: null,
				deviceId: null
			});
		}

		// Consider device online if seen in last 5 minutes
		const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
		const isOnline = deviceStatus.lastSeen > fiveMinutesAgo;

		// Get current sleep duration from settings
		const current = (await readJSONFile("current.json")) || {};
		const settings = (await readJSONFile("settings.json")) || {};

		// Determine actual sleep duration (accounting for night sleep)
		let sleepDuration = current.sleepDuration || 3600000000;
		if (isInNightSleep(settings)) {
			sleepDuration = calculateNightSleepDuration(settings);
		}

		// Smart battery estimation using usage statistics
		let batteryEstimate = null;
		const stats = deviceStatus.usageStats;

		if (stats && stats.totalWakes >= 3 && !deviceStatus.isCharging) {
			// Calculate average voltage drop per wake
			const avgDropPerWake = stats.totalVoltageDrop / stats.totalWakes;

			// Calculate display update ratio (how often do we actually update?)
			const displayUpdateRatio = stats.totalDisplayUpdates / stats.totalWakes;

			// Voltage remaining until critical (3.3V)
			const voltageRemaining = deviceStatus.batteryVoltage - 3.3;

			if (avgDropPerWake > 0 && voltageRemaining > 0) {
				// Estimate remaining wake cycles
				const remainingCycles = Math.floor(voltageRemaining / avgDropPerWake);

				// Convert to hours using current sleep duration
				const sleepHours = sleepDuration / (1000000 * 60 * 60); // microseconds to hours
				const estimatedHours = Math.round(remainingCycles * sleepHours);

				// Confidence increases with more data
				const confidence = Math.min(100, Math.round((stats.totalWakes / 20) * 100));

				batteryEstimate = {
					hoursRemaining: estimatedHours,
					cyclesRemaining: remainingCycles,
					confidence: confidence,
					avgDropPerWake: Math.round(avgDropPerWake * 1000) / 1000, // mV precision
					displayUpdateRatio: Math.round(displayUpdateRatio * 100),
					dataPoints: stats.totalWakes
				};
			}
		}

		res.json({
			state: isOnline ? 'online' : 'offline',
			deviceId: deviceId,
			batteryVoltage: deviceStatus.batteryVoltage,
			batteryPercent: deviceStatus.batteryPercent,
			isCharging: deviceStatus.isCharging,
			lastChargeTimestamp: deviceStatus.lastChargeTimestamp,
			batteryHistory: deviceStatus.batteryHistory || [],
			batteryEstimate: batteryEstimate,
			usageStats: stats || null,
			signalStrength: deviceStatus.signalStrength,
			signalHistory: deviceStatus.signalHistory || [],
			lastSeen: deviceStatus.lastSeen,
			sleepDuration: sleepDuration, // in microseconds
			freeHeap: deviceStatus.freeHeap,
			status: deviceStatus.status,
			currentImage: current.title || null
		});
	} catch (error) {
		console.error("Error getting ESP32 status:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Send command to device (only works when device is awake and polling)
app.post("/api/device-command/:deviceId", async (req, res) => {
	try {
		const { deviceId } = req.params;
		const { command, duration } = req.body;

		if (!validateDeviceId(deviceId)) {
			return res.status(400).json({ error: "Valid deviceId required" });
		}

		const validCommands = ["stay_awake", "force_update", "update_now", "enable_streaming", "disable_streaming"];
		if (!validCommands.includes(command)) {
			return res
				.status(400)
				.json({
					error: "Invalid command. Valid commands: " + validCommands.join(", "),
				});
		}

		// Load existing devices to check if device exists
		const devices = (await readJSONFile("devices.json")) || {};

		if (!devices[deviceId]) {
			return res.status(404).json({ error: "Device not found" });
		}

		// Check if device was seen recently (within 5 minutes)
		const isRecentlyActive = Date.now() - devices[deviceId].lastSeen < 300000;

		// Create command
		const deviceCommand = {
			command,
			duration: parseInt(duration) || 300000, // Default 5 minutes
			timestamp: Date.now(),
			deviceId: sanitizeInput(deviceId),
		};

		// Store command for device to pick up
		let commands = (await readJSONFile("commands.json")) || {};
		if (!commands[deviceId]) {
			commands[deviceId] = [];
		}

		commands[deviceId].push(deviceCommand);

		// Keep only last 10 commands per device
		if (commands[deviceId].length > 10) {
			commands[deviceId] = commands[deviceId].slice(-10);
		}

		await writeJSONFile("commands.json", commands);

		console.log(`Command '${command}' sent to device: ${deviceId}`);

		const message = isRecentlyActive
			? `Command sent to ${deviceId}`
			: `Command queued for ${deviceId} (device currently asleep - will execute on next wake)`;

		res.json({
			success: true,
			message,
			isRecentlyActive,
			lastSeen: devices[deviceId].lastSeen,
		});
	} catch (error) {
		console.error("Error sending device command:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get commands for device (ESP32 polls this)
app.get("/api/commands/:deviceId", async (req, res) => {
	try {
		const { deviceId } = req.params;

		if (!validateDeviceId(deviceId)) {
			return res.status(400).json({ error: "Valid deviceId required" });
		}

		const commands = (await readJSONFile("commands.json")) || {};
		const deviceCommands = commands[deviceId] || [];

		// Clear commands after sending (one-time delivery)
		if (deviceCommands.length > 0) {
			commands[deviceId] = [];
			await writeJSONFile("commands.json", commands);
		}

		res.json({ commands: deviceCommands });
	} catch (error) {
		console.error("Error getting commands:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// ESP32 log reporting
app.post("/api/logs", async (req, res) => {
	try {
		const { deviceId, logs, logLevel } = req.body;

		if (!validateDeviceId(deviceId) || !logs) {
			return res
				.status(400)
				.json({ error: "Valid deviceId and logs required" });
		}

		// Load existing logs
		const allLogs = (await readJSONFile("logs.json")) || {};

		// Initialize device logs if not exists
		if (!allLogs[deviceId]) {
			allLogs[deviceId] = [];
		}

		// Add new log entry with sanitized data
		const logEntry = {
			timestamp: Date.now(),
			level: sanitizeInput(logLevel) || "INFO",
			message: sanitizeInput(logs),
			deviceTime: parseInt(req.body.deviceTime) || Date.now(),
		};

		allLogs[deviceId].push(logEntry);

		// Keep only last 1000 log entries per device
		if (allLogs[deviceId].length > 1000) {
			allLogs[deviceId] = allLogs[deviceId].slice(-1000);
		}

		await writeJSONFile("logs.json", allLogs);

		console.log(`Log received from ${deviceId}: ${logs}`);

		res.json({ success: true });
	} catch (error) {
		console.error("Error storing logs:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// ESP32 serial stream reporting for real-time monitoring
app.post("/api/serial-stream", async (req, res) => {
	try {
		const { deviceId, serialOutput, streamEvent, timestamp, bufferSize } = req.body;

		if (!validateDeviceId(deviceId)) {
			return res.status(400).json({ error: "Valid deviceId required" });
		}

		// Load existing streams
		const allStreams = (await readJSONFile("serial-streams.json")) || {};

		// Initialize device streams if not exists
		if (!allStreams[deviceId]) {
			allStreams[deviceId] = {
				isStreaming: false,
				lastActivity: Date.now(),
				chunks: []
			};
		}

		if (streamEvent) {
			// Handle stream control events
			if (streamEvent === "started") {
				allStreams[deviceId].isStreaming = true;
				allStreams[deviceId].lastActivity = Date.now();
				console.log(`Serial streaming started for device: ${deviceId}`);
			} else if (streamEvent === "stopped") {
				allStreams[deviceId].isStreaming = false;
				console.log(`Serial streaming stopped for device: ${deviceId}`);
			}
		} else if (serialOutput) {
			// Handle actual serial output data
			const streamChunk = {
				timestamp: Date.now(),
				deviceTime: parseInt(timestamp) || Date.now(),
				output: sanitizeInput(serialOutput),
				bufferSize: parseInt(bufferSize) || 0,
			};

			allStreams[deviceId].chunks.push(streamChunk);
			allStreams[deviceId].lastActivity = Date.now();

			// Keep only last 100 chunks per device to prevent excessive storage
			if (allStreams[deviceId].chunks.length > 100) {
				allStreams[deviceId].chunks = allStreams[deviceId].chunks.slice(-100);
			}

			console.log(`Serial stream chunk received from ${deviceId}: ${serialOutput.length} chars`);
		}

		await writeJSONFile("serial-streams.json", allStreams);

		res.json({ success: true });
	} catch (error) {
		console.error("Error storing serial stream:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get logs for a device
app.get("/api/logs/:deviceId", async (req, res) => {
	try {
		const { deviceId } = req.params;
		const { limit = 100 } = req.query;

		const allLogs = (await readJSONFile("logs.json")) || {};
		const deviceLogs = allLogs[deviceId] || [];

		// Return last N logs
		const logs = deviceLogs.slice(-parseInt(limit));

		res.json({ deviceId, logs });
	} catch (error) {
		console.error("Error getting logs:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get all device logs from logs.json (historical)
app.get("/api/device-logs-history", async (_req, res) => {
	try {
		const allLogs = (await readJSONFile("logs.json")) || {};
		res.json(allLogs);
	} catch (error) {
		console.error("Error getting all logs:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get serial streams for a device
app.get("/api/serial-stream/:deviceId", async (req, res) => {
	try {
		const { deviceId } = req.params;
		const { limit = 50 } = req.query;

		const allStreams = (await readJSONFile("serial-streams.json")) || {};
		const deviceStream = allStreams[deviceId] || { 
			isStreaming: false, 
			lastActivity: 0, 
			chunks: [] 
		};

		// Return last N chunks
		const chunks = deviceStream.chunks.slice(-parseInt(limit));

		res.json({ 
			deviceId, 
			isStreaming: deviceStream.isStreaming,
			lastActivity: deviceStream.lastActivity,
			chunks 
		});
	} catch (error) {
		console.error("Error getting serial streams:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get all serial streams
app.get("/api/serial-streams", async (_req, res) => {
	try {
		const allStreams = (await readJSONFile("serial-streams.json")) || {};
		res.json(allStreams);
	} catch (error) {
		console.error("Error getting all serial streams:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get all devices (for monitoring dashboard)
app.get("/api/devices", async (_req, res) => {
	try {
		const devices = (await readJSONFile("devices.json")) || {};
		res.json(devices);
	} catch (error) {
		console.error("Error getting devices:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get image history
app.get("/api/history", async (_req, res) => {
	try {
		const history = (await readJSONFile("history.json")) || [];
		res.json(history);
	} catch (error) {
		console.error("Error getting history:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get full image data by ID
app.get("/api/images/:imageId", async (req, res) => {
	try {
		const { imageId } = req.params;
		const imagesArchive = (await readJSONFile("images.json")) || {};

		if (!imagesArchive[imageId]) {
			return res.status(404).json({ error: "Image not found" });
		}

		res.json(imagesArchive[imageId]);
	} catch (error) {
		console.error("Error getting image:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Load image from history by ID
app.post("/api/history/:imageId/load", async (req, res) => {
	try {
		const { imageId } = req.params;
		const { rotation, cropX, cropY, zoomLevel } = req.body;

		// Get image data from images archive
		const imagesArchive = (await readJSONFile("images.json")) || {};
		let imageData = imagesArchive[imageId];

		if (!imageData) {
			return res.status(404).json({ error: "Image not found in archive" });
		}

		// Use provided rotation or fall back to stored rotation
		const rotationDegrees = rotation !== undefined ? parseInt(rotation) : (imageData.rotation || 0);
		const cropXVal = cropX !== undefined ? parseFloat(cropX) : 50;
		const cropYVal = cropY !== undefined ? parseFloat(cropY) : 50;
		const zoomVal = zoomLevel !== undefined ? parseFloat(zoomLevel) : 1.0;

		// Check if we need to regenerate (rotation, crop, or zoom changed, or no processed data)
		const needsRegenerate = !imageData.image ||
			rotationDegrees !== (imageData.rotation || 0) ||
			cropXVal !== 50 || cropYVal !== 50 || zoomVal !== 1.0;

		if (needsRegenerate) {
			if (!imageData.originalImage) {
				return res.status(400).json({ error: "Cannot reprocess image: original not available" });
			}

			console.log(`Regenerating processed image for ${imageId} with rotation ${rotationDegrees}°, crop (${cropXVal}%, ${cropYVal}%), zoom ${zoomVal}x...`);

			// Save original to temp file
			const originalBuffer = Buffer.from(imageData.originalImage, 'base64');
			const tempPath = path.join(UPLOAD_DIR, `reload-${Date.now()}.png`);
			await ensureDir(UPLOAD_DIR);
			await fs.writeFile(tempPath, originalBuffer);

			// Determine dimensions based on rotation
			const targetWidth = (rotationDegrees === 90 || rotationDegrees === 270) ? 1600 : 1200;
			const targetHeight = (rotationDegrees === 90 || rotationDegrees === 270) ? 1200 : 1600;

			// Regenerate RGB data with new rotation and crop/zoom
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
					zoomLevel: zoomVal
				}
			);

			// Update processed image data
			imageData = {
				...imageData,
				image: rgbBuffer.toString("base64"),
				rotation: rotationDegrees
			};

			// Clean up temp file
			await fs.unlink(tempPath);
		}

		// Get default sleep duration from settings
		const settings = (await readJSONFile("settings.json")) || { defaultSleepDuration: 3600000000 };

		// Set this image as current with updated sleep duration from settings
		const currentData = {
			...imageData,
			sleepDuration: settings.defaultSleepDuration,
			timestamp: Date.now()
		};

		await writeJSONFile("current.json", currentData);
		console.log(`Loaded image ${imageId} from history: ${imageData.title} (rotation: ${rotationDegrees}°)`);
		addDeviceLog(`Applied image from history: "${imageData.title || imageId}" (rotation: ${rotationDegrees}°)`);

		res.json({ success: true, current: currentData });
	} catch (error) {
		console.error("Error loading from history:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Delete image from history
app.delete("/api/history/:imageId", async (req, res) => {
	try {
		const { imageId } = req.params;
		let history = (await readJSONFile("history.json")) || [];

		const originalLength = history.length;
		history = history.filter(item => item.imageId !== imageId);

		if (history.length === originalLength) {
			return res.status(404).json({ error: "Image not found in history" });
		}

		await writeJSONFile("history.json", history);

		// Also delete from images archive
		const imagesArchive = (await readJSONFile("images.json")) || {};
		delete imagesArchive[imageId];
		await writeJSONFile("images.json", imagesArchive);

		console.log(`Deleted image ${imageId} from history and archive`);

		res.json({ success: true, message: "Image deleted from history" });
	} catch (error) {
		console.error("Error deleting from history:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// My Collection - unified view of user's art
app.get("/api/my-collection", async (req, res) => {
	try {
		// Get user's generated/uploaded images
		const history = (await readJSONFile("history.json")) || [];

		// Get artworks added to collection
		const collection = (await readJSONFile("my-collection.json")) || [];

		// Combine all items with type indicator
		const myCollection = [
			...history.map(item => ({
				...item,
				collectionType: item.source || 'generated',
				addedToCollection: Date.now() // Use timestamp for sorting
			})),
			...collection.map(item => ({
				...item,
				collectionType: 'added'
			}))
		];

		// Sort by most recently added
		myCollection.sort((a, b) => (b.addedToCollection || 0) - (a.addedToCollection || 0));

		res.json(myCollection);
	} catch (error) {
		console.error("Error getting my collection:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Add artwork to my collection
app.post("/api/my-collection", async (req, res) => {
	try {
		const { imageUrl, title, artist, year, thumbnail, collectionId, wikimedia } = req.body;

		if (!imageUrl || !title) {
			return res.status(400).json({ error: "imageUrl and title are required" });
		}

		const collection = (await readJSONFile("my-collection.json")) || [];

		// Check if already in collection
		const exists = collection.some(item => item.imageUrl === imageUrl);
		if (exists) {
			return res.status(400).json({ error: "Artwork already in collection" });
		}

		// Add to collection
		const collectionItem = {
			id: uuidv4(),
			imageUrl,
			title,
			artist: artist || 'Unknown',
			year,
			thumbnail: thumbnail || imageUrl,
			collectionId,
			wikimedia,
			addedToCollection: Date.now()
		};

		collection.unshift(collectionItem); // Add to beginning
		await writeJSONFile("my-collection.json", collection);

		console.log(`Added "${title}" by ${artist} to collection`);

		res.json({
			success: true,
			message: "Added to collection",
			item: collectionItem
		});
	} catch (error) {
		console.error("Error adding to collection:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Remove artwork from my collection
app.delete("/api/my-collection/:id", async (req, res) => {
	try {
		const { id } = req.params;
		let collection = (await readJSONFile("my-collection.json")) || [];

		const originalLength = collection.length;
		collection = collection.filter(item => item.id !== id);

		if (collection.length === originalLength) {
			return res.status(404).json({ error: "Item not found in collection" });
		}

		await writeJSONFile("my-collection.json", collection);
		console.log(`Removed item ${id} from collection`);

		res.json({ success: true, message: "Removed from collection" });
	} catch (error) {
		console.error("Error removing from collection:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Playlist management
app.post("/api/playlist", async (req, res) => {
	try {
		const { images, mode, interval } = req.body;

		if (!images || !Array.isArray(images) || images.length === 0) {
			return res.status(400).json({ error: "Please provide an array of image IDs" });
		}

		if (!mode || !["sequential", "random"].includes(mode)) {
			return res.status(400).json({ error: "Mode must be 'sequential' or 'random'" });
		}

		if (!interval || interval < 300000000) { // Minimum 5 minutes
			return res.status(400).json({ error: "Interval must be at least 5 minutes (300000000 microseconds)" });
		}

		// Verify all images exist in history
		const history = (await readJSONFile("history.json")) || [];
		const validImages = images.filter(imageId =>
			history.some(item => item.imageId === imageId)
		);

		if (validImages.length === 0) {
			return res.status(400).json({ error: "No valid images found in history" });
		}

		// Save playlist configuration
		const playlistConfig = {
			images: validImages,
			mode,
			interval,
			currentIndex: 0,
			active: true,
			createdAt: Date.now(),
			lastUpdate: Date.now()
		};

		await writeJSONFile("playlist.json", playlistConfig);

		// Load the first image immediately
		const firstImageId = mode === "random"
			? validImages[Math.floor(Math.random() * validImages.length)]
			: validImages[0];

		const imagesArchive = (await readJSONFile("images.json")) || {};
		const imageData = imagesArchive[firstImageId];

		if (imageData) {
			// Create current.json with the first playlist image
			const currentData = {
				...imageData,
				sleepDuration: interval,
				timestamp: Date.now()
			};

			await writeJSONFile("current.json", currentData);
			console.log(`Started playlist with ${validImages.length} images, first image: ${firstImageId}`);
		}

		res.json({
			success: true,
			message: `Playlist started with ${validImages.length} images`,
			config: playlistConfig
		});
	} catch (error) {
		console.error("Error creating playlist:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Playlist endpoints - REMOVED in simplified UI
// app.get("/api/playlist", async (_req, res) => {
// 	try {
// 		const playlist = await readJSONFile("playlist.json");
// 		if (!playlist) {
// 			return res.json({ active: false });
// 		}
// 		res.json(playlist);
// 	} catch (error) {
// 		console.error("Error getting playlist:", error);
// 		res.status(500).json({ error: "Internal server error" });
// 	}
// });

// app.delete("/api/playlist", async (_req, res) => {
// 	try {
// 		// Just mark as inactive rather than deleting
// 		const playlist = await readJSONFile("playlist.json");
// 		if (playlist) {
// 			playlist.active = false;
// 			await writeJSONFile("playlist.json", playlist);
// 		}

// 		res.json({ success: true, message: "Playlist stopped" });
// 	} catch (error) {
// 		console.error("Error stopping playlist:", error);
// 		res.status(500).json({ error: "Internal server error" });
// 	}
// });

// Get curated collections list
app.get("/api/collections", (req, res) => {
	try {
		const collections = Object.entries(CURATED_COLLECTIONS).map(([id, collection]) => ({
			id,
			name: collection.name,
			description: collection.description,
			count: collection.artworks.length
		}));

		res.json({ collections });
	} catch (error) {
		console.error("Error getting collections:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get artworks from a specific collection
app.get("/api/collections/:collectionId", (req, res) => {
	try {
		const { collectionId } = req.params;
		const collection = CURATED_COLLECTIONS[collectionId];

		if (!collection) {
			return res.status(404).json({ error: "Collection not found" });
		}

		// Convert artworks to response format
		const artworks = collection.artworks.map(artwork => {
			const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${artwork.wikimedia}?width=1200`;
			return {
				title: `${artwork.title} (${artwork.year})`,
				artist: artwork.artist,
				imageUrl: imageUrl,
				thumbnail: imageUrl,
				source: "curated",
				year: artwork.year,
				popularity: artwork.popularity
			};
		});

		res.json({
			id: collectionId,
			name: collection.name,
			description: collection.description,
			artworks: artworks
		});
	} catch (error) {
		console.error("Error getting collection:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});


// Art search API endpoint (wrapper for performArtSearch)
app.get("/api/art/search", async (req, res) => {
	try {
		const { q: query, limit = 20, offset = 0 } = req.query;
		const result = await performArtSearch(query, parseInt(limit), parseInt(offset));
		res.json(result);
	} catch (error) {
		console.error("Error searching art:", error);
		res.status(500).json({ error: "Internal server error: " + error.message });
	}
});

// Exhibitions endpoints - REMOVED in simplified UI
// // Get curated museum exhibitions/collections
// app.get("/api/exhibitions", async (_req, res) => {
// 	try {
// 		console.log("Fetching curated museum exhibitions");

// 		// Hardcoded featured exhibitions from ARTIC that work well for e-ink
// 		const featuredExhibitions = [
// 			{ id: 998, source: "artic", title: "Japanese Monochromatic Prints", description: "Ink on Paper collection" },
// 			{ id: 3251, source: "artic", title: "Four Followers of Caravaggio", description: "Early 17th-century Roman painting" },
// 			{ id: 1280, source: "artic", title: "Martin Puryear: Multiple Dimensions", description: "Drawings, prints and sculptures" }
// 		];

// 		// Fetch exhibition details including artwork IDs
// 		const exhibitionPromises = featuredExhibitions.map(async (exhibition) => {
// 			try {
// 				const response = await fetch(`https://api.artic.edu/api/v1/exhibitions/${exhibition.id}?fields=id,title,description,artwork_ids`);
// 				const data = await response.json();

// 				if (data.data && data.data.artwork_ids && data.data.artwork_ids.length > 0) {
// 					return {
// 						id: exhibition.id,
// 						title: data.data.title || exhibition.title,
// 						description: exhibition.description,
// 						source: exhibition.source,
// 						artworkCount: data.data.artwork_ids.length,
// 						artworkIds: data.data.artwork_ids.slice(0, 20) // Limit to first 20 artworks
// 					};
// 				}
// 				return null;
// 			} catch (error) {
// 				console.error(`Error fetching exhibition ${exhibition.id}:`, error.message);
// 				return null;
// 			}
// 		});

// 		const exhibitions = (await Promise.all(exhibitionPromises)).filter(ex => ex !== null);

// 		console.log(`Returning ${exhibitions.length} curated exhibitions`);
// 		res.json({ exhibitions });
// 	} catch (error) {
// 		console.error("Error fetching exhibitions:", error);
// 		res.status(500).json({ error: "Internal server error: " + error.message });
// 	}
// });

// // Get artworks from a specific exhibition
// app.get("/api/exhibitions/:id/artworks", async (req, res) => {
// 	try {
// 		const exhibitionId = req.params.id;
// 		console.log(`Fetching artworks for exhibition ${exhibitionId}`);

// 		// Fetch exhibition to get artwork IDs
// 		const exhibitionResponse = await fetch(`https://api.artic.edu/api/v1/exhibitions/${exhibitionId}?fields=id,title,artwork_ids`);
// 		const exhibitionData = await exhibitionResponse.json();

// 		if (!exhibitionData.data || !exhibitionData.data.artwork_ids || exhibitionData.data.artwork_ids.length === 0) {
// 			return res.json({ results: [] });
// 		}

// 		const artworkIds = exhibitionData.data.artwork_ids.slice(0, 20); // Limit to 20

// 		// Fetch artwork details for each ID
// 		const artworkPromises = artworkIds.map(async (artworkId) => {
// 			try {
// 				const response = await fetch(`https://api.artic.edu/api/v1/artworks/${artworkId}?fields=id,title,artist_display,date_display,image_id,department_title`);
// 				const data = await response.json();
// 				const artwork = data.data;

// 				if (artwork && artwork.image_id) {
// 					return {
// 						id: `artic-${artwork.id}`,
// 						title: artwork.title || "Untitled",
// 						artist: artwork.artist_display || "Unknown Artist",
// 						date: artwork.date_display || "",
// 						imageUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/1200,/0/default.jpg`,
// 						thumbnailUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/400,/0/default.jpg`,
// 						department: artwork.department_title || "",
// 						source: "Art Institute of Chicago"
// 					};
// 				}
// 				return null;
// 			} catch (error) {
// 				console.error(`Error fetching artwork ${artworkId}:`, error.message);
// 				return null;
// 			}
// 		});

// 		const artworks = (await Promise.all(artworkPromises)).filter(art => art !== null);

// 		console.log(`Returning ${artworks.length} artworks from exhibition ${exhibitionId}`);
// 		res.json({ results: artworks });
// 	} catch (error) {
// 		console.error("Error fetching exhibition artworks:", error);
// 		res.status(500).json({ error: "Internal server error: " + error.message });
// 	}
// });

// AI-powered smart search
app.post("/api/art/smart-search", async (req, res) => {
	try {
		const { query } = req.body;

		if (!query) {
			return res.status(400).json({ error: "Query is required" });
		}

		if (!openai) {
			// Fallback to simple search if OpenAI not configured
			console.log("OpenAI not configured, using simple search");
			return res.redirect(307, `/api/art/search?q=${encodeURIComponent(query)}`);
		}

		console.log(`Smart search query: "${query}"`);

		// Use OpenAI to extract search parameters from natural language
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

		// Track OpenAI API usage
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
			console.error("Failed to parse OpenAI response:", parseError);
			// Fallback to simple search
			return res.redirect(307, `/api/art/search?q=${encodeURIComponent(query)}`);
		}

		console.log("Extracted search parameters:", searchParams);

		// Build search query from extracted parameters
		const searchQuery = [
			...(searchParams.searchTerms || []),
			...(searchParams.styles || []),
			...(searchParams.subjects || [])
		].join(" ").trim() || query;

		// Use the search function directly (no HTTP round-trip)
		const searchResults = await performArtSearch(searchQuery, 20);

		// Return results with metadata about the search
		res.json({
			results: searchResults.results || [],
			metadata: {
				originalQuery: query,
				searchQuery: searchQuery,
				parameters: searchParams
			}
		});

	} catch (error) {
		console.error("Smart search error:", error);

		// Track failed OpenAI API call if OpenAI was available
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

// Find similar artworks using AI
app.post("/api/art/similar", async (req, res) => {
	try {
		const { title, artist, date, department, source } = req.body;

		if (!title && !artist) {
			return res.status(400).json({ error: "Title or artist is required" });
		}

		if (!openai) {
			// Fallback: simple search by artist or title keywords
			console.log("OpenAI not configured, using simple similarity search");
			const fallbackQuery = artist || title.split(' ').slice(0, 3).join(' ');
			return res.redirect(307, `/api/art/search?q=${encodeURIComponent(fallbackQuery)}`);
		}

		console.log(`Finding artworks similar to: "${title}" by ${artist}`);

		// Use OpenAI to analyze the artwork and generate search terms for similar pieces
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

		// Track OpenAI API usage
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
			console.error("Failed to parse OpenAI response:", parseError);
			// Fallback to artist search
			const fallbackQuery = artist || title.split(' ').slice(0, 3).join(' ');
			return res.redirect(307, `/api/art/search?q=${encodeURIComponent(fallbackQuery)}`);
		}

		console.log("Similarity search terms:", similarityParams.searchTerms);
		console.log("Reasoning:", similarityParams.reasoning);

		// Build search query from AI-generated terms
		const searchQuery = similarityParams.searchTerms.join(" ");

		// Use the search function directly (no HTTP round-trip)
		const searchResults = await performArtSearch(searchQuery, 30);

		// Filter out the original artwork if it appears in results
		const filteredResults = (searchResults.results || []).filter(artwork => {
			// Don't show exact same artwork
			if (artwork.title === title && artwork.artist === artist) {
				return false;
			}
			return true;
		});

		// Return results with metadata about the similarity search
		res.json({
			results: filteredResults.slice(0, 20),
			metadata: {
				originalArtwork: { title, artist, date, department },
				searchTerms: similarityParams.searchTerms,
				reasoning: similarityParams.reasoning
			}
		});

	} catch (error) {
		console.error("Similar artwork search error:", error);

		// Track failed OpenAI API call if OpenAI was available
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

app.get("/api/art/random", async (req, res) => {
	try {
		console.log(`Getting random artwork from multiple sources`);

		// Art departments to include (paintings, drawings, prints - not decorative objects)
		const artDepartments = [
			"European Paintings",
			"Modern and Contemporary Art",
			"Drawings and Prints",
			"Asian Art",
			"American Paintings and Sculpture",
			"The Robert Lehman Collection",
			"Photographs"
		];

		// Try Met Museum first
		const tryMet = async () => {
			try {
				const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=painting`;
				const searchResponse = await fetch(searchUrl);

				// Check for HTML error responses
				const contentType = searchResponse.headers.get("content-type");
				if (!contentType || !contentType.includes("application/json")) {
					return null;
				}

				const searchData = await searchResponse.json();

				if (!searchData.objectIDs || searchData.objectIDs.length === 0) {
					return null;
				}

				// Try up to 20 random objects until we find an artwork from art departments
				for (let attempt = 0; attempt < 20; attempt++) {
					const randomId = searchData.objectIDs[Math.floor(Math.random() * searchData.objectIDs.length)];
					const objectUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${randomId}`;

					try {
						const objectResponse = await fetch(objectUrl);

						// Check for HTML error responses
						const objectContentType = objectResponse.headers.get("content-type");
						if (!objectContentType || !objectContentType.includes("application/json")) {
							continue;
						}

						const objectData = await objectResponse.json();

						// Check if it's an artwork from art departments (not decorative objects)
						const isArtwork = objectData.primaryImage &&
						                  objectData.isPublicDomain &&
						                  artDepartments.includes(objectData.department);

						if (isArtwork) {
							console.log(`Found random Met artwork: ${objectData.title}`);
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
					} catch (error) {
						continue;
					}
				}

				return null;
			} catch (error) {
				console.error("Error getting random Met artwork:", error.message);
				return null;
			}
		};

		// Try Art Institute of Chicago as fallback
		const tryArtic = async () => {
			try {
				const articUrl = `https://api.artic.edu/api/v1/artworks/search?q=painting&limit=100&fields=id,title,artist_display,date_display,image_id,is_public_domain,department_title`;
				const articResponse = await fetch(articUrl);

				// Check for valid JSON response
				const contentType = articResponse.headers.get("content-type");
				if (!contentType || !contentType.includes("application/json")) {
					return null;
				}

				const articData = await articResponse.json();

				if (!articData.data || articData.data.length === 0) {
					return null;
				}

				// Filter for public domain artworks with images
				const validArtworks = articData.data.filter(artwork =>
					artwork.image_id &&
					artwork.is_public_domain &&
					artwork.department_title
				);

				if (validArtworks.length === 0) {
					return null;
				}

				// Pick random artwork
				const randomArtwork = validArtworks[Math.floor(Math.random() * validArtworks.length)];

				console.log(`Found random ARTIC artwork: ${randomArtwork.title}`);
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
				console.error("Error getting random ARTIC artwork:", error.message);
				return null;
			}
		};

		// Try Cleveland Museum
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

				// Filter for artworks with images
				const validArtworks = cmaData.data.filter(artwork =>
					artwork.images?.web?.url &&
					artwork.share_license_status === "cc0"
				);

				if (validArtworks.length === 0) {
					return null;
				}

				const randomArtwork = validArtworks[Math.floor(Math.random() * validArtworks.length)];

				console.log(`Found random CMA artwork: ${randomArtwork.title}`);
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
				console.error("Error getting random CMA artwork:", error.message);
				return null;
			}
		};

		// Try Rijksmuseum
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

				// Filter for downloadable artworks
				const validArtworks = rijksData.artObjects.filter(artwork =>
					artwork.webImage?.url &&
					artwork.permitDownload
				);

				if (validArtworks.length === 0) {
					return null;
				}

				const randomArtwork = validArtworks[Math.floor(Math.random() * validArtworks.length)];

				console.log(`Found random Rijksmuseum artwork: ${randomArtwork.title}`);
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
				console.error("Error getting random Rijksmuseum artwork:", error.message);
				return null;
			}
		};

		// Try all sources in random order for variety
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
		console.error("Error getting random art:", error);
		res.status(500).json({ error: "Internal server error: " + error.message });
	}
});

app.post("/api/art/import", async (req, res) => {
	try {
		const { imageUrl, title, artist, source, rotation, cropX, cropY, zoomLevel } = req.body;

		if (!imageUrl) {
			return res.status(400).json({ error: "Image URL required" });
		}

		const rotationDegrees = rotation || 0;
		const cropXVal = cropX !== undefined ? parseFloat(cropX) : 50;
		const cropYVal = cropY !== undefined ? parseFloat(cropY) : 50;
		const zoomVal = zoomLevel !== undefined ? parseFloat(zoomLevel) : 1.0;
		console.log(`Importing artwork: ${title} from ${imageUrl} (rotation: ${rotationDegrees}°, crop: ${cropXVal}%/${cropYVal}%, zoom: ${zoomVal}x)`);

		// Fetch the image
		let imageResponse;
		try {
			imageResponse = await fetch(imageUrl);
		} catch (fetchError) {
			console.error("Failed to fetch image from URL:", fetchError.message);
			return res.status(400).json({ error: `Failed to fetch image: ${fetchError.message}` });
		}

		if (!imageResponse.ok) {
			console.error(`Image fetch returned status: ${imageResponse.status}`);
			return res.status(400).json({ error: `Failed to fetch image: HTTP ${imageResponse.status}` });
		}

		const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
		console.log(`✓ Downloaded image: ${imageBuffer.length} bytes`);

		// Ensure upload directory exists
		await ensureDir(UPLOAD_DIR);

		// Save to temporary file
		const tempPath = path.join(UPLOAD_DIR, `temp-${Date.now()}.jpg`);
		await fs.writeFile(tempPath, imageBuffer);
		console.log(`✓ Saved to temp file: ${tempPath}`);

		// Determine dimensions based on rotation
		const targetWidth = (rotationDegrees === 90 || rotationDegrees === 270) ? 1600 : 1200;
		const targetHeight = (rotationDegrees === 90 || rotationDegrees === 270) ? 1200 : 1600;

		// Process image with Sharp (resize and dither for e-ink)
		// convertImageToRGB(imagePath, rotation, targetWidth, targetHeight, options)
		console.log(`Processing image for e-ink display...`);
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
		console.log(`✓ Image processed and dithered`);

		// Create thumbnail with correct dimensions
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

		// Clean up temp file
		await fs.unlink(tempPath);

		const imageId = uuidv4();

		// Get default sleep duration from settings
		const settings = (await readJSONFile("settings.json")) || { defaultSleepDuration: 3600000000 };

		// Create current.json with the artwork
		const currentData = {
			title: title || "Artwork",
			artist: artist || "Unknown",
			source: source || "external",
			imageId: imageId,
			image: ditheredRgbBuffer.toString("base64"),
			timestamp: Date.now(),
			sleepDuration: settings.defaultSleepDuration,
			rotation: rotationDegrees,
			// Store original image for web UI
			originalImage: imageBuffer.toString("base64"),
			originalImageMime: imageResponse.headers.get("content-type") || "image/jpeg"
		};

		await writeJSONFile("current.json", currentData);

		// Add to images archive
		const imagesArchive = (await readJSONFile("images.json")) || {};
		imagesArchive[imageId] = currentData;
		await writeJSONFile("images.json", imagesArchive);

		// Add to history (metadata + thumbnail)
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

		// Keep only last 100 items in history
		if (history.length > 100) {
			const removed = history.slice(100);
			for (const item of removed) {
				delete imagesArchive[item.imageId];
			}
			await writeJSONFile("images.json", imagesArchive);
		}
		await writeJSONFile("history.json", history);

		console.log(`Imported artwork: ${title} from ${source}`);
		addDeviceLog(`Applied artwork from browse: "${title}" by ${artist || 'Unknown'}`);

		res.json({ success: true, message: "Artwork imported successfully" });
	} catch (error) {
		console.error("Error importing art:", error);
		console.error("Stack trace:", error.stack);
		res.status(500).json({
			error: "Internal server error: " + error.message,
			details: error.stack
		});
	}
});

// Semantic search routes (SigLIP 2 embeddings)
const semanticSearchRoutes = require('./routes/semantic-search');
app.use('/api/semantic', semanticSearchRoutes);

// Health check
app.get("/health", (req, res) => {
	res.json({ status: "healthy", timestamp: Date.now() });
});

// Build info endpoint
app.get("/api/build-info", (_req, res) => {
	res.json({
		version: IMAGE_VERSION,
		buildDate: BUILD_DATE,
		buildDateHuman: BUILD_DATE_HUMAN,
		timestamp: Date.now()
	});
});

// Simple, focused web interface for single display management
app.get("/", async (_req, res) => {
	try {
		// Serve index.html from public directory
		let uiPath = path.join(__dirname, 'public', 'index.html');

		try {
			await fs.access(uiPath);
		} catch {
			// Fallback for Docker/different directory structure
			uiPath = path.join(__dirname, '..', 'public', 'index.html');
		}

		const indexContent = await fs.readFile(uiPath, 'utf8');

		// Add cache-busting headers to prevent browser caching issues
		res.set({
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Pragma': 'no-cache',
			'Expires': '0',
			'ETag': `"${Date.now()}"` // Simple ETag based on current time
		});

		res.send(indexContent);
	} catch (error) {
		console.error('Error serving UI file:', error);
		res.status(500).send(`
			<html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
				<h1>UI File Missing</h1>
				<p>The index.html file is not found in the public directory.</p>
				<p>Please check that the public directory is properly set up.</p>
				<hr>
				<small>Path attempted: ${path.join(__dirname, 'public', 'index.html')} and ${path.join(__dirname, '..', 'public', 'index.html')}</small>
			</body></html>
		`);
	}
});

// Admin page
app.get("/admin", async (_req, res) => {
	try {
		let adminPath = path.join(__dirname, 'admin.html');

		try {
			await fs.access(adminPath);
		} catch {
			// Fallback to parent directory (for local development)
			adminPath = path.join(__dirname, '..', 'admin.html');
		}

		const adminContent = await fs.readFile(adminPath, 'utf8');

		res.set({
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Pragma': 'no-cache',
			'Expires': '0',
			'ETag': `"${Date.now()}"`
		});

		res.send(adminContent);
	} catch (error) {
		console.error('Error serving admin file:', error);
		res.status(500).send('Admin page not found');
	}
});

// Enhanced UI preview (development)
app.get("/preview", async (_req, res) => {
	try {
		let previewPath = path.join(__dirname, 'simple-ui-enhanced.html');

		try {
			await fs.access(previewPath);
		} catch {
			// Fallback to parent directory (for local development)
			previewPath = path.join(__dirname, '..', 'simple-ui-enhanced.html');
		}

		const previewContent = await fs.readFile(previewPath, 'utf8');

		res.set({
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Pragma': 'no-cache',
			'Expires': '0',
			'ETag': `"${Date.now()}"`
		});

		res.send(previewContent);
	} catch (error) {
		console.error('Error serving preview file:', error);
		res.status(500).send('Preview page not found');
	}
});

// System information API
const serverLogs = [];
const deviceLogs = [];
const MAX_LOGS = 100;

// Helper to add device log
function addDeviceLog(message) {
	deviceLogs.push(`[${getOsloTimestamp()}] ${message}`);
	if (deviceLogs.length > MAX_LOGS) deviceLogs.shift();
}

// Send low battery notification via webhook
async function sendBatteryNotification(deviceId, batteryPercent, batteryVoltage, level) {
	try {
		const settings = (await readJSONFile("settings.json")) || {};
		const webhookUrl = settings.notificationWebhook;

		if (!webhookUrl) {
			return; // No webhook configured
		}

		const payload = {
			event: 'low_battery',
			level: level, // 'low' or 'critical'
			device: deviceId,
			battery: {
				percent: batteryPercent,
				voltage: batteryVoltage
			},
			message: level === 'critical'
				? `⚠️ CRITICAL: Battery at ${batteryPercent}% (${batteryVoltage}V) - device may shut down soon`
				: `🔋 Low battery: ${batteryPercent}% (${batteryVoltage}V) - consider charging`,
			timestamp: new Date().toISOString()
		};

		const response = await fetch(webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (response.ok) {
			console.log(`[Notification] Sent ${level} battery alert to webhook`);
		} else {
			console.error(`[Notification] Webhook failed: ${response.status}`);
		}
	} catch (error) {
		console.error(`[Notification] Failed to send webhook: ${error.message}`);
	}
}

// Capture console output
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
	const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
	serverLogs.push(`[${getOsloTimestamp()}] LOG: ${message}`);
	if (serverLogs.length > MAX_LOGS) serverLogs.shift();
	trackLog('INFO', message);
	originalLog.apply(console, args);
};

console.error = function(...args) {
	const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
	serverLogs.push(`[${getOsloTimestamp()}] ERROR: ${message}`);
	if (serverLogs.length > MAX_LOGS) serverLogs.shift();
	trackLog('ERROR', message);
	originalError.apply(console, args);
};

app.get("/api/system-info", (_req, res) => {
	res.json({
		version: process.env.DOCKER_IMAGE_VERSION || 'local',
		nodeVersion: process.version,
		platform: process.platform,
		uptime: process.uptime(),
		memoryUsage: process.memoryUsage(),
		cpuUsage: process.cpuUsage()
	});
});

// Statistics endpoint for admin dashboard
app.get("/api/stats", (req, res) => {
	try {
		const timeRange = req.query.range || 'all';
		const stats = statistics.getStats(timeRange);
		res.json(stats);
	} catch (error) {
		console.error("Error retrieving stats:", error);
		res.status(500).json({ error: "Failed to retrieve statistics" });
	}
});

// Reset statistics (admin only)
app.post("/api/stats/reset", async (req, res) => {
	try {
		statsCache = {
			openai: {
				calls: [],
				summary: {
					totalCalls: 0,
					totalTokens: 0,
					totalCost: 0,
					byModel: {}
				}
			},
			apiCalls: {
				calls: [],
				summary: {
					totalCalls: 0,
					bySource: {}
				}
			},
			logs: {
				summary: {
					totalLogs: 0,
					byLevel: { INFO: 0, ERROR: 0 },
					recentActivity: []
				}
			},
			startTime: Date.now()
		};
		await saveStats();
		res.json({ success: true, message: "Statistics reset successfully" });
	} catch (error) {
		console.error("Error resetting stats:", error);
		res.status(500).json({ error: "Failed to reset statistics" });
	}
});

app.get("/api/logs", (_req, res) => {
	res.json({ logs: serverLogs });
});

app.get("/api/device-logs", (_req, res) => {
	res.json({ logs: deviceLogs });
});

// Combined device logs (activity + detailed ESP32 logs)
app.get("/api/device-logs-combined", async (req, res) => {
	try {
		const { limit = 100, level } = req.query;
		const deviceId = process.env.DEVICE_ID || "esp32-001";

		// Get ESP32 detailed logs from logs.json
		const allLogs = (await readJSONFile("logs.json")) || {};
		const esp32Logs = allLogs[deviceId] || [];

		// Get high-level activity logs from memory
		const activityLogs = deviceLogs || [];

		// Combine and sort by timestamp
		const combined = [];

		// Add ESP32 logs with structured format
		esp32Logs.forEach(log => {
			combined.push({
				timestamp: log.timestamp,
				level: log.level || 'INFO',
				message: log.message,
				source: 'esp32',
				deviceTime: log.deviceTime
			});
		});

		// Add activity logs (parse timestamp from message)
		activityLogs.forEach(logStr => {
			// Parse: [2025-01-05 12:34:56] message
			const match = logStr.match(/\[([^\]]+)\] (.+)/);
			if (match) {
				const timeStr = match[1];
				const message = match[2];
				// Convert Oslo time to timestamp (approximate)
				const timestamp = new Date(timeStr).getTime() || Date.now();
				combined.push({
					timestamp,
					level: 'INFO',
					message,
					source: 'server'
				});
			}
		});

		// Sort by timestamp (newest first)
		combined.sort((a, b) => b.timestamp - a.timestamp);

		// Filter by level if specified
		let filtered = combined;
		if (level) {
			filtered = combined.filter(log => log.level === level.toUpperCase());
		}

		// Limit results
		const limited = filtered.slice(0, parseInt(limit));

		res.json({
			deviceId,
			logs: limited,
			total: filtered.length
		});
	} catch (error) {
		console.error("Error getting combined logs:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Wake cycle diagnostics
app.get("/api/wake-cycle-diagnostics", async (_req, res) => {
	try {
		const deviceId = process.env.DEVICE_ID || "esp32-001";
		const allLogs = (await readJSONFile("logs.json")) || {};
		const esp32Logs = allLogs[deviceId] || [];

		// Get last 50 logs to analyze latest wake cycle
		const recentLogs = esp32Logs.slice(-50);

		// Find wake cycle boundaries (look for boot/wake messages)
		const wakeCycles = [];
		let currentCycle = null;

		recentLogs.forEach(log => {
			const msg = log.message.toLowerCase();

			// Start of wake cycle
			if (msg.includes('awakened') || msg.includes('boot count')) {
				if (currentCycle) {
					wakeCycles.push(currentCycle);
				}
				currentCycle = {
					startTime: log.timestamp,
					events: [],
					errors: []
				};
			}

			if (currentCycle) {
				currentCycle.events.push({
					time: log.timestamp,
					message: log.message,
					level: log.level
				});

				if (log.level === 'ERROR' || msg.includes('error') || msg.includes('failed')) {
					currentCycle.errors.push(log.message);
				}

				// Mark end of cycle
				if (msg.includes('entering deep sleep') || msg.includes('sleeping')) {
					currentCycle.endTime = log.timestamp;
					currentCycle.duration = currentCycle.endTime - currentCycle.startTime;
					wakeCycles.push(currentCycle);
					currentCycle = null;
				}
			}
		});

		// Add incomplete current cycle if exists
		if (currentCycle) {
			currentCycle.endTime = Date.now();
			currentCycle.duration = currentCycle.endTime - currentCycle.startTime;
			currentCycle.incomplete = true;
			wakeCycles.push(currentCycle);
		}

		// Get latest cycle
		const latestCycle = wakeCycles.length > 0 ? wakeCycles[wakeCycles.length - 1] : null;

		res.json({
			deviceId,
			latestCycle,
			recentCycles: wakeCycles.slice(-5),
			totalCycles: wakeCycles.length
		});
	} catch (error) {
		console.error("Error getting wake cycle diagnostics:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Time endpoint for ESP32 clock alignment
app.get("/api/time", (_req, res) => {
	const now = new Date();
	res.json({
		epoch: now.getTime(), // Current time in milliseconds since Unix epoch
		iso: now.toISOString(), // UTC time
		oslo: getOsloTimestamp() // Oslo time for display
	});
});

// Client IP detection for admin panel
app.get("/api/client-ip", (req, res) => {
	// Try different methods to get real client IP (handles proxies/load balancers)
	const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
	                 req.headers['x-real-ip'] ||
	                 req.socket.remoteAddress ||
	                 req.ip;

	// Clean up IPv6 localhost and mapped IPv4
	let cleanIp = clientIp;
	if (cleanIp === '::1' || cleanIp === '::ffff:127.0.0.1') {
		cleanIp = '127.0.0.1';
	} else if (cleanIp?.startsWith('::ffff:')) {
		cleanIp = cleanIp.substring(7); // Remove IPv6-mapped IPv4 prefix
	}

	// If client is localhost, return the server's own LAN IP instead
	// This is useful when testing locally - you want your Mac's LAN IP, not 127.0.0.1
	if (cleanIp === '127.0.0.1' || cleanIp === '::1') {
		const os = require('os');
		const networkInterfaces = os.networkInterfaces();

		// Find the first non-internal IPv4 address (LAN IP)
		for (const interfaceName of Object.keys(networkInterfaces)) {
			const interfaces = networkInterfaces[interfaceName];
			for (const iface of interfaces) {
				// Skip internal (loopback) and non-IPv4 addresses
				if (iface.family === 'IPv4' && !iface.internal) {
					cleanIp = iface.address;
					break;
				}
			}
			if (cleanIp !== '127.0.0.1') break;
		}
	}

	res.json({ ip: cleanIp });
});

// Settings endpoints
app.get("/api/settings", async (_req, res) => {
	try {
		const settings = (await readJSONFile("settings.json")) || {
			defaultSleepDuration: 3600000000, // 1 hour in microseconds
			devMode: true, // Dev mode enabled by default
			devServerHost: "host.local:3000", // Placeholder, will be replaced by ESP32
			defaultOrientation: "portrait", // Default orientation: "portrait" or "landscape"
			nightSleepEnabled: false, // Night sleep mode disabled by default
			nightSleepStartHour: 23, // 11:00 PM
			nightSleepEndHour: 5 // 5:00 AM
		};
		res.json(settings);
	} catch (error) {
		console.error("Error reading settings:", error);
		res.status(500).json({ error: "Failed to read settings" });
	}
});

app.put("/api/settings", async (req, res) => {
	try {
		const { defaultSleepDuration, devMode, devServerHost, defaultOrientation, nightSleepEnabled, nightSleepStartHour, nightSleepEndHour } = req.body;

		// Read existing settings
		const existingSettings = (await readJSONFile("settings.json")) || {};

		// Validate and update sleep duration if provided
		if (defaultSleepDuration !== undefined) {
			const MIN_SLEEP = 5 * 60 * 1000000; // 5 minutes
			const MAX_SLEEP = 24 * 60 * 60 * 1000000; // 24 hours

			if (defaultSleepDuration < MIN_SLEEP || defaultSleepDuration > MAX_SLEEP) {
				return res.status(400).json({
					error: "Sleep duration must be between 5 minutes and 24 hours (in microseconds)"
				});
			}
			existingSettings.defaultSleepDuration = parseInt(defaultSleepDuration);
		}

		// Update dev mode if provided
		if (devMode !== undefined) {
			existingSettings.devMode = Boolean(devMode);
		}

		// Update dev server host if provided
		if (devServerHost !== undefined) {
			existingSettings.devServerHost = String(devServerHost);
		}

		// Update default orientation if provided
		if (defaultOrientation !== undefined) {
			if (defaultOrientation !== "portrait" && defaultOrientation !== "landscape") {
				return res.status(400).json({
					error: "Default orientation must be 'portrait' or 'landscape'"
				});
			}
			existingSettings.defaultOrientation = defaultOrientation;
		}

		// Update night sleep settings if provided
		if (nightSleepEnabled !== undefined) {
			existingSettings.nightSleepEnabled = Boolean(nightSleepEnabled);
		}

		if (nightSleepStartHour !== undefined) {
			const startHour = parseInt(nightSleepStartHour);
			if (startHour < 0 || startHour > 23) {
				return res.status(400).json({
					error: "Night sleep start hour must be between 0 and 23"
				});
			}
			existingSettings.nightSleepStartHour = startHour;
		}

		if (nightSleepEndHour !== undefined) {
			const endHour = parseInt(nightSleepEndHour);
			if (endHour < 0 || endHour > 23) {
				return res.status(400).json({
					error: "Night sleep end hour must be between 0 and 23"
				});
			}
			existingSettings.nightSleepEndHour = endHour;
		}

		await writeJSONFile("settings.json", existingSettings);

		// Update current.json to apply new sleep duration if it was changed
		if (defaultSleepDuration !== undefined) {
			const current = (await readJSONFile("current.json")) || {};
			current.sleepDuration = existingSettings.defaultSleepDuration;
			await writeJSONFile("current.json", current);
		}

		// Add dev mode flag to current.json
		if (devMode !== undefined) {
			const current = (await readJSONFile("current.json")) || {};
			current.devMode = existingSettings.devMode;
			current.devServerHost = existingSettings.devServerHost;
			await writeJSONFile("current.json", current);
		}

		const nightSleepLog = existingSettings.nightSleepEnabled ? `, nightSleep=${existingSettings.nightSleepStartHour}:00-${existingSettings.nightSleepEndHour}:00` : '';
		console.log(`Settings updated: sleep=${existingSettings.defaultSleepDuration}µs, devMode=${existingSettings.devMode}, orientation=${existingSettings.defaultOrientation}${nightSleepLog}`);
		res.json({ success: true, settings: existingSettings });
	} catch (error) {
		console.error("Error updating settings:", error);
		res.status(500).json({ error: "Failed to update settings" });
	}
});

// Bhutan flag endpoint for ESP32 fallback display
app.get("/api/bhutan.bin", async (req, res) => {
	try {
		const svgPath = path.join(__dirname, "bhutan.svg");
		
		// Check if bhutan.svg exists
		if (!await fs.access(svgPath).then(() => true).catch(() => false)) {
			return res.status(404).json({ error: "Bhutan SVG not found" });
		}
		
		// Read SVG file
		const svgBuffer = await fs.readFile(svgPath);
		
		// Convert SVG to PNG using sharp
		const pngBuffer = await sharp(svgBuffer)
			.resize(1200, 1600, { 
				fit: 'fill',
				background: { r: 255, g: 255, b: 255, alpha: 1 }
			})
			.png()
			.toBuffer();
		
// Convert PNG to RGB buffer (1200x1600x3 = 5,760,000 bytes)
const { data: rgbData, info } = await sharp(pngBuffer)
			.toColourspace('srgb')
			.raw()
			.toBuffer({ resolveWithObject: true });
		if (info.channels !== 3) {
			throw new Error(`Bhutan PNG conversion produced ${info.channels} channels, expected 3`);
		}
		
		res.set({
			'Content-Type': 'application/octet-stream',
			'Content-Length': rgbData.length,
			'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
		});
		
		res.send(rgbData);
		console.log(`📍 Served Bhutan flag RGB data: ${rgbData.length} bytes`);
		
	} catch (error) {
		console.error("Error serving Bhutan flag:", error);
		res.status(500).json({ error: "Failed to process Bhutan flag" });
	}
});

// Start server
async function startServer() {
	await ensureDataDir();
	await ensureDir(UPLOAD_DIR);

	app.listen(PORT, "0.0.0.0", () => {
		console.log(`Glance server running on port ${PORT}`);
		console.log(`Docker image version: ${IMAGE_VERSION} (built ${BUILD_DATE_HUMAN})`);
		console.log(`Access the web interface at http://localhost:${PORT}`);
		console.log(
			`API endpoint for ESP32: http://localhost:${PORT}/api/current.json`
		);
	});
}

startServer().catch(console.error);

// Export functions for testing
if (process.env.NODE_ENV === 'test') {
	module.exports = {
		convertImageToRGB,
		applyDithering,
		findClosestSpectraColor,
		app
	};
}
