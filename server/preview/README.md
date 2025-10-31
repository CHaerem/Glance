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

- `mock-api.js` - Mocks all /api/* endpoints in browser (718 lines)
- `build-preview.js` - Build script that inlines mock API into HTML
- `index.html` / `admin.html` - Generated from source HTML (rebuilt each deploy)

## Deployment

Automatic via GitHub Actions to GitHub Pages:

- **Production**: `https://chaerem.github.io/Glance/`
- **PR Previews**: `https://chaerem.github.io/Glance/pr-{number}/`

### Setup Required

For the first time setup, you must enable GitHub Pages:

1. Go to repository **Settings** → **Pages**
2. Set **Source** to: **GitHub Actions**
3. Enable **Actions permissions** (read/write) in Settings → Actions → General

See `.github/GITHUB_PAGES_SETUP.md` for detailed setup instructions and troubleshooting.

## Adding Features

1. Edit `server/simple-ui.html` or `admin.html`
2. Add mock handler to `mock-api.js` if new API endpoint
3. Rebuild: `npm run build:preview`

That's it!
