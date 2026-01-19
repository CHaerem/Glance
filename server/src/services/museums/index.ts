/**
 * Museum Adapters Index
 * Exports all museum search adapters
 */

export * from './types';
export * from './art-filter';

export { metAdapter } from './met';
export { articAdapter } from './artic';
export { clevelandAdapter } from './cleveland';
export { rijksmuseumAdapter } from './rijksmuseum';
export { wikimediaAdapter } from './wikimedia';
export { vandaAdapter } from './vanda';
export { harvardAdapter } from './harvard';
export { smithsonianAdapter } from './smithsonian';

import { metAdapter } from './met';
import { articAdapter } from './artic';
import { clevelandAdapter } from './cleveland';
import { rijksmuseumAdapter } from './rijksmuseum';
import { wikimediaAdapter } from './wikimedia';
import { vandaAdapter } from './vanda';
import { harvardAdapter } from './harvard';
import { smithsonianAdapter } from './smithsonian';
import type { MuseumAdapter } from './types';

/** All museum adapters */
export const allAdapters: MuseumAdapter[] = [
  metAdapter,
  articAdapter,
  clevelandAdapter,
  rijksmuseumAdapter,
  wikimediaAdapter,
  vandaAdapter,
  harvardAdapter,
  smithsonianAdapter,
];
