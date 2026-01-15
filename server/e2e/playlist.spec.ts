import { test, expect } from '@playwright/test';

/**
 * E2E tests for Playlist functionality
 *
 * Tests User Flow 4: Playlist Browsing
 * - Playlist cards display correctly
 * - Clicking playlist opens playlist view
 * - Play all functionality
 */

test.describe('Playlist Browsing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('playlist cards load and display correctly', async ({ page }) => {
    const playlistScroll = page.locator('#playlistScroll');
    await expect(playlistScroll).toBeVisible();

    // Wait for playlists to load
    const cards = playlistScroll.locator('.playlist-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    // Each card should have required elements
    const firstCard = cards.first();
    await expect(firstCard.locator('.playlist-card-image')).toBeVisible();
    await expect(firstCard.locator('.playlist-card-name')).toBeVisible();
  });

  test('clicking playlist card opens playlist view', async ({ page }) => {
    const playlistScroll = page.locator('#playlistScroll');
    const cards = playlistScroll.locator('.playlist-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    // Click first playlist
    await cards.first().click();

    // Playlist view should appear
    const playlistView = page.locator('#playlistViewSection');
    await expect(playlistView).toBeVisible({ timeout: 10000 });

    // Should have back button
    await expect(page.locator('#closePlaylistView')).toBeVisible();

    // Should have playlist title
    await expect(page.locator('#playlistViewTitle')).toBeVisible();

    // Should load artworks
    const artworks = page.locator('#playlistArtCards .physical-card');
    await expect(artworks.first()).toBeVisible({ timeout: 15000 });
  });

  test('back button returns to explore view', async ({ page }) => {
    // Open playlist
    const cards = page.locator('#playlistScroll .playlist-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    await cards.first().click();

    await expect(page.locator('#playlistViewSection')).toBeVisible({ timeout: 10000 });

    // Click back
    await page.click('#closePlaylistView');

    // Should return to explore view
    await expect(page.locator('#playlistViewSection')).not.toBeVisible();
    await expect(page.locator('#playlistsSection')).toBeVisible();
  });

  test('play all button is visible in playlist view', async ({ page }) => {
    // Open playlist
    const cards = page.locator('#playlistScroll .playlist-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    await cards.first().click();

    await expect(page.locator('#playlistViewSection')).toBeVisible({ timeout: 10000 });

    // Play button should be visible
    await expect(page.locator('#playPlaylistBtn')).toBeVisible();
  });
});

test.describe('Playlist Card Styling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('playlist cards have correct dimensions', async ({ page }) => {
    const cards = page.locator('#playlistScroll .playlist-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    const style = await cards.first().evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        width: s.width,
        cursor: s.cursor,
        flexShrink: s.flexShrink,
      };
    });

    expect(style.cursor).toBe('pointer');
    expect(style.flexShrink).toBe('0');
  });

  test('playlist card image has correct styling', async ({ page }) => {
    const cards = page.locator('#playlistScroll .playlist-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    const imageStyle = await cards.first().locator('.playlist-card-image').evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        width: s.width,
        height: s.height,
        borderRadius: s.borderRadius,
        objectFit: s.objectFit,
      };
    });

    // Should be square
    expect(imageStyle.width).toBe(imageStyle.height);
    // Should have rounded corners
    expect(imageStyle.borderRadius).not.toBe('0px');
  });

  test('playlist scroll container allows horizontal scrolling', async ({ page }) => {
    const container = page.locator('.playlist-scroll-container');
    await expect(container).toBeVisible();

    const scrollStyle = await page.locator('#playlistScroll').evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        display: s.display,
        overflowX: s.overflowX,
        gap: s.gap,
      };
    });

    expect(scrollStyle.display).toBe('flex');
    expect(scrollStyle.overflowX).toBe('auto');
  });
});

test.describe('Playlist View Artworks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();

    // Open first playlist
    const cards = page.locator('#playlistScroll .playlist-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    await cards.first().click();
    await expect(page.locator('#playlistViewSection')).toBeVisible({ timeout: 10000 });
  });

  test('playlist artworks display in grid', async ({ page }) => {
    const artCards = page.locator('#playlistArtCards');
    await expect(artCards.locator('.physical-card').first()).toBeVisible({ timeout: 15000 });

    const gridStyle = await artCards.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        display: s.display,
        gridTemplateColumns: s.gridTemplateColumns,
      };
    });

    expect(gridStyle.display).toBe('grid');
  });

  test('clicking playlist artwork opens preview', async ({ page }) => {
    const artwork = page.locator('#playlistArtCards .physical-card').first();
    await expect(artwork).toBeVisible({ timeout: 15000 });

    await artwork.click();

    // Modal should open
    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });
  });
});

test.describe('Today\'s Gallery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('today\'s gallery displays artwork grid', async ({ page }) => {
    const gallery = page.locator('#todaysGallery');
    await expect(gallery).toBeVisible();

    // Check grid layout
    const style = await gallery.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        display: s.display,
        gridTemplateColumns: s.gridTemplateColumns,
        gap: s.gap,
      };
    });

    expect(style.display).toBe('grid');
  });

  test('gallery artworks have hover info overlay', async ({ page }) => {
    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });

    // Hover over artwork
    await artwork.hover();

    // Info overlay should appear
    const info = artwork.locator('.gallery-artwork-info');
    await expect(info).toBeVisible();
  });

  test('refresh button refreshes gallery', async ({ page }) => {
    const gallery = page.locator('#todaysGallery');
    await expect(gallery.locator('.gallery-artwork').first()).toBeVisible({ timeout: 10000 });

    // Click refresh
    await page.click('#refreshGallery');

    // Gallery should still have artworks (may update)
    await expect(gallery.locator('.gallery-artwork').first()).toBeVisible({ timeout: 10000 });
  });

  test('play gallery button exists', async ({ page }) => {
    await expect(page.locator('#playGallery')).toBeVisible();
  });
});
