#!/usr/bin/env node

/**
 * Storage Initialization Script
 *
 * This script initializes and verifies the persistent storage setup for Glance:
 * - Creates necessary data directories
 * - Initializes SQLite database with proper schema
 * - Verifies Qdrant connection
 * - Reports storage status
 */

const fs = require('fs').promises;
const path = require('path');
const embeddingDb = require('../services/embedding-db');
const vectorSearch = require('../services/vector-search');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const DB_PATH = path.join(DATA_DIR, 'embeddings.db');

/**
 * Ensure a directory exists
 */
async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
        console.log(`✓ Directory exists: ${dirPath}`);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`✓ Created directory: ${dirPath}`);
    }
}

/**
 * Check if a file exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get directory size in MB
 */
async function getDirectorySize(dirPath) {
    try {
        const files = await fs.readdir(dirPath);
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
                totalSize += stats.size;
            } else if (stats.isDirectory()) {
                totalSize += await getDirectorySize(filePath);
            }
        }

        return totalSize;
    } catch {
        return 0;
    }
}

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Initialize SQLite database
 */
async function initializeSQLite() {
    console.log('\n📊 Initializing SQLite Database...');

    try {
        embeddingDb.initialize(DB_PATH);

        const stats = embeddingDb.getStats();
        console.log('✓ SQLite database initialized');
        console.log(`  - Total artworks: ${stats.totalArtworks}`);
        console.log(`  - With embeddings: ${stats.withEmbeddings}`);
        console.log(`  - Without embeddings: ${stats.withoutEmbeddings}`);
        console.log(`  - Coverage: ${stats.coverage}`);
        console.log(`  - User actions: ${stats.totalActions}`);

        const dbExists = await fileExists(DB_PATH);
        if (dbExists) {
            const dbStats = await fs.stat(DB_PATH);
            console.log(`  - Database size: ${formatBytes(dbStats.size)}`);
        }

        return true;
    } catch (error) {
        console.error('✗ Failed to initialize SQLite:', error.message);
        return false;
    }
}

/**
 * Check Qdrant connection
 */
async function checkQdrant() {
    console.log('\n🔍 Checking Qdrant Vector Database...');

    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    console.log(`  - URL: ${qdrantUrl}`);

    try {
        await vectorSearch.initialize();

        const stats = await vectorSearch.getStats();
        console.log('✓ Qdrant connection successful');
        console.log(`  - Total artworks indexed: ${stats.totalArtworks}`);
        console.log(`  - Vector size: ${stats.vectorSize}`);
        console.log(`  - Model: ${stats.model}`);

        return true;
    } catch (error) {
        console.error('✗ Failed to connect to Qdrant:', error.message);
        console.error('  Make sure Qdrant is running:');
        console.error('  - With Docker Compose: docker-compose up -d qdrant');
        console.error('  - Standalone: docker run -p 6333:6333 qdrant/qdrant');
        return false;
    }
}

/**
 * Report storage status
 */
async function reportStorageStatus() {
    console.log('\n💾 Storage Status Report:');
    console.log('═'.repeat(60));

    // Data directory
    const dataSize = await getDirectorySize(DATA_DIR);
    console.log(`\n📁 Data Directory: ${DATA_DIR}`);
    console.log(`   Size: ${formatBytes(dataSize)}`);

    // Check for important files
    const importantFiles = [
        'current.json',
        'playlist.json',
        'my-collection.json',
        'collections.json',
        'embeddings.db'
    ];

    console.log('   Files:');
    for (const file of importantFiles) {
        const filePath = path.join(DATA_DIR, file);
        const exists = await fileExists(filePath);
        if (exists) {
            const stats = await fs.stat(filePath);
            console.log(`   ✓ ${file} (${formatBytes(stats.size)})`);
        } else {
            console.log(`   ○ ${file} (not created yet)`);
        }
    }

    // Uploads directory
    const uploadsSize = await getDirectorySize(UPLOAD_DIR);
    const uploadFiles = await fs.readdir(UPLOAD_DIR).catch(() => []);
    console.log(`\n📸 Uploads Directory: ${UPLOAD_DIR}`);
    console.log(`   Size: ${formatBytes(uploadsSize)}`);
    console.log(`   Files: ${uploadFiles.length}`);

    console.log('\n═'.repeat(60));
}

/**
 * Main initialization function
 */
async function main() {
    console.log('🚀 Glance Storage Initialization\n');
    console.log('═'.repeat(60));

    // Create directories
    console.log('\n📂 Creating directories...');
    await ensureDir(DATA_DIR);
    await ensureDir(UPLOAD_DIR);

    // Initialize SQLite
    const sqliteOk = await initializeSQLite();

    // Check Qdrant
    const qdrantOk = await checkQdrant();

    // Report status
    await reportStorageStatus();

    // Summary
    console.log('\n📋 Summary:');
    console.log(`   SQLite Database: ${sqliteOk ? '✓ Ready' : '✗ Error'}`);
    console.log(`   Qdrant Vector DB: ${qdrantOk ? '✓ Ready' : '✗ Not Available'}`);
    console.log(`   Data Directories: ✓ Ready`);

    console.log('\n✅ Storage initialization complete!\n');

    // Close connections
    embeddingDb.close();

    process.exit(sqliteOk ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('\n❌ Initialization failed:', error);
        process.exit(1);
    });
}

module.exports = { ensureDir, fileExists, formatBytes };
