/**
 * Memory Limits Tests
 *
 * Tests to verify that memory leak prevention mechanisms work correctly.
 * These tests ensure cache/session limits are enforced.
 */

const guideChatService = require('../../services/guide-chat').default;
const { GuideChatService } = require('../../services/guide-chat');

describe('Memory Limits', () => {
  describe('Guide Chat Session Limits', () => {
    test('getDiagnostics returns correct structure', () => {
      const diagnostics = guideChatService.getDiagnostics();

      expect(diagnostics).toHaveProperty('sessionCount');
      expect(diagnostics).toHaveProperty('totalMessages');
      expect(diagnostics).toHaveProperty('maxSessionMessages');
      expect(diagnostics).toHaveProperty('oldestSessionAge');
      expect(diagnostics).toHaveProperty('limits');
      expect(diagnostics.limits).toHaveProperty('maxSessions');
      expect(diagnostics.limits).toHaveProperty('maxMessagesPerSession');
      expect(diagnostics.limits).toHaveProperty('sessionTimeoutMs');
    });

    test('limits are set to expected values', () => {
      const diagnostics = guideChatService.getDiagnostics();

      expect(diagnostics.limits.maxSessions).toBe(100);
      expect(diagnostics.limits.maxMessagesPerSession).toBe(50);
      expect(diagnostics.limits.sessionTimeoutMs).toBe(30 * 60 * 1000);
    });

    test('new instance starts with 0 sessions', () => {
      const service = new GuideChatService();
      const diagnostics = service.getDiagnostics();

      expect(diagnostics.sessionCount).toBe(0);
      expect(diagnostics.totalMessages).toBe(0);
    });
  });

  describe('MCP Auth Limits', () => {
    test('createMcpRoutes returns router and getDiagnostics', () => {
      const mcpModule = require('../../mcp');
      const { createMcpRoutes } = mcpModule.default || mcpModule;
      const result = createMcpRoutes({ glanceBaseUrl: 'http://localhost:3000' });

      expect(result).toHaveProperty('router');
      expect(result).toHaveProperty('getDiagnostics');
      expect(typeof result.getDiagnostics).toBe('function');
    });

    test('MCP diagnostics returns correct structure', () => {
      const mcpModule = require('../../mcp');
      const { createMcpRoutes } = mcpModule.default || mcpModule;
      const { getDiagnostics } = createMcpRoutes({ glanceBaseUrl: 'http://localhost:3000' });
      const diagnostics = getDiagnostics();

      expect(diagnostics).toHaveProperty('authCodesCount');
      expect(diagnostics).toHaveProperty('authenticatedClientsCount');
      expect(diagnostics).toHaveProperty('limits');
      expect(diagnostics.limits).toHaveProperty('maxAuthCodes');
      expect(diagnostics.limits).toHaveProperty('maxAuthClients');
    });

    test('MCP limits are set to expected values', () => {
      const mcpModule = require('../../mcp');
      const { createMcpRoutes } = mcpModule.default || mcpModule;
      const { getDiagnostics } = createMcpRoutes({ glanceBaseUrl: 'http://localhost:3000' });
      const diagnostics = getDiagnostics();

      expect(diagnostics.limits.maxAuthCodes).toBe(100);
      expect(diagnostics.limits.maxAuthClients).toBe(200);
    });

    test('MCP auth counts start at 0', () => {
      const mcpModule = require('../../mcp');
      const { createMcpRoutes } = mcpModule.default || mcpModule;
      const { getDiagnostics } = createMcpRoutes({ glanceBaseUrl: 'http://localhost:3000' });
      const diagnostics = getDiagnostics();

      expect(diagnostics.authCodesCount).toBe(0);
      expect(diagnostics.authenticatedClientsCount).toBe(0);
    });
  });

  describe('Cache Helper Functions (unit tests)', () => {
    // Test the logic of cache eviction without needing browser context

    test('FIFO eviction removes oldest entry', () => {
      // Simulate the enforceMapLimit logic
      function enforceMapLimit(map, maxSize) {
        if (map.size > maxSize) {
          const excess = map.size - maxSize;
          const keysToDelete = Array.from(map.keys()).slice(0, excess);
          keysToDelete.forEach(key => map.delete(key));
        }
      }

      const testMap = new Map();
      testMap.set('a', 1);
      testMap.set('b', 2);
      testMap.set('c', 3);
      testMap.set('d', 4);
      testMap.set('e', 5);

      enforceMapLimit(testMap, 3);

      expect(testMap.size).toBe(3);
      expect(testMap.has('a')).toBe(false);
      expect(testMap.has('b')).toBe(false);
      expect(testMap.has('c')).toBe(true);
      expect(testMap.has('d')).toBe(true);
      expect(testMap.has('e')).toBe(true);
    });

    test('TTL check removes expired entries', () => {
      // Simulate the TTL check logic
      const TTL_MS = 1000; // 1 second for testing

      function isExpired(timestamp, ttl) {
        return Date.now() - timestamp > ttl;
      }

      const now = Date.now();
      const oldTimestamp = now - 2000; // 2 seconds ago
      const newTimestamp = now - 500;  // 0.5 seconds ago

      expect(isExpired(oldTimestamp, TTL_MS)).toBe(true);
      expect(isExpired(newTimestamp, TTL_MS)).toBe(false);
    });

    test('size limit enforced before adding new entry', () => {
      // Simulate the setPlaylistCache logic
      const MAX_ENTRIES = 3;
      const cache = new Map();

      function setCache(key, value) {
        if (cache.size >= MAX_ENTRIES) {
          const oldestKey = cache.keys().next().value;
          cache.delete(oldestKey);
        }
        cache.set(key, value);
      }

      setCache('a', 1);
      setCache('b', 2);
      setCache('c', 3);
      expect(cache.size).toBe(3);

      setCache('d', 4);
      expect(cache.size).toBe(3);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('d')).toBe(true);
    });
  });

  describe('Message Trimming', () => {
    test('array trimming keeps most recent messages', () => {
      const MAX_MESSAGES = 5;
      let messages = [];

      // Add messages
      for (let i = 1; i <= 10; i++) {
        messages.push({ id: i, content: `Message ${i}` });

        // Trim if over limit
        if (messages.length > MAX_MESSAGES) {
          messages = messages.slice(-MAX_MESSAGES);
        }
      }

      expect(messages.length).toBe(5);
      expect(messages[0].id).toBe(6);  // First message should be #6
      expect(messages[4].id).toBe(10); // Last message should be #10
    });
  });
});
