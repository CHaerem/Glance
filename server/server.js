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
		const imageQuality = quality === 'hd' ? 'hd' : 'standard';
		const artStyle = style || 'balanced';
		const dalleStyle = imageStyle === 'natural' ? 'natural' : 'vivid'; // vivid or natural

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

		// Generate image with DALL-E 3
		// Using 1024x1792 (portrait, 9:16) - closest to display's 3:4 ratio
		// Will be center-cropped from 9:16 to 3:4 (crops ~14% from top/bottom)
		const response = await openai.images.generate({
			model: "dall-e-3",
			prompt: enhancedPrompt,
			n: 1,
			size: "1024x1792", // Portrait format (9:16) - best match for portrait display
			quality: imageQuality, // 'standard' or 'hd' (hd costs 2x)
			style: dalleStyle, // 'vivid' (more artistic/colorful) or 'natural' (more realistic)
			response_format: "url"
		});

		const imageUrl = response.data[0].url;
		console.log(`AI image generated: ${imageUrl}`);

		// Download the generated image
		const fetch = (await import('node-fetch')).default;
		const imageResponse = await fetch(imageUrl);
		const imageBuffer = await imageResponse.buffer();

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

		const current = {
			title: `AI Generated: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`,
			image: rgbBuffer.toString("base64"),
			originalImage: originalImageBase64,
			originalImageMime: "image/png",
			imageId: uuidv4(),
			timestamp: Date.now(),
			sleepDuration: sleepMs,
			rotation: rotationDegrees,
			aiGenerated: true,
			originalPrompt: prompt
		};

		await writeJSONFile("current.json", current);

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

			const current = {
				title: sanitizedTitle || `Uploaded: ${req.file.originalname}`,
				image: imageData,
				originalImage: originalImageBase64,
				originalImageMime: mimeType,
				imageId: uuidv4(),
				timestamp: Date.now(),
				sleepDuration: sleepMs,
				rotation: rotationDegrees,
			};

			await writeJSONFile("current.json", current);

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
