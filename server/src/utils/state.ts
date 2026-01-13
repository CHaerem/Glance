/**
 * Shared Application State
 * In-memory state that needs to be shared across routes
 */

import { getOsloTimestamp } from './time';

/** Maximum number of logs to keep in memory */
export const MAX_LOGS = 100;

/** In-memory server log storage */
const serverLogs: string[] = [];

/** In-memory device activity log storage */
const deviceLogs: string[] = [];

/**
 * Add a device activity log entry
 * @param message - Log message to add
 */
export function addDeviceLog(message: string): void {
  deviceLogs.push(`[${getOsloTimestamp()}] ${message}`);
  if (deviceLogs.length > MAX_LOGS) {
    deviceLogs.shift();
  }
}

/**
 * Add a server log entry
 * @param message - Log message to add
 */
export function addServerLog(message: string): void {
  serverLogs.push(`[${getOsloTimestamp()}] ${message}`);
  if (serverLogs.length > MAX_LOGS) {
    serverLogs.shift();
  }
}

/**
 * Get all device logs
 * @returns Array of device log entries
 */
export function getDeviceLogs(): readonly string[] {
  return deviceLogs;
}

/**
 * Get all server logs
 * @returns Array of server log entries
 */
export function getServerLogs(): readonly string[] {
  return serverLogs;
}

// Export the arrays directly for backward compatibility
// Note: These are mutable references - prefer using the getter functions
export { serverLogs, deviceLogs };
