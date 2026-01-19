/**
 * Frontend Type Definitions
 */

// Artwork types
export interface Artwork {
  id: string;
  title: string;
  artist?: string;
  artistId?: string;
  date?: string;
  medium?: string;
  dimensions?: string;
  department?: string;
  culture?: string;
  museum?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  thumbnail?: string;
  primaryImage?: string;
  webUrl?: string;
  description?: string;
  addedAt?: string;
  embedding?: number[];
}

// Search result from API
export interface SearchResult {
  results: Artwork[];
  total?: number;
  page?: number;
  hasMore?: boolean;
}

// Playlist types
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  type: 'curated' | 'dynamic';
  query?: string;
  artworks?: Artwork[];
  count?: number;
}

// Current display info
export interface CurrentDisplay {
  id?: string;
  title?: string;
  artist?: string;
  image?: string;
  timestamp?: string;
}

// Device status
export interface DeviceStatus {
  batteryVoltage?: number;
  batteryPercentage?: number;
  charging?: boolean;
  wifiSignal?: number;
  firmwareVersion?: string;
  lastSeen?: string;
}

// Settings
export interface Settings {
  defaultOrientation: 'portrait' | 'landscape';
  sleepDuration?: number;
  autoRotate?: boolean;
}

// Guide chat response
export interface GuideResponse {
  message: string;
  results?: Artwork[];
  displayed?: boolean;
  action?: string;
}

// Now Playing state
export interface NowPlayingState {
  active: boolean;
  paused: boolean;
  artworks: Artwork[];
  currentIndex: number;
  playlistName: string;
  shuffle: boolean;
  interval: number;
  timer: ReturnType<typeof setInterval> | null;
}

// Rotation state
export interface RotationState {
  images: Set<string>;
  mode: 'random' | 'sequential';
  interval: number;
  active: boolean;
}

// Hint types for art guide
export interface Hint {
  label: string;
  query?: string;
  action?: string;
}

export interface HintPools {
  morning: Hint[];
  afternoon: Hint[];
  evening: Hint[];
  night: Hint[];
  moods: Hint[];
  subjects: Hint[];
  context: Hint[];
}

// Interval option for selectors
export interface IntervalOption {
  value: number;
  label: string;
}

// History item
export interface HistoryItem {
  id: string;
  title?: string;
  artist?: string;
  thumbnailUrl?: string;
  timestamp?: string;
}

// Modal art selection
export interface ModalArt extends Artwork {
  rotation?: number;
}

// Window global extensions
declare global {
  interface Window {
    // Feature modules
    NowPlaying: typeof import('../features/now-playing').NowPlaying;
    Rotation: typeof import('../features/rotation').Rotation;
    ArtGuide: typeof import('../features/art-guide').ArtGuide;
    Search: typeof import('../features/search').Search;
    Discover: typeof import('../features/discover').Discover;
    LazyLoad: typeof import('../utils/lazy-load').LazyLoad;

    // Global state and functions from main.ts
    currentArtResults: Artwork[];
    browseDisplayCount: number;
    defaultOrientation: 'portrait' | 'landscape';
    loadCurrentDisplay: (force?: boolean) => Promise<void>;
    openArtPreview: (art: Artwork) => void;
    displayMyCollection: () => void;
    displayPlaylistCards: () => void;
    getInitialDisplayCount: () => number;
    searchArt: () => Promise<void>;
    displayGuideResults: (results: Artwork[]) => void;

    // Backward compatibility exports
    initGuideDrawer: () => void;
    isConversationalQuery: (query: string) => boolean;
    handleSearchOrGuide: (query: string) => Promise<void>;
    sendGuideMessage: (message: string) => Promise<void>;
    setupDiscoverySuggestions: () => void;
    refreshDiscoveryHints: () => void;
    surpriseMe: () => Promise<void>;
    loadRotationStatus: () => Promise<void>;
    updateRotationStatusBar: () => void;
    toggleImageRotation: (imageId: string) => Promise<void>;
    saveRotation: (active?: boolean) => Promise<void>;
    cycleRotationMode: () => void;
    cycleRotationInterval: () => void;
    stopRotation: () => Promise<void>;
    rotationImages: Set<string>;
    initNowPlayingBar: () => void;
    startNowPlaying: (artworks: Artwork[], playlistName?: string) => void;
    stopNowPlaying: () => void;
  }
}

export {};
