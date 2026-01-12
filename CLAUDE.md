# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Glance** is a battery-powered ESP32 e-ink art gallery system. It displays curated artwork from museum APIs and AI-generated art on a 13.3" color e-ink display, powered by a Raspberry Pi server.

## Architecture

```
┌─────────────────┐     HTTP/WiFi     ┌─────────────────────────┐
│   ESP32-S3      │◄──────────────────│   Raspberry Pi          │
│ Good Display    │                   │   (serverpi)            │
│ 13.3" e-ink     │                   │                         │
└─────────────────┘                   │  Node.js/Docker         │
                                      │  + OpenAI Vector Stores │
                                      │  + Grafana Cloud (Loki) │
                                      └─────────────────────────┘
```

- **ESP32-S3**: Good Display ESP32-133C02 board, controls Waveshare 13.3" Spectra 6 e-ink display
- **Raspberry Pi**: Runs Node.js server in Docker, serves images and web interface
- **Vector Search**: OpenAI Vector Stores for semantic art search (text-embedding-3-small)
- **Monitoring**: Grafana Cloud with Loki for centralized log aggregation
- **Communication**: ESP32 fetches images via HTTP, reports battery/status back

## Project Structure

```
Glance/
├── esp32-client/                 # ESP32 firmware (PlatformIO/ESP-IDF)
│   ├── gooddisplay-clean/        # Main production firmware
│   │   ├── src/
│   │   │   ├── main.c            # Core firmware with battery monitoring
│   │   │   ├── ota.c             # OTA firmware update system
│   │   │   ├── server_config.h   # Shared server URLs and config
│   │   │   └── GDEP133C02.c      # E-ink display driver
│   │   └── platformio.ini        # Build config with firmware version
│   ├── lib/epd/                  # E-ink display drivers
│   └── build.sh                  # Build automation
├── server/                       # Node.js Express server
│   ├── server.js                 # Main entry (~500 lines)
│   ├── routes/                   # API route handlers (12 modules)
│   │   ├── art.js                # Art search, smart search, similar
│   │   ├── collections.js        # Curated art collections
│   │   ├── devices.js            # Device status, commands
│   │   ├── firmware.js           # OTA firmware updates
│   │   ├── history.js            # History, playlist, collections
│   │   ├── images.js             # Current image, binary stream
│   │   ├── logs.js               # Logging, serial streams
│   │   ├── metrics.js            # Prometheus metrics
│   │   ├── playlists.js          # Curated and dynamic playlists
│   │   ├── semantic-search.js    # OpenAI vector similarity search
│   │   ├── system.js             # Health, settings, build info
│   │   └── upload.js             # Upload, AI generation
│   ├── services/                 # Business logic (5 modules)
│   │   ├── logger.js             # Structured JSON logging for Loki
│   │   ├── image-processing.js   # Dithering, color conversion
│   │   ├── museum-api.js         # Museum search with art filtering
│   │   ├── openai-search.js      # OpenAI Vector Stores integration
│   │   └── statistics.js         # API tracking, pricing
│   ├── utils/                    # Shared utilities (3 modules)
│   │   ├── time.js               # Oslo timezone, night sleep
│   │   ├── validation.js         # Input validation
│   │   └── data-store.js         # JSON file handling
│   ├── data/                     # Static data files
│   │   ├── curated-collections.json
│   │   └── playlists.json        # Curated and dynamic playlists
│   ├── public/                   # Web interface (physical card UI)
│   ├── Dockerfile                # Multi-stage Docker build
│   ├── scripts/                  # Data import scripts
│   └── __tests__/                # Jest test suite (188 tests)
├── scripts/                      # Root utilities
│   ├── build-and-push.sh         # Docker build & push
│   └── run-tests.sh              # Test runner
├── docs/                         # Documentation
│   ├── HARDWARE.md               # Hardware specs & pinouts
│   ├── BATTERY_MONITORING.md     # Battery system guide
│   └── DEPLOYMENT.md             # CI/CD documentation
├── .github/workflows/            # GitHub Actions CI/CD
│   ├── test-and-build.yml        # Auto deploy to serverpi
│   └── preview-deploy.yml        # GitHub Pages preview
├── docker-compose.yml            # Local development
└── deploy-to-pi.sh               # Manual deployment
```

## Deployment (Automatic)

Pushing to `main` triggers automatic deployment via GitHub Actions with optimized parallel builds:

### Parallel CI/CD Architecture

```
┌─────────────────┐     ┌─────────────────┐
│ detect-changes  │────►│ build-firmware  │──┐
└─────────────────┘     └─────────────────┘  │
        │                                     ├──► deploy
        │               ┌─────────────────┐  │
        └──────────────►│  build-server   │──┘
                        └─────────────────┘
```

### Build Scenarios

