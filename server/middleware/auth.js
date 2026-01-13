/**
 * API Key Authentication Middleware
 * Re-exports from TypeScript implementation
 */

const authModule = require('../dist/src/middleware/auth');

module.exports = {
    apiKeyAuth: authModule.apiKeyAuth,
    optionalApiKeyAuth: authModule.optionalApiKeyAuth,
    isLocalRequest: authModule.isLocalRequest,
    API_KEYS: authModule.API_KEYS
};
