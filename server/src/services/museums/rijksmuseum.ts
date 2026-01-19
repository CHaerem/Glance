/**
 * Rijksmuseum Adapter
 * Search the Rijksmuseum collection
 */

import type { Artwork } from '../../types';
import type { MuseumAdapter } from './types';
import { isOriginalArtwork } from './art-filter';
import { loggers } from '../logger';
import { TtlCache, TTL, getErrorMessage } from '../../utils';

const log = loggers.api;
const cache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_DAY });

export const rijksmuseumAdapter: MuseumAdapter = {
  id: 'rijksmuseum',
  name: 'Rijksmuseum',

  async search(query: string, limit: number): Promise<Artwork[]> {
    const cacheKey = `rijks-${query}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const rijksUrl = `https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&q=${encodeURIComponent(query || 'painting')}&imgonly=true&ps=${limit * 2}`;
      log.debug('Searching Rijksmuseum', { url: rijksUrl });

      const rijksResponse = await fetch(rijksUrl);
      const contentType = rijksResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        log.warn('Rijksmuseum API returned non-JSON response');
        return [];
      }

      const rijksData = (await rijksResponse.json()) as {
        count?: number;
        artObjects?: Array<{
          objectNumber: string;
          title?: string;
          principalOrFirstMaker?: string;
          longTitle?: string;
          webImage?: { url?: string };
          headerImage?: { url?: string };
        }>;
      };
      log.debug('Rijksmuseum search results', { total: rijksData.count ?? 0 });

      if (!rijksData.artObjects || rijksData.artObjects.length === 0) {
        return [];
      }

      const artworks = rijksData.artObjects
        .filter((artwork) => {
          if (!artwork.webImage?.url) return false;
          // Rijksmuseum doesn't provide detailed type info in search results,
          // so filter by title only
          return isOriginalArtwork(artwork.title, '', '', '', '');
        })
        .slice(0, limit)
        .map((artwork) => ({
          id: `rijks-${artwork.objectNumber}`,
          title: artwork.title ?? 'Untitled',
          artist: artwork.principalOrFirstMaker ?? 'Unknown Artist',
          date: artwork.longTitle?.match(/\d{4}/)?.[0] ?? '',
          imageUrl: artwork.webImage?.url ?? '',
          thumbnailUrl: artwork.headerImage?.url ?? artwork.webImage?.url ?? '',
          department: '',
          culture: '',
          source: 'Rijksmuseum',
        }));

      log.debug('Rijksmuseum returned artworks', { count: artworks.length });
      cache.set(cacheKey, artworks);
      return artworks;
    } catch (error) {
      log.error('Error searching Rijksmuseum', { error: getErrorMessage(error) });
      return [];
    }
  },
};
