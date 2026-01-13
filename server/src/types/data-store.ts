/**
 * Data Store Type Definitions
 * File-based JSON storage with caching
 */

// Cache entry for file data
export interface FileCacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

// Generic JSON file data types
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

// Data store function signatures
export interface DataStore {
  ensureDataDir(): Promise<void>;
  ensureDir(dir: string): Promise<void>;
  readJSONFile<T = unknown>(filename: string, useCache?: boolean): Promise<T | null>;
  writeJSONFile<T = unknown>(filename: string, data: T): Promise<void>;
  clearCache(): void;
  getDataDir(): string;
}

// Image validation cache entry
export interface ValidationCacheEntry {
  valid: boolean;
  timestamp: number;
}
