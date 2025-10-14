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

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGE_VERSION = process.env.IMAGE_VERSION || "local";
const BUILD_DATE = process.env.BUILD_DATE || "unknown";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

// Initialize OpenAI client if API key is available
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function formatBuildDate(dateStr) {
    if (!dateStr || dateStr === "unknown") return dateStr;
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;

    let timeZone = "UTC";
    const offsetMatch = dateStr.match(/([+-])(\d{2}):(\d{2})$/);
    if (offsetMatch) {
        const sign = offsetMatch[1] === "+" ? "-" : "+";
        const hours = parseInt(offsetMatch[2], 10);
        // Only handle whole hour offsets (most common)
        if (offsetMatch[3] === "00") {
            timeZone = `Etc/GMT${sign}${hours}`;
        }
    }

    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
        timeZoneName: "short",
    });
}

const BUILD_DATE_HUMAN = formatBuildDate(BUILD_DATE);

// Simple in-memory cache for museum API responses
const artSearchCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedResult(key) {
	const cached = artSearchCache.get(key);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		console.log(`Cache hit: ${key}`);
		return cached.data;
	}
	return null;
}

function setCachedResult(key, data) {
	artSearchCache.set(key, {
		data,
		timestamp: Date.now()
	});
	// Limit cache size to 1000 entries
	if (artSearchCache.size > 1000) {
		const firstKey = artSearchCache.keys().next().value;
		artSearchCache.delete(firstKey);
	}
}
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");

// E-ink color palette for Waveshare 13.3" Spectra 6 (hardware colors - do not change RGB values)
const EINK_PALETTE = [
	{ rgb: [0, 0, 0], index: 0x0 }, // Black
	{ rgb: [255, 255, 255], index: 0x1 }, // White
	{ rgb: [255, 255, 0], index: 0x2 }, // Yellow
	{ rgb: [255, 0, 0], index: 0x3 }, // Red
	{ rgb: [0, 0, 255], index: 0x5 }, // Blue
	{ rgb: [0, 255, 0], index: 0x6 }, // Green
];

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
	limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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

// Ensure data directory exists
async function ensureDataDir() {
	try {
		await fs.access(DATA_DIR);
	} catch {
		await fs.mkdir(DATA_DIR, { recursive: true });
	}
}

// Ensure directory exists
async function ensureDir(dir) {
	try {
		await fs.access(dir);
	} catch {
		await fs.mkdir(dir, { recursive: true });
	}
}

// Adaptive color mapping that analyzes the image content
function createAdaptiveColorMapper(imageBuffer, width, height) {
	console.log("Analyzing image colors for adaptive mapping...");
	
	// Sample the image to understand its color distribution
	const colorStats = {
		brightness: { min: 255, max: 0, avg: 0 },
		saturation: { min: 255, max: 0, avg: 0 },
		dominantHues: { red: 0, green: 0, blue: 0, yellow: 0 }
	};
	
	let totalBrightness = 0;
	let totalSaturation = 0;
	let pixelCount = 0;
	
	// Sample every 10th pixel to get color statistics
	for (let i = 0; i < imageBuffer.length; i += 30) { // Every 10th pixel (3 channels)
		const r = imageBuffer[i];
		const g = imageBuffer[i + 1]; 
		const b = imageBuffer[i + 2];
		
		const brightness = (r + g + b) / 3;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const saturation = max === 0 ? 0 : (max - min) / max * 255;
		
		// Update statistics
		colorStats.brightness.min = Math.min(colorStats.brightness.min, brightness);
		colorStats.brightness.max = Math.max(colorStats.brightness.max, brightness);
		totalBrightness += brightness;
		totalSaturation += saturation;
		pixelCount++;
		
		// Dominant hue detection
		if (saturation > 50) { // Only count colorful pixels
			if (r > g && r > b) colorStats.dominantHues.red++;
			else if (g > r && g > b) colorStats.dominantHues.green++;
			else if (b > r && b > g) colorStats.dominantHues.blue++;
			else if (r > 100 && g > 100 && b < 80) colorStats.dominantHues.yellow++;
		}
	}
	
	colorStats.brightness.avg = totalBrightness / pixelCount;
	colorStats.saturation.avg = totalSaturation / pixelCount;
	
	console.log("Image analysis:", {
		brightnessRange: [colorStats.brightness.min, colorStats.brightness.max],
		avgBrightness: colorStats.brightness.avg,
		avgSaturation: colorStats.saturation.avg,
		dominantColors: colorStats.dominantHues
	});
	
	// Return adaptive mapping function based on image characteristics
	return function(rgb) {
		const [r, g, b] = rgb;
		
		// Use perceptually uniform color distance (Delta E approximation)
		let minDistance = Infinity;
		let closestColor = EINK_PALETTE[1]; // Default to white
		
		for (const color of EINK_PALETTE) {
			// LAB color space approximation for better perceptual matching
			const deltaR = r - color.rgb[0];
			const deltaG = g - color.rgb[1];
			const deltaB = b - color.rgb[2];
			
			// Weight the color channels based on human perception
			const distance = Math.sqrt(
				2 * deltaR * deltaR +        // Red weight
				4 * deltaG * deltaG +        // Green weight (higher - human eye is most sensitive)
				3 * deltaB * deltaB          // Blue weight
			);
			
			if (distance < minDistance) {
				minDistance = distance;
				closestColor = color;
			}
		}
		
		return closestColor;
	};
}

