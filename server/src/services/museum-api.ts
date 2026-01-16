/**
 * Museum API Service
 * Handles searching across multiple museum APIs for artwork
 */

import * as fs from 'fs';
import * as path from 'path';
import statistics from './statistics';
import { loggers } from './logger';
import { TtlCache, TTL, getErrorMessage } from '../utils';
import type { Artwork } from '../types';
import { searchLocalLibrary, isLocalLibraryAvailable } from './local-library';

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
const CURATED_COLLECTIONS: CuratedCollections = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'data', 'curated-collections.json'),
    'utf8'
  )
);

// Cache for museum API responses (24 hour TTL)
const artSearchCache = new TtlCache<Artwork[]>({ ttl: TTL.ONE_DAY });

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

  // Art departments to include (paintings, drawings, prints - not decorative objects)
  const artDepartments = [
    'European Paintings',
    'Modern and Contemporary Art',
    'Drawings and Prints',
    'Asian Art',
    'American Paintings and Sculpture',
    'The Robert Lehman Collection',
    'Photographs',
  ];

  // Helper function to check if item is actual art (not furniture, ceramics, etc.)
  const isOriginalArtwork = (
    title: string | null | undefined,
    classification: string | null | undefined,
    objectName: string | null | undefined,
    medium: string | null | undefined,
    objectType: string | null | undefined
  ): boolean => {
    const lowerTitle = (title ?? '').toLowerCase();
    const lowerClass = (classification ?? '').toLowerCase();
    const lowerObject = (objectName ?? '').toLowerCase();
    const lowerMedium = (medium ?? '').toLowerCase();
    const lowerType = (objectType ?? '').toLowerCase();

    const allText = `${lowerTitle} ${lowerClass} ${lowerObject} ${lowerMedium} ${lowerType}`;

    // Exclude book pages, photographs of objects, etc.
    const hardExcludeTerms = [
      'page from a book',
      'page from an album',
      'photograph of',
      'illustrated book',
      'title page',
      'frontispiece',
      'book cover',
    ];

    for (const term of hardExcludeTerms) {
      if (allText.includes(term)) {
        log.debug('Filtering out item', { title, reason: 'hard exclude', term });
        return false;
      }
    }

    // Exclude non-art object types (furniture, decorative arts, sculptures, etc.)
    // We focus on 2D art (paintings, drawings, prints) as they display best on e-ink
    const excludeObjectTypes = [
      'furniture',
      'table',
      'chair',
      'desk',
      'cabinet',
      'chest',
      'bed',
      'bench',
      'stool',
      'armchair',
      'ceramic',
      'ceramics',
      'pottery',
      'porcelain',
      'vase',
      'bowl',
      'plate',
      'dish',
      'cup',
      'teapot',
      'jar',
      'textile',
      'costume',
      'dress',
      'robe',
      'coat',
      'tapestry',
      'carpet',
      'rug',
      'embroidery',
      'lace',
      'jewelry',
      'jewellery',
      'necklace',
      'ring',
      'bracelet',
      'brooch',
      'pendant',
      'earring',
      'metalwork',
      'silverware',
      'goldwork',
      'bronze object',
      'copper object',
      'glass',
      'glassware',
      'bottle',
      'goblet',
      'clock',
      'watch',
      'timepiece',
      'weapon',
      'sword',
      'armor',
      'armour',
      'shield',
      'dagger',
      'gun',
      'pistol',
      'coin',
      'medal',
      'medallion',
      'numismatic',
      'tool',
      'implement',
      'utensil',
      'spoon',
      'fork',
      'knife',
      'figurine',
      'statuette',
      'ornament',
      'decorative object',
      'mask',
      'helmet',
      'musical instrument',
      'piano',
      'violin',
      'guitar',
      'model',
      'miniature model',
      'manuscript',
      'document',
      'letter',
      'certificate',
      'tile',
      'tiles',
      'sculpture',
      'sculpted',
      'bronze',
      'marble statue',
      'stone carving',
      'relief',
    ];

    for (const term of excludeObjectTypes) {
      if (
        lowerObject.includes(term) ||
        lowerClass.includes(term) ||
        lowerType.includes(term)
      ) {
        log.debug('Filtering out item', { title, reason: 'object type', term });
        return false;
      }
    }

    // Also check title for obvious non-art items
    const titleExcludes = [
      'chair',
      'table',
      'cabinet',
      'vase',
      'bowl',
      'plate',
      'teapot',
      'cup and saucer',
      'dress',
      'robe',
      'costume',
      'textile fragment',
      'carpet',
      'rug',
      'necklace',
      'ring',
      'bracelet',
      'brooch',
      'earrings',
      'clock',
      'watch',
      'sword',
      'dagger',
      'armor',
      'helmet',
      'coin',
      'medal',
      'spoon',
      'fork',
      'knife',
      'tile',
    ];

    for (const term of titleExcludes) {
      if (
        lowerTitle.includes(term) &&
        !lowerTitle.includes('painting') &&
        !lowerTitle.includes('portrait')
      ) {
        log.debug('Filtering out item', {
          title,
          reason: 'title suggests non-art',
          term,
        });
        return false;
      }
    }

    return true;
  };

  // Helper to search Met Museum
  const searchMet = async (): Promise<Artwork[]> => {
    const cacheKey = `met-${query}-${targetCount}`;
    const cached = artSearchCache.get(cacheKey);
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

      const objectIds = searchData.objectIDs.slice(0, targetCount * 10);
      const metArtworks: Artwork[] = [];

      for (const objectId of objectIds) {
        if (metArtworks.length >= targetCount) break;

        try {
          const objectUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`;
          const objectResponse = await fetch(objectUrl);

          const objectContentType = objectResponse.headers.get('content-type');
          if (
            !objectContentType ||
            !objectContentType.includes('application/json')
          ) {
            continue;
          }

          const objectData = (await objectResponse.json()) as {
            objectID: number;
            title?: string;
            artistDisplayName?: string;
            objectDate?: string;
            primaryImage?: string;
            primaryImageSmall?: string;
            department?: string;
            culture?: string;
            classification?: string;
            objectName?: string;
            medium?: string;
            isPublicDomain?: boolean;
          };
          const hasImage = objectData.primaryImage;
          const isArtDept = artDepartments.includes(objectData.department ?? '');
          const isPublicOrMuseumQuality =
            objectData.isPublicDomain || isArtDept;
          const isOriginal = isOriginalArtwork(
            objectData.title,
            objectData.classification,
            objectData.objectName,
            objectData.medium,
            objectData.objectName // objectType
          );

          if (hasImage && isPublicOrMuseumQuality && isArtDept && isOriginal) {
            metArtworks.push({
              id: `met-${objectData.objectID}`,
              title: objectData.title ?? 'Untitled',
              artist: objectData.artistDisplayName ?? 'Unknown Artist',
              date: objectData.objectDate ?? '',
              imageUrl: objectData.primaryImage ?? '',
              thumbnailUrl:
                objectData.primaryImageSmall ?? objectData.primaryImage ?? '',
              department: objectData.department ?? '',
              culture: objectData.culture ?? '',
              source: 'The Met Museum',
            });
          }
        } catch {
          continue;
        }
      }

      log.debug('Met Museum returned artworks', { count: metArtworks.length });
      artSearchCache.set(cacheKey, metArtworks);
      return metArtworks;
    } catch (error) {
      log.error('Error searching Met Museum', {
        error: getErrorMessage(error),
      });
      return [];
    }
  };

  // Helper to search Art Institute of Chicago
  const searchArtic = async (): Promise<Artwork[]> => {
    const cacheKey = `artic-${query}-${targetCount}`;
    const cached = artSearchCache.get(cacheKey);
    if (cached) return cached;

    try {
      const articUrl = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query || 'painting')}&limit=${targetCount * 3}&fields=id,title,artist_display,date_display,image_id,is_public_domain,department_title,artwork_type_title,classification_title,medium_display`;
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
      log.debug('ARTIC search results', {
        total: articData.pagination?.total ?? 0,
      });

      if (!articData.data || articData.data.length === 0) {
        return [];
      }

      const articArtworks = articData.data
        .filter((artwork) => {
          if (!artwork.image_id || !artwork.department_title) {
            return false;
          }
          return isOriginalArtwork(
            artwork.title,
            artwork.classification_title,
            artwork.artwork_type_title,
            artwork.medium_display,
            artwork.artwork_type_title // objectType
          );
        })
        .slice(0, targetCount)
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

      log.debug('ARTIC returned artworks', { count: articArtworks.length });
      artSearchCache.set(cacheKey, articArtworks);
      return articArtworks;
    } catch (error) {
      log.error('Error searching ARTIC', {
        error: getErrorMessage(error),
      });
      return [];
    }
  };

  // Helper to search Cleveland Museum of Art
  const searchCleveland = async (): Promise<Artwork[]> => {
    const cacheKey = `cma-${query}-${targetCount}`;
    const cached = artSearchCache.get(cacheKey);
    if (cached) return cached;

    try {
      const cmaUrl = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query || 'painting')}&cc=1&has_image=1&limit=${targetCount * 3}`;
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

      const cmaArtworks = cmaData.data
        .filter((artwork) => {
          if (!artwork.images?.web?.url) return false;
          return isOriginalArtwork(
            artwork.title,
            artwork.type,
            artwork.technique,
            artwork.technique,
            artwork.type // objectType
          );
        })
        .slice(0, targetCount)
        .map((artwork) => ({
          id: `cma-${artwork.id}`,
          title: artwork.title ?? 'Untitled',
          artist:
            artwork.creators?.map((c) => c.description).join(', ') ??
            'Unknown Artist',
          date: artwork.creation_date ?? '',
          imageUrl: artwork.images?.web?.url ?? '',
          thumbnailUrl: artwork.images?.web?.url ?? '',
          department: artwork.department ?? '',
          culture: artwork.culture?.[0] ?? '',
          source: 'Cleveland Museum of Art',
        }));

      log.debug('Cleveland returned artworks', { count: cmaArtworks.length });
      artSearchCache.set(cacheKey, cmaArtworks);
      return cmaArtworks;
    } catch (error) {
      log.error('Error searching Cleveland Museum', {
        error: getErrorMessage(error),
      });
      return [];
    }
  };

  // Helper to search Rijksmuseum
  const searchRijksmuseum = async (): Promise<Artwork[]> => {
    const cacheKey = `rijks-${query}-${targetCount}`;
    const cached = artSearchCache.get(cacheKey);
    if (cached) return cached;

    try {
      const rijksUrl = `https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&q=${encodeURIComponent(query || 'painting')}&imgonly=true&ps=${targetCount * 2}`;
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

      const rijksArtworks = rijksData.artObjects
        .filter((artwork) => {
          if (!artwork.webImage?.url) return false;
          // Rijksmuseum doesn't provide detailed type info in search results,
          // so filter by title
          return isOriginalArtwork(
            artwork.title,
            '', // classification
            '', // objectName
            '', // medium
            '' // objectType
          );
        })
        .slice(0, targetCount)
        .map((artwork) => ({
          id: `rijks-${artwork.objectNumber}`,
          title: artwork.title ?? 'Untitled',
          artist: artwork.principalOrFirstMaker ?? 'Unknown Artist',
          date: artwork.longTitle?.match(/\d{4}/)?.[0] ?? '',
          imageUrl: artwork.webImage?.url ?? '',
          thumbnailUrl:
            artwork.headerImage?.url ?? artwork.webImage?.url ?? '',
          department: '',
          culture: '',
          source: 'Rijksmuseum',
        }));

      log.debug('Rijksmuseum returned artworks', { count: rijksArtworks.length });
      artSearchCache.set(cacheKey, rijksArtworks);
      return rijksArtworks;
    } catch (error) {
      log.error('Error searching Rijksmuseum', {
        error: getErrorMessage(error),
      });
      return [];
    }
  };

  // Helper to search Wikimedia Commons
  const searchWikimedia = async (): Promise<Artwork[]> => {
    const cacheKey = `wikimedia-${query}-${targetCount}`;
    const cached = artSearchCache.get(cacheKey);
    if (cached) return cached;

    try {
      const wikimediaUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${query || 'painting'} filetype:bitmap`)}&srnamespace=6&srlimit=${targetCount * 3}&format=json&origin=*`;
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

      if (
        !wikimediaData.query?.search ||
        wikimediaData.query.search.length === 0
      ) {
        return [];
      }

      const wikimediaArtworks: Artwork[] = [];
      for (const result of wikimediaData.query.search.slice(0, targetCount)) {
        const title = result.title.replace('File:', '');
        if (title.match(/\.(jpg|jpeg|png)$/i)) {
          const artistMatch = title.match(/^([^-]+)/);
          const titleMatch = title.match(/-\s*(.+?)(?:\s*-|\.)/);

          wikimediaArtworks.push({
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

      log.debug('Wikimedia returned artworks', {
        count: wikimediaArtworks.length,
      });
      artSearchCache.set(cacheKey, wikimediaArtworks);
      return wikimediaArtworks;
    } catch (error) {
      log.error('Error searching Wikimedia', {
        error: getErrorMessage(error),
      });
      return [];
    }
  };

  // Helper to search Victoria & Albert Museum
  const searchVictoriaAlbert = async (): Promise<Artwork[]> => {
    const cacheKey = `vam-${query}-${targetCount}`;
    const cached = artSearchCache.get(cacheKey);
    if (cached) return cached;

    try {
      const vamUrl = `https://api.vam.ac.uk/v2/objects/search?q=${encodeURIComponent(query || 'painting')}&images_exist=true&page_size=${targetCount * 2}`;
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
      log.debug('V&A search results', {
        total: vamData.info?.record_count ?? 0,
      });

      if (!vamData.records || vamData.records.length === 0) {
        return [];
      }

      const vamArtworks = vamData.records
        .filter((artwork) => {
          if (!artwork._primaryImageId) return false;
          return isOriginalArtwork(
            artwork._primaryTitle,
            '', // classification
            artwork._objectType ?? '', // objectName
            '', // medium
            artwork._objectType ?? '' // objectType
          );
        })
        .slice(0, targetCount)
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

      log.debug('V&A returned artworks', { count: vamArtworks.length });
      artSearchCache.set(cacheKey, vamArtworks);
      return vamArtworks;
    } catch (error) {
      log.error('Error searching V&A', {
        error: getErrorMessage(error),
      });
      return [];
    }
  };

  // Helper to search Harvard Art Museums
  const searchHarvard = async (): Promise<Artwork[]> => {
    const cacheKey = `harvard-${query}-${targetCount}`;
    const cached = artSearchCache.get(cacheKey);
    if (cached) return cached;

    try {
      const harvardUrl = `https://api.harvardartmuseums.org/object?apikey=0d2b2e70-e1a4-11ea-8f9e-c3ccf15bc2e2&q=${encodeURIComponent(query || 'painting')}&hasimage=1&size=${targetCount * 2}`;
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
      log.debug('Harvard search results', {
        total: harvardData.info?.totalrecords ?? 0,
      });

      if (!harvardData.records || harvardData.records.length === 0) {
        return [];
      }

      const harvardArtworks = harvardData.records
        .filter((artwork) => {
          if (!artwork.primaryimageurl) return false;
          return isOriginalArtwork(
            artwork.title,
            artwork.classification ?? '',
            artwork.technique ?? '',
            artwork.medium ?? '',
            artwork.classification ?? '' // objectType
          );
        })
        .slice(0, targetCount)
        .map((artwork) => ({
          id: `harvard-${artwork.id}`,
          title: artwork.title ?? 'Untitled',
          artist:
            artwork.people?.map((p) => p.displayname).join(', ') ??
            'Unknown Artist',
          date: artwork.dated ?? '',
          imageUrl: artwork.primaryimageurl ?? '',
          thumbnailUrl: artwork.primaryimageurl ?? '',
          department: artwork.division ?? '',
          culture: artwork.culture ?? '',
          source: 'Harvard Art Museums',
        }));

      log.debug('Harvard returned artworks', { count: harvardArtworks.length });
      artSearchCache.set(cacheKey, harvardArtworks);
      return harvardArtworks;
    } catch (error) {
      log.error('Error searching Harvard', {
        error: getErrorMessage(error),
      });
      return [];
    }
  };

  // Helper to search Smithsonian
  const searchSmithsonian = async (): Promise<Artwork[]> => {
    const cacheKey = `smithsonian-${query}-${targetCount}`;
    const cached = artSearchCache.get(cacheKey);
    if (cached) return cached;

    try {
      const smithsonianUrl = `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(query || 'painting')}&rows=${targetCount * 2}&api_key=nqVVclBbPSvTQNlHGUTKfwj8xOxnCz7cPf0zQ3Xu`;
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
      log.debug('Smithsonian search results', {
        total: smithsonianData.response?.rowCount ?? 0,
      });

      if (
        !smithsonianData.response?.rows ||
        smithsonianData.response.rows.length === 0
      ) {
        return [];
      }

      const smithsonianArtworks = smithsonianData.response.rows
        .filter((row) => {
          const content = row.content;
          if (
            !content?.descriptiveNonRepeating?.online_media?.media?.[0]?.content
          ) {
            return false;
          }
          const title =
            content.descriptiveNonRepeating?.title?.content ?? '';
          const objectType =
            content.freetext?.objectType?.[0]?.content ?? '';
          const physicalDescription =
            content.freetext?.physicalDescription?.[0]?.content ?? '';
          return isOriginalArtwork(
            title,
            '', // classification
            objectType, // objectName
            physicalDescription, // medium
            objectType // objectType
          );
        })
        .slice(0, targetCount)
        .map((row) => {
          const content = row.content;
          const title =
            content?.descriptiveNonRepeating?.title?.content ?? 'Untitled';
          const imageUrl =
            content?.descriptiveNonRepeating?.online_media?.media?.[0]
              ?.content ?? '';

          let artist = 'Unknown Artist';
          if (content?.freetext?.name) {
            const artistEntry = content.freetext.name.find(
              (n) => n.label === 'Artist'
            );
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

      log.debug('Smithsonian returned artworks', {
        count: smithsonianArtworks.length,
      });
      artSearchCache.set(cacheKey, smithsonianArtworks);
      return smithsonianArtworks;
    } catch (error) {
      log.error('Error searching Smithsonian', {
        error: getErrorMessage(error),
      });
      return [];
    }
  };

  // Search all sources in parallel with API tracking
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

  // Run all searches in parallel (including local library if available)
  const [
    metResults,
    articResults,
    cmaResults,
    rijksResults,
    wikimediaResults,
    vamResults,
    harvardResults,
    smithsonianResults,
    localResults,
  ] = await Promise.all([
    trackSearch('Met Museum', searchMet),
    trackSearch('Art Institute of Chicago', searchArtic),
    trackSearch('Cleveland Museum', searchCleveland),
    trackSearch('Rijksmuseum', searchRijksmuseum),
    trackSearch('Wikimedia Commons', searchWikimedia),
    trackSearch('Victoria & Albert', searchVictoriaAlbert),
    trackSearch('Harvard Art Museums', searchHarvard),
    trackSearch('Smithsonian', searchSmithsonian),
    // Local library search (returns empty array if not available)
    localLibraryAvailable
      ? trackSearch('Local Library', () => searchLocalLibrary(query, targetCount))
      : Promise.resolve([]),
  ]);

  // Track source status for user feedback
  const sources: Record<string, SourceStatus> = {
    met: {
      status: metResults.length > 0 ? 'ok' : 'no_results',
      count: metResults.length,
    },
    artic: {
      status: articResults.length > 0 ? 'ok' : 'no_results',
      count: articResults.length,
    },
    cleveland: {
      status: cmaResults.length > 0 ? 'ok' : 'no_results',
      count: cmaResults.length,
    },
    rijksmuseum: {
      status: rijksResults.length > 0 ? 'ok' : 'no_results',
      count: rijksResults.length,
    },
    wikimedia: {
      status: wikimediaResults.length > 0 ? 'ok' : 'no_results',
      count: wikimediaResults.length,
    },
    vam: {
      status: vamResults.length > 0 ? 'ok' : 'no_results',
      count: vamResults.length,
    },
    harvard: {
      status: harvardResults.length > 0 ? 'ok' : 'no_results',
      count: harvardResults.length,
    },
    smithsonian: {
      status: smithsonianResults.length > 0 ? 'ok' : 'no_results',
      count: smithsonianResults.length,
    },
    ...(localLibraryAvailable && {
      'local-library': {
        status: localResults.length > 0 ? 'ok' : 'no_results',
        count: localResults.length,
      },
    }),
  };

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
    ...metResults,
    ...articResults,
    ...cmaResults,
    ...rijksResults,
    ...wikimediaResults,
    ...vamResults,
    ...harvardResults,
    ...smithsonianResults,
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

  log.info('Art search complete', {
    returned: paginatedResults.length,
    sources: {
      met: metResults.length,
      artic: articResults.length,
      cma: cmaResults.length,
      rijks: rijksResults.length,
      wikimedia: wikimediaResults.length,
      vam: vamResults.length,
      harvard: harvardResults.length,
      smithsonian: smithsonianResults.length,
      ...(localLibraryAvailable && { local: localResults.length }),
    },
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
