/**
 * Tests for image-validator utility
 */

const {
    getWikimediaUrl,
    isFilenameValidated,
    getCacheStats,
    clearValidationCache
} = require('../../utils/image-validator');

describe('Image Validator', () => {
    beforeEach(() => {
        // Clear cache before each test
        clearValidationCache();
    });

    describe('getWikimediaUrl', () => {
        it('should build correct URL from raw filename', () => {
            const url = getWikimediaUrl('Mona_Lisa.jpg', 1200);
            expect(url).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Mona_Lisa.jpg?width=1200');
        });

        it('should handle filenames with spaces', () => {
            const url = getWikimediaUrl('The Great Wave.jpg', 400);
            expect(url).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/The%20Great%20Wave.jpg?width=400');
        });

        it('should handle already-encoded filenames without double-encoding', () => {
            // This is the key fix - filenames like "Caf%C3%A9" should not become "Caf%25C3%25A9"
            const url = getWikimediaUrl('Van_Gogh_-_Terrasse_des_Caf%C3%A9s.jpeg', 400);
            expect(url).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Van_Gogh_-_Terrasse_des_Caf%C3%A9s.jpeg?width=400');
        });

        it('should handle raw unicode characters', () => {
            const url = getWikimediaUrl('Café_Terrace.jpg', 400);
            expect(url).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Caf%C3%A9_Terrace.jpg?width=400');
        });

        it('should handle mixed encoding (some encoded, some not)', () => {
            // Filename with both encoded and raw special chars
            const url = getWikimediaUrl('Paul_C%C3%A9zanne_-_Mont_Sainte-Victoire.jpg', 1200);
            expect(url).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Paul_C%C3%A9zanne_-_Mont_Sainte-Victoire.jpg?width=1200');
        });

        it('should use default width of 1200 if not specified', () => {
            const url = getWikimediaUrl('Test.jpg');
            expect(url).toContain('width=1200');
        });

        it('should handle filenames with commas', () => {
            const url = getWikimediaUrl('Mona_Lisa,_by_Leonardo_da_Vinci.jpg', 400);
            expect(url).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Mona_Lisa%2C_by_Leonardo_da_Vinci.jpg?width=400');
        });

        it('should handle filenames with parentheses', () => {
            const url = getWikimediaUrl('Michelangelo_-_Creation_of_Adam_(cropped).jpg', 400);
            expect(url).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Michelangelo_-_Creation_of_Adam_(cropped).jpg?width=400');
        });
    });

    describe('isFilenameValidated', () => {
        it('should return false for filenames not in cache', () => {
            const result = isFilenameValidated('nonexistent.jpg');
            expect(result).toBe(false);
        });
    });

    describe('getCacheStats', () => {
        it('should return empty stats when cache is empty', () => {
            const stats = getCacheStats();
            expect(stats.totalEntries).toBe(0);
            expect(stats.validUrls).toBe(0);
            expect(stats.invalidUrls).toBe(0);
        });
    });

    describe('clearValidationCache', () => {
        it('should clear the cache', () => {
            // Add something to cache by checking stats
            const statsBefore = getCacheStats();
            expect(statsBefore.totalEntries).toBe(0);

            // Clear and verify
            clearValidationCache();
            const statsAfter = getCacheStats();
            expect(statsAfter.totalEntries).toBe(0);
        });
    });
});
