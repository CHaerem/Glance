/**
 * Museum API Service
 * Re-exports from TypeScript implementation
 */

const museumApiModule = require('../dist/src/services/museum-api');

module.exports = {
    performArtSearch: museumApiModule.performArtSearch,
    getCuratedCollections: museumApiModule.getCuratedCollections,
    CURATED_COLLECTIONS: museumApiModule.CURATED_COLLECTIONS
};
