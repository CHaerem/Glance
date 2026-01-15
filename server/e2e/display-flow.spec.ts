import { test, expect } from '@playwright/test';

/**
 * E2E tests for artwork display flow
 *
 * Tests User Flow 2: Guided Discovery
 * - Click artwork to preview in modal
 * - Modal displays correctly with controls
 * - Apply to display functionality
 */

test.describe('Art Preview Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('clicking gallery artwork opens preview modal', async ({ page }) => {
    // Wait for gallery to load
    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });

    // Click artwork
    await artwork.click();

    // Modal should appear
    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    // Modal should have image
    await expect(modal.locator('#modalImage')).toBeVisible();

    // Modal should have apply button
    await expect(modal.locator('#applyModalBtn')).toBeVisible();
  });

  test('clicking search result card opens preview modal', async ({ page }) => {
    // Trigger search
    await page.locator('.suggestion-chip[data-query="impressionists"]').click();
    await expect(page.locator('#searchResultsSection')).toBeVisible({ timeout: 10000 });

    // Wait for cards and click first one
    const card = page.locator('#artCards .physical-card').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();

    // Modal should appear
    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });
  });

  test('modal has correct layout and controls', async ({ page }) => {
    // Open modal via gallery artwork
    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });
    await artwork.click();

    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    // Check modal structure
    await expect(modal.locator('.modal-content')).toBeVisible();
    await expect(modal.locator('.modal-image-container')).toBeVisible();
    await expect(modal.locator('.modal-info')).toBeVisible();

    // Check control bar
    await expect(modal.locator('.image-control-bar')).toBeVisible();
    await expect(modal.locator('#orientationToggle')).toBeVisible();

    // Check close button
    await expect(modal.locator('#closeModalBtn')).toBeVisible();
  });

  test('close button closes the modal', async ({ page }) => {
    // Open modal
    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });
    await artwork.click();

    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    // Close modal
    await page.click('#closeModalBtn');

    // Modal should be hidden
    await expect(modal).not.toHaveClass(/show/);
  });

  test('clicking outside modal closes it', async ({ page }) => {
    // Open modal
    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });
    await artwork.click();

    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    // Click outside the modal content (on the overlay)
    await modal.click({ position: { x: 10, y: 10 } });

    // Modal should close
    await expect(modal).not.toHaveClass(/show/);
  });

  test('orientation toggle changes image aspect ratio', async ({ page }) => {
    // Open modal
    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });
    await artwork.click();

    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    const image = modal.locator('#modalImage');

    // Get initial state
    const hasLandscapeInitially = await image.evaluate((el) =>
      el.classList.contains('landscape')
    );

    // Toggle orientation
    await page.click('#orientationToggle');

    // Check orientation changed
    const hasLandscapeAfter = await image.evaluate((el) =>
      el.classList.contains('landscape')
    );

    expect(hasLandscapeAfter).toBe(!hasLandscapeInitially);
  });
});

test.describe('Apply to Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');
    await expect(page.locator('#exploreMode')).toBeVisible();
  });

  test('apply button sends artwork to display', async ({ page }) => {
    // Open modal
    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });
    await artwork.click();

    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    // Set up request interception to verify API call
    const applyPromise = page.waitForRequest((request) =>
      request.url().includes('/api/art/import') ||
      request.url().includes('/api/upload')
    );

    // Click apply button
    await page.click('#applyModalBtn');

    // Should have made API request
    const request = await applyPromise;
    expect(request).toBeTruthy();
  });

  test('display updates after applying artwork', async ({ page }) => {
    // First note the current display
    const currentPreview = page.locator('#currentImageThumb');

    // Open modal and apply
    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });
    await artwork.click();

    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    // Click apply
    await page.click('#applyModalBtn');

    // Wait for modal to close or show success
    await page.waitForTimeout(2000);

    // Current display preview should be visible
    await expect(page.locator('#currentImagePreview')).toHaveClass(/show/, { timeout: 10000 });
  });
});

test.describe('Modal Styling Verification', () => {
  test('modal image container maintains correct aspect ratio', async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');

    // Open modal
    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });
    await artwork.click();

    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    // Check image container styling
    const container = modal.locator('.modal-image-container');
    const containerStyle = await container.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        aspectRatio: style.aspectRatio,
        overflow: style.overflow,
        borderRadius: style.borderRadius,
      };
    });

    // Should have 3/4 aspect ratio for portrait
    expect(containerStyle.aspectRatio).toContain('3');
    expect(containerStyle.overflow).toBe('hidden');
  });

  test('frame overlay displays correctly', async ({ page }) => {
    await page.goto('/');
    await page.click('#exploreLink');

    const artwork = page.locator('.gallery-artwork').first();
    await expect(artwork).toBeVisible({ timeout: 10000 });
    await artwork.click();

    const modal = page.locator('#artModal');
    await expect(modal).toHaveClass(/show/, { timeout: 5000 });

    // Frame overlay should exist
    const overlay = modal.locator('.display-frame-overlay');
    await expect(overlay).toBeVisible();

    // Check overlay styling
    const overlayStyle = await overlay.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        position: style.position,
        pointerEvents: style.pointerEvents,
      };
    });

    expect(overlayStyle.position).toBe('absolute');
    expect(overlayStyle.pointerEvents).toBe('none');
  });
});
