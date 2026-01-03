/**
 * Tests for utils/time.js
 */

const {
    formatBuildDate,
    getOsloTime,
    getOsloTimestamp,
    isInNightSleep,
    calculateNightSleepDuration
} = require('../../utils/time');

describe('Time Utility Functions', () => {
    describe('formatBuildDate', () => {
        it('should return "unknown" for unknown date', () => {
            expect(formatBuildDate('unknown')).toBe('unknown');
        });

        it('should return input for null/undefined', () => {
            expect(formatBuildDate(null)).toBe(null);
            expect(formatBuildDate(undefined)).toBe(undefined);
        });

        it('should return input for invalid date strings', () => {
            expect(formatBuildDate('not-a-date')).toBe('not-a-date');
        });

        it('should format valid ISO date strings', () => {
            const result = formatBuildDate('2025-01-03T10:30:00Z');
            expect(result).toContain('2025');
            expect(result).toContain('Jan');
        });

        it('should handle timezone offsets', () => {
            const result = formatBuildDate('2025-01-03T10:30:00+01:00');
            expect(result).toContain('2025');
        });
    });

    describe('getOsloTime', () => {
        it('should return an object with hour and minute', () => {
            const result = getOsloTime();
            expect(result).toHaveProperty('hour');
            expect(result).toHaveProperty('minute');
            expect(typeof result.hour).toBe('number');
            expect(typeof result.minute).toBe('number');
        });

        it('should return valid hour range (0-23)', () => {
            const { hour } = getOsloTime();
            expect(hour).toBeGreaterThanOrEqual(0);
            expect(hour).toBeLessThanOrEqual(23);
        });

        it('should return valid minute range (0-59)', () => {
            const { minute } = getOsloTime();
            expect(minute).toBeGreaterThanOrEqual(0);
            expect(minute).toBeLessThanOrEqual(59);
        });
    });

    describe('getOsloTimestamp', () => {
        it('should return a formatted timestamp string', () => {
            const result = getOsloTimestamp();
            expect(typeof result).toBe('string');
            // Should match format like "2025-01-03 10:30:45"
            expect(result).toMatch(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/);
        });
    });

    describe('isInNightSleep', () => {
        it('should return false when night sleep is disabled', () => {
            const settings = {
                nightSleepEnabled: false,
                nightSleepStartHour: 23,
                nightSleepEndHour: 6
            };
            expect(isInNightSleep(settings)).toBe(false);
        });

        it('should handle overnight period (e.g., 23:00 to 05:00)', () => {
            const settings = {
                nightSleepEnabled: true,
                nightSleepStartHour: 23,
                nightSleepEndHour: 5
            };
            // This test depends on current time, so we just check it doesn't throw
            expect(() => isInNightSleep(settings)).not.toThrow();
        });

        it('should handle same-day period (e.g., 02:00 to 06:00)', () => {
            const settings = {
                nightSleepEnabled: true,
                nightSleepStartHour: 2,
                nightSleepEndHour: 6
            };
            expect(() => isInNightSleep(settings)).not.toThrow();
        });
    });

    describe('calculateNightSleepDuration', () => {
        it('should return a number representing microseconds', () => {
            const settings = {
                nightSleepStartHour: 23,
                nightSleepEndHour: 6
            };
            const result = calculateNightSleepDuration(settings);
            expect(typeof result).toBe('number');
            // Result value depends on current time - just verify it's a valid number
            expect(Number.isFinite(result)).toBe(true);
        });

        it('should handle overnight period without throwing', () => {
            const settings = {
                nightSleepStartHour: 23,
                nightSleepEndHour: 5
            };
            expect(() => calculateNightSleepDuration(settings)).not.toThrow();
        });

        it('should handle same-day period without throwing', () => {
            const settings = {
                nightSleepStartHour: 2,
                nightSleepEndHour: 6
            };
            expect(() => calculateNightSleepDuration(settings)).not.toThrow();
        });
    });
});
