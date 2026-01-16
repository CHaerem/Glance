/**
 * Local Art Library Service
 *
 * Searches locally stored artworks downloaded from WikiArt.
 * Integrates with performArtSearch() as an additional source.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Artwork } from '../types';
import { TtlCache, TTL } from '../utils/cache';
import { loggers } from './logger';

const log = loggers.api;

// Paths
const LIBRARY_PATH = path.join(__dirname, '../../data/art-library');
const INDEX_PATH = path.join(LIBRARY_PATH, 'index.json');

// Local artwork entry as stored in index.json
interface LocalArtwork {
  id: string;
  sourceId: string;
  title: string;
  artist: string;
  year: string;
  movement: string;
  filename: string;
  thumbnailFilename: string;
  sourceUrl?: string;
  fileSize?: number;
  downloadedAt?: string;
}

// Index file structure
interface LocalArtworkIndex {
  lastSync: string;
  totalArtworks: number;
  byMovement: Record<string, number>;
  artworks: LocalArtwork[];
}

// Cache the index for 5 minutes
const indexCache = new TtlCache<LocalArtworkIndex>({ ttl: TTL.FIVE_MINUTES });

/**
 * Check if local library exists and has artworks
 */
export function isLocalLibraryAvailable(): boolean {
  try {
    return fs.existsSync(INDEX_PATH);
  } catch {
    return false;
  }
}

/**
 * Get library statistics
 */
export async function getLibraryStats(): Promise<{
  available: boolean;
  totalArtworks: number;
  lastSync: string | null;
  byMovement: Record<string, number>;
} | null> {
  if (!isLocalLibraryAvailable()) {
    return { available: false, totalArtworks: 0, lastSync: null, byMovement: {} };
  }

  const index = await loadIndex();
  if (!index) {
    return { available: false, totalArtworks: 0, lastSync: null, byMovement: {} };
  }

  return {
    available: true,
    totalArtworks: index.totalArtworks,
    lastSync: index.lastSync,
    byMovement: index.byMovement,
  };
}

/**
 * Search local library by query
 */
export async function searchLocalLibrary(
  query: string,
  limit: number = 20
): Promise<Artwork[]> {
  if (!isLocalLibraryAvailable()) {
    return [];
  }

  const index = await loadIndex();
  if (!index || index.artworks.length === 0) {
    return [];
  }

  const queryLower = query.toLowerCase().trim();
  if (!queryLower) {
    return [];
  }

  const terms = queryLower.split(/\s+/).filter(t => t.length > 0);

  // Score and filter artworks
  const scored = index.artworks
    .map(artwork => ({
      artwork,
      score: scoreMatch(artwork, terms, queryLower),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  log.debug('Local library search', {
    query,
    resultsCount: scored.length,
    topScore: scored[0]?.score ?? 0,
  });

  // Convert to Artwork format
  return scored.map(({ artwork }) => toArtwork(artwork));
}

/**
 * Get random artworks from local library
 */
export async function getRandomLocalArtworks(
  count: number = 8,
  movement?: string
): Promise<Artwork[]> {
  if (!isLocalLibraryAvailable()) {
    return [];
  }

  const index = await loadIndex();
  if (!index || index.artworks.length === 0) {
    return [];
  }

  let pool = index.artworks;

  // Filter by movement if specified
  if (movement) {
    pool = pool.filter(a => a.movement === movement);
    if (pool.length === 0) {
      log.debug('No artworks found for movement', { movement });
      return [];
    }
  }

  // Fisher-Yates shuffle
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // TypeScript needs help here - indices are always valid in this loop
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }

  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  log.debug('Random local artworks', {
    count: selected.length,
    movement: movement ?? 'all',
    totalPool: pool.length,
  });

  return selected.map(toArtwork);
}

/**
 * Get artworks by movement
 */
export async function getArtworksByMovement(
  movement: string,
  limit: number = 50
): Promise<Artwork[]> {
  if (!isLocalLibraryAvailable()) {
    return [];
  }

  const index = await loadIndex();
  if (!index || index.artworks.length === 0) {
    return [];
  }

  const filtered = index.artworks
    .filter(a => a.movement === movement)
    .slice(0, limit);

  return filtered.map(toArtwork);
}

/**
 * Get available movements
 */
export async function getAvailableMovements(): Promise<
  Array<{ id: string; count: number }>
> {
  if (!isLocalLibraryAvailable()) {
    return [];
  }

  const index = await loadIndex();
  if (!index) {
    return [];
  }

  return Object.entries(index.byMovement)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Convert local artwork to standard Artwork format
 */
function toArtwork(local: LocalArtwork): Artwork {
  return {
    id: local.id,
    title: local.title,
    artist: local.artist,
    date: local.year,
    imageUrl: `/art-library/${local.filename}`,
    thumbnailUrl: `/art-library/${local.thumbnailFilename}`,
    source: 'local-library',
    classification: local.movement,
    // Include source URL for attribution
    description: local.sourceUrl ? `Source: ${local.sourceUrl}` : undefined,
  };
}

/**
 * Score how well an artwork matches the search query
 */
function scoreMatch(
  artwork: LocalArtwork,
  terms: string[],
  fullQuery: string
): number {
  let score = 0;

  const title = artwork.title.toLowerCase();
  const artist = artwork.artist.toLowerCase();
  const movement = artwork.movement.toLowerCase();

  // Exact full query matches (highest priority)
  if (title === fullQuery) score += 20;
  if (artist === fullQuery) score += 15;
  if (title.includes(fullQuery)) score += 10;
  if (artist.includes(fullQuery)) score += 8;
  if (movement.includes(fullQuery)) score += 5;

  // Individual term matches
  for (const term of terms) {
    // Skip very short terms
    if (term.length < 2) continue;

    // Title matches
    if (title.includes(term)) {
      score += term.length > 3 ? 3 : 1;
    }

    // Artist matches
    if (artist.includes(term)) {
      score += term.length > 3 ? 2 : 1;
    }

    // Movement matches
    if (movement.includes(term)) {
      score += 1;
    }
  }

  return score;
}

/**
 * Load the index from disk (with caching)
 */
async function loadIndex(): Promise<LocalArtworkIndex | null> {
  // Check cache first
  const cached = indexCache.get('index');
  if (cached) {
    return cached;
  }

  try {
    const data = await fs.promises.readFile(INDEX_PATH, 'utf-8');
    const index = JSON.parse(data) as LocalArtworkIndex;

    // Validate structure
    if (!Array.isArray(index.artworks)) {
      log.warn('Invalid local library index: artworks is not an array');
      return null;
    }

    indexCache.set('index', index);
    log.debug('Loaded local library index', {
      totalArtworks: index.totalArtworks,
      movements: Object.keys(index.byMovement).length,
    });

    return index;
  } catch (error: unknown) {
    // Only log if the file exists but couldn't be read
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn('Failed to load local library index', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

/**
 * Clear the index cache (useful after sync)
 */
export function clearIndexCache(): void {
  indexCache.clear();
  log.debug('Local library index cache cleared');
}
