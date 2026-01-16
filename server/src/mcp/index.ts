/**
 * Glance MCP Server
 *
 * Exposes Glance art gallery functionality as MCP tools for Claude.ai integration.
 * Supports the Streamable HTTP transport for remote MCP connections.
 * Secured with OAuth 2.1 client credentials flow.
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
import { z } from 'zod';

import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils/error';

const log = loggers.api.child({ component: 'mcp' });

// OAuth configuration from environment
const MCP_CLIENT_ID = process.env.MCP_CLIENT_ID || '';
const MCP_CLIENT_SECRET = process.env.MCP_CLIENT_SECRET || '';
const MCP_JWT_SECRET = process.env.MCP_JWT_SECRET || crypto.randomBytes(32).toString('hex');
const MCP_TOKEN_EXPIRY = 3600; // 1 hour in seconds

// TEMPORARY: Disable OAuth until Claude.ai fixes their OAuth implementation
// See: https://github.com/anthropics/claude-ai-mcp/issues/5
// Set MCP_REQUIRE_AUTH=true to re-enable OAuth when fixed
const MCP_REQUIRE_AUTH = process.env.MCP_REQUIRE_AUTH === 'true';

/** JWT payload structure */
interface McpTokenPayload {
  client_id: string;
  scope: string;
  iat: number;
  exp: number;
}

/**
 * Check if OAuth is configured and required
 * TEMPORARY: Returns false unless MCP_REQUIRE_AUTH=true
 * This is because Claude.ai's OAuth implementation is broken as of Dec 2025
 * See: https://github.com/anthropics/claude-ai-mcp/issues/5
 */
function isOAuthConfigured(): boolean {
  // Temporarily disabled - Claude.ai OAuth is broken
  if (!MCP_REQUIRE_AUTH) {
    return false;
  }
  return MCP_CLIENT_ID.length > 0 && MCP_CLIENT_SECRET.length > 0;
}

/**
 * Generate an access token for valid client credentials
 */
function generateAccessToken(clientId: string): string {
  const payload: McpTokenPayload = {
    client_id: clientId,
    scope: 'mcp:tools',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + MCP_TOKEN_EXPIRY,
  };
  return jwt.sign(payload, MCP_JWT_SECRET);
}

/**
 * Validate a Bearer token
 * Returns the decoded payload if valid, null otherwise
 */
