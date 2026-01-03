/**
 * Tests for utils/validation.js
 */

const {
    validateDeviceId,
    validateImageData,
    sanitizeInput,
    getRandomLuckyPrompt
} = require('../../utils/validation');

describe('Validation Utility Functions', () => {
    describe('validateDeviceId', () => {
        it('should accept valid device IDs', () => {
            expect(validateDeviceId('esp32-001')).toBe(true);
            expect(validateDeviceId('device-123-abc')).toBe(true);
            expect(validateDeviceId('a')).toBe(true); // Single character is valid
        });

        it('should reject empty strings', () => {
            expect(validateDeviceId('')).toBe(false);
        });

        it('should reject non-strings', () => {
            expect(validateDeviceId(null)).toBe(false);
            expect(validateDeviceId(undefined)).toBe(false);
            expect(validateDeviceId(123)).toBe(false);
            expect(validateDeviceId({})).toBe(false);
            expect(validateDeviceId([])).toBe(false);
        });

        it('should reject strings that are too long (>= 100 chars)', () => {
            const longId = 'a'.repeat(100);
            expect(validateDeviceId(longId)).toBe(false);

            const validId = 'a'.repeat(99);
            expect(validateDeviceId(validId)).toBe(true);
        });
    });

    describe('validateImageData', () => {
        it('should accept valid image data strings', () => {
            expect(validateImageData('base64encodeddata')).toBe(true);
            expect(validateImageData('data:image/png;base64,abc123')).toBe(true);
        });

        it('should reject non-strings', () => {
            expect(validateImageData(null)).toBe(false);
            expect(validateImageData(undefined)).toBe(false);
            expect(validateImageData(123)).toBe(false);
            expect(validateImageData({})).toBe(false);
        });

        it('should reject data larger than 10MB', () => {
            const largeData = 'a'.repeat(10 * 1024 * 1024); // Exactly 10MB
            expect(validateImageData(largeData)).toBe(false);

            const validData = 'a'.repeat(10 * 1024 * 1024 - 1); // Just under 10MB
            expect(validateImageData(validData)).toBe(true);
        });
    });

    describe('sanitizeInput', () => {
        it('should return empty string for non-strings', () => {
            expect(sanitizeInput(null)).toBe('');
            expect(sanitizeInput(undefined)).toBe('');
            expect(sanitizeInput(123)).toBe('');
            expect(sanitizeInput({})).toBe('');
        });

        it('should remove angle brackets', () => {
            expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
            expect(sanitizeInput('Hello <world>')).toBe('Hello world');
        });

        it('should trim whitespace', () => {
            expect(sanitizeInput('  hello world  ')).toBe('hello world');
        });

        it('should truncate to 1000 characters', () => {
            const longInput = 'a'.repeat(1500);
            const result = sanitizeInput(longInput);
            expect(result.length).toBe(1000);
        });

        it('should preserve safe characters', () => {
            const input = 'Hello, World! 123 @#$%^&*()';
            expect(sanitizeInput(input)).toBe(input);
        });
    });

    describe('getRandomLuckyPrompt', () => {
        it('should return a non-empty string', () => {
            const result = getRandomLuckyPrompt();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should return art-related prompts', () => {
            const result = getRandomLuckyPrompt();
            // Check that it contains some art-related keywords
            const artKeywords = [
                'landscapes', 'patterns', 'dreamscapes', 'botanical',
                'architecture', 'cosmic', 'mythological', 'urban',
                'textures', 'travel', 'art deco', 'underwater',
                'cityscapes', 'folk art', 'wildlife', 'expressionism',
                'woodblock', 'steampunk', 'aurora', 'sci-fi'
            ];
            const hasArtKeyword = artKeywords.some(keyword =>
                result.toLowerCase().includes(keyword)
            );
            expect(hasArtKeyword).toBe(true);
        });

        it('should return different prompts on multiple calls (probabilistic)', () => {
            const prompts = new Set();
            // Generate 20 prompts and expect at least 2 unique ones
            for (let i = 0; i < 20; i++) {
                prompts.add(getRandomLuckyPrompt());
            }
            expect(prompts.size).toBeGreaterThan(1);
        });
    });
});
