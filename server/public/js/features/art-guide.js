/**
 * Art Guide Module
 * Handles the AI art guide chat and discovery hints
 */

// Guide state
let guideSending = false;
const guideSessionId = 'web-' + Date.now();
let responseAutoHideTimer = null;
let guideDrawerInitialized = false;
let discoverySuggestionsInitialized = false;

// Current display info for context hints
let currentDisplayInfo = null;

// Hint pools for dynamic suggestions
const hintPools = {
    // Time-based hints
    morning: [
        { label: 'morning light', query: 'art with soft morning light, sunrise, dawn' },
        { label: 'fresh start', query: 'art that feels fresh and new, spring' },
        { label: 'awakening', query: 'peaceful awakening scenes, gentle morning' }
    ],
    afternoon: [
        { label: 'golden hour', query: 'art with warm golden light, afternoon sun' },
        { label: 'vibrant day', query: 'bright colorful daytime scenes' },
        { label: 'lively scenes', query: 'busy lively scenes, markets, streets' }
    ],
    evening: [
        { label: 'sunset glow', query: 'sunset paintings, evening sky, dusk' },
        { label: 'twilight', query: 'twilight scenes, soft evening light' },
        { label: 'end of day', query: 'peaceful evening scenes, rest' }
    ],
    night: [
        { label: 'nocturne', query: 'night scenes, moonlight, nocturne paintings' },
        { label: 'starry skies', query: 'stars, night sky, cosmic art' },
        { label: 'quiet night', query: 'peaceful night scenes, solitude' }
    ],
    // Mood hints (rotated randomly)
    moods: [
        { label: 'something calm', query: 'calm peaceful serene art' },
        { label: 'something bold', query: 'bold dramatic striking art' },
        { label: 'melancholy', query: 'melancholic contemplative moody art' },
        { label: 'joyful', query: 'joyful happy celebratory art' },
        { label: 'mysterious', query: 'mysterious enigmatic atmospheric art' },
        { label: 'romantic', query: 'romantic love intimate art' },
        { label: 'dreamy', query: 'dreamlike surreal ethereal art' },
        { label: 'powerful', query: 'powerful dramatic heroic art' }
    ],
    // Subject hints (rotated randomly)
    subjects: [
        { label: 'the sea', query: 'ocean sea marine seascape paintings' },
        { label: 'gardens', query: 'gardens flowers botanical art' },
        { label: 'city life', query: 'urban city street scenes' },
        { label: 'portraits', query: 'portrait paintings faces' },
        { label: 'landscapes', query: 'landscape nature scenery' },
        { label: 'still life', query: 'still life objects arrangement' },
        { label: 'animals', query: 'animal wildlife paintings' },
        { label: 'interiors', query: 'interior rooms domestic scenes' }
    ],
    // Context hints (based on current display)
    context: [
        { label: 'more like this', action: 'moreLikeThis' },
        { label: 'same artist', action: 'sameArtist' },
        { label: 'same era', action: 'sameEra' }
    ]
};

/**
 * Initialize guide drawer event listeners
 */
function initGuideDrawer() {
    // Guard against multiple initializations (prevents duplicate listeners)
    if (guideDrawerInitialized) return;
    guideDrawerInitialized = true;

    const searchInput = document.getElementById('searchInput');
    const smartHints = document.getElementById('smartHints');

    if (searchInput && smartHints) {
        // Show hints on focus
        searchInput.addEventListener('focus', () => {
            smartHints.classList.add('visible');
        });

        // Hide hints on blur (with delay to allow click)
        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                smartHints.classList.remove('visible');
            }, 200);
        });
    }
}

/**
 * Check if query looks conversational (vs simple keyword search)
 * @param {string} query - The user's query
 * @returns {boolean}
 */
