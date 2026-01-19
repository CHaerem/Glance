/**
 * Taste Guide Service
 * Manages user's art collection and generates personalized recommendations
 * based on their taste profile.
 */

import OpenAI from 'openai';
import { loggers } from './logger';
import { getErrorMessage } from '../utils/error';
import { readJSONFile, writeJSONFile } from '../utils/data-store';
import type { Artwork, CollectionEntry } from '../types';

const log = loggers.api.child({ component: 'taste-guide' });

/** Favorite artwork with embedding for similarity search */
interface FavoriteArtwork extends CollectionEntry {
  embedding?: number[];
  displayCount?: number;
  lastDisplayed?: number;
}

/** Taste profile derived from collection */
interface TasteProfile {
  favoriteArtists: Array<{ name: string; count: number }>;
  favoriteStyles: string[];
  favoritePeriods: string[];
  colorPreferences: string[];
  subjectPreferences: string[];
  summary: string;
}

/** Recommendation result */
interface Recommendation extends Artwork {
  reason: string;
  similarTo?: string;
  confidence: number;
}

const COLLECTION_FILE = 'my-collection.json';

class TasteGuideService {
  private client: OpenAI | null = null;
  private initialized = false;

  constructor() {
    // collectionPath removed - use COLLECTION_FILE with readJSONFile/writeJSONFile
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      log.info('Taste guide service initialized with OpenAI');
    } else {
      log.warn('OPENAI_API_KEY not set, recommendations will be limited');
    }
    this.initialized = true;
  }

  /**
   * Get all favorites from the collection
   */
  async getCollection(): Promise<FavoriteArtwork[]> {
    try {
      const collection = await readJSONFile<FavoriteArtwork[]>(COLLECTION_FILE);
      return collection || [];
    } catch (error) {
      log.error('Failed to read collection', { error: getErrorMessage(error) });
      return [];
    }
  }

  /**
   * Add an artwork to the collection
   */
  async addToCollection(artwork: Artwork): Promise<{ success: boolean; message: string }> {
    await this.initialize();

    try {
      const collection = await this.getCollection();

      // Check if already in collection
      const exists = collection.some(
        (item) => item.id === artwork.id ||
        (item.title === artwork.title && item.artist === artwork.artist)
      );

      if (exists) {
        return { success: false, message: 'Artwork already in collection' };
      }

      // Create collection entry
      const entry: FavoriteArtwork = {
        id: artwork.id,
        title: artwork.title,
        artist: artwork.artist,
        date: artwork.date || '',
        source: artwork.source,
        imageUrl: artwork.imageUrl,
        thumbnailUrl: artwork.thumbnailUrl,
        addedAt: Date.now(),
        displayCount: 0,
      };

      // Store reframe settings if provided (preserves crop/zoom state)
      if ((artwork as CollectionEntry).reframe) {
        entry.reframe = (artwork as CollectionEntry).reframe;
      }

      // Generate embedding for similarity search (if OpenAI available)
      if (this.client) {
        try {
          const textToEmbed = `${artwork.title} by ${artwork.artist}. ${artwork.description || ''} ${artwork.period || ''} ${artwork.classification || ''}`;
          const embeddingResponse = await this.client.embeddings.create({
            model: 'text-embedding-3-small',
            input: textToEmbed.slice(0, 8000), // Limit input length
          });
          entry.embedding = embeddingResponse.data[0]?.embedding;
        } catch (embError) {
          log.warn('Failed to generate embedding', { error: getErrorMessage(embError) });
        }
      }

      collection.push(entry);
      await writeJSONFile(COLLECTION_FILE, collection);

      log.info('Added to collection', { title: artwork.title, artist: artwork.artist });
      return { success: true, message: `Added "${artwork.title}" to your collection` };
    } catch (error) {
      log.error('Failed to add to collection', { error: getErrorMessage(error) });
      return { success: false, message: 'Failed to add artwork to collection' };
    }
  }

  /**
   * Remove an artwork from the collection
   */
  async removeFromCollection(artworkId: string): Promise<{ success: boolean; message: string }> {
    try {
      const collection = await this.getCollection();
      const index = collection.findIndex((item) => item.id === artworkId);

      if (index === -1) {
        return { success: false, message: 'Artwork not found in collection' };
      }

      const removed = collection.splice(index, 1)[0];
      await writeJSONFile(COLLECTION_FILE, collection);

      log.info('Removed from collection', { title: removed?.title ?? 'Unknown' });
      return { success: true, message: `Removed "${removed?.title ?? 'artwork'}" from your collection` };
    } catch (error) {
      log.error('Failed to remove from collection', { error: getErrorMessage(error) });
      return { success: false, message: 'Failed to remove artwork from collection' };
    }
  }

  /**
   * Check if an artwork is in the collection
   */
  async isInCollection(artworkId: string): Promise<boolean> {
    const collection = await this.getCollection();
    return collection.some((item) => item.id === artworkId);
  }

  /**
   * Analyze collection and build a taste profile
   */
  async getTasteProfile(): Promise<TasteProfile | null> {
    await this.initialize();
    const collection = await this.getCollection();

    if (collection.length === 0) {
      return null;
    }

    // Count artists
    const artistCounts = new Map<string, number>();
    for (const item of collection) {
      const artist = item.artist || 'Unknown';
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }

    const favoriteArtists = Array.from(artistCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Use AI to analyze the collection if available
    let summary = `You have ${collection.length} artworks in your collection.`;
    const favoriteStyles: string[] = [];
    const favoritePeriods: string[] = [];
    const colorPreferences: string[] = [];
    const subjectPreferences: string[] = [];

    if (this.client && collection.length >= 3) {
      try {
        const artworkDescriptions = collection
          .slice(0, 20) // Limit for token cost
          .map((a) => `"${a.title}" by ${a.artist} (${a.date || 'unknown date'})`)
          .join('\n');

        const response = await this.client.chat.completions.create({
          model: 'gpt-5-mini',
          messages: [
            {
              role: 'system',
              content: `You are an art expert analyzing someone's art collection to understand their taste.
Analyze the artworks and identify patterns in:
- Art movements/styles they prefer
- Time periods they gravitate toward
- Color palettes they seem to enjoy
- Subject matter they like (landscapes, portraits, abstract, etc.)

Be concise and insightful. Write a 2-3 sentence summary of their taste.`,
            },
            {
              role: 'user',
              content: `Here are the artworks in my collection:\n${artworkDescriptions}\n\nWhat can you tell about my art taste?`,
            },
          ],
          max_completion_tokens: 300,
        });

        summary = response.choices[0]?.message?.content || summary;
      } catch (error) {
        log.warn('Failed to generate taste analysis', { error: getErrorMessage(error) });
      }
    }

    return {
      favoriteArtists,
      favoriteStyles,
      favoritePeriods,
      colorPreferences,
      subjectPreferences,
      summary,
    };
  }

  /**
   * Get personalized recommendations based on the collection
   */
  async getRecommendations(
    searchFn: (query: string, limit: number) => Promise<Artwork[]>,
    limit: number = 12
  ): Promise<Recommendation[]> {
    await this.initialize();
    const collection = await this.getCollection();

    if (collection.length === 0) {
      return [];
    }

    const recommendations: Recommendation[] = [];

    if (this.client) {
      try {
        // Build context from collection
        const collectionContext = collection
          .slice(0, 15)
          .map((a) => `"${a.title}" by ${a.artist}`)
          .join(', ');

        // Ask AI for search queries based on taste
        const response = await this.client.chat.completions.create({
          model: 'gpt-5-mini',
          messages: [
            {
              role: 'system',
              content: `You are an art curator. Based on someone's art collection, suggest 3 search queries to find similar artworks they might enjoy.
Return ONLY a JSON array of 3 strings, each being a search query.
Example: ["Impressionist landscapes", "Claude Monet water scenes", "soft light pastoral paintings"]`,
            },
            {
              role: 'user',
              content: `My collection includes: ${collectionContext}\n\nWhat search queries would find art I'd enjoy?`,
            },
          ],
          max_completion_tokens: 150,
        });

        const content = response.choices[0]?.message?.content || '[]';
        let queries: string[] = [];

        try {
          // Extract JSON from response
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            queries = JSON.parse(jsonMatch[0]);
          }
        } catch {
          log.warn('Failed to parse recommendation queries');
          queries = ['similar to collection'];
        }

        // Execute searches in parallel
        const searchPromises = queries.slice(0, 3).map((query) => searchFn(query, 8));
        const searchResults = await Promise.all(searchPromises);

        // Combine and deduplicate
        const seen = new Set<string>();
        const collectionIds = new Set(collection.map((c) => c.id));

        for (let i = 0; i < searchResults.length; i++) {
          const results = searchResults[i];
          const query = queries[i];
          if (!results || !query) continue;

          for (const artwork of results) {
            const key = `${artwork.title}-${artwork.artist}`;
            if (!seen.has(key) && !collectionIds.has(artwork.id)) {
              seen.add(key);
              recommendations.push({
                ...artwork,
                reason: `Based on your interest in ${query}`,
                confidence: 0.8 - i * 0.1,
              });
            }
          }
        }
      } catch (error) {
        log.error('Failed to generate recommendations', { error: getErrorMessage(error) });
      }
    }

    // Fallback: search based on favorite artists
    if (recommendations.length < limit) {
      const artistCounts = new Map<string, number>();
      for (const item of collection) {
        if (item.artist && item.artist !== 'Unknown') {
          artistCounts.set(item.artist, (artistCounts.get(item.artist) || 0) + 1);
        }
      }

      const topArtists = Array.from(artistCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      for (const [artist] of topArtists) {
        if (recommendations.length >= limit) break;

        try {
          const artistResults = await searchFn(artist, 5);
          const collectionIds = new Set(collection.map((c) => c.id));
          const existingIds = new Set(recommendations.map((r) => r.id));

          for (const artwork of artistResults) {
            if (!collectionIds.has(artwork.id) && !existingIds.has(artwork.id)) {
              recommendations.push({
                ...artwork,
                reason: `More works by ${artist}, an artist in your collection`,
                confidence: 0.7,
              });
            }
          }
        } catch {
          // Continue with other artists
        }
      }
    }

    return recommendations.slice(0, limit);
  }

  /**
   * Get collection summary for chat context
   */
  async getCollectionSummary(): Promise<string> {
    const collection = await this.getCollection();

    if (collection.length === 0) {
      return 'Your collection is empty. Start adding artworks you love!';
    }

    const profile = await this.getTasteProfile();

    let summary = `You have ${collection.length} artwork${collection.length > 1 ? 's' : ''} in your collection.\n`;

    if (profile) {
      if (profile.favoriteArtists.length > 0) {
        const artists = profile.favoriteArtists
          .slice(0, 3)
          .map((a) => a.name)
          .join(', ');
        summary += `Favorite artists: ${artists}\n`;
      }
      summary += `\nTaste profile: ${profile.summary}`;
    }

    return summary;
  }
}

// Export singleton instance
const tasteGuideService = new TasteGuideService();
export default tasteGuideService;
export { TasteGuideService, TasteProfile, FavoriteArtwork, Recommendation };
