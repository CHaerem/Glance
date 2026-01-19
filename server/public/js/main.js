// Global state
let currentMode = 'create';
let currentArtResults = [];
let selectedModalArt = null;
let selectedHistoryItem = null;
let defaultOrientation = 'portrait';
let secondaryActionType = null; // 'add', 'remove', 'delete'
let currentModalSource = null;  // Track if viewing 'collection' item for reframe saving
let reframeSaveTimeout = null;  // Debounce timer for auto-saving reframe
let modalTransitioning = false; // Prevent rapid open/close
let cachedDisplayImageId = null; // Track current display to avoid refetching

/**
 * Throttle utility - limits function execution to once per specified interval
 * Prevents performance issues from rapid event firing (scroll, resize, etc.)
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum milliseconds between calls
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
    let inThrottle = false;
    let lastArgs = null;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
                // Execute with last args if called during throttle
                if (lastArgs) {
                    func.apply(this, lastArgs);
                    lastArgs = null;
                }
            }, limit);
        } else {
            lastArgs = args;
        }
    };
}

/**
 * Convert image URL to proxy URL for local caching
 * @param {string} url - Original image URL
 * @param {string} [size] - 'small' (200px) or 'medium' (400px) for thumbnail
 * @returns {string} Proxy URL or original if not external
 */
function proxyImageUrl(url, size) {
    if (!url) return '';
    // Only proxy external URLs
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return url;
    }
    // Don't proxy local URLs
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
        return url;
    }
    const params = new URLSearchParams({ url });
    if (size) {
        params.set('size', size);
    }
    return `/api/image-proxy?${params.toString()}`;
}

// Browse state
let browseDisplayCount = getInitialDisplayCount();
let collectionDisplayCount = getInitialDisplayCount();
let allArtworks = [];
let myCollection = [];
let filteredCollection = [];
let collectionSearchQuery = '';
let collectionSortBy = 'date-desc';

// Determine initial display count based on screen size
function getInitialDisplayCount() {
    const width = window.innerWidth;
    if (width >= 768) return 16; // Desktop: 4 rows of 4 columns
    if (width >= 601) return 12; // Tablet: 4 rows of 3 columns
    return 8; // Mobile: 8 items in single column
}

// Determine increment for "show more" based on screen size
function getShowMoreIncrement() {
    const width = window.innerWidth;
    if (width >= 768) return 12; // Desktop: 3 more rows
    if (width >= 601) return 9; // Tablet: 3 more rows
    return 8; // Mobile: 8 more items
}

// Load settings
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        defaultOrientation = settings.defaultOrientation || 'portrait';
    } catch (error) {
        console.error('Failed to load settings:', error);
        defaultOrientation = 'portrait';
    }
}

// Apply default orientation to modal image
function applyDefaultOrientation() {
    const modalImage = document.getElementById('modalImage');
    if (defaultOrientation === 'landscape') {
        modalImage.classList.add('landscape');
    } else {
        modalImage.classList.remove('landscape');
    }
}

// Get artwork image URL from various possible fields
function getArtworkImageUrl(artwork) {
    if (artwork.imageUrl) return artwork.imageUrl;
    if (artwork.thumbnailUrl) return artwork.thumbnailUrl;
    if (artwork.originalImage) {
        return `data:${artwork.originalImageMime || 'image/png'};base64,${artwork.originalImage}`;
    }
    if (artwork.thumbnail) {
        return `data:image/png;base64,${artwork.thumbnail}`;
    }
    return '';
}

// Update modal metadata display
function updateModalMetadata(artwork) {
    const titleEl = document.getElementById('modalTitle');
    const artistEl = document.getElementById('modalArtist');
    const yearEl = document.getElementById('modalYear');
    const detailsEl = document.getElementById('modalArtworkDetails');

    // Check if we have any metadata
    const hasTitle = artwork.title && !artwork.title.startsWith('Uploaded:') && !artwork.title.startsWith('Generated:');
    const hasArtist = artwork.artist;
    const hasYear = artwork.year || artwork.date;

    if (!hasTitle && !hasArtist && !hasYear) {
        if (detailsEl) detailsEl.style.display = 'none';
        return;
    }

    if (detailsEl) detailsEl.style.display = 'block';
    if (titleEl) titleEl.textContent = hasTitle ? artwork.title : '';
    if (artistEl) artistEl.textContent = hasArtist ? artwork.artist : '';
    if (yearEl) yearEl.textContent = hasYear ? (artwork.year || artwork.date) : '';
}

// Unified art modal opening function
function openArtModal(artwork, options = {}) {
    // Prevent rapid open/close issues
    if (modalTransitioning) return;
    modalTransitioning = true;
    setTimeout(() => { modalTransitioning = false; }, 150);

    const {
        source = 'explore',  // 'explore' | 'collection' | 'generated' | 'search'
        showMoreLikeThis = true,
        secondaryAction = null  // { text, type } or null
    } = options;

    // Reset state
    selectedModalArt = artwork;
    selectedHistoryItem = (source === 'generated' || source === 'collection') ? artwork : null;
    currentModalSource = source;  // Track source for reframe auto-save

    // Restore saved reframe settings or use defaults
    if (artwork.reframe) {
        cropX = artwork.reframe.cropX ?? 50;
        cropY = artwork.reframe.cropY ?? 50;
        zoomLevel = artwork.reframe.zoomLevel ?? 1.0;
    } else {
        cropX = 50;
        cropY = 50;
        zoomLevel = 1.0;
    }

    const modal = document.getElementById('artModal');
    const modalImage = document.getElementById('modalImage');

    // Apply image styles (uses restored or default reframe settings)
    modalImage.style.transform = `scale(${zoomLevel})`;
    modalImage.style.transformOrigin = `${cropX}% ${cropY}%`;
    modalImage.style.objectPosition = `${cropX}% ${cropY}%`;
    modalImage.style.objectFit = zoomLevel < 1.0 ? 'contain' : 'cover';

    // Set image source (use proxy for caching, no size param for full resolution)
    modalImage.src = proxyImageUrl(getArtworkImageUrl(artwork));

    applyDefaultOrientation();

    // Update metadata display
    updateModalMetadata(artwork);

    // Configure secondary action
    const secondaryBtn = document.getElementById('modalSecondaryAction');
    if (secondaryAction) {
        secondaryBtn.textContent = secondaryAction.text;
        secondaryBtn.style.display = 'block';
        secondaryActionType = secondaryAction.type;
    } else {
        secondaryBtn.style.display = 'none';
        secondaryActionType = null;
    }

    // Configure more like this button
    const moreLikeBtn = document.getElementById('moreLikeThisBtn');
    if (moreLikeBtn) {
        moreLikeBtn.style.display = showMoreLikeThis ? 'block' : 'none';
    }

    // Configure ask about button (only show if we have meaningful metadata)
    const askBtn = document.getElementById('askAboutBtn');
    if (askBtn) {
        const hasMeaningfulTitle = artwork.title && !artwork.title.startsWith('Uploaded:') && !artwork.title.startsWith('Generated:');
        askBtn.style.display = (hasMeaningfulTitle || artwork.artist) ? 'block' : 'none';
    }

    // Show modal using CSS class (consistent method)
    modal.classList.add('show');
}

