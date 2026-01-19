/**
 * Museum API Service
 * Handles searching across multiple museum APIs for artwork
 */

import * as fs from 'fs';
import * as path from 'path';
import statistics from './statistics';
import { loggers } from './logger';
import { getErrorMessage } from '../utils';
import type { Artwork } from '../types';
import { searchLocalLibrary, isLocalLibraryAvailable } from './local-library';
import { allAdapters } from './museums';

const log = loggers.api;

/** Internal artwork type with scoring fields */
interface ScoredArtwork extends Artwork {
  _score?: number;
  _curatedScore?: number;
  collection?: string;
  year?: string;
  popularity?: number;
  thumbnail?: string;
}

/** Curated artwork from collections file */
interface CuratedArtworkEntry {
  id: string;
  title: string;
  artist: string;
  year: string;
  wikimedia: string;
  popularity: number;
}

/** Curated collection structure */
interface CuratedCollectionEntry {
  name: string;
  description: string;
  artworks: CuratedArtworkEntry[];
}

/** Curated collections type */
type CuratedCollections = Record<string, CuratedCollectionEntry>;

/** Source status in search results */
interface SourceStatus {
  status: 'ok' | 'no_results';
  count: number;
}

/** Search result with sources */
interface ArtSearchResult {
  results: Artwork[];
  total: number;
  hasMore: boolean;
  sources: Record<string, SourceStatus>;
}

// Load curated collections from JSON file
// Path: dist/src/services -> ../../../data (goes to server/data/)
const CURATED_COLLECTIONS: CuratedCollections = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'data', 'curated-collections.json'),
    'utf8'
  )
);

/**
 * Get curated collections
 * @returns The curated collections object
 */
export function getCuratedCollections(): CuratedCollections {
  return CURATED_COLLECTIONS;
}

/**
 * Search for artworks across multiple museum APIs
 * @param query - Search query
 * @param targetCount - Number of results to return
 * @param startOffset - Offset for pagination
 * @returns Search results
 */
export async function performArtSearch(
  query: string,
  targetCount: number = 20,
  startOffset: number = 0
): Promise<ArtSearchResult> {
  const offset = startOffset;

  log.info('Searching for artworks', { query, limit: targetCount, offset });

  // Search with API tracking
  const trackSearch = async (
    sourceName: string,
    searchFunc: () => Promise<Artwork[]>
  ): Promise<Artwork[]> => {
    try {
      const results = await searchFunc();
      const success = results && results.length > 0;
      statistics.trackAPICall(sourceName, '/search', success, {
        query: query,
        resultsCount: results?.length ?? 0,
      });
      return results;
    } catch (error) {
      statistics.trackAPICall(sourceName, '/search', false, {
        query: query,
        error: getErrorMessage(error),
      });
      return [];
    }
  };

  // Check if local library is available
  const localLibraryAvailable = isLocalLibraryAvailable();

  // Run all museum searches in parallel
  const adapterResults = await Promise.all(
    allAdapters.map((adapter) =>
      trackSearch(adapter.name, () => adapter.search(query, targetCount))
    )
  );

  // Search local library if available
  const localResults = localLibraryAvailable
    ? await trackSearch('Local Library', () => searchLocalLibrary(query, targetCount))
    : [];

  // Build sources status map
  const sources: Record<string, SourceStatus> = {};
  allAdapters.forEach((adapter, index) => {
    const results = adapterResults[index] ?? [];
    sources[adapter.id] = {
      status: results.length > 0 ? 'ok' : 'no_results',
      count: results.length,
    };
  });

  if (localLibraryAvailable) {
    sources['local-library'] = {
      status: localResults.length > 0 ? 'ok' : 'no_results',
      count: localResults.length,
    };
  }

  // Ranking function to score artworks
  const scoreArtwork = (artwork: ScoredArtwork): number => {
    let score = 0;

    if (artwork._curatedScore !== undefined) {
      return 1000 + artwork._curatedScore;
    }

    const lowerQuery = (query ?? '').toLowerCase();
    const lowerArtist = (artwork.artist ?? '').toLowerCase();
    const lowerTitle = (artwork.title ?? '').toLowerCase();
    const lowerDept = (artwork.department ?? '').toLowerCase();

    if (lowerArtist.includes(lowerQuery)) score += 10;
    if (lowerTitle.includes(lowerQuery)) score += 5;
    if (lowerDept.includes('painting')) score += 5;
    if (lowerTitle.includes('painting')) score += 3;

    const dateMatch = (artwork.date ?? '').match(/\d{4}/);
    if (dateMatch) {
      const year = parseInt(dateMatch[0], 10);
      if (year < 1800) score += 4;
      else if (year < 1900) score += 3;
      else if (year < 1950) score += 2;
    }

    return score;
  };

  // Search curated collections database
  const curatedResults: ScoredArtwork[] = [];
  const lowerQuery = (query ?? '').toLowerCase();

  for (const [, collection] of Object.entries(CURATED_COLLECTIONS)) {
    for (const artwork of collection.artworks) {
      const lowerArtist = artwork.artist.toLowerCase();
      const lowerTitle = artwork.title.toLowerCase();

      if (
        lowerArtist.includes(lowerQuery) ||
        lowerTitle.includes(lowerQuery) ||
        lowerQuery.includes(lowerTitle)
      ) {
        const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${artwork.wikimedia}?width=1200`;
        curatedResults.push({
          id: artwork.id,
          title: `${artwork.title} (${artwork.year})`,
          artist: artwork.artist,
          date: artwork.year,
          imageUrl: imageUrl,
          thumbnailUrl: imageUrl,
          source: 'curated',
          collection: collection.name,
          year: artwork.year,
          popularity: artwork.popularity,
          _curatedScore: artwork.popularity,
        });
      }
    }
  }

  if (curatedResults.length > 0) {
    log.debug('Found curated artworks', { count: curatedResults.length, query });
  }

  // Merge all results
  const allResults: ScoredArtwork[] = [
    ...curatedResults,
    ...adapterResults.flat(),
    ...localResults,
  ];

  // Sort by score
  allResults.forEach((artwork) => {
    artwork._score = scoreArtwork(artwork);
  });

  allResults.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

  // Remove internal scoring fields from output
  allResults.forEach((artwork) => {
    delete artwork._score;
    delete artwork._curatedScore;
  });

  // Apply offset and limit to sorted results
  const paginatedResults = allResults.slice(offset, offset + targetCount);

  // Build log info with adapter counts
  const sourceCounts: Record<string, number> = {};
  allAdapters.forEach((adapter, index) => {
    sourceCounts[adapter.id] = adapterResults[index]?.length ?? 0;
  });
  if (localLibraryAvailable) {
    sourceCounts['local'] = localResults.length;
  }

  log.info('Art search complete', {
    returned: paginatedResults.length,
    sources: sourceCounts,
  });

  return {
    results: paginatedResults,
    total: allResults.length,
    hasMore: allResults.length > offset + targetCount,
    sources: sources,
  };
}

export { CURATED_COLLECTIONS };
export type { CuratedArtworkEntry as CuratedArtwork, CuratedCollectionEntry, CuratedCollections };
