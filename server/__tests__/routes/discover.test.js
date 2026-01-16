/**
 * Tests for discover routes
 *
 * Note: The /api/discover endpoint uses internal caching (5 min TTL, keyed by day+hour).
 * Tests are structured to work with this caching behavior.
 */

const request = require('supertest');
const express = require('express');

// Mock local-library before importing routes
jest.mock('../../src/services/local-library', () => ({
  isLocalLibraryAvailable: jest.fn(),
  getAvailableMovements: jest.fn(),
  getRandomLocalArtworks: jest.fn(),
  getArtworksByMovement: jest.fn(),
  getLibraryStats: jest.fn(),
}));

const localLibrary = require('../../src/services/local-library');

// Mock data
const mockMovements = [
  { id: 'impressionism', count: 150 },
  { id: 'pop-art', count: 80 },
  { id: 'surrealism', count: 60 },
];

const mockArtworks = [
  {
    id: 'local-1',
    title: 'Water Lilies',
    artist: 'Claude Monet',
    date: '1906',
    imageUrl: '/art-library/impressionism/monet-waterlilies.jpg',
    thumbnailUrl: '/art-library/impressionism/thumbs/monet-waterlilies.jpg',
    source: 'local-library',
    classification: 'impressionism',
  },
  {
    id: 'local-2',
    title: "Campbell's Soup Cans",
    artist: 'Andy Warhol',
    date: '1962',
    imageUrl: '/art-library/pop-art/warhol-soup.jpg',
    thumbnailUrl: '/art-library/pop-art/thumbs/warhol-soup.jpg',
    source: 'local-library',
    classification: 'pop-art',
  },
];

const mockStats = {
  available: true,
  totalArtworks: 5460,
  lastSync: '2024-01-15T10:00:00Z',
  byMovement: {
    'impressionism': 150,
    'pop-art': 80,
    'surrealism': 60,
  },
};

// Helper to create a fresh app with new router instance
function createTestApp() {
  // Reset modules to get fresh router with empty cache
  jest.resetModules();

  // Re-require after reset
  const { createDiscoverRouter } = require('../../src/routes/discover');
  const localLib = require('../../src/services/local-library');

  const app = express();
  app.use(express.json());
  app.use('/api/discover', createDiscoverRouter());

  return { app, localLib };
}

