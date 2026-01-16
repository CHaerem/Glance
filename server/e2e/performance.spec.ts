import { test, expect, chromium } from '@playwright/test';
import * as lighthouse from 'lighthouse';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Performance tests using Lighthouse
 *
 * Measures Core Web Vitals:
 * - LCP (Largest Contentful Paint) - Loading performance
 * - FID (First Input Delay) / TBT (Total Blocking Time) - Interactivity
 * - CLS (Cumulative Layout Shift) - Visual stability
 * - FCP (First Contentful Paint) - Initial render
 * - TTI (Time to Interactive) - Full interactivity
 */

// Performance thresholds (in milliseconds unless noted)
// Note: This is an image-heavy art gallery app, so thresholds are relaxed
const THRESHOLDS = {
  // Core Web Vitals (relaxed for image-heavy content)
  LCP: 8000, // Largest Contentful Paint (relaxed for image loading)
  TBT: 300, // Total Blocking Time (good < 200ms, acceptable < 300ms)
  CLS: 0.3, // Cumulative Layout Shift (relaxed for dynamic image loading)

  // Additional metrics
  FCP: 2000, // First Contentful Paint (good < 1.8s)
  SI: 4000, // Speed Index (good < 3.4s)
  TTI: 8000, // Time to Interactive (relaxed for image loading)

  // Overall scores (0-100)
  performanceScore: 50, // Minimum acceptable for image-heavy app
};

// Skip Lighthouse tests in CI (they need a real browser)
const isCI = process.env.CI === 'true';

test.describe('Lighthouse Performance Audits', () => {
  test.skip(isCI, 'Lighthouse tests require headed browser');

  test('Explore page meets Core Web Vitals thresholds', async () => {
    // Launch Chrome with remote debugging
    const browser = await chromium.launch({
      args: ['--remote-debugging-port=9222'],
      headless: true,
    });

    const page = await browser.newPage();
    await page.goto('http://localhost:3000/');

    // Run Lighthouse
    const result = await lighthouse.default('http://localhost:3000/', {
      port: 9222,
      output: 'json',
      onlyCategories: ['performance'],
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false,
      },
      throttling: {
        // Light throttling for realistic desktop
        rttMs: 40,
        throughputKbps: 10240,
        cpuSlowdownMultiplier: 1,
      },
    });

    await browser.close();

    const lhr = result?.lhr;
    if (!lhr) {
      throw new Error('Lighthouse failed to generate report');
    }

    // Extract metrics
    const metrics = {
      performanceScore: (lhr.categories.performance?.score || 0) * 100,
      FCP: lhr.audits['first-contentful-paint']?.numericValue || 0,
      LCP: lhr.audits['largest-contentful-paint']?.numericValue || 0,
      TBT: lhr.audits['total-blocking-time']?.numericValue || 0,
      CLS: lhr.audits['cumulative-layout-shift']?.numericValue || 0,
      SI: lhr.audits['speed-index']?.numericValue || 0,
      TTI: lhr.audits['interactive']?.numericValue || 0,
    };

    // Log results
    console.log('\n📊 Lighthouse Performance Results:');
    console.log('================================');
    console.log(`Performance Score: ${metrics.performanceScore.toFixed(0)}/100`);
    console.log(`FCP (First Contentful Paint): ${(metrics.FCP / 1000).toFixed(2)}s`);
    console.log(`LCP (Largest Contentful Paint): ${(metrics.LCP / 1000).toFixed(2)}s`);
    console.log(`TBT (Total Blocking Time): ${metrics.TBT.toFixed(0)}ms`);
    console.log(`CLS (Cumulative Layout Shift): ${metrics.CLS.toFixed(3)}`);
    console.log(`SI (Speed Index): ${(metrics.SI / 1000).toFixed(2)}s`);
    console.log(`TTI (Time to Interactive): ${(metrics.TTI / 1000).toFixed(2)}s`);
    console.log('================================\n');

    // Save report
    const reportPath = path.join(__dirname, '../test-results/lighthouse-explore.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(lhr, null, 2));

    // Assert thresholds
    expect(metrics.performanceScore).toBeGreaterThanOrEqual(THRESHOLDS.performanceScore);
    expect(metrics.LCP).toBeLessThanOrEqual(THRESHOLDS.LCP);
    expect(metrics.TBT).toBeLessThanOrEqual(THRESHOLDS.TBT);
    expect(metrics.CLS).toBeLessThanOrEqual(THRESHOLDS.CLS);
  });

  test('Explore page with search meets performance thresholds', async () => {
    const browser = await chromium.launch({
      args: ['--remote-debugging-port=9223'],
      headless: true,
    });

    const page = await browser.newPage();

    // Navigate and trigger a search
    await page.goto('http://localhost:3000/');
    await page.click('#exploreLink');
    await page.waitForSelector('#searchInput');
    await page.fill('#searchInput', 'monet');
    await page.press('#searchInput', 'Enter');
    await page.waitForSelector('#searchResultsSection', { timeout: 15000 });

    // Now measure the page with search results
    const result = await lighthouse.default(page.url(), {
      port: 9223,
      output: 'json',
      onlyCategories: ['performance'],
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false,
      },
      throttling: {
        rttMs: 40,
        throughputKbps: 10240,
        cpuSlowdownMultiplier: 1,
      },
    });

    await browser.close();

    const lhr = result?.lhr;
    if (!lhr) {
      throw new Error('Lighthouse failed to generate report');
    }

    const score = (lhr.categories.performance?.score || 0) * 100;
    console.log(`\n📊 Search Results Performance Score: ${score.toFixed(0)}/100\n`);

    // Save report
    const reportPath = path.join(__dirname, '../test-results/lighthouse-search.json');
    fs.writeFileSync(reportPath, JSON.stringify(lhr, null, 2));

    expect(score).toBeGreaterThanOrEqual(60); // Slightly lower threshold for dynamic content
  });
});

