/**
 * Harvard Art Museums Adapter
 * Search the Harvard Art Museums collection
 */

import type { Artwork } from '../../types';
import type { MuseumAdapter } from './types';
import { isOriginalArtwork } from './art-filter';
import { loggers } from '../logger';
import { TtlCache, TTL, getErrorMessage } from '../../utils';

const log = loggers.api;
const cache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_DAY });

export const harvardAdapter: MuseumAdapter = {
  id: 'harvard',
  name: 'Harvard Art Museums',

  async search(query: string, limit: number): Promise<Artwork[]> {
    const cacheKey = `harvard-${query}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const harvardUrl = `https://api.harvardartmuseums.org/object?apikey=0d2b2e70-e1a4-11ea-8f9e-c3ccf15bc2e2&q=${encodeURIComponent(query || 'painting')}&hasimage=1&size=${limit * 2}`;
      log.debug('Searching Harvard Art Museums', { url: harvardUrl });

      const harvardResponse = await fetch(harvardUrl);
      const contentType = harvardResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        log.warn('Harvard API returned non-JSON response');
        return [];
      }

      const harvardData = (await harvardResponse.json()) as {
        info?: { totalrecords?: number };
        records?: Array<{
          id: number;
          title?: string;
          people?: Array<{ displayname?: string }>;
          dated?: string;
          primaryimageurl?: string;
          division?: string;
          culture?: string;
          classification?: string;
          technique?: string;
          medium?: string;
        }>;
      };
      log.debug('Harvard search results', { total: harvardData.info?.totalrecords ?? 0 });

      if (!harvardData.records || harvardData.records.length === 0) {
        return [];
      }

      const artworks = harvardData.records
        .filter((artwork) => {
          if (!artwork.primaryimageurl) return false;
          return isOriginalArtwork(
            artwork.title,
            artwork.classification ?? '',
            artwork.technique ?? '',
            artwork.medium ?? '',
            artwork.classification ?? ''
          );
        })
        .slice(0, limit)
        .map((artwork) => ({
          id: `harvard-${artwork.id}`,
          title: artwork.title ?? 'Untitled',
          artist: artwork.people?.map((p) => p.displayname).join(', ') ?? 'Unknown Artist',
          date: artwork.dated ?? '',
          imageUrl: artwork.primaryimageurl ?? '',
          thumbnailUrl: artwork.primaryimageurl ?? '',
          department: artwork.division ?? '',
          culture: artwork.culture ?? '',
          source: 'Harvard Art Museums',
        }));

      log.debug('Harvard returned artworks', { count: artworks.length });
      cache.set(cacheKey, artworks);
      return artworks;
    } catch (error) {
      log.error('Error searching Harvard', { error: getErrorMessage(error) });
      return [];
    }
  },
};