| Changes | Jobs Run | Time |
|---------|----------|------|
| ESP32 only | build-firmware → deploy-firmware-only | **~2-3 min** |
| Server only | build-server → deploy | ~5-7 min |
| Both | build-firmware + build-server (parallel) → deploy | ~5-7 min |

### Key Optimizations

- **Decoupled firmware**: Firmware uploaded directly to serverpi via SCP, no Docker rebuild
- **Parallel builds**: Firmware and Docker image build simultaneously
- **PlatformIO caching**: Cached dependencies reduce firmware build time
- **Fast firmware path**: ESP32-only changes skip Docker entirely (saves ~5 min)

No manual deployment needed for server or firmware changes.

## Common Commands

### ESP32 Development

```bash
cd esp32-client/gooddisplay-clean

# Set credentials (or use setup-env.sh)
export WIFI_SSID="YourNetwork"
export WIFI_PASSWORD="YourPassword"

# Build and upload
pio run --target upload --environment esp32s3

# Monitor serial output
pio device monitor --baud 115200

# Or use build.sh helper
./build.sh upload    # Build + upload + monitor
./build.sh monitor   # Serial monitor only
```

### Server Development

```bash
cd server/

# Install dependencies
npm install

# Start dev server (with hot reload)
npm run dev

# Run tests
npm test                 # All tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# Local Docker with Qdrant
docker compose up -d
```

### Manual Deployment (if needed)

```bash
# From project root
./deploy-to-pi.sh serverpi.local chaerem
```

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/current.json` | Current display image metadata |
| `/api/image.bin` | Binary image data for ESP32 |
| `/api/device-status` | ESP32 status reporting (battery, signal, firmware) |
| `/api/esp32-status` | Get device status for admin UI (includes OTA history) |
| `/api/firmware/version` | Get available firmware version for OTA |
| `/api/firmware/download` | Download firmware binary for OTA update |
| `/api/upload` | Upload custom images |
| `/api/generate-art` | AI art generation (OpenAI GPT-4o) |
| `/api/art/search` | Keyword search (8 museum sources, filtered for actual art) |
| `/api/art/smart-search` | Semantic search (OpenAI Vector Stores) |
| `/api/art/random` | Random artwork |
| `/api/playlists` | List curated and dynamic playlists |
| `/api/playlists/:id` | Get playlist artworks (static or AI-searched) |
| `/api/settings` | Server settings (sleep duration, etc.) |

## Hardware

### ESP32 Board: Good Display ESP32-133C02
- **MCU**: ESP32-S3 (dual-core, 240MHz)
- **Display**: Waveshare 13.3" Spectra 6 (1200×1600, 6-color)
- **Interface**: SPI to display, WiFi to server
- **Battery Pin**: GPIO 2 (ADC1_CH1) via voltage divider

### Battery Monitoring
- **Voltage Divider**: 100kΩ + 27kΩ connected to GPIO 2
- **Calibrated Ratio**: 8.3 (empirically calibrated for PowerBoost 1000C)
- **Thresholds**: Critical 3.3V, Low 3.5V, Normal 3.6V+
- **Deep Sleep**: ~10μA current consumption

### Power System (PowerBoost 1000C)
- **Charger/Boost**: Adafruit PowerBoost 1000C (replaces LiPo Amigo Pro + MiniBoost)
- **Battery**: PiJuice 12000mAh LiPo via JST connector
- **Output**: 5V USB-A to ESP32 USB-C
- **Battery Monitoring**: PowerBoost BAT pin → voltage divider → GPIO 2
- **LED removed**: Blue power LED desoldered to save ~2mA standby current
- Display refresh draws >1A peak current (PowerBoost handles this without brownout)

## Image Processing

Server-side processing for e-ink optimization:
1. **Resize**: Fit to 1200×1600 (or 1600×1200 landscape)
2. **Color boost**: Increase saturation for vibrant display
3. **Dithering**: Floyd-Steinberg with Spectra 6 palette
4. **Palette**: Black, White, Red, Yellow, Blue, Green (6 colors)

## Art Sources (8 Museums)

- Metropolitan Museum of Art
- Art Institute of Chicago
- Cleveland Museum of Art
- Rijksmuseum
- Harvard Art Museums
- And more via API integration

2+ million artworks searchable via keyword or semantic search.

## Testing

```bash
cd server/

# Run all tests (188 tests)
npm test

# Specific test file
npm test -- image-processing.test.js

