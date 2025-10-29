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

// Curated Art Collections Database
const CURATED_COLLECTIONS = {
	"renaissance-masters": {
		name: "Renaissance Masters",
		description: "Essential works from the Renaissance masters",
		artworks: [
			// Leonardo da Vinci
			{ artist: "Leonardo da Vinci", title: "Mona Lisa", year: "1503-1519", popularity: 100, wikimedia: "Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg" },
			{ artist: "Leonardo da Vinci", title: "The Last Supper", year: "1495-1498", popularity: 95, wikimedia: "The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg" },
			{ artist: "Leonardo da Vinci", title: "Vitruvian Man", year: "1490", popularity: 90, wikimedia: "Da_Vinci_Vitruve_Luc_Viatour.jpg" },
			{ artist: "Leonardo da Vinci", title: "Lady with an Ermine", year: "1489-1491", popularity: 85, wikimedia: "Leonardo_da_Vinci_046.jpg" },

			// Michelangelo
			{ artist: "Michelangelo", title: "The Creation of Adam", year: "1512", popularity: 98, wikimedia: "Michelangelo_-_Creation_of_Adam_(cropped).jpg" },
			{ artist: "Michelangelo", title: "The Last Judgment", year: "1541", popularity: 88, wikimedia: "Last_Judgement_(Michelangelo).jpg" },
			{ artist: "Michelangelo", title: "Doni Tondo", year: "1507", popularity: 70, wikimedia: "Michelangelo_-_Tondo_Doni_-_Google_Art_Project.jpg" },

			// Raphael
			{ artist: "Raphael", title: "The School of Athens", year: "1511", popularity: 92, wikimedia: "Raphael_School_of_Athens.jpg" },
			{ artist: "Raphael", title: "Sistine Madonna", year: "1512", popularity: 82, wikimedia: "Raphael_-_Sistine_Madonna_-_WGA18595.jpg" },
			{ artist: "Raphael", title: "The Transfiguration", year: "1520", popularity: 75, wikimedia: "Transfiguration_Raphael.jpg" },

			// Botticelli
			{ artist: "Botticelli", title: "The Birth of Venus", year: "1485", popularity: 93, wikimedia: "Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg" },
			{ artist: "Botticelli", title: "Primavera", year: "1482", popularity: 86, wikimedia: "Sandro_Botticelli_-_La_Primavera_-_Google_Art_Project.jpg" }
		]
	},

	"dutch-masters": {
		name: "Dutch Masters",
		description: "Golden Age of Dutch painting",
		artworks: [
			// Rembrandt
			{ artist: "Rembrandt", title: "The Night Watch", year: "1642", popularity: 94, wikimedia: "La_ronda_de_noche,_por_Rembrandt_van_Rijn.jpg" },
			{ artist: "Rembrandt", title: "Self-Portrait", year: "1659", popularity: 78, wikimedia: "Rembrandt_van_Rijn_-_Self-Portrait_-_Google_Art_Project.jpg" },
			{ artist: "Rembrandt", title: "The Anatomy Lesson", year: "1632", popularity: 76, wikimedia: "Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg" },

			// Vermeer
			{ artist: "Vermeer", title: "Girl with a Pearl Earring", year: "1665", popularity: 96, wikimedia: "Girl_with_a_Pearl_Earring.jpg" },
			{ artist: "Vermeer", title: "The Milkmaid", year: "1658", popularity: 84, wikimedia: "Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.jpg" },
			{ artist: "Vermeer", title: "View of Delft", year: "1661", popularity: 80, wikimedia: "Vermeer-view-of-delft.jpg" }
		]
	},

	"impressionists": {
		name: "Impressionists",
		description: "Light and color of the Impressionist movement",
		artworks: [
			// Monet
			{ artist: "Claude Monet", title: "Water Lilies", year: "1906", popularity: 91, wikimedia: "Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg" },
			{ artist: "Claude Monet", title: "Impression, Sunrise", year: "1872", popularity: 89, wikimedia: "Monet_-_Impression,_Sunrise.jpg" },
			{ artist: "Claude Monet", title: "Woman with a Parasol", year: "1875", popularity: 83, wikimedia: "Claude_Monet_-_Woman_with_a_Parasol_-_Madame_Monet_and_Her_Son_-_Google_Art_Project.jpg" },

			// Renoir
			{ artist: "Renoir", title: "Dance at Le Moulin de la Galette", year: "1876", popularity: 87, wikimedia: "Auguste_Renoir_-_Dance_at_Le_Moulin_de_la_Galette_-_Google_Art_Project.jpg" },
			{ artist: "Renoir", title: "Luncheon of the Boating Party", year: "1881", popularity: 82, wikimedia: "Pierre-Auguste_Renoir_-_Luncheon_of_the_Boating_Party_-_Google_Art_Project.jpg" },

			// Degas
			{ artist: "Edgar Degas", title: "The Dance Class", year: "1874", popularity: 79, wikimedia: "Edgar_Degas_-_The_Dance_Class_-_Google_Art_Project.jpg" },
			{ artist: "Edgar Degas", title: "L'Absinthe", year: "1876", popularity: 74, wikimedia: "Edgar_Degas_-_In_a_Caf%C3%A9_-_Google_Art_Project_2.jpg" }
		]
	},

	"post-impressionists": {
		name: "Post-Impressionists",
		description: "Bold expressions beyond Impressionism",
		artworks: [
			// Van Gogh
			{ artist: "Vincent van Gogh", title: "The Starry Night", year: "1889", popularity: 99, wikimedia: "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg" },
			{ artist: "Vincent van Gogh", title: "Sunflowers", year: "1888", popularity: 92, wikimedia: "Vincent_Willem_van_Gogh_128.jpg" },
			{ artist: "Vincent van Gogh", title: "Café Terrace at Night", year: "1888", popularity: 88, wikimedia: "Van_Gogh_-_Terrasse_des_Caf%C3%A9s_an_der_Place_du_Forum_in_Arles_am_Abend1.jpeg" },
			{ artist: "Vincent van Gogh", title: "Bedroom in Arles", year: "1888", popularity: 85, wikimedia: "Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg" },

			// Cézanne
			{ artist: "Paul Cézanne", title: "Mont Sainte-Victoire", year: "1887", popularity: 81, wikimedia: "Paul_C%C3%A9zanne_-_Mont_Sainte-Victoire_-_Google_Art_Project.jpg" },
			{ artist: "Paul Cézanne", title: "The Card Players", year: "1895", popularity: 77, wikimedia: "Les_Joueurs_de_cartes,_par_Paul_C%C3%A9zanne.jpg" },

			// Gauguin
			{ artist: "Paul Gauguin", title: "Where Do We Come From?", year: "1897", popularity: 80, wikimedia: "Paul_Gauguin_-_D%27ou_venons-nous.jpg" },
			{ artist: "Paul Gauguin", title: "The Yellow Christ", year: "1889", popularity: 73, wikimedia: "Paul_Gauguin_-_Le_Christ_jaune_(The_Yellow_Christ).jpg" }
		]
	},

	"japanese-masters": {
		name: "Japanese Masters",
		description: "Ukiyo-e woodblock prints",
		artworks: [
			// Hokusai
			{ artist: "Katsushika Hokusai", title: "The Great Wave off Kanagawa", year: "1831", popularity: 97, wikimedia: "Tsunami_by_hokusai_19th_century.jpg" },
			{ artist: "Katsushika Hokusai", title: "Fine Wind, Clear Morning", year: "1831", popularity: 84, wikimedia: "Red_Fuji_southern_wind_clear_morning.jpg" },
			{ artist: "Katsushika Hokusai", title: "Rainstorm Beneath the Summit", year: "1831", popularity: 78, wikimedia: "Lightnings_below_the_summit.jpg" },

			// Hiroshige
			{ artist: "Utagawa Hiroshige", title: "Plum Estate", year: "1857", popularity: 82, wikimedia: "Hiroshige,_Plum_Park_in_Kameido.jpg" },
			{ artist: "Utagawa Hiroshige", title: "Sudden Shower", year: "1857", popularity: 79, wikimedia: "Hiroshige_-_Sudden_Shower_at_the_Atake_Bridge.jpg" }
		]
	},

	"modern-icons": {
		name: "Modern Icons",
		description: "20th century masterpieces",
		artworks: [
			// Picasso
			{ artist: "Pablo Picasso", title: "Guernica", year: "1937", popularity: 94, wikimedia: "Mural_del_Gernika.jpg" },
			{ artist: "Pablo Picasso", title: "Les Demoiselles d'Avignon", year: "1907", popularity: 87, wikimedia: "Les_Demoiselles_d%27Avignon.jpg" },

			// Dalí
			{ artist: "Salvador Dalí", title: "The Persistence of Memory", year: "1931", popularity: 93, wikimedia: "The_Persistence_of_Memory.jpg" },

			// Klimt
			{ artist: "Gustav Klimt", title: "The Kiss", year: "1908", popularity: 91, wikimedia: "Gustav_Klimt_016.jpg" },
			{ artist: "Gustav Klimt", title: "Portrait of Adele Bloch-Bauer I", year: "1907", popularity: 83, wikimedia: "Gustav_Klimt_046.jpg" },

			// Munch
			{ artist: "Edvard Munch", title: "The Scream", year: "1893", popularity: 95, wikimedia: "Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg" }
		]
	}
};

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
// MUST MATCH ESP32 client palette exactly (see esp32-client/src/main.cpp:647-654)
const SPECTRA_6_PALETTE = [
	{ r: 0, g: 0, b: 0, name: "Black" },           // Pure black
	{ r: 255, g: 255, b: 255, name: "White" },     // Pure white
	{ r: 255, g: 255, b: 0, name: "Yellow" },      // Pure yellow (matches ESP32)
	{ r: 255, g: 0, b: 0, name: "Red" },           // Pure red (matches ESP32)
	{ r: 0, g: 0, b: 255, name: "Blue" },          // Pure blue (matches ESP32)
	{ r: 0, g: 255, b: 0, name: "Green" }          // Pure green (matches ESP32)
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

// Delta E 2000 - Industry standard for perceptual color difference
// More accurate than Delta E 76, especially for blues and neutrals
function deltaE2000(L1, a1, b1, L2, a2, b2) {
	const kL = 1.0, kC = 1.0, kH = 1.0;

	// Calculate chroma and hue
	const C1 = Math.sqrt(a1 * a1 + b1 * b1);
	const C2 = Math.sqrt(a2 * a2 + b2 * b2);
	const Cab = (C1 + C2) / 2;

	const G = 0.5 * (1 - Math.sqrt(Math.pow(Cab, 7) / (Math.pow(Cab, 7) + Math.pow(25, 7))));
	const a1p = a1 * (1 + G);
	const a2p = a2 * (1 + G);

	const C1p = Math.sqrt(a1p * a1p + b1 * b1);
	const C2p = Math.sqrt(a2p * a2p + b2 * b2);

	const h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
	const h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;

	const dLp = L2 - L1;
	const dCp = C2p - C1p;

	let dhp;
	if (C1p * C2p === 0) {
		dhp = 0;
	} else if (Math.abs(h2p - h1p) <= 180) {
		dhp = h2p - h1p;
	} else if (h2p - h1p > 180) {
		dhp = h2p - h1p - 360;
	} else {
		dhp = h2p - h1p + 360;
	}

	const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);

	const Lp = (L1 + L2) / 2;
	const Cp = (C1p + C2p) / 2;

	let hp;
	if (C1p * C2p === 0) {
		hp = h1p + h2p;
	} else if (Math.abs(h1p - h2p) <= 180) {
		hp = (h1p + h2p) / 2;
	} else if (h1p + h2p < 360) {
		hp = (h1p + h2p + 360) / 2;
	} else {
		hp = (h1p + h2p - 360) / 2;
	}

	const T = 1 - 0.17 * Math.cos((hp - 30) * Math.PI / 180) +
	          0.24 * Math.cos(2 * hp * Math.PI / 180) +
	          0.32 * Math.cos((3 * hp + 6) * Math.PI / 180) -
	          0.20 * Math.cos((4 * hp - 63) * Math.PI / 180);

	const dTheta = 30 * Math.exp(-Math.pow((hp - 275) / 25, 2));
	const RC = 2 * Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));
	const SL = 1 + (0.015 * Math.pow(Lp - 50, 2)) / Math.sqrt(20 + Math.pow(Lp - 50, 2));
	const SC = 1 + 0.045 * Cp;
	const SH = 1 + 0.015 * Cp * T;
	const RT = -Math.sin(2 * dTheta * Math.PI / 180) * RC;

	const dE = Math.sqrt(
		Math.pow(dLp / (kL * SL), 2) +
		Math.pow(dCp / (kC * SC), 2) +
		Math.pow(dHp / (kH * SH), 2) +
		RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
	);

	return dE;
}

