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
   - Source: **GitHub Actions**
3. The configuration will be handled automatically by the workflow

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
2. **Merge with existing content**: For PR previews, fetches existing deployments to preserve other PRs
   - Main branch → root directory (`/`)
   - PRs → subdirectory (`/pr-{number}/`)
3. **Deploy**: Uses official GitHub Pages Actions to deploy
   - `actions/configure-pages` - Configures deployment
   - `actions/upload-pages-artifact` - Uploads built content
   - `actions/deploy-pages` - Deploys to GitHub Pages
4. **Comment**: Posts preview URL as PR comment
5. **Cleanup**: Removes PR preview when PR is closed and redeploys

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
   - Ensure source is set to **GitHub Actions**
   - Check if there's a green success message with the URL

4. **Check workflow permissions**:
   - Workflow needs `pages: write`, `id-token: write`, and `pull-requests: write`
   - These are configured in the workflow file
   - Also verify Actions permissions in Settings → Actions → General

### Preview URL Returns 404

1. **Wait a few minutes**: GitHub Pages deployment can take 2-5 minutes to propagate
2. **Check deployment status**:
   - Go to **Actions** tab → **"deploy-pages"** workflow
   - Verify it completed successfully
   - Check the deployment URL in the workflow summary

3. **Verify deployment**:
   - Go to **Settings** → **Pages**
   - Look for "Your site is live at..." message with a green checkmark
   - Try accessing the main URL first (https://yourusername.github.io/Glance/)
   - Then try the PR preview URL

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

#### Error: "Deploy failed" or "Artifact upload failed"
- **Cause**: GitHub Pages environment not configured or permissions issues
- **Solution**:
  - Verify GitHub Pages source is set to "GitHub Actions"
  - Check that `pages: write` and `id-token: write` permissions are set
  - Ensure the `github-pages` environment exists (created automatically on first run)

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

The preview system uses several key approaches:

### Dual-Mode HTML Files
- **Production mode**: HTML files connect to real backend API (server.js)
- **Preview mode**: HTML files auto-detect GitHub Pages and load inline mock API
- **Auto-detection**: Checks for `github.io` in hostname
- **Result**: Same HTML files work in both environments without modification

### GitHub Actions Deployment
- Uses official GitHub Pages Actions (modern, flexible approach)
- Deploys entire site structure on each push
- For PR previews, merges new content with existing content from gh-pages branch
- Preserves other PR previews during deployment
- Automatically cleans up when PRs are closed

## Multiple PR Previews

The workflow supports multiple concurrent PR previews:

- Each PR gets its own subdirectory: `/pr-{number}/`
- The `keep_files: true` setting preserves other PR directories
- When a PR is closed, only that PR's directory is removed
- Main deployment (root) is independent of PR previews

## Files Involved

- **Workflow**: `.github/workflows/preview-deploy.yml` - Main deployment workflow
- **Build script**: `server/preview/build-preview.js` - Builds static preview files
- **Mock API**: `server/preview/mock-api.js` - Browser-based mock API
- **Source HTML**: `server/simple-ui.html`, `server/admin.html` - Original HTML files
- **Output HTML**: `server/preview/index.html`, `server/preview/admin.html` - Generated preview files
- **Cache branch**: `gh-pages` - Used to store existing deployments (preserves PR previews)
- **Deployment**: GitHub Pages environment (configured via Actions)

## Support

If you're still having issues:

1. Check the workflow file: `.github/workflows/preview-deploy.yml`
2. Review recent workflow runs in the Actions tab
3. Verify all prerequisites are met
4. Check GitHub Pages status in Settings → Pages
5. Review this documentation for troubleshooting steps

## Updates and Maintenance

The workflow uses official GitHub Actions:

- `actions/configure-pages@v4`: Configures GitHub Pages deployment
- `actions/upload-pages-artifact@v3`: Uploads built artifacts
- `actions/deploy-pages@v4`: Deploys to GitHub Pages
- `actions/checkout@v4`: Code checkout
- `actions/setup-node@v4`: Node.js environment setup
- `actions/github-script@v7`: PR commenting

These are the official, maintained actions for GitHub Pages deployment using the "GitHub Actions" source method. This is the modern, recommended approach with better support and flexibility than branch-based deployment.
