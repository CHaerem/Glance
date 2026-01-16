#!/usr/bin/env node

/**
 * Sync Art Library Script
 *
 * Downloads artworks from WikiArt based on the manifest.
 * Run on Pi: node scripts/sync-art-library.js
 *
 * Usage:
 *   npm run sync:art                    # Download all movements
 *   npm run sync:art -- --movement=pop-art  # Download specific movement
 *   npm run sync:art -- --limit=50      # Limit artworks per artist
 *   npm run sync:art -- --dry-run       # Show what would be downloaded
 *   npm run sync:art -- --artist=andy-warhol  # Download specific artist only
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

// Paths
const MANIFEST_PATH = path.join(__dirname, '../data/art-manifest.json');
const LIBRARY_PATH = path.join(__dirname, '../data/art-library');
const INDEX_PATH = path.join(LIBRARY_PATH, 'index.json');

// Config
const RATE_LIMIT_MS = 2000; // 2 seconds between requests (be respectful)
const MAX_RETRIES = 3;
const TARGET_WIDTH = 1200; // E-ink optimized
const TARGET_HEIGHT = 1600;
const THUMB_SIZE = 400;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    movement: null,
    artist: null,
    limit: 100,
    dryRun: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--movement=')) {
      args.movement = arg.split('=')[1];
    } else if (arg.startsWith('--artist=')) {
      args.artist = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      args.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch URL with retries
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GlanceArtLibrary/1.0; personal art display)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`${colors.yellow}  Retry ${i + 1}/${retries}...${colors.reset}`);
      await sleep(RATE_LIMIT_MS * (i + 1)); // Exponential backoff
    }
  }
}

/**
 * Download image to file
 */
