/**
 * TTL Cache Utility
 * Generic in-memory cache with time-to-live expiration
 */

export interface CacheOptions {
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Maximum number of entries (optional, defaults to 1000) */
  maxSize?: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Generic TTL cache with automatic expiration and size limits
 */
export class TtlCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(options: CacheOptions) {
    this.ttl = options.ttl;
    this.maxSize = options.maxSize ?? 1000;
  }

  /**
   * Get a cached value if it exists and hasn't expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry.data;
    }
    // Remove expired entry
    if (entry) {
      this.cache.delete(key);
    }
    return null;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, data: T): void {
    // Enforce max size by removing oldest entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete a specific key from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries (including potentially expired ones)
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache (including potentially expired ones)
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * Delete all entries matching a prefix
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Iterate over all cached values (excluding expired entries)
   */
  *values(): IterableIterator<T> {
    const now = Date.now();
    for (const entry of this.cache.values()) {
      if (now - entry.timestamp < this.ttl) {
        yield entry.data;
      }
    }
  }

  /**
   * Execute a callback for each non-expired entry
   */
  forEach(callback: (value: T, key: string) => void): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp < this.ttl) {
        callback(entry.data, key);
      }
    }
  }

  /**
   * Get or set a value using a factory function
   * If the key doesn't exist or is expired, calls the factory to generate the value
   */
  async getOrSet(key: string, factory: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const data = await factory();
    this.set(key, data);
    return data;
  }

  /**
   * Synchronous version of getOrSet
   */
  getOrSetSync(key: string, factory: () => T): T {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const data = factory();
    this.set(key, data);
    return data;
  }
}

// Common TTL presets
export const TTL = {
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
} as const;
