/**
 * Guide Chat Service
 * Re-exports from TypeScript implementation
 */

const guideChatModule = require('../dist/src/services/guide-chat');

// Export the singleton instance (default export from TS)
module.exports = guideChatModule.default;

// Also export named exports for testing
module.exports.GuideChatService = guideChatModule.GuideChatService;
module.exports.default = guideChatModule.default;