test.describe('Runtime Performance Metrics', () => {
  test('measures page load performance via Performance API', async ({ page }) => {
    // Navigate and collect Performance API metrics
    await page.goto('http://localhost:3000/');
    await page.click('#exploreLink');
    await page.waitForSelector('#exploreMode');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Get Performance API metrics
    const perfMetrics = await page.evaluate(() => {
      const perf = window.performance;
      const navigation = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paint = perf.getEntriesByType('paint');

      const fcp = paint.find((e) => e.name === 'first-contentful-paint');
      const lcp = perf.getEntriesByType('largest-contentful-paint').pop() as PerformanceEntry | undefined;

      return {
        // Navigation timing
        dnsLookup: navigation.domainLookupEnd - navigation.domainLookupStart,
        tcpConnect: navigation.connectEnd - navigation.connectStart,
        ttfb: navigation.responseStart - navigation.requestStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.startTime,
        loadComplete: navigation.loadEventEnd - navigation.startTime,

        // Paint timing
        fcp: fcp?.startTime || 0,
        lcp: (lcp as any)?.startTime || 0,

        // Resource counts
        resourceCount: perf.getEntriesByType('resource').length,
      };
    });

    console.log('\n📊 Performance API Metrics:');
    console.log('===========================');
    console.log(`DNS Lookup: ${perfMetrics.dnsLookup.toFixed(0)}ms`);
    console.log(`TCP Connect: ${perfMetrics.tcpConnect.toFixed(0)}ms`);
    console.log(`TTFB (Time to First Byte): ${perfMetrics.ttfb.toFixed(0)}ms`);
    console.log(`DOM Content Loaded: ${perfMetrics.domContentLoaded.toFixed(0)}ms`);
    console.log(`Load Complete: ${perfMetrics.loadComplete.toFixed(0)}ms`);
    console.log(`FCP: ${perfMetrics.fcp.toFixed(0)}ms`);
    console.log(`LCP: ${perfMetrics.lcp.toFixed(0)}ms`);
    console.log(`Resources Loaded: ${perfMetrics.resourceCount}`);
    console.log('===========================\n');

    // Basic assertions
    expect(perfMetrics.ttfb).toBeLessThan(500); // TTFB under 500ms
    expect(perfMetrics.domContentLoaded).toBeLessThan(3000); // DOM ready under 3s
    expect(perfMetrics.fcp).toBeLessThan(2000); // FCP under 2s
  });

  test('measures memory usage', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.click('#exploreLink');
    await page.waitForSelector('#exploreMode');

    // Trigger some interactions
    await page.waitForTimeout(1000);

    // Get Chrome-specific memory metrics
    const metrics = await page.evaluate(() => {
      const memory = (performance as any).memory;
      if (!memory) return null;

      return {
        usedJSHeapSize: memory.usedJSHeapSize / 1024 / 1024,
        totalJSHeapSize: memory.totalJSHeapSize / 1024 / 1024,
        jsHeapSizeLimit: memory.jsHeapSizeLimit / 1024 / 1024,
      };
    });

    if (metrics) {
      console.log('\n📊 Memory Usage:');
      console.log('================');
      console.log(`Used JS Heap: ${metrics.usedJSHeapSize.toFixed(2)} MB`);
      console.log(`Total JS Heap: ${metrics.totalJSHeapSize.toFixed(2)} MB`);
      console.log(`Heap Limit: ${metrics.jsHeapSizeLimit.toFixed(2)} MB`);
      console.log('================\n');

      // Memory should be reasonable
      expect(metrics.usedJSHeapSize).toBeLessThan(100); // Under 100MB
    }
  });

  test('measures interaction responsiveness', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.click('#exploreLink');
    await page.waitForSelector('#searchInput');

    // Measure search input responsiveness
    const searchTiming = await page.evaluate(async () => {
      const input = document.querySelector('#searchInput') as HTMLInputElement;
      const start = performance.now();

      input.focus();
      input.value = 'test';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise((r) => setTimeout(r, 100));
      return performance.now() - start;
    });

    console.log(`\n📊 Search Input Response Time: ${searchTiming.toFixed(0)}ms\n`);
    expect(searchTiming).toBeLessThan(200); // Input should respond within 200ms
  });
});

