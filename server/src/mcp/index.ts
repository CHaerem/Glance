/**
 * Glance MCP Server
 *
 * Exposes Glance art gallery functionality as MCP tools for Claude.ai integration.
 * Supports the Streamable HTTP transport for remote MCP connections.
 */

import { Router, Request, Response } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils/error';

const log = loggers.api.child({ component: 'mcp' });

/** Artwork result from search */
interface ArtworkResult {
  id?: string;
  title?: string;
  artist?: string;
  date?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  source?: string;
}

/** Latest AI search cache */
interface AISearchCache {
  query: string | null;
  results: ArtworkResult[];
  timestamp: number | null;
}

/** MCP tool response content */
interface McpContentItem {
  type: 'text';
  text: string;
}

/** MCP tool response */
interface McpToolResponse {
  content: McpContentItem[];
  isError?: boolean;
  _metadata?: Record<string, unknown>;
}

/** Playlist data */
interface PlaylistItem {
  id: string;
  name: string;
  type: string;
  description?: string;
}

/** Device status data */
interface DeviceStatusData {
  batteryVoltage?: number;
  batteryPercent?: number;
  isCharging?: boolean;
  signalStrength?: number;
  firmwareVersion?: string;
  lastSeen?: number;
}

/** Current display data */
interface CurrentDisplayData {
  title?: string;
  timestamp?: number;
}

/** MCP server config */
export interface McpServerConfig {
  glanceBaseUrl?: string;
}

// In-memory cache for latest AI search results
// This allows the Glance page to display results when Claude searches via MCP
let latestAiSearch: AISearchCache = {
  query: null,
  results: [],
  timestamp: null,
};

/**
 * Get the latest AI search results
 */
export function getLatestAiSearch(): AISearchCache {
  return latestAiSearch;
}

/**
 * Clear the latest AI search results
 */
export function clearLatestAiSearch(): void {
  latestAiSearch = { query: null, results: [], timestamp: null };
}

/**
 * Create MCP server with Glance tools
 */
