/**
 * Firmware OTA Routes
 * Provides firmware version info and binary download for ESP32 OTA updates
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { loggers } from '../services/logger';

const log = loggers.ota;

/** Firmware route dependencies */
export interface FirmwareRouteDeps {
  dataDir: string;
  firmwareVersion?: string;
  buildDate?: string;
}

/** Force OTA state file */
interface ForceOtaState {
  forceUpdate: boolean;
  updatedAt: string;
}

/** Firmware info cache */
interface FirmwareInfo {
  version: string;
  buildDate: number;
  size: number;
  sha256: string;
  minBattery: number;
  mtime: number;
  deployedAt: string;
}

/** Firmware version response */
interface FirmwareVersionResponse {
  version: string;
  buildDate: number;
  size: number;
  sha256: string;
  minBattery: number;
  forceUpdate: boolean;
  deployedAt: string;
}

/** Firmware status response */
interface FirmwareStatusResponse {
  available: boolean;
  version?: string;
  size?: number;
  path?: string;
  message?: string;
}

/**
 * Create firmware routes
 */
export function createFirmwareRoutes({
  dataDir,
  firmwareVersion,
  buildDate,
}: FirmwareRouteDeps): Router {
  const router = Router();

  const firmwarePath = path.join(dataDir, 'firmware.bin');
  const firmwareInfoPath = path.join(dataDir, 'firmware-info.json');
  const forceOtaPath = path.join(dataDir, 'force-ota.json');

  // Helper to read force OTA state
  function getForceOtaState(): boolean {
    try {
      if (fs.existsSync(forceOtaPath)) {
        const data = JSON.parse(fs.readFileSync(forceOtaPath, 'utf8')) as ForceOtaState;
        return data.forceUpdate === true;
      }
    } catch (e) {
      log.warn('Failed to read force-ota.json', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return false;
  }

  // Helper to set force OTA state
  function setForceOtaState(enabled: boolean): void {
    const state: ForceOtaState = {
      forceUpdate: enabled,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(forceOtaPath, JSON.stringify(state, null, 2));
  }

  /**
   * Get firmware version info
   * GET /firmware/version
   */
  router.get('/version', async (_req: Request, res: Response) => {
    try {
      // Check if firmware exists
      if (!fs.existsSync(firmwarePath)) {
        res.status(404).json({
          error: 'No firmware available',
          message: 'Upload firmware.bin to the data directory',
        });
        return;
      }

      // Try to read cached firmware info
      let firmwareInfo: FirmwareInfo | undefined;
      if (fs.existsSync(firmwareInfoPath)) {
        try {
          firmwareInfo = JSON.parse(fs.readFileSync(firmwareInfoPath, 'utf8')) as FirmwareInfo;
        } catch {
          log.warn('Failed to parse firmware-info.json, regenerating...');
        }
      }

      // Get current file stats
      const stats = fs.statSync(firmwarePath);
      const currentMtime = stats.mtime.getTime();

      // Check if we need to regenerate/update info
      const needsUpdate =
        !firmwareInfo || firmwareInfo.mtime !== currentMtime || !firmwareInfo.sha256;

      if (needsUpdate) {
        log.debug('Generating/updating firmware info...');

        // Calculate SHA256
        const fileBuffer = fs.readFileSync(firmwarePath);
        const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // Use externally provided version/buildDate from CI if available
        const version = firmwareInfo?.version || firmwareVersion || 'unknown';
        const buildDateMs =
          firmwareInfo?.buildDate || (buildDate ? new Date(buildDate).getTime() : Date.now());

        firmwareInfo = {
          version: version,
          buildDate: buildDateMs,
          size: stats.size,
          sha256: sha256,
          minBattery: 3.8, // Raised from 3.6V to prevent brownouts during OTA
          mtime: currentMtime,
          deployedAt: firmwareInfo?.deployedAt || new Date().toISOString(),
        };

        // Cache the info
        fs.writeFileSync(firmwareInfoPath, JSON.stringify(firmwareInfo, null, 2));
        log.info('Firmware info cached', { version: firmwareInfo.version, size: firmwareInfo.size });
      }

      // At this point firmwareInfo is guaranteed to exist (either loaded or created)
      const info = firmwareInfo!;

      // Return info (without internal mtime field)
      const response: FirmwareVersionResponse = {
        version: info.version,
        buildDate: info.buildDate,
        size: info.size,
        sha256: info.sha256,
        minBattery: info.minBattery,
        forceUpdate: getForceOtaState(),
        deployedAt: info.deployedAt,
      };
      res.json(response);
    } catch (error) {
      log.error('Error getting firmware info', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to get firmware info' });
    }
  });

  /**
   * Download firmware binary
   * GET /firmware/download
   */
  router.get('/download', async (req: Request, res: Response) => {
    try {
      if (!fs.existsSync(firmwarePath)) {
        res.status(404).json({ error: 'Firmware not found' });
        return;
      }

      const stats = fs.statSync(firmwarePath);
      const deviceId = (req.query.deviceId as string) || 'unknown';

      log.info('Firmware download requested', { deviceId });

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': stats.size.toString(),
        'Content-Disposition': 'attachment; filename="firmware.bin"',
        'Cache-Control': 'no-cache',
      });

      const stream = fs.createReadStream(firmwarePath);
      stream.pipe(res);

      stream.on('end', () => {
        log.info('Firmware download complete', { deviceId, size: stats.size });
      });

      stream.on('error', (err) => {
        log.error('Error streaming firmware', { error: err.message });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming firmware' });
        }
      });
    } catch (error) {
      log.error('Error serving firmware', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to serve firmware' });
    }
  });

  /**
   * Enable or disable force OTA update
   * POST /firmware/force
   */
  router.post('/force', (req: Request, res: Response) => {
    try {
      const { enabled } = req.body as { enabled?: boolean };

      if (typeof enabled !== 'boolean') {
        res.status(400).json({
          error: 'Invalid request',
          message: 'Body must contain { enabled: true/false }',
        });
        return;
      }

      setForceOtaState(enabled);

      const message = enabled
        ? 'Force OTA enabled - all devices will update on next check'
        : 'Force OTA disabled - normal version comparison resumed';

      log.info('Force OTA state changed', { enabled, message });

      res.json({
        forceUpdate: enabled,
        message,
      });
    } catch (error) {
      log.error('Error setting force OTA', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: 'Failed to set force OTA state' });
    }
  });

  /**
   * Get firmware status
   * GET /firmware/status
   */
  router.get('/status', (_req: Request, res: Response) => {
    const available = fs.existsSync(firmwarePath);

    if (available) {
      const stats = fs.statSync(firmwarePath);
      const response: FirmwareStatusResponse = {
        available: true,
        version: firmwareVersion || 'unknown',
        size: stats.size,
        path: firmwarePath,
      };
      res.json(response);
    } else {
      const response: FirmwareStatusResponse = {
        available: false,
        message: 'No firmware.bin in data directory',
      };
      res.json(response);
    }
  });

  return router;
}

export default createFirmwareRoutes;
