/**
 * Prometheus Metrics Endpoint
 * Exposes metrics in Prometheus exposition format for Grafana scraping
 */

import { Router, Request, Response } from 'express';
import * as os from 'os';
import { readJSONFile } from '../utils/data-store';
import { loggers } from '../services/logger';
import type { ServerSettings } from '../types';

const log = loggers.server;

// Server start time for uptime calculation
const serverStartTime = Date.now();

/** Metric label */
interface MetricLabel {
  [key: string]: string;
}

/** Metric value with labels */
interface MetricValue {
  labels: MetricLabel;
  value: number | null | undefined;
}

/** Device data structure */
interface DeviceData {
  batteryVoltage?: number;
  batteryPercent?: number;
  isCharging?: boolean;
  signalStrength?: number;
  freeHeap?: number;
  bootCount?: number;
  brownoutCount?: number;
  lastSeen?: number;
  usageStats?: {
    totalWakes?: number;
    totalDisplayUpdates?: number;
    otaUpdateCount?: number;
  };
  operationSamples?: Array<{
    firmwareVersion?: string;
    type?: string;
    voltageDrop?: number;
  }>;
}

/** Firmware stats */
interface FirmwareStats {
  displayDrops: number[];
  wakeDrops: number[];
}

/**
 * Format a metric line in Prometheus exposition format
 */