export function createMcpServer({ glanceBaseUrl = 'http://localhost:3000' }: McpServerConfig = {}): unknown {
  const server = new McpServer({
    name: 'glance-art-guide',
    version: '1.0.0',
  });

  // Helper to make Glance API requests
  async function glanceApi<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${glanceBaseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Glance API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  // Tool: Search for artworks
  server.tool(
    'search_artworks',
    'Search for artworks across museum collections. Use keywords like artist names, art movements, subjects, or time periods.',
    {
      query: {
        type: 'string',
        description:
          'Search query (e.g., "Monet water lilies", "impressionist landscape", "Dutch Golden Age")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 12, max: 20)',
        optional: true,
      },
    },
    async ({ query, limit = 12 }: { query: string; limit?: number }): Promise<McpToolResponse> => {
      log.info('MCP search_artworks', { query, limit });

      try {
        const data = await glanceApi<{ results?: ArtworkResult[] }>(
          `/api/art/search?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 20)}`
        );
        const results = data.results || [];

        // Store results for Glance page to fetch
        latestAiSearch = {
          query,
          results,
          timestamp: Date.now(),
        };
        log.info('MCP search_artworks stored results', { query, count: results.length });

        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No artworks found for "${query}". Try different keywords like artist names, art movements, or subjects.`,
              },
            ],
          };
        }

        // Format results for display
        const formatted = results
          .map(
            (art, i) =>
              `${i + 1}. "${art.title}" by ${art.artist || 'Unknown'} (${art.source})\n   Image: ${art.imageUrl}`
          )
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${results.length} artworks:\n\n${formatted}`,
            },
          ],
          // Include raw data for the artifact to use
          _metadata: { results },
        };
      } catch (error) {
        log.error('MCP search_artworks error', {
          error: getErrorMessage(error),
        });
        return {
          content: [
            { type: 'text', text: `Search failed: ${getErrorMessage(error)}` },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: Display artwork on e-ink frame
  server.tool(
    'display_artwork',
    'Display an artwork on the e-ink frame. The image will be processed and sent to the display.',
    {
      imageUrl: {
        type: 'string',
        description: 'URL of the artwork image to display',
      },
      title: {
        type: 'string',
        description: 'Title of the artwork',
        optional: true,
      },
      artist: {
        type: 'string',
        description: 'Artist name',
        optional: true,
      },
    },
    async ({
      imageUrl,
      title,
      artist,
    }: {
      imageUrl: string;
      title?: string;
      artist?: string;
    }): Promise<McpToolResponse> => {
      log.info('MCP display_artwork', { imageUrl, title, artist });

      try {
        await glanceApi('/api/art/import', {
          method: 'POST',
          body: JSON.stringify({
            imageUrl,
            title: title || 'Untitled',
            artist: artist || 'Unknown',
            rotation: 0,
          }),
        });

        return {
          content: [
            {
              type: 'text',
              text: `Displaying "${title || 'artwork'}" on your e-ink frame. The display will refresh in about 30 seconds.`,
            },
          ],
        };
      } catch (error) {
        log.error('MCP display_artwork error', {
          error: getErrorMessage(error),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Failed to display artwork: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: Get current display
  server.tool(
    'get_current_display',
    'Get information about what is currently displayed on the e-ink frame.',
    {},
    async (): Promise<McpToolResponse> => {
      log.info('MCP get_current_display');

      try {
        const data = await glanceApi<CurrentDisplayData>('/api/current.json');

        if (!data.title) {
          return {
            content: [{ type: 'text', text: 'Nothing is currently displayed on the frame.' }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Currently displaying: "${data.title}"\nLast updated: ${new Date(data.timestamp || 0).toLocaleString()}`,
            },
          ],
          _metadata: { current: data },
        };
      } catch (error) {
        log.error('MCP get_current_display error', {
          error: getErrorMessage(error),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get current display: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: List playlists
  server.tool(
    'list_playlists',
    'List all available art playlists. Includes curated museum collections and dynamic AI-powered playlists.',
    {},
    async (): Promise<McpToolResponse> => {
      log.info('MCP list_playlists');

      try {
        const data = await glanceApi<{ playlists?: PlaylistItem[] }>('/api/playlists');
        const playlists = data.playlists || [];

        if (playlists.length === 0) {
          return {
            content: [{ type: 'text', text: 'No playlists available.' }],
          };
        }

        const formatted = playlists
          .map((p) => `• ${p.name} (${p.type}): ${p.description || 'No description'}`)
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Available playlists:\n\n${formatted}`,
            },
          ],
          _metadata: { playlists },
        };
      } catch (error) {
        log.error('MCP list_playlists error', {
          error: getErrorMessage(error),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list playlists: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: Get playlist artworks
  server.tool(
    'get_playlist',
    'Get artworks from a specific playlist.',
    {
      playlistId: {
        type: 'string',
        description: 'Playlist ID (e.g., "impressionist-masters", "serene-nature", "bold-abstract")',
      },
    },
    async ({ playlistId }: { playlistId: string }): Promise<McpToolResponse> => {
      log.info('MCP get_playlist', { playlistId });

      try {
        const data = await glanceApi<{ name?: string; artworks?: ArtworkResult[] }>(
          `/api/playlists/${playlistId}`
        );
        const artworks = data.artworks || [];

        if (artworks.length === 0) {
          return {
            content: [{ type: 'text', text: `Playlist "${playlistId}" is empty or not found.` }],
          };
        }

        // Store results for Glance page to fetch
        latestAiSearch = {
          query: data.name || playlistId,
          results: artworks,
          timestamp: Date.now(),
        };
        log.info('MCP get_playlist stored results', { playlistId, count: artworks.length });

        const formatted = artworks
          .slice(0, 10)
          .map((art, i) => `${i + 1}. "${art.title}" by ${art.artist || 'Unknown'}`)
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Playlist "${data.name || playlistId}" (${artworks.length} artworks):\n\n${formatted}${artworks.length > 10 ? `\n\n...and ${artworks.length - 10} more` : ''}`,
            },
          ],
          _metadata: { playlist: data, artworks },
        };
      } catch (error) {
        log.error('MCP get_playlist error', {
          error: getErrorMessage(error),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get playlist: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: Get device status
  server.tool(
    'get_device_status',
    'Get the status of the e-ink display device including battery level and connection status.',
    {},
    async (): Promise<McpToolResponse> => {
      log.info('MCP get_device_status');

      try {
        const data = await glanceApi<DeviceStatusData>('/api/esp32-status');

        if (!data.batteryVoltage) {
          return {
            content: [{ type: 'text', text: 'Device status not available. The device may be offline.' }],
          };
        }

        const status = [
          `Battery: ${data.batteryPercent || 'Unknown'}% (${data.batteryVoltage}V)`,
          data.isCharging ? 'Charging: Yes' : 'Charging: No',
          `WiFi Signal: ${data.signalStrength || 'Unknown'} dBm`,
          `Firmware: ${data.firmwareVersion || 'Unknown'}`,
          `Last seen: ${data.lastSeen ? new Date(data.lastSeen).toLocaleString() : 'Unknown'}`,
        ].join('\n');

        return {
          content: [{ type: 'text', text: `Device Status:\n\n${status}` }],
          _metadata: { device: data },
        };
      } catch (error) {
        log.error('MCP get_device_status error', {
          error: getErrorMessage(error),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get device status: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: Random artwork
  server.tool(
    'random_artwork',
    'Get a random artwork for serendipitous discovery.',
    {},
    async (): Promise<McpToolResponse> => {
      log.info('MCP random_artwork');

      try {
        const data = await glanceApi<ArtworkResult>('/api/art/random');

        if (!data.imageUrl) {
          return {
            content: [{ type: 'text', text: 'Could not fetch a random artwork. Please try again.' }],
          };
        }

        // Store result for Glance page to fetch (as single-item array)
        latestAiSearch = {
          query: 'Random artwork',
          results: [data],
          timestamp: Date.now(),
        };
        log.info('MCP random_artwork stored result', { title: data.title });

        return {
          content: [
            {
              type: 'text',
              text: `Random artwork: "${data.title || 'Untitled'}" by ${data.artist || 'Unknown'} (${data.source})\n\nImage: ${data.imageUrl}`,
            },
          ],
          _metadata: { artwork: data },
        };
      } catch (error) {
        log.error('MCP random_artwork error', {
          error: getErrorMessage(error),
        });
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get random artwork: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

/**
 * Create Express routes for MCP Streamable HTTP transport
 */
export function createMcpRoutes({ glanceBaseUrl = 'http://localhost:3000' }: McpServerConfig = {}): Router {
  const router = Router();
  const mcpServer = createMcpServer({ glanceBaseUrl });

  // Store active transports by session ID
  const transports = new Map<string, unknown>();

  // MCP endpoint for Streamable HTTP
  router.post('/mcp', async (req: Request, res: Response) => {
    log.info('MCP request received', { body: req.body });

    try {
      // Get or create session ID
      const sessionId =
        (req.headers['x-mcp-session-id'] as string) || (req.body as { sessionId?: string }).sessionId || 'default';

      // Get or create transport for this session
      let transport = transports.get(sessionId);
      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
        });
        await (mcpServer as { connect: (t: unknown) => Promise<void> }).connect(transport);
        transports.set(sessionId, transport);
        log.info('MCP session created', { sessionId });
      }

      // Handle the request
      await (transport as { handleRequest: (req: Request, res: Response, body: unknown) => Promise<void> }).handleRequest(req, res, req.body);
    } catch (error) {
      log.error('MCP error', {
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Health check for MCP
  router.get('/mcp/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      server: 'glance-art-guide',
      version: '1.0.0',
      tools: [
        'search_artworks',
        'display_artwork',
        'get_current_display',
        'list_playlists',
        'get_playlist',
        'get_device_status',
        'random_artwork',
      ],
    });
  });

  // MCP server info (for discovery)
  router.get('/mcp', (_req: Request, res: Response) => {
    res.json({
      name: 'glance-art-guide',
      version: '1.0.0',
      description: 'AI-powered art guide for Glance e-ink display',
      transport: 'streamable-http',
      endpoint: '/api/mcp',
    });
  });

  // Endpoint for Glance page to fetch latest AI search results
  router.get('/ai-search/latest', (_req: Request, res: Response) => {
    const data = getLatestAiSearch();
    res.json(data);
  });

  // Clear AI search results (called when user clears the search)
  router.delete('/ai-search/latest', (_req: Request, res: Response) => {
    clearLatestAiSearch();
    res.json({ success: true });
  });

  return router;
}

export default {
  createMcpServer,
  createMcpRoutes,
  getLatestAiSearch,
  clearLatestAiSearch,
};
