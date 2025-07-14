# Glance Web Dashboard

This is the web dashboard for managing your Glance e-ink displays. It provides a user-friendly interface for uploading images, scheduling updates, and monitoring device status.

## Features

- 📱 **Responsive Web Dashboard** - Works on desktop and mobile
- 🖼️ **Image Management** - Upload, preview, and manage display images
- ⏰ **Scheduling** - Configure automatic update intervals and timing
- 📊 **Device Monitoring** - Real-time status of connected displays
- 🎨 **E-Paper Optimization** - Automatic image processing for 6-color displays

## GitHub Pages Setup

1. **Enable GitHub Pages** in your repository settings
2. **Set source** to "Deploy from a branch" 
3. **Select branch** as `main` and folder as `/docs`
4. **Wait for deployment** (usually takes a few minutes)

## ESP32 Integration

Your ESP32 should make HTTP requests to:
```
https://chaerem.github.io/Glance/api/current.json
```

This endpoint returns:
```json
{
  "image": "base64_encoded_image_data",
  "title": "Image Title",
  "sleepDuration": 3600000,
  "timestamp": 1704067200000,
  "deviceId": "esp32-001"
}
```

## Development

The dashboard uses vanilla JavaScript and stores data in localStorage (since GitHub Pages is static). For production use, consider integrating with a backend service for persistent data storage.

### File Structure
```
docs/
├── index.html          # Main dashboard
├── css/style.css       # Styling
├── js/app.js          # Application logic
├── api/current.json   # Mock API endpoint
└── _config.yml        # GitHub Pages config
```

## Customization

- Update the API endpoint URL in `js/app.js`
- Modify colors and styling in `css/style.css`
- Add additional features in the dashboard as needed