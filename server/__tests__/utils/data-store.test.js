/**
 * Tests for utils/data-store.js
 */

const fs = require('fs').promises;
const path = require('path');
const {
    ensureDataDir,
    ensureDir,
    readJSONFile,
    writeJSONFile,
    clearCache,
    getDataDir
} = require('../../utils/data-store');

describe('Data Store Utility Functions', () => {
    const TEST_DIR = path.join(__dirname, '../../data');
    const TEST_FILE = 'test-data.json';

    beforeAll(async () => {
        // Ensure test directory exists
        await ensureDataDir();
    });

    afterEach(async () => {
        // Clean up test file after each test
        try {
            await fs.unlink(path.join(TEST_DIR, TEST_FILE));
        } catch {
            // File doesn't exist, ignore
        }
        // Clear cache between tests
        clearCache();
    });

    describe('getDataDir', () => {
        it('should return the data directory path', () => {
            const dir = getDataDir();
            expect(typeof dir).toBe('string');
            expect(dir).toContain('data');
        });
    });

    describe('ensureDataDir', () => {
        it('should create the data directory if it does not exist', async () => {
            await ensureDataDir();
            const stats = await fs.stat(TEST_DIR);
            expect(stats.isDirectory()).toBe(true);
        });

        it('should not throw if directory already exists', async () => {
            await ensureDataDir();
            await expect(ensureDataDir()).resolves.not.toThrow();
        });
    });

    describe('ensureDir', () => {
        const tempDir = path.join(__dirname, 'temp-test-dir');

        afterEach(async () => {
            try {
                await fs.rmdir(tempDir);
            } catch {
                // Directory doesn't exist, ignore
            }
        });

        it('should create a directory if it does not exist', async () => {
            await ensureDir(tempDir);
            const stats = await fs.stat(tempDir);
            expect(stats.isDirectory()).toBe(true);
        });

        it('should not throw if directory already exists', async () => {
            await ensureDir(tempDir);
            await expect(ensureDir(tempDir)).resolves.not.toThrow();
        });
    });

    describe('writeJSONFile and readJSONFile', () => {
        it('should write and read JSON data correctly', async () => {
            const testData = { name: 'test', value: 42, nested: { a: 1 } };

            await writeJSONFile(TEST_FILE, testData);
            const result = await readJSONFile(TEST_FILE);

            expect(result).toEqual(testData);
        });

        it('should handle arrays', async () => {
            const testData = [1, 2, 3, { a: 'b' }];

            await writeJSONFile(TEST_FILE, testData);
            const result = await readJSONFile(TEST_FILE);

            expect(result).toEqual(testData);
        });

        it('should return null for non-existent files', async () => {
            const result = await readJSONFile('non-existent-file.json');
            expect(result).toBeNull();
        });

        it('should use cache for repeated reads', async () => {
            const testData = { cached: true };
            await writeJSONFile(TEST_FILE, testData);

            // First read (no cache)
            const result1 = await readJSONFile(TEST_FILE);

            // Second read (should use cache)
            const result2 = await readJSONFile(TEST_FILE);

            expect(result1).toEqual(testData);
            expect(result2).toEqual(testData);
        });

        it('should bypass cache when useCache is false', async () => {
            const testData = { cached: false };
            await writeJSONFile(TEST_FILE, testData);

            const result = await readJSONFile(TEST_FILE, false);
            expect(result).toEqual(testData);
        });

        it('should invalidate cache on write', async () => {
            const data1 = { version: 1 };
            const data2 = { version: 2 };

            await writeJSONFile(TEST_FILE, data1);
            await readJSONFile(TEST_FILE); // Cache data1

            await writeJSONFile(TEST_FILE, data2); // Should invalidate cache
            const result = await readJSONFile(TEST_FILE);

            expect(result).toEqual(data2);
        });
    });

    describe('clearCache', () => {
        it('should clear the file cache', async () => {
            const testData = { test: true };
            await writeJSONFile(TEST_FILE, testData);
            await readJSONFile(TEST_FILE); // Populate cache

            clearCache();

            // After clearing, should read from disk again
            // (We can't directly test this without mocking fs, but at least verify it doesn't throw)
            const result = await readJSONFile(TEST_FILE);
            expect(result).toEqual(testData);
        });
    });

    describe('sequential writes', () => {
        it('should handle multiple sequential writes correctly', async () => {
            const data1 = { write: 1 };
            const data2 = { write: 2 };
            const data3 = { write: 3 };

            // Write sequentially
            await writeJSONFile(TEST_FILE, data1);
            const result1 = await readJSONFile(TEST_FILE, false);
            expect(result1).toEqual(data1);

            await writeJSONFile(TEST_FILE, data2);
            const result2 = await readJSONFile(TEST_FILE, false);
            expect(result2).toEqual(data2);

            await writeJSONFile(TEST_FILE, data3);
            const result3 = await readJSONFile(TEST_FILE, false);
            expect(result3).toEqual(data3);
        });
    });
});
