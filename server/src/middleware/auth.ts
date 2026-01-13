/**
 * API Key Authentication Middleware
 *
 * Validates requests from external sources (like Claude artifacts via Tailscale Funnel).
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
 * Check if request is from local network
 */
export function isLocalRequest(req: Request): boolean {
  const ip = req.ip ?? (req.connection as { remoteAddress?: string })?.remoteAddress ?? '';
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
