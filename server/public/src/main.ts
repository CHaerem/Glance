/**
 * Main Entry Point for Glance Frontend
 *
 * This file imports all feature modules and exposes them globally for use in the app.
 * The remaining non-modularized code is still in public/js/main.js.
 */

// Import type definitions
import './types';

// Import feature modules
import { NowPlaying, initNowPlayingBar, startNowPlaying, stopNowPlaying } from './features/now-playing';
import { Rotation, loadRotationStatus, updateRotationStatusBar, toggleImageRotation, saveRotation, cycleRotationMode, cycleRotationInterval, stopRotation, rotationImages } from './features/rotation';
import { ArtGuide, initGuideDrawer, isConversationalQuery, handleSearchOrGuide, sendGuideMessage, setupDiscoverySuggestions, refreshDiscoveryHints, surpriseMe } from './features/art-guide';
import { Search, smartSearch, getSearchSuggestions, formatSearchResults, getRecentSearches, clearSearchCache, clearSearchHistory } from './features/search';
import { Discover, initDiscover, browseMovement, getRandomLocalArtworks } from './features/discover';
import { LazyLoad } from './utils/lazy-load';

// Expose modules globally
window.NowPlaying = NowPlaying;
window.Rotation = Rotation;
window.ArtGuide = ArtGuide;
window.Search = Search;
window.Discover = Discover;
window.LazyLoad = LazyLoad;

// Expose individual functions for backward compatibility

// Now Playing
window.initNowPlayingBar = initNowPlayingBar;
window.startNowPlaying = startNowPlaying;
window.stopNowPlaying = stopNowPlaying;

// Rotation
window.loadRotationStatus = loadRotationStatus;
window.updateRotationStatusBar = updateRotationStatusBar;
window.toggleImageRotation = toggleImageRotation;
window.saveRotation = saveRotation;
window.cycleRotationMode = cycleRotationMode;
window.cycleRotationInterval = cycleRotationInterval;
window.stopRotation = stopRotation;
window.rotationImages = rotationImages;

// Art Guide
window.initGuideDrawer = initGuideDrawer;
window.isConversationalQuery = isConversationalQuery;
window.handleSearchOrGuide = handleSearchOrGuide;
window.sendGuideMessage = sendGuideMessage;
window.setupDiscoverySuggestions = setupDiscoverySuggestions;
window.refreshDiscoveryHints = refreshDiscoveryHints;
window.surpriseMe = surpriseMe;

// Search
(window as unknown as { smartSearch: typeof smartSearch }).smartSearch = smartSearch;
(window as unknown as { getSearchSuggestions: typeof getSearchSuggestions }).getSearchSuggestions = getSearchSuggestions;
(window as unknown as { formatSearchResults: typeof formatSearchResults }).formatSearchResults = formatSearchResults;
(window as unknown as { getRecentSearches: typeof getRecentSearches }).getRecentSearches = getRecentSearches;
(window as unknown as { clearSearchCache: typeof clearSearchCache }).clearSearchCache = clearSearchCache;
(window as unknown as { clearSearchHistory: typeof clearSearchHistory }).clearSearchHistory = clearSearchHistory;

// Discover
(window as unknown as { initDiscover: typeof initDiscover }).initDiscover = initDiscover;
(window as unknown as { browseMovement: typeof browseMovement }).browseMovement = browseMovement;
(window as unknown as { getRandomLocalArtworks: typeof getRandomLocalArtworks }).getRandomLocalArtworks = getRandomLocalArtworks;

// Lazy Load (auto-initialized by the module)

console.log('Glance frontend modules loaded');
