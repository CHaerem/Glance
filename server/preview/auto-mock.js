/**
 * Auto-loading Mock API for Preview Mode
 *
 * This script automatically detects if the page is running in "preview mode"
 * (on GitHub Pages or localhost without a backend) and loads the mock API.
 *
 * NO DUAL DEVELOPMENT REQUIRED - Same HTML files work in both environments!
 */

(function() {
    'use strict';

    // Detect if we're in preview mode
    const isGitHubPages = window.location.hostname.includes('github.io');
    const isLocalPreview = window.location.protocol === 'file:' ||
                          (window.location.hostname === 'localhost' && !isBackendAvailable());

    // Quick check if backend is available
    async function isBackendAvailable() {
        try {
            const response = await fetch('/api/settings', {
                method: 'HEAD',
                signal: AbortSignal.timeout(1000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    // If not in preview mode, exit early
    if (!isGitHubPages && !isLocalPreview) {
        console.log('[AutoMock] Real backend detected, using production API');
        return;
    }

    console.log('[AutoMock] Preview mode detected, loading mock API...');

    // Load mock API script dynamically
    const script = document.createElement('script');
    script.src = 'mock-api.js';
    script.onload = () => {
        console.log('[AutoMock] Mock API loaded successfully');

        // Add preview banner if not already present
        if (!document.querySelector('.preview-banner')) {
            addPreviewBanner();
        }
    };
    script.onerror = () => {
        console.error('[AutoMock] Failed to load mock API');
    };
    document.head.appendChild(script);

    // Add preview mode banner
    function addPreviewBanner() {
        const banner = document.createElement('div');
        banner.className = 'preview-banner';
        banner.innerHTML = `
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
        `;
        document.body.insertBefore(banner, document.body.firstChild);
    }
})();