function isConversationalQuery(query) {
    const conversationalPatterns = [
        /^(show|find|get|give|suggest|recommend)\s+(me|us)/i,
        /^(i\s+(want|like|love|prefer|need))/i,
        /^(something|anything)\s+/i,
        /^(what|how|why|can|could|would)/i,
        /\?$/,  // ends with question mark
        /(peaceful|calm|bright|dark|moody|happy|sad|romantic|dramatic)/i,
        /(like|similar|style|mood|feeling|vibe)/i,
        /^(more|less|different|another)/i,
        /^(display|put|add|save|show\s+on)/i,  // action requests
        /^(what('s|s|\s+is)\s+(on|showing|displayed))/i  // status queries
    ];

    return conversationalPatterns.some(pattern => pattern.test(query));
}

/**
 * Handle search or guide based on query type
 * @param {string} query - The user's query
 */
async function handleSearchOrGuide(query) {
    if (!query.trim()) return;

    // Decide: conversational -> guide, otherwise -> direct search
    if (isConversationalQuery(query)) {
        await sendGuideMessage(query);
    } else {
        // Regular search (searchArt reads from input)
        if (typeof window.searchArt === 'function') {
            await window.searchArt();
        }
    }
}

/**
 * Show inline response (toast-style)
 * @param {string} text - Response text
 * @param {boolean} isLoading - Whether showing loading state
 */
function showInlineResponse(text, isLoading = false) {
    const responseDiv = document.getElementById('guideResponse');
    if (!responseDiv) return;

    // Clear any existing auto-hide timer
    if (responseAutoHideTimer) {
        clearTimeout(responseAutoHideTimer);
        responseAutoHideTimer = null;
    }

    responseDiv.innerHTML = `<span class="guide-response-text${isLoading ? ' loading' : ''}">${text}</span>`;
    responseDiv.classList.add('visible');
}

/**
 * Hide inline response
 */
function hideInlineResponse() {
    const responseDiv = document.getElementById('guideResponse');
    if (responseDiv) {
        responseDiv.classList.remove('visible');
    }
}

/**
 * Auto-hide response after delay
 * @param {number} delay - Delay in milliseconds
 */
function autoHideResponse(delay = 5000) {
    if (responseAutoHideTimer) {
        clearTimeout(responseAutoHideTimer);
    }
    responseAutoHideTimer = setTimeout(hideInlineResponse, delay);
}

/**
 * Send a message to the art guide
 * @param {string} message - The message to send
 */
async function sendGuideMessage(message) {
    if (guideSending) return;

    const searchInput = document.getElementById('searchInput');
    guideSending = true;

    // Disable input and show loading
    if (searchInput) {
        searchInput.disabled = true;
        searchInput.value = '';
        searchInput.placeholder = 'thinking...';
    }

    // Show loading response
    showInlineResponse('thinking', true);

    try {
        const response = await fetch('/api/guide/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                sessionId: guideSessionId
            })
        });

        const data = await response.json();

        // Show response
        showInlineResponse(data.message);

        // Auto-hide after a delay (longer if no results to show)
        const hasResults = data.results && data.results.length > 0;
        autoHideResponse(hasResults ? 4000 : 6000);

        // Handle display action - refresh current display
        if (data.displayed) {
            setTimeout(() => {
                refreshCurrentDisplay();
            }, 1000);
        }

        // Display results in art grid if any
        if (hasResults && typeof window.displayGuideResults === 'function') {
            window.displayGuideResults(data.results);
        } else if (hasResults) {
            // Fallback: set results directly if displayGuideResults not available
            window.currentArtResults = data.results;
            if (typeof window.getInitialDisplayCount === 'function') {
                window.browseDisplayCount = window.getInitialDisplayCount();
            }

            // Show playlist label
            const playlistLabel = document.getElementById('currentPlaylist');
            const playlistName = document.getElementById('playlistName');
            if (playlistLabel && playlistName) {
                playlistLabel.style.display = 'flex';
                playlistName.textContent = 'guide results';
                const refreshBtn = document.getElementById('playlistRefresh');
                if (refreshBtn) refreshBtn.style.display = 'none';
            }

            if (typeof window.displayPlaylistCards === 'function') {
                window.displayPlaylistCards();
            }
        }
    } catch (error) {
        console.error('Guide chat error:', error);
        showInlineResponse('something went wrong, try again?');
        autoHideResponse(4000);
    } finally {
        guideSending = false;

        // Re-enable input
        if (searchInput) {
            searchInput.disabled = false;
            searchInput.placeholder = 'explore art...';
        }
    }
}

/**
 * Refresh current display (called after guide displays something)
 */
async function refreshCurrentDisplay() {
    try {
        const response = await fetch('/api/current-full.json');
        if (response.ok) {
            const data = await response.json();
            // Update main display if we have one
            const mainImage = document.getElementById('mainImage');
            const mainTitle = document.getElementById('mainTitle');
            if (mainImage && data.image) {
                mainImage.src = `data:image/png;base64,${data.image}`;
            }
            if (mainTitle && data.title) {
                mainTitle.textContent = data.title;
            }
        }
    } catch (error) {
        console.error('Error refreshing display:', error);
    }
}

// ========================================
// Discovery Hints (Dynamic)
// ========================================

/**
 * Get time of day category
 * @returns {string}
 */
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

/**
 * Pick random items from array
 * @param {Array} arr - Array to pick from
 * @param {number} count - Number of items to pick
 * @returns {*}
 */
function pickRandom(arr, count = 1) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return count === 1 ? shuffled[0] : shuffled.slice(0, count);
}

/**
 * Fetch current display info for context hints
 */
async function fetchCurrentDisplayInfo() {
    try {
        const response = await fetch('/api/current.json');
        if (response.ok) {
            currentDisplayInfo = await response.json();
        }
    } catch (e) {
        currentDisplayInfo = null;
    }
}

/**
 * Generate dynamic hints based on time and context
 * @returns {Array}
 */
