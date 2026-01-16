#!/usr/bin/env node

/**
 * Sync Art Library from Wikidata
 *
 * Downloads artworks from Wikidata/Wikimedia Commons using SPARQL queries.
 * This is a legitimate API approach with ~1 million paintings available.
 *
 * Usage:
 *   npm run sync:wikidata                     # Download all movements
 *   npm run sync:wikidata -- --movement=pop-art   # Specific movement
 *   npm run sync:wikidata -- --limit=100      # Limit per movement
 *   npm run sync:wikidata -- --dry-run        # Preview only
 *   npm run sync:wikidata -- --famous-only    # Only famous artworks (Wikipedia articles)
 */

const fs = require('fs').promises;
const path = require('path');

// Paths
const LIBRARY_PATH = path.join(__dirname, '../data/art-library');
const INDEX_PATH = path.join(LIBRARY_PATH, 'index.json');

// Wikidata SPARQL endpoint
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';

// Config
const RATE_LIMIT_MS = 3000; // 3 seconds between requests (be respectful to Wikimedia)
const MAX_RETRIES = 5;
const USER_AGENT = 'GlanceArtLibrary/1.0 (https://github.com/your-repo; personal art display project)';

// Art movements with their Wikidata Q-numbers
const ART_MOVEMENTS = {
  // Renaissance & Early Modern
  'renaissance': { qid: 'Q4692', name: 'Renaissance', period: '14th-17th century' },
  'baroque': { qid: 'Q37853', name: 'Baroque', period: '17th-18th century' },
  'rococo': { qid: 'Q122960', name: 'Rococo', period: '18th century' },
  'neoclassicism': { qid: 'Q14378', name: 'Neoclassicism', period: '18th-19th century' },

  // 19th Century
  'romanticism': { qid: 'Q37068', name: 'Romanticism', period: '19th century' },
  'realism': { qid: 'Q10857409', name: 'Realism', period: '19th century' },
  'impressionism': { qid: 'Q40415', name: 'Impressionism', period: '1860s-1880s' },
  'post-impressionism': { qid: 'Q134741', name: 'Post-Impressionism', period: '1880s-1910s' },
  'symbolism': { qid: 'Q186030', name: 'Symbolism', period: '1880s-1910s' },
  'art-nouveau': { qid: 'Q34636', name: 'Art Nouveau', period: '1890-1910' },

  // Early 20th Century
  'fauvism': { qid: 'Q80113', name: 'Fauvism', period: '1904-1908' },
  'expressionism': { qid: 'Q80113', name: 'Expressionism', period: '1905-1920s' },
  'cubism': { qid: 'Q42804', name: 'Cubism', period: '1907-1920s' },
  'futurism': { qid: 'Q80113', name: 'Futurism', period: '1909-1944' },
  'dadaism': { qid: 'Q6034', name: 'Dadaism', period: '1916-1924' },
  'constructivism': { qid: 'Q163802', name: 'Constructivism', period: '1913-1940s' },
  'de-stijl': { qid: 'Q167838', name: 'De Stijl', period: '1917-1931' },
  'bauhaus': { qid: 'Q83090', name: 'Bauhaus', period: '1919-1933' },

  // Surrealism & Abstract
  'surrealism': { qid: 'Q39427', name: 'Surrealism', period: '1920s-1960s' },
  'abstract-art': { qid: 'Q188451', name: 'Abstract Art', period: '1910s-present' },
  'abstract-expressionism': { qid: 'Q47460', name: 'Abstract Expressionism', period: '1940s-1960s' },

  // Post-War & Contemporary
  'pop-art': { qid: 'Q134147', name: 'Pop Art', period: '1950s-1970s' },
  'minimalism': { qid: 'Q190637', name: 'Minimalism', period: '1960s-1970s' },
  'conceptual-art': { qid: 'Q195220', name: 'Conceptual Art', period: '1960s-present' },
  'photorealism': { qid: 'Q641739', name: 'Photorealism', period: '1960s-present' },
  'neo-expressionism': { qid: 'Q477508', name: 'Neo-Expressionism', period: '1970s-1980s' },
  'street-art': { qid: 'Q303618', name: 'Street Art', period: '1980s-present' },
  'contemporary-art': { qid: 'Q186030', name: 'Contemporary Art', period: '1970s-present' },
};

