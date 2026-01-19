/**
 * OpenAI Agentic Art Search Service
 * Uses gpt-5-mini with function tools to intelligently search museum APIs
 *
 * The AI decides which museums to search, what terms to use,
 * and curates the best results based on the user's intent.
 *
 * Optimized for speed with parallel museum searches.
 */

import OpenAI from 'openai';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { loggers } from './logger';
import { performArtSearch } from './museum-api';
import { getErrorMessage } from '../utils/error';
import type { Artwork } from '../types';

const log = loggers.api;

/** Artwork with score field */
interface ScoredArtwork extends Artwork {
  score: number;
}

/** Internal artwork result from museum API */
interface MuseumArtwork {
  id: string;
  title: string;
  artist: string;
  date: string;
  imageUrl: string;
  thumbnailUrl: string;
  source: string;
  department?: string;
  medium?: string;
}

/** Museum searcher function type */
type MuseumSearcher = (query: string, limit?: number) => Promise<MuseumArtwork[]>;

/** Service stats */
interface ServiceStats {
  model: string;
  type: 'agentic';
  museums: string[];
  status: 'active' | 'fallback_only';
}

// Individual museum search functions for tool use
const museumSearchers = {
  async searchMetMuseum(query: string, limit: number = 10): Promise<MuseumArtwork[]> {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = (await response.json()) as { objectIDs?: number[] };
      if (!data.objectIDs?.length) return [];

      // Fetch objects IN PARALLEL for speed (fetch more than needed to account for filtering)
      const objectPromises = data.objectIDs.slice(0, limit * 3).map(async (id) => {
        try {
          const objRes = await fetch(
            `https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`
          );
          const obj = (await objRes.json()) as {
            objectID: number;
            title?: string;
            artistDisplayName?: string;
            objectDate?: string;
            primaryImage?: string;
            primaryImageSmall?: string;
            department?: string;
            medium?: string;
            isPublicDomain?: boolean;
          };
          if (obj.primaryImage && obj.isPublicDomain) {
            const result: MuseumArtwork = {
              id: `met-${obj.objectID}`,
              title: obj.title ?? 'Untitled',
              artist: obj.artistDisplayName ?? 'Unknown',
              date: obj.objectDate ?? '',
              imageUrl: obj.primaryImage,
              thumbnailUrl: obj.primaryImageSmall ?? obj.primaryImage,
              source: 'The Met Museum',
              department: obj.department,
              medium: obj.medium,
            };
            return result;
          }
        } catch {
          /* skip */
        }
        return null;
      });

      const objects = await Promise.all(objectPromises);
      return objects.filter((o): o is MuseumArtwork => o !== null).slice(0, limit);
    } catch (e) {
      log.warn('Met search failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  },

  async searchArtInstituteChicago(
    query: string,
    limit: number = 10
  ): Promise<MuseumArtwork[]> {
    const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&limit=${limit}&fields=id,title,artist_display,date_display,image_id,is_public_domain,medium_display,department_title`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = (await response.json()) as {
        data?: Array<{
          id: number;
          title?: string;
          artist_display?: string;
          date_display?: string;
          image_id?: string;
          is_public_domain?: boolean;
          medium_display?: string;
          department_title?: string;
        }>;
      };
      return (data.data ?? [])
        .filter((a) => a.image_id && a.is_public_domain)
        .map((a) => ({
          id: `artic-${a.id}`,
          title: a.title ?? 'Untitled',
          artist: a.artist_display ?? 'Unknown',
          date: a.date_display ?? '',
          imageUrl: `https://www.artic.edu/iiif/2/${a.image_id}/full/1200,/0/default.jpg`,
          thumbnailUrl: `https://www.artic.edu/iiif/2/${a.image_id}/full/400,/0/default.jpg`,
          source: 'Art Institute of Chicago',
          medium: a.medium_display,
          department: a.department_title,
        }));
    } catch (e) {
      log.warn('ARTIC search failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  },

  async searchRijksmuseum(query: string, limit: number = 10): Promise<MuseumArtwork[]> {
    const url = `https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&imgonly=true&ps=${limit}&q=${encodeURIComponent(query)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = (await response.json()) as {
        artObjects?: Array<{
          objectNumber: string;
          title?: string;
          principalOrFirstMaker?: string;
          webImage?: { url?: string };
        }>;
      };
      return (data.artObjects ?? [])
        .filter((a) => a.webImage?.url)
        .map((a) => ({
          id: `rijks-${a.objectNumber}`,
          title: a.title ?? 'Untitled',
          artist: a.principalOrFirstMaker ?? 'Unknown',
          date: '',
          imageUrl: a.webImage!.url!,
          thumbnailUrl: a.webImage!.url!,
          source: 'Rijksmuseum',
        }));
    } catch (e) {
      log.warn('Rijksmuseum search failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  },

  async searchClevelandMuseum(
    query: string,
    limit: number = 10
  ): Promise<MuseumArtwork[]> {
    const url = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query)}&has_image=1&limit=${limit}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = (await response.json()) as {
        data?: Array<{
          id: number;
          title?: string;
          creators?: Array<{ description?: string }>;
          creation_date?: string;
          images?: { web?: { url?: string } };
          technique?: string;
          department?: string;
        }>;
      };
      return (data.data ?? [])
        .filter((a) => a.images?.web?.url)
        .map((a) => ({
          id: `cma-${a.id}`,
          title: a.title ?? 'Untitled',
          artist: a.creators?.[0]?.description ?? 'Unknown',
          date: a.creation_date ?? '',
          imageUrl: a.images!.web!.url!,
          thumbnailUrl: a.images!.web!.url!,
          source: 'Cleveland Museum of Art',
          medium: a.technique,
          department: a.department,
        }));
    } catch (e) {
      log.warn('Cleveland search failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  },

  async searchHarvardArtMuseums(
    query: string,
    limit: number = 10
  ): Promise<MuseumArtwork[]> {
    const apiKey =
      process.env.HARVARD_API_KEY ?? '3ae93cb0-e tried-11e9-8a5f-c9e6a8b73a1d';
    const url = `https://api.harvardartmuseums.org/object?apikey=${apiKey}&q=${encodeURIComponent(query)}&hasimage=1&size=${limit}`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = (await response.json()) as {
        records?: Array<{
          id: number;
          title?: string;
          people?: Array<{ name?: string }>;
          dated?: string;
          primaryimageurl?: string;
          medium?: string;
          division?: string;
        }>;
      };
      return (data.records ?? [])
        .filter((a) => a.primaryimageurl)
        .map((a) => ({
          id: `harvard-${a.id}`,
          title: a.title ?? 'Untitled',
          artist: a.people?.[0]?.name ?? 'Unknown',
          date: a.dated ?? '',
          imageUrl: a.primaryimageurl!,
          thumbnailUrl: a.primaryimageurl!,
          source: 'Harvard Art Museums',
          medium: a.medium,
          department: a.division,
        }));
    } catch (e) {
      log.warn('Harvard search failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  },
};

// Tool definitions for gpt-5-mini
const searchTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_met_museum',
      description:
        'Search The Metropolitan Museum of Art. Best for: diverse collection spanning 5000 years, European paintings, American art, Asian art, Egyptian art, medieval art.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search terms (artist name, artwork title, style, subject, period)',
          },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_art_institute_chicago',
      description:
        'Search Art Institute of Chicago. Best for: Impressionism, Post-Impressionism, American art, modern art. Famous for Seurat, Monet, Hopper, Wood.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_rijksmuseum',
      description:
        'Search Rijksmuseum Amsterdam. Best for: Dutch Golden Age, Rembrandt, Vermeer, Dutch Masters, 17th century Dutch painting.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_cleveland_museum',
      description:
        'Search Cleveland Museum of Art. Best for: Asian art, European paintings, medieval art, African art. Strong encyclopedic collection.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_harvard_art_museums',
      description:
        'Search Harvard Art Museums. Best for: academic collections, prints, drawings, photographs, Asian art, European art.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: ['query'],
      },
    },
  },
];

