/**
 * Tests for playlists routes
 */

const request = require('supertest');
const express = require('express');
const playlistsRoutes = require('../../routes/playlists');

// Create a test app
const app = express();
app.use(express.json());
app.use('/api/playlists', playlistsRoutes);

describe('Playlists Routes', () => {
    describe('GET /api/playlists', () => {
        it('should return list of playlists', async () => {
            const response = await request(app)
                .get('/api/playlists')
                .expect(200);

            expect(response.body).toHaveProperty('playlists');
            expect(Array.isArray(response.body.playlists)).toBe(true);
            expect(response.body.playlists.length).toBeGreaterThan(0);
        });

        it('should set Cache-Control header for 5 minutes', async () => {
            const response = await request(app)
                .get('/api/playlists')
                .expect(200);

            expect(response.headers['cache-control']).toBe('public, max-age=300');
        });

        it('should include playlist metadata', async () => {
            const response = await request(app)
                .get('/api/playlists')
                .expect(200);

            const playlist = response.body.playlists[0];
            expect(playlist).toHaveProperty('id');
            expect(playlist).toHaveProperty('name');
            expect(playlist).toHaveProperty('type');
            expect(playlist).toHaveProperty('description');
        });

        it('should include preview URL for classic playlists', async () => {
            const response = await request(app)
                .get('/api/playlists')
                .expect(200);

            const classicPlaylist = response.body.playlists.find(p => p.type === 'classic');
            expect(classicPlaylist).toBeDefined();
            expect(classicPlaylist.preview).toContain('commons.wikimedia.org');
        });
    });

    describe('GET /api/playlists/:playlistId', () => {
        it('should return 404 for nonexistent playlist', async () => {
            await request(app)
                .get('/api/playlists/nonexistent-playlist')
                .expect(404);
        });

        it('should return classic playlist with artworks', async () => {
            const response = await request(app)
                .get('/api/playlists/renaissance-masters')
                .expect(200);

            expect(response.body).toHaveProperty('id', 'renaissance-masters');
            expect(response.body).toHaveProperty('name');
            expect(response.body).toHaveProperty('artworks');
            expect(Array.isArray(response.body.artworks)).toBe(true);
        });

        it('should set Cache-Control header for classic playlists (10 minutes)', async () => {
            const response = await request(app)
                .get('/api/playlists/renaissance-masters')
                .expect(200);

            expect(response.headers['cache-control']).toBe('public, max-age=600');
        });

        it('should include proper artwork structure', async () => {
            const response = await request(app)
                .get('/api/playlists/renaissance-masters')
                .expect(200);

            if (response.body.artworks.length > 0) {
                const artwork = response.body.artworks[0];
                expect(artwork).toHaveProperty('title');
                expect(artwork).toHaveProperty('artist');
                expect(artwork).toHaveProperty('imageUrl');
                expect(artwork).toHaveProperty('thumbnail');
                expect(artwork.imageUrl).toContain('commons.wikimedia.org');
            }
        });
    });

    describe('POST /api/playlists/:playlistId/refresh', () => {
        it('should return 404 for nonexistent playlist', async () => {
            await request(app)
                .post('/api/playlists/nonexistent/refresh')
                .expect(404);
        });

        it('should return 400 for classic playlist refresh', async () => {
            await request(app)
                .post('/api/playlists/renaissance-masters/refresh')
                .expect(400);
        });
    });
});