// Find closest color using Delta E 2000 (CIEDE2000) - most accurate perceptual matching
function findClosestSpectraColor(r, g, b) {
	const [L1, A1, B1] = rgbToLab(r, g, b);
	let minDistance = Infinity;
	let closestColor = SPECTRA_6_PALETTE[1]; // Default to white

	for (const color of SPECTRA_6_PALETTE) {
		const [L2, A2, B2] = rgbToLab(color.r, color.g, color.b);

		// Use Delta E 2000 for industry-standard perceptual color difference
		const distance = deltaE2000(L1, A1, B1, L2, A2, B2);

		if (distance < minDistance) {
			minDistance = distance;
			closestColor = color;
		}
	}

	return closestColor;
}

// Boost saturation to compensate for limited e-ink color palette
// This makes colors more vibrant before quantization to the 6-color palette
function boostSaturation(imageData, boostFactor = 1.3) {
	console.log(`Boosting saturation by ${boostFactor}x for more vibrant colors...`);
	const boostedData = new Uint8ClampedArray(imageData);

	for (let i = 0; i < boostedData.length; i += 3) {
		const r = boostedData[i] / 255;
		const g = boostedData[i + 1] / 255;
		const b = boostedData[i + 2] / 255;

		// Convert RGB to HSL
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;

		if (max !== min) {
			const d = max - min;
			let s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

			// Calculate hue
			let h;
			if (max === r) {
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
			} else if (max === g) {
				h = ((b - r) / d + 2) / 6;
			} else {
				h = ((r - g) / d + 4) / 6;
			}

			// Boost saturation
			s = Math.min(1, s * boostFactor);

			// Convert HSL back to RGB
			const hue2rgb = (p, q, t) => {
				if (t < 0) t += 1;
				if (t > 1) t -= 1;
				if (t < 1/6) return p + (q - p) * 6 * t;
				if (t < 1/2) return q;
				if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
				return p;
			};

			let newR, newG, newB;
			if (s === 0) {
				newR = newG = newB = l;
			} else {
				const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
				const p = 2 * l - q;
				newR = hue2rgb(p, q, h + 1/3);
				newG = hue2rgb(p, q, h);
				newB = hue2rgb(p, q, h - 1/3);
			}

			boostedData[i] = Math.round(newR * 255);
			boostedData[i + 1] = Math.round(newG * 255);
			boostedData[i + 2] = Math.round(newB * 255);
		}
	}

	return boostedData;
}

