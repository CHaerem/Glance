/**
 * Structured Logger Service
 * Outputs JSON logs suitable for Loki ingestion
 *
 * Log format follows Grafana Loki best practices:
 * - JSON structure with consistent fields
 * - Labels for filtering (level, service, component)
 * - Timestamp in ISO format and Unix epoch
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// Minimum log level (configurable via env)
const MIN_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;

// Service name for all logs
const SERVICE_NAME = 'glance-server';

/**
 * Create a structured log entry
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional metadata
 * @returns {Object} Structured log entry
 */
function createLogEntry(level, message, metadata = {}) {
    const now = new Date();
    return {
        timestamp: now.toISOString(),
        ts: now.getTime(),
        level: level.toUpperCase(),
        service: SERVICE_NAME,
        message,
        ...metadata
    };
}

/**
 * Output log to stdout in JSON format
 * @param {Object} entry - Log entry
 */
function outputLog(entry) {
    // Output as single-line JSON for Loki parsing
    process.stdout.write(JSON.stringify(entry) + '\n');
}

/**
 * Check if log level should be output
 * @param {string} level - Log level
 * @returns {boolean}
 */
function shouldLog(level) {
    return LOG_LEVELS[level.toUpperCase()] >= MIN_LEVEL;
}

/**
 * Create a logger instance with optional default metadata
 * @param {Object} defaultMeta - Default metadata for all logs from this logger
 * @returns {Object} Logger instance
 */
function createLogger(defaultMeta = {}) {
    return {
        debug: (message, meta = {}) => {
            if (shouldLog('DEBUG')) {
                outputLog(createLogEntry('DEBUG', message, { ...defaultMeta, ...meta }));
            }
        },

        info: (message, meta = {}) => {
            if (shouldLog('INFO')) {
                outputLog(createLogEntry('INFO', message, { ...defaultMeta, ...meta }));
            }
        },

        warn: (message, meta = {}) => {
            if (shouldLog('WARN')) {
                outputLog(createLogEntry('WARN', message, { ...defaultMeta, ...meta }));
            }
        },

        error: (message, meta = {}) => {
            if (shouldLog('ERROR')) {
                // Include stack trace if error object provided
                if (meta.error instanceof Error) {
                    meta.stack = meta.error.stack;
                    meta.errorMessage = meta.error.message;
                    delete meta.error;
                }
                outputLog(createLogEntry('ERROR', message, { ...defaultMeta, ...meta }));
            }
        },

        // Log with custom level
        log: (level, message, meta = {}) => {
            if (shouldLog(level)) {
                outputLog(createLogEntry(level, message, { ...defaultMeta, ...meta }));
            }
        },

        // Create child logger with additional default metadata
        child: (childMeta) => createLogger({ ...defaultMeta, ...childMeta })
    };
}

// Pre-configured loggers for different components
const loggers = {
    server: createLogger({ component: 'server' }),
    device: createLogger({ component: 'device' }),
    battery: createLogger({ component: 'battery' }),
    ota: createLogger({ component: 'ota' }),
    api: createLogger({ component: 'api' }),
    image: createLogger({ component: 'image' })
};

// Default logger
const logger = createLogger();

module.exports = {
    createLogger,
    logger,
    loggers,
    LOG_LEVELS
};
