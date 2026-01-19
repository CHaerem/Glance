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
    modifyJSONFile,
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

    describe('modifyJSONFile (transactional)', () => {
        const MODIFY_TEST_FILE = 'modify-test.json';

        afterEach(async () => {
            try {
                await fs.unlink(path.join(TEST_DIR, MODIFY_TEST_FILE));
            } catch {
                // File doesn't exist, ignore
            }
        });

        it('should create file with default value if not exists', async () => {
            const result = await modifyJSONFile(
                MODIFY_TEST_FILE,
                (data) => ({ ...data, added: true }),
                { initial: true }
            );

            expect(result).toEqual({ initial: true, added: true });
        });

        it('should modify existing data', async () => {
            // Create initial data
            await writeJSONFile(MODIFY_TEST_FILE, { count: 0 });

            // Modify it
            const result = await modifyJSONFile(
                MODIFY_TEST_FILE,
                (data) => ({ ...data, count: data.count + 1 }),
                { count: 0 }
            );

            expect(result).toEqual({ count: 1 });
        });

        it('should support async modifiers', async () => {
            await writeJSONFile(MODIFY_TEST_FILE, { value: 'sync' });

            const result = await modifyJSONFile(
                MODIFY_TEST_FILE,
                async (data) => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return { ...data, value: 'async' };
                },
                {}
            );

            expect(result).toEqual({ value: 'async' });
        });

        it('should handle concurrent modifications safely', async () => {
            // Initialize counter
            await writeJSONFile(MODIFY_TEST_FILE, { count: 0 });

            // Run 10 concurrent increments
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(
                    modifyJSONFile(
                        MODIFY_TEST_FILE,
                        (data) => ({ count: data.count + 1 }),
                        { count: 0 }
                    )
                );
            }

            await Promise.all(promises);

            // All increments should be applied (no race conditions)
            const result = await readJSONFile(MODIFY_TEST_FILE, false);
            expect(result.count).toBe(10);
        });

        it('should prevent race conditions in read-modify-write', async () => {
            // Initialize data
            await writeJSONFile(MODIFY_TEST_FILE, {
                devices: {},
                updateCount: 0
            });

            // Simulate concurrent device updates
            const deviceUpdates = [
                { id: 'device-1', battery: 3.9 },
                { id: 'device-2', battery: 4.0 },
                { id: 'device-3', battery: 3.7 },
            ];

            await Promise.all(deviceUpdates.map(device =>
                modifyJSONFile(
                    MODIFY_TEST_FILE,
                    (data) => ({
                        devices: { ...data.devices, [device.id]: device },
                        updateCount: data.updateCount + 1
                    }),
                    { devices: {}, updateCount: 0 }
                )
            ));

            const result = await readJSONFile(MODIFY_TEST_FILE, false);
            expect(Object.keys(result.devices)).toHaveLength(3);
            expect(result.updateCount).toBe(3);
        });

        it('should preserve data integrity on modifier error', async () => {
            const initialData = { value: 'original' };
            await writeJSONFile(MODIFY_TEST_FILE, initialData);

            // Try to modify with a failing modifier
            await expect(
                modifyJSONFile(
                    MODIFY_TEST_FILE,
                    () => { throw new Error('Modifier failed'); },
                    {}
                )
            ).rejects.toThrow('Modifier failed');

            // Original data should be preserved
            const result = await readJSONFile(MODIFY_TEST_FILE, false);
            expect(result).toEqual(initialData);
        });

        it('should return the modified data', async () => {
            await writeJSONFile(MODIFY_TEST_FILE, { items: [] });

            const result = await modifyJSONFile(
                MODIFY_TEST_FILE,
                (data) => ({ items: [...data.items, 'new-item'] }),
                { items: [] }
            );

            expect(result).toEqual({ items: ['new-item'] });
        });
    });
});