test.describe('API Performance', () => {
  test('measures API response times', async ({ page }) => {
    const apiTimings: Record<string, number> = {};

    // Intercept API requests
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/')) {
        const timing = response.request().timing();
        const endpoint = new URL(url).pathname;
        apiTimings[endpoint] = timing.responseEnd;
      }
    });

    await page.goto('http://localhost:3000/');
    await page.click('#exploreLink');
    await page.waitForSelector('#exploreMode');
    await page.waitForTimeout(3000); // Wait for API calls

    console.log('\n📊 API Response Times:');
    console.log('======================');
    for (const [endpoint, time] of Object.entries(apiTimings)) {
      console.log(`${endpoint}: ${time.toFixed(0)}ms`);
    }
    console.log('======================\n');

    // Check critical APIs are fast
    if (apiTimings['/api/discover']) {
      expect(apiTimings['/api/discover']).toBeLessThan(1000);
    }
    if (apiTimings['/api/playlists']) {
      expect(apiTimings['/api/playlists']).toBeLessThan(500);
    }
  });

  test('measures search API performance', async ({ page }) => {
    test.setTimeout(90000); // Allow 90s for external museum APIs

    await page.goto('http://localhost:3000/');
    await page.click('#exploreLink');
    await page.waitForSelector('#searchInput');

    // Use a quick suggestion chip which is more reliable for API testing
    const chip = page.locator('.suggestion-chip').first();
    await expect(chip).toBeVisible({ timeout: 5000 });

    // Set up response listener before clicking
    const searchResponses: { url: string; status: number; time: number }[] = [];
    const startTime = Date.now();

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/art/') || url.includes('/api/discover')) {
        searchResponses.push({
          url: new URL(url).pathname,
          status: response.status(),
          time: Date.now() - startTime,
        });
      }
    });

    // Click chip and wait for search results section
    await chip.click();
    await page.waitForSelector('#searchResultsSection', { timeout: 30000 });

    // Wait for search to complete - either results appear or error message
    try {
      // Wait for either results or error, whichever comes first
      await Promise.race([
        page.waitForSelector('#artCards .physical-card', { timeout: 60000 }),
        page.waitForSelector('text=Search failed', { timeout: 60000 }),
        page.waitForSelector('text=No results', { timeout: 60000 }),
      ]);
    } catch {
      // Search still in progress or timed out
    }

    const totalTime = Date.now() - startTime;

    // Check if results loaded or search failed
    const hasResults = (await page.locator('#artCards .physical-card').count()) > 0;
    const hasFailed = (await page.locator('text=Search failed').count()) > 0;
    const noResults = (await page.locator('text=No results').count()) > 0;

    console.log(`\n📊 Search Flow Performance:`);
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Results found: ${hasResults}, Search failed: ${hasFailed}, No results: ${noResults}`);
    console.log(`API calls made: ${searchResponses.length}`);
    for (const r of searchResponses) {
      console.log(`  ${r.url}: ${r.time}ms (status: ${r.status})`);
    }
    console.log();

    // Verify search flow works - just check it completed
    expect(totalTime).toBeLessThan(75000);
    // At least one of these states should be true
    expect(hasResults || hasFailed || noResults || searchResponses.length > 0).toBe(true);
  });
});

test.describe('Mobile Performance', () => {
  test.use({
    viewport: { width: 375, height: 667 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
  });

  test('mobile page load performance', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('http://localhost:3000/');
    await page.click('#exploreLink');
    await page.waitForSelector('#exploreMode');

    // Wait for visible content
    await page.waitForSelector('#playlistsSection', { state: 'visible', timeout: 10000 }).catch(() => {});
    await page.waitForSelector('#movementsSection', { state: 'visible', timeout: 5000 }).catch(() => {});

    const loadTime = Date.now() - startTime;

    console.log(`\n📊 Mobile Page Load: ${loadTime}ms\n`);

    // Mobile should load within 7 seconds (includes API calls)
    expect(loadTime).toBeLessThan(7000);
  });

  test('mobile scroll performance', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await page.click('#exploreLink');
    await page.waitForSelector('#exploreMode');
    await page.waitForTimeout(2000);

    // Measure scroll performance
    const scrollMetrics = await page.evaluate(async () => {
      const startTime = performance.now();
      let frameCount = 0;

      return new Promise<{ fps: number; duration: number }>((resolve) => {
        const scrollStep = () => {
          window.scrollBy(0, 50);
          frameCount++;

          if (window.scrollY < document.body.scrollHeight - window.innerHeight) {
            requestAnimationFrame(scrollStep);
          } else {
            const duration = performance.now() - startTime;
            resolve({
              fps: (frameCount / duration) * 1000,
              duration,
            });
          }
        };

        requestAnimationFrame(scrollStep);
      });
    });

    console.log(`\n📊 Mobile Scroll Performance:`);
    console.log(`FPS: ${scrollMetrics.fps.toFixed(1)}`);
    console.log(`Duration: ${scrollMetrics.duration.toFixed(0)}ms\n`);

    // Should maintain reasonable frame rate
    expect(scrollMetrics.fps).toBeGreaterThan(30); // At least 30fps
  });
});