// Initialize
// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadCurrentDisplay();
    // Defer loadAllArt() and loadMyCollection() to when user switches modes
    // This improves initial page load time
    setupDragDrop();
    setupTouchZoom();
    setInterval(loadCurrentDisplay, 30000);

    // Setup event listeners
    document.getElementById('createLink').addEventListener('click', () => switchMode('create'));
    document.getElementById('exploreLink').addEventListener('click', () => switchMode('explore'));
    document.getElementById('myCollectionLink').addEventListener('click', () => switchMode('my-collection'));

    // Rotation controls in collection
    document.getElementById('rotationModeToggle').addEventListener('click', cycleRotationMode);
    document.getElementById('rotationIntervalToggle').addEventListener('click', cycleRotationInterval);
    document.getElementById('stopRotationBtn').addEventListener('click', stopRotation);

    document.getElementById('generateBtn').addEventListener('click', generateArt);
    document.getElementById('luckyBtn').addEventListener('click', feelingLucky);

    document.getElementById('dropZone').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            handleSearchOrGuide(query);
        }
    });

    // New Explore Page Controls
    document.getElementById('randomArtBtn').addEventListener('click', loadRandomArt);
    document.getElementById('refreshGallery').addEventListener('click', refreshTodaysGallery);
    document.getElementById('playGallery').addEventListener('click', playTodaysGallery);
    document.getElementById('clearSearch').addEventListener('click', clearSearchResults);
    document.getElementById('closePlaylistView').addEventListener('click', closePlaylistView);
    document.getElementById('playPlaylistBtn').addEventListener('click', playCurrentPlaylist);

    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const query = chip.dataset.query;
            document.getElementById('searchInput').value = query;
            handleSearchOrGuide(query);
        });
    });

    // Legacy playlist stack navigation (keeping for backwards compatibility)
    const stacksNavLeft = document.getElementById('stacksNavLeft');
    const stacksNavRight = document.getElementById('stacksNavRight');
    if (stacksNavLeft) stacksNavLeft.addEventListener('click', () => scrollPlaylistStacks('left'));
    if (stacksNavRight) stacksNavRight.addEventListener('click', () => scrollPlaylistStacks('right'));
    setupPlaylistDragScroll();

    // Legacy playlist controls
    const playlistClear = document.getElementById('playlistClear');
    const playlistRefresh = document.getElementById('playlistRefresh');
    if (playlistClear) playlistClear.addEventListener('click', clearPlaylist);
    if (playlistRefresh) playlistRefresh.addEventListener('click', refreshPlaylist);

    document.getElementById('showMoreBrowseBtn').addEventListener('click', showMoreBrowse);
    document.getElementById('showMoreCollectionBtn').addEventListener('click', showMoreCollection);

    // Collection controls
    document.getElementById('collectionSearch').addEventListener('input', (e) => {
        collectionSearchQuery = e.target.value.toLowerCase();
        collectionDisplayCount = getInitialDisplayCount();
        displayMyCollection();
    });
    document.getElementById('collectionSort').addEventListener('change', (e) => {
        collectionSortBy = e.target.value;
        collectionDisplayCount = getInitialDisplayCount();
        displayMyCollection();
    });

    // User playlist creation
    document.getElementById('createPlaylistBtn')?.addEventListener('click', showCreatePlaylistDialog);

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('artModal').addEventListener('click', (e) => {
        if (e.target.id === 'artModal') closeModal();
    });
    document.getElementById('orientationToggle').addEventListener('click', togglePreviewOrientation);
    document.getElementById('applyModalBtn').addEventListener('click', applyModalArt);
    document.getElementById('modalSecondaryAction').addEventListener('click', handleSecondaryAction);
    document.getElementById('moreLikeThisBtn').addEventListener('click', findSimilarArt);
    document.getElementById('askAboutBtn').addEventListener('click', askAboutArtwork);

    // Zoom controls (desktop only - hidden on mobile)
    document.getElementById('zoomIn').addEventListener('click', () => adjustZoom('in'));
    document.getElementById('zoomOut').addEventListener('click', () => adjustZoom('out'));
    document.getElementById('zoomFit').addEventListener('click', () => adjustZoom('fit'));

    // Position controls (desktop only - hidden on mobile)
    document.getElementById('moveUp').addEventListener('click', () => adjustCrop('up'));
    document.getElementById('moveDown').addEventListener('click', () => adjustCrop('down'));
    document.getElementById('moveLeft').addEventListener('click', () => adjustCrop('left'));
    document.getElementById('moveRight').addEventListener('click', () => adjustCrop('right'));

    // Art Guide drawer
    initGuideDrawer();

    // Discovery suggestion chips
    setupDiscoverySuggestions();

    // Now Playing bar
    initNowPlayingBar();
});

// Mode switching
function switchMode(mode) {
    currentMode = mode;

    // Hide all modes
    document.getElementById('createMode').style.display = 'none';
    document.getElementById('exploreMode').classList.remove('show');
    document.getElementById('myCollectionMode').classList.remove('show');

    // Show selected mode
    if (mode === 'create') {
        document.getElementById('createMode').style.display = 'block';
    } else if (mode === 'explore') {
        document.getElementById('exploreMode').classList.add('show');
        browseDisplayCount = getInitialDisplayCount();
        initializeExploreMode(); // Initialize playlist stacks
        refreshDiscoveryHints(); // Refresh dynamic hints on each visit
        if (currentArtResults.length === 0) {
            // Playlists will load via initializeExploreMode
        } else {
            displayPlaylistCards();
        }
    } else if (mode === 'my-collection') {
        document.getElementById('myCollectionMode').classList.add('show');
        collectionDisplayCount = getInitialDisplayCount();
        // Lazy load collection data on first visit
        if (!collectionInitialized) {
            loadMyCollection().then(() => {
                collectionInitialized = true;
                displayMyCollection();
            });
            loadRotationStatus();
            loadMyPlaylists();
        } else {
            displayMyCollection();
        }
    }

    // Update tab colors
    document.getElementById('createLink').style.color = mode === 'create' ? '#1a1a1a' : '#999';
    document.getElementById('exploreLink').style.color = mode === 'explore' ? '#1a1a1a' : '#999';
    document.getElementById('myCollectionLink').style.color = mode === 'my-collection' ? '#1a1a1a' : '#999';
}

// Playlist state
let allPlaylists = [];
let currentPlaylistId = null;
let exploreInitialized = false;
let collectionInitialized = false;
const playlistDataCache = new Map(); // Client-side cache for loaded playlist artworks
const PLAYLIST_CACHE_MAX_ENTRIES = 20;
const PLAYLIST_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let todaysGalleryArtworks = []; // Store gallery artworks for playback
let myUserPlaylists = []; // User-created playlists

// Helper to manage playlist cache with size and TTL limits
function setPlaylistCache(playlistId, data) {
    // Remove expired entries first
    const now = Date.now();
    for (const [key, value] of playlistDataCache.entries()) {
        if (now - value.timestamp > PLAYLIST_CACHE_TTL_MS) {
            playlistDataCache.delete(key);
        }
    }
    // Enforce size limit (remove oldest if over limit)
    if (playlistDataCache.size >= PLAYLIST_CACHE_MAX_ENTRIES) {
        const oldestKey = playlistDataCache.keys().next().value;
        playlistDataCache.delete(oldestKey);
    }
    playlistDataCache.set(playlistId, { ...data, timestamp: now });
}

function getPlaylistCache(playlistId) {
    const cached = playlistDataCache.get(playlistId);
    if (!cached) return null;
    // Check TTL
    if (Date.now() - cached.timestamp > PLAYLIST_CACHE_TTL_MS) {
        playlistDataCache.delete(playlistId);
        return null;
    }
    return cached;
}

// Client-side diagnostics for memory monitoring (accessible via console: getClientDiagnostics())
window.getClientDiagnostics = function() {
    const diagnostics = {
        timestamp: Date.now(),
        playlistCache: {
            size: playlistDataCache.size,
            maxSize: PLAYLIST_CACHE_MAX_ENTRIES,
            ttlMs: PLAYLIST_CACHE_TTL_MS,
            entries: Array.from(playlistDataCache.entries()).map(([key, value]) => ({
                key,
                artworkCount: value.artworks?.length || 0,
                ageMs: Date.now() - (value.timestamp || 0),
                expired: Date.now() - (value.timestamp || 0) > PLAYLIST_CACHE_TTL_MS
            }))
        },
        setupGuards: {
            guideDrawerInitialized: typeof guideDrawerInitialized !== 'undefined' ? guideDrawerInitialized : 'N/A',
            discoverySuggestionsInitialized: typeof discoverySuggestionsInitialized !== 'undefined' ? discoverySuggestionsInitialized : 'N/A',
            touchZoomInitialized: typeof touchZoomInitialized !== 'undefined' ? touchZoomInitialized : 'N/A',
            dragDropInitialized: typeof dragDropInitialized !== 'undefined' ? dragDropInitialized : 'N/A',
            playlistDragScrollInitialized: typeof playlistDragScrollInitialized !== 'undefined' ? playlistDragScrollInitialized : 'N/A',
            exploreInitialized: typeof exploreInitialized !== 'undefined' ? exploreInitialized : 'N/A'
        },
        globalArrays: {
            currentArtResults: currentArtResults?.length || 0,
            allPlaylists: allPlaylists?.length || 0,
            todaysGalleryArtworks: todaysGalleryArtworks?.length || 0,
            myCollection: typeof myCollection !== 'undefined' ? myCollection?.length || 0 : 'N/A'
        }
    };
    console.log('Client Diagnostics:', diagnostics);
    return diagnostics;
};

// Initialize explore mode with playlists and Today's Gallery
async function initializeExploreMode() {
    if (!exploreInitialized) {
        await Promise.all([
            loadPlaylistsHorizontal(),
            loadTodaysGallery(),
            // Initialize curated discovery sections (from discover.js)
            typeof initDiscover === 'function' ? initDiscover() : Promise.resolve()
        ]);
        exploreInitialized = true;
    }
    // Show default sections, hide search results
    showDefaultExploreSections();
}

