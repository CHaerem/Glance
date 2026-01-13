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