// Famous artists to explicitly include (with Wikidata QIDs)
const FAMOUS_ARTISTS = {
  // Renaissance & Old Masters
  'leonardo-da-vinci': { qid: 'Q762', name: 'Leonardo da Vinci' },
  'michelangelo': { qid: 'Q5592', name: 'Michelangelo' },
  'raphael': { qid: 'Q5597', name: 'Raphael' },
  'botticelli': { qid: 'Q5669', name: 'Sandro Botticelli' },
  'caravaggio': { qid: 'Q42207', name: 'Caravaggio' },
  'rembrandt': { qid: 'Q5598', name: 'Rembrandt' },
  'vermeer': { qid: 'Q41264', name: 'Johannes Vermeer' },
  'velazquez': { qid: 'Q297', name: 'Diego Velázquez' },

  // Impressionism & Post-Impressionism
  'monet': { qid: 'Q296', name: 'Claude Monet' },
  'renoir': { qid: 'Q39931', name: 'Pierre-Auguste Renoir' },
  'degas': { qid: 'Q46373', name: 'Edgar Degas' },
  'cezanne': { qid: 'Q35548', name: 'Paul Cézanne' },
  'van-gogh': { qid: 'Q5582', name: 'Vincent van Gogh' },
  'gauguin': { qid: 'Q37693', name: 'Paul Gauguin' },
  'toulouse-lautrec': { qid: 'Q82445', name: 'Henri de Toulouse-Lautrec' },
  'seurat': { qid: 'Q34013', name: 'Georges Seurat' },

  // Expressionism & Early Modern
  'munch': { qid: 'Q41406', name: 'Edvard Munch' },
  'klimt': { qid: 'Q34661', name: 'Gustav Klimt' },
  'schiele': { qid: 'Q44032', name: 'Egon Schiele' },
  'kandinsky': { qid: 'Q61064', name: 'Wassily Kandinsky' },
  'klee': { qid: 'Q44007', name: 'Paul Klee' },
  'marc': { qid: 'Q44054', name: 'Franz Marc' },
  'kirchner': { qid: 'Q164348', name: 'Ernst Ludwig Kirchner' },
  'modigliani': { qid: 'Q53004', name: 'Amedeo Modigliani' },

  // Cubism & Abstract
  'picasso': { qid: 'Q5593', name: 'Pablo Picasso' },
  'braque': { qid: 'Q153793', name: 'Georges Braque' },
  'mondrian': { qid: 'Q151803', name: 'Piet Mondrian' },
  'malevich': { qid: 'Q46508', name: 'Kazimir Malevich' },

  // Surrealism
  'dali': { qid: 'Q5577', name: 'Salvador Dalí' },
  'magritte': { qid: 'Q7836', name: 'René Magritte' },
  'miro': { qid: 'Q152384', name: 'Joan Miró' },
  'ernst': { qid: 'Q154842', name: 'Max Ernst' },
  'frida-kahlo': { qid: 'Q5588', name: 'Frida Kahlo' },

  // Abstract Expressionism
  'rothko': { qid: 'Q160236', name: 'Mark Rothko' },
  'pollock': { qid: 'Q37571', name: 'Jackson Pollock' },
  'de-kooning': { qid: 'Q132305', name: 'Willem de Kooning' },
  'motherwell': { qid: 'Q262066', name: 'Robert Motherwell' },
  'newman': { qid: 'Q374504', name: 'Barnett Newman' },

  // Pop Art & Contemporary
  'warhol': { qid: 'Q5603', name: 'Andy Warhol' },
  'lichtenstein': { qid: 'Q151679', name: 'Roy Lichtenstein' },
  'hockney': { qid: 'Q159907', name: 'David Hockney' },
  'basquiat': { qid: 'Q102851', name: 'Jean-Michel Basquiat' },
  'haring': { qid: 'Q485635', name: 'Keith Haring' },
  'banksy': { qid: 'Q133697', name: 'Banksy' },
  'kusama': { qid: 'Q231121', name: 'Yayoi Kusama' },
  'koons': { qid: 'Q380430', name: 'Jeff Koons' },

  // American Artists
  'hopper': { qid: 'Q203401', name: 'Edward Hopper' },
  'wyeth': { qid: 'Q312819', name: 'Andrew Wyeth' },
  'okeefe': { qid: 'Q46408', name: "Georgia O'Keeffe" },
  'rockwell': { qid: 'Q271884', name: 'Norman Rockwell' },

  // British & European Contemporary
  'bacon': { qid: 'Q154340', name: 'Francis Bacon' },
  'freud': { qid: 'Q154842', name: 'Lucian Freud' },
  'richter': { qid: 'Q164061', name: 'Gerhard Richter' },

  // Scandinavian Artists
  'pushwagner': { qid: 'Q3246329', name: 'Pushwagner' },
  'hammershoi': { qid: 'Q380706', name: 'Vilhelm Hammershøi' },
  'zorn': { qid: 'Q206820', name: 'Anders Zorn' },
  'larsson': { qid: 'Q187310', name: 'Carl Larsson' },
  'krohg': { qid: 'Q983838', name: 'Christian Krohg' },
  'kittelsen': { qid: 'Q720407', name: 'Theodor Kittelsen' },
  'sohlberg': { qid: 'Q2296591', name: 'Harald Sohlberg' },

  // Other Important Artists
  'bosch': { qid: 'Q130531', name: 'Hieronymus Bosch' },
  'bruegel': { qid: 'Q43270', name: 'Pieter Bruegel the Elder' },
  'goya': { qid: 'Q5432', name: 'Francisco Goya' },
  'turner': { qid: 'Q52558', name: 'J. M. W. Turner' },
  'delacroix': { qid: 'Q33477', name: 'Eugène Delacroix' },
  'matisse': { qid: 'Q5589', name: 'Henri Matisse' },
  'chagall': { qid: 'Q93284', name: 'Marc Chagall' },
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = {
    movement: null,
    artist: null,
    limit: 200, // Per movement/artist
    dryRun: false,
    famousOnly: false,
    artistsOnly: false, // Only sync famous artists, skip movements
    movementsOnly: false, // Only sync movements, skip artists
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
    } else if (arg === '--famous-only') {
      args.famousOnly = true;
    } else if (arg === '--artists-only') {
      args.artistsOnly = true;
    } else if (arg === '--movements-only') {
      args.movementsOnly = true;
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
 * Execute SPARQL query against Wikidata
 */
async function querySparql(sparql) {
  const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/sparql-results+json',
        },
      });

      if (response.status === 429) {
        // Rate limited - wait and retry
        const waitTime = (attempt + 1) * 30000; // 30s, 60s, 90s
        console.log(`${colors.yellow}  Rate limited, waiting ${waitTime / 1000}s...${colors.reset}`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data.results.bindings;
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) throw error;
      console.log(`${colors.yellow}  Retry ${attempt + 1}/${MAX_RETRIES}...${colors.reset}`);
      await sleep(RATE_LIMIT_MS * (attempt + 1));
    }
  }
}

