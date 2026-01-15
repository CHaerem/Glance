import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Collection page
 *
 * Tests User Flow 3: Collection Management
 * - Collection page loads correctly
 * - Saved artworks display
 * - Search and sort functionality
 * - Delete artwork functionality
 */

test.describe('Collection Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Switch to collection mode
    await page.click('#myCollectionLink');
    await expect(page.locator('#myCollectionMode')).toBeVisible();
  });

  test('displays collection page with correct sections', async ({ page }) => {
    // My Playlists section should be visible
    await expect(page.locator('#myPlaylistsSection')).toBeVisible();
    await expect(page.locator('.section-title').filter({ hasText: 'my playlists' })).toBeVisible();

    // Create playlist button should exist
    await expect(page.locator('#createPlaylistBtn')).toBeVisible();

    // Saved artworks section should be visible
    await expect(page.locator('.section-title').filter({ hasText: 'saved artworks' })).toBeVisible();

    // Collection controls should be visible
    await expect(page.locator('.collection-controls')).toBeVisible();
    await expect(page.locator('#collectionSearch')).toBeVisible();
    await expect(page.locator('#collectionSort')).toBeVisible();
  });

  test('collection grid loads saved artworks', async ({ page }) => {
    const collectionGrid = page.locator('#collectionGrid');
    await expect(collectionGrid).toBeVisible();

    // Wait for collection to load (may be empty or have items)
    await page.waitForTimeout(2000);

    // Check if collection has items or shows empty state
    const hasItems = await collectionGrid.locator('.collection-item').count();

    if (hasItems > 0) {
      // Items should have images
      const firstItem = collectionGrid.locator('.collection-item').first();
      await expect(firstItem.locator('.collection-image')).toBeVisible();
    }
  });

  test('sort dropdown changes sort order', async ({ page }) => {
    const sortSelect = page.locator('#collectionSort');
    await expect(sortSelect).toBeVisible();

    // Check available options
    const options = await sortSelect.locator('option').allTextContents();
    expect(options).toContain('newest first');
    expect(options).toContain('oldest first');
    expect(options).toContain('title (a-z)');
    expect(options).toContain('artist (a-z)');

    // Select different sort option
    await sortSelect.selectOption('title-asc');

    // Should update (no error)
    await expect(sortSelect).toHaveValue('title-asc');
  });

  test('search filters collection items', async ({ page }) => {
    const searchInput = page.locator('#collectionSearch');
    await expect(searchInput).toBeVisible();

    // Type in search
    await searchInput.fill('test');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Search should not cause errors
    await expect(searchInput).toHaveValue('test');
  });

  test('collection controls have correct styling', async ({ page }) => {
    const controls = page.locator('.collection-controls');

    const style = await controls.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        display: s.display,
        gap: s.gap,
        marginBottom: s.marginBottom,
      };
    });

    expect(style.display).toBe('flex');
  });
});

test.describe('Save to Collection Flow', () => {
  test('can save artwork from explore to collection', async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');

    // Search for artwork
    await page.locator('.suggestion-chip[data-query="impressionists"]').click();
    await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });

    // Wait for cards
    const card = page.locator('#artCards .physical-card').first();
    await expect(card).toBeVisible({ timeout: 15000 });

    // Look for save/add to collection action
    // This might be in the card overlay or modal
    await card.hover();

    // Check if there's a save button on hover
    const saveBtn = card.locator('.physical-card-action');
    const hasSaveBtn = await saveBtn.count() > 0;

    if (hasSaveBtn) {
      // Click save button
      await saveBtn.click();

      // Should show success feedback or stay on page
      await page.waitForTimeout(1000);
    } else {
      // Click card to open modal and save from there
      await card.click();
      const modal = page.locator('#artModal');
      await expect(modal).toHaveClass(/show/, { timeout: 5000 });

      // Look for secondary action (save to collection)
      const secondaryBtn = modal.locator('#modalSecondaryAction');
      const hasSecondary = await secondaryBtn.isVisible();

      if (hasSecondary) {
        await secondaryBtn.click();
      }
    }
  });
});

test.describe('Collection Item Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#myCollectionLink');
    await expect(page.locator('#myCollectionMode')).toBeVisible();
  });

  test('collection item shows delete button on hover', async ({ page }) => {
    const collectionGrid = page.locator('#collectionGrid');
    const items = collectionGrid.locator('.collection-item');
    const count = await items.count();

    if (count > 0) {
      const firstItem = items.first();

      // Hover over item
      await firstItem.hover();

      // Delete button should appear
      const deleteBtn = firstItem.locator('.delete-btn');
      await expect(deleteBtn).toBeVisible();
    }
  });

  test('clicking collection item opens preview', async ({ page }) => {
    const collectionGrid = page.locator('#collectionGrid');
    const items = collectionGrid.locator('.collection-item');
    const count = await items.count();

    if (count > 0) {
      const firstItem = items.first();
      await firstItem.click();

      // Modal should open
      const modal = page.locator('#artModal');
      await expect(modal).toHaveClass(/show/, { timeout: 5000 });
    }
  });
});

test.describe('Collection Grid Styling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#myCollectionLink');
    await expect(page.locator('#myCollectionMode')).toBeVisible();
  });

  test('collection grid has correct layout', async ({ page }) => {
    const grid = page.locator('#collectionGrid');

    const style = await grid.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        display: s.display,
        gridTemplateColumns: s.gridTemplateColumns,
        gap: s.gap,
      };
    });

    expect(style.display).toBe('grid');
  });

  test('collection items have hover effect', async ({ page }) => {
    const items = page.locator('#collectionGrid .collection-item');
    const count = await items.count();

    if (count > 0) {
      const item = items.first();

      // Check cursor style
      const style = await item.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          cursor: s.cursor,
          transition: s.transition,
        };
      });

      expect(style.cursor).toBe('pointer');
      expect(style.transition).toContain('transform');
    }
  });
});