// Simple fallback color mapping
function findClosestColor(rgb) {
	const [r, g, b] = rgb;
	let minDistance = Infinity;
	let closestColor = EINK_PALETTE[1];

	for (const color of EINK_PALETTE) {
		const distance = Math.sqrt(
			Math.pow(r - color.rgb[0], 2) +
			Math.pow(g - color.rgb[1], 2) +
			Math.pow(b - color.rgb[2], 2)
		);

		if (distance < minDistance) {
			minDistance = distance;
			closestColor = color;
		}
	}

	return closestColor;
}

// Floyd-Steinberg dithering for better color conversion
function applyFloydSteinbergDithering(imageData, width, height) {
	const ditheredData = new Uint8ClampedArray(imageData);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 3;
			const oldR = ditheredData[idx];
			const oldG = ditheredData[idx + 1];
			const oldB = ditheredData[idx + 2];

			// Find closest color
			const closestColor = findClosestColor([oldR, oldG, oldB]);
			const [newR, newG, newB] = closestColor.rgb;

			// Set new color
			ditheredData[idx] = newR;
			ditheredData[idx + 1] = newG;
			ditheredData[idx + 2] = newB;

			// Calculate error
			const errR = oldR - newR;
			const errG = oldG - newG;
			const errB = oldB - newB;

			// Distribute error to neighboring pixels
			const distributeError = (dx, dy, factor) => {
				const nx = x + dx;
				const ny = y + dy;
				if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
					const nIdx = (ny * width + nx) * 3;
					ditheredData[nIdx] = Math.max(
						0,
						Math.min(255, ditheredData[nIdx] + errR * factor)
					);
					ditheredData[nIdx + 1] = Math.max(
						0,
						Math.min(255, ditheredData[nIdx + 1] + errG * factor)
					);
					ditheredData[nIdx + 2] = Math.max(
						0,
						Math.min(255, ditheredData[nIdx + 2] + errB * factor)
					);
				}
			};

			// Floyd-Steinberg error distribution
			distributeError(1, 0, 7 / 16); // Right
			distributeError(-1, 1, 3 / 16); // Below-left
			distributeError(0, 1, 5 / 16); // Below
			distributeError(1, 1, 1 / 16); // Below-right
		}
	}

	return ditheredData;
}

// E-ink Spectra 6 optimized color palette for art reproduction
// Colors calibrated for actual Waveshare 13.3" Spectra 6 display characteristics
const SPECTRA_6_PALETTE = [
	{ r: 0, g: 0, b: 0, name: "Black" },           // Pure black
	{ r: 255, g: 255, b: 255, name: "White" },     // Pure white  
	{ r: 255, g: 235, b: 0, name: "Yellow" },      // Slightly warmer yellow for better art reproduction
	{ r: 220, g: 0, b: 0, name: "Red" },           // Slightly muted red (more natural for art)
	{ r: 0, g: 0, b: 200, name: "Blue" },          // Slightly muted blue (better for shadows)
	{ r: 0, g: 180, b: 0, name: "Green" }          // More natural green tone
];

// Convert RGB to LAB color space for better perceptual color matching
function rgbToLab(r, g, b) {
	// Normalize RGB to 0-1
	r = r / 255;
	g = g / 255;
	b = b / 255;
	
	// Apply gamma correction
	r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
	g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
	b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
	
	// Convert to XYZ
	let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
	let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
	let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
	
	// Normalize by D65 illuminant
	x = x / 0.95047;
	y = y / 1.00000;
	z = z / 1.08883;
	
	// Convert to LAB
	x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
	y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
	z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
	
	const L = 116 * y - 16;
	const A = 500 * (x - y);
	const B = 200 * (y - z);
	
	return [L, A, B];
}

// Find closest color using perceptual LAB color space distance
function findClosestSpectraColor(r, g, b) {
	const [L1, A1, B1] = rgbToLab(r, g, b);
	let minDistance = Infinity;
	let closestColor = SPECTRA_6_PALETTE[1]; // Default to white
	
	for (const color of SPECTRA_6_PALETTE) {
		const [L2, A2, B2] = rgbToLab(color.r, color.g, color.b);
		
		// Delta E CIE76 formula - perceptually uniform color difference
		const deltaL = L1 - L2;
		const deltaA = A1 - A2;
		const deltaB = B1 - B2;
		const distance = Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
		
		if (distance < minDistance) {
			minDistance = distance;
			closestColor = color;
		}
	}
	
	return closestColor;
}

