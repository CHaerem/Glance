// Curated Discovery Module
// Handles featured movements, browse by movement, and mood-based suggestions

let discoverData = null;
let currentMovementView = null;

/**
 * Initialize the discover sections
 */
async function initDiscover() {
    try {
        const response = await fetch('/api/discover');
        if (!response.ok) {
            console.log('Discover API not available');
            return;
        }

        discoverData = await response.json();

        if (!discoverData.libraryAvailable) {
            console.log('Local library not available, hiding discover sections');
            return;
        }

        // Render all sections
        renderFeaturedSection(discoverData.featured);
        renderMoodSection(discoverData.mood);
        renderMovementsSection(discoverData.movements);

        // Set up event listeners
        setupDiscoverListeners();

    } catch (error) {
        console.error('Failed to initialize discover:', error);
    }
}

/**
 * Render the featured movement section
 */
function renderFeaturedSection(featured) {
    const section = document.getElementById('featuredSection');
    if (!featured || !featured.movement || !featured.artworks?.length) {
        section.style.display = 'none';
        return;
    }

    const { movement, artworks } = featured;

    document.getElementById('featuredTitle').textContent = movement.name || movement.id;
    document.getElementById('featuredPeriod').textContent = movement.period || '';
    document.getElementById('featuredDescription').textContent = movement.description || '';

    // Render preview artworks
    const artworksContainer = document.getElementById('featuredArtworks');
    artworksContainer.innerHTML = artworks.slice(0, 4).map(artwork => `
        <div class="featured-artwork-thumb" data-artwork='${JSON.stringify(artwork).replace(/'/g, "&#39;")}'>
            <img src="${artwork.thumbnailUrl || artwork.imageUrl}"
                 alt="${artwork.title}"
                 loading="lazy"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/></svg>'">
        </div>
    `).join('');

    // Store movement ID for explore button
    document.getElementById('exploreFeaturedBtn').dataset.movementId = movement.id;

    section.style.display = 'block';
}

/**
 * Render the mood suggestion section
 */
function renderMoodSection(mood) {
    const section = document.getElementById('moodSection');
    if (!mood) {
        section.style.display = 'none';
        return;
    }

    document.getElementById('moodLabel').textContent = mood.mood;
    document.getElementById('moodDescription').textContent = mood.description;
    document.getElementById('moodBtn').dataset.query = mood.query;

    section.style.display = 'block';
}

/**
 * Render the browse by movement section
 */
function renderMovementsSection(movements) {
    const section = document.getElementById('movementsSection');
    const container = document.getElementById('movementsScroll');

    if (!movements || movements.length === 0) {
        section.style.display = 'none';
        return;
    }

    // Sort by count (most artworks first)
    const sorted = [...movements].sort((a, b) => b.count - a.count);

    container.innerHTML = sorted.map(movement => `
        <div class="movement-card"
             data-movement-id="${movement.id}"
             style="--movement-color: ${movement.color || '#666'}">
            <div class="movement-name">${movement.name || movement.id}</div>
            <div class="movement-period">${movement.period || ''}</div>
            <div class="movement-count">${movement.count} artworks</div>
        </div>
    `).join('');

    section.style.display = 'block';
}

/**
 * Set up event listeners for discover sections
 */
function setupDiscoverListeners() {
    // Featured artwork thumbnails - click to preview
    document.getElementById('featuredArtworks')?.addEventListener('click', (e) => {
        const thumb = e.target.closest('.featured-artwork-thumb');
        if (thumb && thumb.dataset.artwork) {
            try {
                const artwork = JSON.parse(thumb.dataset.artwork);
                if (window.openArtModal) {
                    window.openArtModal(artwork);
                }
            } catch (err) {
                console.error('Failed to parse artwork data:', err);
            }
        }
    });

    // Explore featured movement button
    document.getElementById('exploreFeaturedBtn')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const movementId = btn.dataset.movementId;
        if (movementId) {
            browseMovement(movementId);
        }
    });

    // Mood button - trigger search
    document.getElementById('moodBtn')?.addEventListener('click', (e) => {
        // Use currentTarget to get the button, not the clicked text inside it
        const btn = e.currentTarget;
        const query = btn.dataset.query;
        if (query && window.performSearch) {
            window.performSearch(query);
        }
    });

    // Movement cards - click to browse
    document.getElementById('movementsScroll')?.addEventListener('click', (e) => {
        const card = e.target.closest('.movement-card');
        if (card) {
            const movementId = card.dataset.movementId;
            if (movementId) {
                browseMovement(movementId);
            }
        }
    });
}

/**
 * Browse a specific movement - show its artworks
 */
async function browseMovement(movementId) {
    try {
        const response = await fetch(`/api/discover/movements/${movementId}?limit=30`);
        if (!response.ok) {
            console.error('Failed to fetch movement:', response.status);
            return;
        }

        const data = await response.json();
        currentMovementView = data;

        // Use the existing search results display
        if (window.displaySearchResults) {
            // Format artworks for display
            const formattedArtworks = data.artworks.map(a => ({
                ...a,
                thumbnail: a.thumbnailUrl || a.imageUrl,
            }));

            // Update the title
            const title = `${data.movement.name || movementId}`;
            document.getElementById('searchResultsTitle').textContent = title;

            // Display results
            window.displaySearchResults(formattedArtworks, title);

            // Scroll to results
            document.getElementById('searchResultsSection')?.scrollIntoView({ behavior: 'smooth' });
        }

    } catch (error) {
        console.error('Failed to browse movement:', error);
    }
}

/**
 * Get random artworks from the local library
 */
async function getRandomLocalArtworks(count = 8, movement = null) {
    try {
        let url = `/api/discover/random?count=${count}`;
        if (movement) {
            url += `&movement=${encodeURIComponent(movement)}`;
        }

        const response = await fetch(url);
        if (!response.ok) return [];

        const data = await response.json();
        return data.artworks || [];

    } catch (error) {
        console.error('Failed to get random artworks:', error);
        return [];
    }
}

// Export functions for use in main.js
window.initDiscover = initDiscover;
window.browseMovement = browseMovement;
window.getRandomLocalArtworks = getRandomLocalArtworks;