async function downloadImage(url, filePath) {
  const response = await fetchWithRetry(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  return buffer.length;
}

/**
 * Fetch artist's artwork list from WikiArt
 */
async function fetchArtistArtworks(artistSlug) {
  // WikiArt has a JSON endpoint for artist works
  const url = `https://www.wikiart.org/en/${artistSlug}/mode/all-paintings?json=2`;

  try {
    const response = await fetchWithRetry(url);
    const text = await response.text();

    // WikiArt returns JSON object with Paintings array
    const data = JSON.parse(text);

    // Handle both old format (array) and new format (object with Paintings)
    const artworks = Array.isArray(data) ? data : (data.Paintings || []);

    return artworks.map(artwork => ({
      id: artwork.id || artwork.contentId,
      title: artwork.title || 'Untitled',
      year: artwork.year || artwork.completitionYear || '',
      imageUrl: artwork.image,
      artistName: artwork.artistName,
      width: artwork.width,
      height: artwork.height,
    }));
  } catch (error) {
    console.log(`${colors.yellow}  Warning: Could not fetch artworks for ${artistSlug}: ${error.message}${colors.reset}`);
    return [];
  }
}

/**
 * Get optimal image URL from WikiArt
 */
function getOptimizedImageUrl(imageUrl) {
  if (!imageUrl) return null;

  // WikiArt images can be resized by modifying the URL
  // Replace the size in the URL path
  // Example: /images/some-path/image.jpg!Large.jpg -> /images/some-path/image.jpg

  // Remove size suffix if present
  let cleanUrl = imageUrl.replace(/!.*\.(jpg|png|jpeg)$/i, '.$1');

  // Ensure HTTPS
  if (cleanUrl.startsWith('//')) {
    cleanUrl = 'https:' + cleanUrl;
  } else if (cleanUrl.startsWith('http://')) {
    cleanUrl = cleanUrl.replace('http://', 'https://');
  }

  return cleanUrl;
}

/**
 * Create safe filename from title
 */
function safeFilename(title, artistSlug, id) {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  return `${artistSlug}-${safe}-${id}`;
}

/**
 * Load existing index or create new one
 */
async function loadIndex() {
  try {
    const data = await fs.readFile(INDEX_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      lastSync: null,
      totalArtworks: 0,
      byMovement: {},
      artworks: [],
    };
  }
}

/**
 * Save index to file
 */
async function saveIndex(index) {
  index.lastSync = new Date().toISOString();
  index.totalArtworks = index.artworks.length;

  // Count by movement
  index.byMovement = {};
  for (const artwork of index.artworks) {
    const mov = artwork.movement || 'unknown';
    index.byMovement[mov] = (index.byMovement[mov] || 0) + 1;
  }

  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
}

/**
 * Process a single artist
 */
async function processArtist(artistSlug, movement, args, index, stats) {
  console.log(`\n${colors.cyan}  Artist: ${artistSlug}${colors.reset}`);

  // Check how many we already have
  const existingIds = new Set(
    index.artworks
      .filter(a => a.artist.toLowerCase().includes(artistSlug.replace(/-/g, ' ')))
      .map(a => a.sourceId)
  );

  // Fetch artist's artworks
  await sleep(RATE_LIMIT_MS);
  const artworks = await fetchArtistArtworks(artistSlug);

  if (artworks.length === 0) {
    console.log(`${colors.dim}    No artworks found${colors.reset}`);
    return;
  }

  console.log(`${colors.dim}    Found ${artworks.length} artworks${colors.reset}`);

  // Filter and limit
  const toDownload = artworks
    .filter(a => a.imageUrl && !existingIds.has(String(a.id)))
    .slice(0, args.limit);

  if (toDownload.length === 0) {
    console.log(`${colors.dim}    All artworks already downloaded${colors.reset}`);
    return;
  }

  console.log(`${colors.dim}    Downloading ${toDownload.length} new artworks...${colors.reset}`);

  for (const artwork of toDownload) {
    stats.processed++;

    const imageUrl = getOptimizedImageUrl(artwork.imageUrl);
    if (!imageUrl) {
      stats.skipped++;
      continue;
    }

    const filename = safeFilename(artwork.title, artistSlug, artwork.id);
    const imagePath = path.join(LIBRARY_PATH, movement.id, `${filename}.jpg`);
    const thumbPath = path.join(LIBRARY_PATH, movement.id, 'thumbs', `${filename}.jpg`);

    if (args.dryRun) {
      console.log(`${colors.dim}    [DRY RUN] Would download: ${artwork.title}${colors.reset}`);
      stats.downloaded++;
      continue;
    }

    try {
      // Rate limit
      await sleep(RATE_LIMIT_MS);

      // Download main image
      const fileSize = await downloadImage(imageUrl, imagePath);

      // For thumbnails, we'd ideally resize, but for now we'll use the same image
      // The frontend can handle displaying at thumbnail size
      await fs.mkdir(path.dirname(thumbPath), { recursive: true });
      await fs.copyFile(imagePath, thumbPath);

      // Add to index
      index.artworks.push({
        id: `local-wikiart-${artwork.id}`,
        sourceId: String(artwork.id),
        title: artwork.title,
        artist: artwork.artistName || artistSlug.replace(/-/g, ' '),
        year: String(artwork.year || ''),
        movement: movement.id,
        filename: `${movement.id}/${filename}.jpg`,
        thumbnailFilename: `${movement.id}/thumbs/${filename}.jpg`,
        sourceUrl: `https://www.wikiart.org/en/${artistSlug}/${filename}`,
        fileSize,
        downloadedAt: new Date().toISOString(),
      });

      stats.downloaded++;
      process.stdout.write(`${colors.green}.${colors.reset}`);

    } catch (error) {
      stats.errors++;
      console.log(`\n${colors.red}    Error downloading ${artwork.title}: ${error.message}${colors.reset}`);
    }
  }

  console.log(''); // New line after dots
}

/**
 * Main sync function
 */
async function main() {
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}  Glance Art Library Sync${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  const args = parseArgs();

  if (args.dryRun) {
    console.log(`${colors.yellow}DRY RUN MODE - No files will be downloaded${colors.reset}\n`);
  }

  // Load manifest
  console.log('Loading manifest...');
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf-8'));
  console.log(`  ${manifest.movements.length} movements configured`);

  // Load existing index
  const index = await loadIndex();
  console.log(`  ${index.artworks.length} artworks already in library`);

  // Filter movements if specified
  let movements = manifest.movements;
  if (args.movement) {
    movements = movements.filter(m => m.id === args.movement);
    if (movements.length === 0) {
      console.error(`${colors.red}Movement not found: ${args.movement}${colors.reset}`);
      console.log('Available movements:', manifest.movements.map(m => m.id).join(', '));
      process.exit(1);
    }
  }

  // Stats
  const stats = {
    processed: 0,
    downloaded: 0,
    skipped: 0,
    errors: 0,
  };

  // Process each movement
  for (const movement of movements) {
    console.log(`\n${colors.cyan}━━━ ${movement.name} (${movement.period}) ━━━${colors.reset}`);

    // Ensure movement directory exists
    await fs.mkdir(path.join(LIBRARY_PATH, movement.id, 'thumbs'), { recursive: true });

    // Filter artists if specified
    let artists = movement.artists;
    if (args.artist) {
      artists = artists.filter(a => a === args.artist);
      if (artists.length === 0) {
        console.log(`${colors.yellow}  Artist ${args.artist} not in this movement${colors.reset}`);
        continue;
      }
    }

    // Process each artist
    for (const artistSlug of artists) {
      await processArtist(artistSlug, movement, args, index, stats);

      // Save index periodically (every 10 downloads)
      if (stats.downloaded > 0 && stats.downloaded % 10 === 0 && !args.dryRun) {
        await saveIndex(index);
      }
    }
  }

  // Save final index
  if (!args.dryRun) {
    await saveIndex(index);
  }

  // Report
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}  Sync Complete${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`  Processed: ${stats.processed}`);
  console.log(`  Downloaded: ${colors.green}${stats.downloaded}${colors.reset}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Errors: ${stats.errors > 0 ? colors.red : ''}${stats.errors}${colors.reset}`);
  console.log(`  Total in library: ${index.artworks.length}`);
  console.log('');

  if (args.dryRun) {
    console.log(`${colors.yellow}This was a dry run. Run without --dry-run to download.${colors.reset}\n`);
  }
}

// Run
main().catch(error => {
  console.error(`\n${colors.red}Fatal error: ${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});
