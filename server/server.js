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

// Beautiful web interface
app.get("/", (req, res) => {
	res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Glance E-Ink Display Server</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f6;
            min-height: 100vh;
            color: #333;
        }
        .container { max-width: 900px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; color: #333; margin-bottom: 30px; }
        .header h1 { font-size: 2rem; margin-bottom: 5px; }
        .header p { font-size: 1rem; opacity: 0.8; }
        .version { font-size: 0.9rem; opacity: 0.8; margin-top: 5px; }
        .card {
            background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            padding: 20px; margin-bottom: 20px;
        }
        .tabs {
            display: flex; border-bottom: 1px solid #e5e7eb; margin-bottom: 20px; overflow-x: auto;
        }
        .tab {
            padding: 10px 15px; margin-right: 15px; cursor: pointer; border-bottom: 3px solid transparent;
            color: #555; white-space: nowrap; transition: border-color 0.2s ease, color 0.2s ease;
        }
        .tab:hover { color: #000; }
        .tab.active { border-color: #3b82f6; color: #3b82f6; }
        .tab-content { display: none; }
        .tab-content.active { display: block; animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .device-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .device {
            background: #fff; border-left: 4px solid #3b82f6;
            padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .device.offline { border-color: #ef4444; }
        .device h3 { font-size: 1.2rem; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
        .device-status { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .status-indicator {
            width: 10px; height: 10px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite;
        }
        .status-indicator.offline { background: #ef4444; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #555; }
        .form-control {
            width: 100%; padding: 12px 15px; border: 2px solid #e9ecef; border-radius: 8px;
            font-size: 14px; transition: border-color 0.3s ease;
        }
        .form-control:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
        .btn {
            background: #3b82f6; color: #fff; border: none;
            padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: 600;
            transition: background 0.2s ease; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;
        }
        .btn:hover { background: #2563eb; }
        .btn-success { background: #22c55e; }
        .btn-danger { background: #ef4444; }
        .btn-secondary { background: #6b7280; }
        .logs {
            background: #f9fafb; color: #111827; font-family: 'Courier New', monospace;
            padding: 20px; border-radius: 6px; height: 400px; overflow-y: auto; border: 1px solid #e5e7eb;
        }
        .log-entry { margin-bottom: 5px; padding: 2px 0; }
        .log-error { color: #ef4444; } .log-warn { color: #f59e0b; } .log-info { color: #4ade80; }
        .upload-area {
            border: 2px dashed #3b82f6; border-radius: 8px; padding: 40px; text-align: center;
            background: #f9fafb; transition: background 0.2s ease, border-color 0.2s ease; cursor: pointer;
        }
        .upload-area:hover { border-color: #2563eb; background: #eff6ff; }
        .upload-area.dragover { border-color: #2563eb; background: #eff6ff; }
        .upload-icon { font-size: 3rem; color: #3b82f6; margin-bottom: 15px; }
        .current-display {
            background: #fff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin-bottom: 20px;
        }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: #fff; padding: 20px; border-radius: 6px; text-align: center; border: 1px solid #e5e7eb; }
        .stat-value { font-size: 2rem; font-weight: bold; color: #3b82f6; margin-bottom: 5px; }
        .stat-label { color: #666; font-size: 0.9rem; }
        @media (max-width: 768px) {
            .container { padding: 10px; } .header h1 { font-size: 2rem; }
            .tabs { flex-direction: column; } .tab { margin-bottom: 5px; }
            .device-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><i class="fas fa-display"></i> Glance E-Ink Display Server</h1>
            <p class="version">Docker Image: ${IMAGE_VERSION} (built ${BUILD_DATE_HUMAN})</p>
        </div>
        
        <div class="card">
            <div class="tabs">
                <div class="tab active" onclick="showTab('overview')"><i class="fas fa-home"></i> Overview</div>
                <div class="tab" onclick="showTab('upload')"><i class="fas fa-upload"></i> Upload Image</div>
                <div class="tab" onclick="showTab('text')"><i class="fas fa-font"></i> Text Display</div>
                <div class="tab" onclick="showTab('logs')"><i class="fas fa-list"></i> Device Logs</div>
            </div>
            
            <div id="overview" class="tab-content active">
                <div class="current-display">
                    <h3><i class="fas fa-display"></i> Current Display</h3>
                    <div id="current">Loading...</div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value" id="deviceCount">-</div>
                        <div class="stat-label">Connected Devices</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="onlineCount">-</div>
                        <div class="stat-label">Online Now</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="avgBattery">-</div>
                        <div class="stat-label">Average Battery</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="lastUpdate">-</div>
                        <div class="stat-label">Last Update</div>
                    </div>
                </div>
                
                <h3><i class="fas fa-microchip"></i> Connected Devices</h3>
                <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
                    <h4 style="margin: 0 0 10px 0; color: #495057;"><i class="fas fa-info-circle"></i> ESP32 Deep Sleep Behavior</h4>
                    <p style="margin: 0; font-size: 0.9rem; color: #6c757d;">
                        <strong>🟢 Active devices</strong> can receive commands immediately.<br>
                        <strong>🔴 Sleeping devices</strong> cannot be woken remotely - commands are queued and executed on their next scheduled wake (usually every 1-6 hours).<br>
                        <strong>Stay Awake:</strong> Prevents device from sleeping again for 5 minutes.<br>
                        <strong>Update Now:</strong> Forces content refresh on next wake cycle.
                    </p>
                </div>
                <div class="device-grid" id="devices">Loading...</div>
            </div>
            
            <div id="upload" class="tab-content">
                <h3><i class="fas fa-upload"></i> Upload Image</h3>
                <form id="uploadForm" enctype="multipart/form-data">
                    <div class="upload-area" onclick="document.getElementById('imageFile').click()" 
                         ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
                        <i class="fas fa-cloud-upload-alt upload-icon"></i>
                        <h4>Drop an image here or click to select</h4>
                        <p>Supports JPG, PNG, GIF, BMP, WebP (Max 10MB)</p>
                        <input type="file" id="imageFile" name="image" accept="image/*" style="display: none;" onchange="handleFileSelect(event)">
                    </div>
                    
                    <div id="imagePreview" style="display: none; margin: 20px 0; text-align: center;">
                        <h4>Preview</h4>
                        <img id="previewImage" style="max-width: 300px; max-height: 400px; border: 1px solid #ddd; border-radius: 8px;">
                        <p id="previewInfo" style="margin-top: 10px; color: #666;"></p>
                    </div>
                    
                    <div class="form-group">
                        <label for="uploadTitle">Display Title</label>
                        <input type="text" id="uploadTitle" name="title" class="form-control" placeholder="Enter display title">
                    </div>
                    
                    <div class="form-group">
                        <label for="uploadSleep">Sleep Duration</label>
                        <select id="uploadSleep" name="sleepDuration" class="form-control">
                            <option value="300000000">5 minutes (testing)</option>
                            <option value="1800000000">30 minutes</option>
                            <option value="3600000000" selected>1 hour</option>
                            <option value="7200000000">2 hours</option>
                            <option value="21600000000">6 hours</option>
                            <option value="43200000000">12 hours</option>
                        </select>
                    </div>
                    
                    <button type="submit" class="btn btn-success">
                        <i class="fas fa-upload"></i> Upload & Display
                    </button>
                </form>
            </div>
            
            <div id="text" class="tab-content">
                <h3><i class="fas fa-font"></i> Text Display</h3>
                <form id="textForm">
                    <div class="form-group">
                        <label for="textContent">Text to Display</label>
                        <textarea id="textContent" class="form-control" rows="4" placeholder="Enter text to display on the e-ink screen"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="textTitle">Display Title</label>
                        <input type="text" id="textTitle" class="form-control" placeholder="Enter display title">
                    </div>
                    
                    <div class="form-group">
                        <label for="textSleep">Sleep Duration</label>
                        <select id="textSleep" class="form-control">
                            <option value="300000000">5 minutes (testing)</option>
                            <option value="1800000000">30 minutes</option>
                            <option value="3600000000" selected>1 hour</option>
                            <option value="7200000000">2 hours</option>
                            <option value="21600000000">6 hours</option>
                            <option value="43200000000">12 hours</option>
                        </select>
                    </div>
                    
                    <button type="submit" class="btn btn-success">
                        <i class="fas fa-font"></i> Display Text
                    </button>
                </form>
            </div>
            
            <div id="logs" class="tab-content">
                <h3><i class="fas fa-list"></i> Device Logs</h3>
                <div class="form-group">
                    <label for="deviceSelect">Select Device</label>
                    <div style="display: flex; gap: 10px;">
                        <select id="deviceSelect" class="form-control" onchange="loadLogs()">
                            <option value="">Select a device...</option>
                        </select>
                        <button onclick="loadLogs()" class="btn btn-secondary">
                            <i class="fas fa-refresh"></i> Refresh
                        </button>
                        <button onclick="clearLogs()" class="btn btn-danger">
                            <i class="fas fa-trash"></i> Clear
                        </button>
                    </div>
                </div>
                <div id="logsContainer" class="logs">Select a device to view logs...</div>
            </div>
        </div>
    </div>

    <script>
        async function loadDevices() {
            try {
                const response = await fetch('/api/devices');
                const devices = await response.json();
                const devicesDiv = document.getElementById('devices');
                const deviceSelect = document.getElementById('deviceSelect');
                
                const deviceCount = Object.keys(devices).length;
                let onlineCount = 0, totalBattery = 0, lastUpdateTime = 0;
                
                if (deviceCount === 0) {
                    devicesDiv.innerHTML = '<p style="text-align: center; color: #666;">No devices connected yet.</p>';
                } else {
                    devicesDiv.innerHTML = Object.values(devices).map(device => {
                        const lastSeen = new Date(device.lastSeen);
                        const isOnline = Date.now() - device.lastSeen < 300000;
                        if (isOnline) onlineCount++;
                        totalBattery += device.batteryVoltage || 0;
                        if (device.lastSeen > lastUpdateTime) lastUpdateTime = device.lastSeen;
                        
                        return \`
                            <div class="device \${isOnline ? 'online' : 'offline'}">
                                <h3><i class="fas fa-microchip"></i> \${device.deviceId}
                                    <div class="status-indicator \${isOnline ? 'online' : 'offline'}"></div></h3>
                                <div style="margin-bottom: 15px; display: flex; gap: 5px; flex-wrap: wrap;">
                                    <button onclick="sendDeviceCommand('\${device.deviceId}', 'stay_awake')" class="btn" style="font-size: 11px; padding: 4px 8px;" title="Keep device awake for 5 minutes (only works if device is currently active)">
                                        <i class="fas fa-clock"></i> Stay Awake
                                    </button>
                                    <button onclick="sendDeviceCommand('\${device.deviceId}', 'update_now')" class="btn" style="font-size: 11px; padding: 4px 8px;" title="Force immediate content update on next wake">
                                        <i class="fas fa-sync"></i> Update Now
                                    </button>
                                </div>
                                <div style="font-size: 0.8rem; opacity: 0.7; margin-bottom: 10px;">
                                    \${isOnline ? '🟢 Device active - commands work immediately' : '🔴 Device asleep - commands queued for next wake'}
                                </div>
                                <div class="device-status">
                                    <span><i class="fas fa-battery-half"></i> \${device.batteryVoltage?.toFixed(2) || 'N/A'}V</span>
                                    <span><i class="fas fa-wifi"></i> \${device.signalStrength || 'N/A'}dBm</span>
                                </div>
                                <div class="device-status">
                                    <span><i class="fas fa-memory"></i> \${device.freeHeap ? Math.round(device.freeHeap/1024) + 'KB' : 'N/A'}</span>
                                    <span><i class="fas fa-boot"></i> Boot: \${device.bootCount || 'N/A'}</span>
                                </div>
                                <p style="font-size: 0.9rem; opacity: 0.8;"><i class="fas fa-clock"></i> \${lastSeen.toLocaleString()}</p>
                                <p style="font-size: 0.9rem;">Status: <strong>\${device.status || 'unknown'}</strong></p>
                            </div>\`;
                    }).join('');
                }
                
                document.getElementById('deviceCount').textContent = deviceCount;
                document.getElementById('onlineCount').textContent = onlineCount;
                document.getElementById('avgBattery').textContent = deviceCount > 0 ? (totalBattery / deviceCount).toFixed(1) + 'V' : '-';
                document.getElementById('lastUpdate').textContent = lastUpdateTime > 0 ? new Date(lastUpdateTime).toLocaleTimeString() : '-';
                
                const currentDevice = deviceSelect.value;
                deviceSelect.innerHTML = '<option value="">Select a device...</option>' +
                    Object.keys(devices).map(deviceId => 
                        \`<option value="\${deviceId}" \${deviceId === currentDevice ? 'selected' : ''}>\${deviceId}</option>\`).join('');
            } catch (error) {
                document.getElementById('devices').innerHTML = '<p style="color: red;">Error loading devices</p>';
            }
        }
        
        async function loadCurrent() {
            try {
                const response = await fetch('/api/current.json');
                const current = await response.json();
                document.getElementById('current').innerHTML = \`
                    <p><i class="fas fa-tag"></i> <strong>Title:</strong> \${current.title}</p>
                    <p><i class="fas fa-clock"></i> <strong>Last Updated:</strong> \${new Date(current.timestamp).toLocaleString()}</p>
                    <p><i class="fas fa-moon"></i> <strong>Sleep Duration:</strong> \${current.sleepDuration / 1000000} seconds</p>
                    <p><i class="fas fa-image"></i> <strong>Has Image:</strong> \${current.image ? 'Yes (' + Math.round(current.image.length/1024) + 'KB)' : 'No'}</p>\`;
            } catch (error) {
                document.getElementById('current').innerHTML = '<p style="color: #ff6b6b;">Error loading current data</p>';
            }
        }
        
        async function loadLogs() {
            const deviceId = document.getElementById('deviceSelect').value;
            const logsContainer = document.getElementById('logsContainer');
            if (!deviceId) { logsContainer.innerHTML = 'Select a device to view logs...'; return; }
            
            try {
                const response = await fetch(\`/api/logs/\${deviceId}?limit=500\`);
                const data = await response.json();
                
                if (data.logs.length === 0) { logsContainer.innerHTML = 'No logs available for this device.'; return; }
                
                logsContainer.innerHTML = data.logs.map(log => {
                    const timestamp = new Date(log.timestamp).toLocaleString();
                    const levelClass = \`log-\${log.level.toLowerCase()}\`;
                    return \`<div class="log-entry \${levelClass}">[\${timestamp}] \${log.level}: \${log.message}</div>\`;
                }).join('');
                logsContainer.scrollTop = logsContainer.scrollHeight;
            } catch (error) { logsContainer.innerHTML = 'Error loading logs: ' + error.message; }
        }
        
        function clearLogs() { document.getElementById('logsContainer').innerHTML = ''; }
        
        function showTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
        }
        
        function handleDrop(e) {
            e.preventDefault(); e.stopPropagation(); e.target.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) { 
                handleFileSelect({ target: { files: files } }); 
            }
        }
        function handleDragOver(e) { e.preventDefault(); e.stopPropagation(); e.target.classList.add('dragover'); }
        function handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); e.target.classList.remove('dragover'); }
        
        async function handleFileSelect(e) {
            const file = e.target.files[0];
            if (file) {
                const uploadArea = document.querySelector('.upload-area');
                uploadArea.innerHTML = \`<i class="fas fa-check-circle upload-icon" style="color: #22c55e;"></i>
                    <h4>\${file.name}</h4><p>File selected (\${Math.round(file.size/1024)}KB) - Generating preview...</p>
                    <input type="file" id="imageFile" name="image" accept="image/*" style="display: none;" onchange="handleFileSelect(event)">\`;
                
                // Store file reference for form submission
                const fileInput = document.getElementById('imageFile');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;
                
                // Generate preview
                try {
                    const formData = new FormData();
                    formData.append('image', file);
                    
                    const response = await fetch('/api/preview', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        document.getElementById('previewImage').src = result.preview;
                        document.getElementById('previewInfo').innerHTML = \`<strong>\${result.originalName}</strong><br>E-ink size: \${result.einkSize}KB\`;
                        document.getElementById('imagePreview').style.display = 'block';
                        
                        uploadArea.innerHTML = \`<i class="fas fa-check-circle upload-icon" style="color: #22c55e;"></i>
                            <h4>\${file.name}</h4><p>Ready to upload (\${Math.round(file.size/1024)}KB)</p>
                            <input type="file" id="imageFile" name="image" accept="image/*" style="display: none;" onchange="handleFileSelect(event)">\`;
                        
                        // Restore file reference after innerHTML change
                        const newFileInput = document.getElementById('imageFile');
                        newFileInput.files = dataTransfer.files;
                    } else {
                        throw new Error('Preview generation failed');
                    }
                } catch (error) {
                    console.error('Preview error:', error);
                    uploadArea.innerHTML = \`<i class="fas fa-check-circle upload-icon" style="color: #22c55e;"></i>
                        <h4>\${file.name}</h4><p>File selected (\${Math.round(file.size/1024)}KB) - Preview failed</p>
                        <input type="file" id="imageFile" name="image" accept="image/*" style="display: none;" onchange="handleFileSelect(event)">\`;
                    
                    // Restore file reference after innerHTML change
                    const newFileInput = document.getElementById('imageFile');
                    newFileInput.files = dataTransfer.files;
                }
            }
        }
        
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData();
            const fileInput = document.getElementById('imageFile');
            
            if (!fileInput) {
                alert('Error: File input not found. Please refresh the page and try again.');
                return;
            }
            
            const file = fileInput.files && fileInput.files[0];
            if (!file) { 
                alert('Please select an image file first.'); 
                return; 
            }
            
            formData.append('image', file);
            formData.append('title', document.getElementById('uploadTitle').value || file.name);
            formData.append('sleepDuration', document.getElementById('uploadSleep').value);
            
            try {
                const response = await fetch('/api/upload', { method: 'POST', body: formData });
                const result = await response.json();
                if (response.ok) {
                    alert('Image uploaded and processed successfully!'); 
                    loadCurrent();
                    
                    // Reset form and restore upload area
                    document.getElementById('uploadForm').reset();
                    document.getElementById('imagePreview').style.display = 'none';
                    document.querySelector('.upload-area').innerHTML = \`<i class="fas fa-cloud-upload-alt upload-icon"></i>
                        <h4>Drop an image here or click to select</h4>
                        <p>Supports JPG, PNG, GIF, BMP, WebP (Max 10MB)</p>
                        <input type="file" id="imageFile" name="image" accept="image/*" style="display: none;" onchange="handleFileSelect(event)">\`;
                } else { alert('Error uploading image: ' + result.error); }
            } catch (error) { alert('Error: ' + error.message); }
        });
        
        document.getElementById('textForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const textContent = document.getElementById('textContent').value;
            if (!textContent.trim()) { alert('Please enter some text to display.'); return; }
            
            try {
                const response = await fetch('/api/current', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: document.getElementById('textTitle').value || 'Text Display',
                        image: textContent, isText: true,
                        sleepDuration: parseInt(document.getElementById('textSleep').value)
                    })
                });
                if (response.ok) { alert('Text display updated successfully!'); loadCurrent(); document.getElementById('textForm').reset(); }
                else { alert('Error updating text display'); }
            } catch (error) { alert('Error: ' + error.message); }
        });
        
        // Settings functions
        async function clearAllDisplays() {
            if (confirm('Are you sure you want to clear all displays?')) {
                try {
                    const response = await fetch('/api/current', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: 'Display Cleared',
                            image: '',
                            sleepDuration: 3600000000
                        })
                    });
                    
                    if (response.ok) {
                        alert('All displays cleared!');
                        loadCurrent();
                    }
                } catch (error) {
                    alert('Error clearing displays: ' + error.message);
                }
            }
        }
        
        async function sendDeviceCommand(deviceId, command) {
            try {
                const response = await fetch(\`/api/device-command/\${deviceId}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command, duration: 300000 }) // 5 minutes
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    const commandNames = {
                        stay_awake: 'Stay Awake',
                        update_now: 'Update Now',
                        force_update: 'Force Update'
                    };
                    
                    alert(\`\${commandNames[command]} command: \${result.message}\`);
                    
                    // Refresh device list to update status
                    loadDevices();
                } else {
                    alert(\`Error sending command: \${result.error}\`);
                }
            } catch (error) {
                alert('Error sending command: ' + error.message);
            }
        }
        
        async function updateAllDevices() {
            if (!confirm('Send "Update Now" command to all devices? This will force content refresh on their next wake cycle.')) {
                return;
            }
            
            try {
                const response = await fetch('/api/devices');
                const devices = await response.json();
                
                const deviceIds = Object.keys(devices);
                if (deviceIds.length === 0) {
                    alert('No devices found');
                    return;
                }
                
                let successCount = 0;
                let activeCount = 0;
                
                for (const deviceId of deviceIds) {
                    try {
                        const commandResponse = await fetch(\`/api/device-command/\${deviceId}\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ command: 'update_now', duration: 300000 })
                        });
                        
                        if (commandResponse.ok) {
                            successCount++;
                            const result = await commandResponse.json();
                            if (result.isRecentlyActive) activeCount++;
                        }
                    } catch (error) {
                        console.error(\`Failed to send command to \${deviceId}:\`, error);
                    }
                }
                
                alert(\`Update commands sent to \${successCount}/\${deviceIds.length} devices\\n\` +
                      \`\${activeCount} devices are currently active and will update immediately\\n\` +
                      \`\${successCount - activeCount} devices are asleep and will update on next wake\`);
                
                // Refresh device list
                loadDevices();
            } catch (error) {
                alert('Error sending update commands: ' + error.message);
            }
        }
        
        async function exportLogs() {
            try {
                const response = await fetch('/api/logs');
                const logs = await response.json();
                
                const dataStr = JSON.stringify(logs, null, 2);
                const dataBlob = new Blob([dataStr], {type: 'application/json'});
                
                const link = document.createElement('a');
                link.href = URL.createObjectURL(dataBlob);
                link.download = 'glance-logs-' + new Date().toISOString().split('T')[0] + '.json';
                link.click();
            } catch (error) {
                alert('Error exporting logs: ' + error.message);
            }
        }
        
        loadDevices(); loadCurrent();
        setInterval(() => { loadDevices(); loadCurrent(); }, 30000);
        setInterval(() => {
            const deviceId = document.getElementById('deviceSelect').value;
            if (deviceId && document.getElementById('logs').classList.contains('active')) { loadLogs(); }
        }, 10000);
    </script>
</body>
</html>
    `);
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
