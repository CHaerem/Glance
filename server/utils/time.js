/**
 * Time and timezone utility functions
 * Re-exports from TypeScript implementation
 */

const timeModule = require('../dist/src/utils/time');

module.exports = {
    formatBuildDate: timeModule.formatBuildDate,
    getOsloTime: timeModule.getOsloTime,
    getOsloTimestamp: timeModule.getOsloTimestamp,
    isInNightSleep: timeModule.isInNightSleep,
    calculateNightSleepDuration: timeModule.calculateNightSleepDuration
};
