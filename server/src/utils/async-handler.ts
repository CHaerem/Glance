/**
 * Async Route Handler Wrapper
 * Eliminates duplicate try/catch/log/500 patterns in route handlers
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { loggers } from '../services/logger';
import { getErrorMessage } from './error';

const log = loggers.api;

/**
 * Wraps an async route handler to automatically catch errors and return 500 responses.
 * Eliminates the need for try/catch blocks in every route handler.
 *
 * @param fn - The async route handler function
 * @param operationName - Optional name for logging (defaults to request path)
 * @returns A wrapped RequestHandler that handles errors automatically
 *
 * @example
 * // Before:
 * router.get('/today', async (req, res) => {
 *   try {
 *     const data = await getData();
 *     res.json(data);
 *   } catch (error) {
 *     log.error('Error', { error: getErrorMessage(error) });
 *     res.status(500).json({ error: 'Internal server error' });
 *   }
 * });
 *
 * // After:
 * router.get('/today', asyncHandler(async (req, res) => {
 *   const data = await getData();
 *   res.json(data);
 * }, 'gallery-today'));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  operationName?: string
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((error: unknown) => {
      log.error(`Error in ${operationName || req.path}`, {
        error: getErrorMessage(error),
        path: req.path,
        method: req.method,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  };
}

/**
 * Typed version for handlers that return data (for future use with response typing)
 */
export type AsyncRouteHandler<T = void> = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<T>;