describe('Discover Routes', () => {
  describe('GET /api/discover', () => {
    it('should return discover feed when library is available', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getLibraryStats.mockResolvedValue(mockStats);
      localLib.getAvailableMovements.mockResolvedValue(mockMovements);
      localLib.getArtworksByMovement.mockResolvedValue(mockArtworks.slice(0, 4));

      const response = await request(app)
        .get('/api/discover')
        .expect(200);

      expect(response.body).toHaveProperty('libraryAvailable', true);
      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('featured');
      expect(response.body).toHaveProperty('mood');
      expect(response.body).toHaveProperty('movements');
      expect(Array.isArray(response.body.movements)).toBe(true);
    });

    it('should return empty data when library is not available', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(false);
      localLib.getLibraryStats.mockResolvedValue(null);
      localLib.getAvailableMovements.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/discover')
        .expect(200);

      expect(response.body.libraryAvailable).toBe(false);
      expect(response.body.movements).toEqual([]);
    });

    it('should include mood suggestion based on time', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getLibraryStats.mockResolvedValue(mockStats);
      localLib.getAvailableMovements.mockResolvedValue(mockMovements);
      localLib.getArtworksByMovement.mockResolvedValue(mockArtworks);

      const response = await request(app)
        .get('/api/discover')
        .expect(200);

      expect(response.body.mood).toHaveProperty('mood');
      expect(response.body.mood).toHaveProperty('query');
      expect(response.body.mood).toHaveProperty('description');
    });

    it('should enrich movements with metadata', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getLibraryStats.mockResolvedValue(mockStats);
      localLib.getAvailableMovements.mockResolvedValue(mockMovements);
      localLib.getArtworksByMovement.mockResolvedValue(mockArtworks);

      const response = await request(app)
        .get('/api/discover')
        .expect(200);

      const impressionism = response.body.movements.find(m => m.id === 'impressionism');
      expect(impressionism).toBeDefined();
      expect(impressionism).toHaveProperty('name', 'Impressionism');
      expect(impressionism).toHaveProperty('period');
      expect(impressionism).toHaveProperty('description');
      expect(impressionism).toHaveProperty('color');
    });

    it('should set cache headers', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getLibraryStats.mockResolvedValue(mockStats);
      localLib.getAvailableMovements.mockResolvedValue(mockMovements);
      localLib.getArtworksByMovement.mockResolvedValue(mockArtworks);

      // First request - should be MISS
      const response1 = await request(app)
        .get('/api/discover')
        .expect(200);

      expect(response1.headers['x-cache']).toBe('MISS');

      // Second request - should be HIT
      const response2 = await request(app)
        .get('/api/discover')
        .expect(200);

      expect(response2.headers['x-cache']).toBe('HIT');
    });
  });

  describe('GET /api/discover/movements', () => {
    it('should return list of movements', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getAvailableMovements.mockResolvedValue(mockMovements);

      const response = await request(app)
        .get('/api/discover/movements')
        .expect(200);

      expect(response.body).toHaveProperty('movements');
      expect(response.body).toHaveProperty('available', true);
      expect(Array.isArray(response.body.movements)).toBe(true);
    });

    it('should return empty when library not available', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(false);

      const response = await request(app)
        .get('/api/discover/movements')
        .expect(200);

      expect(response.body.movements).toEqual([]);
      expect(response.body.available).toBe(false);
    });

    it('should include enriched movement data', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getAvailableMovements.mockResolvedValue(mockMovements);

      const response = await request(app)
        .get('/api/discover/movements')
        .expect(200);

      const movement = response.body.movements.find(m => m.id === 'impressionism');
      expect(movement).toHaveProperty('name');
      expect(movement).toHaveProperty('period');
      expect(movement).toHaveProperty('count', 150);
    });
  });

  describe('GET /api/discover/movements/:id', () => {
    it('should return artworks for a movement', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getArtworksByMovement.mockResolvedValue(mockArtworks);

      const response = await request(app)
        .get('/api/discover/movements/impressionism')
        .expect(200);

      expect(response.body).toHaveProperty('movement');
      expect(response.body.movement.id).toBe('impressionism');
      expect(response.body).toHaveProperty('artworks');
      expect(response.body).toHaveProperty('count');
    });

    it('should respect limit parameter', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getArtworksByMovement.mockResolvedValue(mockArtworks.slice(0, 1));

      await request(app)
        .get('/api/discover/movements/impressionism?limit=1')
        .expect(200);

      expect(localLib.getArtworksByMovement).toHaveBeenCalledWith('impressionism', 1);
    });

    it('should cap limit at 50', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getArtworksByMovement.mockResolvedValue(mockArtworks);

      await request(app)
        .get('/api/discover/movements/impressionism?limit=100')
        .expect(200);

      expect(localLib.getArtworksByMovement).toHaveBeenCalledWith('impressionism', 50);
    });

    it('should return 404 when library not available', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(false);

      await request(app)
        .get('/api/discover/movements/impressionism')
        .expect(404);
    });

    it('should include movement metadata', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getArtworksByMovement.mockResolvedValue(mockArtworks);

      const response = await request(app)
        .get('/api/discover/movements/impressionism')
        .expect(200);

      expect(response.body.movement).toHaveProperty('name', 'Impressionism');
      expect(response.body.movement).toHaveProperty('period');
      expect(response.body.movement).toHaveProperty('description');
    });
  });

  describe('GET /api/discover/random', () => {
    it('should return random artworks', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getRandomLocalArtworks.mockResolvedValue(mockArtworks);

      const response = await request(app)
        .get('/api/discover/random')
        .expect(200);

      expect(response.body).toHaveProperty('artworks');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.artworks)).toBe(true);
    });

    it('should respect count parameter', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getRandomLocalArtworks.mockResolvedValue(mockArtworks.slice(0, 3));

      await request(app)
        .get('/api/discover/random?count=3')
        .expect(200);

      expect(localLib.getRandomLocalArtworks).toHaveBeenCalledWith(3, undefined);
    });

    it('should cap count at 20', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getRandomLocalArtworks.mockResolvedValue(mockArtworks);

      await request(app)
        .get('/api/discover/random?count=50')
        .expect(200);

      expect(localLib.getRandomLocalArtworks).toHaveBeenCalledWith(20, undefined);
    });

    it('should filter by movement', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getRandomLocalArtworks.mockResolvedValue(mockArtworks.slice(0, 1));

      await request(app)
        .get('/api/discover/random?movement=pop-art')
        .expect(200);

      expect(localLib.getRandomLocalArtworks).toHaveBeenCalledWith(8, 'pop-art');
    });

    it('should return empty when library not available', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(false);

      const response = await request(app)
        .get('/api/discover/random')
        .expect(200);

      expect(response.body.artworks).toEqual([]);
      expect(response.body.available).toBe(false);
    });
  });

  describe('GET /api/discover/mood', () => {
    it('should return mood-based suggestions', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(true);
      localLib.getRandomLocalArtworks.mockResolvedValue(mockArtworks);

      const response = await request(app)
        .get('/api/discover/mood')
        .expect(200);

      expect(response.body).toHaveProperty('mood');
      expect(response.body).toHaveProperty('query');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('artworks');
    });

    it('should return empty artworks when library not available', async () => {
      const { app, localLib } = createTestApp();

      localLib.isLocalLibraryAvailable.mockReturnValue(false);

      const response = await request(app)
        .get('/api/discover/mood')
        .expect(200);

      // Mood info should still be returned, just no artworks
      expect(response.body).toHaveProperty('mood');
      expect(response.body.artworks).toEqual([]);
    });
  });
});

describe('Mood Time Logic', () => {
  it('should return valid mood object regardless of time', async () => {
    const { app, localLib } = createTestApp();

    localLib.isLocalLibraryAvailable.mockReturnValue(true);
    localLib.getRandomLocalArtworks.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/discover/mood')
      .expect(200);

    // Should return a valid mood object regardless of time
    expect(response.body.mood).toBeTruthy();
    expect(response.body.query).toBeTruthy();
    expect(response.body.description).toBeTruthy();
  });
});
