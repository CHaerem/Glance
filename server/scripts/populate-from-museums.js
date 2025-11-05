#!/usr/bin/env node

/**
 * Populate Qdrant from Museum APIs
 *
 * Uses existing museum API integrations to fetch artworks
 * and generate CLIP embeddings for semantic search.
 *
 * Museums:
 * - Met Museum (no API key required)
 * - Rijksmuseum (no API key required)
 * - Art Institute of Chicago
 * - Cleveland Museum of Art
 *
 * This approach lets us use real museum data without
 * downloading large datasets.
 */

const vectorSearch = require('../services/vector-search');
const clipEmbeddings = require('../services/clip-embeddings');

/**
 * Fetch artworks from Met Museum
 */
async function fetchMetArtworks(count = 50) {
    console.log(`\n📍 Met Museum: Fetching ${count} artworks...`);

    try {
        // Search for paintings with images
        const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=painting`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        if (!searchData.objectIDs || searchData.objectIDs.length === 0) {
            console.log('   No results found');
            return [];
        }

        console.log(`   Found ${searchData.objectIDs.length} total results`);
        console.log(`   Fetching details for ${count} artworks...`);

        const artworks = [];
        const shuffled = searchData.objectIDs.sort(() => Math.random() - 0.5);

        for (let i = 0; i < shuffled.length && artworks.length < count; i++) {
            const objectId = shuffled[i];

            try {
                const objectUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`;
                const objectResponse = await fetch(objectUrl);
                const artwork = await objectResponse.json();

                if (artwork.primaryImage && artwork.primaryImage.trim()) {
                    artworks.push({
                        id: `met-${artwork.objectID}`,
                        imageUrl: artwork.primaryImage,
                        title: artwork.title || 'Untitled',
                        artist: artwork.artistDisplayName || 'Unknown',
                        date: artwork.objectDate || '',
                        source: 'Met Museum',
                        thumbnailUrl: artwork.primaryImageSmall || artwork.primaryImage
                    });
                }

                // Progress indicator
                if (artworks.length % 10 === 0) {
                    process.stdout.write(`   Progress: ${artworks.length}/${count}\r`);
                }

            } catch (err) {
                // Skip failed artworks
            }
        }

        console.log(`   ✓ Fetched ${artworks.length} artworks                    `);
        return artworks;

    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return [];
    }
}

/**
 * Fetch artworks from Rijksmuseum
 */
async function fetchRijksmuseumArtworks(count = 50) {
    console.log(`\n📍 Rijksmuseum: Fetching ${count} artworks...`);

    try {
        const rijksUrl = `https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&imgonly=true&ps=${count * 2}`;
        const rijksResponse = await fetch(rijksUrl);
        const rijksData = await rijksResponse.json();

        if (!rijksData.artObjects || rijksData.artObjects.length === 0) {
            console.log('   No results found');
            return [];
        }

        const artworks = rijksData.artObjects
            .filter(artwork => artwork.webImage && artwork.webImage.url)
            .slice(0, count)
            .map(artwork => ({
                id: `rijks-${artwork.objectNumber}`,
                imageUrl: artwork.webImage.url,
                title: artwork.title || 'Untitled',
                artist: artwork.principalOrFirstMaker || 'Unknown',
                date: '',
                source: 'Rijksmuseum',
                thumbnailUrl: artwork.webImage.url
            }));

        console.log(`   ✓ Fetched ${artworks.length} artworks`);
        return artworks;

    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return [];
    }
}

/**
 * Fetch artworks from Art Institute of Chicago
 */
async function fetchArticArtworks(count = 50) {
    console.log(`\n📍 Art Institute of Chicago: Fetching ${count} artworks...`);

    try {
        const articUrl = `https://api.artic.edu/api/v1/artworks/search?q=painting&limit=${count}&fields=id,title,artist_display,date_display,image_id`;
        const articResponse = await fetch(articUrl);
        const articData = await articResponse.json();

        if (!articData.data || articData.data.length === 0) {
            console.log('   No results found');
            return [];
        }

        const artworks = articData.data
            .filter(artwork => artwork.image_id)
            .map(artwork => ({
                id: `artic-${artwork.id}`,
                imageUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/843,/0/default.jpg`,
                title: artwork.title || 'Untitled',
                artist: artwork.artist_display || 'Unknown',
                date: artwork.date_display || '',
                source: 'Art Institute of Chicago',
                thumbnailUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/200,/0/default.jpg`
            }));

        console.log(`   ✓ Fetched ${artworks.length} artworks`);
        return artworks;

    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        return [];
    }
}

