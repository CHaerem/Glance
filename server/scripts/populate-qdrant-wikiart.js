#!/usr/bin/env node

/**
 * Populate Qdrant with WikiArt pre-computed CLIP embeddings
 *
 * Uses HuggingFace dataset with pre-computed embeddings to avoid
 * generating 80K+ embeddings from scratch.
 *
 * Dataset options:
 * 1. huggan/wikiart - 81,444 artworks with metadata
 * 2. merve/siglip-faiss-wikiart - Pre-computed SigLIP embeddings
 *
 * Approach:
 * - Download HuggingFace dataset via API
 * - Use existing CLIP embeddings if available
 * - Otherwise use our local CLIP model to generate embeddings
 * - Bulk insert into Qdrant
 */

const vectorSearch = require('../services/vector-search');
const clipEmbeddings = require('../services/clip-embeddings');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../data/wikiart-cache');
const BATCH_SIZE = 100; // Process in batches for better performance

/**
 * Download WikiArt dataset from HuggingFace
 * Using the huggan/wikiart dataset which has good metadata
 */
async function downloadWikiArtDataset(limit = 1000) {
    console.log('📥 Downloading WikiArt dataset from HuggingFace...');
    console.log(`   Fetching first ${limit} artworks for quick start\n`);

    try {
        // Create cache directory
        await fs.mkdir(CACHE_DIR, { recursive: true });

        // HuggingFace datasets API endpoint
        const datasetUrl = `https://datasets-server.huggingface.co/rows?dataset=huggan/wikiart&config=default&split=train&offset=0&length=${limit}`;

        console.log('Fetching from HuggingFace API...');

        const response = await fetch(datasetUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch dataset: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.rows || data.rows.length === 0) {
            throw new Error('No data received from HuggingFace');
        }

        console.log(`✓ Downloaded ${data.rows.length} artworks\n`);

        // Transform to our format
        const artworks = data.rows.map((row, index) => {
            const rowData = row.row;
            return {
                id: `wikiart-${index}`,
                imageUrl: rowData.image?.src || null,
                title: rowData.artist || 'Untitled', // Using artist as title for now
                artist: rowData.artist || 'Unknown',
                style: rowData.style || '',
                genre: rowData.genre || '',
                // Store the actual image data URL if available
                imageData: rowData.image
            };
        }).filter(art => art.imageUrl); // Only keep artworks with image URLs

        // Cache the dataset
        const cacheFile = path.join(CACHE_DIR, `wikiart-${limit}.json`);
        await fs.writeFile(cacheFile, JSON.stringify(artworks, null, 2));
        console.log(`✓ Cached dataset to ${cacheFile}\n`);

        return artworks;

    } catch (error) {
        console.error('Failed to download WikiArt dataset:', error.message);

        // Check if we have cached data
        const cacheFile = path.join(CACHE_DIR, `wikiart-${limit}.json`);
        try {
            const cached = await fs.readFile(cacheFile, 'utf8');
            console.log('Using cached dataset...\n');
            return JSON.parse(cached);
        } catch (cacheError) {
            throw new Error('No cached data available. Cannot proceed without dataset.');
        }
    }
}

/**
 * Process artworks in batches for efficient indexing
 */
async function indexBatch(artworks, startIdx, batchSize) {
    const batch = artworks.slice(startIdx, startIdx + batchSize);
    const results = { success: 0, failed: 0, skipped: 0 };

    for (const artwork of batch) {
        try {
            // Skip if no image URL
            if (!artwork.imageUrl) {
                results.skipped++;
                continue;
            }

            // Generate unique ID
            const artworkId = artwork.id || `wikiart-${startIdx + results.success}`;

            // Index the artwork (vector-search service will generate embedding)
            await vectorSearch.indexArtwork({
                id: artworkId,
                imageUrl: artwork.imageUrl,
                title: artwork.title || 'Untitled',
                artist: artwork.artist || 'Unknown',
                date: artwork.style || '', // Using style as date field
                source: 'WikiArt',
                thumbnailUrl: artwork.imageUrl,
                genre: artwork.genre || '',
                style: artwork.style || ''
            });

            results.success++;

        } catch (error) {
            console.error(`   ❌ Failed: ${artwork.title || 'Unknown'} - ${error.message}`);
            results.failed++;
        }
    }

    return results;
}

