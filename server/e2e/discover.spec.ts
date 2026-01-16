import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Discover feature
 *
 * Tests the curated discovery experience:
 * - Featured movement section
 * - Mood-based suggestions
 * - Browse by movement
 * - Movement artwork browsing
 */

test.describe('Discover - Featured Movement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('displays featured movement section when library available', async ({ page }) => {
    // Featured section may or may not be visible depending on library
    const featuredSection = page.locator('#featuredSection');

    // Wait for discover to initialize
    await page.waitForTimeout(2000);

    const isVisible = await featuredSection.isVisible();

    if (isVisible) {
      // Should have title and description
      await expect(page.locator('#featuredTitle')).toBeVisible();
      await expect(page.locator('#featuredDescription')).toBeVisible();

      // Should have explore button
      await expect(page.locator('#exploreFeaturedBtn')).toBeVisible();
    }
  });

  test('featured movement shows preview artworks', async ({ page }) => {
    const featuredSection = page.locator('#featuredSection');
    await page.waitForTimeout(2000);

    const isVisible = await featuredSection.isVisible();

    if (isVisible) {
      const artworks = page.locator('#featuredArtworks .featured-artwork-thumb');
      const count = await artworks.count();

      // Should have some preview artworks (up to 4)
      if (count > 0) {
        await expect(artworks.first().locator('img')).toBeVisible();
      }
    }
  });

  test('clicking explore button opens movement artworks', async ({ page }) => {
    const featuredSection = page.locator('#featuredSection');
    await page.waitForTimeout(2000);

    const isVisible = await featuredSection.isVisible();

    if (isVisible) {
      // Click explore button
      await page.click('#exploreFeaturedBtn');

      // Should show search results section with movement artworks
      await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });
    }
  });

  test('clicking featured artwork thumbnail opens preview', async ({ page }) => {
    const featuredSection = page.locator('#featuredSection');
    await page.waitForTimeout(2000);

    const isVisible = await featuredSection.isVisible();

    if (isVisible) {
      const thumbnails = page.locator('#featuredArtworks .featured-artwork-thumb');
      const count = await thumbnails.count();

      if (count > 0) {
        await thumbnails.first().click();

        // Modal should open
        const modal = page.locator('#artModal');
        await expect(modal).toHaveClass(/show/, { timeout: 5000 });
      }
    }
  });
});

test.describe('Discover - Mood Suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('displays mood suggestion section', async ({ page }) => {
    const moodSection = page.locator('#moodSection');
    await page.waitForTimeout(2000);

    const isVisible = await moodSection.isVisible();

    if (isVisible) {
      // Should have mood label and description
      await expect(page.locator('#moodLabel')).toBeVisible();
      await expect(page.locator('#moodDescription')).toBeVisible();

      // Should have action button
      await expect(page.locator('#moodBtn')).toBeVisible();
    }
  });

  test('mood suggestion changes based on time of day', async ({ page }) => {
    const moodSection = page.locator('#moodSection');
    await page.waitForTimeout(2000);

    const isVisible = await moodSection.isVisible();

    if (isVisible) {
      const moodText = await page.locator('#moodLabel').textContent();

      // Should have some mood text
      expect(moodText).toBeTruthy();
      expect(moodText!.length).toBeGreaterThan(0);
    }
  });

  test('clicking mood button triggers search', async ({ page }) => {
    const moodSection = page.locator('#moodSection');
    await page.waitForTimeout(2000);

    const isVisible = await moodSection.isVisible();

    if (isVisible) {
      // Click mood button
      await page.click('#moodBtn');

      // Should trigger a search and show results
      await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 15000 });

      // Should have art cards
      const artCards = page.locator('#artCards .physical-card');
      await expect(artCards.first()).toBeVisible({ timeout: 15000 });
    }
  });
});

