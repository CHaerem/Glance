/**
 * Museum Adapter Types
 * Shared types for all museum search adapters
 */

import type { Artwork } from '../../types';

/** Museum search adapter interface */
export interface MuseumAdapter {
  /** Unique identifier for the museum source */
  id: string;
  /** Display name of the museum */
  name: string;
  /** Search for artworks */
  search: (query: string, limit: number) => Promise<Artwork[]>;
}

/** Art departments to include (paintings, drawings, prints - not decorative objects) */
export const ART_DEPARTMENTS = [
  'European Paintings',
  'Modern and Contemporary Art',
  'Drawings and Prints',
  'Asian Art',
  'American Paintings and Sculpture',
  'The Robert Lehman Collection',
  'Photographs',
];
