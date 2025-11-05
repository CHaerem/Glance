#!/usr/bin/env node

/**
 * Import pre-computed WikiArt CLIP embeddings from Archive.org
 *
 * Dataset: https://archive.org/details/wikiart_00
 * Contains:
 * - WikiArt_image.npy - Pre-computed CLIP image embeddings (512D)
 * - metadata.json - Artwork information
 *
 * This avoids having to generate embeddings for 80K+ artworks
 */

const vectorSearch = require('../services/vector-search');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../data/wikiart-precomputed');
const SAMPLE_SIZE = parseInt(process.env.SAMPLE_SIZE || '1000');

/**
 * Download WikiArt metadata from HuggingFace
 * Using the huggan/wikiart dataset which has good metadata
 */
async function downloadWikiArtMetadata(limit = 1000) {
    console.log(`📥 Downloading WikiArt metadata (${limit} artworks)...`);

    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });

        // Try using HuggingFace's parquet files API
        // This is more reliable than the datasets server
        const url = `https://huggingface.co/datasets/huggan/wikiart/resolve/main/data/train-00000-of-00001.parquet?download=true`;

        console.log('Attempting to download from HuggingFace parquet files...');
        console.log('Note: We need Python with pandas/pyarrow to read .parquet files');
        console.log('Alternative: Fetch directly from WikiArt website\n');

        // For now, let's use a simpler approach: fetch from WikiArt's public API
        return await fetchFromWikiArtAPI(limit);

    } catch (error) {
        console.error('Failed to download metadata:', error.message);
        return [];
    }
}

/**
 * Fetch artwork metadata directly from WikiArt's public website
 * WikiArt has a searchable catalog we can scrape
 */
async function fetchFromWikiArtAPI(limit = 1000) {
    console.log('📍 Fetching from WikiArt public catalog...');

    // WikiArt doesn't have a public API, but we can use the Open Images dataset
    // which includes WikiArt images

    // Alternative: Use Met Museum + Rijksmuseum for now (what we're already doing)
    // but process in larger batches

    console.log('\n⚠️  WikiArt pre-computed embeddings require Python to parse .npy files');
    console.log('   The .npy format is NumPy-specific and not easily readable in Node.js\n');

    console.log('💡 Alternative approaches:');
    console.log('   1. Continue with current approach (100 artworks indexed so far)');
    console.log('   2. Scale up to 500-1000 artworks from museum APIs');
    console.log('   3. Write a Python helper script to convert .npy to JSON\n');

    return [];
}

/**
 * Convert .npy embeddings to Qdrant format
 * Note: This requires a Python bridge or npy-js library
 */
async function importPrecomputedEmbeddings() {
    console.log('🎨 WikiArt Pre-computed Embeddings Import\n');
    console.log('='.repeat(70));

    try {
        // Initialize Qdrant
        await vectorSearch.initialize();
        console.log('✓ Connected to Qdrant\n');

        // Check if we have numpy.js available
        let npyjs;
        try {
            npyjs = require('npyjs');
            console.log('✓ Found npyjs library for reading .npy files\n');
        } catch (err) {
            console.log('⚠️  npyjs not installed. Install with: npm install npyjs\n');

            console.log('Alternative: Use Python bridge');
            console.log('Create a simple Python script to convert .npy → JSON:\n');
            console.log('```python');
            console.log('import numpy as np');
            console.log('import json');
            console.log('');
            console.log('# Load embeddings');
            console.log('embeddings = np.load("WikiArt_image.npy")');
            console.log('');
            console.log('# Convert to JSON');
            console.log('with open("embeddings.json", "w") as f:');
            console.log('    json.dump(embeddings.tolist(), f)');
            console.log('```\n');

            return;
        }

        // Try to load pre-downloaded .npy file
        const npyPath = path.join(CACHE_DIR, 'WikiArt_image.npy');

        try {
            await fs.access(npyPath);
            console.log(`Found .npy file: ${npyPath}`);

            // Load and parse
            const data = await fs.readFile(npyPath);
            const parsed = await npyjs.parse(data);

            console.log(`✓ Loaded ${parsed.shape[0]} pre-computed embeddings`);
            console.log(`  Dimensions: ${parsed.shape[1]}D\n`);

            // Now we need artwork metadata to match with embeddings
            console.log('Loading artwork metadata...');

            // TODO: Download and match metadata with embeddings

        } catch (err) {
            console.log(`⚠️  No .npy file found at ${npyPath}`);
            console.log('\nDownload WikiArt embeddings:');
            console.log('1. Visit: https://archive.org/details/wikiart_00');
            console.log('2. Download: WikiArt_image.npy (large file ~1.2GB)');
            console.log('3. Place in: server/data/wikiart-precomputed/');
            console.log('4. Run this script again\n');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

/**
 * Simpler approach: Batch process museum artworks
 * This is faster than one-by-one and doesn't require external datasets
 */
async function batchProcessMuseumArt() {
    console.log('🎨 Batch Process Museum Artworks\n');
    console.log('='.repeat(70));
    console.log('This approach fetches artwork metadata in batches');
    console.log('then processes embeddings efficiently\n');

    console.log('Currently running: populate-from-museums.js 50');
    console.log('This will index 100 artworks (50 per museum)\n');

    console.log('To scale up:');
    console.log('  node scripts/populate-from-museums.js 500  # 1000 artworks');
    console.log('  node scripts/populate-from-museums.js 1000 # 2000 artworks\n');

    const stats = await vectorSearch.getStats();
    console.log('📊 Current Status:');
    console.log(`   Indexed: ${stats.totalArtworks} artworks`);
    console.log(`   Model: ${stats.model}`);
    console.log(`   Vector size: ${stats.vectorSize}D\n`);
}

// Check command line args
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
WikiArt Pre-computed Embeddings Importer

Usage:
  node import-wikiart-embeddings.js [--npy]

Options:
  --npy     Try to import from .npy file (requires npyjs)
  --help    Show this help

Notes:
  Pre-computed embeddings require:
  1. npyjs library: npm install npyjs
  2. Downloaded .npy file from Archive.org
  3. Matching metadata for artworks

  Alternative: Use populate-from-museums.js for reliable results
`);
    process.exit(0);
}

if (args.includes('--npy')) {
    importPrecomputedEmbeddings()
        .then(() => console.log('Done'))
        .catch(err => console.error('Error:', err));
} else {
    batchProcessMuseumArt()
        .then(() => console.log('Done'))
        .catch(err => console.error('Error:', err));
}
