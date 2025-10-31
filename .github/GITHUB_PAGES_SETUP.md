# GitHub Pages PR Preview Setup

This document explains how to enable and troubleshoot the GitHub Pages PR preview feature for this repository.

## Overview

The repository is configured to automatically deploy PR previews to GitHub Pages. Each pull request gets its own preview URL where you can test changes before merging.

**Preview URLs:**
- Main (production): `https://chaerem.github.io/Glance/`
- PR previews: `https://chaerem.github.io/Glance/pr-{number}/`

## Prerequisites

### 1. Enable GitHub Pages

GitHub Pages must be enabled in your repository settings:

1. Go to **Settings** → **Pages**
2. Under **Source**, select:
   - Source: **Deploy from a branch**
   - Branch: **gh-pages**
   - Folder: **/ (root)**
3. Click **Save**

### 2. Verify Workflow Permissions

Ensure GitHub Actions has the necessary permissions:

1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**
3. Click **Save**

## How It Works

### Workflow Triggers

The preview deployment workflow (`.github/workflows/preview-deploy.yml`) triggers on:

- **Pull Requests**: When opened, synchronized, reopened, or closed
- **Push to main**: When changes are merged
- **Manual**: Via workflow_dispatch
- **File changes**: Only when these files change:
  - `server/**/*.html`
  - `server/**/*.js`
  - `server/**/*.css`
  - `server/preview/**`

### Deployment Process

1. **Build**: Runs `npm run build:preview` to create static preview
   - Processes `server/simple-ui.html` → `preview/index.html`
   - Processes `server/admin.html` → `preview/admin.html`
   - Inlines mock API for standalone operation
2. **Deploy**: Pushes to `gh-pages` branch
   - Main branch → root directory (`/`)
   - PRs → subdirectory (`/pr-{number}/`)
3. **Comment**: Posts preview URL as PR comment
4. **Cleanup**: Removes PR preview when PR is closed

## Troubleshooting

### Preview Not Deploying

1. **Check if workflow ran**:
   - Go to **Actions** tab
   - Look for "Deploy Preview to GitHub Pages" workflow
   - Check if it ran and completed successfully

2. **Check workflow logs**:
   - Click on the workflow run
   - Expand each step to see detailed logs
   - Look for errors in "Deploy to GitHub Pages" step

3. **Verify GitHub Pages is enabled**:
   - Go to **Settings** → **Pages**
   - Ensure source is set to `gh-pages` branch
   - Check if there's a green success message with the URL

4. **Check workflow permissions**:
   - Workflow needs `contents: write`, `pull-requests: write`, and `pages: write`
   - These are configured in the workflow file

### Preview URL Returns 404

1. **Wait a few minutes**: GitHub Pages deployment can take 1-5 minutes
2. **Check gh-pages branch**:
   ```bash
   git fetch origin gh-pages
   git ls-tree -r --name-only origin/gh-pages
   ```
   - Verify `index.html` exists at root (main deployment)
   - Verify `pr-{number}/index.html` exists (PR preview)

3. **Verify deployment**:
   - Go to **Settings** → **Pages**
   - Look for "Your site is live at..." message
   - Try accessing the main URL first

### Workflow Fails

Common issues and solutions:

#### Error: "Resource not accessible by integration"
- **Cause**: Insufficient permissions
- **Solution**: Enable read/write permissions in Settings → Actions → General

#### Error: "refusing to allow a GitHub App to create or update workflow"
- **Cause**: Workflow file permissions
- **Solution**: Ensure "Allow GitHub Actions to create and approve pull requests" is enabled

#### Error: "Build failed"
- **Cause**: Missing dependencies or build errors
- **Solution**: Check build logs, ensure `npm ci` completed successfully

#### Error: "Deploy failed"
- **Cause**: Various deployment issues
- **Solution**: Check if gh-pages branch exists, verify peaceiris action configuration

## Manual Testing

To test the preview build locally:

```bash
cd server
npm install
npm run build:preview

# Serve locally
cd preview
python3 -m http.server 8080
# Open http://localhost:8080
```

## Force Re-deployment

If you need to force a re-deployment:

1. Go to **Actions** tab
2. Select "Deploy Preview to GitHub Pages" workflow
3. Click "Run workflow" button
4. Select branch and click "Run workflow"

## Architecture

The preview system uses a dual-mode approach:

- **Production mode**: HTML files connect to real backend API (server.js)
- **Preview mode**: HTML files auto-detect GitHub Pages and load inline mock API
- **Auto-detection**: Checks for `github.io` in hostname

This means the same HTML files work in both environments without modification.

## Multiple PR Previews

The workflow supports multiple concurrent PR previews:

- Each PR gets its own subdirectory: `/pr-{number}/`
- The `keep_files: true` setting preserves other PR directories
- When a PR is closed, only that PR's directory is removed
- Main deployment (root) is independent of PR previews

## Files Involved

- **Workflow**: `.github/workflows/preview-deploy.yml`
- **Build script**: `server/preview/build-preview.js`
- **Mock API**: `server/preview/mock-api.js`
- **Source HTML**: `server/simple-ui.html`, `server/admin.html`
- **Output HTML**: `server/preview/index.html`, `server/preview/admin.html`
- **Deployment branch**: `gh-pages` (auto-created)

## Support

If you're still having issues:

1. Check the workflow file: `.github/workflows/preview-deploy.yml`
2. Review recent workflow runs in the Actions tab
3. Verify all prerequisites are met
4. Check GitHub Pages status in Settings → Pages
5. Review this documentation for troubleshooting steps

## Updates and Maintenance

The workflow uses:

- `peaceiris/actions-gh-pages@v4`: Official GitHub Pages deployment action
- `actions/checkout@v4`: Latest checkout action
- `actions/setup-node@v4`: Latest Node.js setup

These are maintained versions and should work reliably. If you encounter issues, check if newer versions are available.