// Art-optimized dithering algorithms for E Ink Spectra 6
function applyDithering(imageData, width, height, algorithm = 'floyd-steinberg') {
	console.log(`Applying ${algorithm} dithering for art reproduction...`);
	const ditheredData = new Uint8ClampedArray(imageData);
	
	const distributeError = (x, y, errR, errG, errB, dx, dy, factor) => {
		const nx = x + dx;
		const ny = y + dy;
		if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
			const nIdx = (ny * width + nx) * 3;
			ditheredData[nIdx] = Math.max(0, Math.min(255, ditheredData[nIdx] + errR * factor));
			ditheredData[nIdx + 1] = Math.max(0, Math.min(255, ditheredData[nIdx + 1] + errG * factor));
			ditheredData[nIdx + 2] = Math.max(0, Math.min(255, ditheredData[nIdx + 2] + errB * factor));
		}
	};
	
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 3;
			const oldR = ditheredData[idx];
			const oldG = ditheredData[idx + 1];
			const oldB = ditheredData[idx + 2];
			
			// Find closest color in Spectra 6 palette using perceptual LAB distance
			const newColor = findClosestSpectraColor(oldR, oldG, oldB);
			const newR = newColor.r;
			const newG = newColor.g;
			const newB = newColor.b;
			
			// Set new color
			ditheredData[idx] = newR;
			ditheredData[idx + 1] = newG;
			ditheredData[idx + 2] = newB;
			
			// Calculate quantization error
			const errR = oldR - newR;
			const errG = oldG - newG;
			const errB = oldB - newB;
			
			// Apply error diffusion pattern based on algorithm
			if (algorithm === 'floyd-steinberg') {
				// Floyd-Steinberg pattern (good for general art)
				distributeError(x, y, errR, errG, errB, 1, 0, 7/16);   // Right
				distributeError(x, y, errR, errG, errB, -1, 1, 3/16);  // Below-left
				distributeError(x, y, errR, errG, errB, 0, 1, 5/16);   // Below
				distributeError(x, y, errR, errG, errB, 1, 1, 1/16);   // Below-right
			} else if (algorithm === 'atkinson') {
				// Atkinson dithering (better for high-contrast art, mentioned in blog)
				distributeError(x, y, errR, errG, errB, 1, 0, 1/8);    // Right
				distributeError(x, y, errR, errG, errB, 2, 0, 1/8);    // Right+2
				distributeError(x, y, errR, errG, errB, -1, 1, 1/8);   // Below-left
				distributeError(x, y, errR, errG, errB, 0, 1, 1/8);    // Below
				distributeError(x, y, errR, errG, errB, 1, 1, 1/8);    // Below-right
				distributeError(x, y, errR, errG, errB, 0, 2, 1/8);    // Below+2
			}
		}
	}
	
	console.log(`${algorithm} dithering completed for art optimization`);
	// Convert Uint8ClampedArray to Buffer for base64 encoding
	return Buffer.from(ditheredData);
}

async function convertImageToRGB(
	imagePath,
	rotation = 0,
	targetWidth = 1200,
	targetHeight = 1600,
	options = {}
) {
	try {
		console.log(`Processing image for art gallery display: ${imagePath} (rotation: ${rotation}°)`);

		// Art-specific preprocessing options
		const {
			ditherAlgorithm = 'floyd-steinberg', // or 'atkinson' for high-contrast art
			enhanceContrast = true,              // Boost contrast for better e-ink display
			sharpen = false,                     // Optional sharpening for line art
			autoCropWhitespace = true            // Auto-crop whitespace margins from AI images
		} = options;

		// Build Sharp processing pipeline for art optimization
		let sharpPipeline = sharp(imagePath);

		// Apply rotation FIRST if needed (before resize)
		if (rotation !== 0) {
			sharpPipeline = sharpPipeline.rotate(rotation);
		}

		// Auto-crop whitespace/margins if enabled (helps with AI-generated images)
		if (autoCropWhitespace) {
			try {
				// Trim edges that are close to white (within 10% threshold)
				sharpPipeline = sharpPipeline.trim({ threshold: 25 });
				console.log('Auto-cropped whitespace margins from AI image');
			} catch (trimError) {
				console.log('No significant whitespace to crop');
			}
		}

		// Always resize to target dimensions (e-ink display expects 1200x1600)
		// Using "cover" instead of "contain" to ensure full-frame fill
		// Rotation is applied to the INPUT, output is always 1200x1600
		sharpPipeline = sharpPipeline
			.resize(targetWidth, targetHeight, {
				fit: "cover",  // Changed from "contain" to "cover" for full-frame fill
				position: "center",
				background: { r: 255, g: 255, b: 255, alpha: 1 },
			})
			.toColourspace('srgb'); // ensure standard sRGB color space (3-channel raw)
		
		// Art-specific enhancements
		if (enhanceContrast) {
			// Enhance contrast for better e-ink reproduction
			sharpPipeline = sharpPipeline.linear(1.2, -(128 * 0.2));
		}
		
		if (sharpen) {
			// Sharpen for line art and detailed artwork
			sharpPipeline = sharpPipeline.sharpen();
		}
		
		// Convert to raw RGB with explicit 3 channels
		const { data: imageBuffer, info } = await sharpPipeline
			.raw()
			.toBuffer({ resolveWithObject: true });
		if (info.channels !== 3) {
			throw new Error(`Expected 3 channels (RGB), got ${info.channels}`);
		}
		console.log(`Art preprocessing complete: ${info.width}x${info.height}, ${imageBuffer.length / 3} pixels`);

		// Verify output dimensions match target (should always be 1200x1600 after resize)
		if (info.width !== targetWidth || info.height !== targetHeight) {
			throw new Error(`Unexpected dimensions: got ${info.width}x${info.height}, expected ${targetWidth}x${targetHeight}`);
		}

		// Apply professional dithering for art gallery quality
		const ditheredBuffer = applyDithering(imageBuffer, targetWidth, targetHeight, ditherAlgorithm);

		console.log(`Art gallery image ready: ${targetWidth}x${targetHeight}, algorithm: ${ditherAlgorithm}, rotation: ${rotation}°`);
		return ditheredBuffer;
		
	} catch (error) {
		console.error("Error processing image for art gallery:", error);
		throw error;
	}
}