/**
 * Index artworks into Qdrant with progress tracking
 */
async function indexArtworks(artworks) {
    console.log(`\n🔧 Indexing ${artworks.length} artworks into Qdrant...\n`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < artworks.length; i++) {
        const artwork = artworks[i];

        try {
            await vectorSearch.indexArtwork(artwork);
            success++;

            // Progress indicator
            const percent = ((i + 1) / artworks.length * 100).toFixed(0);
            process.stdout.write(`   Progress: ${i + 1}/${artworks.length} (${percent}%) - ${artwork.title.substring(0, 40)}...${' '.repeat(20)}\r`);

        } catch (error) {
            console.error(`\n   ❌ Failed: ${artwork.title} - ${error.message}`);
            failed++;
        }
    }

    console.log(`\n   ✓ Success: ${success}, Failed: ${failed}${' '.repeat(40)}`);
    return { success, failed };
}

/**
 * Main function
 */
async function populateFromMuseums() {
    console.log('🎨 Museum Semantic Search Population\n');
    console.log('='.repeat(70));
    console.log('Fetching artworks from museum APIs and generating CLIP embeddings');
    console.log('='.repeat(70));

    try {
        // Initialize services
        console.log('\n1️⃣  Initializing services...');
        await vectorSearch.initialize();
        console.log('   ✓ Connected to Qdrant');
        await clipEmbeddings.initialize();
        console.log('   ✓ CLIP model loaded');

        // Get command line arguments
        const args = process.argv.slice(2);
        const countPerMuseum = parseInt(args[0]) || 50;

        console.log(`\n2️⃣  Fetching artworks (${countPerMuseum} per museum)...`);

        // Fetch from multiple museums in parallel
        // Skipping Art Institute for now - their images return 403 Forbidden
        const [metArtworks, rijksArtworks] = await Promise.all([
            fetchMetArtworks(countPerMuseum),
            fetchRijksmuseumArtworks(countPerMuseum)
        ]);

        const allArtworks = [
            ...metArtworks,
            ...rijksArtworks
        ];

        console.log(`\n   📊 Total artworks fetched: ${allArtworks.length}`);
        console.log(`      Met Museum: ${metArtworks.length}`);
        console.log(`      Rijksmuseum: ${rijksArtworks.length}`);

        if (allArtworks.length === 0) {
            console.log('\n⚠️  No artworks fetched. Check your internet connection.');
            return;
        }

        // Index into Qdrant
        console.log('\n3️⃣  Generating embeddings and indexing...');
        const results = await indexArtworks(allArtworks);

        // Show final stats
        console.log('\n' + '='.repeat(70));
        console.log('✅ Population Complete!');
        console.log('='.repeat(70));

        const stats = await vectorSearch.getStats();
        console.log(`\n📊 Qdrant Statistics:`);
        console.log(`   Total artworks: ${stats.totalArtworks}`);
        console.log(`   Vector size: ${stats.vectorSize}D`);
        console.log(`   Model: ${stats.model}`);

        console.log('\n🚀 Ready to search!');
        console.log('\nTry these commands:\n');
        console.log('# Text-to-image search:');
        console.log('curl -X POST http://localhost:3000/api/semantic/search \\');
        console.log('  -H "Content-Type: application/json" \\');
        console.log('  -d \'{"query": "peaceful blue water scenes", "limit": 10}\'');

        console.log('\n# Find similar artworks:');
        console.log('curl -X POST http://localhost:3000/api/semantic/similar \\');
        console.log('  -H "Content-Type: application/json" \\');
        console.log(`  -d '{"artworkId": "${allArtworks[0]?.id}", "limit": 10}'`);

        console.log('\n# Get stats:');
        console.log('curl http://localhost:3000/api/semantic/stats');

    } catch (error) {
        console.error('\n❌ Fatal Error:', error);
        console.error('\nTroubleshooting:');
        console.error('1. Make sure Qdrant is running: docker ps | grep qdrant');
        console.error('2. Check your internet connection');
        console.error('3. Verify dependencies: npm install');
        process.exit(1);
    }
}

// Show help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: node populate-from-museums.js [count]

Arguments:
  count    Number of artworks to fetch per museum (default: 50)

Examples:
  # Fetch 50 artworks per museum (150 total):
  node populate-from-museums.js

  # Fetch 100 artworks per museum (300 total):
  node populate-from-museums.js 100

  # Quick test with 10 artworks per museum:
  node populate-from-museums.js 10
`);
    process.exit(0);
}

// Run the script
populateFromMuseums()
    .then(() => {
        console.log('\n✅ Done!\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    });
