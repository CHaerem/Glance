/**
 * Configuration Type Definitions
 * Server settings and environment configuration
 */

// Server settings (stored in settings.json)
// All fields optional since settings.json may not have all values
export interface ServerSettings {
  nightSleepEnabled?: boolean;
  nightSleepStartHour?: number;
  nightSleepEndHour?: number;
  notificationWebhook?: string;
  defaultSleepDuration?: number;
  devMode?: boolean;
  devServerHost?: string;
}

// Environment configuration
export interface EnvironmentConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  OPENAI_API_KEY?: string;
  LOKI_URL?: string;
  LOKI_USER?: string;
  LOKI_TOKEN?: string;
  LOG_LEVEL?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  DEVICE_ID?: string;
  API_KEYS?: string;
}

// Firmware metadata
export interface FirmwareInfo {
  version: string;
  buildDate: string;
  buildDateHuman: string;
  imageVersion: string;
  size?: number;
  checksum?: string;
}

// MCP Server configuration
export interface MCPConfig {
  name: string;
  version: string;
  glanceBaseUrl: string;
}

// Webhook notification payload
export interface WebhookPayload {
  event: string;
  level?: 'low' | 'critical';
  device?: string;
  battery?: {
    percent: number;
    voltage: number;
  };
  message: string;
  timestamp: string;
}

// Statistics tracking configuration
export interface StatisticsConfig {
  maxCallHistory: number;
  maxLogHistory: number;
}