async function createTextImage(text, targetWidth = 1200, targetHeight = 1600) {
	try {
		// Create SVG text
		const svg = `
            <svg width="${targetWidth}" height="${targetHeight}" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="white"/>
                <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="60" text-anchor="middle" 
                      dominant-baseline="middle" fill="black">${text}</text>
            </svg>
        `;

const { data: imageBuffer, info } = await sharp(Buffer.from(svg))
			.resize(targetWidth, targetHeight)
			.toColourspace('srgb')
			.raw()
			.toBuffer({ resolveWithObject: true });
		if (info.channels !== 3) {
			throw new Error(`Text image generated ${info.channels} channels, expected 3`);
		}

		console.log(`Created text image: ${imageBuffer.length / 3} pixels as RGB data`);
		
		// Return raw RGB data for ESP32 to process
		return imageBuffer;
	} catch (error) {
		console.error("Error creating text image:", error);
		throw error;
	}
}

// Input validation helpers
function validateDeviceId(deviceId) {
	return (
		typeof deviceId === "string" && deviceId.length > 0 && deviceId.length < 100
	);
}

function validateImageData(imageData) {
	return typeof imageData === "string" && imageData.length < 10 * 1024 * 1024; // 10MB limit
}

function sanitizeInput(input) {
	if (typeof input !== "string") return "";
	return input.replace(/[<>]/g, "").trim().substring(0, 1000);
}

function getRandomLuckyPrompt() {
	return "Surprise me with a vivid portrait concept that feels full-bleed, high contrast, and made for a six-color e-ink display.";
}

// Helper functions
async function readJSONFile(filename) {
	try {
		await ensureDataDir();
		const data = await fs.readFile(path.join(DATA_DIR, filename), "utf8");
		return JSON.parse(data);
	} catch (error) {
		console.error(`Error reading ${filename}:`, error.message);
		return null;
	}
}

