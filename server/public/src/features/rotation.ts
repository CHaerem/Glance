/**
 * Rotation Module
 * Handles collection rotation (cycling through images on the frame)
 */

import type { IntervalOption } from '../types';

// Rotation state
let rotationImages = new Set<string>();
let rotationMode: 'random' | 'sequential' = 'random';
let rotationInterval = 300000000; // 5 min default
let rotationActive = false;

const intervalOptions: IntervalOption[] = [
  { value: 300000000, label: '5 min' },
  { value: 900000000, label: '15 min' },
  { value: 1800000000, label: '30 min' },
  { value: 3600000000, label: '1 hour' },
];

/**
 * Load rotation status from server
 */
async function loadRotationStatus(): Promise<void> {
  try {
    const response = await fetch('/api/playlist');
    const playlist = await response.json();

    // Sync local state with server
    rotationImages.clear();
    rotationActive = playlist.active || false;

    // Only populate rotation images if rotation is actually active
    // This keeps the UI clean - no "ghost" selections
    if (rotationActive && playlist.images) {
      playlist.images.forEach((id: string) => rotationImages.add(id));
    }

    if (playlist.mode) rotationMode = playlist.mode;
    if (playlist.interval) rotationInterval = playlist.interval;

    updateRotationStatusBar();
  } catch (error) {
    console.error('Error loading rotation status:', error);
  }
}

/**
 * Update the rotation status bar in collection view
 */
function updateRotationStatusBar(): void {
  const statusBar = document.getElementById('rotationStatus');
  const statusText = document.getElementById('rotationStatusText');
  const modeToggle = document.getElementById('rotationModeToggle');
  const intervalToggle = document.getElementById('rotationIntervalToggle');

  // Only show status and filled buttons when rotation is actually active
  if (rotationImages.size >= 2 && rotationActive) {
    const modeText = rotationMode === 'random' ? 'shuffle' : 'in order';
    const intervalLabel = intervalOptions.find((opt) => opt.value === rotationInterval)?.label || '5 min';
    if (statusText) statusText.textContent = `rotating ${rotationImages.size} images`;
    if (modeToggle) modeToggle.textContent = modeText;
    if (intervalToggle) intervalToggle.textContent = intervalLabel;
    if (statusBar) statusBar.style.display = 'flex';
  } else {
    // If not active, clear the visual state - don't show "selected" state
    if (statusBar) statusBar.style.display = 'none';
  }
}

/**
 * Toggle an image in/out of rotation
 */
async function toggleImageRotation(imageId: string): Promise<void> {
  if (rotationImages.has(imageId)) {
    rotationImages.delete(imageId);
  } else {
    rotationImages.add(imageId);
  }

  // Update UI immediately
  const item = document.querySelector(`.collection-item[data-image-id="${imageId}"]`);
  if (item) {
    const btn = item.querySelector('.rotation-toggle-btn');
    if (rotationImages.has(imageId)) {
      item.classList.add('in-rotation');
      btn?.classList.add('in-rotation');
    } else {
      item.classList.remove('in-rotation');
      btn?.classList.remove('in-rotation');
    }
  }

  // Auto-start rotation when 2+ images selected
  if (rotationImages.size >= 2) {
    await saveRotation(true);
  } else if (rotationImages.size < 2) {
    // Stop rotation if less than 2 images
    await saveRotation(false);
  }

  updateRotationStatusBar();
}

/**
 * Save rotation to server
 */
async function saveRotation(active = true): Promise<void> {
  if (rotationImages.size < 2 && active) {
    return; // Need at least 2 images for rotation
  }

  try {
    if (rotationImages.size >= 2) {
      await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: Array.from(rotationImages),
          mode: rotationMode,
          interval: rotationInterval,
        }),
      });
      rotationActive = true;
    } else {
      // Clear rotation
      await fetch('/api/playlist', { method: 'DELETE' });
      rotationActive = false;
    }
  } catch (error) {
    console.error('Error saving rotation:', error);
  }
}

/**
 * Cycle through rotation modes
 */
function cycleRotationMode(): void {
  rotationMode = rotationMode === 'random' ? 'sequential' : 'random';
  const modeToggle = document.getElementById('rotationModeToggle');
  if (modeToggle) {
    modeToggle.textContent = rotationMode === 'random' ? 'shuffle' : 'in order';
  }

  // Update server with new mode
  if (rotationImages.size >= 2) {
    saveRotation(true);
  }
}

/**
 * Cycle through rotation intervals
 */
function cycleRotationInterval(): void {
  const currentIndex = intervalOptions.findIndex((opt) => opt.value === rotationInterval);
  const nextIndex = (currentIndex + 1) % intervalOptions.length;
  rotationInterval = intervalOptions[nextIndex]?.value ?? intervalOptions[0]!.value;
  const intervalToggle = document.getElementById('rotationIntervalToggle');
  if (intervalToggle) {
    intervalToggle.textContent = intervalOptions[nextIndex]?.label ?? '5 min';
  }

  // Update server with new interval
  if (rotationImages.size >= 2) {
    saveRotation(true);
  }
}

/**
 * Stop rotation completely
 */
async function stopRotation(): Promise<void> {
  try {
    await fetch('/api/playlist', { method: 'DELETE' });
    rotationImages.clear();
    rotationActive = false;
    updateRotationStatusBar();

    // Refresh collection display to update toggle buttons
    if (typeof window.displayMyCollection === 'function') {
      window.displayMyCollection();
    }
  } catch (error) {
    console.error('Error stopping rotation:', error);
  }
}

/**
 * Check if an image is in rotation
 */
function isInRotation(imageId: string): boolean {
  return rotationImages.has(imageId);
}

/**
 * Get rotation state (for diagnostics)
 */
function getRotationState() {
  return {
    active: rotationActive,
    imageCount: rotationImages.size,
    mode: rotationMode,
    interval: rotationInterval,
    images: Array.from(rotationImages),
  };
}

// Export module
export const Rotation = {
  load: loadRotationStatus,
  toggle: toggleImageRotation,
  save: saveRotation,
  cycleMode: cycleRotationMode,
  cycleInterval: cycleRotationInterval,
  stop: stopRotation,
  isInRotation,
  getState: getRotationState,
};

// Also export individual functions for backward compatibility
export {
  loadRotationStatus,
  updateRotationStatusBar,
  toggleImageRotation,
  saveRotation,
  cycleRotationMode,
  cycleRotationInterval,
  stopRotation,
  rotationImages,
};
