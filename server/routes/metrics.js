/**
 * Prometheus Metrics Endpoint
 * Exposes metrics in Prometheus exposition format for Grafana scraping
 *
 * Metrics follow Prometheus naming conventions:
 * - snake_case names
 * - Unit suffix where applicable (_volts, _percent, _total, _seconds)
 * - Labels in curly braces
 */

const express = require('express');
const os = require('os');
const { readJSONFile } = require('../utils/data-store');

const router = express.Router();

// Server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * Format a metric line in Prometheus exposition format
 * @param {string} name - Metric name
 * @param {string} type - Metric type (gauge, counter, histogram)
 * @param {string} help - Help text
 * @param {Array} values - Array of {labels, value} objects
 * @returns {string} Formatted metric lines
 */
function formatMetric(name, type, help, values) {
    const lines = [];
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);

    for (const { labels, value } of values) {
        if (value !== null && value !== undefined && !isNaN(value)) {
            const labelStr = labels && Object.keys(labels).length > 0
                ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
                : '';
            lines.push(`${name}${labelStr} ${value}`);
        }
    }

    return lines.join('\n');
}

/**
 * GET /api/metrics
 * Returns metrics in Prometheus exposition format
 */
router.get('/', async (_req, res) => {
    try {
        const metrics = [];
        const devices = (await readJSONFile('devices.json')) || {};
        const settings = (await readJSONFile('settings.json')) || {};

        // Server metrics
        const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
        metrics.push(formatMetric(
            'glance_server_uptime_seconds',
            'counter',
            'Server uptime in seconds',
            [{ labels: {}, value: uptimeSeconds }]
        ));

        // Node.js memory metrics
        const memUsage = process.memoryUsage();
        metrics.push(formatMetric(
            'glance_server_memory_heap_used_bytes',
            'gauge',
            'Node.js heap memory used',
            [{ labels: {}, value: memUsage.heapUsed }]
        ));
        metrics.push(formatMetric(
            'glance_server_memory_heap_total_bytes',
            'gauge',
            'Node.js total heap memory',
            [{ labels: {}, value: memUsage.heapTotal }]
        ));
        metrics.push(formatMetric(
            'glance_server_memory_rss_bytes',
            'gauge',
            'Node.js resident set size',
            [{ labels: {}, value: memUsage.rss }]
        ));

        // System load
        const loadAvg = os.loadavg();
        metrics.push(formatMetric(
            'glance_system_load_1m',
            'gauge',
            'System load average 1 minute',
            [{ labels: {}, value: loadAvg[0] }]
        ));

        // Device metrics
        const deviceMetrics = {
            battery_volts: [],
            battery_percent: [],
            charging: [],
            signal_rssi_dbm: [],
            free_heap_bytes: [],
            boot_count_total: [],
            brownout_count_total: [],
            wakes_total: [],
            display_updates_total: [],
            ota_updates_total: [],
            online: [],
            last_seen_timestamp: []
        };

        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

        for (const [deviceId, device] of Object.entries(devices)) {
            const labels = { device_id: deviceId };
            const isOnline = device.lastSeen > fiveMinutesAgo ? 1 : 0;

            deviceMetrics.battery_volts.push({
                labels,
                value: device.batteryVoltage || 0
            });

            deviceMetrics.battery_percent.push({
                labels,
                value: device.batteryPercent || 0
            });

            deviceMetrics.charging.push({
                labels,
                value: device.isCharging ? 1 : 0
            });

            deviceMetrics.signal_rssi_dbm.push({
                labels,
                value: device.signalStrength || 0
            });

            deviceMetrics.free_heap_bytes.push({
                labels,
                value: device.freeHeap || 0
            });

            deviceMetrics.boot_count_total.push({
                labels,
                value: device.bootCount || 0
            });

            deviceMetrics.brownout_count_total.push({
                labels,
                value: device.brownoutCount || 0
            });

            deviceMetrics.online.push({
                labels,
                value: isOnline
            });

            deviceMetrics.last_seen_timestamp.push({
                labels,
                value: device.lastSeen ? Math.floor(device.lastSeen / 1000) : 0
            });

            // Usage stats
            const stats = device.usageStats || {};
            deviceMetrics.wakes_total.push({
                labels,
                value: stats.totalWakes || 0
            });

            deviceMetrics.display_updates_total.push({
                labels,
                value: stats.totalDisplayUpdates || 0
            });

            deviceMetrics.ota_updates_total.push({
                labels,
                value: stats.otaUpdateCount || 0
            });

            // Per-firmware version metrics
            const samples = device.operationSamples || [];
            const firmwareStats = {};

            for (const sample of samples) {
                const ver = sample.firmwareVersion || 'unknown';
                if (!firmwareStats[ver]) {
                    firmwareStats[ver] = { displayDrops: [], wakeDrops: [] };
                }
                if (sample.type === 'display') {
                    firmwareStats[ver].displayDrops.push(sample.voltageDrop);
                } else if (sample.type === 'wake') {
                    firmwareStats[ver].wakeDrops.push(sample.voltageDrop);
                }
            }

            // Add firmware-specific efficiency metrics
            for (const [version, fwStats] of Object.entries(firmwareStats)) {
                const fwLabels = { device_id: deviceId, firmware_version: version };

                if (fwStats.displayDrops.length > 0) {
                    const avgDrop = fwStats.displayDrops.reduce((a, b) => a + b, 0) / fwStats.displayDrops.length;
                    metrics.push(formatMetric(
                        'glance_device_display_voltage_drop_avg_volts',
                        'gauge',
                        'Average voltage drop per display update by firmware version',
                        [{ labels: fwLabels, value: avgDrop }]
                    ));
                }

                if (fwStats.wakeDrops.length > 0) {
                    const avgDrop = fwStats.wakeDrops.reduce((a, b) => a + b, 0) / fwStats.wakeDrops.length;
                    metrics.push(formatMetric(
                        'glance_device_wake_voltage_drop_avg_volts',
                        'gauge',
                        'Average voltage drop per wake cycle by firmware version',
                        [{ labels: fwLabels, value: avgDrop }]
                    ));
                }
            }
        }

        // Add device metrics
        metrics.push(formatMetric(
            'glance_device_battery_volts',
            'gauge',
            'Device battery voltage',
            deviceMetrics.battery_volts
        ));

        metrics.push(formatMetric(
            'glance_device_battery_percent',
            'gauge',
            'Device battery percentage',
            deviceMetrics.battery_percent
        ));

        metrics.push(formatMetric(
            'glance_device_charging',
            'gauge',
            'Device charging state (1=charging, 0=not charging)',
            deviceMetrics.charging
        ));

        metrics.push(formatMetric(
            'glance_device_signal_rssi_dbm',
            'gauge',
            'Device WiFi signal strength in dBm',
            deviceMetrics.signal_rssi_dbm
        ));

        metrics.push(formatMetric(
            'glance_device_free_heap_bytes',
            'gauge',
            'Device free heap memory in bytes',
            deviceMetrics.free_heap_bytes
        ));

        metrics.push(formatMetric(
            'glance_device_boot_count_total',
            'counter',
            'Total device boot count',
            deviceMetrics.boot_count_total
        ));

        metrics.push(formatMetric(
            'glance_device_brownout_count_total',
            'counter',
            'Total brownout events',
            deviceMetrics.brownout_count_total
        ));

        metrics.push(formatMetric(
            'glance_device_wakes_total',
            'counter',
            'Total wake cycles',
            deviceMetrics.wakes_total
        ));

        metrics.push(formatMetric(
            'glance_device_display_updates_total',
            'counter',
            'Total display updates',
            deviceMetrics.display_updates_total
        ));

        metrics.push(formatMetric(
            'glance_device_ota_updates_total',
            'counter',
            'Total OTA updates',
            deviceMetrics.ota_updates_total
        ));

        metrics.push(formatMetric(
            'glance_device_online',
            'gauge',
            'Device online state (1=online, 0=offline)',
            deviceMetrics.online
        ));

        metrics.push(formatMetric(
            'glance_device_last_seen_timestamp_seconds',
            'gauge',
            'Unix timestamp of last device contact',
            deviceMetrics.last_seen_timestamp
        ));

        // Settings metrics
        metrics.push(formatMetric(
            'glance_settings_sleep_duration_microseconds',
            'gauge',
            'Configured sleep duration in microseconds',
            [{ labels: {}, value: settings.defaultSleepDuration || 3600000000 }]
        ));

        metrics.push(formatMetric(
            'glance_settings_dev_mode',
            'gauge',
            'Development mode enabled (1=yes, 0=no)',
            [{ labels: {}, value: settings.devMode ? 1 : 0 }]
        ));

        metrics.push(formatMetric(
            'glance_settings_night_sleep_enabled',
            'gauge',
            'Night sleep mode enabled (1=yes, 0=no)',
            [{ labels: {}, value: settings.nightSleepEnabled ? 1 : 0 }]
        ));

        // Respond with Prometheus format
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(metrics.join('\n\n') + '\n');

    } catch (error) {
        console.error('Error generating metrics:', error);
        res.status(500).send('# Error generating metrics\n');
    }
});

module.exports = router;