async function writeJSONFile(filename, data) {
	try {
		await ensureDataDir();
		await fs.writeFile(
			path.join(DATA_DIR, filename),
			JSON.stringify(data, null, 2)
		);
	} catch (error) {
		console.error(`Error writing ${filename}:`, error.message);
		throw error;
	}
}

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

		// Send metadata only (no image data)
		const metadata = {
			title: current.title || "Glance Display",
			imageId: current.imageId || "default",
			timestamp: current.timestamp || Date.now(),
			sleepDuration: current.sleepDuration || 3600000000,
			rotation: current.rotation || 0
		};

		console.log(`Serving metadata: imageId=${metadata.imageId}, sleep=${metadata.sleepDuration}us`);
		res.json(metadata);
	} catch (error) {
		console.error("Error getting current:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get current image with full data for web UI
app.get("/api/current-full.json", async (req, res) => {
	try {
		const current = (await readJSONFile("current.json")) || {
			title: "Glance Display",
			imageId: "",
			timestamp: Date.now(),
			sleepDuration: 3600000000,
		};

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

		// Input validation
		const sanitizedTitle = sanitizeInput(title);
		const sleepMs = parseInt(sleepDuration) || 3600000000;

		if (image && !validateImageData(image)) {
			return res.status(400).json({ error: "Invalid image data" });
		}

		let imageData = "";

		if (image) {
			if (isText) {
				// Convert text to e-ink image
				const sanitizedText = sanitizeInput(image);
				const textImageBuffer = await createTextImage(sanitizedText);
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
				const rgbBuffer = await convertImageToRGB(tempPath);
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
		const ditheredRgbBuffer = await convertImageToRGB(req.file.path, 1200, 1600, {
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

		// Input validation
		const sleepMs = parseInt(sleepDuration) || 3600000000;
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

		// Decode base64 to buffer
		const imageBuffer = Buffer.from(imageBase64, 'base64');

		// Save to temporary file
		const tempFilePath = path.join(UPLOAD_DIR, `ai-gen-${Date.now()}.png`);
		await fs.writeFile(tempFilePath, imageBuffer);

		// Convert to RGB format for e-ink display (with rotation and auto-crop)
		const rgbBuffer = await convertImageToRGB(tempFilePath, rotationDegrees, 1200, 1600, {
			autoCropWhitespace: true,  // Auto-crop whitespace margins from AI images
			enhanceContrast: true,     // Boost contrast for e-ink
			ditherAlgorithm: 'floyd-steinberg'
		});

		// Save original for thumbnail
		const originalImageBase64 = imageBuffer.toString("base64");

		const imageId = uuidv4();
		const current = {
			title: `AI Generated: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`,
			image: rgbBuffer.toString("base64"),
			originalImage: originalImageBase64,
			originalImageMime: "image/png",
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

		// Store full image in images archive for history access
		const imagesArchive = (await readJSONFile("images.json")) || {};
		imagesArchive[imageId] = current; // Store complete image data
		await writeJSONFile("images.json", imagesArchive);

		// Add to history (only metadata + thumbnail)
		const history = (await readJSONFile("history.json")) || [];
		history.unshift({
			imageId: imageId,
			title: current.title,
			thumbnail: originalImageBase64, // Store original for thumbnail
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

		res.json({
			success: true,
			current,
			revisedPrompt: response.data[0].revised_prompt
		});
	} catch (error) {
		console.error("Error generating AI art:", error);
		res.status(500).json({
			error: "Error generating AI art: " + error.message
		});
	}
});

// Lucky prompt helper - expands simple cues into a detailed art prompt
app.post("/api/lucky-prompt", async (req, res) => {
	const body = req.body || {};
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

	const inspirationSeed =
		cueParts.length > 0 ? cueParts.join(". ") : getRandomLuckyPrompt();

	try {
		const temperature = cueParts.length > 0 ? 0.9 : 1.1;
		const response = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			max_tokens: 220,
			temperature,
			messages: [
				{
					role: "system",
					content:
						"You are a creative director crafting prompts for an AI image generator that produces portrait-oriented art for a high-contrast six-color e-ink display. Every prompt must insist on full-bleed composition, rich textures, and bold contrast. Respond with a single prompt under 80 words."
				},
				{
					role: "user",
					content: cueParts.length > 0
						? `Use the following loose guidance to create a vivid prompt:\n${cueParts.join(
							"\n"
						)}\n\nDeliver one complete prompt ready for image generation, highlighting full-bleed composition, dramatic lighting, and strong contrast suitable for an e-ink poster.`
						: `Surprise me with a fresh, inspiring idea for a portrait-oriented AI artwork that would look striking on an e-ink display. Lean into ${inspirationSeed}. Make sure the prompt enforces full-bleed composition, edge-to-edge detail, and bold contrast.`
				}
			]
		});

		const candidate =
			response?.choices?.[0]?.message?.content?.trim();

		if (!candidate) {
			console.warn("OpenAI returned no content for lucky prompt");
			return res.status(502).json({
				error: "AI did not return a prompt. Please try again."
			});
		}

		const generatedPrompt = candidate.replace(/^"+|"+$/g, "");

		res.json({
			prompt: generatedPrompt,
			source: "openai",
			inspiration: cueParts.length > 0 ? cueParts : [inspirationSeed]
		});
	} catch (error) {
		console.error("Error generating lucky prompt with OpenAI:", error);
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

			// Input validation
			const sanitizedTitle = sanitizeInput(title);
			const sleepMs = parseInt(sleepDuration) || 3600000000;
			const rotationDegrees = parseInt(rotation) || 0;

			// Read original uploaded file for thumbnail
			const originalImageBuffer = await fs.readFile(req.file.path);
			const originalImageBase64 = originalImageBuffer.toString("base64");
			const mimeType = req.file.mimetype || "image/jpeg";

			// Convert uploaded image to RGB format for e-ink display (with rotation)
			const rgbBuffer = await convertImageToRGB(req.file.path, rotationDegrees);
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

		// Load existing devices
		const devices = (await readJSONFile("devices.json")) || {};

		// Update device status with sanitized data
		devices[deviceId] = {
			batteryVoltage: parseFloat(status.batteryVoltage) || 0,
			signalStrength: parseInt(status.signalStrength) || 0,
			freeHeap: parseInt(status.freeHeap) || 0,
			bootCount: parseInt(status.bootCount) || 0,
			status: sanitizeInput(status.status) || "unknown",
			lastSeen: Date.now(),
			deviceId: sanitizeInput(deviceId),
		};

		await writeJSONFile("devices.json", devices);

		console.log(
			`Device status updated: ${deviceId} - Battery: ${status.batteryVoltage}V, Signal: ${status.signalStrength}dBm`
		);

		res.json({ success: true });
	} catch (error) {
		console.error("Error updating device status:", error);
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

// Get all logs
app.get("/api/logs", async (_req, res) => {
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

// Load image from history by ID
app.post("/api/history/:imageId/load", async (req, res) => {
	try {
		const { imageId } = req.params;

		// Get full image data from images archive
		const imagesArchive = (await readJSONFile("images.json")) || {};
		const imageData = imagesArchive[imageId];

		if (!imageData) {
			return res.status(404).json({ error: "Image not found in archive" });
		}

		// Set this image as current
		await writeJSONFile("current.json", imageData);
		console.log(`Loaded image ${imageId} from history: ${imageData.title}`);

		res.json({ success: true, current: imageData });
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

app.get("/api/playlist", async (_req, res) => {
	try {
		const playlist = await readJSONFile("playlist.json");
		if (!playlist) {
			return res.json({ active: false });
		}
		res.json(playlist);
	} catch (error) {
		console.error("Error getting playlist:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

app.delete("/api/playlist", async (_req, res) => {
	try {
		// Just mark as inactive rather than deleting
		const playlist = await readJSONFile("playlist.json");
		if (playlist) {
			playlist.active = false;
			await writeJSONFile("playlist.json", playlist);
		}

		res.json({ success: true, message: "Playlist stopped" });
	} catch (error) {
		console.error("Error stopping playlist:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// External art gallery APIs
app.get("/api/art/search", async (req, res) => {
	try {
		const { query, limit = 20, offset = 0 } = req.query;
		const targetCount = parseInt(limit);

		console.log(`Searching for artworks: "${query}", limit: ${targetCount}, offset: ${offset}`);

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

		// Helper function to check if artwork is suitable (not just a photograph of an artwork in a book)
		const isOriginalArtwork = (title, classification, objectName, medium) => {
			const lowerTitle = (title || "").toLowerCase();
			const lowerClass = (classification || "").toLowerCase();
			const lowerObject = (objectName || "").toLowerCase();
			const lowerMedium = (medium || "").toLowerCase();

			const allText = `${lowerTitle} ${lowerClass} ${lowerObject} ${lowerMedium}`;

			// Only exclude obvious non-artworks (photographs of book pages, etc)
			const hardExcludeTerms = [
				"page from a book",
				"page from an album",
				"photograph of",
				"illustrated book",
				"title page",
				"frontispiece"
			];

			for (const term of hardExcludeTerms) {
				if (allText.includes(term)) {
					console.log(`Filtering out: ${title} (contains "${term}")`);
					return false;
				}
			}

			// Allow paintings, drawings, prints, and even reproductions if they're actual artworks
			return true;
		};

		// Helper to search Met Museum with error handling
		const searchMet = async () => {
			const cacheKey = `met-${query}-${targetCount}`;
			const cached = getCachedResult(cacheKey);
			if (cached) return cached;

			try {
				const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query || "painting")}`;
				console.log(`Searching Met Museum: ${searchUrl}`);

				const searchResponse = await fetch(searchUrl);

				// Handle HTML error responses (rate limits, 404s)
				const contentType = searchResponse.headers.get("content-type");
				if (!contentType || !contentType.includes("application/json")) {
					console.error("Met API returned non-JSON response (likely rate limited or error)");
					return [];
				}

				const searchData = await searchResponse.json();
				console.log(`Met search found ${searchData.total || 0} total results`);

				if (!searchData.objectIDs || searchData.objectIDs.length === 0) {
					return [];
				}

				// Try 10x the limit to account for filtering and errors
				const objectIds = searchData.objectIDs.slice(0, targetCount * 10);
				const metArtworks = [];

				for (const objectId of objectIds) {
					if (metArtworks.length >= targetCount) break;

					try {
						const objectUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`;
						const objectResponse = await fetch(objectUrl);

						// Check for HTML error responses
						const objectContentType = objectResponse.headers.get("content-type");
						if (!objectContentType || !objectContentType.includes("application/json")) {
							continue; // Skip this object
						}

						const objectData = await objectResponse.json();

						// Filter for actual artworks from art departments
						const isArtworkDept = objectData.primaryImage &&
						                      objectData.isPublicDomain &&
						                      artDepartments.includes(objectData.department);

						// Also check if it's an original artwork (not photo/reproduction)
						const isOriginal = isOriginalArtwork(
							objectData.title,
							objectData.classification,
							objectData.objectName,
							objectData.medium
						);

						if (isArtworkDept && isOriginal) {
							metArtworks.push({
								id: `met-${objectData.objectID}`,
								title: objectData.title || "Untitled",
								artist: objectData.artistDisplayName || "Unknown Artist",
								date: objectData.objectDate || "",
								imageUrl: objectData.primaryImage,
								thumbnailUrl: objectData.primaryImageSmall || objectData.primaryImage,
								department: objectData.department || "",
								culture: objectData.culture || "",
								source: "The Met Museum"
							});
						}
					} catch (error) {
						// Silently skip objects that fail (likely 404s or rate limited)
						continue;
					}
				}

				console.log(`Met Museum returned ${metArtworks.length} artworks`);
				setCachedResult(cacheKey, metArtworks);
				return metArtworks;
			} catch (error) {
				console.error("Error searching Met Museum:", error.message);
				return [];
			}
		};

		// Helper to search Art Institute of Chicago
		const searchArtic = async () => {
			const cacheKey = `artic-${query}-${targetCount}`;
			const cached = getCachedResult(cacheKey);
			if (cached) return cached;

			try {
				const articUrl = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query || "painting")}&limit=${targetCount * 3}&fields=id,title,artist_display,date_display,image_id,is_public_domain,department_title,artwork_type_title,classification_title,medium_display`;
				console.log(`Searching Art Institute of Chicago: ${articUrl}`);

				const articResponse = await fetch(articUrl);

				// Check for valid JSON response
				const contentType = articResponse.headers.get("content-type");
				if (!contentType || !contentType.includes("application/json")) {
					console.error("ARTIC API returned non-JSON response");
					return [];
				}

				const articData = await articResponse.json();
				console.log(`ARTIC search found ${articData.pagination?.total || 0} total results`);

				if (!articData.data || articData.data.length === 0) {
					return [];
				}

				const articArtworks = articData.data
					.filter(artwork => {
						if (!artwork.image_id || !artwork.is_public_domain || !artwork.department_title) {
							return false;
						}

						// Apply original artwork filter
						return isOriginalArtwork(
							artwork.title,
							artwork.classification_title,
							artwork.artwork_type_title,
							artwork.medium_display
						);
					})
					.slice(0, targetCount)
					.map(artwork => ({
						id: `artic-${artwork.id}`,
						title: artwork.title || "Untitled",
						artist: artwork.artist_display || "Unknown Artist",
						date: artwork.date_display || "",
						imageUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/1200,/0/default.jpg`,
						thumbnailUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/400,/0/default.jpg`,
						department: artwork.department_title || "",
						culture: "",
						source: "Art Institute of Chicago"
					}));

				console.log(`ARTIC returned ${articArtworks.length} artworks`);
				setCachedResult(cacheKey, articArtworks);
				return articArtworks;
			} catch (error) {
				console.error("Error searching ARTIC:", error.message);
				return [];
			}
		};

		// Helper to search Cleveland Museum of Art
		const searchCleveland = async () => {
			const cacheKey = `cma-${query}-${targetCount}`;
			const cached = getCachedResult(cacheKey);
			if (cached) return cached;

			try {
				const cmaUrl = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query || "painting")}&cc=1&has_image=1&limit=${targetCount * 3}`;
				console.log(`Searching Cleveland Museum: ${cmaUrl}`);

				const cmaResponse = await fetch(cmaUrl);

				// Check for valid JSON response
				const contentType = cmaResponse.headers.get("content-type");
				if (!contentType || !contentType.includes("application/json")) {
					console.error("CMA API returned non-JSON response");
					return [];
				}

				const cmaData = await cmaResponse.json();
				console.log(`CMA search found ${cmaData.info?.total || 0} total results`);

				if (!cmaData.data || cmaData.data.length === 0) {
					return [];
				}

				const cmaArtworks = cmaData.data
					.filter(artwork => {
						if (!artwork.images?.web?.url || artwork.share_license_status !== "cc0") {
							return false;
						}

						// Apply original artwork filter
						return isOriginalArtwork(
							artwork.title,
							artwork.type,
							"",
							""
						);
					})
					.slice(0, targetCount)
					.map(artwork => ({
						id: `cma-${artwork.id}`,
						title: artwork.title || "Untitled",
						artist: artwork.creators?.[0]?.description || artwork.tombstone || "Unknown Artist",
						date: artwork.creation_date || "",
						imageUrl: artwork.images.web.url,
						thumbnailUrl: artwork.images.web.url,
						department: artwork.department || "",
						culture: artwork.culture?.[0] || "",
						source: "Cleveland Museum of Art"
					}));

				console.log(`CMA returned ${cmaArtworks.length} artworks`);
				setCachedResult(cacheKey, cmaArtworks);
				return cmaArtworks;
			} catch (error) {
				console.error("Error searching CMA:", error.message);
				return [];
			}
		};

		// Helper to search Rijksmuseum
		const searchRijksmuseum = async () => {
			const cacheKey = `rijks-${query}-${targetCount}`;
			const cached = getCachedResult(cacheKey);
			if (cached) return cached;

			try {
				const rijksUrl = `https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&q=${encodeURIComponent(query || "painting")}&imgonly=true&ps=${targetCount * 3}`;
				console.log(`Searching Rijksmuseum: ${rijksUrl}`);

				const rijksResponse = await fetch(rijksUrl);

				// Check for valid JSON response
				const contentType = rijksResponse.headers.get("content-type");
				if (!contentType || !contentType.includes("application/json")) {
					console.error("Rijksmuseum API returned non-JSON response");
					return [];
				}

				const rijksData = await rijksResponse.json();
				console.log(`Rijksmuseum search found ${rijksData.count || 0} total results`);

				if (!rijksData.artObjects || rijksData.artObjects.length === 0) {
					return [];
				}

				const rijksArtworks = rijksData.artObjects
					.filter(artwork => {
						if (!artwork.webImage?.url || !artwork.permitDownload) {
							return false;
						}

						// Apply original artwork filter
						return isOriginalArtwork(
							artwork.title,
							"",
							"",
							""
						);
					})
					.slice(0, targetCount)
					.map(artwork => ({
						id: `rijks-${artwork.objectNumber}`,
						title: artwork.title || "Untitled",
						artist: artwork.principalOrFirstMaker || "Unknown Artist",
						date: artwork.dating?.presentingDate || "",
						imageUrl: artwork.webImage.url,
						thumbnailUrl: artwork.webImage.url,
						department: "",
						culture: "",
						source: "Rijksmuseum"
					}));

				console.log(`Rijksmuseum returned ${rijksArtworks.length} artworks`);
				setCachedResult(cacheKey, rijksArtworks);
				return rijksArtworks;
			} catch (error) {
				console.error("Error searching Rijksmuseum:", error.message);
				return [];
			}
		};

		// Search all sources in parallel
		const [metResults, articResults, cmaResults, rijksResults] = await Promise.all([
			searchMet(),
			searchArtic(),
			searchCleveland(),
			searchRijksmuseum()
		]);

		// Track source status for user feedback
		const sources = {
			met: { status: metResults.length > 0 ? "ok" : "no_results", count: metResults.length },
			artic: { status: articResults.length > 0 ? "ok" : "no_results", count: articResults.length },
			cleveland: { status: cmaResults.length > 0 ? "ok" : "no_results", count: cmaResults.length },
			rijksmuseum: { status: rijksResults.length > 0 ? "ok" : "no_results", count: rijksResults.length }
		};

		// Ranking function to score artworks
		const scoreArtwork = (artwork) => {
			let score = 0;
			const lowerQuery = (query || "").toLowerCase();
			const lowerArtist = (artwork.artist || "").toLowerCase();
			const lowerTitle = (artwork.title || "").toLowerCase();
			const lowerDept = (artwork.department || "").toLowerCase();

			// Exact artist match is highest priority
			if (lowerArtist.includes(lowerQuery)) score += 10;

			// Title match is important
			if (lowerTitle.includes(lowerQuery)) score += 5;

			// Paintings are preferred over other types
			if (lowerDept.includes('painting')) score += 5;
			if (lowerTitle.includes('painting')) score += 3;

			// Prefer older works (estimate from date string)
			const dateMatch = (artwork.date || "").match(/\d{4}/);
			if (dateMatch) {
				const year = parseInt(dateMatch[0]);
				if (year < 1800) score += 4;
				else if (year < 1900) score += 3;
				else if (year < 1950) score += 2;
			}

			return score;
		};

		// Merge all results
		const allResults = [
			...metResults,
			...articResults,
			...cmaResults,
			...rijksResults
		];

		// Sort by score (highest first), then interleave by source for diversity
		allResults.forEach(artwork => {
			artwork._score = scoreArtwork(artwork);
		});

		allResults.sort((a, b) => b._score - a._score);

		// Remove score from output
		allResults.forEach(artwork => delete artwork._score);

		// Apply offset and limit to sorted results
		const paginatedResults = allResults.slice(offset, offset + targetCount);

		console.log(`Returning ${paginatedResults.length} artworks (Met: ${metResults.length}, ARTIC: ${articResults.length}, CMA: ${cmaResults.length}, Rijks: ${rijksResults.length})`);

		res.json({
			results: paginatedResults,
			total: allResults.length,
			hasMore: allResults.length > (offset + targetCount),
			sources: sources
		});
	} catch (error) {
		console.error("Error searching art:", error);
		res.status(500).json({ error: "Internal server error: " + error.message });
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
		const { imageUrl, title, artist, source } = req.body;

		if (!imageUrl) {
			return res.status(400).json({ error: "Image URL required" });
		}

		console.log(`Importing artwork: ${title} from ${imageUrl}`);

		// Fetch the image
		const imageResponse = await fetch(imageUrl);
		if (!imageResponse.ok) {
			return res.status(400).json({ error: "Failed to fetch image" });
		}

		const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

		// Save to temporary file
		const tempPath = path.join(UPLOAD_DIR, `temp-${Date.now()}.jpg`);
		await fs.writeFile(tempPath, imageBuffer);

		// Process image with Sharp (resize and dither for e-ink)
		// convertImageToRGB(imagePath, rotation, targetWidth, targetHeight, options)
		const ditheredRgbBuffer = await convertImageToRGB(
			tempPath,
			0, // rotation
			1200, // targetWidth
			1600, // targetHeight
			{
				ditherAlgorithm: 'floyd-steinberg',
				enhanceContrast: true,
				sharpen: false
			}
		);

		// Create thumbnail
		const thumbnailBuffer = await sharp(ditheredRgbBuffer, {
			raw: {
				width: 1200,
				height: 1600,
				channels: 3
			}
		})
		.resize(300, 400, { fit: "fill" })
		.png()
		.toBuffer();

		// Clean up temp file
		await fs.unlink(tempPath);

		const imageId = uuidv4();

		// Create current.json with the artwork
		const currentData = {
			title: title || "Artwork",
			artist: artist || "Unknown",
			source: source || "external",
			imageId: imageId,
			image: ditheredRgbBuffer.toString("base64"),
			timestamp: Date.now(),
			sleepDuration: 3600000000, // 1 hour
			rotation: 0,
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

		res.json({ success: true, message: "Artwork imported successfully" });
	} catch (error) {
		console.error("Error importing art:", error);
		res.status(500).json({ error: "Internal server error: " + error.message });
	}
});

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
		// Try to read the UI file from the same directory as server.js (for Docker)
		let uiPath = path.join(__dirname, 'simple-ui.html');
		
		try {
			await fs.access(uiPath);
		} catch {
			// Fallback to parent directory (for local development)
			uiPath = path.join(__dirname, '..', 'simple-ui.html');
		}
		
		const simpleUIContent = await fs.readFile(uiPath, 'utf8');
		
		// Add cache-busting headers to prevent browser caching issues
		res.set({
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Pragma': 'no-cache',
			'Expires': '0',
			'ETag': `"${Date.now()}"` // Simple ETag based on current time
		});
		
		res.send(simpleUIContent);
	} catch (error) {
		console.error('Error serving UI file:', error);
		res.status(500).send(`
			<html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
				<h1>UI File Missing</h1>
				<p>The simple-ui.html file is not found. This indicates a Docker build issue.</p>
				<p>Please check that simple-ui.html is properly copied to the container.</p>
				<hr>
				<small>Path attempted: ${path.join(__dirname, 'simple-ui.html')} and ${path.join(__dirname, '..', 'simple-ui.html')}</small>
			</body></html>
		`);
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
