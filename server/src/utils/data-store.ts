/**
 * Data storage utilities with caching, file locking, and transactional support
 *
 * IMPORTANT: Use modifyJSONFile() for read-modify-write operations to prevent
 * race conditions. Direct readJSONFile() + writeJSONFile() should only be used
 * when you're certain there won't be concurrent modifications.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TtlCache } from './cache';
import { getErrorMessage } from './error';

/** File cache to reduce disk I/O (5 second TTL) */
const fileCache = new TtlCache<unknown>({ ttl: 5000 });

/** File locks to prevent concurrent read-modify-write operations */
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
    if (useCache) {
      const cached = fileCache.get(filename);
      if (cached !== null) {
        return cached as T;
      }
    }

    await ensureDataDir();
    const data = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
    const parsed = JSON.parse(data) as T;

    // Cache the result
    if (useCache) {
      fileCache.set(filename, parsed);
    }

    return parsed;
  } catch (error) {
    // Only log errors for files that should exist
    const optionalFiles = ['playlist.json', 'my-collection.json'];
    if (!optionalFiles.includes(filename)) {
      console.error(`Error reading ${filename}:`, getErrorMessage(error));
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
    console.error(`Error writing ${filename}:`, getErrorMessage(error));
    throw error;
  }
}

/**
 * Atomically modify a JSON file with proper locking
 * This prevents race conditions in read-modify-write operations.
 *
 * @param filename - Filename (relative to data directory)
 * @param modifier - Function that receives current data and returns modified data
 * @param defaultValue - Default value if file doesn't exist
 * @returns The modified data
 *
 * @example
 * // Safe way to add a device
 * await modifyJSONFile('devices.json', (devices) => {
 *   devices[deviceId] = { ...deviceData };
 *   return devices;
 * }, {});
 */
export async function modifyJSONFile<T>(
  filename: string,
  modifier: (data: T) => T | Promise<T>,
  defaultValue: T
): Promise<T> {
  const lockKey = filename;

  // Wait for any existing lock to release, then acquire our own
  // Use a loop to handle the case where multiple callers arrive simultaneously
  while (fileLocks.has(lockKey)) {
    await fileLocks.get(lockKey);
  }

  // Create and register our lock
  let resolveLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  fileLocks.set(lockKey, lockPromise);

  try {
    // Read current data (bypass cache to get latest)
    let data: T;
    try {
      await ensureDataDir();
      const fileContent = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
      data = JSON.parse(fileContent) as T;
    } catch {
      data = defaultValue;
    }

    // Apply modification
    const modified = await modifier(data);

    // Write atomically with unique temp file to avoid conflicts
    const filePath = path.join(DATA_DIR, filename);
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(modified, null, 2));
    await fs.rename(tempPath, filePath);

    // Invalidate cache
    fileCache.delete(filename);

    return modified;
  } finally {
    // Release lock
    fileLocks.delete(lockKey);
    resolveLock!();
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
