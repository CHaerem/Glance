const Database = require('better-sqlite3');
const path = require('path');
const { loggers } = require('./logger');
const log = loggers.server;

/**
 * Database service for storing and querying artwork embeddings
 */
class EmbeddingDatabase {
    constructor() {
        this.db = null;
    }

    /**
     * Initialize database connection and create tables
     */
    initialize(dbPath = './data/embeddings.db') {
        if (this.db) return;

        const fullPath = path.resolve(dbPath);
        log.info('Initializing embedding database', { path: fullPath });

        this.db = new Database(fullPath);
        this.db.pragma('journal_mode = WAL'); // Better concurrency

        this.createTables();
        log.info('Embedding database initialized');
    }

    /**
     * Create database tables
     */
    createTables() {
        // Artwork metadata and embeddings
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS artworks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT,
                date TEXT,
                department TEXT,
                source TEXT,
                image_url TEXT,
                thumbnail_url TEXT,
                siglip_embedding BLOB,
                embedding_version TEXT DEFAULT 'siglip-base-patch16-224',
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            );

            CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist);
            CREATE INDEX IF NOT EXISTS idx_artworks_source ON artworks(source);
            CREATE INDEX IF NOT EXISTS idx_artworks_embedding ON artworks(siglip_embedding) WHERE siglip_embedding IS NOT NULL;

            -- User interactions for preference building
            CREATE TABLE IF NOT EXISTS user_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artwork_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                timestamp INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (artwork_id) REFERENCES artworks(id)
            );

            CREATE INDEX IF NOT EXISTS idx_user_actions_artwork ON user_actions(artwork_id);
            CREATE INDEX IF NOT EXISTS idx_user_actions_type ON user_actions(action_type);

            -- User taste profile (aggregated embedding)
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY DEFAULT 1,
                taste_embedding BLOB,
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            );
        `);
    }

    /**
     * Store artwork with embedding
     * @param {Object} artwork - Artwork metadata
     * @param {number[]} embedding - SigLIP embedding vector
     */
    storeArtwork(artwork, embedding) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO artworks
            (id, title, artist, date, department, source, image_url, thumbnail_url, siglip_embedding, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
        `);

        const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

        stmt.run(
            artwork.id,
            artwork.title,
            artwork.artist || null,
            artwork.date || null,
            artwork.department || null,
            artwork.source || null,
            artwork.imageUrl,
            artwork.thumbnailUrl || artwork.imageUrl,
            embeddingBuffer
        );
    }

    /**
     * Get artwork by ID with embedding
     * @param {string} artworkId
     * @returns {Object|null}
     */
    getArtwork(artworkId) {
        const stmt = this.db.prepare(`
            SELECT * FROM artworks WHERE id = ?
        `);

        return stmt.get(artworkId);
    }

    /**
     * Get all artworks with embeddings
     * @returns {Array}
     */
    getAllArtworks() {
        const stmt = this.db.prepare(`
            SELECT id, title, artist, date, department, source,
                   image_url, thumbnail_url, siglip_embedding
            FROM artworks
            WHERE siglip_embedding IS NOT NULL
        `);

        return stmt.all();
    }

    /**
     * Get artworks without embeddings
     * @returns {Array}
     */
    getArtworksWithoutEmbeddings() {
        const stmt = this.db.prepare(`
            SELECT id, title, image_url FROM artworks
            WHERE siglip_embedding IS NULL
        `);

        return stmt.all();
    }

    /**
     * Convert binary embedding to array
     * @param {Buffer} buffer - Binary embedding data
     * @returns {number[]}
     */
    embeddingToArray(buffer) {
        if (!buffer) return null;
        return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
    }

    /**
     * Record user action
     * @param {string} artworkId
     * @param {string} actionType - 'like', 'dislike', 'display', 'skip'
     */
    recordAction(artworkId, actionType) {
        const stmt = this.db.prepare(`
            INSERT INTO user_actions (artwork_id, action_type)
            VALUES (?, ?)
        `);

        stmt.run(artworkId, actionType);
    }

    /**
     * Get user's liked artworks
     * @returns {Array}
     */
    getLikedArtworks() {
        const stmt = this.db.prepare(`
            SELECT a.*, ua.timestamp as liked_at
            FROM artworks a
            JOIN user_actions ua ON a.id = ua.artwork_id
            WHERE ua.action_type = 'like'
            AND a.siglip_embedding IS NOT NULL
            ORDER BY ua.timestamp DESC
        `);

        return stmt.all();
    }

    /**
     * Get user taste profile
     * @returns {Object|null}
     */
    getTasteProfile() {
        const stmt = this.db.prepare(`
            SELECT taste_embedding, updated_at FROM user_profile WHERE id = 1
        `);

        return stmt.get();
    }

    /**
     * Update user taste profile
     * @param {number[]} tasteEmbedding
     */
    updateTasteProfile(tasteEmbedding) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_profile (id, taste_embedding, updated_at)
            VALUES (1, ?, strftime('%s', 'now'))
        `);

        const embeddingBuffer = Buffer.from(new Float32Array(tasteEmbedding).buffer);
        stmt.run(embeddingBuffer);
    }

    /**
     * Get database statistics
     * @returns {Object}
     */
    getStats() {
        const totalArtworks = this.db.prepare('SELECT COUNT(*) as count FROM artworks').get().count;
        const withEmbeddings = this.db.prepare('SELECT COUNT(*) as count FROM artworks WHERE siglip_embedding IS NOT NULL').get().count;
        const totalActions = this.db.prepare('SELECT COUNT(*) as count FROM user_actions').get().count;

        return {
            totalArtworks,
            withEmbeddings,
            withoutEmbeddings: totalArtworks - withEmbeddings,
            totalActions,
            coverage: totalArtworks > 0 ? ((withEmbeddings / totalArtworks) * 100).toFixed(1) + '%' : '0%'
        };
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

module.exports = new EmbeddingDatabase();