/**
 * Build SPARQL query for paintings by movement
 */
function buildMovementQuery(movementQid, limit, famousOnly) {
  // Query for paintings with images, optionally filtering for those with Wikipedia articles
  const famousFilter = famousOnly ? `
    ?painting ^schema:about ?article .
    ?article schema:isPartOf <https://en.wikipedia.org/> .
  ` : '';

  return `
SELECT DISTINCT ?painting ?paintingLabel ?image ?creator ?creatorLabel ?inception ?movementLabel WHERE {
  ?painting wdt:P31 wd:Q3305213 .           # instance of: painting
  ?painting wdt:P135 wd:${movementQid} .    # movement
  ?painting wdt:P18 ?image .                 # has image

  OPTIONAL { ?painting wdt:P170 ?creator }   # creator
  OPTIONAL { ?painting wdt:P571 ?inception } # date of creation

  ${famousFilter}

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,it" }
}
LIMIT ${limit}
  `.trim();
}

/**
 * Build SPARQL query for famous paintings (those with Wikipedia articles)
 */
function buildFamousPaintingsQuery(limit) {
  return `
SELECT DISTINCT ?painting ?paintingLabel ?image ?creator ?creatorLabel ?inception ?movementLabel WHERE {
  ?painting wdt:P31 wd:Q3305213 .           # instance of: painting
  ?painting wdt:P18 ?image .                 # has image

  # Must have English Wikipedia article (famous)
  ?article schema:about ?painting ;
           schema:isPartOf <https://en.wikipedia.org/> .

  OPTIONAL { ?painting wdt:P170 ?creator }
  OPTIONAL { ?painting wdt:P571 ?inception }
  OPTIONAL { ?painting wdt:P135 ?movement }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}
  `.trim();
}

