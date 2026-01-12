/**
 * Tests for collections routes
 */

const request = require('supertest');
const express = require('express');
const collectionsRoutes = require('../../routes/collections');

// Create a test app
const app = express();
app.use(express.json());
app.use('/api/collections', collectionsRoutes);

describe('Collections Routes', () => {
    describe('GET /api/collections', () => {
        it('should return list of collections', async () => {
            const response = await request(app)
                .get('/api/collections')
                .expect(200);

            expect(response.body).toHaveProperty('collections');
            expect(Array.isArray(response.body.collections)).toBe(true);
            expect(response.body.collections.length).toBeGreaterThan(0);
        });

        it('should set Cache-Control header for 10 minutes', async () => {
            const response = await request(app)
                .get('/api/collections')
                .expect(200);

            expect(response.headers['cache-control']).toBe('public, max-age=600');
        });

        it('should include collection metadata', async () => {
            const response = await request(app)
                .get('/api/collections')
                .expect(200);

            const collection = response.body.collections[0];
            expect(collection).toHaveProperty('id');
            expect(collection).toHaveProperty('name');
            expect(collection).toHaveProperty('description');
            expect(collection).toHaveProperty('count');
        });
    });

    describe('GET /api/collections/featured', () => {
        it('should return featured artworks', async () => {
            const response = await request(app)
                .get('/api/collections/featured')
                .expect(200);

            expect(response.body).toHaveProperty('artworks');
            expect(Array.isArray(response.body.artworks)).toBe(true);
        });

        it('should set Cache-Control header for 10 minutes', async () => {
            const response = await request(app)
                .get('/api/collections/featured')
                .expect(200);

            expect(response.headers['cache-control']).toBe('public, max-age=600');
        });

        it('should respect limit parameter', async () => {
            const response = await request(app)
                .get('/api/collections/featured?limit=5')
                .expect(200);

            expect(response.body.artworks.length).toBeLessThanOrEqual(5);
        });

        it('should include proper artwork structure', async () => {
            const response = await request(app)
                .get('/api/collections/featured')
                .expect(200);

            if (response.body.artworks.length > 0) {
                const artwork = response.body.artworks[0];
                expect(artwork).toHaveProperty('title');
                expect(artwork).toHaveProperty('artist');
                expect(artwork).toHaveProperty('imageUrl');
                expect(artwork).toHaveProperty('thumbnail');
                expect(artwork).toHaveProperty('source', 'curated');
            }
        });

        it('should sort by popularity (highest first)', async () => {
            const response = await request(app)
                .get('/api/collections/featured?limit=10')
                .expect(200);

            const artworks = response.body.artworks;
            if (artworks.length > 1) {
                for (let i = 1; i < artworks.length; i++) {
                    const prevPop = artworks[i - 1].popularity || 0;
                    const currPop = artworks[i].popularity || 0;
                    expect(prevPop).toBeGreaterThanOrEqual(currPop);
                }
            }
        });
    });

    describe('GET /api/collections/:collectionId', () => {
        it('should return 404 for nonexistent collection', async () => {
            await request(app)
                .get('/api/collections/nonexistent-collection')
                .expect(404);
        });

        it('should return collection with artworks', async () => {
            const response = await request(app)
                .get('/api/collections/renaissance-masters')
                .expect(200);

            expect(response.body).toHaveProperty('id', 'renaissance-masters');
            expect(response.body).toHaveProperty('name');
            expect(response.body).toHaveProperty('description');
            expect(response.body).toHaveProperty('artworks');
            expect(Array.isArray(response.body.artworks)).toBe(true);
        });

        it('should set Cache-Control header for 10 minutes', async () => {
            const response = await request(app)
                .get('/api/collections/renaissance-masters')
                .expect(200);

            expect(response.headers['cache-control']).toBe('public, max-age=600');
        });

        it('should include proper artwork structure', async () => {
            const response = await request(app)
                .get('/api/collections/renaissance-masters')
                .expect(200);

            if (response.body.artworks.length > 0) {
                const artwork = response.body.artworks[0];
                expect(artwork).toHaveProperty('title');
                expect(artwork).toHaveProperty('artist');
                expect(artwork).toHaveProperty('imageUrl');
                expect(artwork).toHaveProperty('source', 'curated');
                expect(artwork.imageUrl).toContain('commons.wikimedia.org');
            }
        });
    });
});
