/**
 * Glance MCP Server
 *
 * Re-exports from TypeScript implementation
 */

const mcpModule = require('../dist/src/mcp');

module.exports = {
  createMcpServer: mcpModule.createMcpServer,
  createMcpRoutes: mcpModule.createMcpRoutes,
  getLatestAiSearch: mcpModule.getLatestAiSearch,
  clearLatestAiSearch: mcpModule.clearLatestAiSearch,
};
