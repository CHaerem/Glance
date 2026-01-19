/**
 * Curated Discovery Module
 * Handles featured movements, browse by movement, and mood-based suggestions
 */

import type { Artwork } from '../types';

interface Movement {
  id: string;
  name?: string;
  period?: string;
  description?: string;
  color?: string;
  count: number;
}

interface MoodSuggestion {
  mood: string;
  description: string;
  query: string;
}

interface DiscoverData {
  libraryAvailable: boolean;
  featured?: {
    movement: Movement;
    artworks: Artwork[];
  };
  mood?: MoodSuggestion;
  movements?: Movement[];
}

interface MovementDetailData {
  movement: Movement;
  artworks: Artwork[];
}

let discoverData: DiscoverData | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _currentMovementView: MovementDetailData | null = null;

// Type for proxyImageUrl (declared in main.ts, exposed globally)
declare function proxyImageUrl(url: string, size?: string): string;

/**
 * Initialize the discover sections
 */
async function initDiscover(): Promise<void> {
  try {
    const response = await fetch('/api/discover');
    if (!response.ok) {
      console.log('Discover API not available');
      return;
    }

    discoverData = await response.json();

    if (!discoverData?.libraryAvailable) {
      console.log('Local library not available, hiding discover sections');
      return;
    }

    // Render all sections
    if (discoverData.featured) renderFeaturedSection(discoverData.featured);
    if (discoverData.mood) renderMoodSection(discoverData.mood);
    if (discoverData.movements) renderMovementsSection(discoverData.movements);

    // Set up event listeners
    setupDiscoverListeners();
  } catch (error) {
    console.error('Failed to initialize discover:', error);
  }
}

/**
 * Render the featured movement section
 */
function renderFeaturedSection(featured: { movement: Movement; artworks: Artwork[] }): void {
  const section = document.getElementById('featuredSection') as HTMLElement | null;
  if (!section || !featured.movement || !featured.artworks?.length) {
    if (section) section.style.display = 'none';
    return;
  }

  const { movement, artworks } = featured;

  const featuredTitle = document.getElementById('featuredTitle');
  const featuredPeriod = document.getElementById('featuredPeriod');
  const featuredDescription = document.getElementById('featuredDescription');

  if (featuredTitle) featuredTitle.textContent = movement.name || movement.id;
  if (featuredPeriod) featuredPeriod.textContent = movement.period || '';
  if (featuredDescription) featuredDescription.textContent = movement.description || '';

  // Render preview artworks
  const artworksContainer = document.getElementById('featuredArtworks');
  if (artworksContainer) {
    artworksContainer.innerHTML = artworks
      .slice(0, 4)
      .map((artwork) => {
        const jsonData = JSON.stringify(artwork).replace(/'/g, '&#39;');
        const imgUrl = proxyImageUrl(artwork.thumbnailUrl || artwork.imageUrl, 'small');
        return `
        <div class="featured-artwork-thumb" data-artwork='${jsonData}'>
            <img src="${imgUrl}"
                 alt="${artwork.title}"
                 loading="lazy"
                 decoding="async"
                 onload="this.parentElement.classList.add('loaded')"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/></svg>'">
        </div>
      `;
      })
      .join('');
  }

  // Store movement ID for explore button
  const exploreBtn = document.getElementById('exploreFeaturedBtn') as HTMLElement | null;
  if (exploreBtn) exploreBtn.dataset.movementId = movement.id;

  section.style.display = 'block';
}

/**
 * Render the mood suggestion section
 */
function renderMoodSection(mood: MoodSuggestion): void {
  const section = document.getElementById('moodSection') as HTMLElement | null;
  if (!section || !mood) {
    if (section) section.style.display = 'none';
    return;
  }

  const moodLabel = document.getElementById('moodLabel');
  const moodDescription = document.getElementById('moodDescription');
  const moodBtn = document.getElementById('moodBtn') as HTMLElement | null;

  if (moodLabel) moodLabel.textContent = mood.mood;
  if (moodDescription) moodDescription.textContent = mood.description;
  if (moodBtn) moodBtn.dataset.query = mood.query;

  section.style.display = 'block';
}

/**
 * Render the browse by movement section
 */
function renderMovementsSection(movements: Movement[]): void {
  const section = document.getElementById('movementsSection') as HTMLElement | null;
  const container = document.getElementById('movementsScroll');

  if (!section || !container || !movements || movements.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }

  // Sort by count (most artworks first), limit to top 15 for performance
  const sorted = [...movements].sort((a, b) => b.count - a.count).slice(0, 15);

  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  sorted.forEach((movement) => {
    const card = document.createElement('div');
    card.className = 'movement-card';
    card.dataset.movementId = movement.id;
    card.style.setProperty('--movement-color', movement.color || '#666');
    card.innerHTML = `
      <div class="movement-name">${movement.name || movement.id}</div>
      <div class="movement-period">${movement.period || ''}</div>
      <div class="movement-count">${movement.count} artworks</div>
    `;
    fragment.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
  section.style.display = 'block';
}

// Declare window extensions for functions from main.ts
declare global {
  interface Window {
    openArtModal?: (artwork: Artwork) => void;
    performSearch?: (query: string) => void;
    displaySearchResults?: (artworks: Artwork[], title: string) => void;
  }
}

/**
 * Set up event listeners for discover sections
 */
function setupDiscoverListeners(): void {
  // Featured artwork thumbnails - click to preview
  document.getElementById('featuredArtworks')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const thumb = target.closest('.featured-artwork-thumb') as HTMLElement | null;
    if (thumb && thumb.dataset.artwork) {
      try {
        const artwork = JSON.parse(thumb.dataset.artwork) as Artwork;
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
    const btn = e.currentTarget as HTMLElement;
    const movementId = btn.dataset.movementId;
    if (movementId) {
      browseMovement(movementId);
    }
  });

  // Mood button - trigger search
  document.getElementById('moodBtn')?.addEventListener('click', (e) => {
    // Use currentTarget to get the button, not the clicked text inside it
    const btn = e.currentTarget as HTMLElement;
    const query = btn.dataset.query;
    if (query && window.performSearch) {
      window.performSearch(query);
    }
  });

  // Movement cards - click to browse
  document.getElementById('movementsScroll')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const card = target.closest('.movement-card') as HTMLElement | null;
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
async function browseMovement(movementId: string): Promise<void> {
  try {
    const response = await fetch(`/api/discover/movements/${movementId}?limit=30`);
    if (!response.ok) {
      console.error('Failed to fetch movement:', response.status);
      return;
    }

    const data: MovementDetailData = await response.json();
    _currentMovementView = data;

    // Use the existing search results display
    if (window.displaySearchResults) {
      // Format artworks for display
      const formattedArtworks = data.artworks.map((a) => ({
        ...a,
        thumbnail: a.thumbnailUrl || a.imageUrl,
      }));

      // Update the title
      const title = `${data.movement.name || movementId}`;
      const resultsTitle = document.getElementById('searchResultsTitle');
      if (resultsTitle) resultsTitle.textContent = title;

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
async function getRandomLocalArtworks(count = 8, movement: string | null = null): Promise<Artwork[]> {
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

// Export module
export const Discover = {
  init: initDiscover,
  browseMovement,
  getRandomArtworks: getRandomLocalArtworks,
};

// Also export individual functions for backward compatibility
export { initDiscover, browseMovement, getRandomLocalArtworks };
