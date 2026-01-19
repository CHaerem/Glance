/**
 * Rotation Module
 * Handles collection rotation (cycling through images on the frame)
 */

// Rotation state
let rotationImages = new Set();
let rotationMode = 'random';
let rotationInterval = 300000000; // 5 min default
let rotationActive = false;

const intervalOptions = [
    { value: 300000000, label: '5 min' },
    { value: 900000000, label: '15 min' },
    { value: 1800000000, label: '30 min' },
    { value: 3600000000, label: '1 hour' }
];

/**
 * Load rotation status from server
 */
async function loadRotationStatus() {
    try {
        const response = await fetch('/api/playlist');
        const playlist = await response.json();

        // Sync local state with server
        rotationImages.clear();
        rotationActive = playlist.active || false;

        // Only populate rotation images if rotation is actually active
        // This keeps the UI clean - no "ghost" selections
        if (rotationActive && playlist.images) {
            playlist.images.forEach(id => rotationImages.add(id));
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
function updateRotationStatusBar() {
    const statusBar = document.getElementById('rotationStatus');
    const statusText = document.getElementById('rotationStatusText');

    // Only show status and filled buttons when rotation is actually active
    if (rotationImages.size >= 2 && rotationActive) {
        const modeText = rotationMode === 'random' ? 'shuffle' : 'in order';
        const intervalLabel = intervalOptions.find(opt => opt.value === rotationInterval)?.label || '5 min';
        statusText.textContent = `rotating ${rotationImages.size} images`;
        document.getElementById('rotationModeToggle').textContent = modeText;
        document.getElementById('rotationIntervalToggle').textContent = intervalLabel;
        statusBar.style.display = 'flex';
    } else {
        // If not active, clear the visual state - don't show "selected" state
        statusBar.style.display = 'none';
    }
}

/**
 * Toggle an image in/out of rotation
 * @param {string} imageId - The image ID to toggle
 */
async function toggleImageRotation(imageId) {
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
 * @param {boolean} active - Whether rotation should be active
 */
async function saveRotation(active = true) {
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
                    interval: rotationInterval
                })
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
function cycleRotationMode() {
    rotationMode = rotationMode === 'random' ? 'sequential' : 'random';
    document.getElementById('rotationModeToggle').textContent =
        rotationMode === 'random' ? 'shuffle' : 'in order';

    // Update server with new mode
    if (rotationImages.size >= 2) {
        saveRotation(true);
    }
}

/**
 * Cycle through rotation intervals
 */
function cycleRotationInterval() {
    const currentIndex = intervalOptions.findIndex(opt => opt.value === rotationInterval);
    const nextIndex = (currentIndex + 1) % intervalOptions.length;
    rotationInterval = intervalOptions[nextIndex].value;
    document.getElementById('rotationIntervalToggle').textContent =
        intervalOptions[nextIndex].label;

    // Update server with new interval
    if (rotationImages.size >= 2) {
        saveRotation(true);
    }
}

/**
 * Stop rotation completely
 */
async function stopRotation() {
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
 * @param {string} imageId - The image ID to check
 * @returns {boolean}
 */
function isInRotation(imageId) {
    return rotationImages.has(imageId);
}

/**
 * Get rotation state (for diagnostics)
 * @returns {Object}
 */
function getRotationState() {
    return {
        active: rotationActive,
        imageCount: rotationImages.size,
        mode: rotationMode,
        interval: rotationInterval,
        images: Array.from(rotationImages)
    };
}

// Export functions for use in main.js
window.Rotation = {
    load: loadRotationStatus,
    toggle: toggleImageRotation,
    save: saveRotation,
    cycleMode: cycleRotationMode,
    cycleInterval: cycleRotationInterval,
    stop: stopRotation,
    isInRotation: isInRotation,
    getState: getRotationState
};

// Also export individual functions for backward compatibility
window.loadRotationStatus = loadRotationStatus;
window.updateRotationStatusBar = updateRotationStatusBar;
window.toggleImageRotation = toggleImageRotation;
window.saveRotation = saveRotation;
window.cycleRotationMode = cycleRotationMode;
window.cycleRotationInterval = cycleRotationInterval;
window.stopRotation = stopRotation;
window.rotationImages = rotationImages;
