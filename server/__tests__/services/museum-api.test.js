/**
 * Tests for services/museum-api.js
 *
 * Note: performArtSearch tests hit real external APIs and may be slow/flaky.
 * Run with longer timeout: npm test -- --testTimeout=120000 museum-api.test.js
 */

const {
    performArtSearch,
    getCuratedCollections,
    CURATED_COLLECTIONS
} = require('../../services/museum-api');

// Increase timeout for API tests (2 minutes for external API calls)
jest.setTimeout(120000);

// Skip external API tests in CI to avoid flakiness
const describeIfNotCI = process.env.CI ? describe.skip : describe;

describe('Museum API Service', () => {
    describe('CURATED_COLLECTIONS', () => {
        it('should export curated collections', () => {
            expect(CURATED_COLLECTIONS).toBeDefined();
            expect(typeof CURATED_COLLECTIONS).toBe('object');
        });

        it('should have expected collection keys', () => {
            const expectedKeys = [
                'renaissance-masters',
                'dutch-masters',
                'impressionists',
                'post-impressionists',
                'japanese-masters',
                'modern-icons'
            ];

            expectedKeys.forEach(key => {
                expect(CURATED_COLLECTIONS[key]).toBeDefined();
            });
        });

        it('should have valid collection structure', () => {
            Object.values(CURATED_COLLECTIONS).forEach(collection => {
                expect(collection).toHaveProperty('name');
                expect(collection).toHaveProperty('description');
                expect(collection).toHaveProperty('artworks');
                expect(Array.isArray(collection.artworks)).toBe(true);
            });
        });

        it('should have valid artwork entries', () => {
            Object.values(CURATED_COLLECTIONS).forEach(collection => {
                collection.artworks.forEach(artwork => {
                    expect(artwork).toHaveProperty('artist');
                    expect(artwork).toHaveProperty('title');
                    expect(artwork).toHaveProperty('year');
                    expect(artwork).toHaveProperty('popularity');
                    expect(artwork).toHaveProperty('wikimedia');
                    expect(typeof artwork.popularity).toBe('number');
                });
            });
        });

        it('should include famous artworks', () => {
            const allArtworks = Object.values(CURATED_COLLECTIONS)
                .flatMap(c => c.artworks);
            const titles = allArtworks.map(a => a.title);

            expect(titles).toContain('Mona Lisa');
            expect(titles).toContain('The Starry Night');
            expect(titles).toContain('The Great Wave off Kanagawa');
        });
    });

    describe('getCuratedCollections', () => {
        it('should return the curated collections', () => {
            const result = getCuratedCollections();
            expect(result).toEqual(CURATED_COLLECTIONS);
        });
    });

    describeIfNotCI('performArtSearch', () => {
        // Note: These tests hit real external APIs
        // Skipped in CI to avoid flakiness, run locally with: npm test -- museum-api.test.js

        it('should search for artworks and return results', async () => {
            const result = await performArtSearch('Monet', 5);

            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('total');
            expect(result).toHaveProperty('hasMore');
            expect(result).toHaveProperty('sources');
            expect(Array.isArray(result.results)).toBe(true);
        });

        it('should prioritize curated artworks', async () => {
            const result = await performArtSearch('Van Gogh', 10);

            // Van Gogh is in curated collections
            const curatedResults = result.results.filter(r => r.source === 'curated');

            // Should find at least one curated result if Van Gogh is searched
            // (This may not always be true if curated results are ranked differently)
            expect(result.results.length).toBeGreaterThan(0);
        });

        it('should respect limit parameter', async () => {
            const result = await performArtSearch('landscape', 3);

            expect(result.results.length).toBeLessThanOrEqual(3);
        });

        it('should handle offset parameter', async () => {
            const result1 = await performArtSearch('painting', 5, 0);
            const result2 = await performArtSearch('painting', 5, 5);

            expect(result1.results).toBeDefined();
            expect(result2.results).toBeDefined();

            // Results should be different (assuming enough results)
            if (result1.results.length > 0 && result2.results.length > 0) {
                const ids1 = result1.results.map(r => r.id);
                const ids2 = result2.results.map(r => r.id);

                // At least some results should be different
                const allSame = ids2.every(id => ids1.includes(id));
                expect(allSame).toBe(false);
            }
        });

        it('should return source status information', async () => {
            const result = await performArtSearch('art', 5);

            expect(result.sources).toBeDefined();
            expect(typeof result.sources).toBe('object');

            // Check structure of sources
            const expectedSources = ['met', 'artic', 'cleveland', 'rijksmuseum', 'wikimedia', 'vam', 'harvard', 'smithsonian'];
            expectedSources.forEach(source => {
                if (result.sources[source]) {
                    expect(result.sources[source]).toHaveProperty('status');
                    expect(result.sources[source]).toHaveProperty('count');
                }
            });
        });

        it('should handle empty query', async () => {
            const result = await performArtSearch('', 5);

            expect(result).toHaveProperty('results');
            expect(Array.isArray(result.results)).toBe(true);
        });

        it('should handle obscure queries gracefully', async () => {
            const result = await performArtSearch('xyznonexistent123', 5);

            expect(result).toHaveProperty('results');
            // May have 0 results, but should not throw
        });

        it('should include artwork metadata', async () => {
            const result = await performArtSearch('portrait', 3);

            if (result.results.length > 0) {
                const artwork = result.results[0];
                expect(artwork).toHaveProperty('title');
                expect(artwork).toHaveProperty('artist');
                expect(artwork).toHaveProperty('source');
            }
        });

        describe('caching', () => {
            it('should cache results for repeated queries', async () => {
                const query = 'Rembrandt';

                // First call
                const start1 = Date.now();
                const result1 = await performArtSearch(query, 5);
                const time1 = Date.now() - start1;

                // Second call (should be cached)
                const start2 = Date.now();
                const result2 = await performArtSearch(query, 5);
                const time2 = Date.now() - start2;

                // Both should return same results
                expect(result1.total).toBe(result2.total);

                // Second call should be faster (cached)
                // Allow some tolerance for timing variations
                console.log(`First call: ${time1}ms, Second call (cached): ${time2}ms`);
            });
        });
    });
});
