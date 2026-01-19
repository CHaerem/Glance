/**
 * Art Filter
 * Filters museum results to include only actual art (not furniture, ceramics, etc.)
 */

import { loggers } from '../logger';

const log = loggers.api;

/**
 * Check if an item is actual art (not furniture, ceramics, etc.)
 * We focus on 2D art (paintings, drawings, prints) as they display best on e-ink
 */
export function isOriginalArtwork(
  title: string | null | undefined,
  classification: string | null | undefined,
  objectName: string | null | undefined,
  medium: string | null | undefined,
  objectType: string | null | undefined
): boolean {
  const lowerTitle = (title ?? '').toLowerCase();
  const lowerClass = (classification ?? '').toLowerCase();
  const lowerObject = (objectName ?? '').toLowerCase();
  const lowerMedium = (medium ?? '').toLowerCase();
  const lowerType = (objectType ?? '').toLowerCase();

  const allText = `${lowerTitle} ${lowerClass} ${lowerObject} ${lowerMedium} ${lowerType}`;

  // Exclude book pages, photographs of objects, etc.
  const hardExcludeTerms = [
    'page from a book',
    'page from an album',
    'photograph of',
    'illustrated book',
    'title page',
    'frontispiece',
    'book cover',
  ];

  for (const term of hardExcludeTerms) {
    if (allText.includes(term)) {
      log.debug('Filtering out item', { title, reason: 'hard exclude', term });
      return false;
    }
  }

  // Exclude non-art object types (furniture, decorative arts, sculptures, etc.)
  const excludeObjectTypes = [
    'furniture',
    'table',
    'chair',
    'desk',
    'cabinet',
    'chest',
    'bed',
    'bench',
    'stool',
    'armchair',
    'ceramic',
    'ceramics',
    'pottery',
    'porcelain',
    'vase',
    'bowl',
    'plate',
    'dish',
    'cup',
    'teapot',
    'jar',
    'textile',
    'costume',
    'dress',
    'robe',
    'coat',
    'tapestry',
    'carpet',
    'rug',
    'embroidery',
    'lace',
    'jewelry',
    'jewellery',
    'necklace',
    'ring',
    'bracelet',
    'brooch',
    'pendant',
    'earring',
    'metalwork',
    'silverware',
    'goldwork',
    'bronze object',
    'copper object',
    'glass',
    'glassware',
    'bottle',
    'goblet',
    'clock',
    'watch',
    'timepiece',
    'weapon',
    'sword',
    'armor',
    'armour',
    'shield',
    'dagger',
    'gun',
    'pistol',
    'coin',
    'medal',
    'medallion',
    'numismatic',
    'tool',
    'implement',
    'utensil',
    'spoon',
    'fork',
    'knife',
    'figurine',
    'statuette',
    'ornament',
    'decorative object',
    'mask',
    'helmet',
    'musical instrument',
    'piano',
    'violin',
    'guitar',
    'model',
    'miniature model',
    'manuscript',
    'document',
    'letter',
    'certificate',
    'tile',
    'tiles',
    'sculpture',
    'sculpted',
    'bronze',
    'marble statue',
    'stone carving',
    'relief',
  ];

  for (const term of excludeObjectTypes) {
    if (
      lowerObject.includes(term) ||
      lowerClass.includes(term) ||
      lowerType.includes(term)
    ) {
      log.debug('Filtering out item', { title, reason: 'object type', term });
      return false;
    }
  }

  // Also check title for obvious non-art items
  const titleExcludes = [
    'chair',
    'table',
    'cabinet',
    'vase',
    'bowl',
    'plate',
    'teapot',
    'cup and saucer',
    'dress',
    'robe',
    'costume',
    'textile fragment',
    'carpet',
    'rug',
    'necklace',
    'ring',
    'bracelet',
    'brooch',
    'earrings',
    'clock',
    'watch',
    'sword',
    'dagger',
    'armor',
    'helmet',
    'coin',
    'medal',
    'spoon',
    'fork',
    'knife',
    'tile',
  ];

  for (const term of titleExcludes) {
    if (
      lowerTitle.includes(term) &&
      !lowerTitle.includes('painting') &&
      !lowerTitle.includes('portrait')
    ) {
      log.debug('Filtering out item', {
        title,
        reason: 'title suggests non-art',
        term,
      });
      return false;
    }
  }

  return true;
}
