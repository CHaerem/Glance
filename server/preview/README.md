# Glance Preview

Static preview build with mocked API for GitHub Pages.

## Quick Start

```bash
# Build
npm run build:preview

# Test locally
npm run preview:serve
```

## How It Works

✨ **No dual development needed!** Same HTML files work in both environments:

- **Production**: Uses real backend API
- **Preview**: Auto-detects and loads mock API

### Files

- `mock-api.js` - Mocks all /api/* endpoints in browser
- `auto-mock.js` - Detects environment and loads mock
- `build-preview.js` - Copies HTML files and injects auto-mock
- `index.html` / `admin.html` - Generated from source HTML

## Deployment

Automatic via GitHub Actions to: `https://{username}.github.io/{repo}/`

- **Main branch**: Deploys to Pages
- **Pull requests**: Comments with preview link

## Adding Features

1. Edit `server/simple-ui.html` or `admin.html`
2. Add mock handler to `mock-api.js` if new API endpoint
3. Rebuild: `npm run build:preview`

That's it!
