#!/usr/bin/env node

/**
 * Populate Qdrant with artwork embeddings
 * This script:
 * 1. Fetches all artworks from collections
 * 2. Generates CLIP embeddings for each
 * 3. Stores them in Qdrant for semantic search
 */

const vectorSearch = require('../services/vector-search');
const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

async function loadCollections() {
    const collections = [];

    try {
        // Load from collections.json if it exists
        const collectionsPath = path.join(DATA_DIR, 'collections.json');
        try {
            const data = await fs.readFile(collectionsPath, 'utf8');
            const collectionsData = JSON.parse(data);

            if (collectionsData.collections) {
                for (const collection of collectionsData.collections) {
                    const collectionPath = path.join(DATA_DIR, `${collection.id}.json`);
                    try {
                        const collectionData = await fs.readFile(collectionPath, 'utf8');
                        const parsed = JSON.parse(collectionData);

                        if (parsed.artworks) {
                            collections.push(...parsed.artworks.map(art => ({
                                ...art,
                                collectionId: collection.id
                            })));
                        }
                    } catch (err) {
                        console.warn(`Could not load collection ${collection.id}:`, err.message);
                    }
                }
            }
        } catch (err) {
            console.log('No collections.json found, trying alternative methods...');
        }

        // Also check for individual collection files
        const files = await fs.readdir(DATA_DIR);
        for (const file of files) {
            if (file.endsWith('.json') && !file.includes('collections') && !file.includes('current')) {
                try {
                    const filePath = path.join(DATA_DIR, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const parsed = JSON.parse(data);

                    if (parsed.artworks && Array.isArray(parsed.artworks)) {
                        console.log(`Found ${parsed.artworks.length} artworks in ${file}`);
                        collections.push(...parsed.artworks);
                    }
                } catch (err) {
                    // Skip invalid files
                }
            }
        }

    } catch (error) {
        console.error('Error loading collections:', error);
    }

    return collections;
}

async function populateQdrant() {
    console.log('🎨 Starting Qdrant population...\n');

    try {
        // Initialize vector search
        console.log('Initializing vector search service...');
        await vectorSearch.initialize();
        console.log('✓ Connected to Qdrant\n');

        // Load artworks
        console.log('Loading artworks from collections...');
        const artworks = await loadCollections();

        if (artworks.length === 0) {
            console.log('\n⚠️  No artworks found!');
            console.log('Make sure you have collection files in:', DATA_DIR);
            console.log('\nTry running the server first to populate collections from museum APIs.');
            return;
        }

        console.log(`✓ Found ${artworks.length} artworks\n`);

        // Process each artwork
        let processed = 0;
        let failed = 0;

        console.log('⏳ Generating embeddings (this will take a while on first run)...');
        console.log('📦 CLIP model (~600MB) will download to ~/.cache/huggingface/\n');

        for (let i = 0; i < artworks.length; i++) {
            const artwork = artworks[i];

            try {
                // Generate a unique ID if not present
                const artworkId = artwork.id || artwork.objectID || `artwork-${i}`;

                // Skip if no image URL
                if (!artwork.imageUrl && !artwork.primaryImage) {
                    console.log(`⏭️  Skipping ${artwork.title || 'Unknown'} - no image URL`);
                    continue;
                }

                const imageUrl = artwork.imageUrl || artwork.primaryImage;

                console.log(`[${i + 1}/${artworks.length}] Processing: ${artwork.title || 'Untitled'}`);

                await vectorSearch.indexArtwork({
                    id: artworkId,
                    imageUrl: imageUrl,
                    title: artwork.title || 'Untitled',
                    artist: artwork.artist || artwork.artistDisplayName || 'Unknown',
                    date: artwork.date || artwork.objectDate || '',
                    source: artwork.source || artwork.repository || 'Unknown',
                    thumbnailUrl: artwork.thumbnailUrl || artwork.primaryImageSmall || imageUrl
                });

                processed++;

            } catch (error) {
                console.error(`❌ Failed to process ${artwork.title || 'Unknown'}:`, error.message);
                failed++;
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log('✅ Population complete!');
        console.log(`✓ Processed: ${processed} artworks`);
        console.log(`✗ Failed: ${failed} artworks`);
        console.log('='.repeat(50));

        // Show stats
        const stats = await vectorSearch.getStats();
        console.log('\n📊 Qdrant Stats:');
        console.log(`   Total artworks: ${stats.totalArtworks}`);
        console.log(`   Vector size: ${stats.vectorSize}D`);
        console.log(`   Model: ${stats.model}`);

        console.log('\n🚀 Ready to search!');
        console.log('Try: curl -X POST http://localhost:3000/api/semantic/search \\');
        console.log('  -H "Content-Type: application/json" \\');
        console.log('  -d \'{"query": "peaceful blue paintings", "limit": 5}\'');

    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error('\nMake sure:');
        console.error('1. Qdrant is running: docker ps | grep qdrant');
        console.error('2. Server dependencies are installed: npm install');
        process.exit(1);
    }
}

// Run the script
populateQdrant()
    .then(() => {
        console.log('\n✅ Done!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
