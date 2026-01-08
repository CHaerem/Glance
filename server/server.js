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

// Shared state (logs)
const { serverLogs, deviceLogs, addDeviceLog, addServerLog, getDeviceLogs, getServerLogs, MAX_LOGS } = require("./utils/state");

// Route modules
const collectionsRoutes = require("./routes/collections");
const createArtRoutes = require("./routes/art");
const createSystemRoutes = require("./routes/system");
const createHistoryRoutes = require("./routes/history");
const createImageRoutes = require("./routes/images");
const createUploadRoutes = require("./routes/upload");
const createDeviceRoutes = require("./routes/devices");
const createLogRoutes = require("./routes/logs");
const createFirmwareRoutes = require("./routes/firmware");
const metricsRoutes = require("./routes/metrics");


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

// Mount route modules
app.use('/api/collections', collectionsRoutes);
app.use('/api/art', createArtRoutes({ openai, uploadDir: UPLOAD_DIR }));

// History routes - mount at /api for history, images, my-collection, playlist
const historyRoutes = createHistoryRoutes({ uploadDir: UPLOAD_DIR });
app.use('/api', historyRoutes);

// System routes - includes health, build-info, stats, settings, time, etc.
const systemRoutes = createSystemRoutes({
	imageVersion: IMAGE_VERSION,
	buildDate: BUILD_DATE,
	buildDateHuman: BUILD_DATE_HUMAN
});
app.get('/health', (req, res) => res.json({ status: "healthy", timestamp: Date.now() }));
app.use('/api', systemRoutes);

// Image routes - current image, binary stream, preview
const imageRoutes = createImageRoutes({ upload, uploadDir: UPLOAD_DIR });
app.use('/api', imageRoutes);

// Upload routes - file upload, AI generation
const uploadRoutes = createUploadRoutes({ upload, uploadDir: UPLOAD_DIR, openai });
app.use('/api', uploadRoutes);

// Device routes - status reporting, commands
const deviceRoutes = createDeviceRoutes();
app.use('/api', deviceRoutes);

// Log routes - logging, serial streams, diagnostics
const logRoutes = createLogRoutes();
app.use('/api', logRoutes);

// Firmware OTA routes - version check and binary download
const firmwareRoutes = createFirmwareRoutes({
	dataDir: getDataDir(),
	firmwareVersion: IMAGE_VERSION,
	buildDate: BUILD_DATE
});
app.use('/api/firmware', firmwareRoutes);

// Semantic search routes (SigLIP 2 embeddings)
const semanticSearchRoutes = require('./routes/semantic-search');
app.use('/api/semantic', semanticSearchRoutes);

// Prometheus metrics endpoint for Grafana
app.use('/api/metrics', metricsRoutes);

// Health check moved to routes/system.js

// Build info moved to routes/system.js

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
	statistics.trackLog('INFO', message);
	originalLog.apply(console, args);
};

console.error = function(...args) {
	const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
	serverLogs.push(`[${getOsloTimestamp()}] ERROR: ${message}`);
	if (serverLogs.length > MAX_LOGS) serverLogs.shift();
	statistics.trackLog('ERROR', message);
	originalError.apply(console, args);
};

// System info moved to routes/system.js





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

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
	startServer().catch(console.error);
}

// Export for testing
module.exports = {
	app,
	// Re-export image processing functions for tests that depend on them
	convertImageToRGB: imageProcessing.convertImageToRGB,
	applyDithering: imageProcessing.applyDithering,
	findClosestSpectraColor: imageProcessing.findClosestSpectraColor
};
