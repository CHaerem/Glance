#!/usr/bin/env node
/**
 * Setup OpenAI Vector Store for Glance
 * Creates a Vector Store and uploads curated art collection
 *
 * Usage: node scripts/setup-vector-store.js
 *
 * Requires: OPENAI_API_KEY environment variable
 * Outputs: OPENAI_VECTOR_STORE_ID to add to your environment
 */

const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

const CURATED_COLLECTIONS_PATH = path.join(__dirname, '../data/curated-collections.json');

// Art metadata enrichment for better semantic search
const STYLE_INFO = {
    'renaissance-masters': {
        style: 'Renaissance, High Renaissance',
        mood: 'classical, serene, divine, majestic',
        colors: 'rich earth tones, gold, deep blues'
    },
    'dutch-masters': {
        style: 'Dutch Golden Age, Baroque',
        mood: 'dramatic, intimate, realistic',
        colors: 'warm browns, golden light, dark backgrounds'
    },
    'impressionists': {
        style: 'Impressionism',
        mood: 'light, airy, peaceful, everyday life',
        colors: 'soft pastels, vibrant, natural light'
    },
    'post-impressionists': {
        style: 'Post-Impressionism, Expressionism',
        mood: 'emotional, bold, expressive',
        colors: 'vivid, contrasting, swirling'
    },
    'japanese-masters': {
        style: 'Ukiyo-e, Japanese woodblock print',
        mood: 'serene, dramatic, nature-inspired',
        colors: 'flat colors, bold outlines, blue waves'
    },
    'modern-icons': {
        style: 'Modernism, Cubism, Surrealism, Art Nouveau',
        mood: 'revolutionary, provocative, dreamlike',
        colors: 'bold, abstract, experimental'
    }
};

// Subject matter for common artworks
const SUBJECT_INFO = {
    'Mona Lisa': 'portrait, woman, mysterious smile, sfumato',
    'The Last Supper': 'religious, Jesus, disciples, dinner scene',
    'The Creation of Adam': 'religious, God, human, ceiling fresco',
    'The School of Athens': 'philosophy, ancient Greece, scholars',
    'The Birth of Venus': 'mythology, goddess, ocean, shell',
    'The Night Watch': 'group portrait, soldiers, militia, dramatic lighting',
    'Girl with a Pearl Earring': 'portrait, woman, pearl, turban',
    'Water Lilies': 'nature, pond, flowers, reflection',
    'The Starry Night': 'night sky, swirling stars, village, cypress',
    'Sunflowers': 'still life, flowers, yellow, vase',
    'The Great Wave off Kanagawa': 'ocean, wave, Mount Fuji, boats',
    'Guernica': 'war, suffering, cubism, black and white',
    'The Kiss': 'love, couple, gold, embrace',
    'The Scream': 'anxiety, expressionism, distorted figure'
};

async function main() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.error('Error: OPENAI_API_KEY environment variable is required');
        console.error('Usage: OPENAI_API_KEY=sk-... node scripts/setup-vector-store.js');
        process.exit(1);
    }

    const client = new OpenAI({ apiKey });

    console.log('Setting up OpenAI Vector Store for Glance...\n');

    // Load curated collections
    console.log('Loading curated collections...');
    const collectionsData = await fs.readFile(CURATED_COLLECTIONS_PATH, 'utf8');
    const collections = JSON.parse(collectionsData);

    // Prepare artwork data with enriched metadata
    console.log('Preparing artwork metadata...');
    const artworks = [];

    for (const [collectionId, collection] of Object.entries(collections)) {
        const styleInfo = STYLE_INFO[collectionId] || {};

        for (const artwork of collection.artworks) {
            const id = `curated-${collectionId}-${artwork.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

            // Get subject info if available
            const subjects = SUBJECT_INFO[artwork.title] || '';

            // Build searchable content
            const searchableText = [
                artwork.title,
                `by ${artwork.artist}`,
                artwork.year,
                collection.name,
                styleInfo.style || '',
                styleInfo.mood || '',
                styleInfo.colors || '',
                subjects
            ].filter(Boolean).join('. ');

            artworks.push({
                id,
                title: artwork.title,
                artist: artwork.artist,
                year: artwork.year,
                collection: collection.name,
                collectionId,
                style: styleInfo.style || '',
                mood: styleInfo.mood || '',
                colors: styleInfo.colors || '',
                subjects,
                popularity: artwork.popularity,
                wikimedia: artwork.wikimedia,
                imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(artwork.wikimedia)}`,
                searchableText
            });
        }
    }

    console.log(`Prepared ${artworks.length} artworks\n`);

    // Create Vector Store
    console.log('Creating Vector Store...');
    const vectorStore = await client.vectorStores.create({
        name: 'Glance Art Collection',
        expires_after: {
            anchor: 'last_active_at',
            days: 365
        }
    });

    console.log(`Vector Store created: ${vectorStore.id}`);
    console.log(`Name: ${vectorStore.name}\n`);

    // Create JSONL file with artwork data
    console.log('Creating artwork data file...');
    const jsonlContent = artworks.map(art => JSON.stringify(art)).join('\n');
    const tempFilePath = path.join(__dirname, '../data/vector-store-artworks.jsonl');
    await fs.writeFile(tempFilePath, jsonlContent);

    // Upload file to OpenAI
    console.log('Uploading artwork data to OpenAI...');
    const fileBuffer = await fs.readFile(tempFilePath);
    const file = await client.files.create({
        file: new File([fileBuffer], 'artworks.jsonl', { type: 'application/jsonl' }),
        purpose: 'assistants'
    });

    console.log(`File uploaded: ${file.id}`);

    // Add file to Vector Store
    console.log('Adding file to Vector Store...');
    await client.vectorStores.files.create(vectorStore.id, {
        file_id: file.id
    });

    // Wait for file to be processed
    console.log('Waiting for file processing...');
    let fileStatus = 'in_progress';
    let attempts = 0;
    const maxAttempts = 30;

    while (fileStatus === 'in_progress' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const vsFile = await client.vectorStores.files.retrieve(vectorStore.id, file.id);
        fileStatus = vsFile.status;
        attempts++;
        process.stdout.write('.');
    }
    console.log('\n');

    if (fileStatus === 'completed') {
        console.log('File processing completed successfully!\n');
    } else {
        console.log(`File processing status: ${fileStatus}`);
        if (fileStatus === 'failed') {
            const vsFile = await client.vectorStores.files.retrieve(vectorStore.id, file.id);
            console.error('Error:', vsFile.last_error);
        }
    }

    // Get final stats
    const finalStore = await client.vectorStores.retrieve(vectorStore.id);

    console.log('='.repeat(60));
    console.log('SETUP COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nVector Store ID: ${vectorStore.id}`);
    console.log(`Files: ${finalStore.file_counts?.completed || 0} completed`);
    console.log(`\nAdd this to your environment:\n`);
    console.log(`  OPENAI_VECTOR_STORE_ID=${vectorStore.id}`);
    console.log(`\nOr add to .env file:`);
    console.log(`  echo "OPENAI_VECTOR_STORE_ID=${vectorStore.id}" >> .env`);
    console.log(`\nOr for GitHub Actions, add as a repository secret.`);

    // Clean up temp file
    await fs.unlink(tempFilePath);
}

main().catch(error => {
    console.error('Setup failed:', error.message);
    process.exit(1);
});
