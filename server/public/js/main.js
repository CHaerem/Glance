// Global state
let currentMode = 'create';
let currentArtResults = [];
let selectedModalArt = null;
let selectedHistoryItem = null;
let defaultOrientation = 'portrait';
let secondaryActionType = null; // 'add', 'remove', 'delete'

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

// Initialize
// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadCurrentDisplay();
    loadAllArt();
    loadMyCollection();
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
        if (e.key === 'Enter') searchArt();
    });

    // AI Art Guide toggle and setup
    document.getElementById('aiGuideBtn').addEventListener('click', toggleAiGuide);
    document.getElementById('aiGuideClose').addEventListener('click', toggleAiGuide);
    document.getElementById('artifactUrlSave').addEventListener('click', saveArtifactUrl);
    document.getElementById('artifactUrlInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveArtifactUrl();
    });

    // Playlist stack navigation
    document.getElementById('stacksNavLeft').addEventListener('click', () => scrollPlaylistStacks('left'));
    document.getElementById('stacksNavRight').addEventListener('click', () => scrollPlaylistStacks('right'));
    setupPlaylistDragScroll();

    // Playlist controls
    document.getElementById('playlistClear').addEventListener('click', clearPlaylist);
    document.getElementById('playlistRefresh').addEventListener('click', refreshPlaylist);

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

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('artModal').addEventListener('click', (e) => {
        if (e.target.id === 'artModal') closeModal();
    });
    document.getElementById('orientationToggle').addEventListener('click', togglePreviewOrientation);
    document.getElementById('applyModalBtn').addEventListener('click', applyModalArt);
    document.getElementById('modalSecondaryAction').addEventListener('click', handleSecondaryAction);
    document.getElementById('moreLikeThisBtn').addEventListener('click', findSimilarArt);

    // Zoom controls (desktop only - hidden on mobile)
    document.getElementById('zoomIn').addEventListener('click', () => adjustZoom('in'));
    document.getElementById('zoomOut').addEventListener('click', () => adjustZoom('out'));
    document.getElementById('zoomFit').addEventListener('click', () => adjustZoom('fit'));

    // Position controls (desktop only - hidden on mobile)
    document.getElementById('moveUp').addEventListener('click', () => adjustCrop('up'));
    document.getElementById('moveDown').addEventListener('click', () => adjustCrop('down'));
    document.getElementById('moveLeft').addEventListener('click', () => adjustCrop('left'));
    document.getElementById('moveRight').addEventListener('click', () => adjustCrop('right'));
});

// AI Art Guide toggle
function toggleAiGuide() {
    const panel = document.getElementById('aiGuidePanel');
    const btn = document.getElementById('aiGuideBtn');
    const isVisible = panel.style.display !== 'none';

    if (isVisible) {
        panel.style.display = 'none';
        btn.classList.remove('active');
    } else {
        panel.style.display = 'block';
        btn.classList.add('active');
        loadArtifactUrl(); // Load saved URL when opening
    }
}

// AI Art Guide artifact URL management
function loadArtifactUrl() {
    const savedUrl = localStorage.getItem('glance_artifact_url');
    const iframe = document.getElementById('aiGuideFrame');
    const setup = document.getElementById('aiGuideSetup');
    const input = document.getElementById('artifactUrlInput');

    if (savedUrl && isValidArtifactUrl(savedUrl)) {
        iframe.src = savedUrl;
        iframe.classList.add('show');
        setup.classList.add('hidden');
    } else {
        iframe.classList.remove('show');
        setup.classList.remove('hidden');
        if (savedUrl) input.value = savedUrl;
    }
}

function saveArtifactUrl() {
    const input = document.getElementById('artifactUrlInput');
    const url = input.value.trim();

    if (!url) {
        alert('Please enter an artifact URL');
        return;
    }

    if (!isValidArtifactUrl(url)) {
        alert('Please enter a valid Claude artifact URL (https://claude.site/artifacts/...)');
        return;
    }

    localStorage.setItem('glance_artifact_url', url);
    loadArtifactUrl();
}

