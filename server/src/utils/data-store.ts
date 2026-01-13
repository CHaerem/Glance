/**
 * Data storage utilities with caching and file locking
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { FileCacheEntry } from '../types';

/** File cache to reduce disk I/O */
const fileCache = new Map<string, FileCacheEntry>();

/** Cache TTL in milliseconds (5 seconds) */
const CACHE_TTL = 5000;

/** File locks to prevent concurrent writes */
const fileLocks = new Map<string, Promise<void>>();

/** Default data directory - goes up to server root from dist/src/utils */
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');

/**
 * Ensure data directory exists
 */
export async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Ensure any directory exists
 * @param dir - Directory path to ensure exists
 */
export async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Read a JSON file with optional caching
 * @param filename - Filename (relative to data directory)
 * @param useCache - Whether to use caching (default: true)
 * @returns Parsed JSON or null if file doesn't exist
 */
export async function readJSONFile<T = unknown>(
  filename: string,
  useCache = true
): Promise<T | null> {
  try {
    // Check cache first for frequently accessed files
    if (useCache && fileCache.has(filename)) {
      const cached = fileCache.get(filename);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data as T;
      }
    }

    await ensureDataDir();
    const data = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
    const parsed = JSON.parse(data) as T;

    // Cache the result
    if (useCache) {
      fileCache.set(filename, { data: parsed, timestamp: Date.now() });
    }

    return parsed;
  } catch (error) {
    // Only log errors for files that should exist
    const optionalFiles = ['playlist.json', 'my-collection.json'];
    if (!optionalFiles.includes(filename)) {
      console.error(
        `Error reading ${filename}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
    return null;
  }
}

/**
 * Write a JSON file with atomic operation and locking
 * @param filename - Filename (relative to data directory)
 * @param data - Data to write
 */
export async function writeJSONFile<T = unknown>(
  filename: string,
  data: T
): Promise<void> {
  try {
    await ensureDataDir();

    // Use a lock to prevent concurrent writes
    const lockKey = filename;
    const existingLock = fileLocks.get(lockKey);
    if (existingLock) {
      // Wait for existing write to complete
      await existingLock;
    }

    // Create a promise for this write operation
    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
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
      resolveLock!();
    }
  } catch (error) {
    console.error(
      `Error writing ${filename}:`,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * Clear the file cache (useful for testing)
 */
export function clearCache(): void {
  fileCache.clear();
}

/**
 * Get the data directory path
 * @returns Absolute path to data directory
 */
export function getDataDir(): string {
  return DATA_DIR;
}
