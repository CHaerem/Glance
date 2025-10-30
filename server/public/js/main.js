// Global state
let currentMode = 'create';
let currentArtResults = [];
let selectedModalArt = null;
let selectedHistoryItem = null;
let defaultOrientation = 'portrait';
let secondaryActionType = null; // 'add', 'remove', 'delete'

// Browse state
let browseDisplayCount = 8;
let collectionDisplayCount = 8;
let allArtworks = [];
let myCollection = [];
let currentFilter = 'all';

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
        browseDisplayCount = 8;
        initializeSearchSuggestions(); // Load dynamic suggestions
        if (currentArtResults.length === 0) {
            loadAllArt(); // Load initial art
        } else {
            displayArtResults();
        }
    } else if (mode === 'my-collection') {
        document.getElementById('myCollectionMode').classList.add('show');
        collectionDisplayCount = 8;
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
        browseDisplayCount = 8;
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
        myCollection = await response.json();

        if (currentMode === 'my-collection') {
            displayMyCollection();
        }
    } catch (error) {
        console.error('Failed to load my collection:', error);
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

    const displayedItems = myCollection.slice(0, collectionDisplayCount);
    grid.innerHTML = displayedItems.map(item => {
        // Handle different item types
        const imageUrl = item.imageUrl || (item.thumbnail ? `data:image/png;base64,${item.thumbnail}` : '');
        const title = item.title || item.originalPrompt?.substring(0, 30) || 'Untitled';
        const artist = item.artist || (item.collectionType === 'generated' ? 'Generated' : 'Uploaded');

        return `
            <div class="art-item" onclick='openCollectionItem(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
                <img class="art-image" src="${imageUrl}" alt="${title}">
                <div class="art-title">${title} ${artist !== 'Generated' && artist !== 'Uploaded' ? `· ${artist}` : ''}</div>
            </div>
        `;
    }).join('');

    showMoreBtn.style.display = collectionDisplayCount < myCollection.length ? 'block' : 'none';
}

function showMoreCollection() {
    collectionDisplayCount += 8;
    displayMyCollection();
}

function filterArt(collectionId) {
    currentFilter = collectionId;

    if (collectionId === 'all') {
        currentArtResults = allArtworks;
    } else {
        currentArtResults = allArtworks.filter(art => art.collectionId === collectionId);
    }

    browseDisplayCount = 8;
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
    showMoreBtn.style.display = browseDisplayCount < currentArtResults.length ? 'block' : 'none';
}

function showMoreBrowse() {
    browseDisplayCount += 8;
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
        const response = await fetch('/api/art/similar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: selectedModalArt.title,
                artist: selectedModalArt.artist,
                date: selectedModalArt.date,
                department: selectedModalArt.department,
                source: selectedModalArt.source
            })
        });

        if (!response.ok) {
            throw new Error(`Similar search failed: ${response.statusText}`);
        }

        const data = await response.json();
        currentArtResults = data.results || [];
        browseDisplayCount = 8;

        // Display results
        displayArtResults();

        // Show reasoning if available
        if (data.metadata?.reasoning) {
            console.log(`Similarity: ${data.metadata.reasoning}`);
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

    try {
        let response;
        const modalImage = document.getElementById('modalImage');
        const isLandscape = modalImage.classList.contains('landscape');
        const rotation = isLandscape ? 90 : 0;

        if (selectedHistoryItem) {
            response = await fetch(`/api/history/${selectedHistoryItem.imageId}/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rotation })
            });
        } else if (selectedModalArt) {
            response = await fetch('/api/art/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: selectedModalArt.imageUrl,
                    title: selectedModalArt.title,
                    artist: selectedModalArt.artist,
                    rotation: rotation
                })
            });
        }

        if (response && response.ok) {
            closeModal();
            setTimeout(loadCurrentDisplay, 2000);
        }
    } catch (error) {
        console.error('Apply art failed:', error);
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

