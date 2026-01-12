/**
 * API Key Authentication Middleware
 *
 * Validates requests from external sources (like Claude artifacts via Tailscale Funnel).
 * When API_KEYS env var is set, requires X-API-Key header for non-local requests.
 */

const { loggers } = require('../services/logger');
const log = loggers.api.child({ component: 'auth' });

// Parse API keys from environment (comma-separated)
const API_KEYS = new Set(
	(process.env.API_KEYS || '')
		.split(',')
		.map(k => k.trim())
		.filter(k => k.length > 0)
);

/**
 * Check if request is from local network
 */
function isLocalRequest(req) {
	const ip = req.ip || req.connection?.remoteAddress || '';
	return (
		ip === '127.0.0.1' ||
		ip === '::1' ||
		ip === '::ffff:127.0.0.1' ||
		ip.startsWith('192.168.') ||
		ip.startsWith('10.') ||
		ip.startsWith('::ffff:192.168.') ||
		ip.startsWith('::ffff:10.')
	);
}

/**
 * API Key validation middleware
 *
 * - Skips validation if no API_KEYS are configured (development mode)
 * - Skips validation for local requests
 * - Requires valid X-API-Key header for external requests
 */
function apiKeyAuth(req, res, next) {
	// If no API keys configured, allow all requests (development mode)
	if (API_KEYS.size === 0) {
		return next();
	}

	// Allow local requests without API key
	if (isLocalRequest(req)) {
		return next();
	}

	// Check for API key in header or query param
	const apiKey = req.headers['x-api-key'] || req.query.apiKey;

	if (!apiKey) {
		log.warn('Missing API key', {
			ip: req.ip,
			path: req.path,
			origin: req.headers.origin
		});
		return res.status(401).json({
			error: 'API key required',
			code: 'MISSING_API_KEY',
			hint: 'Include X-API-Key header with your request'
		});
	}

	if (!API_KEYS.has(apiKey)) {
		log.warn('Invalid API key', {
			ip: req.ip,
			path: req.path,
			keyPrefix: apiKey.substring(0, 8) + '...'
		});
		return res.status(401).json({
			error: 'Invalid API key',
			code: 'INVALID_API_KEY'
		});
	}

	// Valid API key
	next();
}

/**
 * Optional API key middleware - logs but doesn't block
 * Use this for endpoints where auth is nice-to-have but not required
 */
function optionalApiKeyAuth(req, res, next) {
	const apiKey = req.headers['x-api-key'] || req.query.apiKey;

	if (apiKey && API_KEYS.has(apiKey)) {
		req.authenticated = true;
	} else {
		req.authenticated = false;
	}

	next();
}

module.exports = {
	apiKeyAuth,
	optionalApiKeyAuth,
	isLocalRequest,
	API_KEYS
};