function formatMetric(
  name: string,
  type: string,
  help: string,
  values: MetricValue[]
): string {
  const lines: string[] = [];
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} ${type}`);

  for (const { labels, value } of values) {
    if (value !== null && value !== undefined && !isNaN(value)) {
      const labelStr =
        labels && Object.keys(labels).length > 0
          ? `{${Object.entries(labels)
              .map(([k, v]) => `${k}="${v}"`)
              .join(',')}}`
          : '';
      lines.push(`${name}${labelStr} ${value}`);
    }
  }

  return lines.join('\n');
}

/**
 * Create metrics router
 */
export function createMetricsRouter(): Router {
  const router = Router();

  /**
   * GET /api/metrics
   * Returns metrics in Prometheus exposition format
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const metrics: string[] = [];
      const devices: Record<string, DeviceData> = (await readJSONFile('devices.json')) || {};
      const settings: ServerSettings = (await readJSONFile('settings.json')) || {};

      // Server metrics
      const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
      metrics.push(
        formatMetric('glance_server_uptime_seconds', 'counter', 'Server uptime in seconds', [
          { labels: {}, value: uptimeSeconds },
        ])
      );

      // Node.js memory metrics
      const memUsage = process.memoryUsage();
      metrics.push(
        formatMetric('glance_server_memory_heap_used_bytes', 'gauge', 'Node.js heap memory used', [
          { labels: {}, value: memUsage.heapUsed },
        ])
      );
      metrics.push(
        formatMetric(
          'glance_server_memory_heap_total_bytes',
          'gauge',
          'Node.js total heap memory',
          [{ labels: {}, value: memUsage.heapTotal }]
        )
      );
      metrics.push(
        formatMetric('glance_server_memory_rss_bytes', 'gauge', 'Node.js resident set size', [
          { labels: {}, value: memUsage.rss },
        ])
      );

      // System load
      const loadAvg = os.loadavg();
      metrics.push(
        formatMetric('glance_system_load_1m', 'gauge', 'System load average 1 minute', [
          { labels: {}, value: loadAvg[0] },
        ])
      );

      // Device metrics collectors
      const deviceMetrics = {
        battery_volts: [] as MetricValue[],
        battery_percent: [] as MetricValue[],
        charging: [] as MetricValue[],
        signal_rssi_dbm: [] as MetricValue[],
        free_heap_bytes: [] as MetricValue[],
        boot_count_total: [] as MetricValue[],
        brownout_count_total: [] as MetricValue[],
        wakes_total: [] as MetricValue[],
        display_updates_total: [] as MetricValue[],
        ota_updates_total: [] as MetricValue[],
        online: [] as MetricValue[],
        last_seen_timestamp: [] as MetricValue[],
      };

      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

      for (const [deviceId, device] of Object.entries(devices)) {
        const labels = { device_id: deviceId };
        const isOnline = (device.lastSeen ?? 0) > fiveMinutesAgo ? 1 : 0;

        deviceMetrics.battery_volts.push({ labels, value: device.batteryVoltage || 0 });
        deviceMetrics.battery_percent.push({ labels, value: device.batteryPercent || 0 });
        deviceMetrics.charging.push({ labels, value: device.isCharging ? 1 : 0 });
        deviceMetrics.signal_rssi_dbm.push({ labels, value: device.signalStrength || 0 });
        deviceMetrics.free_heap_bytes.push({ labels, value: device.freeHeap || 0 });
        deviceMetrics.boot_count_total.push({ labels, value: device.bootCount || 0 });
        deviceMetrics.brownout_count_total.push({ labels, value: device.brownoutCount || 0 });
        deviceMetrics.online.push({ labels, value: isOnline });
        deviceMetrics.last_seen_timestamp.push({
          labels,
          value: device.lastSeen ? Math.floor(device.lastSeen / 1000) : 0,
        });

        // Usage stats
        const stats = device.usageStats || {};
        deviceMetrics.wakes_total.push({ labels, value: stats.totalWakes || 0 });
        deviceMetrics.display_updates_total.push({ labels, value: stats.totalDisplayUpdates || 0 });
        deviceMetrics.ota_updates_total.push({ labels, value: stats.otaUpdateCount || 0 });

        // Per-firmware version metrics
        const samples = device.operationSamples || [];
        const firmwareStats: Record<string, FirmwareStats> = {};

        for (const sample of samples) {
          const ver = sample.firmwareVersion || 'unknown';
          if (!firmwareStats[ver]) {
            firmwareStats[ver] = { displayDrops: [], wakeDrops: [] };
          }
          const fwStat = firmwareStats[ver]!;
          if (sample.type === 'display' && sample.voltageDrop !== undefined) {
            fwStat.displayDrops.push(sample.voltageDrop);
          } else if (sample.type === 'wake' && sample.voltageDrop !== undefined) {
            fwStat.wakeDrops.push(sample.voltageDrop);
          }
        }

        // Add firmware-specific efficiency metrics
        for (const [version, fwStats] of Object.entries(firmwareStats)) {
          const fwLabels = { device_id: deviceId, firmware_version: version };

          if (fwStats.displayDrops.length > 0) {
            const avgDrop =
              fwStats.displayDrops.reduce((a, b) => a + b, 0) / fwStats.displayDrops.length;
            metrics.push(
              formatMetric(
                'glance_device_display_voltage_drop_avg_volts',
                'gauge',
                'Average voltage drop per display update by firmware version',
                [{ labels: fwLabels, value: avgDrop }]
              )
            );
          }

          if (fwStats.wakeDrops.length > 0) {
            const avgDrop =
              fwStats.wakeDrops.reduce((a, b) => a + b, 0) / fwStats.wakeDrops.length;
            metrics.push(
              formatMetric(
                'glance_device_wake_voltage_drop_avg_volts',
                'gauge',
                'Average voltage drop per wake cycle by firmware version',
                [{ labels: fwLabels, value: avgDrop }]
              )
            );
          }
        }
      }

      // Add device metrics
      metrics.push(
        formatMetric(
          'glance_device_battery_volts',
          'gauge',
          'Device battery voltage',
          deviceMetrics.battery_volts
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_battery_percent',
          'gauge',
          'Device battery percentage',
          deviceMetrics.battery_percent
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_charging',
          'gauge',
          'Device charging state (1=charging, 0=not charging)',
          deviceMetrics.charging
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_signal_rssi_dbm',
          'gauge',
          'Device WiFi signal strength in dBm',
          deviceMetrics.signal_rssi_dbm
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_free_heap_bytes',
          'gauge',
          'Device free heap memory in bytes',
          deviceMetrics.free_heap_bytes
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_boot_count_total',
          'counter',
          'Total device boot count',
          deviceMetrics.boot_count_total
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_brownout_count_total',
          'counter',
          'Total brownout events',
          deviceMetrics.brownout_count_total
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_wakes_total',
          'counter',
          'Total wake cycles',
          deviceMetrics.wakes_total
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_display_updates_total',
          'counter',
          'Total display updates',
          deviceMetrics.display_updates_total
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_ota_updates_total',
          'counter',
          'Total OTA updates',
          deviceMetrics.ota_updates_total
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_online',
          'gauge',
          'Device online state (1=online, 0=offline)',
          deviceMetrics.online
        )
      );
      metrics.push(
        formatMetric(
          'glance_device_last_seen_timestamp_seconds',
          'gauge',
          'Unix timestamp of last device contact',
          deviceMetrics.last_seen_timestamp
        )
      );

      // Settings metrics
      metrics.push(
        formatMetric(
          'glance_settings_sleep_duration_microseconds',
          'gauge',
          'Configured sleep duration in microseconds',
          [{ labels: {}, value: settings.defaultSleepDuration || 3600000000 }]
        )
      );
      metrics.push(
        formatMetric('glance_settings_dev_mode', 'gauge', 'Development mode enabled (1=yes, 0=no)', [
          { labels: {}, value: settings.devMode ? 1 : 0 },
        ])
      );
      metrics.push(
        formatMetric(
          'glance_settings_night_sleep_enabled',
          'gauge',
          'Night sleep mode enabled (1=yes, 0=no)',
          [{ labels: {}, value: settings.nightSleepEnabled ? 1 : 0 }]
        )
      );

      // Respond with Prometheus format
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metrics.join('\n\n') + '\n');
    } catch (error) {
      log.error('Error generating metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send('# Error generating metrics\n');
    }
  });

  return router;
}

export default createMetricsRouter;
