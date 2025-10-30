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
 * Process HTML file: add auto-mock script
 */
function processHTML(inputFile, outputFile) {
    console.log(`Processing ${path.basename(inputFile)} -> ${path.basename(outputFile)}`);

    let html = fs.readFileSync(inputFile, 'utf-8');

    // Add auto-mock script at the beginning of <head>
    // This script will detect the environment and load mock API if needed
    html = html.replace(
        /<head>/,
        `<head>
    <!-- Auto-loading mock API for preview mode -->
    <script src="auto-mock.js"></script>`
    );

    // Write output
    fs.writeFileSync(outputFile, html, 'utf-8');
    console.log(`  ✓ Created ${path.basename(outputFile)}`);
}

/**
 * Main build function
 */
function build() {
    console.log('Building GitHub Pages preview...\n');

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
    console.log('  - Preview: Auto-loads mock API\n');
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
