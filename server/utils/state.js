/**
 * Shared Application State
 * In-memory state that needs to be shared across routes
 */

const { getOsloTimestamp } = require('./time');

// In-memory log storage
const serverLogs = [];
const deviceLogs = [];
const MAX_LOGS = 100;

/**
 * Add a device activity log entry
 * @param {string} message - Log message
 */
function addDeviceLog(message) {
    deviceLogs.push(`[${getOsloTimestamp()}] ${message}`);
    if (deviceLogs.length > MAX_LOGS) deviceLogs.shift();
}

/**
 * Add a server log entry
 * @param {string} message - Log message
 */
function addServerLog(message) {
    serverLogs.push(`[${getOsloTimestamp()}] ${message}`);
    if (serverLogs.length > MAX_LOGS) serverLogs.shift();
}

/**
 * Get device logs
 * @returns {string[]} Array of device log entries
 */
function getDeviceLogs() {
    return deviceLogs;
}

/**
 * Get server logs
 * @returns {string[]} Array of server log entries
 */
function getServerLogs() {
    return serverLogs;
}

module.exports = {
    serverLogs,
    deviceLogs,
    addDeviceLog,
    addServerLog,
    getDeviceLogs,
    getServerLogs,
    MAX_LOGS
};
