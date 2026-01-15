import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Explore page
 *
 * Tests User Flow 1: Casual Browse
 * - Page loads with playlists and Today's Gallery
 * - Search functionality works
 * - Art cards display correctly
 * - Quick suggestions work
 */

test.describe('Explore Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Switch to explore mode
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('displays explore page with all core sections', async ({ page }) => {
    // Search input should be visible
    await expect(page.locator('#searchInput')).toBeVisible();
    await expect(page.locator('#randomArtBtn')).toBeVisible();

    // Playlists section should be visible
    await expect(page.locator('#playlistsSection')).toBeVisible();
    await expect(page.locator('.section-title').filter({ hasText: 'playlists' })).toBeVisible();

    // Today's Gallery section should be visible
    await expect(page.locator('#todaysGallerySection')).toBeVisible();
    await expect(page.locator('.section-title').filter({ hasText: "today's gallery" })).toBeVisible();

    // Quick suggestions should be visible
    await expect(page.locator('#quickSuggestions')).toBeVisible();
    await expect(page.locator('.suggestions-label')).toHaveText('or try:');
  });

  test('loads playlists in horizontal scroll', async ({ page }) => {
    // Wait for playlists to load
    const playlistScroll = page.locator('#playlistScroll');
    await expect(playlistScroll).toBeVisible();

    // Should have playlist cards
    const playlistCards = page.locator('.playlist-card');
    await expect(playlistCards.first()).toBeVisible({ timeout: 10000 });

    // Each card should have an image and name
    const firstCard = playlistCards.first();
    await expect(firstCard.locator('.playlist-card-image')).toBeVisible();
    await expect(firstCard.locator('.playlist-card-name')).toBeVisible();
  });

  test('loads Today\'s Gallery with artwork', async ({ page }) => {
    const gallery = page.locator('#todaysGallery');
    await expect(gallery).toBeVisible();

    // Wait for gallery artworks to load
    const artworks = page.locator('.gallery-artwork');
    await expect(artworks.first()).toBeVisible({ timeout: 10000 });

    // Each artwork should have an image
    const firstArtwork = artworks.first();
    await expect(firstArtwork.locator('img')).toBeVisible();
  });

  test('quick suggestion chips trigger search', async ({ page }) => {
    // Click on a suggestion chip
    const chip = page.locator('.suggestion-chip[data-query="impressionists"]');
    await expect(chip).toBeVisible();
    await chip.click();

    // Search results section should appear
    await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });

    // Should show results title
    await expect(page.locator('#searchResultsTitle')).toContainText('results');

    // Art cards should be populated
    const artCards = page.locator('#artCards .physical-card');
    await expect(artCards.first()).toBeVisible({ timeout: 15000 });
  });

  test('search input triggers search on Enter', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    await searchInput.fill('monet');
    await searchInput.press('Enter');

    // Search results section should appear
    await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });

    // Art cards should be populated
    const artCards = page.locator('#artCards .physical-card');
    await expect(artCards.first()).toBeVisible({ timeout: 15000 });
  });

  test('clear search button resets to default view', async ({ page }) => {
    // First trigger a search
    const chip = page.locator('.suggestion-chip[data-query="landscapes"]');
    await chip.click();
    await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });

    // Click clear button
    await page.click('#clearSearch');

    // Search results should be hidden
    await expect(page.locator('#searchResultsSection')).not.toBeVisible();

    // Default sections should be visible again
    await expect(page.locator('#playlistsSection')).toBeVisible();
    await expect(page.locator('#todaysGallerySection')).toBeVisible();
  });

  test('random button fetches random artwork', async ({ page }) => {
    await page.click('#randomArtBtn');

    // Should either show search results or open modal
    // The behavior depends on implementation
    await expect(
      page.locator('#searchResultsSection').or(page.locator('#artModal.show'))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Explore Page - Search Results Styling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('search results cards have correct styling', async ({ page }) => {
    // Trigger search
    await page.locator('.suggestion-chip[data-query="portraits"]').click();
    await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });

    // Wait for cards to load
    const artCards = page.locator('#artCards');
    await expect(artCards.locator('.physical-card').first()).toBeVisible({ timeout: 15000 });

    // Check grid layout
    const gridStyle = await artCards.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        gap: style.gap,
      };
    });

    expect(gridStyle.display).toBe('grid');
    // Gap should be set (not 0px or empty)
    expect(gridStyle.gap).not.toBe('0px');

    // Check individual card styling
    const firstCard = artCards.locator('.physical-card').first();
    const cardStyle = await firstCard.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        background: style.background,
        cursor: style.cursor,
      };
    });

    // Cards should have rounded corners
    expect(cardStyle.borderRadius).not.toBe('0px');
    // Cards should have shadow
    expect(cardStyle.boxShadow).not.toBe('none');
    // Cards should be clickable
    expect(cardStyle.cursor).toBe('pointer');
  });

  test('search results cards display artwork info correctly', async ({ page }) => {
    await page.locator('.suggestion-chip[data-query="dutch masters"]').click();
    await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });

    const firstCard = page.locator('#artCards .physical-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });

    // Card should have image container
    await expect(firstCard.locator('.physical-card-image')).toBeVisible();

    // Card should have metadata
    const meta = firstCard.locator('.physical-card-meta');
    await expect(meta).toBeVisible();

    // Should have title and artist
    await expect(meta.locator('.physical-card-title')).toBeVisible();
    await expect(meta.locator('.physical-card-artist')).toBeVisible();
  });

  test('search results grid is responsive', async ({ page, viewport }) => {
    await page.locator('.suggestion-chip[data-query="abstract"]').click();
    await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });

    const artCards = page.locator('#artCards');
    await expect(artCards.locator('.physical-card').first()).toBeVisible({ timeout: 15000 });

    // Check that grid adapts to viewport
    const gridStyle = await artCards.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.gridTemplateColumns;
    });

    // Should have multiple columns on desktop, fewer on mobile
    const columnCount = gridStyle.split(' ').length;

    if (viewport && viewport.width > 600) {
      expect(columnCount).toBeGreaterThan(1);
    }
  });
});
