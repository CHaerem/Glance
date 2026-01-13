/**
 * Logger Type Definitions
 * Structured logging for Grafana Loki ingestion
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export interface LogEntry {
  timestamp: string;
  ts: number;
  level: LogLevel;
  service: string;
  message: string;
  component?: string;
  [key: string]: unknown;
}

export interface LogMetadata {
  component?: string;
  deviceId?: string;
  error?: Error | string;
  stack?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  error(message: string, meta?: LogMetadata): void;
  log(level: LogLevel, message: string, meta?: LogMetadata): void;
  child(childMeta: LogMetadata): Logger;
}

export interface LoggerCollection {
  server: Logger;
  device: Logger;
  battery: Logger;
  ota: Logger;
  api: Logger;
  image: Logger;
}