// Show default explore sections (playlists, gallery, suggestions)
function showDefaultExploreSections() {
    // Standard sections
    document.getElementById('playlistsSection').style.display = 'block';
    document.getElementById('todaysGallerySection').style.display = 'block';
    document.getElementById('quickSuggestions').style.display = 'flex';
    document.getElementById('searchResultsSection').style.display = 'none';
    document.getElementById('playlistViewSection').style.display = 'none';
    // Note: Featured, mood, and movements sections are controlled by discover.js
}

// Show search results section
function showSearchResultsSection(title) {
    // Hide all default sections
    document.getElementById('playlistsSection').style.display = 'none';
    document.getElementById('todaysGallerySection').style.display = 'none';
    document.getElementById('quickSuggestions').style.display = 'none';
    document.getElementById('playlistViewSection').style.display = 'none';
    // Hide discover sections
    document.getElementById('featuredSection').style.display = 'none';
    document.getElementById('moodSection').style.display = 'none';
    document.getElementById('movementsSection').style.display = 'none';
    // Show search results
    document.getElementById('searchResultsSection').style.display = 'block';
    document.getElementById('searchResultsTitle').textContent = title || 'results';
}

// Load playlists in horizontal scroll format
async function loadPlaylistsHorizontal() {
    const scrollContainer = document.getElementById('playlistScroll');
    if (!scrollContainer) return;

    try {
        const response = await fetch('/api/playlists');
        const data = await response.json();
        allPlaylists = data.playlists || [];

        scrollContainer.innerHTML = allPlaylists.map(playlist => {
            const previewUrl = playlist.preview || '';
            return `
                <div class="playlist-card" onclick="openPlaylistView('${playlist.id}')">
                    <img class="playlist-card-image ${!previewUrl ? 'loading' : ''}"
                         src="${proxyImageUrl(previewUrl, 'small')}"
                         alt="${playlist.name}"
                         loading="lazy"
                         decoding="async"
                         onload="this.classList.remove('loading'); this.classList.add('loaded')"
                         onerror="this.classList.add('loading'); this.src='';">
                    <div class="playlist-card-name">${playlist.name}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load playlists:', error);
        scrollContainer.innerHTML = '<div style="color: #999; padding: 20px;">Failed to load</div>';
    }
}

// Load Today's Gallery
async function loadTodaysGallery() {
    const galleryContainer = document.getElementById('todaysGallery');
    if (!galleryContainer) return;

    // Show loading skeletons
    galleryContainer.innerHTML = Array(8).fill(0).map(() =>
        '<div class="gallery-artwork loading"></div>'
    ).join('');

    try {
        const response = await fetch('/api/gallery/today');
        const data = await response.json();

        if (data.artworks && data.artworks.length > 0) {
            // Store for playback
            todaysGalleryArtworks = data.artworks;

            galleryContainer.innerHTML = data.artworks.map(artwork => `
                <div class="gallery-artwork" onclick="openArtPreview(${JSON.stringify(artwork).replace(/"/g, '&quot;')})">
                    <img src="${proxyImageUrl(artwork.thumbnailUrl || artwork.imageUrl, 'medium')}" alt="${artwork.title}" loading="lazy" decoding="async"
                         onload="this.parentElement.classList.remove('loading'); this.parentElement.classList.add('loaded')">
                    <div class="gallery-artwork-info">
                        <div class="gallery-artwork-title">${artwork.title}</div>
                    </div>
                </div>
            `).join('');
        } else {
            todaysGalleryArtworks = [];
            galleryContainer.innerHTML = '<div style="color: #999; padding: 20px; text-align: center;">No artworks available</div>';
        }
    } catch (error) {
        console.error('Failed to load Today\'s Gallery:', error);
        todaysGalleryArtworks = [];
        galleryContainer.innerHTML = '<div style="color: #999; padding: 20px; text-align: center;">Failed to load gallery</div>';
    }
}

// Play Today's Gallery as a playlist
function playTodaysGallery() {
    if (todaysGalleryArtworks.length === 0) {
        console.log('No gallery artworks to play');
        return;
    }
    startNowPlaying(todaysGalleryArtworks, "today's gallery");
}

// ========================================
// USER PLAYLISTS (Collection Page)
// ========================================

// Load user playlists
async function loadMyPlaylists() {
    const grid = document.getElementById('myPlaylistsGrid');
    if (!grid) return;

    try {
        const response = await fetch('/api/user-playlists');
        if (response.ok) {
            const data = await response.json();
            myUserPlaylists = data.playlists || [];
        } else {
            myUserPlaylists = [];
        }
    } catch (error) {
        console.log('User playlists API not available');
        myUserPlaylists = [];
    }

    renderMyPlaylists();
}

// Render user playlists grid
function renderMyPlaylists() {
    const grid = document.getElementById('myPlaylistsGrid');
    if (!grid) return;

    if (myUserPlaylists.length === 0) {
        grid.innerHTML = `
            <div class="my-playlist-empty">
                <p>You haven't created any playlists yet.</p>
                <button class="create-playlist-btn" onclick="showCreatePlaylistDialog()">Create Your First Playlist</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = myUserPlaylists.map(playlist => {
        const previewUrl = playlist.preview || '';
        const count = playlist.artworkCount || 0;
        return `
            <div class="my-playlist-card" onclick="openUserPlaylist('${playlist.id}')">
                <div class="my-playlist-card-preview">
                    ${previewUrl ? `<img src="${previewUrl}" alt="${playlist.name}">` : ''}
                </div>
                <div class="my-playlist-card-name">${playlist.name}</div>
                <div class="my-playlist-card-count">${count} artwork${count !== 1 ? 's' : ''}</div>
            </div>
        `;
    }).join('');
}

// Show create playlist dialog
function showCreatePlaylistDialog() {
    const name = prompt('Enter playlist name:');
    if (!name || !name.trim()) return;

    createUserPlaylist(name.trim());
}

