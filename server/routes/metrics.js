/**
 * Prometheus Metrics Endpoint
 * Re-exports from TypeScript implementation
 */

const { createMetricsRouter } = require('../dist/src/routes/metrics');

module.exports = createMetricsRouter();
