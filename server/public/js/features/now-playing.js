/**
 * Now Playing Bar Module
 * Spotify-like playback UI for rotating through artworks
 */

// Now Playing state
let nowPlayingState = {
    active: false,
    paused: false,
    artworks: [],
    currentIndex: 0,
    playlistName: '',
    shuffle: false,
    interval: 300000, // 5 minutes default
    timer: null
};

const npIntervalOptions = [
    { value: 60000, label: '1m' },
    { value: 300000, label: '5m' },
    { value: 900000, label: '15m' },
    { value: 1800000, label: '30m' },
    { value: 3600000, label: '1h' }
];

/**
 * Initialize Now Playing bar event listeners
 */
function initNowPlayingBar() {
    document.getElementById('nowPlayingToggle')?.addEventListener('click', toggleNowPlaying);
    document.getElementById('nowPlayingPrev')?.addEventListener('click', nowPlayingPrev);
    document.getElementById('nowPlayingNext')?.addEventListener('click', nowPlayingNext);
    document.getElementById('nowPlayingShuffle')?.addEventListener('click', toggleNowPlayingShuffle);
    document.getElementById('nowPlayingInterval')?.addEventListener('click', cycleNowPlayingInterval);
    document.getElementById('nowPlayingExpand')?.addEventListener('click', expandNowPlaying);
    document.getElementById('nowPlayingClose')?.addEventListener('click', stopNowPlaying);
}

/**
 * Start playing a playlist/collection
 * @param {Array} artworks - Array of artwork objects
 * @param {string} playlistName - Display name for the playlist
 */
function startNowPlaying(artworks, playlistName = 'playlist') {
    if (!artworks || artworks.length === 0) return;

    nowPlayingState.artworks = [...artworks];
    nowPlayingState.playlistName = playlistName;
    nowPlayingState.currentIndex = 0;
    nowPlayingState.active = true;
    nowPlayingState.paused = false;

    // Shuffle if enabled
    if (nowPlayingState.shuffle) {
        shuffleNowPlayingQueue();
    }

    // Display first artwork
    displayNowPlayingCurrent();
    showNowPlayingBar();
    startNowPlayingTimer();
}

/**
 * Show the Now Playing bar with animation
 */
function showNowPlayingBar() {
    const bar = document.getElementById('nowPlayingBar');
    if (bar) {
        bar.style.display = 'flex';
        // Add class for animation
        setTimeout(() => {
            bar.classList.add('visible');
            document.body.classList.add('now-playing-visible');
        }, 10);
    }
}

/**
 * Hide the Now Playing bar with animation
 */
function hideNowPlayingBar() {
    const bar = document.getElementById('nowPlayingBar');
    if (bar) {
        bar.classList.remove('visible');
        document.body.classList.remove('now-playing-visible');
        setTimeout(() => bar.style.display = 'none', 300);
    }
}

/**
 * Update the Now Playing bar UI
 */
function updateNowPlayingBar() {
    if (!nowPlayingState.active || nowPlayingState.artworks.length === 0) return;

    const current = nowPlayingState.artworks[nowPlayingState.currentIndex];
    if (!current) return;

    const thumb = document.getElementById('nowPlayingThumb');
    const title = document.getElementById('nowPlayingTitle');
    const subtitle = document.getElementById('nowPlayingSubtitle');
    const toggleBtn = document.getElementById('nowPlayingToggle');
    const shuffleBtn = document.getElementById('nowPlayingShuffle');
    const intervalBtn = document.getElementById('nowPlayingInterval');

    if (thumb) {
        thumb.src = current.thumbnailUrl || current.thumbnail || current.imageUrl || '';
    }
    if (title) {
        title.textContent = current.title || 'Untitled';
    }
    if (subtitle) {
        const artist = current.artist || '';
        subtitle.textContent = artist ? `${artist} · ${nowPlayingState.playlistName}` : nowPlayingState.playlistName;
    }
    if (toggleBtn) {
        toggleBtn.textContent = nowPlayingState.paused ? '▶' : '⏸';
        toggleBtn.title = nowPlayingState.paused ? 'Play' : 'Pause';
    }
    if (shuffleBtn) {
        shuffleBtn.classList.toggle('active', nowPlayingState.shuffle);
    }
    if (intervalBtn) {
        const opt = npIntervalOptions.find(o => o.value === nowPlayingState.interval);
        intervalBtn.textContent = opt ? opt.label : '5m';
    }
}

/**
 * Display the current artwork on the frame
 */
async function displayNowPlayingCurrent() {
    if (!nowPlayingState.active || nowPlayingState.artworks.length === 0) return;

    const current = nowPlayingState.artworks[nowPlayingState.currentIndex];
    if (!current) return;

    updateNowPlayingBar();

    // Import/display the artwork
    try {
        const defaultOrientation = window.defaultOrientation || 'portrait';
        const response = await fetch('/api/art/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl: current.imageUrl,
                title: current.title,
                artist: current.artist,
                rotation: defaultOrientation === 'landscape' ? 90 : 0
            })
        });

        if (response.ok) {
            // Refresh the current display preview (force refresh since we just changed it)
            if (typeof window.loadCurrentDisplay === 'function') {
                setTimeout(() => window.loadCurrentDisplay(true), 2000);
            }
        }
    } catch (error) {
        console.error('Failed to display artwork:', error);
    }
}