// Art-optimized dithering algorithms for E Ink Spectra 6
function applyDithering(imageData, width, height, algorithm = 'floyd-steinberg', saturationBoost = 1.3) {
	console.log(`Applying ${algorithm} dithering for art reproduction...`);

	// Apply saturation boost before dithering for more vibrant colors
	let ditheredData = saturationBoost > 1.0 ? boostSaturation(imageData, saturationBoost) : new Uint8ClampedArray(imageData);
	
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
	
	// Serpentine scanning: alternate direction each row to reduce artifacts
	for (let y = 0; y < height; y++) {
		const isRightToLeft = y % 2 === 1;
		const xStart = isRightToLeft ? width - 1 : 0;
		const xEnd = isRightToLeft ? -1 : width;
		const xStep = isRightToLeft ? -1 : 1;

		for (let x = xStart; x !== xEnd; x += xStep) {
			const idx = (y * width + x) * 3;
			const oldR = ditheredData[idx];
			const oldG = ditheredData[idx + 1];
			const oldB = ditheredData[idx + 2];

			// Find closest color in Spectra 6 palette using Delta E 2000
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

			// Apply error diffusion pattern based on algorithm (adjusted for scan direction)
			const dir = xStep; // 1 for left-to-right, -1 for right-to-left
			if (algorithm === 'floyd-steinberg') {
				// Floyd-Steinberg pattern (adjusted for serpentine scanning)
				distributeError(x, y, errR, errG, errB, dir, 0, 7/16);      // Forward
				distributeError(x, y, errR, errG, errB, -dir, 1, 3/16);     // Back-diagonal
				distributeError(x, y, errR, errG, errB, 0, 1, 5/16);        // Below
				distributeError(x, y, errR, errG, errB, dir, 1, 1/16);      // Forward-diagonal
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
			// Enhance contrast for better e-ink reproduction (boosted to 1.25 for more punch)
			sharpPipeline = sharpPipeline.linear(1.25, -(128 * 0.25));
		}
		
		if (sharpen) {
			// Sharpen for line art and detailed artwork
			sharpPipeline = sharpPipeline.sharpen();
		}
		
		// Convert to raw RGB with explicit 3 channels
		// Remove alpha channel if present
		const { data: imageBuffer, info } = await sharpPipeline
			.removeAlpha()
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
			hasImage: !!(current.image || current.imageId),
			title: current.title || "Glance Display",
			imageId: current.imageId || "default",
			timestamp: current.timestamp || Date.now(),
			sleepDuration: current.sleepDuration || 3600000000,
			rotation: current.rotation || 0
		};

		console.log(`Serving metadata: hasImage=${metadata.hasImage}, imageId=${metadata.imageId}, sleep=${metadata.sleepDuration}us`);
		addDeviceLog(`Device fetched image metadata: ${metadata.imageId} (sleep: ${Math.round(metadata.sleepDuration/60000000)}min)`);
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
				const rgbBuffer = await convertImageToRGB(tempPath, 0, 1200, 1600);
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
		const ditheredRgbBuffer = await convertImageToRGB(req.file.path, 0, 1200, 1600, {
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

// Upload and set as current image endpoint
app.post("/api/upload", upload.single("image"), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: "No file uploaded" });
		}

		console.log(`Uploading image: ${req.file.originalname}`);

		const imageId = uuidv4();
		const timestamp = Date.now();

		// Read original image file
		const originalImageBuffer = await fs.readFile(req.file.path);

		// Process image for e-ink display
		const ditheredRgbBuffer = await convertImageToRGB(req.file.path, 0, 1200, 1600, {
			ditherAlgorithm: 'floyd-steinberg',
			enhanceContrast: true,
			sharpen: false
		});

		// Create thumbnail for web preview (300x400)
		const thumbnailBuffer = await sharp(originalImageBuffer)
			.resize(300, 400, { fit: "inside" })
			.png()
			.toBuffer();

		// Encode as base64
		const imageBase64 = ditheredRgbBuffer.toString("base64");
		const originalImageBase64 = originalImageBuffer.toString("base64");
		const thumbnailBase64 = thumbnailBuffer.toString("base64");

		// Get default sleep duration from settings
		const settings = (await readJSONFile("settings.json")) || { defaultSleepDuration: 3600000000 };

		// Create current.json entry
		const current = {
			title: `Uploaded: ${req.file.originalname}`,
			image: imageBase64,
			originalImage: originalImageBase64,
			originalImageMime: req.file.mimetype,
			imageId: imageId,
			timestamp: timestamp,
			sleepDuration: settings.defaultSleepDuration,
			rotation: 0,
			aiGenerated: false,
			uploadedFilename: req.file.originalname
		};

		await writeJSONFile("current.json", current);

		// Store in images archive for history (metadata only, not full RGB data)
		const imagesArchive = (await readJSONFile("images.json")) || {};
		imagesArchive[imageId] = {
			title: current.title,
			imageId: imageId,
			timestamp: timestamp,
			sleepDuration: current.sleepDuration,
			rotation: current.rotation,
			originalImage: originalImageBase64, // Keep original for preview
			originalImageMime: req.file.mimetype,
			thumbnail: thumbnailBase64,
			aiGenerated: false,
			uploadedFilename: req.file.originalname
			// Note: We don't store the large 'image' (processed RGB) field to prevent JSON size issues
		};
		await writeJSONFile("images.json", imagesArchive);

		// Add to history (metadata + thumbnail)
		const history = (await readJSONFile("history.json")) || [];
		history.unshift({
			imageId: imageId,
			title: current.title,
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

		console.log(`Image uploaded successfully: ${imageId}`);
		addDeviceLog(`New image uploaded: "${req.file.originalname}"`);

		res.json({
			success: true,
			imageId: imageId,
			title: current.title
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

		// Store metadata in images archive (not full RGB data to prevent JSON size issues)
		const imagesArchive = (await readJSONFile("images.json")) || {};
		imagesArchive[imageId] = {
			title: current.title,
			imageId: imageId,
			timestamp: current.timestamp,
			sleepDuration: current.sleepDuration,
			rotation: current.rotation,
			originalImage: originalImageBase64,
			originalImageMime: "image/png",
			thumbnail: originalImageBase64,
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
		addDeviceLog(`New AI art generated: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}" (${artStyle} style)`);

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
			const rgbBuffer = await convertImageToRGB(req.file.path, rotationDegrees, 1200, 1600);
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

		const logMessage = `Device ${deviceId} reported: Battery ${status.batteryVoltage}V, Signal ${status.signalStrength}dBm, Status: ${status.status}`;
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
		const deviceId = process.env.DEVICE_ID || "esp32-001";
		const deviceStatus = devices[deviceId];

		if (!deviceStatus) {
			return res.json({
				state: 'offline',
				batteryVoltage: null,
				signalStrength: null,
				lastSeen: null
			});
		}

		// Consider device online if seen in last 5 minutes
		const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
		const isOnline = deviceStatus.lastSeen > fiveMinutesAgo;

		res.json({
			state: isOnline ? 'online' : 'offline',
			batteryVoltage: deviceStatus.batteryVoltage,
			signalStrength: deviceStatus.signalStrength,
			lastSeen: deviceStatus.lastSeen,
			freeHeap: deviceStatus.freeHeap,
			status: deviceStatus.status
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

		// Get image data from images archive
		const imagesArchive = (await readJSONFile("images.json")) || {};
		let imageData = imagesArchive[imageId];

		if (!imageData) {
			return res.status(404).json({ error: "Image not found in archive" });
		}

		// If the archived image doesn't have processed RGB data, regenerate it
		if (!imageData.image && imageData.originalImage) {
			console.log(`Regenerating processed image for ${imageId}...`);

			// Save original to temp file
			const originalBuffer = Buffer.from(imageData.originalImage, 'base64');
			const tempPath = path.join(UPLOAD_DIR, `reload-${Date.now()}.png`);
			await ensureDir(UPLOAD_DIR);
			await fs.writeFile(tempPath, originalBuffer);

			// Regenerate RGB data
			const rgbBuffer = await convertImageToRGB(
				tempPath,
				imageData.rotation || 0,
				1200,
				1600,
				{
					ditherAlgorithm: 'floyd-steinberg',
					enhanceContrast: true,
					sharpen: false
				}
			);

			// Add processed image to data
			imageData = {
				...imageData,
				image: rgbBuffer.toString("base64")
			};

			// Clean up temp file
			await fs.unlink(tempPath);
		}

		// Set this image as current
		await writeJSONFile("current.json", imageData);
		console.log(`Loaded image ${imageId} from history: ${imageData.title}`);
		addDeviceLog(`Applied image from history: "${imageData.title || imageId}"`);

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
						// Relax public domain requirement - museums often can't digitize copyrighted works,
						// but we want to show quality reproductions and photos of famous paintings
						const hasImage = objectData.primaryImage;
						const isArtDept = artDepartments.includes(objectData.department);

						// Prefer public domain, but allow copyrighted works from major art departments
						const isPublicOrMuseumQuality = objectData.isPublicDomain || isArtDept;

						// Also check if it's an original artwork (not photo/reproduction)
						const isOriginal = isOriginalArtwork(
							objectData.title,
							objectData.classification,
							objectData.objectName,
							objectData.medium
						);

						if (hasImage && isPublicOrMuseumQuality && isArtDept && isOriginal) {
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
						// Require image and department, but relax public domain requirement
						if (!artwork.image_id || !artwork.department_title) {
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

		// Helper to search Wikimedia Commons
		const searchWikimedia = async () => {
			const cacheKey = `wikimedia-${query}-${targetCount}`;
			const cached = getCachedResult(cacheKey);
			if (cached) return cached;

			try {
				// Map common artist names to Wikimedia categories
				const artistCategories = {
					'picasso': 'Paintings_by_Pablo_Picasso',
					'pablo picasso': 'Paintings_by_Pablo_Picasso',
					'da vinci': 'Paintings_by_Leonardo_da_Vinci',
					'leonardo da vinci': 'Paintings_by_Leonardo_da_Vinci',
					'monet': 'Paintings_by_Claude_Monet',
					'claude monet': 'Paintings_by_Claude_Monet',
					'van gogh': 'Paintings_by_Vincent_van_Gogh',
					'vincent van gogh': 'Paintings_by_Vincent_van_Gogh',
					'rembrandt': 'Paintings_by_Rembrandt',
					'matisse': 'Paintings_by_Henri_Matisse',
					'kandinsky': 'Paintings_by_Wassily_Kandinsky'
				};

				const lowerQuery = (query || "").toLowerCase();
				let category = artistCategories[lowerQuery];

				// If not a known artist, try general painting search
				if (!category) {
					category = `${query}_paintings`.replace(/ /g, '_');
				}

				const wikimediaUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:${encodeURIComponent(category)}&gcmlimit=${targetCount * 2}&gcmtype=file&prop=imageinfo|categories&iiprop=url|extmetadata|size&iiurlwidth=400&format=json&origin=*`;
				console.log(`Searching Wikimedia Commons: Category:${category}`);

				const wikimediaResponse = await fetch(wikimediaUrl);

				const contentType = wikimediaResponse.headers.get("content-type");
				if (!contentType || !contentType.includes("application/json")) {
					console.error("Wikimedia API returned non-JSON response");
					return [];
				}

				const wikimediaData = await wikimediaResponse.json();

				if (!wikimediaData.query || !wikimediaData.query.pages) {
					console.log(`Wikimedia: No results for Category:${category}`);
					return [];
				}

				const pages = Object.values(wikimediaData.query.pages);
				const wikimediaArtworks = [];

				for (const page of pages) {
					if (wikimediaArtworks.length >= targetCount) break;

					if (!page.imageinfo || !page.imageinfo[0]) continue;

					const info = page.imageinfo[0];
					const metadata = info.extmetadata || {};

					// Extract artist and title from metadata
					const artist = metadata.Artist?.value?.replace(/<[^>]*>/g, '') || "Unknown Artist";
					const title = page.title?.replace(/^File:/, '').replace(/\.[^.]+$/, '') || "Untitled";

					// Filter out very small images (likely thumbnails or icons)
					if (info.width < 500 || info.height < 500) continue;

					// Apply original artwork filter
					const isOriginal = isOriginalArtwork(
						title,
						"",
						"",
						""
					);

					if (isOriginal && info.url) {
						wikimediaArtworks.push({
							id: `wikimedia-${page.pageid}`,
							title: title,
							artist: artist,
							date: metadata.DateTimeOriginal?.value || "",
							imageUrl: info.url,
							thumbnailUrl: info.thumburl || info.url,
							department: "Paintings",
							culture: "",
							source: "Wikimedia Commons"
						});
					}
				}

				console.log(`Wikimedia Commons returned ${wikimediaArtworks.length} artworks`);
				setCachedResult(cacheKey, wikimediaArtworks);
				return wikimediaArtworks;
			} catch (error) {
				console.error("Error searching Wikimedia Commons:", error.message);
				return [];
			}
		};

		// Search all sources in parallel
		const [metResults, articResults, cmaResults, rijksResults, wikimediaResults] = await Promise.all([
			searchMet(),
			searchArtic(),
			searchCleveland(),
			searchRijksmuseum(),
			searchWikimedia()
		]);

		// Track source status for user feedback
		const sources = {
			met: { status: metResults.length > 0 ? "ok" : "no_results", count: metResults.length },
			artic: { status: articResults.length > 0 ? "ok" : "no_results", count: articResults.length },
			cleveland: { status: cmaResults.length > 0 ? "ok" : "no_results", count: cmaResults.length },
			rijksmuseum: { status: rijksResults.length > 0 ? "ok" : "no_results", count: rijksResults.length },
			wikimedia: { status: wikimediaResults.length > 0 ? "ok" : "no_results", count: wikimediaResults.length }
		};

		// Ranking function to score artworks
		const scoreArtwork = (artwork) => {
			let score = 0;

			// Curated artworks get highest priority (popularity score + 1000 boost)
			if (artwork._curatedScore !== undefined) {
				return 1000 + artwork._curatedScore;
			}

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

		// Search curated collections database
		const curatedResults = [];
		const lowerQuery = (query || "").toLowerCase();

		// Search across all curated collections
		for (const [collectionId, collection] of Object.entries(CURATED_COLLECTIONS)) {
			for (const artwork of collection.artworks) {
				const lowerArtist = artwork.artist.toLowerCase();
				const lowerTitle = artwork.title.toLowerCase();

				// Match by artist name or artwork title
				if (lowerArtist.includes(lowerQuery) ||
				    lowerTitle.includes(lowerQuery) ||
				    lowerQuery.includes(lowerTitle)) {

					const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${artwork.wikimedia}?width=1200`;
					curatedResults.push({
						title: `${artwork.title} (${artwork.year})`,
						artist: artwork.artist,
						imageUrl: imageUrl,
						thumbnail: imageUrl,
						source: "curated",
						collection: collection.name,
						year: artwork.year,
						popularity: artwork.popularity,
						_curatedScore: artwork.popularity
					});
				}
			}
		}

		if (curatedResults.length > 0) {
			console.log(`Found ${curatedResults.length} curated artworks matching "${query}"`);
		}

		// Merge all results
		const allResults = [
			...curatedResults, // Curated results first
			...metResults,
			...articResults,
			...cmaResults,
			...rijksResults,
			...wikimediaResults
		];

		// Sort by score (highest first), then interleave by source for diversity
		allResults.forEach(artwork => {
			artwork._score = scoreArtwork(artwork);
		});

		allResults.sort((a, b) => b._score - a._score);

		// Remove internal scoring fields from output
		allResults.forEach(artwork => {
			delete artwork._score;
			delete artwork._curatedScore;
		});

		// Apply offset and limit to sorted results
		const paginatedResults = allResults.slice(offset, offset + targetCount);

		console.log(`Returning ${paginatedResults.length} artworks (Met: ${metResults.length}, ARTIC: ${articResults.length}, CMA: ${cmaResults.length}, Rijks: ${rijksResults.length}, Wikimedia: ${wikimediaResults.length})`);

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
		const { imageUrl, title, artist, source, rotation } = req.body;

		if (!imageUrl) {
			return res.status(400).json({ error: "Image URL required" });
		}

		const rotationDegrees = rotation || 0;
		console.log(`Importing artwork: ${title} from ${imageUrl} (rotation: ${rotationDegrees}°)`);

		// Fetch the image
		const imageResponse = await fetch(imageUrl);
		if (!imageResponse.ok) {
			return res.status(400).json({ error: "Failed to fetch image" });
		}

		const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

		// Save to temporary file
		const tempPath = path.join(UPLOAD_DIR, `temp-${Date.now()}.jpg`);
		await fs.writeFile(tempPath, imageBuffer);

		// Determine dimensions based on rotation
		const targetWidth = (rotationDegrees === 90 || rotationDegrees === 270) ? 1600 : 1200;
		const targetHeight = (rotationDegrees === 90 || rotationDegrees === 270) ? 1200 : 1600;

		// Process image with Sharp (resize and dither for e-ink)
		// convertImageToRGB(imagePath, rotation, targetWidth, targetHeight, options)
		const ditheredRgbBuffer = await convertImageToRGB(
			tempPath,
			rotationDegrees,
			targetWidth,
			targetHeight,
			{
				ditherAlgorithm: 'floyd-steinberg',
				enhanceContrast: true,
				sharpen: false
			}
		);

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

		// Create current.json with the artwork
		const currentData = {
			title: title || "Artwork",
			artist: artist || "Unknown",
			source: source || "external",
			imageId: imageId,
			image: ditheredRgbBuffer.toString("base64"),
			timestamp: Date.now(),
			sleepDuration: 3600000000, // 1 hour
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

// System information API
const serverLogs = [];
const deviceLogs = [];
const MAX_LOGS = 100;

// Helper to add device log
function addDeviceLog(message) {
	deviceLogs.push(`[${new Date().toISOString()}] ${message}`);
	if (deviceLogs.length > MAX_LOGS) deviceLogs.shift();
}

// Capture console output
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
	const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
	serverLogs.push(`[${new Date().toISOString()}] LOG: ${message}`);
	if (serverLogs.length > MAX_LOGS) serverLogs.shift();
	originalLog.apply(console, args);
};

console.error = function(...args) {
	const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
	serverLogs.push(`[${new Date().toISOString()}] ERROR: ${message}`);
	if (serverLogs.length > MAX_LOGS) serverLogs.shift();
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

app.get("/api/logs", (_req, res) => {
	res.json({ logs: serverLogs });
});

app.get("/api/device-logs", (_req, res) => {
	res.json({ logs: deviceLogs });
});

// Time endpoint for ESP32 clock alignment
app.get("/api/time", (_req, res) => {
	res.json({
		epoch: Date.now(), // Current time in milliseconds since Unix epoch
		iso: new Date().toISOString()
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

	res.json({ ip: cleanIp });
});

// Settings endpoints
app.get("/api/settings", async (_req, res) => {
	try {
		const settings = (await readJSONFile("settings.json")) || {
			defaultSleepDuration: 3600000000, // 1 hour in microseconds
			devMode: true, // Dev mode enabled by default
			devServerHost: "host.local:3000" // Placeholder, will be replaced by ESP32
		};
		res.json(settings);
	} catch (error) {
		console.error("Error reading settings:", error);
		res.status(500).json({ error: "Failed to read settings" });
	}
});

app.put("/api/settings", async (req, res) => {
	try {
		const { defaultSleepDuration, devMode, devServerHost } = req.body;

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

		console.log(`Settings updated: sleep=${existingSettings.defaultSleepDuration}µs, devMode=${existingSettings.devMode}`);
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
