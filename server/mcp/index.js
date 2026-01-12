/**
 * Glance MCP Server
 *
 * Exposes Glance art gallery functionality as MCP tools for Claude.ai integration.
 * Supports the Streamable HTTP transport for remote MCP connections.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const express = require('express');

const { loggers } = require('../services/logger');
const log = loggers.api.child({ component: 'mcp' });

/**
 * Create MCP server with Glance tools
 * @param {Object} options
 * @param {string} options.glanceBaseUrl - Base URL for Glance API (e.g., http://localhost:3000)
 * @returns {McpServer}
 */
function createMcpServer({ glanceBaseUrl = 'http://localhost:3000' }) {
	const server = new McpServer({
		name: 'glance-art-guide',
		version: '1.0.0',
	});

	// Helper to make Glance API requests
	async function glanceApi(path, options = {}) {
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

		return response.json();
	}

	// Tool: Search for artworks
	server.tool(
		'search_artworks',
		'Search for artworks across museum collections. Use keywords like artist names, art movements, subjects, or time periods.',
		{
			query: {
				type: 'string',
				description: 'Search query (e.g., "Monet water lilies", "impressionist landscape", "Dutch Golden Age")',
			},
			limit: {
				type: 'number',
				description: 'Maximum number of results to return (default: 12, max: 20)',
				optional: true,
			},
		},
		async ({ query, limit = 12 }) => {
			log.info('MCP search_artworks', { query, limit });

			try {
				const data = await glanceApi(`/api/art/search?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 20)}`);
				const results = data.results || [];

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
				const formatted = results.map((art, i) =>
					`${i + 1}. "${art.title}" by ${art.artist || 'Unknown'} (${art.source})\n   Image: ${art.imageUrl}`
				).join('\n\n');

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
				log.error('MCP search_artworks error', { error: error.message });
				return {
					content: [{ type: 'text', text: `Search failed: ${error.message}` }],
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
		async ({ imageUrl, title, artist }) => {
			log.info('MCP display_artwork', { imageUrl, title, artist });

			try {
				const result = await glanceApi('/api/art/import', {
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
				log.error('MCP display_artwork error', { error: error.message });
				return {
					content: [{ type: 'text', text: `Failed to display artwork: ${error.message}` }],
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
		async () => {
			log.info('MCP get_current_display');

			try {
				const data = await glanceApi('/api/current.json');

				if (!data.title) {
					return {
						content: [{ type: 'text', text: 'Nothing is currently displayed on the frame.' }],
					};
				}

				return {
					content: [
						{
							type: 'text',
							text: `Currently displaying: "${data.title}"\nLast updated: ${new Date(data.timestamp).toLocaleString()}`,
						},
					],
					_metadata: { current: data },
				};
			} catch (error) {
				log.error('MCP get_current_display error', { error: error.message });
				return {
					content: [{ type: 'text', text: `Failed to get current display: ${error.message}` }],
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
		async () => {
			log.info('MCP list_playlists');

			try {
				const data = await glanceApi('/api/playlists');
				const playlists = data.playlists || [];

				if (playlists.length === 0) {
					return {
						content: [{ type: 'text', text: 'No playlists available.' }],
					};
				}

				const formatted = playlists.map((p) =>
					`• ${p.name} (${p.type}): ${p.description || 'No description'}`
				).join('\n');

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
				log.error('MCP list_playlists error', { error: error.message });
				return {
					content: [{ type: 'text', text: `Failed to list playlists: ${error.message}` }],
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
		async ({ playlistId }) => {
			log.info('MCP get_playlist', { playlistId });

			try {
				const data = await glanceApi(`/api/playlists/${playlistId}`);
				const artworks = data.artworks || [];

				if (artworks.length === 0) {
					return {
						content: [{ type: 'text', text: `Playlist "${playlistId}" is empty or not found.` }],
					};
				}

				const formatted = artworks.slice(0, 10).map((art, i) =>
					`${i + 1}. "${art.title}" by ${art.artist || 'Unknown'}`
				).join('\n');

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
				log.error('MCP get_playlist error', { error: error.message });
				return {
					content: [{ type: 'text', text: `Failed to get playlist: ${error.message}` }],
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
		async () => {
			log.info('MCP get_device_status');

			try {
				const data = await glanceApi('/api/esp32-status');

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
				log.error('MCP get_device_status error', { error: error.message });
				return {
					content: [{ type: 'text', text: `Failed to get device status: ${error.message}` }],
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
		async () => {
			log.info('MCP random_artwork');

			try {
				const data = await glanceApi('/api/art/random');

				if (!data.imageUrl) {
					return {
						content: [{ type: 'text', text: 'Could not fetch a random artwork. Please try again.' }],
					};
				}

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
				log.error('MCP random_artwork error', { error: error.message });
				return {
					content: [{ type: 'text', text: `Failed to get random artwork: ${error.message}` }],
					isError: true,
				};
			}
		}
	);

	return server;
}

/**
 * Create Express routes for MCP Streamable HTTP transport
 * @param {Object} options
 * @param {string} options.glanceBaseUrl
 * @returns {express.Router}
 */
function createMcpRoutes({ glanceBaseUrl = 'http://localhost:3000' } = {}) {
	const router = express.Router();
	const mcpServer = createMcpServer({ glanceBaseUrl });

	// Store active transports by session ID
	const transports = new Map();

	// MCP endpoint for Streamable HTTP
	router.post('/mcp', async (req, res) => {
		log.info('MCP request received', { body: req.body });

		try {
			// Get or create session ID
			const sessionId = req.headers['x-mcp-session-id'] || req.body.sessionId || 'default';

			// Get or create transport for this session
			let transport = transports.get(sessionId);
			if (!transport) {
				transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => sessionId,
				});
				await mcpServer.connect(transport);
				transports.set(sessionId, transport);
				log.info('MCP session created', { sessionId });
			}

			// Handle the request
			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			log.error('MCP error', { error: error.message, stack: error.stack });
			res.status(500).json({ error: error.message });
		}
	});

	// Health check for MCP
	router.get('/mcp/health', (req, res) => {
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
	router.get('/mcp', (req, res) => {
		res.json({
			name: 'glance-art-guide',
			version: '1.0.0',
			description: 'AI-powered art guide for Glance e-ink display',
			transport: 'streamable-http',
			endpoint: '/api/mcp',
		});
	});

	return router;
}

module.exports = {
	createMcpServer,
	createMcpRoutes,
};