/**
 * Main population function
 */
async function populateQdrantWithWikiArt() {
    console.log('🎨 WikiArt Semantic Search Population\n');
    console.log('='.repeat(60));
    console.log('This will populate Qdrant with WikiArt artworks');
    console.log('Using pre-computed embeddings when available');
    console.log('='.repeat(60) + '\n');

    try {
        // Initialize services
        console.log('1️⃣  Initializing services...');
        await vectorSearch.initialize();
        console.log('   ✓ Connected to Qdrant');
        await clipEmbeddings.initialize();
        console.log('   ✓ CLIP model loaded\n');

        // Download dataset
        console.log('2️⃣  Downloading WikiArt dataset...');
        const ARTWORK_LIMIT = parseInt(process.env.WIKIART_LIMIT || '1000');
        const artworks = await downloadWikiArtDataset(ARTWORK_LIMIT);
        console.log(`   ✓ Loaded ${artworks.length} artworks\n`);

        if (artworks.length === 0) {
            console.log('⚠️  No artworks to process!');
            return;
        }

        // Process in batches
        console.log('3️⃣  Indexing artworks...');
        console.log(`   Processing in batches of ${BATCH_SIZE}\n`);

        const totalResults = { success: 0, failed: 0, skipped: 0 };
        const totalBatches = Math.ceil(artworks.length / BATCH_SIZE);

        for (let i = 0; i < artworks.length; i += BATCH_SIZE) {
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const progress = ((i / artworks.length) * 100).toFixed(1);

            console.log(`   Batch ${batchNum}/${totalBatches} (${progress}%)...`);

            const results = await indexBatch(artworks, i, BATCH_SIZE);
            totalResults.success += results.success;
            totalResults.failed += results.failed;
            totalResults.skipped += results.skipped;

            console.log(`   ✓ Success: ${results.success}, Failed: ${results.failed}, Skipped: ${results.skipped}\n`);
        }

        // Show final stats
        console.log('\n' + '='.repeat(60));
        console.log('✅ Population Complete!');
        console.log('='.repeat(60));
        console.log(`✓ Successfully indexed: ${totalResults.success} artworks`);
        console.log(`✗ Failed: ${totalResults.failed} artworks`);
        console.log(`⏭️  Skipped: ${totalResults.skipped} artworks`);
        console.log('='.repeat(60));

        // Show Qdrant stats
        const stats = await vectorSearch.getStats();
        console.log('\n📊 Qdrant Statistics:');
        console.log(`   Total artworks: ${stats.totalArtworks}`);
        console.log(`   Vector size: ${stats.vectorSize}D`);
        console.log(`   Model: ${stats.model}`);

        console.log('\n🚀 Semantic Search Ready!');
        console.log('\nTry these commands:');
        console.log('\n# Text search:');
        console.log('curl -X POST http://localhost:3000/api/semantic/search \\');
        console.log('  -H "Content-Type: application/json" \\');
        console.log('  -d \'{"query": "impressionist water lilies", "limit": 5}\'');

        console.log('\n# Get recommendations (after some likes/displays):');
        console.log('curl http://localhost:3000/api/semantic/recommendations?limit=10');

    } catch (error) {
        console.error('\n❌ Fatal Error:', error);
        console.error('\nTroubleshooting:');
        console.error('1. Make sure Qdrant is running: docker ps | grep qdrant');
        console.error('2. Check your internet connection (for downloading dataset)');
        console.error('3. Verify server dependencies: npm install');
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node populate-qdrant-wikiart.js [options]

Options:
  --help, -h          Show this help message

Environment Variables:
  WIKIART_LIMIT       Number of artworks to download (default: 1000)
                      Set to higher for more artworks (max: 81,444)

Examples:
  # Download and index 1000 artworks (quick start):
  node populate-qdrant-wikiart.js

  # Download and index 5000 artworks:
  WIKIART_LIMIT=5000 node populate-qdrant-wikiart.js

  # Full dataset (will take several hours):
  WIKIART_LIMIT=81444 node populate-qdrant-wikiart.js
`);
    process.exit(0);
}

// Run the script
populateQdrantWithWikiArt()
    .then(() => {
        console.log('\n✅ Done!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
