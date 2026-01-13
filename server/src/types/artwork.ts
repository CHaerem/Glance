/**
 * Artwork Type Definitions
 * Museum API results, search, and display
 */

// Museum source identifiers
export type MuseumSource =
  | 'met'
  | 'artic'
  | 'cleveland'
  | 'rijksmuseum'
  | 'harvard'
  | 'smithsonian'
  | 'europeana'
  | 'wikimedia';

// Basic artwork information
export interface Artwork {
  id: string;
  title: string;
  artist: string;
  date: string;
  imageUrl: string;
  thumbnailUrl: string;
  source: MuseumSource | string;
  museum?: string;
  description?: string;
  medium?: string;
  dimensions?: string;
  creditLine?: string;
  classification?: string;
  department?: string;
  culture?: string;
  period?: string;
}

// Search result with metadata
export interface SearchResult {
  results: Artwork[];
  metadata?: {
    query?: string;
    searchQuery?: string;
    resultsCount?: number;
    searchType?: 'keyword' | 'semantic' | 'random';
    sources?: string[];
    parameters?: SmartSearchParams;
    originalQuery?: string;
  };
}

// Smart search parameters (from OpenAI extraction)
export interface SmartSearchParams {
  searchTerms?: string[];
  styles?: string[];
  colors?: string[];
  moods?: string[];
  subjects?: string[];
}

// History entry (displayed artwork record)
export interface HistoryEntry {
  imageId: string;
  title: string;
  timestamp: number;
  contentHash?: string;
  dithered?: boolean;
  source?: string;
  artist?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
}

// Collection entry (saved artwork)
export interface CollectionEntry {
  id: string;
  title: string;
  artist: string;
  date: string;
  source: string;
  imageUrl: string;
  thumbnailUrl: string;
  addedAt: number;
}

// Current display state
export interface CurrentDisplay {
  title: string;
  image: string;
  imageId: string;
  timestamp: number;
  sleepDuration: number;
  devServerHost?: string;
  artwork?: Artwork;
  artist?: string;
  source?: string;
  thumbnailUrl?: string;
}

// Playlist definition
export interface Playlist {
  id: string;
  name: string;
  description: string;
  type: 'curated' | 'dynamic';
  searchQuery?: string;
  artworks?: Artwork[];
  count?: number;
}

// Curated collection definition
export interface CuratedCollection {
  id: string;
  name: string;
  description: string;
  museum: string;
  artworks: Array<{
    id: string;
    source: MuseumSource;
  }>;
}

// AI search result storage
export interface AISearchResult {
  query: string;
  results: Artwork[];
  timestamp: number;
  sessionId?: string;
}
