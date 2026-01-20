/**
 * OpenAI Agentic Art Search Service
 * Re-exports from TypeScript implementation
 */

const openaiSearchModule = require('../dist/src/services/openai-search');

module.exports = openaiSearchModule.default;
module.exports.default = openaiSearchModule.default;
module.exports.OpenAIAgentSearch = openaiSearchModule.OpenAIAgentSearch;
