/**
 * Data storage utilities with caching and file locking
 */

const fs = require("fs").promises;
const path = require("path");

// File caching to reduce disk I/O on Raspberry Pi
const fileCache = new Map();
const CACHE_TTL = 5000; // 5 seconds cache for frequently accessed files
const fileLocks = new Map(); // Prevent concurrent writes causing corruption

// Default data directory
const DATA_DIR = path.join(__dirname, "..", "data");

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

/**
 * Ensure any directory exists
 * @param {string} dir - Directory path to ensure exists
 */
async function ensureDir(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

/**
 * Read a JSON file with optional caching
 * @param {string} filename - Filename (relative to data directory)
 * @param {boolean} useCache - Whether to use caching (default: true)
 * @returns {Promise<Object|null>} Parsed JSON or null if file doesn't exist
 */
async function readJSONFile(filename, useCache = true) {
    try {
        // Check cache first for frequently accessed files
        if (useCache && fileCache.has(filename)) {
            const cached = fileCache.get(filename);
            if (Date.now() - cached.timestamp < CACHE_TTL) {
                return cached.data;
            }
        }

        await ensureDataDir();
        const data = await fs.readFile(path.join(DATA_DIR, filename), "utf8");
        const parsed = JSON.parse(data);

        // Cache the result
        if (useCache) {
            fileCache.set(filename, { data: parsed, timestamp: Date.now() });
        }

        return parsed;
    } catch (error) {
        // Only log errors for files that should exist
        const optionalFiles = ['playlist.json', 'my-collection.json'];
        if (!optionalFiles.includes(filename)) {
            console.error(`Error reading ${filename}:`, error.message);
        }
        return null;
    }
}

/**
 * Write a JSON file with atomic operation and locking
 * @param {string} filename - Filename (relative to data directory)
 * @param {Object} data - Data to write
 */
async function writeJSONFile(filename, data) {
    try {
        await ensureDataDir();

        // Use a lock to prevent concurrent writes
        const lockKey = filename;
        if (fileLocks.has(lockKey)) {
            // Wait for existing write to complete
            await fileLocks.get(lockKey);
        }

        // Create a promise for this write operation
        let resolveLock;
        const lockPromise = new Promise(resolve => { resolveLock = resolve; });
        fileLocks.set(lockKey, lockPromise);

        try {
            // Write to a temporary file first, then rename (atomic operation)
            const filePath = path.join(DATA_DIR, filename);
            const tempPath = filePath + '.tmp';
            await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
            await fs.rename(tempPath, filePath);

            // Invalidate cache
            fileCache.delete(filename);
        } finally {
            // Release lock
            fileLocks.delete(lockKey);
            resolveLock();
        }
    } catch (error) {
        console.error(`Error writing ${filename}:`, error.message);
        throw error;
    }
}

/**
 * Clear the file cache (useful for testing)
 */
function clearCache() {
    fileCache.clear();
}

/**
 * Get the data directory path
 * @returns {string} Absolute path to data directory
 */
function getDataDir() {
    return DATA_DIR;
}

module.exports = {
    ensureDataDir,
    ensureDir,
    readJSONFile,
    writeJSONFile,
    clearCache,
    getDataDir
};