function validateBearerToken(token: string): McpTokenPayload | null {
  try {
    const decoded = jwt.verify(token, MCP_JWT_SECRET) as McpTokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/** Auth info to attach to request */
interface AuthInfo {
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

/** Extended request with auth info */
interface AuthenticatedRequest extends Request {
  auth?: AuthInfo;
}

/**
 * Validate OAuth for MCP requests and attach auth info to request
 * Returns true if valid, false otherwise
 */
function validateMcpOAuth(req: AuthenticatedRequest): boolean {
  // If OAuth not configured, allow all (development mode)
  if (!isOAuthConfigured()) {
    // Set a dummy auth for development
    req.auth = {
      clientId: 'development',
      scopes: ['mcp:tools'],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    return true;
  }

  // Check for Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7);
  const payload = validateBearerToken(token);

  if (!payload) {
    return false;
  }

  // Token is valid - attach auth info to request for the SDK transport
  req.auth = {
    clientId: payload.client_id,
    scopes: [payload.scope],
    expiresAt: payload.exp,
  };

  log.debug('MCP OAuth validated', { client_id: payload.client_id });
  return true;
}

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
      query: z.string().describe('Search query (e.g., "Monet water lilies", "impressionist landscape", "Dutch Golden Age")'),
      limit: z.number().optional().describe('Maximum number of results to return (default: 12, max: 20)'),
    },
    async (args: { query: string; limit?: number }): Promise<McpToolResponse> => {
      const { query, limit: limitArg } = args;
      const limit = limitArg || 12;
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
      imageUrl: z.string().describe('URL of the artwork image to display'),
      title: z.string().optional().describe('Title of the artwork'),
      artist: z.string().optional().describe('Artist name'),
    },
    async (args: { imageUrl: string; title?: string; artist?: string }): Promise<McpToolResponse> => {
      const { imageUrl, title, artist } = args;
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
      playlistId: z.string().describe('Playlist ID (e.g., "impressionist-masters", "serene-nature", "bold-abstract")'),
    },
    async (args: { playlistId: string }): Promise<McpToolResponse> => {
      const { playlistId } = args;
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
 * Create Express routes for MCP Streamable HTTP transport (stateless mode)
 *
 * This uses true stateless mode where each request gets a fresh transport.
 * This is simpler, supports horizontal scaling, and works better with Claude.ai.
 */
export function createMcpRoutes({ glanceBaseUrl = 'http://localhost:3000' }: McpServerConfig = {}): {
  router: Router;
  getDiagnostics: () => { authCodesCount: number; authenticatedClientsCount: number; limits: { maxAuthCodes: number; maxAuthClients: number } };
} {
  const router = Router();

  // Log OAuth status on startup
  if (MCP_REQUIRE_AUTH && isOAuthConfigured()) {
    log.info('MCP OAuth authentication enabled');
  } else {
    log.info('MCP OAuth authentication disabled (set MCP_REQUIRE_AUTH=true to enable)');
  }

  // Store authenticated clients by IP (to handle Claude.ai's multiple parallel connections)
  // Once a client successfully authenticates, allow subsequent requests from same IP
  const authenticatedClients = new Map<string, { clientId: string; expiresAt: number }>();

  // Store authorization codes temporarily (code -> { clientId, codeChallenge, redirectUri, expiresAt })
  const authorizationCodes = new Map<string, {
    clientId: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    redirectUri: string;
    expiresAt: number;
  }>();

  // Memory limits to prevent unbounded growth
  const MAX_AUTH_CODES = 100;
  const MAX_AUTH_CLIENTS = 200;

  // Helper to evict oldest entries when limit exceeded
  function enforceMapLimit<T>(map: Map<string, T>, maxSize: number): void {
    if (map.size > maxSize) {
      const excess = map.size - maxSize;
      const keysToDelete = Array.from(map.keys()).slice(0, excess);
      keysToDelete.forEach(key => map.delete(key));
    }
  }

  // Clean up expired authenticated clients and authorization codes periodically
  setInterval(() => {
    const now = Date.now();
    // Clean up expired authenticated clients
    for (const [ip, auth] of authenticatedClients.entries()) {
      if (now > auth.expiresAt) {
        authenticatedClients.delete(ip);
      }
    }
    // Clean up expired authorization codes
    for (const [code, data] of authorizationCodes.entries()) {
      if (now > data.expiresAt) {
        authorizationCodes.delete(code);
      }
    }
    // Enforce size limits after expiration cleanup
    enforceMapLimit(authorizationCodes, MAX_AUTH_CODES);
    enforceMapLimit(authenticatedClients, MAX_AUTH_CLIENTS);
  }, 60000); // Clean up every minute

  // OAuth Authorization Endpoint (for authorization code flow with PKCE)
  router.get('/authorize', (req: Request, res: Response) => {
    const {
      response_type,
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      scope,
    } = req.query as {
      response_type?: string;
      client_id?: string;
      redirect_uri?: string;
      state?: string;
      code_challenge?: string;
      code_challenge_method?: string;
      scope?: string;
    };

    log.info('OAuth authorize request', {
      response_type,
      client_id,
      redirect_uri,
      has_code_challenge: !!code_challenge,
      scope,
    });

    // Validate required parameters
    if (response_type !== 'code') {
      res.status(400).json({
        error: 'unsupported_response_type',
        error_description: 'Only code response type is supported',
      });
      return;
    }

    if (!client_id || !redirect_uri) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'client_id and redirect_uri are required',
      });
      return;
    }

    // For PKCE, code_challenge is required
    if (!code_challenge) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'code_challenge is required for PKCE',
      });
      return;
    }

    // Generate authorization code
    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store the code
    authorizationCodes.set(code, {
      clientId: client_id,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || 'S256',
      redirectUri: redirect_uri,
      expiresAt,
    });

    log.info('OAuth authorization code issued', { client_id });

    // Redirect back with code (auto-approve for this personal project)
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }

    res.redirect(redirectUrl.toString());
  });

  // OAuth Token Endpoint (supports both authorization_code and client_credentials)
  router.post('/token', (req: Request, res: Response) => {
    const {
      grant_type,
      client_id,
      client_secret,
      code,
      redirect_uri,
      code_verifier,
    } = req.body as {
      grant_type?: string;
      client_id?: string;
      client_secret?: string;
      code?: string;
      redirect_uri?: string;
      code_verifier?: string;
    };

    log.info('OAuth token request', { grant_type, client_id: client_id?.substring(0, 8) + '...' });

    // Handle authorization_code grant (PKCE)
    if (grant_type === 'authorization_code') {
      if (!code || !redirect_uri || !code_verifier) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'code, redirect_uri, and code_verifier are required',
        });
        return;
      }

      const authCode = authorizationCodes.get(code);
      if (!authCode) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code',
        });
        return;
      }

      // Check expiration
      if (Date.now() > authCode.expiresAt) {
        authorizationCodes.delete(code);
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code has expired',
        });
        return;
      }

      // Verify redirect_uri matches
      if (authCode.redirectUri !== redirect_uri) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'redirect_uri does not match',
        });
        return;
      }

      // Verify PKCE code_verifier
      const expectedChallenge = crypto
        .createHash('sha256')
        .update(code_verifier)
        .digest('base64url');

      if (expectedChallenge !== authCode.codeChallenge) {
        log.warn('PKCE verification failed', {
          expected: authCode.codeChallenge,
          got: expectedChallenge,
        });
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'PKCE verification failed',
        });
        return;
      }

      // Delete the used code
      authorizationCodes.delete(code);

      // Generate access token
      const accessToken = generateAccessToken(authCode.clientId);
      log.info('OAuth token issued via authorization_code', { client_id: authCode.clientId, ip: req.ip });

      // Store authenticated client IP to allow subsequent parallel connections from Claude.ai
      const clientIp = req.ip || 'unknown';
      authenticatedClients.set(clientIp, {
        clientId: authCode.clientId,
        expiresAt: Date.now() + MCP_TOKEN_EXPIRY * 1000, // Same expiry as token
      });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: MCP_TOKEN_EXPIRY,
        scope: 'mcp:tools',
      });
      return;
    }

    // Handle client_credentials grant
    if (grant_type === 'client_credentials') {
      // Check if OAuth is configured
      if (!isOAuthConfigured()) {
        res.status(400).json({
          error: 'server_error',
          error_description: 'OAuth is not configured on this server',
        });
        return;
      }

      // Validate client credentials
      if (client_id !== MCP_CLIENT_ID || client_secret !== MCP_CLIENT_SECRET) {
        log.warn('OAuth token request rejected: invalid credentials', { client_id });
        res.status(401).json({
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        });
        return;
      }

      // Generate access token
      const accessToken = generateAccessToken(client_id);
      log.info('OAuth token issued via client_credentials', { client_id });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: MCP_TOKEN_EXPIRY,
        scope: 'mcp:tools',
      });
      return;
    }

    // Unsupported grant type
    res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Supported grant types: authorization_code, client_credentials',
    });
  });

  // MCP endpoint for Streamable HTTP (stateless mode)
  // Each request gets a fresh transport and server instance for complete isolation
  router.post('/mcp', async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    log.info('MCP request received', { body: req.body });

    // Validate OAuth Bearer token
    if (!validateMcpOAuth(authReq)) {
      // Check if this IP was recently authenticated (handles Claude.ai's parallel connections)
      const clientIp = req.ip || 'unknown';
      const cachedAuth = authenticatedClients.get(clientIp);

      if (cachedAuth && Date.now() < cachedAuth.expiresAt) {
        // IP was authenticated recently, allow the request
        authReq.auth = {
          clientId: cachedAuth.clientId,
          scopes: ['mcp:tools'],
          expiresAt: Math.floor(cachedAuth.expiresAt / 1000),
        };
        log.debug('MCP request allowed via cached IP auth', { ip: clientIp, clientId: cachedAuth.clientId });
      } else {
        log.warn('MCP request rejected: invalid or missing OAuth token', {
          ip: req.ip,
          hasAuth: !!req.headers.authorization,
        });
        res.status(401).json({
          error: 'invalid_token',
          error_description: 'Bearer token required. Use /api/token endpoint to obtain one.',
        });
        return;
      }
    }

    try {
      // Create fresh MCP server and transport for each request (stateless mode)
      // This ensures complete isolation between requests and supports horizontal scaling
      const mcpServer = createMcpServer({ glanceBaseUrl });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode - no session management
      });

      // Connect transport to server
      await (mcpServer as { connect: (t: unknown) => Promise<void> }).connect(transport);
      log.debug('MCP stateless transport created', { clientId: authReq.auth?.clientId });

      // Handle the request
      await (transport as { handleRequest: (req: AuthenticatedRequest, res: Response, body: unknown) => Promise<void> }).handleRequest(authReq, res, req.body);
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
      authentication: isOAuthConfigured() ? 'oauth2' : 'disabled',
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

  // MCP GET endpoint - server discovery
  // In stateless mode, SSE streams aren't used for server notifications
  router.get('/mcp', (_req: Request, res: Response) => {
    // Return server info for discoverability
    res.json({
      name: 'glance-art-guide',
      version: '1.0.0',
      description: 'AI-powered art guide for Glance e-ink display',
      authentication: {
        type: isOAuthConfigured() ? 'oauth2' : 'none',
        tokenEndpoint: '/api/token',
        required: isOAuthConfigured(),
      },
      transport: 'streamable-http',
      endpoint: '/api/mcp',
      mode: 'stateless', // No session management - each request is independent
    });
  });

  // MCP DELETE endpoint - no-op in stateless mode
  // Sessions don't persist, so there's nothing to delete
  router.delete('/mcp', (_req: Request, res: Response) => {
    res.status(204).send();
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

  // Diagnostics function for memory monitoring
  const getDiagnostics = () => ({
    authCodesCount: authorizationCodes.size,
    authenticatedClientsCount: authenticatedClients.size,
    limits: {
      maxAuthCodes: MAX_AUTH_CODES,
      maxAuthClients: MAX_AUTH_CLIENTS,
    },
  });

  return { router, getDiagnostics };
}

export default {
  createMcpServer,
  createMcpRoutes,
  getLatestAiSearch,
  clearLatestAiSearch,
};