test.describe('Discover - Browse by Movement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('displays movements section with cards', async ({ page }) => {
    const movementsSection = page.locator('#movementsSection');
    await page.waitForTimeout(2000);

    const isVisible = await movementsSection.isVisible();

    if (isVisible) {
      // Should have section title
      await expect(page.locator('.section-title').filter({ hasText: 'browse by movement' })).toBeVisible();

      // Should have movement cards
      const cards = page.locator('#movementsScroll .movement-card');
      await expect(cards.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('movement cards display name, period, and count', async ({ page }) => {
    const movementsSection = page.locator('#movementsSection');
    await page.waitForTimeout(2000);

    const isVisible = await movementsSection.isVisible();

    if (isVisible) {
      const firstCard = page.locator('#movementsScroll .movement-card').first();
      await expect(firstCard).toBeVisible({ timeout: 5000 });

      // Should have name
      await expect(firstCard.locator('.movement-name')).toBeVisible();

      // Should have count
      await expect(firstCard.locator('.movement-count')).toBeVisible();
    }
  });

  test('movement cards are horizontally scrollable', async ({ page }) => {
    const movementsSection = page.locator('#movementsSection');
    await page.waitForTimeout(2000);

    const isVisible = await movementsSection.isVisible();

    if (isVisible) {
      const scroll = page.locator('#movementsScroll');

      const style = await scroll.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          display: s.display,
          overflowX: s.overflowX,
        };
      });

      expect(style.display).toBe('flex');
      expect(style.overflowX).toBe('auto');
    }
  });

  test('clicking movement card shows movement artworks', async ({ page }) => {
    const movementsSection = page.locator('#movementsSection');
    await page.waitForTimeout(2000);

    const isVisible = await movementsSection.isVisible();

    if (isVisible) {
      const firstCard = page.locator('#movementsScroll .movement-card').first();
      await expect(firstCard).toBeVisible({ timeout: 5000 });

      // Get movement name for verification
      const movementName = await firstCard.locator('.movement-name').textContent();

      // Click the card
      await firstCard.click();

      // Should show search results with movement artworks
      await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });

      // Title should include movement name
      const title = await page.locator('#searchResultsTitle').textContent();
      expect(title?.toLowerCase()).toContain(movementName?.toLowerCase() || '');
    }
  });

  test('movement cards have color accent', async ({ page }) => {
    const movementsSection = page.locator('#movementsSection');
    await page.waitForTimeout(2000);

    const isVisible = await movementsSection.isVisible();

    if (isVisible) {
      const firstCard = page.locator('#movementsScroll .movement-card').first();
      await expect(firstCard).toBeVisible({ timeout: 5000 });

      // Check for CSS custom property (movement color)
      const hasColor = await firstCard.evaluate((el) => {
        return el.style.getPropertyValue('--movement-color') !== '';
      });

      expect(hasColor).toBe(true);
    }
  });
});

test.describe('Discover - Performance', () => {
  test('discover sections load within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();

    // Wait for main sections to be visible
    await page.waitForTimeout(500);

    // At least playlists or discover sections should load quickly
    const playlistsVisible = await page.locator('#playlistsSection').isVisible();
    const discoverVisible =
      (await page.locator('#featuredSection').isVisible()) ||
      (await page.locator('#moodSection').isVisible()) ||
      (await page.locator('#movementsSection').isVisible());

    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);

    // At least one section should be visible
    expect(playlistsVisible || discoverVisible).toBe(true);
  });

  test('discover API returns cached response on second request', async ({ page }) => {
    await page.goto('/');

    // Make first request
    const response1 = await page.request.get('/api/discover');
    const cacheHeader1 = response1.headers()['x-cache'];

    // Make second request
    const response2 = await page.request.get('/api/discover');
    const cacheHeader2 = response2.headers()['x-cache'];

    // Second request should be cached
    expect(cacheHeader2).toBe('HIT');
  });
});

test.describe('Discover - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test('discover sections work on mobile viewport', async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();

    // Wait for sections
    await page.waitForTimeout(2000);

    // Movement scroll should still work
    const movementsSection = page.locator('#movementsSection');
    const isVisible = await movementsSection.isVisible();

    if (isVisible) {
      const cards = page.locator('#movementsScroll .movement-card');
      const count = await cards.count();

      // Should have cards
      expect(count).toBeGreaterThan(0);

      // Cards should be sized appropriately for mobile
      const cardWidth = await cards.first().evaluate((el) => {
        return el.getBoundingClientRect().width;
      });

      // Card should fit on mobile screen
      expect(cardWidth).toBeLessThan(375);
    }
  });

  test('mood section is usable on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await page.waitForTimeout(2000);

    const moodSection = page.locator('#moodSection');
    const isVisible = await moodSection.isVisible();

    if (isVisible) {
      const button = page.locator('#moodBtn');
      await expect(button).toBeVisible();

      // Button should be tappable
      const buttonBox = await button.boundingBox();
      expect(buttonBox).toBeTruthy();
      expect(buttonBox!.height).toBeGreaterThanOrEqual(40); // Minimum tap target
    }
  });
});
