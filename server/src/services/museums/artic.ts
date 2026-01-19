/**
 * Art Institute of Chicago Adapter
 * Search the Art Institute of Chicago collection
 */

import type { Artwork } from '../../types';
import type { MuseumAdapter } from './types';
import { isOriginalArtwork } from './art-filter';
import { loggers } from '../logger';
import { TtlCache, TTL, getErrorMessage } from '../../utils';

const log = loggers.api;
const cache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_DAY });

export const articAdapter: MuseumAdapter = {
  id: 'artic',
  name: 'Art Institute of Chicago',

  async search(query: string, limit: number): Promise<Artwork[]> {
    const cacheKey = `artic-${query}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const articUrl = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query || 'painting')}&limit=${limit * 3}&fields=id,title,artist_display,date_display,image_id,is_public_domain,department_title,artwork_type_title,classification_title,medium_display`;
      log.debug('Searching Art Institute of Chicago', { url: articUrl });

      const articResponse = await fetch(articUrl);
      const contentType = articResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        log.warn('ARTIC API returned non-JSON response');
        return [];
      }

      const articData = (await articResponse.json()) as {
        pagination?: { total?: number };
        data?: Array<{
          id: number;
          title?: string;
          artist_display?: string;
          date_display?: string;
          image_id?: string;
          is_public_domain?: boolean;
          department_title?: string;
          artwork_type_title?: string;
          classification_title?: string;
          medium_display?: string;
        }>;
      };
      log.debug('ARTIC search results', { total: articData.pagination?.total ?? 0 });

      if (!articData.data || articData.data.length === 0) {
        return [];
      }

      const artworks = articData.data
        .filter((artwork) => {
          if (!artwork.image_id || !artwork.department_title) {
            return false;
          }
          return isOriginalArtwork(
            artwork.title,
            artwork.classification_title,
            artwork.artwork_type_title,
            artwork.medium_display,
            artwork.artwork_type_title
          );
        })
        .slice(0, limit)
        .map((artwork) => ({
          id: `artic-${artwork.id}`,
          title: artwork.title ?? 'Untitled',
          artist: artwork.artist_display ?? 'Unknown Artist',
          date: artwork.date_display ?? '',
          imageUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/1200,/0/default.jpg`,
          thumbnailUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/400,/0/default.jpg`,
          department: artwork.department_title ?? '',
          culture: '',
          source: 'Art Institute of Chicago',
        }));

      log.debug('ARTIC returned artworks', { count: artworks.length });
      cache.set(cacheKey, artworks);
      return artworks;
    } catch (error) {
      log.error('Error searching ARTIC', { error: getErrorMessage(error) });
      return [];
    }
  },
};