function isValidArtifactUrl(url) {
    try {
        const parsed = new URL(url);
        // Accept both /artifacts/ and /public/artifacts/ paths
        return parsed.hostname === 'claude.site' &&
               (parsed.pathname.startsWith('/artifacts/') || parsed.pathname.startsWith('/public/artifacts/'));
    } catch {
        return false;
    }
}

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
        if (currentArtResults.length === 0) {
            // Playlists will load via initializeExploreMode
        } else {
            displayPlaylistCards();
        }
    } else if (mode === 'my-collection') {
        document.getElementById('myCollectionMode').classList.add('show');
        collectionDisplayCount = getInitialDisplayCount();
        loadRotationStatus(); // Load rotation status for collection view
        displayMyCollection();
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
const playlistDataCache = new Map(); // Client-side cache for loaded playlist artworks

// Initialize explore mode with playlist stacks
async function initializeExploreMode() {
    if (!exploreInitialized) {
        await loadPlaylists();
        exploreInitialized = true;
    }
    updateStacksNavigation();
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

    // Check client-side cache first
    const cached = playlistDataCache.get(playlistId);
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
            // Cache the results client-side
            playlistDataCache.set(playlistId, { artworks: data.artworks, timestamp: Date.now() });
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

    // Handle missing images gracefully
    const imgContent = imageUrl
        ? `<img src="${imageUrl}" alt="${truncateText(title, 50)}" loading="lazy" onerror="this.parentElement.classList.add('no-image'); this.style.display='none';">`
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
function setupPlaylistDragScroll() {
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

    // Update nav buttons on scroll
    container.addEventListener('scroll', () => {
        updateStacksNavigation();
    });
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

// Load current display
async function loadCurrentDisplay() {
    try {
        const response = await fetch('/api/current-full.json');
        const data = await response.json();

        if (data.imageId && data.originalImage) {
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
        selectedHistoryItem = item;

        const imageSrc = item.originalImage
            ? `data:${item.originalImageMime || 'image/png'};base64,${item.originalImage}`
            : `data:image/png;base64,${item.thumbnail}`;

        document.getElementById('modalImage').src = imageSrc;
        applyDefaultOrientation();
        document.getElementById('deleteModalBtn').style.display = 'inline-block';
        document.getElementById('artModal').classList.add('show');
    } catch (error) {
        console.error('Failed to open preview:', error);
    }
}

// Feeling lucky
async function feelingLucky() {
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
    }
}

// Search art with AI
async function searchArt() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    // Clear playlist selection when searching
    currentPlaylistId = null;
    document.getElementById('currentPlaylist').style.display = 'none';
    renderPlaylistStacks();

    const cardsContainer = document.getElementById('artCards');
    cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Searching...</div>';

    try {
        const data = await window.smartSearch(query);
        currentArtResults = data.results || [];
        browseDisplayCount = getInitialDisplayCount();
        displayPlaylistCards();
    } catch (error) {
        console.error('Search failed:', error);
        cardsContainer.innerHTML = '<div style="color: #999; padding: 40px; text-align: center;">Search failed</div>';
    }
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
                    <img class="collection-image" src="${imageUrl}" alt="${title}">
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
    displayPlaylistCards();
}

function previewArt(art) {
    selectedModalArt = art;
    selectedHistoryItem = null;

    // Reset crop and zoom state
    cropX = 50;
    cropY = 50;
    zoomLevel = 1.0;

    const modalImage = document.getElementById('modalImage');
    modalImage.src = art.imageUrl;
    modalImage.style.transform = 'scale(1)';
    modalImage.style.transformOrigin = '50% 50%';
    modalImage.style.objectPosition = '50% 50%';
    modalImage.style.objectFit = 'cover';

    applyDefaultOrientation();

    // Show "add to collection" link
    const secondaryAction = document.getElementById('modalSecondaryAction');
    secondaryAction.textContent = 'add to collection';
    secondaryAction.style.display = 'block';
    secondaryActionType = 'add';

    // Show "More Like This" button for browse artworks
    document.getElementById('moreLikeThisBtn').style.display = 'block';

    document.getElementById('artModal').classList.add('show');
}

async function openCollectionItem(item) {
    try {
        selectedHistoryItem = item;
        selectedModalArt = null;

        // Reset crop and zoom state
        cropX = 50;
        cropY = 50;
        zoomLevel = 1.0;

        // Determine image source
        let imageSrc;
        if (item.imageUrl) {
            imageSrc = item.imageUrl;
        } else if (item.originalImage) {
            imageSrc = `data:${item.originalImageMime || 'image/png'};base64,${item.originalImage}`;
        } else if (item.thumbnail) {
            imageSrc = `data:image/png;base64,${item.thumbnail}`;
        }

        const modalImage = document.getElementById('modalImage');
        modalImage.src = imageSrc;
        modalImage.style.transform = 'scale(1)';
        modalImage.style.transformOrigin = '50% 50%';
        modalImage.style.objectPosition = '50% 50%';
        modalImage.style.objectFit = 'cover';

        applyDefaultOrientation();

        // Set appropriate secondary action
        const secondaryAction = document.getElementById('modalSecondaryAction');
        if (item.collectionType === 'generated' || item.collectionType === 'uploaded') {
            secondaryAction.textContent = 'delete';
            secondaryAction.style.display = 'block';
            secondaryActionType = 'delete';
        } else if (item.collectionType === 'added') {
            secondaryAction.textContent = 'remove from collection';
            secondaryAction.style.display = 'block';
            secondaryActionType = 'remove';
        } else {
            secondaryAction.style.display = 'none';
            secondaryActionType = null;
        }

        document.getElementById('artModal').classList.add('show');
    } catch (error) {
        console.error('Failed to open collection item:', error);
    }
}

function closeModal() {
    document.getElementById('artModal').classList.remove('show');
    selectedModalArt = null;
    selectedHistoryItem = null;
    secondaryActionType = null;
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
    if (!selectedModalArt) return;

    // Close modal and switch to explore mode
    closeModal();
    switchMode('explore');

    // Show loading state
    const grid = document.getElementById('artGrid');
    grid.innerHTML = '<div class="loading">Finding similar artworks...</div>';

    try {
        // Use semantic similarity search (CLIP-based visual matching)
        const response = await fetch('/api/semantic/similar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                artworkId: selectedModalArt.id,
                limit: 30 // Get more similar artworks
            })
        });

        if (!response.ok) {
            throw new Error(`Similar search failed: ${response.statusText}`);
        }

        const data = await response.json();
        currentArtResults = data.results || [];
        browseDisplayCount = getInitialDisplayCount();

        // Display results
        displayArtResults();

        // Log similarity metadata if available
        if (data.metadata) {
            console.log(`Found ${data.results.length} visually similar artworks using CLIP embeddings`);
        }
    } catch (error) {
        console.error('Similar artwork search failed:', error);
        grid.innerHTML = '<div class="loading">Failed to find similar artworks</div>';
    }
}

