/**
 * System API Routes
 * Health, settings, stats, build info, and system information
 */

import { Router, Request, Response } from 'express';
import * as os from 'os';
import statistics, { type TimeRange } from '../services/statistics';
import { readJSONFile, writeJSONFile } from '../utils/data-store';
import { getOsloTimestamp } from '../utils/time';
import { getServerLogs, getDeviceLogs } from '../utils/state';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils/error';
import guideChatService from '../services/guide-chat';

const log = loggers.server;

/** System route dependencies */
export interface SystemRouteDeps {
  imageVersion: string;
  buildDate: string;
  buildDateHuman: string;
}

/** Settings structure */
interface Settings {
  defaultSleepDuration?: number;
  devMode?: boolean;
  devServerHost?: string;
  defaultOrientation?: 'portrait' | 'landscape';
  nightSleepEnabled?: boolean;
  nightSleepStartHour?: number;
  nightSleepEndHour?: number;
}

/** Current image state */
interface CurrentState {
  sleepDuration?: number;
  devMode?: boolean;
  devServerHost?: string;
}

/**
 * Create system routes
 */
export function createSystemRoutes({
  imageVersion,
  buildDate,
  buildDateHuman,
}: SystemRouteDeps): Router {
  const router = Router();

  /**
   * Health check
   * GET /health
   */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: Date.now() });
  });

  /**
   * Build info
   * GET /api/build-info
   */
  router.get('/build-info', (_req: Request, res: Response) => {
    res.json({
      version: imageVersion,
      buildDate: buildDate,
      buildDateHuman: buildDateHuman,
      timestamp: Date.now(),
    });
  });

  /**
   * System information
   * GET /api/system-info
   */
  router.get('/system-info', (_req: Request, res: Response) => {
    res.json({
      version: process.env.DOCKER_IMAGE_VERSION || process.env.IMAGE_VERSION || 'local',
      buildDate: process.env.BUILD_DATE || null,
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    });
  });

  /**
   * Memory and cache diagnostics for performance monitoring
   * GET /api/diagnostics
   */
  router.get('/diagnostics', (_req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage();
    const guideDiagnostics = guideChatService.getDiagnostics();

    // Get MCP diagnostics from global (set in server.ts)
    const getMcpDiagnostics = (global as unknown as { getMcpDiagnostics?: () => unknown }).getMcpDiagnostics;
    const mcpDiagnostics = getMcpDiagnostics ? getMcpDiagnostics() : null;

    res.json({
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
      },
      guideChat: guideDiagnostics,
      mcp: mcpDiagnostics,
      status: {
        healthy: true,
        memoryWarning: memoryUsage.heapUsed > 500 * 1024 * 1024, // Warn if heap > 500MB
        sessionWarning: guideDiagnostics.sessionCount > guideDiagnostics.limits.maxSessions * 0.8,
      },
    });
  });

  /**
   * Get statistics
   * GET /api/stats?range=all
   */
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const timeRange = ((req.query.range as string) || 'all') as TimeRange;
      const stats = statistics.getStats(timeRange);
      res.json(stats);
    } catch (error) {
      log.error('Error retrieving stats', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
  });

  /**
   * Reset statistics
   * POST /api/stats/reset
   */
  router.post('/stats/reset', async (_req: Request, res: Response) => {
    try {
      await statistics.resetStats();
      res.json({ success: true, message: 'Statistics reset successfully' });
    } catch (error) {
      log.error('Error resetting stats', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Failed to reset statistics' });
    }
  });

  /**
   * Get server logs
   * GET /api/logs
   */
  router.get('/logs', (_req: Request, res: Response) => {
    res.json({ logs: getServerLogs() });
  });

  /**
   * Get device activity logs
   * GET /api/device-logs
   */
  router.get('/device-logs', (_req: Request, res: Response) => {
    res.json({ logs: getDeviceLogs() });
  });

  /**
   * Get current time (for ESP32 clock alignment)
   * GET /api/time
   */
  router.get('/time', (_req: Request, res: Response) => {
    const now = new Date();
    res.json({
      epoch: now.getTime(),
      iso: now.toISOString(),
      oslo: getOsloTimestamp(),
    });
  });

  /**
   * Get client IP (for admin panel)
   * GET /api/client-ip
   */
  router.get('/client-ip', (req: Request, res: Response) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const xForwardedFor = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    const clientIp =
      xForwardedFor ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      req.ip ||
      '';

    let cleanIp = clientIp;
    if (cleanIp === '::1' || cleanIp === '::ffff:127.0.0.1') {
      cleanIp = '127.0.0.1';
    } else if (cleanIp?.startsWith('::ffff:')) {
      cleanIp = cleanIp.substring(7);
    }

    if (cleanIp === '127.0.0.1' || cleanIp === '::1') {
      const networkInterfaces = os.networkInterfaces();

      for (const interfaceName of Object.keys(networkInterfaces)) {
        const interfaces = networkInterfaces[interfaceName];
        if (interfaces) {
          for (const iface of interfaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
              cleanIp = iface.address;
              break;
            }
          }
        }
        if (cleanIp !== '127.0.0.1') break;
      }
    }

    res.json({ ip: cleanIp });
  });

  /**
   * Get settings
   * GET /api/settings
   */
  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const settings: Settings = (await readJSONFile('settings.json')) || {
        defaultSleepDuration: 3600000000,
        devMode: true,
        devServerHost: 'host.local:3000',
        defaultOrientation: 'portrait',
        nightSleepEnabled: false,
        nightSleepStartHour: 23,
        nightSleepEndHour: 5,
      };
      res.json(settings);
    } catch (error) {
      log.error('Error reading settings', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Failed to read settings' });
    }
  });

  /**
   * Update settings
   * PUT /api/settings
   */
  router.put('/settings', async (req: Request, res: Response) => {
    try {
      const {
        defaultSleepDuration,
        devMode,
        devServerHost,
        defaultOrientation,
        nightSleepEnabled,
        nightSleepStartHour,
        nightSleepEndHour,
      } = req.body as Settings;

      const existingSettings: Settings = (await readJSONFile('settings.json')) || {};

      if (defaultSleepDuration !== undefined) {
        const MIN_SLEEP = 5 * 60 * 1000000;
        const MAX_SLEEP = 24 * 60 * 60 * 1000000;

        if (defaultSleepDuration < MIN_SLEEP || defaultSleepDuration > MAX_SLEEP) {
          res.status(400).json({
            error: 'Sleep duration must be between 5 minutes and 24 hours (in microseconds)',
          });
          return;
        }
        existingSettings.defaultSleepDuration = Math.floor(defaultSleepDuration);
      }

      if (devMode !== undefined) {
        existingSettings.devMode = Boolean(devMode);
      }

      if (devServerHost !== undefined) {
        existingSettings.devServerHost = String(devServerHost);
      }

      if (defaultOrientation !== undefined) {
        if (defaultOrientation !== 'portrait' && defaultOrientation !== 'landscape') {
          res.status(400).json({
            error: "Default orientation must be 'portrait' or 'landscape'",
          });
          return;
        }
        existingSettings.defaultOrientation = defaultOrientation;
      }

      if (nightSleepEnabled !== undefined) {
        existingSettings.nightSleepEnabled = Boolean(nightSleepEnabled);
      }

      if (nightSleepStartHour !== undefined) {
        const startHour = Math.floor(nightSleepStartHour);
        if (startHour < 0 || startHour > 23) {
          res.status(400).json({
            error: 'Night sleep start hour must be between 0 and 23',
          });
          return;
        }
        existingSettings.nightSleepStartHour = startHour;
      }

      if (nightSleepEndHour !== undefined) {
        const endHour = Math.floor(nightSleepEndHour);
        if (endHour < 0 || endHour > 23) {
          res.status(400).json({
            error: 'Night sleep end hour must be between 0 and 23',
          });
          return;
        }
        existingSettings.nightSleepEndHour = endHour;
      }

      await writeJSONFile('settings.json', existingSettings);

      if (defaultSleepDuration !== undefined) {
        const current: CurrentState = (await readJSONFile('current.json')) || {};
        current.sleepDuration = existingSettings.defaultSleepDuration;
        await writeJSONFile('current.json', current);
      }

      if (devMode !== undefined) {
        const current: CurrentState = (await readJSONFile('current.json')) || {};
        current.devMode = existingSettings.devMode;
        current.devServerHost = existingSettings.devServerHost;
        await writeJSONFile('current.json', current);
      }

      log.info('Settings updated', {
        sleepDuration: existingSettings.defaultSleepDuration,
        devMode: existingSettings.devMode,
        orientation: existingSettings.defaultOrientation,
        nightSleepEnabled: existingSettings.nightSleepEnabled,
      });
      res.json({ success: true, settings: existingSettings });
    } catch (error) {
      log.error('Error updating settings', {
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  return router;
}

export default createSystemRoutes;
