# Monitoring Setup

This guide covers setting up Prometheus, Grafana, and Loki for monitoring the Glance e-ink display system.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Glance Server  │────▶│   Prometheus    │────▶│     Grafana     │
│   :3000/metrics │     │      :9090      │     │      :3002      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                                               │
         │              ┌─────────────────┐              │
         └─────────────▶│    Promtail     │──────────────┘
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │      Loki       │
                        │      :3100      │
                        └─────────────────┘
```

## Included Services (via docker-compose)

The main `docker-compose.yml` already includes:

| Service | Port | Purpose |
|---------|------|---------|
| glance-server | 3000 | Main application + `/metrics` endpoint |
| glance-qdrant | 6333 | Vector database for semantic search |
| glance-loki | 3100 | Log aggregation |
| glance-promtail | - | Collects Docker container logs |

Logs from all `glance-*` containers are automatically shipped to Loki.

## Prerequisites

- Docker and Docker Compose installed on serverpi
- Glance server running and exposing metrics at `/metrics`

## Monitoring Stack Setup

### 1. Create Docker Compose for Monitoring

Create `~/monitoring/docker-compose.yml` on serverpi:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3002:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./provisioning:/etc/grafana/provisioning
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=your-secure-password
      - GF_USERS_ALLOW_SIGN_UP=false
    restart: unless-stopped

  loki:
    image: grafana/loki:latest
    container_name: loki
    ports:
      - "3100:3100"
    volumes:
      - loki-data:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana-data:
  loki-data:
```

### 2. Prometheus Configuration

Create `~/monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'glance'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'
```

### 3. Grafana Provisioning

Create the provisioning directory structure:

```bash
mkdir -p ~/monitoring/provisioning/{datasources,dashboards,alerting}
```

#### Datasources

Create `~/monitoring/provisioning/datasources/datasources.yaml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
```

#### Dashboard Provisioning

Create `~/monitoring/provisioning/dashboards/dashboards.yaml`:

```yaml
apiVersion: 1

providers:
  - name: 'Glance'
    orgId: 1
    folder: 'Glance'
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards/json
```

Copy the dashboard:

```bash
mkdir -p ~/monitoring/provisioning/dashboards/json
cp ~/glance/server/grafana-dashboard.json ~/monitoring/provisioning/dashboards/json/
```

#### Alert Rules Provisioning

Create `~/monitoring/provisioning/alerting/alert-rules.yaml`:

Copy the alert rules from `server/grafana-alert-rules.yaml` to this location.

```bash
cp ~/glance/server/grafana-alert-rules.yaml ~/monitoring/provisioning/alerting/
```

### 4. Start Monitoring Stack

```bash
cd ~/monitoring
docker compose up -d
```

## Structured Logging

The server uses structured JSON logging optimized for Loki ingestion.

### Logger Service

**File:** `server/services/logger.js`

```javascript
const { loggers } = require('./services/logger');

// Component-specific loggers
loggers.server.info('Server started', { port: 3000 });
loggers.api.info('Art search complete', { returned: 5, source: 'met' });
loggers.device.info('Device status received', { deviceId: 'esp32-001' });
loggers.ota.info('Firmware update started', { version: 'abc123' });
loggers.image.info('Image processed', { width: 1200, height: 1600 });
```

### Log Format

Logs are output as single-line JSON for Loki parsing:

```json
{"timestamp":"2026-01-11T14:07:31.522Z","ts":1736604451522,"level":"INFO","service":"glance-server","component":"api","message":"Art search complete","returned":5}
```

### Component Loggers

| Logger | Component | Usage |
|--------|-----------|-------|
| `loggers.server` | server | Startup, settings, system events |
| `loggers.api` | api | Art search, museum APIs, semantic search |
| `loggers.device` | device | Device status, commands |
| `loggers.ota` | ota | Firmware updates, version tracking |
| `loggers.image` | image | Image processing, uploads |
| `loggers.battery` | battery | Battery monitoring |

### Log Levels

Configurable via `LOG_LEVEL` environment variable:

| Level | Value | Description |
|-------|-------|-------------|
| DEBUG | 0 | Verbose debugging info |
| INFO | 1 | Normal operations (default) |
| WARN | 2 | Warnings |
| ERROR | 3 | Errors only |

```bash
# Set log level in docker-compose.yml
environment:
  - LOG_LEVEL=DEBUG
```

### Querying Logs in Grafana

Example LogQL queries:

```logql
# All errors from glance-server
{container="glance-server"} |= "ERROR"

# Parsed JSON - filter by component
{container="glance-server"} | json | component="api"

# Parsed JSON - filter by level
{container="glance-server"} | json | level="ERROR"

# Search specific message
{container="glance-server"} | json | message=~".*search.*"
```

## Available Metrics

The Glance server exposes these Prometheus metrics at `/metrics`:

### Device Metrics
| Metric | Description |
|--------|-------------|
| `glance_device_battery_volts` | Current battery voltage |
| `glance_device_battery_percent` | Battery percentage (0-100) |
| `glance_device_charging` | Charging status (0/1) |
| `glance_device_online` | Device online status (0/1) |
| `glance_device_signal_rssi_dbm` | WiFi signal strength in dBm |
| `glance_device_brownout_count_total` | Total brownout events |
| `glance_device_wakes_total` | Total wake cycles |
| `glance_device_display_updates_total` | Total display refreshes |

### Server Metrics
| Metric | Description |
|--------|-------------|
| `glance_server_uptime_seconds` | Server uptime |
| `glance_server_memory_heap_used_bytes` | Node.js heap memory used |
| `glance_server_memory_rss_bytes` | Process RSS memory |

## Alert Rules

The following alerts are configured in `grafana-alert-rules.yaml`:

### Critical Alerts
| Alert | Condition | Severity |
|-------|-----------|----------|
| Battery Voltage Critical | < 3.3V for 5 min | Critical |
| Battery Percentage Critical | < 15% for 5 min | Critical |
| Server Down | No metrics for 2 min | Critical |

### Warning Alerts
| Alert | Condition | Severity |
|-------|-----------|----------|
| Battery Voltage Low | < 3.5V for 5 min | Warning |
| Device Offline | No check-in for 10 min | Warning |
| Brownout Detected | Any brownout event | Warning |
| Server Memory High | > 400MB heap for 5 min | Warning |

### Info Alerts
| Alert | Condition | Severity |
|-------|-----------|----------|
| WiFi Signal Weak | < -75 dBm for 10 min | Info |

## Alert Notifications

### Setting Up Notification Channels

1. Open Grafana at `http://serverpi.local:3002`
2. Go to **Alerting** > **Contact points**
3. Add your preferred notification method:

#### Slack
```yaml
- name: Slack
  type: slack
  settings:
    recipient: '#alerts'
    token: xoxb-your-bot-token
    username: Glance Alerts
```

#### Email
```yaml
- name: Email
  type: email
  settings:
    addresses: your@email.com
```

#### Pushover (for mobile notifications)
```yaml
- name: Pushover
  type: pushover
  settings:
    apiToken: your-api-token
    userKey: your-user-key
    priority: high
```

### Creating Notification Policies

1. Go to **Alerting** > **Notification policies**
2. Edit the default policy to route to your contact point
3. Optionally create specific routes for different severity levels

## Accessing Monitoring

| Service | URL |
|---------|-----|
| Grafana | http://serverpi.local:3002 |
| Prometheus | http://serverpi.local:9090 |
| Loki | http://serverpi.local:3100 |

## Troubleshooting

### No Metrics in Prometheus

```bash
# Check if Glance metrics endpoint is accessible
curl http://localhost:3000/metrics

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

### Grafana Not Loading Dashboard

```bash
# Check provisioning logs
docker logs grafana 2>&1 | grep -i provision

# Verify dashboard file exists
ls -la ~/monitoring/provisioning/dashboards/json/
```

### Alert Rules Not Loading

```bash
# Check Grafana logs for alert provisioning errors
docker logs grafana 2>&1 | grep -i alert

# Verify alert rules YAML is valid
docker exec grafana cat /etc/grafana/provisioning/alerting/alert-rules.yaml
```

### Loki Not Receiving Logs

The docker-compose setup uses Promtail to collect logs automatically. If logs aren't appearing:

```bash
# Check Promtail is running
docker logs glance-promtail

# Verify Loki is healthy
curl http://localhost:3100/ready

# Check Promtail can see containers
docker exec glance-promtail cat /tmp/positions.yaml
```

### Using Grafana Cloud Loki (Alternative)

If you're using Grafana Cloud instead of local Loki, update `promtail-config.yml`:

```yaml
clients:
  - url: https://logs-prod-us-central1.grafana.net/loki/api/v1/push
    basic_auth:
      username: <YOUR_GRAFANA_CLOUD_USER_ID>
      password: <YOUR_GRAFANA_CLOUD_API_KEY>
```

## Updating Alert Rules

When updating alert rules:

1. Edit `server/grafana-alert-rules.yaml` in this repo
2. Deploy changes to serverpi
3. Restart Grafana to pick up changes:

```bash
docker restart grafana
```

Or import manually via Grafana UI:
1. Go to **Alerting** > **Alert rules**
2. Click **Import**
3. Paste the YAML content

## Dashboard Customization

The main dashboard (`grafana-dashboard.json`) includes:

### Metrics Panels
- Battery voltage and percentage over time
- Device online status
- Charging status
- Brownout count
- WiFi signal strength
- Server memory usage
- Server uptime

### Log Panels (via Loki)
- **Application Logs**: All logs from glance-server container
- **Errors & Warnings**: Filtered view showing only errors, warnings, failures
- **Log Rate**: Graph showing log volume and error rate over time

To customize:
1. Edit panels in Grafana UI
2. Export dashboard JSON
3. Update `server/grafana-dashboard.json`
4. Commit and deploy