/**
 * Build SPARQL query for paintings by artist (using QID)
 */
function buildArtistQueryByQid(artistQid, limit) {
  return `
SELECT DISTINCT ?painting ?paintingLabel ?image ?creator ?creatorLabel ?inception ?movement ?movementLabel WHERE {
  ?painting wdt:P170 wd:${artistQid} .      # creator is this artist
  ?painting wdt:P31 wd:Q3305213 .           # instance of: painting
  ?painting wdt:P18 ?image .                 # has image

  OPTIONAL { ?painting wdt:P571 ?inception }
  OPTIONAL { ?painting wdt:P135 ?movement }

  BIND(wd:${artistQid} AS ?creator)

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,it,no" }
}
LIMIT ${limit}
  `.trim();
}

/**
 * Convert Wikimedia Commons URL to direct image URL
 */
function getImageUrl(commonsUrl, width = 1200) {
  // Wikidata returns URLs like: http://commons.wikimedia.org/wiki/Special:FilePath/Filename.jpg
  // We need to convert to the thumbnail API URL

  if (!commonsUrl) return null;

  // Extract filename - it may already be URL-encoded
  const filename = commonsUrl.split('/').pop();
  if (!filename) return null;

  // Decode first (in case it's already encoded), then re-encode properly
  let decodedFilename;
  try {
    decodedFilename = decodeURIComponent(filename);
  } catch {
    decodedFilename = filename;
  }

  // For Wikimedia Commons, use the Special:FilePath URL which handles redirects
  // The filename should NOT be encoded when using Special:FilePath
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${decodedFilename}?width=${width}`;
}

/**
 * Download image to file
 */
async function downloadImage(url, filePath) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'image/jpeg,image/png,image/*,*/*',
        },
        redirect: 'follow',
      });

      // Handle rate limiting specifically
      if (response.status === 429) {
        const waitTime = (attempt + 1) * 30000; // 30s, 60s, 90s...
        console.log(`${colors.yellow}  Rate limited (429), waiting ${waitTime / 1000}s...${colors.reset}`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('image')) {
        throw new Error(`Not an image: ${contentType}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1000) {
        throw new Error(`File too small: ${buffer.length} bytes`);
      }

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buffer);
      return buffer.length;
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) throw error;
      const waitTime = RATE_LIMIT_MS * (attempt + 1) * 2;
      await sleep(waitTime);
    }
  }
}

/**
 * Create safe filename from title
 */
function safeFilename(title, qid) {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `${safe}-${qid}`;
}

/**
 * Extract Wikidata QID from URL
 */
