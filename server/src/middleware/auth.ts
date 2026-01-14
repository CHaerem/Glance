/**
 * API Key Authentication Middleware
 *
 * When API_KEYS env var is set, requires X-API-Key header for non-local requests.
 */

import type { Request, Response, NextFunction } from 'express';
import { loggers } from '../services/logger';

const log = loggers.api.child({ component: 'auth' });

/** Extended request with authentication status */
export interface AuthenticatedRequest extends Request {
  authenticated?: boolean;
}

/** API key error response */
interface ApiKeyErrorResponse {
  error: string;
  code: string;
  hint?: string;
}

// Parse API keys from environment (comma-separated)
export const API_KEYS = new Set(
  (process.env.API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
);

/**
 * Check if request is from Tailscale Serve (authenticated tailnet user)
 *
 * Tailscale Serve adds identity headers for authenticated users:
 * - Tailscale-User-Login: User's login email
 * - Tailscale-User-Name: User's display name
 *
 * Funnel (public) traffic does NOT include these headers.
 * See: https://tailscale.com/kb/1312/serve
 */
export function isTailscaleServeRequest(req: Request): boolean {
  return !!req.headers['tailscale-user-login'];
}

/**
 * Check if request is from local network
 *
 * Allows access from:
 * - localhost (127.0.0.1, ::1)
 * - Private networks (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 *
 * Note: Using Docker host networking so container sees real client IPs.
 */
export function isLocalRequest(req: Request): boolean {
  const ip = req.ip ?? (req.connection as { remoteAddress?: string })?.remoteAddress ?? '';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.') ||
    ip.startsWith('::ffff:192.168.') ||
    ip.startsWith('::ffff:10.') ||
    ip.startsWith('::ffff:172.')
  );
}

/**
 * Check if request is from trusted source (local network or authenticated Tailscale)
 */
export function isTrustedRequest(req: Request): boolean {
  return isLocalRequest(req) || isTailscaleServeRequest(req);
}

/**
 * API Key validation middleware
 *
 * - Skips validation if no API_KEYS are configured (development mode)
 * - Skips validation for local requests
 * - Requires valid X-API-Key header for external requests
 */
export function apiKeyAuth(
  req: Request,
  res: Response<ApiKeyErrorResponse>,
  next: NextFunction
): void {
  // If no API keys configured, allow all requests (development mode)
  if (API_KEYS.size === 0) {
    next();
    return;
  }

  // Allow local requests without API key
  if (isLocalRequest(req)) {
    next();
    return;
  }

  // Check for API key in header or query param
  const apiKeyHeader = req.headers['x-api-key'];
  const apiKeyQuery = req.query.apiKey;
  const apiKey = (Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader) ??
    (typeof apiKeyQuery === 'string' ? apiKeyQuery : undefined);

  if (!apiKey) {
    log.warn('Missing API key', {
      ip: req.ip,
      path: req.path,
      origin: req.headers.origin,
    });
    res.status(401).json({
      error: 'API key required',
      code: 'MISSING_API_KEY',
      hint: 'Include X-API-Key header with your request',
    });
    return;
  }

  if (!API_KEYS.has(apiKey)) {
    log.warn('Invalid API key', {
      ip: req.ip,
      path: req.path,
      keyPrefix: apiKey.substring(0, 8) + '...',
    });
    res.status(401).json({
      error: 'Invalid API key',
      code: 'INVALID_API_KEY',
    });
    return;
  }

  // Valid API key
  next();
}

/**
 * Optional API key middleware - logs but doesn't block
 * Use this for endpoints where auth is nice-to-have but not required
 */
export function optionalApiKeyAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const apiKeyHeader = req.headers['x-api-key'];
  const apiKeyQuery = req.query.apiKey;
  const apiKey = (Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader) ??
    (typeof apiKeyQuery === 'string' ? apiKeyQuery : undefined);

  if (apiKey && API_KEYS.has(apiKey)) {
    req.authenticated = true;
  } else {
    req.authenticated = false;
  }

  next();
}

/**
 * WAN restriction middleware
 *
 * Blocks ALL WAN requests except health checks.
 * Only local network (LAN) and authenticated Tailscale users can access the server.
 */
export function wanRestriction(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Allow trusted requests (local network or authenticated Tailscale Serve)
  if (isTrustedRequest(req)) {
    next();
    return;
  }

  // Only allow health checks from WAN (for monitoring)
  if (req.path === '/health' || req.path === '/api/health') {
    next();
    return;
  }

  // Block all WAN requests
  log.warn('WAN access blocked', {
    ip: req.ip,
    path: req.path,
    method: req.method,
  });

  res.status(403).json({
    error: 'Access denied',
    code: 'WAN_ACCESS_BLOCKED',
    message: 'This endpoint is only accessible from the local network',
  });
}
