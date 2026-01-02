# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Glance** is a battery-powered ESP32 e-ink art gallery system. It displays curated artwork from museum APIs and AI-generated art on a 13.3" color e-ink display, powered by a Raspberry Pi server.

## Architecture

```
┌─────────────────┐     HTTP/WiFi     ┌─────────────────┐
│   ESP32-S3      │◄──────────────────│   Raspberry Pi  │
│ Good Display    │                   │   (serverpi)    │
│ 13.3" e-ink     │                   │                 │
└─────────────────┘                   │  Node.js/Docker │
                                      │  + Qdrant VectorDB
                                      └─────────────────┘
```

- **ESP32-S3**: Good Display ESP32-133C02 board, controls Waveshare 13.3" Spectra 6 e-ink display
- **Raspberry Pi**: Runs Node.js server in Docker, serves images and web interface
- **Vector DB**: Qdrant for semantic art search (CLIP/SigLIP embeddings)
- **Communication**: ESP32 fetches images via HTTP, reports battery/status back

## Project Structure

```
Glance/
├── esp32-client/                 # ESP32 firmware (PlatformIO/ESP-IDF)
│   ├── gooddisplay-clean/        # Main production firmware
│   │   └── src/main.c            # Core firmware with battery monitoring
│   ├── lib/epd/                  # E-ink display drivers
│   ├── platformio.ini            # Build environments
│   └── build.sh                  # Build automation
├── server/                       # Node.js Express server
│   ├── server.js                 # Main server (~5000 lines)
│   ├── admin.html                # Admin interface
│   ├── index.html                # Gallery interface
│   ├── Dockerfile                # Multi-stage Docker build
│   ├── services/                 # Business logic
│   │   ├── clip-embeddings.js    # CLIP model integration
│   │   ├── vector-search.js      # Qdrant search
│   │   └── embedding-db.js       # Embedding cache
│   ├── scripts/                  # Data import scripts
│   └── __tests__/                # Jest test suite
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
├── docker-compose.yml            # Local dev + Qdrant
└── deploy-to-pi.sh               # Manual deployment
```

## Deployment (Automatic)

Pushing to `main` triggers automatic deployment via GitHub Actions:

1. **Test**: Runs `npm run test:ci`
2. **Build**: Multi-arch Docker image (linux/arm64)
3. **Push**: To Docker Hub (`chaerem/glance-server:sha-<commit>`)
4. **Deploy**: SSH via Tailscale to serverpi, pulls and restarts container

No manual deployment needed for server changes.

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
| `/api/device-status` | ESP32 status reporting (battery, signal) |
| `/api/esp32-status` | Get device status for admin UI |
| `/api/upload` | Upload custom images |
| `/api/generate-art` | AI art generation (OpenAI GPT-4o) |
| `/api/art/search` | Keyword search (8 museum sources) |
| `/api/art/smart-search` | Semantic search (CLIP/SigLIP) |
| `/api/art/random` | Random artwork |
| `/api/settings` | Server settings (sleep duration, etc.) |

## Hardware

### ESP32 Board: Good Display ESP32-133C02
- **MCU**: ESP32-S3 (dual-core, 240MHz)
- **Display**: Waveshare 13.3" Spectra 6 (1200×1600, 6-color)
- **Interface**: SPI to display, WiFi to server
- **Battery Pin**: GPIO 2 (ADC1_CH1) via voltage divider

### Battery Monitoring
- **Voltage Divider**: Connected to GPIO 2
- **Calibrated Ratio**: 4.7 (ADC reads ~0.85V at 4.0V battery)
- **Thresholds**: Critical 3.3V, Low 3.5V, Normal 3.6V+
- **Deep Sleep**: ~10μA current consumption

### Power Requirements
- LiPo battery: 2000mAh+ recommended (≥10C discharge rate)
- Decoupling capacitor: 1000-4700μF near display
- Display refresh draws >1A peak current

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

# Run all tests
npm test

# Specific test file
npm test -- image-processing.test.js

# Coverage report
npm run test:coverage
```

Test files in `server/__tests__/`:
- `api.test.js` - API endpoint tests
- `image-processing.test.js` - Dithering & color conversion
- `eink-conversion.test.js` - E-ink specific processing
- `full-pipeline.test.js` - End-to-end workflows

## Environment Variables

### Server (production via GitHub Secrets)
- `OPENAI_API_KEY` - For AI art generation
- `HF_TOKEN` - Hugging Face (optional, for private models)
- `QDRANT_URL` - Vector database URL

### ESP32 (build time)
- `WIFI_SSID` - WiFi network name
- `WIFI_PASSWORD` - WiFi password
- `DEVICE_ID` - Device identifier (optional)

## Docker

```bash
# Local development with Qdrant
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
- Verify voltage divider ratio (currently 4.7)
- Check soldering on GPIO 2 pad
- Readings should match multimeter ±0.1V

### Display shows red screen
- WiFi connection failed
- Server unreachable
- Check ESP32 serial logs

### Server container won't start
- Check Docker logs: `docker logs glance-server`
- Verify volumes exist
- Check port 3000 isn't in use

## Recent Changes

- Battery monitoring calibrated (4.7 ratio)
- Admin page simplified (collapsible sections)
- Battery percentage calculation fixed in server
- Good Display GPIO 2 confirmed for battery
