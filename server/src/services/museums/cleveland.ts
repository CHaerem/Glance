/**
 * Cleveland Museum of Art Adapter
 * Search the Cleveland Museum of Art collection
 */

import type { Artwork } from '../../types';
import type { MuseumAdapter } from './types';
import { isOriginalArtwork } from './art-filter';
import { loggers } from '../logger';
import { TtlCache, TTL, getErrorMessage } from '../../utils';

const log = loggers.api;
const cache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_DAY });

export const clevelandAdapter: MuseumAdapter = {
  id: 'cleveland',
  name: 'Cleveland Museum of Art',

  async search(query: string, limit: number): Promise<Artwork[]> {
    const cacheKey = `cma-${query}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const cmaUrl = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query || 'painting')}&cc=1&has_image=1&limit=${limit * 3}`;
      log.debug('Searching Cleveland Museum', { url: cmaUrl });

      const cmaResponse = await fetch(cmaUrl);
      const contentType = cmaResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        log.warn('Cleveland API returned non-JSON response');
        return [];
      }

      const cmaData = (await cmaResponse.json()) as {
        info?: { total?: number };
        data?: Array<{
          id: number;
          title?: string;
          creators?: Array<{ description?: string }>;
          creation_date?: string;
          images?: { web?: { url?: string } };
          department?: string;
          culture?: string[];
          type?: string;
          technique?: string;
        }>;
      };
      log.debug('Cleveland search results', { total: cmaData.info?.total ?? 0 });

      if (!cmaData.data || cmaData.data.length === 0) {
        return [];
      }

      const artworks = cmaData.data
        .filter((artwork) => {
          if (!artwork.images?.web?.url) return false;
          return isOriginalArtwork(
            artwork.title,
            artwork.type,
            artwork.technique,
            artwork.technique,
            artwork.type
          );
        })
        .slice(0, limit)
        .map((artwork) => ({
          id: `cma-${artwork.id}`,
          title: artwork.title ?? 'Untitled',
          artist: artwork.creators?.map((c) => c.description).join(', ') ?? 'Unknown Artist',
          date: artwork.creation_date ?? '',
          imageUrl: artwork.images?.web?.url ?? '',
          thumbnailUrl: artwork.images?.web?.url ?? '',
          department: artwork.department ?? '',
          culture: artwork.culture?.[0] ?? '',
          source: 'Cleveland Museum of Art',
        }));

      log.debug('Cleveland returned artworks', { count: artworks.length });
      cache.set(cacheKey, artworks);
      return artworks;
    } catch (error) {
      log.error('Error searching Cleveland Museum', { error: getErrorMessage(error) });
      return [];
    }
  },
};