# Coverage report
npm run test:coverage
```

Test suites in `server/__tests__/`:
- `api.test.js` - API endpoint tests
- `image-processing.test.js` - Dithering & color conversion
- `eink-conversion.test.js` - E-ink specific processing
- `full-pipeline.test.js` - End-to-end workflows
- `upload-endpoint.test.js` - Upload integration tests
- `services/*.test.js` - Service module tests
- `utils/*.test.js` - Utility module tests

## Environment Variables

### Server (production via GitHub Secrets)
- `OPENAI_API_KEY` - For AI art generation and vector search
- `LOKI_URL` - Grafana Cloud Loki endpoint (optional)
- `LOKI_USER` - Loki username (optional)
- `LOKI_TOKEN` - Loki API token (optional)
- `LOG_LEVEL` - Logging level: DEBUG, INFO (default), WARN, ERROR

### ESP32 (build time)
- `WIFI_SSID` - WiFi network name
- `WIFI_PASSWORD` - WiFi password
- `DEVICE_ID` - Device identifier (optional)
- `FIRMWARE_VERSION` - Firmware version (auto-set by CI/CD to git SHA)

## Docker

```bash
# Local development
docker compose up -d

# Build manually
cd server/
docker build -t glance-server .

# Production uses GitHub Actions for builds
```

## Troubleshooting

### ESP32 won't connect
- Check WiFi credentials in environment
- Verify serverpi.local resolves (or use IP)
- Check serial monitor for connection errors

### Battery readings wrong
- Verify voltage divider ratio (currently 8.3 for PowerBoost 1000C)
- Check soldering on GPIO 2 pad and PowerBoost BAT pin
- Readings should match multimeter ±3%
- Recalibrate ratio: `correct_ratio = current_ratio × (multimeter / reported)`

### Display shows red screen
- WiFi connection failed
- Server unreachable
- Check ESP32 serial logs

### Server container won't start
- Check Docker logs: `docker logs glance-server`
- Verify volumes exist
- Check port 3000 isn't in use

## Connecting to Serverpi

When on the same local network (WiFi), use mDNS hostname:
```bash
ssh chris@serverpi.local
```

When remote or mDNS not working, use Tailscale IP:
```bash
ssh chris@100.108.19.115
```

**Note**: GitHub Actions CI/CD uses Tailscale (100.108.19.115) since it runs from cloud infrastructure.

## OTA Firmware Updates

The system supports Over-The-Air (OTA) firmware updates for the ESP32:

### ESP32 Side
- Dual OTA partitions (ota_0 and ota_1) for automatic rollback on failure
- Firmware version injected at build time (git SHA or semantic version)
- Version checking against server `/api/firmware/version`
- Safe update requirements: Battery >= 3.6V or charging
- Automatic rollback protection via `ota_mark_valid()`
- Size validation (100KB - 8MB) before download

### Server Side
- Tracks firmware version from ESP32 device status reports
- Detects successful OTA (version changes)
- Detects failed OTA (status = "ota_failed")
- Stores OTA history (last 10 events) per device
- Admin UI displays current firmware version and OTA status

### Charging Mode OTA
- When charging: ESP32 wakes every 30 seconds for fast OTA checks
- Enables near-instant firmware deployment during development
- No battery safety restrictions when on external power

## Recent Changes

- **OpenAI Vector Stores migration**: Replaced Qdrant/CLIP with OpenAI's hosted vector database
  - Uses `text-embedding-3-small` model for semantic art search
  - 2+ million artwork embeddings stored in OpenAI Vector Stores
  - File search with metadata filtering (artist, title, museum)
  - Removed local Qdrant container dependency
- **Explore page redesign**: New physical card stacks UI for browsing playlists
  - 12 curated playlists: 6 classic (museum-curated), 6 dynamic (AI-searched)
  - Physical card styling with shadows and hover effects
  - Touch-friendly drag scrolling for playlist navigation
  - Dynamic playlists fetch fresh results via semantic search
- **Museum API filtering**: Enhanced filtering to show only actual art
  - Excludes furniture, ceramics, textiles, jewelry, weapons, coins, etc.
  - Filters applied consistently across all 8 museum sources
  - Prevents photos of tables, vases, costumes from appearing
- **Grafana Cloud monitoring**: Centralized logging with Loki
  - Structured JSON logging for all server components
  - Promtail agent ships logs to Grafana Cloud
  - Alert rules for device offline, low battery, errors
  - See `docs/MONITORING.md` for setup details
- **Structured logging**: Migrated all console.log to structured JSON logging
  - Component-based loggers (server, api, device, ota, image, battery)
  - JSON output format for Grafana Cloud Loki ingestion
  - Configurable log levels via LOG_LEVEL environment variable
- **Power system upgrade**: Replaced LiPo Amigo Pro + MiniBoost with PowerBoost 1000C
  - Solved brownout issues during display refresh on battery
  - Voltage divider ratio recalibrated to 8.3 for new setup
  - Blue LED removed to save ~2mA standby current
- **Server refactored**: Modular architecture with routes/, services/, utils/
  - Server.js reduced from 5,225 lines to 523 lines (90% reduction)
- 188 tests all passing