// Create a new user playlist
async function createUserPlaylist(name) {
    try {
        const response = await fetch('/api/user-playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            await loadMyPlaylists();
        } else {
            const data = await response.json();
            alert('Failed to create playlist: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Failed to create playlist:', error);
        alert('Failed to create playlist. Please try again.');
    }
}

// Open a user playlist
async function openUserPlaylist(playlistId) {
    // For now, just show an alert - full implementation pending
    alert('User playlist view coming soon!');
}

// Refresh Today's Gallery
async function refreshTodaysGallery() {
    const galleryContainer = document.getElementById('todaysGallery');
    if (!galleryContainer) return;

    const refreshBtn = document.getElementById('refreshGallery');
    refreshBtn.classList.add('loading');

    // Show loading skeletons
    galleryContainer.innerHTML = Array(8).fill(0).map(() =>
        '<div class="gallery-artwork loading"></div>'
    ).join('');

    try {
        const response = await fetch('/api/gallery/today/refresh', { method: 'POST' });
        const data = await response.json();

        if (data.artworks && data.artworks.length > 0) {
            // Store for playback
            todaysGalleryArtworks = data.artworks;

            galleryContainer.innerHTML = data.artworks.map(artwork => `
                <div class="gallery-artwork" onclick="openArtPreview(${JSON.stringify(artwork).replace(/"/g, '&quot;')})">
                    <img src="${proxyImageUrl(artwork.thumbnailUrl || artwork.imageUrl, 'medium')}" alt="${artwork.title}" loading="lazy">
                    <div class="gallery-artwork-info">
                        <div class="gallery-artwork-title">${artwork.title}</div>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to refresh gallery:', error);
    } finally {
        refreshBtn.classList.remove('loading');
    }
}

// Open playlist view
async function openPlaylistView(playlistId) {
    const playlist = allPlaylists.find(p => p.id === playlistId);
    if (!playlist) return;

    currentPlaylistId = playlistId;

    // Update UI
    document.getElementById('playlistsSection').style.display = 'none';
    document.getElementById('todaysGallerySection').style.display = 'none';
    document.getElementById('quickSuggestions').style.display = 'none';
    document.getElementById('searchResultsSection').style.display = 'none';
    document.getElementById('playlistViewSection').style.display = 'block';
    document.getElementById('playlistViewTitle').textContent = playlist.name;

    const cardsContainer = document.getElementById('playlistArtCards');
    cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Loading...</div>';

    try {
        const response = await fetch(`/api/playlists/${playlistId}`);
        const data = await response.json();

        if (data.artworks && data.artworks.length > 0) {
            currentArtResults = data.artworks;
            cardsContainer.innerHTML = data.artworks.map(artwork => createPhysicalCard(artwork)).join('');
        } else {
            cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">No artworks in playlist</div>';
        }
    } catch (error) {
        console.error('Failed to load playlist:', error);
        cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Failed to load playlist</div>';
    }
}

// Close playlist view
function closePlaylistView() {
    currentPlaylistId = null;
    showDefaultExploreSections();
}

// Play current playlist (uses Now Playing module)
function playCurrentPlaylist() {
    if (currentArtResults.length === 0) return;

    const playlist = allPlaylists.find(p => p.id === currentPlaylistId);
    const name = playlist ? playlist.name : 'playlist';

    startNowPlaying(currentArtResults, name);
}

// Clear search results and return to default view
function clearSearchResults() {
    document.getElementById('searchInput').value = '';
    currentArtResults = [];
    showDefaultExploreSections();
}

// Typewriter effect helper
async function typewriterEffect(element, text, speed = 35) {
    element.value = '';
    for (let i = 0; i < text.length; i++) {
        element.value += text[i];
        await new Promise(resolve => setTimeout(resolve, speed));
    }
}

// Lucky search - generate or enhance AI search query and show results
async function loadRandomArt() {
    const diceBtn = document.getElementById('randomArtBtn');
    const searchInput = document.getElementById('searchInput');

    try {
        const existingQuery = searchInput.value.trim();

        // Start loading animation
        diceBtn.classList.add('loading');

        // If there's existing text, enhance it; otherwise generate new query
        const url = existingQuery
            ? `/api/art/lucky-search?q=${encodeURIComponent(existingQuery)}`
            : '/api/art/lucky-search';

        const response = await fetch(url);
        const data = await response.json();

        if (data.query) {
            // Typewriter effect for the query
            await typewriterEffect(searchInput, data.query);

            // Brief pause to let user see the query
            await new Promise(resolve => setTimeout(resolve, 400));

            // Execute search
            await searchArt();
        }
    } catch (error) {
        console.error('Failed to load lucky search:', error);
    } finally {
        // Stop loading animation
        diceBtn.classList.remove('loading');
    }
}

// Open art preview modal from Today's Gallery
function openArtPreview(artwork) {
    openArtModal(artwork, {
        source: 'explore',
        showMoreLikeThis: true,
        secondaryAction: { text: 'add to collection', type: 'add' }
    });
}

// Load all playlists from API
async function loadPlaylists() {
    const stacksContainer = document.getElementById('playlistStacks');

    try {
        const response = await fetch('/api/playlists');
        const data = await response.json();
        allPlaylists = data.playlists || [];

        renderPlaylistStacks();

        // Load featured art (most popular works) on first visit
        if (currentArtResults.length === 0) {
            loadFeaturedArt();
        }
    } catch (error) {
        console.error('Failed to load playlists:', error);
        stacksContainer.innerHTML = '<div style="color: #999; padding: 20px; text-align: center;">Failed to load playlists</div>';
    }
}

// Load featured art (most popular artworks)
async function loadFeaturedArt() {
    currentPlaylistId = null; // Not a playlist

    // Clear any active playlist stack highlighting
    document.querySelectorAll('.playlist-stack').forEach(stack => {
        stack.classList.remove('active');
    });

    // Hide current playlist indicator
    const currentPlaylistEl = document.getElementById('currentPlaylist');
    currentPlaylistEl.style.display = 'none';

    const cardsContainer = document.getElementById('artCards');
    cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Loading featured art...</div>';

    try {
        const response = await fetch('/api/collections/featured?limit=30');
        const data = await response.json();

        if (data.artworks && data.artworks.length > 0) {
            currentArtResults = data.artworks;
            browseDisplayCount = getInitialDisplayCount();
            displayPlaylistCards();
        } else {
            cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">No featured art available</div>';
        }
    } catch (error) {
        console.error('Failed to load featured art:', error);
        cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Failed to load featured art</div>';
    }
}

// Render playlist stacks UI
function renderPlaylistStacks() {
    const stacksContainer = document.getElementById('playlistStacks');

    if (allPlaylists.length === 0) {
        stacksContainer.innerHTML = '<div style="color: #999; padding: 20px; text-align: center;">No playlists available</div>';
        return;
    }

    stacksContainer.innerHTML = allPlaylists.map(playlist => {
        const isActive = playlist.id === currentPlaylistId;
        const typeLabel = playlist.type === 'classic' ? 'curated' : playlist.type;

        // For classic playlists, use the preview image; for dynamic, show a placeholder icon
        let previewContent;
        if (playlist.preview) {
            previewContent = `<img src="${playlist.preview}" alt="${playlist.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'stack-card-placeholder\\'>&#9733;</div>'">`;
        } else {
            // Dynamic playlist - show a star icon placeholder
            previewContent = `<div class="stack-card-placeholder">&#9733;</div>`;
        }

        return `
            <div class="playlist-stack ${isActive ? 'active' : ''}" onclick="loadPlaylist('${playlist.id}')" title="${playlist.description || playlist.name}">
                <div class="stack-cards">
                    <div class="stack-card"></div>
                    <div class="stack-card"></div>
                    <div class="stack-card">
                        ${previewContent}
                    </div>
                </div>
                <div class="stack-label">
                    ${playlist.name}
                    <span class="stack-type">${typeLabel}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Load a specific playlist
async function loadPlaylist(playlistId) {
    currentPlaylistId = playlistId;
    const playlist = allPlaylists.find(p => p.id === playlistId);

    if (!playlist) return;

    // Update active state without full re-render (just toggle classes)
    document.querySelectorAll('.playlist-stack').forEach(stack => {
        const label = stack.querySelector('.stack-label');
        stack.classList.toggle('active', label?.textContent.includes(playlist.name));
    });

    // Show current playlist indicator
    const currentPlaylistEl = document.getElementById('currentPlaylist');
    const playlistNameEl = document.getElementById('playlistName');
    const refreshBtn = document.getElementById('playlistRefresh');

    playlistNameEl.textContent = playlist.name;
    currentPlaylistEl.style.display = 'flex';

    // Show refresh button only for dynamic playlists
    refreshBtn.style.display = (playlist.type === 'dynamic' || playlist.type === 'seasonal') ? 'inline-block' : 'none';

    const cardsContainer = document.getElementById('artCards');

    // Check client-side cache first (with TTL check)
    const cached = getPlaylistCache(playlistId);
    if (cached && cached.artworks && cached.artworks.length > 0) {
        currentArtResults = cached.artworks;
        browseDisplayCount = getInitialDisplayCount();
        displayPlaylistCards();
        return;
    }

    // Show loading state
    cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Loading...</div>';

    try {
        const response = await fetch(`/api/playlists/${playlistId}`);
        const data = await response.json();

        if (data.artworks && data.artworks.length > 0) {
            // Cache the results client-side (with TTL and size limits)
            setPlaylistCache(playlistId, { artworks: data.artworks });
            currentArtResults = data.artworks;
            browseDisplayCount = getInitialDisplayCount();
            displayPlaylistCards();
        } else {
            cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">No artworks in this playlist</div>';
        }
    } catch (error) {
        console.error('Failed to load playlist:', error);
        cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Failed to load playlist</div>';
    }
}

// Display artworks using physical card design
function displayPlaylistCards() {
    const cardsContainer = document.getElementById('artCards');
    const showMoreBtn = document.getElementById('browseShowMore');

    if (currentArtResults.length === 0) {
        cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">No results</div>';
        showMoreBtn.style.display = 'none';
        return;
    }

    const displayedResults = currentArtResults.slice(0, browseDisplayCount);
    cardsContainer.innerHTML = displayedResults.map(art => createPhysicalCard(art)).join('');

    // Show "show more" button if there are more results
    if (browseDisplayCount < currentArtResults.length) {
        const increment = getShowMoreIncrement();
        document.getElementById('showMoreBrowseBtn').textContent = `show ${increment} more`;
        showMoreBtn.style.display = 'block';
    } else {
        showMoreBtn.style.display = 'none';
    }
}

// Create a physical card element
function createPhysicalCard(art) {
    const title = art.title || 'Untitled';
    const artist = art.artist || '';
    const imageUrl = art.thumbnail || art.thumbnailUrl || art.imageUrl || '';
    const artJson = JSON.stringify(art).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

    // Handle missing images gracefully with onload for smooth transitions
    const imgContent = imageUrl
        ? `<img src="${proxyImageUrl(imageUrl, 'medium')}" alt="${truncateText(title, 50)}" loading="lazy" decoding="async"
             onload="this.parentElement.classList.add('loaded')"
             onerror="this.parentElement.classList.add('no-image'); this.style.display='none';">`
        : '';

    return `
        <div class="physical-card" onclick='previewArt(${artJson.replace(/&quot;/g, "&#34;")})'>
            <div class="physical-card-image ${!imageUrl ? 'no-image' : ''}">
                ${imgContent}
            </div>
            <div class="physical-card-overlay">
                <button class="physical-card-action" onclick='event.stopPropagation(); quickAddToCollection(${artJson.replace(/&quot;/g, "&#34;")})' title="Add to collection">+</button>
            </div>
            <div class="physical-card-meta">
                <div class="physical-card-title">${truncateText(title, 28)}</div>
                ${artist ? `<div class="physical-card-artist">${truncateText(artist, 24)}</div>` : ''}
            </div>
        </div>
    `;
}

// Scroll playlist stacks
function scrollPlaylistStacks(direction) {
    const container = document.getElementById('playlistStacks');
    const scrollAmount = 240; // Scroll by ~2 stacks

    if (direction === 'left') {
        container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
        container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }

    // Update navigation button states after scroll
    setTimeout(updateStacksNavigation, 300);
}

// Update navigation button visibility
function updateStacksNavigation() {
    const container = document.getElementById('playlistStacks');
    const leftBtn = document.getElementById('stacksNavLeft');
    const rightBtn = document.getElementById('stacksNavRight');

    if (!container) return;

    leftBtn.disabled = container.scrollLeft <= 0;
    rightBtn.disabled = container.scrollLeft >= container.scrollWidth - container.clientWidth - 10;
}

// Setup drag-to-scroll for playlist stacks (works on both touch and mouse)
let playlistDragScrollInitialized = false;
function setupPlaylistDragScroll() {
    // Guard against multiple initializations (prevents duplicate listeners)
    if (playlistDragScrollInitialized) return;
    playlistDragScrollInitialized = true;

    const container = document.getElementById('playlistStacks');
    if (!container) return;

    let isDown = false;
    let startX;
    let scrollLeft;
    let hasMoved = false;

    container.addEventListener('mousedown', (e) => {
        // Don't initiate drag on buttons or interactive elements
        if (e.target.closest('.playlist-stack')) {
            isDown = true;
            hasMoved = false;
            container.classList.add('dragging');
            startX = e.pageX - container.offsetLeft;
            scrollLeft = container.scrollLeft;
        }
    });

    container.addEventListener('mouseleave', () => {
        isDown = false;
        container.classList.remove('dragging');
    });

    container.addEventListener('mouseup', () => {
        isDown = false;
        container.classList.remove('dragging');
        setTimeout(updateStacksNavigation, 100);
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 1.5; // Scroll speed multiplier
        if (Math.abs(walk) > 5) hasMoved = true;
        container.scrollLeft = scrollLeft - walk;
    });

    // Prevent click on playlist stack if user was dragging
    container.addEventListener('click', (e) => {
        if (hasMoved) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, true);

    // Update nav buttons on scroll (throttled to prevent jank)
    container.addEventListener('scroll', throttle(updateStacksNavigation, 100));
}

// Clear playlist selection
function clearPlaylist() {
    currentPlaylistId = null;
    document.getElementById('currentPlaylist').style.display = 'none';
    renderPlaylistStacks();
    loadAllArt();
}

// Refresh dynamic playlist
async function refreshPlaylist() {
    if (!currentPlaylistId) return;

    const playlist = allPlaylists.find(p => p.id === currentPlaylistId);
    if (!playlist || playlist.type === 'classic') return;

    // Clear client-side cache for this playlist
    playlistDataCache.delete(currentPlaylistId);

    // Show loading
    const cardsContainer = document.getElementById('artCards');
    cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Refreshing...</div>';

    try {
        // Call refresh endpoint then reload
        await fetch(`/api/playlists/${currentPlaylistId}/refresh`, { method: 'POST' });
        await loadPlaylist(currentPlaylistId);
    } catch (error) {
        console.error('Failed to refresh playlist:', error);
    }
}

// Load current display (smart polling - only fetches full data when image changes)
async function loadCurrentDisplay(forceRefresh = false) {
    try {
        // First, check metadata to see if image changed (lightweight call)
        const metaResponse = await fetch('/api/current.json');
        const meta = await metaResponse.json();

        // Skip full fetch if image hasn't changed (unless forced)
        if (!forceRefresh && meta.imageId === cachedDisplayImageId) {
            return;
        }

        // Image changed - fetch full data
        const response = await fetch('/api/current-full.json');
        const data = await response.json();

        if (data.imageId && data.originalImage) {
            cachedDisplayImageId = data.imageId;

            const preview = document.getElementById('currentImagePreview');
            const img = document.getElementById('currentImageThumb');
            const prompt = document.getElementById('currentImagePrompt');

            img.src = `data:${data.originalImageMime || 'image/png'};base64,${data.originalImage}`;
            preview.classList.add('show');

            if (data.originalPrompt) {
                prompt.textContent = `"${data.originalPrompt}"`;
                prompt.classList.add('show');
            } else {
                prompt.classList.remove('show');
            }
        }
    } catch (error) {
        console.error('Failed to load:', error);
    }
}

// Generate art
async function generateArt() {
    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) return;

    const overlay = document.getElementById('generationOverlay');
    const promptText = document.getElementById('generationPromptText');
    promptText.textContent = `"${prompt}"`;
    overlay.classList.add('show');

    try {
        const rotation = defaultOrientation === 'landscape' ? 90 : 0;

        const response = await fetch('/api/generate-art', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, rotation })
        });

        if (response.ok) {
            const data = await response.json();
            document.getElementById('promptInput').value = '';
            await loadCurrentDisplay();
            overlay.classList.remove('show');

            const imageId = (data.current && data.current.imageId) || data.imageId;
            await openGeneratedImagePreview(imageId);

            setTimeout(loadMyCollection, 1000);
        } else {
            overlay.classList.remove('show');
            const errorData = await response.json();
            alert('Generation failed: ' + (errorData.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Generation failed:', error);
        overlay.classList.remove('show');
        alert('Generation failed: ' + error.message);
    }
}

// Open preview modal for newly generated image
async function openGeneratedImagePreview(imageId) {
    try {
        const response = await fetch(`/api/images/${imageId}`);
        if (!response.ok) {
            console.error('Generated image not found');
            return;
        }

        const item = await response.json();

        openArtModal(item, {
            source: 'generated',
            showMoreLikeThis: false,
            secondaryAction: { text: 'delete', type: 'delete' }
        });
    } catch (error) {
        console.error('Failed to open preview:', error);
    }
}

// Feeling lucky
async function feelingLucky() {
    const luckyBtn = document.getElementById('luckyBtn');
    luckyBtn.classList.add('loading');

    try {
        const currentPrompt = document.getElementById('promptInput').value.trim();
        const response = await fetch('/api/lucky-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPrompt })
        });
        const data = await response.json();
        if (data.prompt) {
            document.getElementById('promptInput').value = data.prompt;
        }
    } catch (error) {
        console.error('Lucky prompt failed:', error);
    } finally {
        luckyBtn.classList.remove('loading');
    }
}

// Search art with AI
async function searchArt() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    // Show search results section
    showSearchResultsSection(`"${query}"`);

    // Clear playlist selection when searching
    currentPlaylistId = null;
    const currentPlaylistEl = document.getElementById('currentPlaylist');
    if (currentPlaylistEl) currentPlaylistEl.style.display = 'none';

    const cardsContainer = document.getElementById('artCards');
    // Show skeleton loaders for instant feedback
    const skeletonCount = getInitialDisplayCount();
    cardsContainer.innerHTML = Array(skeletonCount).fill(0).map(() => `
        <div class="physical-card skeleton">
            <div class="physical-card-image skeleton-shimmer"></div>
            <div class="physical-card-meta">
                <div class="skeleton-text skeleton-shimmer" style="width: 80%; height: 14px; margin-bottom: 6px;"></div>
                <div class="skeleton-text skeleton-shimmer" style="width: 60%; height: 12px;"></div>
            </div>
        </div>
    `).join('');

    try {
        const data = await window.smartSearch(query);
        currentArtResults = data.results || [];
        browseDisplayCount = getInitialDisplayCount();
        displaySearchResults();
    } catch (error) {
        console.error('Search failed:', error);
        cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Search failed</div>';
    }
}

// Display search results in the new format
function displaySearchResults() {
    const cardsContainer = document.getElementById('artCards');
    const showMoreBtn = document.getElementById('browseShowMore');

    if (currentArtResults.length === 0) {
        cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">No results found</div>';
        showMoreBtn.style.display = 'none';
        return;
    }

    const displayArtworks = currentArtResults.slice(0, browseDisplayCount);
    cardsContainer.innerHTML = displayArtworks.map(artwork => createPhysicalCard(artwork)).join('');

    // Show/hide "show more" button
    showMoreBtn.style.display = currentArtResults.length > browseDisplayCount ? 'block' : 'none';
}

async function loadAllArt() {
    try {
        // Load featured artworks first (instant, pre-verified)
        const featuredResponse = await fetch('/api/collections/featured?limit=30');
        const featuredData = await featuredResponse.json();

        // Show featured immediately (sorted by popularity - most iconic art first)
        allArtworks = featuredData.artworks || [];
        currentArtResults = allArtworks;
        browseDisplayCount = getInitialDisplayCount();
        displayPlaylistCards();
    } catch (error) {
        console.error('Failed to load art:', error);
    }
}

async function loadMyCollection() {
    try {
        const response = await fetch('/api/my-collection');

        // If API not available (e.g., GitHub Pages), load example data
        if (!response.ok) {
            console.log('API not available, loading example data for demo');
            const exampleResponse = await fetch('/example-data/my-collection-demo.json');
            myCollection = await exampleResponse.json();
        } else {
            myCollection = await response.json();
        }

        // Load rotation status so we can show which items are in rotation
        await loadRotationStatus();

        if (currentMode === 'my-collection') {
            displayMyCollection();
        }
    } catch (error) {
        console.error('Failed to load my collection:', error);
        // Try loading example data as fallback
        try {
            const exampleResponse = await fetch('/example-data/my-collection-demo.json');
            myCollection = await exampleResponse.json();
            if (currentMode === 'my-collection') {
                displayMyCollection();
            }
        } catch (fallbackError) {
            console.error('Failed to load example data:', fallbackError);
        }
    }
}

function displayMyCollection() {
    const grid = document.getElementById('collectionGrid');
    const showMoreBtn = document.getElementById('collectionShowMore');

    if (myCollection.length === 0) {
        grid.innerHTML = '<div class="loading">Your collection is empty</div>';
        showMoreBtn.style.display = 'none';
        return;
    }

    // Filter collection based on search query
    filteredCollection = myCollection.filter(item => {
        if (!collectionSearchQuery) return true;

        const title = item.title || item.originalPrompt || '';
        const artist = item.artist || '';
        const searchText = `${title} ${artist}`.toLowerCase();

        return searchText.includes(collectionSearchQuery);
    });

    // Sort collection
    filteredCollection.sort((a, b) => {
        const titleA = a.title || a.originalPrompt || 'Untitled';
        const titleB = b.title || b.originalPrompt || 'Untitled';
        const artistA = a.artist || '';
        const artistB = b.artist || '';
        const dateA = a.addedAt || a.timestamp || 0;
        const dateB = b.addedAt || b.timestamp || 0;

        switch (collectionSortBy) {
            case 'date-desc':
                return dateB - dateA;
            case 'date-asc':
                return dateA - dateB;
            case 'title-asc':
                return titleA.localeCompare(titleB);
            case 'title-desc':
                return titleB.localeCompare(titleA);
            case 'artist-asc':
                return artistA.localeCompare(artistB);
            default:
                return dateB - dateA;
        }
    });

    if (filteredCollection.length === 0) {
        grid.innerHTML = '<div class="loading">No items match your search</div>';
        showMoreBtn.style.display = 'none';
        return;
    }

    const displayedItems = filteredCollection.slice(0, collectionDisplayCount);
    grid.innerHTML = displayedItems.map(item => {
        // Handle different item types
        const imageUrl = item.imageUrl || (item.thumbnail ? `data:image/png;base64,${item.thumbnail}` : '');
        const title = item.title || item.originalPrompt?.substring(0, 30) || 'Untitled';
        const artist = item.artist || (item.collectionType === 'generated' ? 'Generated' : 'Uploaded');
        const itemId = item.imageId || item.id || item.filename;
        const inRotation = rotationImages.has(itemId);

        return `
            <div class="collection-item ${inRotation ? 'in-rotation' : ''}" data-image-id="${itemId}">
                <div class="collection-image-container" onclick='openCollectionItem(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
                    <img class="collection-image" src="${proxyImageUrl(imageUrl, 'medium')}" alt="${title}">
                    <div class="rotation-indicator"></div>
                    <button class="rotation-toggle-btn ${inRotation ? 'in-rotation' : ''}" onclick='event.stopPropagation(); toggleImageRotation("${itemId}")' title="${inRotation ? 'Remove from rotation' : 'Add to rotation'}">↻</button>
                    <button class="delete-btn" onclick='event.stopPropagation(); deleteCollectionItem(${JSON.stringify(item).replace(/'/g, "&apos;")})' title="Delete">×</button>
                </div>
                <div class="art-title">${title} ${artist !== 'Generated' && artist !== 'Uploaded' ? `· ${artist}` : ''}</div>
            </div>
        `;
    }).join('');

    // Show "show more" button if there are more results
    if (collectionDisplayCount < filteredCollection.length) {
        const increment = getShowMoreIncrement();
        document.getElementById('showMoreCollectionBtn').textContent = `show ${increment} more`;
        showMoreBtn.style.display = 'block';
    } else {
        showMoreBtn.style.display = 'none';
    }
}

function showMoreCollection() {
    collectionDisplayCount += getShowMoreIncrement();
    displayMyCollection();
}

// Truncate text with ellipsis
function truncateText(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

// Quick add to collection from card button
async function quickAddToCollection(art) {
    try {
        const response = await fetch('/api/my-collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(art)
        });

        if (response.ok) {
            // Brief visual feedback - could add a toast here
            console.log('Added to collection:', art.title);
            // Refresh collection if in collection mode
            if (currentMode === 'my-collection') {
                loadMyCollection();
            }
        }
    } catch (error) {
        console.error('Failed to add to collection:', error);
    }
}

function showMoreBrowse() {
    browseDisplayCount += getShowMoreIncrement();
    // Use displaySearchResults when in search results view
    const searchSection = document.getElementById('searchResultsSection');
    if (searchSection && searchSection.style.display !== 'none') {
        displaySearchResults();
    } else {
        displayPlaylistCards();
    }
}

function previewArt(art) {
    openArtModal(art, {
        source: 'search',
        showMoreLikeThis: true,
        secondaryAction: { text: 'add to collection', type: 'add' }
    });
}

async function openCollectionItem(item) {
    try {
        // Determine secondary action based on collection type
        let secondaryAction = null;
        if (item.collectionType === 'generated' || item.collectionType === 'uploaded') {
            secondaryAction = { text: 'delete', type: 'delete' };
        } else {
            // 'added', 'external', or any other type - show remove option
            secondaryAction = { text: 'remove', type: 'remove' };
        }

        openArtModal(item, {
            source: 'collection',
            showMoreLikeThis: true,  // Now enabled for collection items!
            secondaryAction
        });
    } catch (error) {
        console.error('Failed to open collection item:', error);
    }
}

function closeModal() {
    // Prevent rapid open/close issues
    if (modalTransitioning) return;
    modalTransitioning = true;
    setTimeout(() => { modalTransitioning = false; }, 150);

    document.getElementById('artModal').classList.remove('show');
    selectedModalArt = null;
    selectedHistoryItem = null;
    secondaryActionType = null;
    currentModalSource = null;
    if (reframeSaveTimeout) {
        clearTimeout(reframeSaveTimeout);
        reframeSaveTimeout = null;
    }
    document.getElementById('modalSecondaryAction').style.display = 'none';
    document.getElementById('moreLikeThisBtn').style.display = 'none';

    const modalImage = document.getElementById('modalImage');
    modalImage.classList.remove('landscape');
    cropX = 50;
    cropY = 50;
    zoomLevel = 1.0;
    modalImage.style.transform = 'scale(1)';
    modalImage.style.transformOrigin = '50% 50%';
    modalImage.style.objectPosition = '50% 50%';
    modalImage.style.objectFit = 'cover';
}

// Find similar artworks using AI
async function findSimilarArt() {
    // Support both selectedModalArt (explore/search) and selectedHistoryItem (collection)
    const artwork = selectedModalArt || selectedHistoryItem;
    if (!artwork) return;

    // Close modal and switch to explore mode
    closeModal();
    switchMode('explore');

    // Show loading state in search results
    showSearchResultsSection(`similar to "${artwork.title || 'artwork'}"`);
    const cardsContainer = document.getElementById('artCards');
    cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Finding similar artworks...</div>';

    try {
        // Use semantic similarity search (CLIP-based visual matching)
        const response = await fetch('/api/semantic/similar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                artworkId: artwork.id,
                limit: 30 // Get more similar artworks
            })
        });

        if (!response.ok) {
            throw new Error(`Similar search failed: ${response.statusText}`);
        }

        const data = await response.json();
        currentArtResults = data.results || [];
        browseDisplayCount = getInitialDisplayCount();

        // Display results in search results format
        displaySearchResults();

        // Log similarity metadata if available
        if (data.metadata) {
            console.log(`Found ${data.results.length} visually similar artworks`);
        }
    } catch (error) {
        console.error('Similar artwork search failed:', error);
        cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Failed to find similar artworks</div>';
    }
}

// Ask the guide about the current artwork
async function askAboutArtwork() {
    const artwork = selectedModalArt || selectedHistoryItem;
    if (!artwork) return;

    // Build context query
    const title = artwork.title || 'this artwork';
    const artist = artwork.artist ? ` by ${artwork.artist}` : '';
    const contextQuery = `Tell me about "${title}"${artist}. What makes it significant?`;

    // Close modal and switch to explore mode
    closeModal();
    switchMode('explore');

    // Set the search input and trigger guide
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = contextQuery;
    }

    // Send to guide if available
    if (typeof sendGuideMessage === 'function') {
        await sendGuideMessage(contextQuery);
    } else {
        // Fallback: just do a search
        await window.smartSearch(contextQuery);
    }
}

async function handleSecondaryAction() {
    const btn = document.getElementById('modalSecondaryAction');
    btn.classList.add('loading');

    try {
        if (secondaryActionType === 'add') {
            await addToCollection();
        } else if (secondaryActionType === 'delete') {
            await deleteModalImage();
        } else if (secondaryActionType === 'remove') {
            await removeFromCollection();
        }
    } finally {
        btn.classList.remove('loading');
    }
}

async function addToCollection() {
    if (!selectedModalArt) return;

    try {
        // Build request body with artwork data
        const body = {
            imageUrl: selectedModalArt.imageUrl,
            title: selectedModalArt.title,
            artist: selectedModalArt.artist,
            year: selectedModalArt.year,
            thumbnail: selectedModalArt.thumbnail,
            collectionId: selectedModalArt.collectionId,
            wikimedia: selectedModalArt.wikimedia
        };

        // Include reframe settings if user has adjusted crop/zoom
        const hasReframe = cropX !== 50 || cropY !== 50 || zoomLevel !== 1.0;
        if (hasReframe) {
            body.reframe = {
                cropX: cropX,
                cropY: cropY,
                zoomLevel: zoomLevel
            };
        }

        const response = await fetch('/api/my-collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            // Hide the action after adding
            document.getElementById('modalSecondaryAction').style.display = 'none';
            secondaryActionType = null;

            // Reload collection
            await loadMyCollection();

            console.log('Added to collection');
        } else {
            const data = await response.json();
            if (data.error === 'Artwork already in collection') {
                document.getElementById('modalSecondaryAction').style.display = 'none';
                secondaryActionType = null;
            } else {
                alert('Failed to add to collection: ' + data.error);
            }
        }
    } catch (error) {
        console.error('Add to collection failed:', error);
        alert('Failed to add to collection');
    }
}

async function removeFromCollection() {
    if (!selectedHistoryItem || !selectedHistoryItem.id) return;

    if (!confirm('Remove this artwork from your collection?')) {
        return;
    }

    try {
        const response = await fetch(`/api/my-collection/${selectedHistoryItem.id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            closeModal();
            await loadMyCollection();
        } else {
            const data = await response.json();
            alert('Failed to remove: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Remove failed:', error);
        alert('Failed to remove from collection');
    }
}

