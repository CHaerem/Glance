/**
 * Log Routes
 * Logging, serial stream, diagnostics endpoints
 */

import { Router, Request, Response } from 'express';
import { validateDeviceId, sanitizeInput } from '../utils/validation';
import { readJSONFile, writeJSONFile } from '../utils/data-store';
import { deviceLogs } from '../utils/state';
import { loggers } from '../services/logger';

const log = loggers.api;

/** Log entry structure */
interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  deviceTime: number;
}

/** Serial stream chunk */
interface StreamChunk {
  timestamp: number;
  deviceTime: number;
  output: string;
  bufferSize: number;
}

/** Device stream data */
interface DeviceStream {
  isStreaming: boolean;
  lastActivity: number;
  chunks: StreamChunk[];
}

/** Wake cycle */
interface WakeCycle {
  startTime: number;
  endTime?: number;
  duration?: number;
  events: Array<{
    time: number;
    message: string;
    level: string;
  }>;
  errors: string[];
  incomplete?: boolean;
}

/** Combined log entry */
interface CombinedLogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  deviceTime?: number;
}

/**
 * Create log routes
 */
export function createLogRoutes(): Router {
  const router = Router();

  /**
   * ESP32 log reporting
   * POST /api/logs
   */
  router.post('/logs', async (req: Request, res: Response) => {
    try {
      const { deviceId, logs: logData, logLevel, deviceTime } = req.body as {
        deviceId?: string;
        logs?: string;
        logLevel?: string;
        deviceTime?: string | number;
      };

      if (!validateDeviceId(deviceId) || !logData) {
        res.status(400).json({ error: 'Valid deviceId and logs required' });
        return;
      }

      // Load existing logs
      const allLogs: Record<string, LogEntry[]> = (await readJSONFile('logs.json')) || {};

      // Initialize device logs if not exists
      if (!allLogs[deviceId!]) {
        allLogs[deviceId!] = [];
      }

      // Add new log entry
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level: sanitizeInput(logLevel) || 'INFO',
        message: sanitizeInput(logData),
        deviceTime: parseInt(String(deviceTime)) || Date.now(),
      };

      allLogs[deviceId!]!.push(logEntry);

      // Keep only last 1000 log entries per device
      if (allLogs[deviceId!]!.length > 1000) {
        allLogs[deviceId!] = allLogs[deviceId!]!.slice(-1000);
      }

      await writeJSONFile('logs.json', allLogs);

      log.debug('Log received from device', { deviceId, logs: logData });

      res.json({ success: true });
    } catch (error) {
      log.error('Error storing logs', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * ESP32 serial stream reporting for real-time monitoring
   * POST /api/serial-stream
   */
  router.post('/serial-stream', async (req: Request, res: Response) => {
    try {
      const { deviceId, serialOutput, streamEvent, timestamp, bufferSize } = req.body as {
        deviceId?: string;
        serialOutput?: string;
        streamEvent?: string;
        timestamp?: string | number;
        bufferSize?: string | number;
      };

      if (!validateDeviceId(deviceId)) {
        res.status(400).json({ error: 'Valid deviceId required' });
        return;
      }

      // Load existing streams
      const allStreams: Record<string, DeviceStream> =
        (await readJSONFile('serial-streams.json')) || {};

      // Initialize device streams if not exists
      if (!allStreams[deviceId!]) {
        allStreams[deviceId!] = {
          isStreaming: false,
          lastActivity: Date.now(),
          chunks: [],
        };
      }

      const deviceStream = allStreams[deviceId!]!;

      if (streamEvent) {
        // Handle stream control events
        if (streamEvent === 'started') {
          deviceStream.isStreaming = true;
          deviceStream.lastActivity = Date.now();
          log.debug('Serial streaming started', { deviceId });
        } else if (streamEvent === 'stopped') {
          deviceStream.isStreaming = false;
          log.debug('Serial streaming stopped', { deviceId });
        }
      } else if (serialOutput) {
        // Handle actual serial output data
        const streamChunk: StreamChunk = {
          timestamp: Date.now(),
          deviceTime: parseInt(String(timestamp)) || Date.now(),
          output: sanitizeInput(serialOutput),
          bufferSize: parseInt(String(bufferSize)) || 0,
        };

        deviceStream.chunks.push(streamChunk);
        deviceStream.lastActivity = Date.now();

        // Keep only last 100 chunks per device
        if (deviceStream.chunks.length > 100) {
          deviceStream.chunks = deviceStream.chunks.slice(-100);
        }

        log.debug('Serial stream chunk received', { deviceId, length: serialOutput.length });
      }

      await writeJSONFile('serial-streams.json', allStreams);

      res.json({ success: true });
    } catch (error) {
      log.error('Error storing serial stream', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get logs for a device
   * GET /api/logs/:deviceId
   */
  router.get('/logs/:deviceId', async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;
      const { limit = '100' } = req.query as { limit?: string };

      const allLogs: Record<string, LogEntry[]> = (await readJSONFile('logs.json')) || {};
      const deviceLogsData = allLogs[deviceId!] || [];

      // Return last N logs
      const logs = deviceLogsData.slice(-parseInt(limit));

      res.json({ deviceId, logs });
    } catch (error) {
      log.error('Error getting logs', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get all device logs from logs.json (historical)
   * GET /api/device-logs-history
   */
  router.get('/device-logs-history', async (_req: Request, res: Response) => {
    try {
      const allLogs = (await readJSONFile('logs.json')) || {};
      res.json(allLogs);
    } catch (error) {
      log.error('Error getting all logs', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get serial streams for a device
   * GET /api/serial-stream/:deviceId
   */
  router.get('/serial-stream/:deviceId', async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;
      const { limit = '50' } = req.query as { limit?: string };

      const allStreams: Record<string, DeviceStream> =
        (await readJSONFile('serial-streams.json')) || {};
      const deviceStream: DeviceStream = allStreams[deviceId!] || {
        isStreaming: false,
        lastActivity: 0,
        chunks: [],
      };

      // Return last N chunks
      const chunks = deviceStream.chunks.slice(-parseInt(limit));

      res.json({
        deviceId,
        isStreaming: deviceStream.isStreaming,
        lastActivity: deviceStream.lastActivity,
        chunks,
      });
    } catch (error) {
      log.error('Error getting serial streams', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get all serial streams
   * GET /api/serial-streams
   */
  router.get('/serial-streams', async (_req: Request, res: Response) => {
    try {
      const allStreams = (await readJSONFile('serial-streams.json')) || {};
      res.json(allStreams);
    } catch (error) {
      log.error('Error getting all serial streams', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Combined device logs (activity + detailed ESP32 logs)
   * GET /api/device-logs-combined
   */
  router.get('/device-logs-combined', async (req: Request, res: Response) => {
    try {
      const { limit = '100', level } = req.query as { limit?: string; level?: string };
      const deviceId = process.env.DEVICE_ID || 'esp32-001';

      // Get ESP32 detailed logs from logs.json
      const allLogs: Record<string, LogEntry[]> = (await readJSONFile('logs.json')) || {};
      const esp32Logs = allLogs[deviceId] || [];

      // Get high-level activity logs from memory
      const activityLogs = deviceLogs || [];

      // Combine and sort by timestamp
      const combined: CombinedLogEntry[] = [];

      // Add ESP32 logs with structured format
      esp32Logs.forEach((logEntry) => {
        combined.push({
          timestamp: logEntry.timestamp,
          level: logEntry.level || 'INFO',
          message: logEntry.message,
          source: 'esp32',
          deviceTime: logEntry.deviceTime,
        });
      });

      // Add activity logs (parse timestamp from message)
      activityLogs.forEach((logStr) => {
        // Parse: [2025-01-05 12:34:56] message
        const match = logStr.match(/\[([^\]]+)\] (.+)/);
        if (match) {
          const timeStr = match[1]!;
          const message = match[2]!;
          const timestamp = new Date(timeStr).getTime() || Date.now();
          combined.push({
            timestamp,
            level: 'INFO',
            message,
            source: 'server',
          });
        }
      });

      // Sort by timestamp (newest first)
      combined.sort((a, b) => b.timestamp - a.timestamp);

      // Filter by level if specified
      let filtered = combined;
      if (level) {
        filtered = combined.filter((logEntry) => logEntry.level === level.toUpperCase());
      }

      // Limit results
      const limited = filtered.slice(0, parseInt(limit));

      res.json({
        deviceId,
        logs: limited,
        total: filtered.length,
      });
    } catch (error) {
      log.error('Error getting combined logs', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Wake cycle diagnostics
   * GET /api/wake-cycle-diagnostics
   */
  router.get('/wake-cycle-diagnostics', async (_req: Request, res: Response) => {
    try {
      const deviceId = process.env.DEVICE_ID || 'esp32-001';
      const allLogs: Record<string, LogEntry[]> = (await readJSONFile('logs.json')) || {};
      const esp32Logs = allLogs[deviceId] || [];

      // Get last 50 logs to analyze latest wake cycle
      const recentLogs = esp32Logs.slice(-50);

      // Find wake cycle boundaries
      const wakeCycles: WakeCycle[] = [];
      let currentCycle: WakeCycle | null = null;

      recentLogs.forEach((logEntry) => {
        const msg = logEntry.message.toLowerCase();

        // Start of wake cycle
        if (msg.includes('awakened') || msg.includes('boot count')) {
          if (currentCycle) {
            wakeCycles.push(currentCycle);
          }
          currentCycle = {
            startTime: logEntry.timestamp,
            events: [],
            errors: [],
          };
        }

        if (currentCycle) {
          currentCycle.events.push({
            time: logEntry.timestamp,
            message: logEntry.message,
            level: logEntry.level,
          });

          if (
            logEntry.level === 'ERROR' ||
            msg.includes('error') ||
            msg.includes('failed')
          ) {
            currentCycle.errors.push(logEntry.message);
          }

          // Mark end of cycle
          if (msg.includes('entering deep sleep') || msg.includes('sleeping')) {
            currentCycle.endTime = logEntry.timestamp;
            currentCycle.duration = currentCycle.endTime - currentCycle.startTime;
            wakeCycles.push(currentCycle);
            currentCycle = null;
          }
        }
      });

      // Add incomplete current cycle if exists
      const incompleteCycle = currentCycle as WakeCycle | null;
      if (incompleteCycle) {
        incompleteCycle.endTime = Date.now();
        incompleteCycle.duration = incompleteCycle.endTime - incompleteCycle.startTime;
        incompleteCycle.incomplete = true;
        wakeCycles.push(incompleteCycle);
      }

      // Get latest cycle
      const latestCycle = wakeCycles.length > 0 ? wakeCycles[wakeCycles.length - 1] : null;

      res.json({
        deviceId,
        latestCycle,
        recentCycles: wakeCycles.slice(-5),
        totalCycles: wakeCycles.length,
      });
    } catch (error) {
      log.error('Error getting wake cycle diagnostics', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createLogRoutes;
