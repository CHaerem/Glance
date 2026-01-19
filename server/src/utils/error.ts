/**
 * Error Handling Utilities
 * Common error handling patterns
 */

/**
 * Safely extract error message from unknown error type
 * Handles Error objects, strings, and other types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Safely extract error stack from unknown error type
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Check if an error is an abort error (from AbortController)
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Check if an error indicates a timeout
 */
export function isTimeoutError(error: unknown): boolean {
  if (isAbortError(error)) return true;
  if (error instanceof Error) {
    return (
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('timed out')
    );
  }
  return false;
}

/**
 * Create a standardized error response object
 */
export function createErrorResponse(
  error: unknown,
  context?: string
): { error: string; context?: string } {
  const message = getErrorMessage(error);
  return context ? { error: message, context } : { error: message };
}

/**
 * Custom API error class with status code
 * Use with asyncHandler for automatic status code handling
 *
 * @example
 * throw ApiError.notFound('User not found');
 * throw ApiError.badRequest('Invalid email format', { field: 'email' });
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, message);
  }

  static tooManyRequests(message = 'Too many requests'): ApiError {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message);
  }
}