async function deleteCollectionItem(item) {
    const isExternal = item.collectionType === 'external';
    const isGenerated = item.collectionType === 'generated';
    const isUploaded = item.collectionType === 'uploaded';

    let confirmMessage;
    if (isExternal) {
        confirmMessage = 'Remove this artwork from your collection?';
    } else {
        confirmMessage = 'Delete this image permanently?';
    }

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        let response;
        if (isExternal) {
            // Remove external artwork from collection
            response = await fetch(`/api/my-collection/${item.id}`, {
                method: 'DELETE'
            });
        } else {
            // Delete generated or uploaded image
            const imageId = item.imageId || item.filename;
            response = await fetch(`/api/history/${imageId}`, {
                method: 'DELETE'
            });
        }

        if (response.ok) {
            await loadMyCollection();
        } else {
            const data = await response.json();
            alert('Failed to ' + (isExternal ? 'remove' : 'delete') + ': ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Delete/remove failed:', error);
        alert('Failed to ' + (isExternal ? 'remove' : 'delete') + ' item');
    }
}

function togglePreviewOrientation() {
    const modalImage = document.getElementById('modalImage');
    modalImage.classList.toggle('landscape');
}

// Auto-save reframe settings for collection items (debounced)
function scheduleReframeSave() {
    // Only auto-save for collection items
    if (currentModalSource !== 'collection' || !selectedHistoryItem?.id) return;

    // Clear any pending save
    if (reframeSaveTimeout) {
        clearTimeout(reframeSaveTimeout);
    }

    // Schedule save after 500ms of no changes
    reframeSaveTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`/api/my-collection/${selectedHistoryItem.id}/reframe`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reframe: { cropX, cropY, zoomLevel }
                })
            });
            if (response.ok) {
                const newReframe = { cropX, cropY, zoomLevel };
                // Update the local item's reframe so it persists
                selectedHistoryItem.reframe = newReframe;
                // Also update the local collection cache
                const collectionItem = myCollection.find(item => item.id === selectedHistoryItem.id);
                if (collectionItem) {
                    collectionItem.reframe = newReframe;
                }
                console.log('Reframe saved');
            }
        } catch (error) {
            console.error('Failed to save reframe:', error);
        }
    }, 500);
}

