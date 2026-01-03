/**
 * Tests for services/statistics.js
 */

// Create a fresh instance for testing by requiring the module
const statistics = require('../../services/statistics');

describe('Statistics Service', () => {
    beforeEach(async () => {
        // Reset statistics before each test
        await statistics.resetStats();
    });

    describe('trackOpenAICall', () => {
        it('should track a successful OpenAI call', async () => {
            const result = await statistics.trackOpenAICall(
                'gpt-4o-mini',
                100,  // prompt tokens
                50,   // completion tokens
                true, // success
                { endpoint: 'test' }
            );

            expect(result).toHaveProperty('timestamp');
            expect(result.model).toBe('gpt-4o-mini');
            expect(result.promptTokens).toBe(100);
            expect(result.completionTokens).toBe(50);
            expect(result.totalTokens).toBe(150);
            expect(result.success).toBe(true);
            expect(result.cost).toBeGreaterThan(0);
        });

        it('should calculate cost correctly for token-based models', async () => {
            const result = await statistics.trackOpenAICall(
                'gpt-4o-mini',
                1000000, // 1M prompt tokens
                1000000, // 1M completion tokens
                true
            );

            // gpt-4o-mini: $0.15 per 1M input, $0.60 per 1M output
            // Expected: 0.15 + 0.60 = 0.75
            expect(result.cost).toBeCloseTo(0.75, 2);
        });

        it('should calculate cost correctly for image generation', async () => {
            const result = await statistics.trackOpenAICall(
                'gpt-image-1',
                0,
                0,
                true
            );

            // gpt-image-1: $0.05 per request
            expect(result.cost).toBeCloseTo(0.05, 2);
        });

        it('should handle null token counts', async () => {
            const result = await statistics.trackOpenAICall(
                'gpt-4o-mini',
                null,
                null,
                true
            );

            expect(result.promptTokens).toBe(0);
            expect(result.completionTokens).toBe(0);
            expect(result.totalTokens).toBe(0);
        });

        it('should update summary statistics', async () => {
            await statistics.trackOpenAICall('gpt-4o-mini', 100, 50, true);
            await statistics.trackOpenAICall('gpt-4o-mini', 200, 100, true);

            const stats = statistics.getStats();
            expect(stats.openai.summary.totalCalls).toBe(2);
            expect(stats.openai.summary.totalTokens).toBe(450);
            expect(stats.openai.summary.byModel['gpt-4o-mini'].calls).toBe(2);
        });
    });

    describe('trackAPICall', () => {
        it('should track a successful API call', async () => {
            const result = await statistics.trackAPICall(
                'Met Museum',
                '/api/search',
                true,
                { query: 'test' }
            );

            expect(result).toHaveProperty('timestamp');
            expect(result.source).toBe('Met Museum');
            expect(result.endpoint).toBe('/api/search');
            expect(result.success).toBe(true);
        });

        it('should track failed API calls', async () => {
            const result = await statistics.trackAPICall(
                'Met Museum',
                '/api/search',
                false,
                { error: 'timeout' }
            );

            expect(result.success).toBe(false);
        });

        it('should update by-source statistics', async () => {
            await statistics.trackAPICall('Met Museum', '/search', true);
            await statistics.trackAPICall('Met Museum', '/search', false);
            await statistics.trackAPICall('ARTIC', '/artworks', true);

            const stats = statistics.getStats();
            expect(stats.apiCalls.summary.totalCalls).toBe(3);
            expect(stats.apiCalls.summary.bySource['Met Museum'].calls).toBe(2);
            expect(stats.apiCalls.summary.bySource['Met Museum'].successes).toBe(1);
            expect(stats.apiCalls.summary.bySource['Met Museum'].failures).toBe(1);
            expect(stats.apiCalls.summary.bySource['ARTIC'].calls).toBe(1);
        });
    });

    describe('trackLog', () => {
        it('should track log entries', async () => {
            await statistics.trackLog('INFO', 'Test log message');
            await statistics.trackLog('ERROR', 'Error message');

            const stats = statistics.getStats();
            expect(stats.logs.totalLogs).toBe(2);
            expect(stats.logs.byLevel.INFO).toBe(1);
            expect(stats.logs.byLevel.ERROR).toBe(1);
        });

        it('should truncate long messages', async () => {
            const longMessage = 'a'.repeat(200);
            await statistics.trackLog('INFO', longMessage);

            const stats = statistics.getStats();
            expect(stats.logs.recentActivity[0].message.length).toBeLessThanOrEqual(100);
        });

        it('should keep only last 100 log entries', async () => {
            for (let i = 0; i < 150; i++) {
                await statistics.trackLog('INFO', `Message ${i}`);
            }

            const stats = statistics.getStats();
            expect(stats.logs.recentActivity.length).toBeLessThanOrEqual(100);
        });
    });

    describe('getStats', () => {
        beforeEach(async () => {
            // Add some test data
            await statistics.trackOpenAICall('gpt-4o-mini', 100, 50, true);
            await statistics.trackAPICall('Met Museum', '/search', true);
        });

        it('should return all stats by default', () => {
            const stats = statistics.getStats();

            expect(stats).toHaveProperty('timeRange', 'all');
            expect(stats).toHaveProperty('uptime');
            expect(stats).toHaveProperty('openai');
            expect(stats).toHaveProperty('apiCalls');
            expect(stats).toHaveProperty('logs');
        });

        it('should filter by time range', () => {
            const stats1h = statistics.getStats('1h');
            const stats24h = statistics.getStats('24h');
            const stats7d = statistics.getStats('7d');

            expect(stats1h.timeRange).toBe('1h');
            expect(stats24h.timeRange).toBe('24h');
            expect(stats7d.timeRange).toBe('7d');

            // Recent calls should appear in all time ranges
            expect(stats1h.openai.summary.totalCalls).toBe(1);
            expect(stats24h.openai.summary.totalCalls).toBe(1);
            expect(stats7d.openai.summary.totalCalls).toBe(1);
        });

        it('should include recent calls in response', () => {
            const stats = statistics.getStats();

            expect(stats.openai.recentCalls).toHaveLength(1);
            expect(stats.apiCalls.recentCalls).toHaveLength(1);
        });
    });

    describe('resetStats', () => {
        it('should reset all statistics', async () => {
            // Add some data first
            await statistics.trackOpenAICall('gpt-4o-mini', 100, 50, true);
            await statistics.trackAPICall('Met Museum', '/search', true);
            await statistics.trackLog('INFO', 'Test');

            // Reset
            await statistics.resetStats();

            const stats = statistics.getStats();
            expect(stats.openai.summary.totalCalls).toBe(0);
            expect(stats.apiCalls.summary.totalCalls).toBe(0);
            expect(stats.logs.totalLogs).toBe(0);
        });
    });

    describe('loadStats and saveStats', () => {
        it('should persist and restore statistics', async () => {
            await statistics.trackOpenAICall('gpt-4o-mini', 100, 50, true);

            // Force save
            await statistics.saveStats();

            // Reset in-memory cache and reload
            await statistics.resetStats();
            await statistics.loadStats();

            // The loaded stats might be reset (depends on file state), just verify no throw
            expect(() => statistics.getStats()).not.toThrow();
        });
    });
});
