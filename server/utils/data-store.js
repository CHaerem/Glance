/**
 * Data storage utilities with caching and file locking
 * Re-exports from TypeScript implementation
 */

const dataStoreModule = require('../dist/src/utils/data-store');

module.exports = {
    ensureDataDir: dataStoreModule.ensureDataDir,
    ensureDir: dataStoreModule.ensureDir,
    readJSONFile: dataStoreModule.readJSONFile,
    writeJSONFile: dataStoreModule.writeJSONFile,
    clearCache: dataStoreModule.clearCache,
    getDataDir: dataStoreModule.getDataDir
};
