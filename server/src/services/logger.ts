/**
 * Structured Logger Service
 * Outputs JSON logs suitable for Loki ingestion
 *
 * Log format follows Grafana Loki best practices:
 * - JSON structure with consistent fields
 * - Labels for filtering (level, service, component)
 * - Timestamp in ISO format and Unix epoch
 */

import type { Logger, LogLevel, LogEntry, LogMetadata, LoggerCollection } from '../types';

/** Log level numeric values for comparison */
export const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

/** Minimum log level (configurable via env) */
const MIN_LEVEL: number =
  LOG_LEVELS[(process.env.LOG_LEVEL?.toUpperCase() as LogLevel) ?? 'INFO'] ??
  LOG_LEVELS.INFO;

/** Service name for all logs */
const SERVICE_NAME = 'glance-server';

/**
 * Create a structured log entry
 * @param level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param message - Log message
 * @param metadata - Additional metadata
 * @returns Structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  metadata: LogMetadata = {}
): LogEntry {
  const now = new Date();
  return {
    timestamp: now.toISOString(),
    ts: now.getTime(),
    level: level.toUpperCase() as LogLevel,
    service: SERVICE_NAME,
    message,
    ...metadata,
  };
}

/**
 * Output log to stdout in JSON format
 * @param entry - Log entry
 */
function outputLog(entry: LogEntry): void {
  // Output as single-line JSON for Loki parsing
  process.stdout.write(JSON.stringify(entry) + '\n');
}

/**
 * Check if log level should be output
 * @param level - Log level
 * @returns True if the level should be logged
 */
function shouldLog(level: LogLevel | string): boolean {
  const upperLevel = level.toUpperCase() as LogLevel;
  return (LOG_LEVELS[upperLevel] ?? LOG_LEVELS.INFO) >= MIN_LEVEL;
}

/**
 * Create a logger instance with optional default metadata
 * @param defaultMeta - Default metadata for all logs from this logger
 * @returns Logger instance
 */
export function createLogger(defaultMeta: LogMetadata = {}): Logger {
  return {
    debug: (message: string, meta: LogMetadata = {}): void => {
      if (shouldLog('DEBUG')) {
        outputLog(createLogEntry('DEBUG', message, { ...defaultMeta, ...meta }));
      }
    },

    info: (message: string, meta: LogMetadata = {}): void => {
      if (shouldLog('INFO')) {
        outputLog(createLogEntry('INFO', message, { ...defaultMeta, ...meta }));
      }
    },

    warn: (message: string, meta: LogMetadata = {}): void => {
      if (shouldLog('WARN')) {
        outputLog(createLogEntry('WARN', message, { ...defaultMeta, ...meta }));
      }
    },

    error: (message: string, meta: LogMetadata = {}): void => {
      if (shouldLog('ERROR')) {
        // Include stack trace if error object provided
        const processedMeta = { ...meta };
        if (processedMeta.error instanceof Error) {
          processedMeta.stack = processedMeta.error.stack;
          processedMeta.errorMessage = processedMeta.error.message;
          delete processedMeta.error;
        }
        outputLog(
          createLogEntry('ERROR', message, { ...defaultMeta, ...processedMeta })
        );
      }
    },

    // Log with custom level
    log: (level: LogLevel, message: string, meta: LogMetadata = {}): void => {
      if (shouldLog(level)) {
        outputLog(createLogEntry(level, message, { ...defaultMeta, ...meta }));
      }
    },

    // Create child logger with additional default metadata
    child: (childMeta: LogMetadata): Logger =>
      createLogger({ ...defaultMeta, ...childMeta }),
  };
}

/** Pre-configured loggers for different components */
export const loggers: LoggerCollection = {
  server: createLogger({ component: 'server' }),
  device: createLogger({ component: 'device' }),
  battery: createLogger({ component: 'battery' }),
  ota: createLogger({ component: 'ota' }),
  api: createLogger({ component: 'api' }),
  image: createLogger({ component: 'image' }),
};

/** Default logger */
export const logger: Logger = createLogger();
