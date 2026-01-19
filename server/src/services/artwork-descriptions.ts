/**
 * Artwork Description Service
 * Generates AI descriptions for artworks that lack museum-provided descriptions.
 * Descriptions are cached permanently to minimize API costs.
 */

import OpenAI from 'openai';
import { loggers } from './logger';
import { getErrorMessage } from '../utils/error';
import { readJSONFile, writeJSONFile } from '../utils/data-store';
import statistics from './statistics';

const log = loggers.api.child({ component: 'artwork-descriptions' });

/** Cached description entry */
interface DescriptionCacheEntry {
  description: string;
  generatedAt: number;
  model: string;
}

/** Artwork info for generating description */
interface ArtworkInfo {
  id: string;
  title: string;
  artist?: string;
  date?: string;
  medium?: string;
  style?: string;
  department?: string;
  source?: string;
  placeOfOrigin?: string;
}

const CACHE_FILE = 'artwork-descriptions.json';

class ArtworkDescriptionService {
  private client: OpenAI | null = null;
  private initialized = false;
  private cache: Map<string, DescriptionCacheEntry> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      log.info('Artwork description service initialized');
    } else {
      log.warn('OPENAI_API_KEY not set, AI descriptions unavailable');
    }

    // Load cached descriptions
    try {
      const cached = await readJSONFile<Record<string, DescriptionCacheEntry>>(CACHE_FILE);
      if (cached) {
        this.cache = new Map(Object.entries(cached));
        log.debug('Loaded description cache', { count: this.cache.size });
      }
    } catch {
      log.debug('No existing description cache');
    }

    this.initialized = true;
  }

  /**
   * Save cache to file (debounced to avoid excessive writes)
   */
  private async saveCache(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        const cacheObj = Object.fromEntries(this.cache);
        await writeJSONFile(CACHE_FILE, cacheObj);
        log.debug('Saved description cache', { count: this.cache.size });
      } catch (error) {
        log.error('Failed to save description cache', { error: getErrorMessage(error) });
      }
    }, 1000);
  }

  /**
   * Get or generate a description for an artwork
   */
  async getDescription(artwork: ArtworkInfo): Promise<string | null> {
    await this.initialize();

    // Check cache first
    const cached = this.cache.get(artwork.id);
    if (cached) {
      log.debug('Using cached description', { id: artwork.id });
      return cached.description;
    }

    // Can't generate without OpenAI
    if (!this.client) {
      return null;
    }

    try {
      const prompt = this.buildPrompt(artwork);
      log.info('Generating description', { id: artwork.id, title: artwork.title, prompt });

      const response = await this.client.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You are a knowledgeable art curator writing brief, engaging descriptions for museum artworks.
Your descriptions should:
- Be 2-3 sentences (40-80 words)
- Provide context about the artwork's significance, subject, or artistic approach
- Be informative but accessible to general audiences
- Avoid overly academic language
- Focus on what makes this work interesting or notable

Do not start with "This painting" or "This work" - vary your openings.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_completion_tokens: 500, // Need room for reasoning tokens + output
      });

      const description = response.choices[0]?.message?.content?.trim();

      // Response logging (INFO level for visibility)
      log.info('OpenAI response details', {
        id: artwork.id,
        hasChoices: !!response.choices?.length,
        hasMessage: !!response.choices?.[0]?.message,
        hasContent: !!response.choices?.[0]?.message?.content,
        contentLength: description?.length || 0,
        finishReason: response.choices?.[0]?.finish_reason,
        usage: response.usage,
        rawContent: response.choices?.[0]?.message?.content?.substring(0, 200),
      });

      // Track the API call
      await statistics.trackOpenAICall(
        'gpt-5-mini',
        response.usage?.prompt_tokens || 0,
        response.usage?.completion_tokens || 0,
        !!description,
        {
          endpoint: 'chat.completions',
          purpose: 'artwork-description',
          artworkId: artwork.id,
        }
      );

      if (!description) {
        log.warn('No description generated', { id: artwork.id });
        return null;
      }

      // Cache the description
      this.cache.set(artwork.id, {
        description,
        generatedAt: Date.now(),
        model: 'gpt-5-mini',
      });

      await this.saveCache();

      log.info('Generated description', { id: artwork.id, length: description.length });
      return description;
    } catch (error) {
      log.error('Failed to generate description', {
        id: artwork.id,
        error: getErrorMessage(error),
      });

      await statistics.trackOpenAICall('gpt-5-mini', 0, 0, false, {
        endpoint: 'chat.completions',
        purpose: 'artwork-description',
        error: getErrorMessage(error),
      });

      return null;
    }
  }

  /**
   * Build the prompt for generating a description
   */
  private buildPrompt(artwork: ArtworkInfo): string {
    const parts: string[] = [`Write a brief description for this artwork:`];

    parts.push(`Title: "${artwork.title}"`);

    if (artwork.artist && artwork.artist !== 'Unknown' && artwork.artist !== 'Unknown Artist') {
      parts.push(`Artist: ${artwork.artist}`);
    }

    if (artwork.date) {
      parts.push(`Date: ${artwork.date}`);
    }

    if (artwork.medium) {
      parts.push(`Medium: ${artwork.medium}`);
    }

    if (artwork.style) {
      parts.push(`Style: ${artwork.style}`);
    }

    if (artwork.placeOfOrigin) {
      parts.push(`Origin: ${artwork.placeOfOrigin}`);
    }

    if (artwork.source) {
      parts.push(`Collection: ${artwork.source}`);
    }

    return parts.join('\n');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { count: number; oldestEntry: number | null } {
    let oldestEntry: number | null = null;
    for (const entry of this.cache.values()) {
      if (oldestEntry === null || entry.generatedAt < oldestEntry) {
        oldestEntry = entry.generatedAt;
      }
    }
    return { count: this.cache.size, oldestEntry };
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.initialized && this.client !== null;
  }
}

// Export singleton instance
const artworkDescriptionService = new ArtworkDescriptionService();
export default artworkDescriptionService;
export { ArtworkDescriptionService, ArtworkInfo };