/**
 * Toggle play/pause
 */
function toggleNowPlaying() {
    if (!nowPlayingState.active) return;

    nowPlayingState.paused = !nowPlayingState.paused;

    if (nowPlayingState.paused) {
        stopNowPlayingTimer();
    } else {
        startNowPlayingTimer();
    }

    updateNowPlayingBar();
}

/**
 * Go to previous artwork
 */
function nowPlayingPrev() {
    if (!nowPlayingState.active || nowPlayingState.artworks.length === 0) return;

    nowPlayingState.currentIndex--;
    if (nowPlayingState.currentIndex < 0) {
        nowPlayingState.currentIndex = nowPlayingState.artworks.length - 1;
    }

    displayNowPlayingCurrent();
    resetNowPlayingTimer();
}

/**
 * Go to next artwork
 */
function nowPlayingNext() {
    if (!nowPlayingState.active || nowPlayingState.artworks.length === 0) return;

    nowPlayingState.currentIndex++;
    if (nowPlayingState.currentIndex >= nowPlayingState.artworks.length) {
        nowPlayingState.currentIndex = 0;
    }

    displayNowPlayingCurrent();
    resetNowPlayingTimer();
}

/**
 * Toggle shuffle mode
 */
function toggleNowPlayingShuffle() {
    nowPlayingState.shuffle = !nowPlayingState.shuffle;

    if (nowPlayingState.shuffle && nowPlayingState.active) {
        // Reshuffle remaining items
        shuffleNowPlayingQueue();
    }

    updateNowPlayingBar();
}

/**
 * Shuffle the queue (keeping current item at position 0)
 */
function shuffleNowPlayingQueue() {
    if (nowPlayingState.artworks.length <= 1) return;

    const current = nowPlayingState.artworks[nowPlayingState.currentIndex];
    const others = nowPlayingState.artworks.filter((_, i) => i !== nowPlayingState.currentIndex);

    // Fisher-Yates shuffle
    for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
    }

    nowPlayingState.artworks = [current, ...others];
    nowPlayingState.currentIndex = 0;
}

/**
 * Cycle through interval options
 */
function cycleNowPlayingInterval() {
    const currentIdx = npIntervalOptions.findIndex(o => o.value === nowPlayingState.interval);
    const nextIdx = (currentIdx + 1) % npIntervalOptions.length;
    nowPlayingState.interval = npIntervalOptions[nextIdx].value;

    updateNowPlayingBar();
    resetNowPlayingTimer();
}

/**
 * Start the auto-advance timer
 */
function startNowPlayingTimer() {
    if (nowPlayingState.timer) {
        clearInterval(nowPlayingState.timer);
    }

    nowPlayingState.timer = setInterval(() => {
        if (!nowPlayingState.paused) {
            nowPlayingNext();
        }
    }, nowPlayingState.interval);
}

/**
 * Stop the timer
 */
function stopNowPlayingTimer() {
    if (nowPlayingState.timer) {
        clearInterval(nowPlayingState.timer);
        nowPlayingState.timer = null;
    }
}

/**
 * Reset the timer (restart countdown)
 */
function resetNowPlayingTimer() {
    if (!nowPlayingState.paused) {
        startNowPlayingTimer();
    }
}

/**
 * Expand to full modal view
 */
function expandNowPlaying() {
    if (!nowPlayingState.active || nowPlayingState.artworks.length === 0) return;

    const current = nowPlayingState.artworks[nowPlayingState.currentIndex];
    if (current && typeof window.openArtPreview === 'function') {
        window.openArtPreview(current);
    }
}

/**
 * Stop Now Playing completely
 */
function stopNowPlaying() {
    nowPlayingState.active = false;
    nowPlayingState.paused = false;
    nowPlayingState.artworks = [];
    nowPlayingState.currentIndex = 0;
    stopNowPlayingTimer();
    hideNowPlayingBar();
}

/**
 * Check if Now Playing is active
 * @returns {boolean}
 */
function isNowPlayingActive() {
    return nowPlayingState.active;
}

/**
 * Get current Now Playing state (for diagnostics)
 * @returns {Object}
 */
function getNowPlayingState() {
    return {
        active: nowPlayingState.active,
        paused: nowPlayingState.paused,
        currentIndex: nowPlayingState.currentIndex,
        totalArtworks: nowPlayingState.artworks.length,
        playlistName: nowPlayingState.playlistName,
        shuffle: nowPlayingState.shuffle,
        interval: nowPlayingState.interval
    };
}

// Export functions for use in main.js
window.NowPlaying = {
    init: initNowPlayingBar,
    start: startNowPlaying,
    stop: stopNowPlaying,
    toggle: toggleNowPlaying,
    prev: nowPlayingPrev,
    next: nowPlayingNext,
    isActive: isNowPlayingActive,
    getState: getNowPlayingState
};

// Also export individual functions for backward compatibility
window.initNowPlayingBar = initNowPlayingBar;
window.startNowPlaying = startNowPlaying;
window.stopNowPlaying = stopNowPlaying;
