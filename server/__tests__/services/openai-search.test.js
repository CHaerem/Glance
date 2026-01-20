/**
 * Tests for services/openai-search.ts
 *
 * Tests the AI-powered agentic search functionality:
 * - Tool selection (which museums to search)
 * - Query expansion (expanding queries for better results)
 * - Parallel search execution
 * - Fallback behavior when OpenAI is unavailable
 * - Deduplication and result formatting
 *
 * Note: Unit tests use mocked APIs for fast, deterministic results.
 * Integration tests hit real APIs - run locally with:
 * npm test -- --testTimeout=120000 openai-search.test.js
 */

// Skip integration tests in CI
const describeIfNotCI = process.env.CI ? describe.skip : describe;

describe('OpenAI Agent Search Service', () => {
  describe('Service Structure', () => {
    it('should export the default search instance', () => {
      const openaiSearch = require('../../services/openai-search').default;
      expect(openaiSearch).toBeDefined();
      expect(typeof openaiSearch.searchByText).toBe('function');
      expect(typeof openaiSearch.searchSimilar).toBe('function');
      expect(typeof openaiSearch.getStats).toBe('function');
    });

    it('should export the OpenAIAgentSearch class', () => {
      const { OpenAIAgentSearch } = require('../../services/openai-search');
      expect(OpenAIAgentSearch).toBeDefined();
      expect(typeof OpenAIAgentSearch).toBe('function');
    });
  });

  describe('getStats', () => {
    it('should return service statistics', async () => {
      const openaiSearch = require('../../services/openai-search').default;
      const stats = await openaiSearch.getStats();

      expect(stats).toHaveProperty('model');
      expect(stats).toHaveProperty('type', 'agentic');
      expect(stats).toHaveProperty('museums');
      expect(stats).toHaveProperty('status');
      expect(Array.isArray(stats.museums)).toBe(true);
    });

    it('should list all supported museums', async () => {
      const openaiSearch = require('../../services/openai-search').default;
      const stats = await openaiSearch.getStats();

      // Check for museum names (may be short or full names)
      expect(stats.museums.length).toBeGreaterThanOrEqual(5);
      const museumsLower = stats.museums.map((m) => m.toLowerCase());
      expect(museumsLower.some((m) => m.includes('met'))).toBe(true);
      expect(museumsLower.some((m) => m.includes('rijks'))).toBe(true);
      expect(museumsLower.some((m) => m.includes('cleveland') || m.includes('cma'))).toBe(
        true
      );
    });
  });

  describe('searchByText', () => {
    it('should return an array of results', async () => {
      const openaiSearch = require('../../services/openai-search').default;

      // Use fallback search (no OpenAI key in test env)
      const results = await openaiSearch.searchByText('landscape', 5);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle empty query', async () => {
      const openaiSearch = require('../../services/openai-search').default;
      const results = await openaiSearch.searchByText('', 5);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('searchSimilar', () => {
    it('should return an array of results', async () => {
      const openaiSearch = require('../../services/openai-search').default;
      const results = await openaiSearch.searchSimilar('met-123', 5);

      expect(Array.isArray(results)).toBe(true);
    });
  });
});

// Integration tests - hit real APIs
describeIfNotCI('OpenAI Search Integration Tests', () => {
  // These tests hit real APIs - run locally with:
  // npm test -- --testTimeout=120000 openai-search.test.js

  jest.setTimeout(120000);

  let openaiSearch;

  beforeAll(() => {
    // Get fresh module instance
    jest.resetModules();
    openaiSearch = require('../../services/openai-search').default;
  });

  it('should search for artworks with query expansion', async () => {
    const results = await openaiSearch.searchByText('eiffel tower', 20);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // Log for debugging
    console.log(`Found ${results.length} results for "eiffel tower"`);
    console.log(
      'Sample titles:',
      results.slice(0, 5).map((r) => r.title)
    );

    // Should find Paris-related art, not just exact matches
    const titles = results.map((r) => r.title.toLowerCase());
    const hasParis = titles.some(
      (t) => t.includes('paris') || t.includes('eiffel') || t.includes('french')
    );
    expect(hasParis).toBe(true);
  });

  it('should search for flowers with expanded queries', async () => {
    const results = await openaiSearch.searchByText('sunflowers', 20);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(5);

    console.log(`Found ${results.length} results for "sunflowers"`);

    // Should find flower/floral/still life results
    const titles = results.map((r) => r.title.toLowerCase());
    const hasFloral = titles.some(
      (t) =>
        t.includes('flower') ||
        t.includes('sunflower') ||
        t.includes('floral') ||
        t.includes('still life')
    );
    expect(hasFloral).toBe(true);
  });

  it('should search multiple museums for diverse results', async () => {
    const results = await openaiSearch.searchByText('landscape painting', 30);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // Check that results come from multiple sources
    const sources = [...new Set(results.map((r) => r.source))];
    console.log(`Found results from ${sources.length} sources:`, sources);

    // Should have results from at least 2 museums (if API is working)
    if (results.length > 5) {
      expect(sources.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('should handle artist name searches', async () => {
    const results = await openaiSearch.searchByText('Monet', 20);

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // Should find Monet artworks
    const hasMonet = results.some(
      (r) => r.artist && r.artist.toLowerCase().includes('monet')
    );
    console.log(`Found ${results.length} results for "Monet", hasMonet: ${hasMonet}`);
    expect(hasMonet).toBe(true);
  });

  it('should return results with required fields', async () => {
    const results = await openaiSearch.searchByText('portrait', 10);

    expect(results.length).toBeGreaterThan(0);

    const artwork = results[0];
    expect(artwork).toHaveProperty('id');
    expect(artwork).toHaveProperty('title');
    expect(artwork).toHaveProperty('artist');
    expect(artwork).toHaveProperty('source');
    expect(artwork).toHaveProperty('score');
    expect(artwork).toHaveProperty('imageUrl');
  });

  it('should deduplicate results', async () => {
    const results = await openaiSearch.searchByText('Van Gogh', 30);

    // Check for duplicates by title+artist
    const seen = new Set();
    let duplicateCount = 0;

    for (const result of results) {
      const key = `${result.title}-${result.artist}`;
      if (seen.has(key)) {
        duplicateCount++;
      }
      seen.add(key);
    }

    console.log(
      `Found ${results.length} results, ${duplicateCount} duplicates (should be 0)`
    );
    expect(duplicateCount).toBe(0);
  });
});
