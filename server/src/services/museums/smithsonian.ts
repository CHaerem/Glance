/**
 * Smithsonian Adapter
 * Search the Smithsonian Institution collections
 */

import type { Artwork } from '../../types';
import type { MuseumAdapter } from './types';
import { isOriginalArtwork } from './art-filter';
import { loggers } from '../logger';
import { TtlCache, TTL, getErrorMessage } from '../../utils';

const log = loggers.api;
const cache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_DAY });

export const smithsonianAdapter: MuseumAdapter = {
  id: 'smithsonian',
  name: 'Smithsonian',

  async search(query: string, limit: number): Promise<Artwork[]> {
    const cacheKey = `smithsonian-${query}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const smithsonianUrl = `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(query || 'painting')}&rows=${limit * 2}&api_key=nqVVclBbPSvTQNlHGUTKfwj8xOxnCz7cPf0zQ3Xu`;
      log.debug('Searching Smithsonian', { url: smithsonianUrl });

      const smithsonianResponse = await fetch(smithsonianUrl);
      const contentType = smithsonianResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        log.warn('Smithsonian API returned non-JSON response');
        return [];
      }

      const smithsonianData = (await smithsonianResponse.json()) as {
        response?: {
          rowCount?: number;
          rows?: Array<{
            id: string;
            content?: {
              descriptiveNonRepeating?: {
                title?: { content?: string };
                online_media?: {
                  media?: Array<{ content?: string }>;
                };
              };
              freetext?: {
                name?: Array<{ label?: string; content?: string }>;
                date?: Array<{ content?: string }>;
                objectType?: Array<{ content?: string }>;
                physicalDescription?: Array<{ content?: string }>;
                dataSource?: Array<{ content?: string }>;
              };
            };
          }>;
        };
      };
      log.debug('Smithsonian search results', { total: smithsonianData.response?.rowCount ?? 0 });

      if (!smithsonianData.response?.rows || smithsonianData.response.rows.length === 0) {
        return [];
      }

      const artworks = smithsonianData.response.rows
        .filter((row) => {
          const content = row.content;
          if (!content?.descriptiveNonRepeating?.online_media?.media?.[0]?.content) {
            return false;
          }
          const title = content.descriptiveNonRepeating?.title?.content ?? '';
          const objectType = content.freetext?.objectType?.[0]?.content ?? '';
          const physicalDescription = content.freetext?.physicalDescription?.[0]?.content ?? '';
          return isOriginalArtwork(title, '', objectType, physicalDescription, objectType);
        })
        .slice(0, limit)
        .map((row) => {
          const content = row.content;
          const title = content?.descriptiveNonRepeating?.title?.content ?? 'Untitled';
          const imageUrl = content?.descriptiveNonRepeating?.online_media?.media?.[0]?.content ?? '';

          let artist = 'Unknown Artist';
          if (content?.freetext?.name) {
            const artistEntry = content.freetext.name.find((n) => n.label === 'Artist');
            if (artistEntry) artist = artistEntry.content ?? artist;
          }

          return {
            id: `smithsonian-${row.id}`,
            title,
            artist,
            date: content?.freetext?.date?.[0]?.content ?? '',
            imageUrl,
            thumbnailUrl: imageUrl,
            department: content?.freetext?.dataSource?.[0]?.content ?? '',
            culture: '',
            source: 'Smithsonian',
          };
        });

      log.debug('Smithsonian returned artworks', { count: artworks.length });
      cache.set(cacheKey, artworks);
      return artworks;
    } catch (error) {
      log.error('Error searching Smithsonian', { error: getErrorMessage(error) });
      return [];
    }
  },
};
