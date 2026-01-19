/**
 * User Playlists API Routes
 * User-created playlist management
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loggers } from '../services/logger';
import { getErrorMessage } from '../utils';
import { ensureDir } from '../utils/data-store';

const log = loggers.api;

/** User playlist structure */
interface UserPlaylist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  artworks: PlaylistArtwork[];
}

/** Playlist artwork */
interface PlaylistArtwork {
  id: string;
  imageUrl: string;
  thumbnailUrl?: string;
  title: string;
  artist?: string;
  addedAt: number;
}

/** User playlists data file structure */
interface UserPlaylistsData {
  playlists: UserPlaylist[];
}

// Data file path
const USER_PLAYLISTS_PATH = path.join(__dirname, '..', '..', 'data', 'user-playlists.json');

// Load user playlists data
async function loadUserPlaylists(): Promise<UserPlaylistsData> {
  try {
    const content = await fs.readFile(USER_PLAYLISTS_PATH, 'utf8');
    return JSON.parse(content) as UserPlaylistsData;
  } catch (error) {
    // File doesn't exist or is invalid
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.error('Failed to load user playlists', { error: getErrorMessage(error) });
    }
  }
  return { playlists: [] };
}

// Save user playlists data
async function saveUserPlaylists(data: UserPlaylistsData): Promise<void> {
  try {
    await ensureDir(path.dirname(USER_PLAYLISTS_PATH));
    await fs.writeFile(USER_PLAYLISTS_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    log.error('Failed to save user playlists', { error: getErrorMessage(error) });
    throw error;
  }
}

// Generate unique ID
function generateId(): string {
  return `up-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create user playlists router
 */
export function createUserPlaylistsRouter(): Router {
  const router = Router();

  /**
   * Get all user playlists
   * GET /api/user-playlists
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const data = await loadUserPlaylists();

      // Return playlists with metadata
      const playlists = data.playlists.map(p => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        artworkCount: p.artworks.length,
        preview: p.artworks[0]?.thumbnailUrl || p.artworks[0]?.imageUrl || null,
      }));

      res.json({ playlists });
    } catch (error) {
      log.error('Error getting user playlists', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Create a new user playlist
   * POST /api/user-playlists
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name } = req.body as { name?: string };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Playlist name is required' });
        return;
      }

      const data = await loadUserPlaylists();

      const newPlaylist: UserPlaylist = {
        id: generateId(),
        name: name.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        artworks: [],
      };

      data.playlists.push(newPlaylist);
      await saveUserPlaylists(data);

      log.info('Created user playlist', { id: newPlaylist.id, name: newPlaylist.name });

      res.status(201).json({
        id: newPlaylist.id,
        name: newPlaylist.name,
        artworkCount: 0,
      });
    } catch (error) {
      log.error('Error creating user playlist', { error: getErrorMessage(error) });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Get a specific user playlist
   * GET /api/user-playlists/:playlistId
   */
  router.get('/:playlistId', async (req: Request, res: Response) => {
    try {
      const { playlistId } = req.params;
      const data = await loadUserPlaylists();

      const playlist = data.playlists.find(p => p.id === playlistId);

      if (!playlist) {
        res.status(404).json({ error: 'Playlist not found' });
        return;
      }

      res.json({
        id: playlist.id,
        name: playlist.name,
        createdAt: playlist.createdAt,
        artworks: playlist.artworks,
      });
    } catch (error) {
      log.error('Error getting user playlist', {
        playlistId: req.params.playlistId,
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Update a user playlist (rename)
   * PUT /api/user-playlists/:playlistId
   */
  router.put('/:playlistId', async (req: Request, res: Response) => {
    try {
      const { playlistId } = req.params;
      const { name } = req.body as { name?: string };

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Playlist name is required' });
        return;
      }

      const data = await loadUserPlaylists();
      const playlist = data.playlists.find(p => p.id === playlistId);

      if (!playlist) {
        res.status(404).json({ error: 'Playlist not found' });
        return;
      }

      playlist.name = name.trim();
      playlist.updatedAt = Date.now();
      await saveUserPlaylists(data);

      log.info('Updated user playlist', { id: playlistId, name: playlist.name });

      res.json({ id: playlist.id, name: playlist.name });
    } catch (error) {
      log.error('Error updating user playlist', {
        playlistId: req.params.playlistId,
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Delete a user playlist
   * DELETE /api/user-playlists/:playlistId
   */
  router.delete('/:playlistId', async (req: Request, res: Response) => {
    try {
      const { playlistId } = req.params;
      const data = await loadUserPlaylists();

      const index = data.playlists.findIndex(p => p.id === playlistId);

      if (index === -1) {
        res.status(404).json({ error: 'Playlist not found' });
        return;
      }

      data.playlists.splice(index, 1);
      await saveUserPlaylists(data);

      log.info('Deleted user playlist', { id: playlistId });

      res.json({ success: true });
    } catch (error) {
      log.error('Error deleting user playlist', {
        playlistId: req.params.playlistId,
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Add artwork to a user playlist
   * POST /api/user-playlists/:playlistId/artworks
   */
  router.post('/:playlistId/artworks', async (req: Request, res: Response) => {
    try {
      const { playlistId } = req.params;
      const artwork = req.body as Partial<PlaylistArtwork>;

      if (!artwork.imageUrl || !artwork.title) {
        res.status(400).json({ error: 'Image URL and title are required' });
        return;
      }

      const data = await loadUserPlaylists();
      const playlist = data.playlists.find(p => p.id === playlistId);

      if (!playlist) {
        res.status(404).json({ error: 'Playlist not found' });
        return;
      }

      // Check if artwork already exists in playlist
      const existing = playlist.artworks.find(a => a.imageUrl === artwork.imageUrl);
      if (existing) {
        res.status(409).json({ error: 'Artwork already in playlist' });
        return;
      }

      const newArtwork: PlaylistArtwork = {
        id: generateId(),
        imageUrl: artwork.imageUrl,
        thumbnailUrl: artwork.thumbnailUrl,
        title: artwork.title,
        artist: artwork.artist,
        addedAt: Date.now(),
      };

      playlist.artworks.push(newArtwork);
      playlist.updatedAt = Date.now();
      await saveUserPlaylists(data);

      log.info('Added artwork to user playlist', {
        playlistId,
        artworkTitle: newArtwork.title,
      });

      res.status(201).json(newArtwork);
    } catch (error) {
      log.error('Error adding artwork to playlist', {
        playlistId: req.params.playlistId,
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Remove artwork from a user playlist
   * DELETE /api/user-playlists/:playlistId/artworks/:artworkId
   */
  router.delete('/:playlistId/artworks/:artworkId', async (req: Request, res: Response) => {
    try {
      const { playlistId, artworkId } = req.params;
      const data = await loadUserPlaylists();

      const playlist = data.playlists.find(p => p.id === playlistId);

      if (!playlist) {
        res.status(404).json({ error: 'Playlist not found' });
        return;
      }

      const artworkIndex = playlist.artworks.findIndex(a => a.id === artworkId);

      if (artworkIndex === -1) {
        res.status(404).json({ error: 'Artwork not found in playlist' });
        return;
      }

      playlist.artworks.splice(artworkIndex, 1);
      playlist.updatedAt = Date.now();
      await saveUserPlaylists(data);

      log.info('Removed artwork from user playlist', { playlistId, artworkId });

      res.json({ success: true });
    } catch (error) {
      log.error('Error removing artwork from playlist', {
        playlistId: req.params.playlistId,
        artworkId: req.params.artworkId,
        error: getErrorMessage(error),
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createUserPlaylistsRouter;