// Crop adjustment (position)
let cropX = 50;
let cropY = 50;
const CROP_STEP = 5;

function adjustCrop(direction) {
    const modalImage = document.getElementById('modalImage');

    switch(direction) {
        case 'up':
            cropY = Math.max(0, cropY - CROP_STEP);
            break;
        case 'down':
            cropY = Math.min(100, cropY + CROP_STEP);
            break;
        case 'left':
            cropX = Math.max(0, cropX - CROP_STEP);
            break;
        case 'right':
            cropX = Math.min(100, cropX + CROP_STEP);
            break;
        case 'reset':
            cropX = 50;
            cropY = 50;
            zoomLevel = 1.0;
            modalImage.style.transform = 'scale(1)';
            modalImage.style.transformOrigin = '50% 50%';
            break;
    }

    // Use transform-origin to control zoom focus point
    modalImage.style.transformOrigin = `${cropX}% ${cropY}%`;
    modalImage.style.objectPosition = `${cropX}% ${cropY}%`;

    // Auto-save for collection items
    scheduleReframeSave();
}

// Zoom adjustment
let zoomLevel = 1.0;
const ZOOM_STEP = 0.1;

function adjustZoom(direction) {
    const modalImage = document.getElementById('modalImage');

    switch(direction) {
        case 'in':
            zoomLevel = Math.min(2.0, zoomLevel + ZOOM_STEP);
            break;
        case 'out':
            zoomLevel = Math.max(0.5, zoomLevel - ZOOM_STEP);
            break;
        case 'fit':
            zoomLevel = 1.0;
            break;
    }

    modalImage.style.transform = `scale(${zoomLevel})`;

    if (zoomLevel < 1.0) {
        modalImage.style.objectFit = 'contain';
    } else {
        modalImage.style.objectFit = 'cover';
    }

    // Auto-save for collection items
    scheduleReframeSave();
}

