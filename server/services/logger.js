/**
 * Structured Logger Service
 * Re-exports from TypeScript implementation
 */

const loggerModule = require('../dist/src/services/logger');

module.exports = {
    createLogger: loggerModule.createLogger,
    logger: loggerModule.logger,
    loggers: loggerModule.loggers,
    LOG_LEVELS: loggerModule.LOG_LEVELS
};
