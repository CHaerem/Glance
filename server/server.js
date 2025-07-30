const express = require("express");
const cors = require("cors");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const sharp = require("sharp");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGE_VERSION = process.env.IMAGE_VERSION || "local";
const BUILD_DATE = process.env.BUILD_DATE || "unknown";

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

// E-ink color palette for Waveshare 13.3" Spectra 6 (as per EPD_13in3e.h)
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

// Rate limiting
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // limit each IP to 100 requests per windowMs
	message: "Too many requests from this IP, please try again later.",
});

const uploadLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10, // limit uploads to 10 per 15 minutes
	message: "Too many uploads, please try again later.",
});

// Middleware
app.use(cors());
app.use(limiter);
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

// Image processing functions
function findClosestColor(rgb) {
	let minDistance = Infinity;
	let closestColor = EINK_PALETTE[1]; // Default to white

	for (const color of EINK_PALETTE) {
		const [r, g, b] = color.rgb;
		const distance = Math.sqrt(
			Math.pow(rgb[0] - r, 2) +
				Math.pow(rgb[1] - g, 2) +
				Math.pow(rgb[2] - b, 2)
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

async function convertImageToEink(
	imagePath,
	targetWidth = 1150,
	targetHeight = 1550
) {
	try {
		// Load and process image with Sharp
		const imageBuffer = await sharp(imagePath)
			.resize(targetWidth, targetHeight, {
				fit: "contain",
				background: { r: 255, g: 255, b: 255, alpha: 1 },
			})
			.raw()
			.toBuffer();

		// Apply Floyd-Steinberg dithering for better color conversion
		console.log("Applying Floyd-Steinberg dithering...");
		const ditheredBuffer = applyFloydSteinbergDithering(
			imageBuffer,
			targetWidth,
			targetHeight
		);

		// Convert dithered image to e-ink format
		const pixels = [];
		for (let i = 0; i < ditheredBuffer.length; i += 3) {
			const rgb = [
				ditheredBuffer[i],
				ditheredBuffer[i + 1],
				ditheredBuffer[i + 2],
			];
			const closestColor = findClosestColor(rgb);
			pixels.push(closestColor.index);
		}

		console.log(`Converted ${pixels.length} pixels to e-ink format`);
		return Buffer.from(pixels);
	} catch (error) {
		console.error("Error converting image:", error);
		throw error;
	}
}

async function createTextImage(text, targetWidth = 1150, targetHeight = 1550) {
	try {
		// Create SVG text
		const svg = `
            <svg width="${targetWidth}" height="${targetHeight}" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="white"/>
                <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="60" text-anchor="middle" 
                      dominant-baseline="middle" fill="black">${text}</text>
            </svg>
        `;

		const imageBuffer = await sharp(Buffer.from(svg))
			.resize(targetWidth, targetHeight)
			.raw()
			.toBuffer();

		// Apply Floyd-Steinberg dithering for better color conversion
		const ditheredBuffer = applyFloydSteinbergDithering(
			imageBuffer,
			targetWidth,
			targetHeight
		);

		// Convert to e-ink format
		const pixels = [];
		for (let i = 0; i < ditheredBuffer.length; i += 3) {
			const rgb = [
				ditheredBuffer[i],
				ditheredBuffer[i + 1],
				ditheredBuffer[i + 2],
			];
			const closestColor = findClosestColor(rgb);
			pixels.push(closestColor.index);
		}

		return Buffer.from(pixels);
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

// Get current image/schedule for ESP32
app.get("/api/current.json", async (req, res) => {
	try {
		const current = (await readJSONFile("current.json")) || {
			title: "Glance Display",
			image: "",
			imageId: "",
			timestamp: Date.now(),
			sleepDuration: 3600000000, // 1 hour in microseconds
		};

		res.json(current);
	} catch (error) {
		console.error("Error getting current:", error);
		res.status(500).json({ error: "Internal server error" });
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

				// Convert to e-ink format
				const einkBuffer = await convertImageToEink(tempPath);
				imageData = einkBuffer.toString("base64");

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

// Image preview endpoint
app.post("/api/preview", upload.single("image"), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: "No file uploaded" });
		}

		// Generate preview (standard RGB image)
		const previewBuffer = await sharp(req.file.path)
			.resize(575, 775, {
				// Half size for web preview
				fit: "contain",
				background: { r: 255, g: 255, b: 255, alpha: 1 },
			})
			.png()
			.toBuffer();

		// Convert to e-ink format for size estimation
		const einkBuffer = await convertImageToEink(req.file.path);

		// Clean up uploaded file
		await fs.unlink(req.file.path);

		res.json({
			success: true,
			preview: `data:image/png;base64,${previewBuffer.toString("base64")}`,
			einkSize: Math.round(einkBuffer.length / 1024), // Size in KB
			originalName: req.file.originalname,
		});
	} catch (error) {
		console.error("Error generating preview:", error);
		if (req.file?.path) {
			try {
				await fs.unlink(req.file.path);
			} catch {}
		}
		res
			.status(500)
			.json({ error: "Error generating preview: " + error.message });
	}
});

// File upload endpoint
app.post(
	"/api/upload",
	uploadLimiter,
	upload.single("image"),
	async (req, res) => {
		try {
			if (!req.file) {
				return res.status(400).json({ error: "No file uploaded" });
			}

			const { title, sleepDuration } = req.body;

			// Input validation
			const sanitizedTitle = sanitizeInput(title);
			const sleepMs = parseInt(sleepDuration) || 3600000000;

			// Convert uploaded image to e-ink format
			const einkBuffer = await convertImageToEink(req.file.path);
			const imageData = einkBuffer.toString("base64");

			const current = {
				title: sanitizedTitle || `Uploaded: ${req.file.originalname}`,
				image: imageData,
				imageId: uuidv4(),
				timestamp: Date.now(),
				sleepDuration: sleepMs,
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

		const validCommands = ["stay_awake", "force_update", "update_now"];
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
app.get("/api/logs", async (req, res) => {
	try {
		const allLogs = (await readJSONFile("logs.json")) || {};
		res.json(allLogs);
	} catch (error) {
		console.error("Error getting all logs:", error);
		res.status(500).json({ error: "Internal server error" });
	}
});

// Get all devices (for monitoring dashboard)
app.get("/api/devices", async (req, res) => {
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

// Simple, focused web interface for single display management
app.get("/", async (_req, res) => {
	// Serve the simplified UI directly embedded for now
	// TODO: In next deployment, copy simple-ui.html to container and serve from file
	try {
		const simpleUIContent = await fs.readFile(path.join(__dirname, '..', 'simple-ui.html'), 'utf8');
		res.send(simpleUIContent);
	} catch (error) {
		// Fallback to embedded HTML if file not found (for Docker container)
		console.log('simple-ui.html not found, serving embedded fallback UI');
		res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Glance Display Manager</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: #f8fafc;
            color: #1e293b;
            line-height: 1.6;
        }
        
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px 0;
            border-bottom: 2px solid #e2e8f0;
        }
        .header h1 { 
            font-size: 2rem; 
            font-weight: 700; 
            color: #0f172a; 
            margin-bottom: 8px;
        }
        .header p { 
            color: #64748b; 
            font-size: 1.1rem;
        }
        
        /* Current Display Status - Most Important */
        .current-status {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 30px;
            text-align: center;
        }
        .current-status h2 {
            font-size: 1.3rem;
            margin-bottom: 15px;
            font-weight: 600;
        }
        .current-title {
            font-size: 1.8rem;
            font-weight: 700;
            margin-bottom: 10px;
        }
        .current-meta {
            opacity: 0.9;
            font-size: 0.95rem;
        }
        
        /* ESP32 Status - Critical Info */
        .esp32-status {
            background: white;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 30px;
            border: 1px solid #e2e8f0;
        }
        .esp32-status h3 {
            font-size: 1.2rem;
            margin-bottom: 20px;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        .status-item {
            text-align: center;
            padding: 15px;
            background: #f8fafc;
            border-radius: 8px;
        }
        .status-value {
            font-size: 1.4rem;
            font-weight: 700;
            margin-bottom: 5px;
        }
        .status-label {
            color: #64748b;
            font-size: 0.9rem;
        }
        
        .status-online { color: #059669; }
        .status-offline { color: #dc2626; }
        
        /* Simple Upload Area */
        .upload-section {
            background: white;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 30px;
            border: 1px solid #e2e8f0;
        }
        .upload-section h3 {
            font-size: 1.2rem;
            margin-bottom: 20px;
            color: #0f172a;
        }
        
        .upload-area {
            border: 2px dashed #cbd5e1;
            border-radius: 8px;
            padding: 40px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
            background: #f8fafc;
        }
        .upload-area:hover {
            border-color: #3b82f6;
            background: #eff6ff;
        }
        .upload-area.dragover {
            border-color: #3b82f6;
            background: #eff6ff;
        }
        
        .upload-icon {
            font-size: 3rem;
            color: #64748b;
            margin-bottom: 15px;
        }
        .upload-text {
            font-size: 1.1rem;
            color: #475569;
            margin-bottom: 8px;
        }
        .upload-hint {
            color: #64748b;
            font-size: 0.9rem;
        }
        
        /* Quick Actions */
        .quick-actions {
            display: flex;
            gap: 15px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 12px 24px;
            border-radius: 8px;
            border: none;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.95rem;
        }
        .btn-primary {
            background: #3b82f6;
            color: white;
        }
        .btn-primary:hover {
            background: #2563eb;
        }
        .btn-secondary {
            background: #6b7280;
            color: white;
        }
        .btn-secondary:hover {
            background: #4b5563;
        }
        .btn-success {
            background: #059669;
            color: white;
        }
        .btn-success:hover {
            background: #047857;
        }
        
        /* Simple Form */
        .form-row {
            display: flex;
            gap: 15px;
            margin-top: 20px;
            align-items: end;
        }
        .form-group {
            flex: 1;
        }
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #374151;
        }
        .form-control {
            width: 100%;
            padding: 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 0.95rem;
        }
        .form-control:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        /* Queued Commands Alert */
        .commands-queue {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
        }
        .commands-queue h4 {
            color: #92400e;
            margin-bottom: 8px;
        }
        .commands-queue p {
            color: #78350f;
            margin: 0;
        }
        
        /* Hide original file input */
        #imageFile { display: none; }
        
        /* Mobile responsive */
        @media (max-width: 640px) {
            .container { padding: 15px; }
            .status-grid { grid-template-columns: 1fr; }
            .form-row { flex-direction: column; }
            .quick-actions { justify-content: center; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><i class="fas fa-display"></i> Glance Display</h1>
            <p>Manage your e-ink display</p>
        </div>
        
        <!-- Current Display Status -->
        <div class="current-status">
            <h2><i class="fas fa-image"></i> Currently Displaying</h2>
            <div id="currentTitle" class="current-title">Loading...</div>
            <div id="currentMeta" class="current-meta">Checking display status...</div>
        </div>
        
        <!-- ESP32 Status -->
        <div class="esp32-status">
            <h3><i class="fas fa-microchip"></i> ESP32 Status</h3>
            <div id="esp32Info" class="status-grid">
                <div class="status-item">
                    <div class="status-value status-offline" id="connectionStatus">
                        <i class="fas fa-circle"></i> Checking...
                    </div>
                    <div class="status-label">Connection</div>
                </div>
                <div class="status-item">
                    <div class="status-value" id="batteryLevel">--.--V</div>
                    <div class="status-label">Battery</div>
                </div>
                <div class="status-item">
                    <div class="status-value" id="nextWake">Calculating...</div>
                    <div class="status-label">Next Wake</div>
                </div>
                <div class="status-item">
                    <div class="status-value" id="signalStrength">-- dBm</div>
                    <div class="status-label">WiFi Signal</div>
                </div>
            </div>
            
            <div id="commandsQueue" class="commands-queue" style="display: none;">
                <h4><i class="fas fa-clock"></i> Queued Commands</h4>
                <p id="queuedCommandText">No commands queued</p>
            </div>
            
            <div class="quick-actions">
                <button class="btn btn-secondary" onclick="sendCommand('stay_awake')">
                    <i class="fas fa-eye"></i> Keep Awake (5min)
                </button>
                <button class="btn btn-primary" onclick="sendCommand('update_now')">
                    <i class="fas fa-sync"></i> Force Update
                </button>
            </div>
        </div>
        
        <!-- Simple Upload -->
        <div class="upload-section">
            <h3><i class="fas fa-upload"></i> Update Display</h3>
            
            <form id="uploadForm" enctype="multipart/form-data">
                <div class="upload-area" onclick="document.getElementById('imageFile').click()" 
                     ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
                    <i class="fas fa-cloud-upload-alt upload-icon"></i>
                    <div class="upload-text">Drop an image here or click to select</div>
                    <div class="upload-hint">Supports JPG, PNG, GIF, BMP, WebP (Max 10MB)</div>
                    <input type="file" id="imageFile" name="image" accept="image/*" onchange="handleFileSelect(event)">
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="displayTitle">Title (optional)</label>
                        <input type="text" id="displayTitle" class="form-control" placeholder="My awesome image">
                    </div>
                    <div class="form-group">
                        <label for="sleepDuration">Sleep Duration</label>
                        <select id="sleepDuration" class="form-control">
                            <option value="300000000">5 minutes (testing)</option>
                            <option value="1800000000">30 minutes</option>
                            <option value="3600000000" selected>1 hour</option>
                            <option value="21600000000">6 hours</option>
                            <option value="43200000000">12 hours</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-success">
                        <i class="fas fa-paper-plane"></i> Update Display
                    </button>
                </div>
            </form>
        </div>
    </div>

    <script>
        let selectedFile = null;
        let deviceData = null;
        
        // Load initial data
        async function loadStatus() {
            try {
                // Load current display info
                const currentResponse = await fetch('/api/current.json');
                const current = await currentResponse.json();
                
                document.getElementById('currentTitle').textContent = current.title || 'No content';
                const lastUpdate = current.timestamp ? new Date(current.timestamp).toLocaleString() : 'Never';
                const sleepHours = current.sleepDuration ? Math.round(current.sleepDuration / 3600000000) : 1;
                document.getElementById('currentMeta').innerHTML = 
                    \`Last updated: \${lastUpdate} • Sleep: \${sleepHours}h • \${current.image ? 'Has image' : 'No image'}\`;
                
                // Load device status
                const devicesResponse = await fetch('/api/devices');
                const devices = await devicesResponse.json();
                
                const deviceIds = Object.keys(devices);
                if (deviceIds.length > 0) {
                    deviceData = devices[deviceIds[0]]; // First device
                    updateDeviceStatus(deviceData, current);
                } else {
                    updateDeviceStatus(null, current);
                }
                
            } catch (error) {
                console.error('Error loading status:', error);
                document.getElementById('currentTitle').textContent = 'Error loading status';
                document.getElementById('currentMeta').textContent = 'Check server connection';
            }
        }
        
        function updateDeviceStatus(device, current) {
            if (!device) {
                document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-circle"></i> Not Connected';
                document.getElementById('connectionStatus').className = 'status-value status-offline';
                document.getElementById('batteryLevel').textContent = '--V';
                document.getElementById('nextWake').textContent = 'Unknown';
                document.getElementById('signalStrength').textContent = '-- dBm';
                return;
            }
            
            const now = Date.now();
            const lastSeen = device.lastSeen;
            const isOnline = now - lastSeen < 300000; // 5 minutes
            
            // Connection status
            if (isOnline) {
                document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-circle"></i> Online';
                document.getElementById('connectionStatus').className = 'status-value status-online';
            } else {
                document.getElementById('connectionStatus').innerHTML = '<i class="fas fa-circle"></i> Sleeping';
                document.getElementById('connectionStatus').className = 'status-value status-offline';
            }
            
            // Battery
            document.getElementById('batteryLevel').textContent = 
                device.batteryVoltage ? device.batteryVoltage.toFixed(2) + 'V' : '--V';
            
            // Next wake time calculation
            const sleepDuration = current.sleepDuration || 3600000000; // Default 1 hour
            const nextWakeTime = lastSeen + (sleepDuration / 1000); // Convert to milliseconds
            const timeUntilWake = nextWakeTime - now;
            
            if (isOnline) {
                document.getElementById('nextWake').textContent = 'Awake Now';
            } else if (timeUntilWake > 0) {
                const minutes = Math.round(timeUntilWake / 60000);
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                
                if (hours > 0) {
                    document.getElementById('nextWake').textContent = \`\${hours}h \${mins}m\`;
                } else {
                    document.getElementById('nextWake').textContent = \`\${mins}m\`;
                }
            } else {
                document.getElementById('nextWake').textContent = 'Overdue';
            }
            
            // Signal strength
            document.getElementById('signalStrength').textContent = 
                device.signalStrength ? device.signalStrength + ' dBm' : '-- dBm';
        }
        
        // File handling
        function handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            e.target.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect({ target: { files: files } });
            }
        }
        
        function handleDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
            e.target.classList.add('dragover');
        }
        
        function handleDragLeave(e) {
            e.preventDefault();
            e.stopPropagation();
            e.target.classList.remove('dragover');
        }
        
        function handleFileSelect(e) {
            const file = e.target.files[0];
            if (file) {
                selectedFile = file;
                const uploadArea = document.querySelector('.upload-area');
                uploadArea.innerHTML = \`
                    <i class="fas fa-check-circle upload-icon" style="color: #059669;"></i>
                    <div class="upload-text">\${file.name}</div>
                    <div class="upload-hint">Ready to upload (\${Math.round(file.size/1024)}KB)</div>
                \`;
            }
        }
        
        // Form submission
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!selectedFile) {
                alert('Please select an image first');
                return;
            }
            
            const formData = new FormData();
            formData.append('image', selectedFile);
            formData.append('title', document.getElementById('displayTitle').value || selectedFile.name);
            formData.append('sleepDuration', document.getElementById('sleepDuration').value);
            
            try {
                const button = e.target.querySelector('button[type="submit"]');
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
                button.disabled = true;
                
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    alert('Display updated successfully!');
                    
                    // Reset form
                    selectedFile = null;
                    document.getElementById('uploadForm').reset();
                    document.querySelector('.upload-area').innerHTML = \`
                        <i class="fas fa-cloud-upload-alt upload-icon"></i>
                        <div class="upload-text">Drop an image here or click to select</div>
                        <div class="upload-hint">Supports JPG, PNG, GIF, BMP, WebP (Max 10MB)</div>
                        <input type="file" id="imageFile" name="image" accept="image/*" onchange="handleFileSelect(event)">
                    \`;
                    
                    // Reload status
                    loadStatus();
                } else {
                    alert('Upload failed: ' + result.error);
                }
            } catch (error) {
                alert('Upload error: ' + error.message);
            } finally {
                const button = e.target.querySelector('button[type="submit"]');
                button.innerHTML = '<i class="fas fa-paper-plane"></i> Update Display';
                button.disabled = false;
            }
        });
        
        // Send commands to ESP32
        async function sendCommand(command) {
            if (!deviceData) {
                alert('No ESP32 device connected');
                return;
            }
            
            try {
                const response = await fetch(\`/api/device-command/esp32-001\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        command: command, 
                        duration: 300000 // 5 minutes
                    })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    const commandNames = {
                        'stay_awake': 'Keep Awake',
                        'update_now': 'Force Update'
                    };
                    
                    alert(\`\${commandNames[command]} command sent!\\n\${result.message}\`);
                    
                    // Show queued command
                    if (!result.isRecentlyActive) {
                        document.getElementById('commandsQueue').style.display = 'block';
                        document.getElementById('queuedCommandText').textContent = 
                            \`\${commandNames[command]} command queued (device sleeping)\`;
                    }
                    
                    loadStatus(); // Refresh status
                } else {
                    alert('Command failed: ' + result.error);
                }
            } catch (error) {
                alert('Command error: ' + error.message);
            }
        }
        
        // Auto-refresh every 30 seconds
        setInterval(loadStatus, 30000);
        
        // Load initial status
        loadStatus();
    </script>
</body>
</html>`);
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
