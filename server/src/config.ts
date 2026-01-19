/**
 * Centralized configuration for the Glance server
 *
 * All configurable values should be defined here with sensible defaults.
 * Use environment variables for values that may change between deployments.
 */

// Helper to parse environment variables with type safety
function envInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envString(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Server configuration
 */
export const server = {
  /** Server port */
  port: envInt('PORT', 3000),

  /** Maximum upload file size in bytes (default: 20MB) */
  maxUploadSize: envInt('MAX_UPLOAD_SIZE', 20 * 1024 * 1024),

  /** Maximum image data size in bytes (default: 10MB) */
  maxImageDataSize: envInt('MAX_IMAGE_DATA_SIZE', 10 * 1024 * 1024),

  /** Memory usage warning threshold in bytes (default: 500MB) */
  memoryWarningThreshold: envInt('MEMORY_WARNING_THRESHOLD', 500 * 1024 * 1024),

  /** Enable dev mode by default */
  devModeDefault: envBool('DEV_MODE', false),
};

/**
 * OpenAI / AI model configuration
 */
export const ai = {
  /** Model for guide chat */
  guideModel: envString('GUIDE_MODEL', 'gpt-5-mini'),

  /** Model for lucky search / query generation */
  luckySearchModel: envString('LUCKY_SEARCH_MODEL', 'gpt-5-mini'),

  /** Model for taste profile generation */
  tasteProfileModel: envString('TASTE_PROFILE_MODEL', 'gpt-5-mini'),

  /** Model for embeddings */
  embeddingModel: envString('EMBEDDING_MODEL', 'text-embedding-3-small'),

  /** Max tokens for guide chat responses */
  guideMaxTokens: envInt('GUIDE_MAX_TOKENS', 400),

  /** Max tokens for final response in guide chat */
  guideFinalResponseTokens: envInt('GUIDE_FINAL_RESPONSE_TOKENS', 150),

  /** Max tokens for lucky search */
  luckySearchMaxTokens: envInt('LUCKY_SEARCH_MAX_TOKENS', 500),

  /** Temperature for lucky search (capped at 1.0 for gpt-5-mini) */
  luckySearchTemperature: Math.min(envFloat('LUCKY_SEARCH_TEMPERATURE', 1.0), 1.0),
};

/**
 * Session and cache configuration
 */
export const sessions = {
  /** Guide chat session timeout in milliseconds (default: 30 minutes) */
  guideSessionTimeout: envInt('GUIDE_SESSION_TIMEOUT_MS', 30 * 60 * 1000),

  /** Maximum number of concurrent guide sessions */
  maxGuideSessions: envInt('MAX_GUIDE_SESSIONS', 100),

  /** Maximum messages per guide session before trimming */
  maxMessagesPerSession: envInt('MAX_MESSAGES_PER_SESSION', 50),

  /** MCP auth code expiry in milliseconds (default: 10 minutes) */
  mcpAuthCodeExpiry: envInt('MCP_AUTH_CODE_EXPIRY_MS', 10 * 60 * 1000),
};

/**
 * Cache configuration
 */
export const cache = {
  /** Museum API cache TTL in milliseconds (default: 24 hours) */
  museumApiTtl: envInt('MUSEUM_API_CACHE_TTL_MS', 24 * 60 * 60 * 1000),

  /** Image proxy cache TTL in milliseconds (default: 7 days) */
  imageProxyCacheTtl: envInt('IMAGE_PROXY_CACHE_TTL_MS', 7 * 24 * 60 * 60 * 1000),

  /** File cache TTL in milliseconds (default: 5 seconds) */
  fileCacheTtl: envInt('FILE_CACHE_TTL_MS', 5000),

  /** Playlist data cache TTL in milliseconds (default: 5 minutes) */
  playlistCacheTtl: envInt('PLAYLIST_CACHE_TTL_MS', 5 * 60 * 1000),

  /** Maximum playlist cache entries */
  maxPlaylistCacheEntries: envInt('MAX_PLAYLIST_CACHE_ENTRIES', 20),
};

/**
 * Battery monitoring configuration
 * These values are calibrated for the PowerBoost 1000C with LiPo battery
 */
export const battery = {
  /** Full charge voltage threshold */
  fullChargeVoltage: envFloat('BATTERY_FULL_VOLTAGE', 4.2),

  /** 80% charge voltage threshold */
  highVoltage: envFloat('BATTERY_HIGH_VOLTAGE', 4.0),

  /** 50% charge voltage threshold */
  mediumVoltage: envFloat('BATTERY_MEDIUM_VOLTAGE', 3.7),

  /** 30% charge voltage threshold */
  lowVoltage: envFloat('BATTERY_LOW_VOLTAGE', 3.5),

  /** 10% charge voltage threshold */
  criticalVoltage: envFloat('BATTERY_CRITICAL_VOLTAGE', 3.3),

  /** Minimum voltage before shutoff */
  minVoltage: envFloat('BATTERY_MIN_VOLTAGE', 3.0),

  /** Voltage rise threshold to detect charging (V) */
  chargingVoltageRise: envFloat('BATTERY_CHARGING_RISE', 0.15),

  /** Trend threshold to override ESP32 charging detection */
  chargingTrendThreshold: envFloat('BATTERY_CHARGING_TREND', 0.01),

  /** Maximum battery history entries to keep */
  maxHistoryEntries: envInt('BATTERY_MAX_HISTORY', 100),

  /** Low battery alert threshold (percent) */
  lowAlertThreshold: envInt('BATTERY_LOW_ALERT_PERCENT', 30),

  /** Critical battery alert threshold (percent) */
  criticalAlertThreshold: envInt('BATTERY_CRITICAL_ALERT_PERCENT', 15),
};

/**
 * Display / E-ink configuration
 */
export const display = {
  /** Display width in pixels */
  width: envInt('DISPLAY_WIDTH', 1200),

  /** Display height in pixels */
  height: envInt('DISPLAY_HEIGHT', 1600),

  /** Default orientation: 'portrait' or 'landscape' */
  defaultOrientation: envString('DISPLAY_ORIENTATION', 'portrait') as 'portrait' | 'landscape',

  /** Default sleep duration in seconds */
  defaultSleepDuration: envInt('DEFAULT_SLEEP_DURATION', 900),

  /** Minimum sleep duration in seconds */
  minSleepDuration: envInt('MIN_SLEEP_DURATION', 60),

  /** Maximum sleep duration in seconds */
  maxSleepDuration: envInt('MAX_SLEEP_DURATION', 86400),
};

/**
 * Search configuration
 */
export const search = {
  /** Default number of search results */
  defaultLimit: envInt('SEARCH_DEFAULT_LIMIT', 20),

  /** Maximum number of search results */
  maxLimit: envInt('SEARCH_MAX_LIMIT', 100),

  /** Number of museums to query in parallel */
  parallelMuseumQueries: envInt('PARALLEL_MUSEUM_QUERIES', 8),
};

/**
 * Rate limiting configuration
 */
export const rateLimit = {
  /** Window size in milliseconds */
  windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60 * 1000),

  /** Maximum requests per window */
  maxRequests: envInt('RATE_LIMIT_MAX_REQUESTS', 100),
};

/**
 * Logging configuration
 */
export const logging = {
  /** Log level: DEBUG, INFO, WARN, ERROR */
  level: envString('LOG_LEVEL', 'INFO'),

  /** Loki endpoint for log shipping */
  lokiUrl: envString('LOKI_URL', ''),

  /** Loki username */
  lokiUser: envString('LOKI_USER', ''),

  /** Loki API token */
  lokiToken: envString('LOKI_TOKEN', ''),
};

/**
 * Export all config as a single object for convenience
 */
export const config = {
  server,
  ai,
  sessions,
  cache,
  battery,
  display,
  search,
  rateLimit,
  logging,
};

export default config;
