# Glance Server

This directory contains the Node.js server used by the Glance e‑ink display project. It exposes REST APIs and a small web dashboard for managing images and devices.

## Requirements

- Node.js 18 or newer

## Installation

```bash
npm install
```

## Running

Start the server locally with:

```bash
npm start
```

The server listens on port `3000` by default. Set the `PORT` environment variable to use a different port.

### Development mode

For automatic reloads during development run:

```bash
npm run dev
```

## Docker

A production ready Dockerfile is provided. Build and run with:

```bash
docker build -t glance-server .
docker run -p 3000:3000 glance-server
```

Environment variables `IMAGE_VERSION` and `BUILD_DATE` are automatically set during Docker builds to provide version information.

## Features

### AI Art Generation
- **GPT-4o Image Generation**: Create full-screen artwork optimized for e-ink displays
- **Feeling Lucky**: Expand simple prompts into detailed art generation prompts using GPT-4o-mini
- **Prompt History**: View the original prompt used to generate any AI artwork
- **Floyd-Steinberg Dithering**: Advanced color processing for high-quality e-ink reproduction

### Image Processing
- **Auto-crop**: Removes whitespace margins from AI-generated images
- **Contrast Enhancement**: Optimizes images for e-ink display characteristics
- **Rotation Support**: Images can be rotated 0°, 90°, 180°, or 270°
- **Spectra 6 Palette**: Precise color mapping to hardware e-ink colors (black, white, yellow, red, blue, green)

### Web Interface
- **Minimalist Design**: Clean, monochrome aesthetic with hidden details
- **Dual Mode**: Upload existing images or generate new AI artwork
- **Live Preview**: View current display and prompt information
- **Device Status**: Monitor ESP32 battery, WiFi signal, and display health

### Art Gallery Browsing
- **Museum Integration**: Search 5 major art sources (Met, ARTIC, Cleveland, Rijksmuseum, Wikimedia Commons)
- **100M+ Artworks**: Access to Wikimedia Commons aggregating artwork from museums worldwide
- **Famous Artists**: Comprehensive coverage of Picasso, Da Vinci, Monet, Van Gogh, and more
- **Source Transparency**: Visual badges show which museum provided each artwork
- **Smart Filtering**: Automatic quality filtering to exclude book pages and low-resolution images

## API Endpoints

### Image Management
- `GET /api/current.json` – Fetch current image metadata for ESP32 (without image data)
- `GET /api/current-full.json` – Fetch complete current image data for web UI
- `GET /api/image.bin` – Stream raw binary image data for PSRAM (ESP32 optimized)
- `POST /api/current` – Update the current image
- `POST /api/upload` – Upload and process an image for the display
- `POST /api/preview` – Generate a preview and e-ink size estimate

### AI Generation
- `POST /api/generate-art` – Generate AI artwork via OpenAI GPT-4o image models
- `POST /api/lucky-prompt` – Expand simple ideas into detailed art prompts using GPT-4o-mini

### Art Gallery
- `GET /api/art/search` – Search 5 museum APIs for artworks (query, limit, offset parameters)

### Device Management
- `POST /api/device-status` – Submit device status information (battery, WiFi, errors)
- `GET /api/devices` – Retrieve known devices and their status

### System
- `GET /health` – Health check endpoint
- `GET /` – Web dashboard for manual operation

## Configuration

### Environment Variables
- `PORT` – Server port (default: 3000)
- `OPENAI_API_KEY` – Required for AI art generation features
- `IMAGE_VERSION` – Set automatically during Docker builds
- `BUILD_DATE` – Set automatically during Docker builds

## Architecture

The server uses a modular architecture with clean separation of concerns:

```
server/
├── server.js              # Main entry (middleware, route mounting)
├── routes/                # API route handlers
│   ├── art.js             # Art search, smart search, similar, random
│   ├── collections.js     # Curated art collections
│   ├── devices.js         # Device status, commands
│   ├── history.js         # History, playlist, collections
│   ├── images.js          # Current image, binary stream, preview
│   ├── logs.js            # Logging, serial streams, diagnostics
│   ├── semantic-search.js # Vector similarity search
│   ├── system.js          # Health, settings, build info
│   └── upload.js          # Upload, AI generation
├── services/              # Business logic
│   ├── image-processing.js  # Dithering, color conversion
│   ├── museum-api.js        # Museum search orchestration
│   ├── statistics.js        # API tracking, pricing
│   └── vector-search.js     # CLIP embeddings
├── utils/                 # Shared utilities
│   ├── time.js            # Oslo timezone, night sleep
│   ├── validation.js      # Input validation
│   └── data-store.js      # JSON file handling
└── data/                  # Static data files
    └── curated-collections.json
```

## Testing

Run the automated test suite with:

```bash
npm test
```

**188 tests** covering image processing, API endpoints, and services.

See [`__tests__/README.md`](./__tests__/README.md) for details about the test setup.
