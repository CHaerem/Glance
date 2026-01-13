/**
 * Statistics Service
 * Re-exports from TypeScript implementation
 */

const statisticsModule = require('../dist/src/services/statistics');

// Export the singleton instance (default export from TS)
module.exports = statisticsModule.default;
