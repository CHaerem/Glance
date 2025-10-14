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

## API Endpoints

- `GET /api/current.json` – Fetch the current image data for the ESP32
- `POST /api/current` – Update the current image
- `POST /api/upload` – Upload a new image to convert for the display
- `POST /api/preview` – Generate a preview and e‑ink size estimate
- `POST /api/generate-art` – Generate AI artwork via OpenAI image models
- `POST /api/lucky-prompt` – Expand quick notes (or blank requests) into full AI art prompts
- `POST /api/device-status` – Submit device status information
- `GET /api/devices` – Retrieve known devices
- `GET /health` – Health check

The root route `/` serves a simple web dashboard for manual operation.

## Testing

Run the automated test suite with:

```bash
npm test
```

See [`__tests__/README.md`](./__tests__/README.md) for details about the test setup.
