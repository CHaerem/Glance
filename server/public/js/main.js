// Global state
let currentMode = 'create';
let currentArtResults = [];
let selectedModalArt = null;
let selectedHistoryItem = null;
let defaultOrientation = 'portrait';
let secondaryActionType = null; // 'add', 'remove', 'delete'

// Theme management
function initTheme() {
    // Check for saved theme preference or default to system preference
    const savedTheme = localStorage.getItem('theme');
    const root = document.documentElement;

    if (savedTheme && savedTheme !== 'auto') {
        root.setAttribute('data-theme', savedTheme);
    } else {
        root.removeAttribute('data-theme');
    }
}

// Browse state
let browseDisplayCount = getInitialDisplayCount();
let collectionDisplayCount = getInitialDisplayCount();
let allArtworks = [];
let myCollection = [];
let filteredCollection = [];
let currentFilter = 'all';
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
    initTheme();
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

    document.getElementById('generateBtn').addEventListener('click', generateArt);
    document.getElementById('luckyBtn').addEventListener('click', feelingLucky);

    document.getElementById('dropZone').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchArt();
    });

    document.querySelectorAll('.suggestion-link').forEach(btn => {
        btn.addEventListener('click', (e) => suggestSearch(e.target.dataset.query));
    });

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
        initializeSearchSuggestions(); // Load dynamic suggestions
        if (currentArtResults.length === 0) {
            loadAllArt(); // Load initial art
        } else {
            displayArtResults();
        }
    } else if (mode === 'my-collection') {
        document.getElementById('myCollectionMode').classList.add('show');
        collectionDisplayCount = getInitialDisplayCount();
        displayMyCollection();
    }

    // Update tab colors
    document.getElementById('createLink').style.color = mode === 'create' ? '#1a1a1a' : '#999';
    document.getElementById('exploreLink').style.color = mode === 'explore' ? '#1a1a1a' : '#999';
    document.getElementById('myCollectionLink').style.color = mode === 'my-collection' ? '#1a1a1a' : '#999';
}

// Suggestion click
function suggestSearch(query) {
    document.getElementById('searchInput').value = query;
    searchArt();
}

// Initialize search suggestions
function initializeSearchSuggestions() {
    const suggestions = window.getSearchSuggestions();
    const container = document.querySelector('#exploreMode .suggestion-link').parentElement;

    // Clear existing suggestions (keep the "Try:" text)
    const tryText = container.querySelector('span');
    container.innerHTML = '';
    container.appendChild(tryText);

    // Add suggestion links
    suggestions.forEach((suggestion, index) => {
        const btn = document.createElement('button');
        btn.className = 'mode-link suggestion-link';
        btn.dataset.query = suggestion;
        btn.textContent = suggestion;
        btn.addEventListener('click', (e) => suggestSearch(e.target.dataset.query));
        container.appendChild(btn);

        // Add separator dot between suggestions (not after last one)
        if (index < suggestions.length - 1) {
            const separator = document.createElement('span');
            separator.style.color = '#e5e5e5';
            separator.textContent = '·';
            container.appendChild(separator);
        }
    });
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

    const grid = document.getElementById('artGrid');
    grid.innerHTML = '<div class="loading">Searching...</div>';

    try {
        const data = await window.smartSearch(query);
        currentArtResults = data.results || [];
        browseDisplayCount = getInitialDisplayCount();
        displayArtResults();
    } catch (error) {
        console.error('Search failed:', error);
        grid.innerHTML = '<div class="loading">Search failed</div>';
    }
}

async function loadAllArt() {
    try {
        const response = await fetch('/api/collections');
        const data = await response.json();

        allArtworks = [];
        for (const collection of data.collections) {
            const collResponse = await fetch(`/api/collections/${collection.id}`);
            const collData = await collResponse.json();
            collData.artworks.forEach(artwork => {
                artwork.collectionId = collection.id;
                allArtworks.push(artwork);
            });
        }

        filterArt('all');
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
        const itemId = item.id || item.filename;

        return `
            <div class="collection-item">
                <div class="collection-image-container" onclick='openCollectionItem(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
                    <img class="collection-image" src="${imageUrl}" alt="${title}">
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

function filterArt(collectionId) {
    currentFilter = collectionId;

    if (collectionId === 'all') {
        currentArtResults = allArtworks;
    } else {
        currentArtResults = allArtworks.filter(art => art.collectionId === collectionId);
    }

    browseDisplayCount = getInitialDisplayCount();
    displayArtResults();
}

function displayArtResults() {
    const grid = document.getElementById('artGrid');
    const showMoreBtn = document.getElementById('browseShowMore');

    if (currentArtResults.length === 0) {
        grid.innerHTML = '<div class="loading">No results</div>';
        showMoreBtn.style.display = 'none';
        return;
    }

    const displayedResults = currentArtResults.slice(0, browseDisplayCount);
    grid.innerHTML = displayedResults.map(art => `
        <div class="art-item" onclick='previewArt(${JSON.stringify(art).replace(/'/g, "&apos;")})'>
            <img class="art-image" src="${art.thumbnail || art.imageUrl}" alt="${art.title}">
            <div class="art-title">${art.title}</div>
        </div>
    `).join('');

    // Show "show more" button if there are more results
    if (browseDisplayCount < currentArtResults.length) {
        const increment = getShowMoreIncrement();
        document.getElementById('showMoreBrowseBtn').textContent = `show ${increment} more`;
        showMoreBtn.style.display = 'block';
    } else {
        showMoreBtn.style.display = 'none';
    }
}

function showMoreBrowse() {
    browseDisplayCount += getShowMoreIncrement();
    displayArtResults();
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

        if (response.ok) {
            const data = await response.json();
            document.getElementById('fileInput').value = '';
            await loadCurrentDisplay();
            overlay.classList.remove('show');
            statusText.textContent = 'Generating image...';
            filenameText.textContent = '';

            await openGeneratedImagePreview(data.imageId || 'current');
            setTimeout(loadMyCollection, 1000);
        } else {
            overlay.classList.remove('show');
            statusText.textContent = 'Generating image...';
            filenameText.textContent = '';
            const errorData = await response.json();
            alert('Upload failed: ' + (errorData.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Upload failed:', error);
        overlay.classList.remove('show');
        statusText.textContent = 'Generating image...';
        filenameText.textContent = '';
        alert('Upload failed: ' + error.message);
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

