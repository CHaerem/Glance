#!/usr/bin/env node
/**
 * Build script for GitHub Pages preview
 *
 * This script simply copies the HTML files and adds auto-mock.js
 * The same files work in both production and preview modes!
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PREVIEW_DIR = __dirname;

/**
 * Process HTML file: add auto-mock script and fix links for static hosting
 */
function processHTML(inputFile, outputFile) {
    console.log(`Processing ${path.basename(inputFile)} -> ${path.basename(outputFile)}`);

    let html = fs.readFileSync(inputFile, 'utf-8');

    // Read mock API script to inline it
    const mockAPIScript = fs.readFileSync(path.join(PREVIEW_DIR, 'mock-api.js'), 'utf-8');

    // Inline mock API script at the beginning of <head>
    // Must be synchronous to intercept fetch before page JS runs
    html = html.replace(
        /<head>/,
        `<head>
    <!-- Inline mock API for preview mode (must load synchronously) -->
    <script>
        // Auto-detect preview mode
        (function() {
            const isGitHubPages = window.location.hostname.includes('github.io');
            const isLocalFile = window.location.protocol === 'file:';

            if (!isGitHubPages && !isLocalFile) {
                console.log('[Preview] Production mode - using real backend');
                return;
            }

            console.log('[Preview] Mock mode activated');

            // Load mock API immediately (synchronously)
            ${mockAPIScript}

            // Add preview banner
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', addBanner);
            } else {
                addBanner();
            }

            function addBanner() {
                if (document.querySelector('.preview-banner')) return;

                const banner = document.createElement('div');
                banner.className = 'preview-banner';
                banner.innerHTML = \`
                    <style>
                        .preview-banner {
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            padding: 8px 16px;
                            text-align: center;
                            z-index: 10000;
                            font-size: 0.85rem;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        }
                        .preview-banner a {
                            color: white;
                            text-decoration: underline;
                        }
                        body {
                            padding-top: 36px !important;
                        }
                    </style>
                    <strong>🚀 Preview Mode</strong> &nbsp;|&nbsp; This is a demo with mocked API &nbsp;|&nbsp; <a href="https://github.com/CHaerem/Glance" target="_blank">View on GitHub</a>
                \`;
                document.body.insertBefore(banner, document.body.firstChild);
            }
        })();
    </script>`
    );

    // Fix links for static hosting (GitHub Pages)
    // Convert server routes to .html files
    html = html.replace(/href="\/admin"/g, 'href="admin.html"');
    html = html.replace(/href="\/"/g, 'href="index.html"');

    // Write output
    fs.writeFileSync(outputFile, html, 'utf-8');
    console.log(`  ✓ Created ${path.basename(outputFile)}`);
}

/**
 * Main build function
 */
function build() {
    const basePath = process.env.BASE_PATH || '/';
    console.log('Building GitHub Pages preview...\n');
    console.log(`Base path: ${basePath}`);

    // Ensure preview directory exists
    if (!fs.existsSync(PREVIEW_DIR)) {
        fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    }

    // Process simple-ui.html -> index.html
    processHTML(
        path.join(ROOT_DIR, 'simple-ui.html'),
        path.join(PREVIEW_DIR, 'index.html')
    );

    // Process admin.html -> admin.html
    processHTML(
        path.join(ROOT_DIR, 'admin.html'),
        path.join(PREVIEW_DIR, 'admin.html')
    );

    console.log('\n✨ Preview build complete!\n');
    console.log('The same HTML files work in both environments:');
    console.log('  - Production: Uses real backend API');
    console.log('  - Preview: Auto-loads mock API');
    console.log('  - Subdirectories: Works in /pr-xxx/ paths\n');
    console.log('All assets are inlined - no external dependencies!\n');
    console.log('To test locally:');
    console.log('  cd preview');
    console.log('  python3 -m http.server 8080');
    console.log('  # Open http://localhost:8080\n');
}

// Run build
if (require.main === module) {
    build();
}

module.exports = { build };