function generateDynamicHints() {
    const hints = [];

    // Always include surprise
    hints.push({ label: 'surprise me', action: 'surprise' });

    // Add time-based hint
    const timeOfDay = getTimeOfDay();
    const timeHint = pickRandom(hintPools[timeOfDay]);
    hints.push(timeHint);

    // Add a mood or subject hint (alternate randomly)
    if (Math.random() > 0.5) {
        hints.push(pickRandom(hintPools.moods));
    } else {
        hints.push(pickRandom(hintPools.subjects));
    }

    // If we have current display info, maybe add a context hint
    if (currentDisplayInfo && currentDisplayInfo.title && Math.random() > 0.6) {
        // Replace the last hint with a context hint
        hints[2] = pickRandom(hintPools.context);
    }

    return hints;
}

/**
 * Render smart hints in the UI
 */
function renderSmartHints() {
    const container = document.getElementById('smartHints');
    if (!container) return;

    const hints = generateDynamicHints();

    container.innerHTML = hints.map((hint, i) => {
        const sep = i < hints.length - 1 ? '<span class="hint-sep">·</span>' : '';
        if (hint.action) {
            return `<button class="hint-link" data-action="${hint.action}">${hint.label}</button>${sep}`;
        } else {
            return `<button class="hint-link" data-query="${hint.query}">${hint.label}</button>${sep}`;
        }
    }).join('');

    // Attach event listeners
    container.querySelectorAll('.hint-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // Blur the search input to hide hints smoothly
            document.getElementById('searchInput')?.blur();

            if (link.dataset.action) {
                handleHintAction(link.dataset.action);
            } else if (link.dataset.query) {
                sendGuideMessage(link.dataset.query);
            }
        });
    });
}

/**
 * Setup discovery suggestions
 */
function setupDiscoverySuggestions() {
    // Guard against multiple initializations (prevents duplicate intervals)
    if (discoverySuggestionsInitialized) return;
    discoverySuggestionsInitialized = true;

    // Initial fetch of current display info
    fetchCurrentDisplayInfo().then(() => {
        renderSmartHints();
    });

    // Refresh hints periodically (every 5 minutes)
    setInterval(() => {
        fetchCurrentDisplayInfo().then(() => {
            renderSmartHints();
        });
    }, 5 * 60 * 1000);
}

/**
 * Refresh hints (called when switching to explore mode)
 */
function refreshDiscoveryHints() {
    fetchCurrentDisplayInfo().then(() => {
        renderSmartHints();
    });
}

/**
 * Handle hint action buttons
 * @param {string} action - The action to perform
 */
async function handleHintAction(action) {
    switch (action) {
        case 'surprise':
            await surpriseMe();
            break;
        case 'moreLikeThis':
            if (currentDisplayInfo && currentDisplayInfo.title) {
                await sendGuideMessage(`show me art similar to "${currentDisplayInfo.title}"`);
            } else {
                await sendGuideMessage('show me something interesting');
            }
            break;
        case 'sameArtist':
            if (currentDisplayInfo && currentDisplayInfo.artist) {
                await sendGuideMessage(`show me more art by ${currentDisplayInfo.artist}`);
            } else {
                await sendGuideMessage('recommend an artist to explore');
            }
            break;
        case 'sameEra':
            if (currentDisplayInfo && currentDisplayInfo.title) {
                await sendGuideMessage(`show me art from the same era as "${currentDisplayInfo.title}"`);
            } else {
                await sendGuideMessage('show me classical art');
            }
            break;
        default:
            await sendGuideMessage('show me something beautiful');
    }
}

/**
 * Surprise me - find something unexpected
 */
async function surpriseMe() {
    const surpriseQueries = [
        'show me something unexpected and beautiful',
        'surprise me with an interesting painting',
        'find me a hidden gem from art history',
        'show me a masterpiece I might not know',
        'discover something unusual for me'
    ];
    const query = surpriseQueries[Math.floor(Math.random() * surpriseQueries.length)];
    await sendGuideMessage(query);
}

// Export functions for use in main.js
window.ArtGuide = {
    initDrawer: initGuideDrawer,
    isConversational: isConversationalQuery,
    handleQuery: handleSearchOrGuide,
    sendMessage: sendGuideMessage,
    setupSuggestions: setupDiscoverySuggestions,
    refreshHints: refreshDiscoveryHints,
    surprise: surpriseMe
};

// Also export individual functions for backward compatibility
window.initGuideDrawer = initGuideDrawer;
window.isConversationalQuery = isConversationalQuery;
window.handleSearchOrGuide = handleSearchOrGuide;
window.sendGuideMessage = sendGuideMessage;
window.setupDiscoverySuggestions = setupDiscoverySuggestions;
window.refreshDiscoveryHints = refreshDiscoveryHints;
window.surpriseMe = surpriseMe;