/** Tool name to search function mapping */
const toolNameToSearchFn: Record<string, MuseumSearcher> = {
  search_met_museum: museumSearchers.searchMetMuseum,
  search_art_institute_chicago: museumSearchers.searchArtInstituteChicago,
  search_rijksmuseum: museumSearchers.searchRijksmuseum,
  search_cleveland_museum: museumSearchers.searchClevelandMuseum,
  search_harvard_art_museums: museumSearchers.searchHarvardArtMuseums,
};

class OpenAIAgentSearch {
  private client: OpenAI | null;
  private initialized: boolean;
  private model: string;

  constructor() {
    this.client = null;
    this.initialized = false;
    this.model = 'gpt-5-mini'; // Fast, smart, and cost-effective for tool orchestration
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      log.warn('OPENAI_API_KEY not set, using basic keyword search');
      this.initialized = true;
      return;
    }

    this.client = new OpenAI({ apiKey });
    this.initialized = true;
    log.info('OpenAI agent search initialized', { model: this.model });
  }

  /**
   * Agentic art search - AI orchestrates museum API searches in parallel
   */
  async searchByText(query: string, limit: number = 20): Promise<ScoredArtwork[]> {
    await this.initialize();

    log.info('Agentic art search', { query, limit });

    // Fallback to basic search if no OpenAI
    if (!this.client) {
      return this._fallbackSearch(query, limit);
    }

    try {
      // Let AI decide which museums to search
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert art curator helping users discover artwork for their e-ink display.

Your task:
1. Understand what the user is looking for (mood, style, artist, period, subject)
2. Search the most relevant museums using the provided tools
3. Search 2-3 museums with appropriate queries to find diverse results
4. Return results that best match the user's intent

Consider:
- For Dutch masters → prioritize Rijksmuseum
- For Impressionism → prioritize Art Institute of Chicago
- For diverse/general queries → use Met Museum
- For Asian art → Cleveland or Harvard
- Vary your search terms to get diverse results`,
          },
          {
            role: 'user',
            content: `Find artwork matching: "${query}". Return up to ${limit} results.`,
          },
        ],
        tools: searchTools,
        tool_choice: 'auto',
        max_completion_tokens: 1000,
      });

      // Execute tool calls IN PARALLEL for speed
      const toolCalls = response.choices[0]?.message?.tool_calls ?? [];

      const searchPromises = toolCalls.map(async (toolCall) => {
        if (toolCall.type !== 'function') return [];

        const args = JSON.parse(toolCall.function.arguments) as {
          query: string;
          limit?: number;
        };
        const searchLimit = args.limit ?? 10;

        const searchFn = toolNameToSearchFn[toolCall.function.name];

        if (!searchFn) return [];

        const results = await searchFn(args.query, searchLimit);
        log.debug('Tool call executed', {
          tool: toolCall.function.name,
          query: args.query,
          results: results.length,
        });
        return results;
      });

      // Wait for all searches to complete in parallel
      const resultsArrays = await Promise.all(searchPromises);
      const allResults = resultsArrays.flat();

      // If no tool calls, fallback
      if (allResults.length === 0) {
        log.debug('No tool calls made, using fallback');
        return this._fallbackSearch(query, limit);
      }

      // Deduplicate and limit
      const seen = new Set<string>();
      const unique = allResults.filter((art) => {
        const key = `${art.title}-${art.artist}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      log.info('Agentic search complete', {
        toolCalls: toolCalls.length,
        totalResults: unique.length,
      });

      return unique.slice(0, limit).map((art) => ({
        ...art,
        score: 0.9, // High confidence from agentic search
      }));
    } catch (error) {
      log.error('Agentic search failed', {
        error: getErrorMessage(error),
      });
      return this._fallbackSearch(query, limit);
    }
  }

  /**
   * Find similar artworks based on an artwork's characteristics
   */
  async searchSimilar(
    artworkId: string,
    limit: number = 20
  ): Promise<ScoredArtwork[]> {
    await this.initialize();

    // Extract info from artwork ID format (e.g., "met-12345", "artic-678")
    const [source] = artworkId.split('-');

    // Build a query based on the artwork
    const similarQuery = `artwork similar to ${artworkId}`;

    if (this.client) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an art expert. Given an artwork ID, determine what similar artworks to search for.
Consider the likely artist, style, period, and subject matter based on the source museum and ID.
Search for artworks with similar characteristics.`,
            },
            {
              role: 'user',
              content: `Find artworks similar to: ${artworkId} (from ${source}). Return ${limit} similar pieces.`,
            },
          ],
          tools: searchTools,
          tool_choice: 'auto',
          max_completion_tokens: 500,
        });

        // Execute searches IN PARALLEL
        const toolCalls = response.choices[0]?.message?.tool_calls ?? [];

        const searchPromises = toolCalls.map(async (toolCall) => {
          if (toolCall.type !== 'function') return [];

          const args = JSON.parse(toolCall.function.arguments) as {
            query: string;
            limit?: number;
          };
          const searchFn = toolNameToSearchFn[toolCall.function.name];
          return searchFn ? searchFn(args.query, args.limit ?? 10) : [];
        });

        const resultsArrays = await Promise.all(searchPromises);
        const allResults = resultsArrays.flat();

        // Filter out the source artwork
        const filtered = allResults.filter((a) => a.id !== artworkId);
        return filtered
          .slice(0, limit)
          .map((art) => ({ ...art, score: 0.8 }));
      } catch (error) {
        log.error('Similar search failed', {
          error: getErrorMessage(error),
        });
      }
    }

    return this._fallbackSearch(similarQuery, limit);
  }

  /**
   * Fallback to basic museum API search
   */
  async _fallbackSearch(query: string, limit: number): Promise<ScoredArtwork[]> {
    log.debug('Using fallback search', { query });
    const result = await performArtSearch(query, limit);
    return (result.results ?? []).map((art) => ({
      ...art,
      score: 0.5,
    }));
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<ServiceStats> {
    return {
      model: this.model,
      type: 'agentic',
      museums: ['Met', 'ARTIC', 'Rijksmuseum', 'Cleveland', 'Harvard'],
      status: this.client ? 'active' : 'fallback_only',
    };
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.initialized;
  }
}

// Export singleton instance
const openAIAgentSearch = new OpenAIAgentSearch();
export default openAIAgentSearch;

// Also export the class for testing
export { OpenAIAgentSearch };