async function handleSecondaryAction() {
    if (secondaryActionType === 'add') {
        await addToCollection();
    } else if (secondaryActionType === 'delete') {
        await deleteModalImage();
    } else if (secondaryActionType === 'remove') {
        await removeFromCollection();
    }
}

async function addToCollection() {
    if (!selectedModalArt) return;

    try {
        const response = await fetch('/api/my-collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl: selectedModalArt.imageUrl,
                title: selectedModalArt.title,
                artist: selectedModalArt.artist,
                year: selectedModalArt.year,
                thumbnail: selectedModalArt.thumbnail,
                collectionId: selectedModalArt.collectionId,
                wikimedia: selectedModalArt.wikimedia
            })
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
}

// Touch zoom and pan support for mobile
let initialPinchDistance = 0;
let initialZoomLevel = 1.0;
let touchStartX = 0;
let touchStartY = 0;
let touchStartCropX = 50;
let touchStartCropY = 50;
let isTouchPanning = false;

function setupTouchZoom() {
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
function setupDragDrop() {
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
        selectedHistoryItem = item;

        const imageSrc = item.originalImage
            ? `data:${item.originalImageMime || 'image/png'};base64,${item.originalImage}`
            : `data:image/png;base64,${item.thumbnail}`;

        document.getElementById('modalImage').src = imageSrc;
        applyDefaultOrientation();
        document.getElementById('deleteModalBtn').style.display = 'inline-block';
        document.getElementById('artModal').classList.add('show');
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
            setTimeout(loadCurrentDisplay, 2000);
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

// ============================================
// ROTATION FUNCTIONS (for collection mode)
// ============================================

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

// Load rotation status from server
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

// Update the rotation status bar in collection view
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

// Toggle an image in/out of rotation
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

// Save rotation to server
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

// Cycle through modes
function cycleRotationMode() {
    rotationMode = rotationMode === 'random' ? 'sequential' : 'random';
    document.getElementById('rotationModeToggle').textContent =
        rotationMode === 'random' ? 'shuffle' : 'in order';

    // Update server with new mode
    if (rotationImages.size >= 2) {
        saveRotation(true);
    }
}

// Cycle through intervals
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

// Stop rotation
async function stopRotation() {
    try {
        await fetch('/api/playlist', { method: 'DELETE' });
        rotationImages.clear();
        rotationActive = false;
        updateRotationStatusBar();
        displayMyCollection(); // Refresh to update toggle buttons
    } catch (error) {
        console.error('Error stopping rotation:', error);
    }
}

