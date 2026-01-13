/**
 * Shared Application State
 * Re-exports from TypeScript implementation
 */

const stateModule = require('../dist/src/utils/state');

module.exports = {
    serverLogs: stateModule.serverLogs,
    deviceLogs: stateModule.deviceLogs,
    addDeviceLog: stateModule.addDeviceLog,
    addServerLog: stateModule.addServerLog,
    getDeviceLogs: stateModule.getDeviceLogs,
    getServerLogs: stateModule.getServerLogs,
    MAX_LOGS: stateModule.MAX_LOGS
};