// Touch zoom and pan support for mobile
let initialPinchDistance = 0;
let initialZoomLevel = 1.0;
let touchStartX = 0;
let touchStartY = 0;
let touchStartCropX = 50;
let touchStartCropY = 50;
let isTouchPanning = false;
let touchZoomInitialized = false;

function setupTouchZoom() {
    // Guard against multiple initializations (prevents duplicate listeners)
    if (touchZoomInitialized) return;
    touchZoomInitialized = true;

    const modalImage = document.getElementById('modalImage');
    const modal = document.getElementById('artModal');

    // Prevent page zoom when modal is open
    modal.addEventListener('touchmove', (e) => {
        if (e.touches.length > 1) {
            e.preventDefault(); // Prevent page zoom on pinch
        }
    }, { passive: false });

    modalImage.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Two finger pinch for zoom
            isTouchPanning = false;
            initialPinchDistance = getPinchDistance(e.touches);
            initialZoomLevel = zoomLevel;
        } else if (e.touches.length === 1) {
            // Single finger for panning
            isTouchPanning = true;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchStartCropX = cropX;
            touchStartCropY = cropY;
        }
    });

    modalImage.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            // Pinch to zoom
            e.preventDefault();
            isTouchPanning = false;
            const currentDistance = getPinchDistance(e.touches);
            const scale = currentDistance / initialPinchDistance;
            zoomLevel = Math.max(0.5, Math.min(2.0, initialZoomLevel * scale));

            modalImage.style.transform = `scale(${zoomLevel})`;

            if (zoomLevel < 1.0) {
                modalImage.style.objectFit = 'contain';
            } else {
                modalImage.style.objectFit = 'cover';
            }
        } else if (e.touches.length === 1 && isTouchPanning) {
            // Drag to pan
            e.preventDefault();
            const deltaX = e.touches[0].clientX - touchStartX;
            const deltaY = e.touches[0].clientY - touchStartY;

            // Convert pixel movement to percentage (inverse direction for natural feel)
            const sensitivity = 0.1; // Adjust sensitivity
            cropX = Math.max(0, Math.min(100, touchStartCropX - deltaX * sensitivity));
            cropY = Math.max(0, Math.min(100, touchStartCropY - deltaY * sensitivity));

            modalImage.style.transformOrigin = `${cropX}% ${cropY}%`;
            modalImage.style.objectPosition = `${cropX}% ${cropY}%`;
        }
    }, { passive: false });

    modalImage.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            initialPinchDistance = 0;
        }
        if (e.touches.length === 0) {
            isTouchPanning = false;
        }
    });
}

function getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// File upload
let dragDropInitialized = false;
function setupDragDrop() {
    // Guard against multiple initializations (prevents duplicate listeners)
    if (dragDropInitialized) return;
    dragDropInitialized = true;

    const zone = document.getElementById('dropZone');

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            handleFileUpload(files[0]);
        }
    });
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
}

async function handleFileUpload(file) {
    const overlay = document.getElementById('generationOverlay');
    const statusText = document.getElementById('generationStatusText');
    const promptText = document.getElementById('generationPromptText');
    const filenameText = document.getElementById('generationFilenameText');

    // Check file size before upload (20MB limit)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
        alert(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 20MB.`);
        return;
    }

    statusText.textContent = 'Uploading image...';
    promptText.textContent = '';
    filenameText.textContent = file.name;
    overlay.classList.add('show');

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('fileInput').value = '';
            await loadCurrentDisplay();
            overlay.classList.remove('show');
            statusText.textContent = 'Generating image...';
            filenameText.textContent = '';

            // Show duplicate message if applicable
            if (data.duplicate) {
                alert('This image already exists in your collection. Opening it now.');
            }

            // Open preview modal so user can adjust and apply
            await openGeneratedImagePreview(data.imageId || 'current');
            setTimeout(loadMyCollection, 1000);
        } else {
            overlay.classList.remove('show');
            statusText.textContent = 'Generating image...';
            filenameText.textContent = '';

            // Show helpful error message
            let errorMsg = data.error || 'Unknown error';
            if (data.hint) {
                errorMsg += '\n\n' + data.hint;
            }
            if (data.code === 'UNSUPPORTED_FORMAT') {
                errorMsg += '\n\nTip: Most phones can be set to save photos as JPEG instead of HEIC.';
            }
            alert('Upload failed: ' + errorMsg);
        }
    } catch (error) {
        console.error('Upload failed:', error);
        overlay.classList.remove('show');
        statusText.textContent = 'Generating image...';
        filenameText.textContent = '';
        alert('Upload failed: Network error. Please check your connection and try again.');
    }
}

// History (kept for generated/uploaded images)
async function openHistoryPreview(imageId) {
    try {
        const response = await fetch(`/api/images/${imageId}`);
        if (!response.ok) {
            console.error('Image not found');
            return;
        }

        const item = await response.json();

        openArtModal(item, {
            source: 'generated',
            showMoreLikeThis: false,
            secondaryAction: { text: 'delete', type: 'delete' }
        });
    } catch (error) {
        console.error('Failed to open preview:', error);
    }
}

async function applyModalArt() {
    if (!selectedModalArt && !selectedHistoryItem) return;

    const overlay = document.getElementById('generationOverlay');
    const statusText = document.getElementById('generationStatusText');
    const promptText = document.getElementById('generationPromptText');
    const filenameText = document.getElementById('generationFilenameText');

    // Save references before closing modal (closeModal sets these to null)
    const artToApply = selectedModalArt;
    const historyToApply = selectedHistoryItem;
    const modalImage = document.getElementById('modalImage');
    const isLandscape = modalImage.classList.contains('landscape');
    const rotation = isLandscape ? 90 : 0;

    // Close modal BEFORE showing overlay so overlay is visible on top
    closeModal();

    try {
        let response;

        if (historyToApply) {
            // Show loading for history items
            statusText.textContent = 'Applying image...';
            promptText.textContent = historyToApply.title || historyToApply.originalPrompt || '';
            filenameText.textContent = '';
            overlay.classList.add('show');

            response = await fetch(`/api/history/${historyToApply.imageId}/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rotation })
            });
        } else if (artToApply) {
            // Show loading for artwork import (this is the slow one!)
            statusText.textContent = 'Processing artwork...';
            promptText.textContent = `${artToApply.title}${artToApply.artist ? ' · ' + artToApply.artist : ''}`;
            filenameText.textContent = 'Downloading and optimizing for e-ink display (this may take 15-30 seconds)';
            overlay.classList.add('show');

            response = await fetch('/api/art/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: artToApply.imageUrl,
                    title: artToApply.title,
                    artist: artToApply.artist,
                    rotation: rotation
                })
            });
        }

        if (response && response.ok) {
            overlay.classList.remove('show');
            statusText.textContent = 'Generating image...';
            filenameText.textContent = '';
            setTimeout(() => loadCurrentDisplay(true), 2000);
        } else if (response) {
            overlay.classList.remove('show');
            const errorData = await response.json();
            alert('Failed to apply: ' + (errorData.error || 'Unknown error'));
        } else {
            overlay.classList.remove('show');
            alert('Failed to apply: No response received');
        }
    } catch (error) {
        console.error('Apply art failed:', error);
        overlay.classList.remove('show');
        statusText.textContent = 'Generating image...';
        filenameText.textContent = '';
        alert('Failed to apply artwork: ' + error.message);
    }
}

async function deleteModalImage() {
    if (!selectedHistoryItem) return;

    if (!confirm('Are you sure you want to delete this image?')) {
        return;
    }

    try {
        const response = await fetch(`/api/history/${selectedHistoryItem.imageId}`, { method: 'DELETE' });
        if (response.ok) {
            closeModal();
            await loadMyCollection();
        } else {
            const data = await response.json();
            alert('Failed to delete: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Delete failed:', error);
        alert('Failed to delete image');
    }
}

// ========================================
// Global Exports (for other modules)
// ========================================

// Export functions for discover.js and other modules
window.openArtModal = openArtModal;
window.performSearch = async function(query) {
    // Wrapper for guide-based search (from art-guide.js module)
    if (typeof window.sendGuideMessage === 'function') {
        await window.sendGuideMessage(query);
    }
};
window.displaySearchResults = function(artworks, title) {
    // Handle both cases: called with artworks param (discover.js) or without (searchArt)
    if (artworks && artworks.length > 0) {
        currentArtResults = artworks;
        browseDisplayCount = getInitialDisplayCount();
        showSearchResultsSection(title || 'results');
    }

    // Display current results (either just set above, or already set by searchArt)
    const cardsContainer = document.getElementById('artCards');
    const showMoreBtn = document.getElementById('browseShowMore');

    if (currentArtResults.length === 0) {
        cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">No results found</div>';
        showMoreBtn.style.display = 'none';
        return;
    }

    const displayArtworks = currentArtResults.slice(0, browseDisplayCount);
    cardsContainer.innerHTML = displayArtworks.map(artwork => createPhysicalCard(artwork)).join('');
    showMoreBtn.style.display = currentArtResults.length > browseDisplayCount ? 'block' : 'none';
};

// Additional exports for feature modules
window.defaultOrientation = defaultOrientation;
window.loadCurrentDisplay = loadCurrentDisplay;
window.openArtPreview = openArtPreview;
window.displayMyCollection = displayMyCollection;
window.displayPlaylistCards = displayPlaylistCards;
window.getInitialDisplayCount = getInitialDisplayCount;
window.searchArt = searchArt;
window.currentArtResults = currentArtResults;
window.browseDisplayCount = browseDisplayCount;

// Helper to display guide results in the art grid
window.displayGuideResults = function(results) {
    currentArtResults = results;
    browseDisplayCount = getInitialDisplayCount();

    // Show playlist label
    const playlistLabel = document.getElementById('currentPlaylist');
    const playlistName = document.getElementById('playlistName');
    if (playlistLabel && playlistName) {
        playlistLabel.style.display = 'flex';
        playlistName.textContent = 'guide results';
        const refreshBtn = document.getElementById('playlistRefresh');
        if (refreshBtn) refreshBtn.style.display = 'none';
    }

    displayPlaylistCards();
};

