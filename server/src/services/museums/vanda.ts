/**
 * Victoria & Albert Museum Adapter
 * Search the V&A collection
 */

import type { Artwork } from '../../types';
import type { MuseumAdapter } from './types';
import { isOriginalArtwork } from './art-filter';
import { loggers } from '../logger';
import { TtlCache, TTL, getErrorMessage } from '../../utils';

const log = loggers.api;
const cache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_DAY });

export const vandaAdapter: MuseumAdapter = {
  id: 'vam',
  name: 'Victoria & Albert Museum',

  async search(query: string, limit: number): Promise<Artwork[]> {
    const cacheKey = `vam-${query}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const vamUrl = `https://api.vam.ac.uk/v2/objects/search?q=${encodeURIComponent(query || 'painting')}&images_exist=true&page_size=${limit * 2}`;
      log.debug('Searching Victoria & Albert Museum', { url: vamUrl });

      const vamResponse = await fetch(vamUrl);
      const contentType = vamResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        log.warn('V&A API returned non-JSON response');
        return [];
      }

      const vamData = (await vamResponse.json()) as {
        info?: { record_count?: number };
        records?: Array<{
          systemNumber: string;
          _primaryImageId?: string;
          _primaryTitle?: string;
          _primaryMaker?: { name?: string };
          _primaryDate?: string;
          _objectType?: string;
        }>;
      };
      log.debug('V&A search results', { total: vamData.info?.record_count ?? 0 });

      if (!vamData.records || vamData.records.length === 0) {
        return [];
      }

      const artworks = vamData.records
        .filter((artwork) => {
          if (!artwork._primaryImageId) return false;
          return isOriginalArtwork(
            artwork._primaryTitle,
            '',
            artwork._objectType ?? '',
            '',
            artwork._objectType ?? ''
          );
        })
        .slice(0, limit)
        .map((artwork) => ({
          id: `vam-${artwork.systemNumber}`,
          title: artwork._primaryTitle ?? 'Untitled',
          artist: artwork._primaryMaker?.name ?? 'Unknown Artist',
          date: artwork._primaryDate ?? '',
          imageUrl: `https://framemark.vam.ac.uk/collections/${artwork._primaryImageId}/full/!1200,1200/0/default.jpg`,
          thumbnailUrl: `https://framemark.vam.ac.uk/collections/${artwork._primaryImageId}/full/!400,400/0/default.jpg`,
          department: '',
          culture: '',
          source: 'Victoria & Albert Museum',
        }));

      log.debug('V&A returned artworks', { count: artworks.length });
      cache.set(cacheKey, artworks);
      return artworks;
    } catch (error) {
      log.error('Error searching V&A', { error: getErrorMessage(error) });
      return [];
    }
  },
};