function extractQid(url) {
  const match = url.match(/Q\d+$/);
  return match ? match[0] : null;
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
 * Process paintings from SPARQL results
 */
async function processPaintings(results, movementId, movementName, args, index, stats) {
  const existingIds = new Set(index.artworks.map(a => a.sourceId));

  for (const result of results) {
    const qid = extractQid(result.painting.value);
    if (!qid || existingIds.has(qid)) {
      stats.skipped++;
      continue;
    }

    const title = result.paintingLabel?.value || 'Untitled';
    const artist = result.creatorLabel?.value || 'Unknown Artist';
    const year = result.inception?.value?.slice(0, 4) || '';
    const imageUrl = result.image?.value;

    if (!imageUrl) {
      stats.skipped++;
      continue;
    }

    stats.processed++;

    const filename = safeFilename(title, qid);
    const imagePath = path.join(LIBRARY_PATH, movementId, `${filename}.jpg`);
    const thumbPath = path.join(LIBRARY_PATH, movementId, 'thumbs', `${filename}.jpg`);

    if (args.dryRun) {
      console.log(`${colors.dim}    [DRY RUN] ${title} by ${artist}${colors.reset}`);
      stats.downloaded++;
      continue;
    }

    try {
      await sleep(RATE_LIMIT_MS);

      // Download main image
      const mainUrl = getImageUrl(imageUrl, 1200);
      const fileSize = await downloadImage(mainUrl, imagePath);

      // Download thumbnail
      const thumbUrl = getImageUrl(imageUrl, 400);
      await downloadImage(thumbUrl, thumbPath);

      // Add to index
      index.artworks.push({
        id: `wikidata-${qid}`,
        sourceId: qid,
        title: title,
        artist: artist,
        year: year,
        movement: movementId,
        movementName: movementName,
        filename: `${movementId}/${filename}.jpg`,
        thumbnailFilename: `${movementId}/thumbs/${filename}.jpg`,
        sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
        wikimediaUrl: imageUrl,
        fileSize,
        downloadedAt: new Date().toISOString(),
      });

      existingIds.add(qid);
      stats.downloaded++;
      process.stdout.write(`${colors.green}.${colors.reset}`);

    } catch (error) {
      stats.errors++;
      console.log(`\n${colors.red}    Error: ${title} - ${error.message}${colors.reset}`);
    }
  }

  console.log(''); // New line after dots
}

/**
 * Process artist paintings from SPARQL results
 */
async function processArtistPaintings(results, artistId, artistName, args, index, stats) {
  const existingIds = new Set(index.artworks.map(a => a.sourceId));

  for (const result of results) {
    const qid = extractQid(result.painting.value);
    if (!qid || existingIds.has(qid)) {
      stats.skipped++;
      continue;
    }

    const title = result.paintingLabel?.value || 'Untitled';
    const year = result.inception?.value?.slice(0, 4) || '';
    const imageUrl = result.image?.value;
    const movementLabel = result.movementLabel?.value || '';
    const movementId = movementLabel ? movementLabel.toLowerCase().replace(/\s+/g, '-') : 'artists';

    if (!imageUrl) {
      stats.skipped++;
      continue;
    }

    stats.processed++;

    const filename = safeFilename(title, qid);
    const imagePath = path.join(LIBRARY_PATH, 'artists', artistId, `${filename}.jpg`);
    const thumbPath = path.join(LIBRARY_PATH, 'artists', artistId, 'thumbs', `${filename}.jpg`);

    if (args.dryRun) {
      console.log(`${colors.dim}    [DRY RUN] ${title}${colors.reset}`);
      stats.downloaded++;
      continue;
    }

    try {
      await sleep(RATE_LIMIT_MS);

      // Download main image
      const mainUrl = getImageUrl(imageUrl, 1200);
      const fileSize = await downloadImage(mainUrl, imagePath);

      // Download thumbnail
      const thumbUrl = getImageUrl(imageUrl, 400);
      await downloadImage(thumbUrl, thumbPath);

      // Add to index
      index.artworks.push({
        id: `wikidata-${qid}`,
        sourceId: qid,
        title: title,
        artist: artistName,
        artistId: artistId,
        year: year,
        movement: movementId || 'artists',
        movementName: movementLabel || 'Various',
        filename: `artists/${artistId}/${filename}.jpg`,
        thumbnailFilename: `artists/${artistId}/thumbs/${filename}.jpg`,
        sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
        wikimediaUrl: imageUrl,
        fileSize,
        downloadedAt: new Date().toISOString(),
      });

      existingIds.add(qid);
      stats.downloaded++;
      process.stdout.write(`${colors.green}.${colors.reset}`);

    } catch (error) {
      stats.errors++;
      console.log(`\n${colors.red}    Error: ${title} - ${error.message}${colors.reset}`);
    }
  }

  console.log(''); // New line after dots
}

/**
 * Main sync function
 */
async function main() {
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  Glance Art Library Sync (Wikidata)${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  Comprehensive Art Collection${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  const args = parseArgs();

  console.log(`Configuration:`);
  console.log(`  Movements: ${Object.keys(ART_MOVEMENTS).length}`);
  console.log(`  Famous Artists: ${Object.keys(FAMOUS_ARTISTS).length}`);
  console.log(`  Limit per category: ${args.limit}`);
  if (args.dryRun) console.log(`  ${colors.yellow}DRY RUN MODE${colors.reset}`);
  if (args.artistsOnly) console.log(`  Artists only mode`);
  if (args.movementsOnly) console.log(`  Movements only mode`);
  console.log('');

  // Load existing index
  const index = await loadIndex();
  console.log(`Existing library: ${index.artworks.length} artworks\n`);

  // Stats
  const stats = {
    processed: 0,
    downloaded: 0,
    skipped: 0,
    errors: 0,
  };

  // ═══════════════════════════════════════════════════════════
  // PART 1: Sync by Art Movement
  // ═══════════════════════════════════════════════════════════
  if (!args.artistsOnly && !args.artist) {
    console.log(`${colors.bold}${colors.cyan}▶ SYNCING BY ART MOVEMENT${colors.reset}\n`);

    let movementsToSync = Object.entries(ART_MOVEMENTS);
    if (args.movement) {
      if (!ART_MOVEMENTS[args.movement]) {
        console.error(`${colors.red}Unknown movement: ${args.movement}${colors.reset}`);
        console.log('Available:', Object.keys(ART_MOVEMENTS).join(', '));
        process.exit(1);
      }
      movementsToSync = [[args.movement, ART_MOVEMENTS[args.movement]]];
    }

    for (const [movementId, movement] of movementsToSync) {
      console.log(`\n${colors.cyan}━━━ ${movement.name} (${movement.period}) ━━━${colors.reset}`);

      await fs.mkdir(path.join(LIBRARY_PATH, movementId, 'thumbs'), { recursive: true });

      try {
        console.log(`${colors.dim}  Querying Wikidata...${colors.reset}`);
        const query = buildMovementQuery(movement.qid, args.limit, args.famousOnly);
        const results = await querySparql(query);

        console.log(`${colors.dim}  Found ${results.length} paintings${colors.reset}`);

        if (results.length > 0) {
          await processPaintings(results, movementId, movement.name, args, index, stats);
        }

        // Save periodically
        if (stats.downloaded > 0 && stats.downloaded % 50 === 0 && !args.dryRun) {
          await saveIndex(index);
        }

      } catch (error) {
        console.log(`${colors.red}  Error: ${error.message}${colors.reset}`);
      }

      await sleep(RATE_LIMIT_MS * 2);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PART 2: Sync Famous Artists
  // ═══════════════════════════════════════════════════════════
  if (!args.movementsOnly) {
    console.log(`\n${colors.bold}${colors.cyan}▶ SYNCING FAMOUS ARTISTS${colors.reset}\n`);

    let artistsToSync = Object.entries(FAMOUS_ARTISTS);
    if (args.artist) {
      if (!FAMOUS_ARTISTS[args.artist]) {
        console.error(`${colors.red}Unknown artist: ${args.artist}${colors.reset}`);
        console.log('Available:', Object.keys(FAMOUS_ARTISTS).join(', '));
        process.exit(1);
      }
      artistsToSync = [[args.artist, FAMOUS_ARTISTS[args.artist]]];
    }

    for (const [artistId, artist] of artistsToSync) {
      console.log(`\n${colors.cyan}━━━ ${artist.name} ━━━${colors.reset}`);

      await fs.mkdir(path.join(LIBRARY_PATH, 'artists', artistId, 'thumbs'), { recursive: true });

      try {
        console.log(`${colors.dim}  Querying Wikidata...${colors.reset}`);
        const query = buildArtistQueryByQid(artist.qid, args.limit);
        const results = await querySparql(query);

        console.log(`${colors.dim}  Found ${results.length} paintings${colors.reset}`);

        if (results.length > 0) {
          await processArtistPaintings(results, artistId, artist.name, args, index, stats);
        }

        // Save periodically
        if (stats.downloaded > 0 && stats.downloaded % 50 === 0 && !args.dryRun) {
          await saveIndex(index);
        }

      } catch (error) {
        console.log(`${colors.red}  Error: ${error.message}${colors.reset}`);
      }

      await sleep(RATE_LIMIT_MS * 2);
    }
  }

  // Save final index
  if (!args.dryRun) {
    await saveIndex(index);
  }

  // ═══════════════════════════════════════════════════════════
  // Final Report
  // ═══════════════════════════════════════════════════════════
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}  Sync Complete${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`  Processed: ${stats.processed}`);
  console.log(`  Downloaded: ${colors.green}${stats.downloaded}${colors.reset}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Errors: ${stats.errors > 0 ? colors.red : ''}${stats.errors}${colors.reset}`);
  console.log(`  Total in library: ${index.artworks.length}`);

  // Breakdown
  if (index.byMovement && Object.keys(index.byMovement).length > 0) {
    console.log(`\n  By category:`);
    const sorted = Object.entries(index.byMovement).sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sorted.slice(0, 20)) {
      console.log(`    ${cat}: ${count}`);
    }
    if (sorted.length > 20) {
      console.log(`    ... and ${sorted.length - 20} more categories`);
    }
  }

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
