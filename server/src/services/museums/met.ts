/**
 * Met Museum Adapter
 * Search the Metropolitan Museum of Art collection
 */

import type { Artwork } from '../../types';
import type { MuseumAdapter } from './types';
import { ART_DEPARTMENTS } from './types';
import { isOriginalArtwork } from './art-filter';
import { loggers } from '../logger';
import { TtlCache, TTL, getErrorMessage } from '../../utils';

const log = loggers.api;
const cache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_DAY });

export const metAdapter: MuseumAdapter = {
  id: 'met',
  name: 'The Met Museum',

  async search(query: string, limit: number): Promise<Artwork[]> {
    const cacheKey = `met-${query}-${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query || 'painting')}`;
      log.debug('Searching Met Museum', { url: searchUrl });

      const searchResponse = await fetch(searchUrl);
      const contentType = searchResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        log.warn('Met API returned non-JSON response', {
          reason: 'likely rate limited or error',
        });
        return [];
      }

      const searchData = (await searchResponse.json()) as {
        total?: number;
        objectIDs?: number[];
      };
      log.debug('Met search results', { total: searchData.total ?? 0 });

      if (!searchData.objectIDs || searchData.objectIDs.length === 0) {
        return [];
      }

      const objectIds = searchData.objectIDs.slice(0, limit * 10);
      const artworks: Artwork[] = [];

      for (const objectId of objectIds) {
        if (artworks.length >= limit) break;

        try {
          const objectUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`;
          const objectResponse = await fetch(objectUrl);

          const objectContentType = objectResponse.headers.get('content-type');
          if (!objectContentType || !objectContentType.includes('application/json')) {
            continue;
          }

          const objectData = (await objectResponse.json()) as {
            objectID: number;
            title?: string;
            artistDisplayName?: string;
            artistDisplayBio?: string;
            objectDate?: string;
            primaryImage?: string;
            primaryImageSmall?: string;
            department?: string;
            culture?: string;
            classification?: string;
            objectName?: string;
            medium?: string;
            dimensions?: string;
            isPublicDomain?: boolean;
          };

          const hasImage = objectData.primaryImage;
          const isArtDept = ART_DEPARTMENTS.includes(objectData.department ?? '');
          const isPublicOrMuseumQuality = objectData.isPublicDomain || isArtDept;
          const isOriginal = isOriginalArtwork(
            objectData.title,
            objectData.classification,
            objectData.objectName,
            objectData.medium,
            objectData.objectName
          );

          if (hasImage && isPublicOrMuseumQuality && isArtDept && isOriginal) {
            artworks.push({
              id: `met-${objectData.objectID}`,
              title: objectData.title ?? 'Untitled',
              artist: objectData.artistDisplayName ?? 'Unknown Artist',
              artistBio: objectData.artistDisplayBio ?? '',
              date: objectData.objectDate ?? '',
              imageUrl: objectData.primaryImage ?? '',
              thumbnailUrl: objectData.primaryImageSmall ?? objectData.primaryImage ?? '',
              department: objectData.department ?? '',
              culture: objectData.culture ?? '',
              medium: objectData.medium ?? '',
              dimensions: objectData.dimensions ?? '',
              source: 'The Met Museum',
            });
          }
        } catch {
          continue;
        }
      }

      log.debug('Met Museum returned artworks', { count: artworks.length });
      cache.set(cacheKey, artworks);
      return artworks;
    } catch (error) {
      log.error('Error searching Met Museum', { error: getErrorMessage(error) });
      return [];
    }
  },
};
