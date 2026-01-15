/**
 * Taste Guide Service
 * Re-exports from TypeScript implementation
 */

const tasteGuideModule = require('../dist/src/services/taste-guide');

// Export the singleton instance (default export from TS)
module.exports = tasteGuideModule.default;

// Also export named exports for testing
module.exports.TasteGuideService = tasteGuideModule.TasteGuideService;
module.exports.default = tasteGuideModule.default;
