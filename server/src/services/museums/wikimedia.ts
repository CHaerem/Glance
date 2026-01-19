/**
 * Wikimedia Commons Adapter
 * Search Wikimedia Commons for artwork images
 */

import type { Artwork } from '../../types';
import type { MuseumAdapter } from './types';
import { loggers } from '../logger';
import { TtlCache, TTL, getErrorMessage } from '../../utils';

const log = loggers.api;
const cache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_DAY });

export const wikimediaAdapter: MuseumAdapter = {
  id: 'wikimedia',
  name: 'Wikimedia Commons',

  async search(query: string, limit: number): Promise<Artwork[]> {
    const cacheKey = `wikimedia-${query}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const wikimediaUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${query || 'painting'} filetype:bitmap`)}&srnamespace=6&srlimit=${limit * 3}&format=json&origin=*`;
      log.debug('Searching Wikimedia Commons', { url: wikimediaUrl });

      const wikimediaResponse = await fetch(wikimediaUrl);
      const contentType = wikimediaResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        log.warn('Wikimedia API returned non-JSON response');
        return [];
      }

      const wikimediaData = (await wikimediaResponse.json()) as {
        query?: {
          search?: Array<{
            pageid: number;
            title: string;
          }>;
        };
      };
      log.debug('Wikimedia search results', {
        count: wikimediaData.query?.search?.length ?? 0,
      });

      if (!wikimediaData.query?.search || wikimediaData.query.search.length === 0) {
        return [];
      }

      const artworks: Artwork[] = [];
      for (const result of wikimediaData.query.search.slice(0, limit)) {
        const title = result.title.replace('File:', '');
        if (title.match(/\.(jpg|jpeg|png)$/i)) {
          const artistMatch = title.match(/^([^-]+)/);
          const titleMatch = title.match(/-\s*(.+?)(?:\s*-|\.)/);

          artworks.push({
            id: `wikimedia-${result.pageid}`,
            title: titleMatch?.[1] ?? title.replace(/\.[^.]+$/, ''),
            artist: artistMatch?.[1]?.trim() ?? 'Unknown Artist',
            date: '',
            imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=1200`,
            thumbnailUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=400`,
            department: '',
            culture: '',
            source: 'Wikimedia Commons',
          });
        }
      }

      log.debug('Wikimedia returned artworks', { count: artworks.length });
      cache.set(cacheKey, artworks);
      return artworks;
    } catch (error) {
      log.error('Error searching Wikimedia', { error: getErrorMessage(error) });
      return [];
    }
  },
};
