/**
 * AI-powered smart search module with caching and improved UX
 */

import type { Artwork } from '../types';

// Search cache with TTL
interface CacheEntry {
  data: SearchResponse;
  timestamp: number;
}

interface SearchResponse {
  results: Artwork[];
  metadata?: Record<string, unknown>;
  searchType: string;
}

interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry>();
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Search history
const MAX_SEARCH_HISTORY = 20;
let searchHistory: SearchHistoryItem[] = [];

/**
 * Load search history from localStorage
 */
function loadSearchHistory(): void {
  try {
    const stored = localStorage.getItem('glance_search_history');
    if (stored) {
      searchHistory = JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load search history:', error);
    searchHistory = [];
  }
}

/**
 * Save search history to localStorage
 */
function saveSearchHistory(): void {
  try {
    localStorage.setItem('glance_search_history', JSON.stringify(searchHistory));
  } catch (error) {
    console.error('Failed to save search history:', error);
  }
}

/**
 * Add query to search history
 */
function addToSearchHistory(query: string): void {
  if (!query || query.trim().length === 0) return;

  // Remove duplicate if exists
  searchHistory = searchHistory.filter((item) => item.query !== query);

  // Add to beginning
  searchHistory.unshift({
    query: query,
    timestamp: Date.now(),
  });

  // Limit size
  if (searchHistory.length > MAX_SEARCH_HISTORY) {
    searchHistory = searchHistory.slice(0, MAX_SEARCH_HISTORY);
  }

  saveSearchHistory();
}

/**
 * Get recent searches
 */
function getRecentSearches(limit = 5): string[] {
  return searchHistory.slice(0, limit).map((item) => item.query);
}

/**
 * Perform smart search using AI to interpret natural language queries
 */
async function smartSearch(query: string, useCache = true): Promise<SearchResponse> {
  const normalizedQuery = query.trim().toLowerCase();

  // Check cache first
  if (useCache && searchCache.has(normalizedQuery)) {
    const cached = searchCache.get(normalizedQuery)!;
    if (Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
      console.log('Using cached search results for:', query);
      return cached.data;
    } else {
      // Expired cache entry
      searchCache.delete(normalizedQuery);
    }
  }

  try {
    // Use AI-powered search (GPT-5 orchestrates museum API searches)
    const response = await fetch('/api/semantic/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        limit: 50, // Get diverse results from multiple museums
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      } else if (response.status === 503) {
        throw new Error('Search service temporarily unavailable. Please try again.');
      } else if (response.status >= 500) {
        throw new Error('Server error. Please try again in a moment.');
      } else {
        throw new Error(`Search failed: ${response.statusText}`);
      }
    }

    const data = await response.json();

    // Transform search response to match expected format
    const transformedData: SearchResponse = {
      results: data.results || [],
      metadata: data.metadata || {},
      searchType: 'agentic',
    };

    // Cache the results
    searchCache.set(normalizedQuery, {
      data: transformedData,
      timestamp: Date.now(),
    });

    // Add to search history
    addToSearchHistory(query);

    return transformedData;
  } catch (error) {
    console.error('Semantic search error:', error);

    // Provide user-friendly error messages
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Network error. Please check your connection and try again.');
      }
    }

    throw error;
  }
}

/**
 * Get search suggestions based on recent searches and defaults
 */
function getSearchSuggestions(): string[] {
  const recent = getRecentSearches(3);
  const defaults = [
    'Monet water lilies',
    'Japanese landscapes',
    'Bold colorful abstract',
    'Peaceful blue paintings',
    'Van Gogh sunflowers',
    'Renaissance portraits',
    'Impressionist gardens',
  ];

  // Combine recent searches with defaults, avoiding duplicates
  const suggestions = [...recent];
  for (const suggestion of defaults) {
    if (!suggestions.includes(suggestion) && suggestions.length < 7) {
      suggestions.push(suggestion);
    }
  }

  return suggestions.slice(0, 7);
}

interface FormattedResult {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  thumbnail: string;
  year?: string;
  source: string;
}

/**
 * Format search results for display
 */
function formatSearchResults(results: Artwork[]): FormattedResult[] {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((result) => ({
    id: result.id,
    title: result.title || 'Untitled',
    artist: result.artist || 'Unknown Artist',
    imageUrl: result.imageUrl || result.thumbnailUrl || '',
    thumbnail: result.thumbnailUrl || result.imageUrl,
    year: result.date,
    source: result.museum || 'Unknown',
  }));
}

/**
 * Clear search cache (useful for debugging or forcing fresh results)
 */
function clearSearchCache(): void {
  searchCache.clear();
  console.log('Search cache cleared');
}

/**
 * Clear search history
 */
function clearSearchHistory(): void {
  searchHistory = [];
  saveSearchHistory();
  console.log('Search history cleared');
}

// Initialize search history on load
loadSearchHistory();

// Export module
export const Search = {
  smart: smartSearch,
  getSuggestions: getSearchSuggestions,
  formatResults: formatSearchResults,
  getRecent: getRecentSearches,
  clearCache: clearSearchCache,
  clearHistory: clearSearchHistory,
};

// Also export individual functions for backward compatibility
export {
  smartSearch,
  getSearchSuggestions,
  formatSearchResults,
  getRecentSearches,
  clearSearchCache,
  clearSearchHistory,
};
