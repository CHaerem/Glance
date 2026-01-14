/**
 * Glance Server
 * Main entry point for the Express server
 */

// Load environment variables from .env file
import 'dotenv/config';

import express, { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import cors from 'cors';
import * as fs from 'fs/promises';
import * as path from 'path';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

// Utility modules
import { formatBuildDate, getOsloTimestamp } from './utils/time';
import { ensureDataDir, ensureDir, getDataDir } from './utils/data-store';
import { getErrorMessage } from './utils/error';

// Structured logging
import { loggers } from './services/logger';

// Authentication middleware
import { wanRestriction, isTrustedRequest } from './middleware/auth';
const log = loggers.server;

// Services
import imageProcessing from './services/image-processing';
import statistics from './services/statistics';
import { CURATED_COLLECTIONS } from './services/museum-api';
import { warmupCache } from './utils/image-validator';

// Shared state
import { serverLogs, MAX_LOGS } from './utils/state';

// Route modules
import collectionsRoutes from './routes/collections';
import playlistsRoutes from './routes/playlists';
import { createArtRoutes } from './routes/art';
import { createSystemRoutes } from './routes/system';
import { createHistoryRoutes } from './routes/history';
import { createImageRoutes } from './routes/images';
import { createUploadRoutes } from './routes/upload';
import { createDeviceRoutes } from './routes/devices';
import { createLogRoutes } from './routes/logs';
import { createFirmwareRoutes } from './routes/firmware';
import metricsRoutes from './routes/metrics';
import semanticSearchRoutes from './routes/semantic-search';

// Configuration
const app = express();
const PORT = parseInt(process.env.PORT || '3000');
const IMAGE_VERSION = process.env.IMAGE_VERSION || 'local';
const BUILD_DATE = process.env.BUILD_DATE || 'unknown';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

// Initialize OpenAI client if API key is available
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const BUILD_DATE_HUMAN = formatBuildDate(BUILD_DATE) || 'unknown';
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = /jpeg|jpg|png|gif|bmp|webp|heic|heif/i;
    const allowedMimeTypes = /image\/(jpeg|jpg|png|gif|bmp|webp|heic|heif)/i;

    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimeTypes.test(file.mimetype);

    if (mimetype || extname) {
      cb(null, true);
    } else {
      log.warn('Upload rejected: unsupported file type', {
        filename: file.originalname,
        mime: file.mimetype,
      });
      cb(
        new Error(
          `Unsupported image format: ${file.mimetype || path.extname(file.originalname)}. Supported formats: JPEG, PNG, GIF, BMP, WebP, HEIC`
        )
      );
    }
  },
});

// Rate limiting for external API access
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too many requests',
    code: 'RATE_LIMITED',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Disable strict trust proxy validation (we've configured it properly with trust proxy = 1)
  validate: { trustProxy: false },
  // Skip rate limiting for trusted requests (local network or authenticated Tailscale)
  skip: (req) => isTrustedRequest(req),
});

// CORS configuration for Claude.ai artifact integration
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const allowedOrigins: (string | RegExp)[] = [
      'https://claude.ai',
      'https://www.claude.ai',
      /^https:\/\/.*\.claude\.ai$/,
      /^https:\/\/.*\.ts\.net$/,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];

    const isAllowed = allowedOrigins.some((allowed) => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      log.debug('CORS request from origin', { origin });
      callback(null, true);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization', 'mcp-session-id'],
  exposedHeaders: ['mcp-session-id'], // Required for MCP clients to read session ID
  credentials: true,
};

// Trust proxy for correct IP detection (1 = trust one hop, for Tailscale Funnel)
app.set('trust proxy', 1);

// Middleware
app.use(cors(corsOptions));
app.use(wanRestriction); // Block WAN access except /api/mcp and health endpoints
app.use('/api', publicApiLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true })); // For OAuth token requests (form-urlencoded)
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOAD_DIR));

// HTTP request logging
const httpLog = loggers.api.child({ component: 'http' });
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health' && req.path !== '/api/health' && req.path !== '/api/metrics') {
      httpLog.info('HTTP request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
      });
    }
  });
  next();
});

// Load statistics on startup
statistics.loadStats().catch((err) => log.error('Failed to load stats on startup', { error: err }));

// Mount route modules
app.use('/api/collections', collectionsRoutes());
app.use('/api/playlists', playlistsRoutes());
app.use('/api/art', createArtRoutes({ openai, uploadDir: UPLOAD_DIR }));

// History routes
const historyRoutes = createHistoryRoutes({ uploadDir: UPLOAD_DIR });
app.use('/api', historyRoutes);

// System routes
const systemRoutes = createSystemRoutes({
  imageVersion: IMAGE_VERSION,
  buildDate: BUILD_DATE,
  buildDateHuman: BUILD_DATE_HUMAN,
});
app.get('/health', (_req: Request, res: Response) => res.json({ status: 'healthy', timestamp: Date.now() }));
app.use('/api', systemRoutes);

// Image routes
const imageRoutes = createImageRoutes({ upload, uploadDir: UPLOAD_DIR });
app.use('/api', imageRoutes);

// Upload routes
const uploadRoutes = createUploadRoutes({ upload, uploadDir: UPLOAD_DIR, openai });
app.use('/api', uploadRoutes);

// Device routes
const deviceRoutes = createDeviceRoutes();
app.use('/api', deviceRoutes);

// Log routes
const logRoutes = createLogRoutes();
app.use('/api', logRoutes);

// Firmware OTA routes
const firmwareRoutes = createFirmwareRoutes({
  dataDir: getDataDir(),
  firmwareVersion: IMAGE_VERSION,
  buildDate: BUILD_DATE,
});
app.use('/api/firmware', firmwareRoutes);

// Semantic search routes
app.use('/api/semantic', semanticSearchRoutes);

// Prometheus metrics endpoint
app.use('/api/metrics', metricsRoutes);

// MCP server for Claude.ai artifact integration
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createMcpRoutes } = require('../../mcp');
const mcpRoutes = createMcpRoutes({ glanceBaseUrl: 'http://localhost:3000' });
app.use('/api', mcpRoutes);

// OAuth 2.1 Discovery Endpoints for MCP
// These are required for Claude.ai to discover OAuth configuration
const getServerBaseUrl = (req: Request) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}`;
};

// OAuth Authorization Server Metadata (RFC 8414)
app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
  const baseUrl = getServerBaseUrl(req);
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/authorize`,
    token_endpoint: `${baseUrl}/api/token`,
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['mcp:tools'],
    service_documentation: `${baseUrl}/api/mcp`,
  });
});

// OAuth Protected Resource Metadata (RFC 9728)
app.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
  const baseUrl = getServerBaseUrl(req);
  res.json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:tools'],
  });
});

// Resource-specific OAuth metadata
app.get('/.well-known/oauth-protected-resource/*', (req: Request, res: Response) => {
  const baseUrl = getServerBaseUrl(req);
  res.json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:tools'],
  });
});

// Error handling middleware
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  log.error('Request error', {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? err.message : String(err),
    code: (err as NodeJS.ErrnoException).code,
  });

  if ((err as NodeJS.ErrnoException).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: 'File too large. Maximum size is 20MB.',
      code: 'FILE_TOO_LARGE',
    });
    return;
  }

  if (err.message && err.message.includes('Unsupported image format')) {
    res.status(415).json({
      error: err.message,
      code: 'UNSUPPORTED_FORMAT',
      hint: 'On iPhone, go to Settings > Camera > Formats and select "Most Compatible" for JPEG photos.',
    });
    return;
  }

  if (err.message && err.message.includes('image')) {
    res.status(400).json({
      error: err.message,
      code: 'IMAGE_ERROR',
    });
    return;
  }

  res.status((err as { status?: number }).status || 500).json({
    error: err.message || 'Internal server error',
    code: (err as NodeJS.ErrnoException).code || 'INTERNAL_ERROR',
  });
};

app.use(errorHandler);

// Main UI
app.get('/', async (_req: Request, res: Response) => {
  try {
    let uiPath = path.join(__dirname, '..', 'public', 'index.html');

    try {
      await fs.access(uiPath);
    } catch {
      uiPath = path.join(__dirname, '..', '..', 'public', 'index.html');
    }

    const indexContent = await fs.readFile(uiPath, 'utf8');

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ETag: `"${Date.now()}"`,
    });

    res.send(indexContent);
  } catch (error) {
    log.error('Error serving UI file', {
      error: getErrorMessage(error),
    });
    res.status(500).send(`
      <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>UI File Missing</h1>
        <p>The index.html file is not found in the public directory.</p>
      </body></html>
    `);
  }
});

// Admin page
app.get('/admin', async (_req: Request, res: Response) => {
  try {
    let adminPath = path.join(__dirname, '..', 'admin.html');

    try {
      await fs.access(adminPath);
    } catch {
      adminPath = path.join(__dirname, '..', '..', 'admin.html');
    }

    const adminContent = await fs.readFile(adminPath, 'utf8');

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ETag: `"${Date.now()}"`,
    });

    res.send(adminContent);
  } catch (error) {
    log.error('Error serving admin file', {
      error: getErrorMessage(error),
    });
    res.status(500).send('Admin page not found');
  }
});

// Preview page
app.get('/preview', async (_req: Request, res: Response) => {
  try {
    let previewPath = path.join(__dirname, '..', 'simple-ui-enhanced.html');

    try {
      await fs.access(previewPath);
    } catch {
      previewPath = path.join(__dirname, '..', '..', 'simple-ui-enhanced.html');
    }

    const previewContent = await fs.readFile(previewPath, 'utf8');

    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      ETag: `"${Date.now()}"`,
    });

    res.send(previewContent);
  } catch (error) {
    log.error('Error serving preview file', {
      error: getErrorMessage(error),
    });
    res.status(500).send('Preview page not found');
  }
});

// Capture console output for log tracking
const originalLog = console.log;
const originalError = console.error;

console.log = function (...args: unknown[]) {
  const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
  serverLogs.push(`[${getOsloTimestamp()}] LOG: ${message}`);
  if (serverLogs.length > MAX_LOGS) serverLogs.shift();
  statistics.trackLog('INFO', message);
  originalLog.apply(console, args);
};

console.error = function (...args: unknown[]) {
  const message = args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
  serverLogs.push(`[${getOsloTimestamp()}] ERROR: ${message}`);
  if (serverLogs.length > MAX_LOGS) serverLogs.shift();
  statistics.trackLog('ERROR', message);
  originalError.apply(console, args);
};

// Start server
async function startServer(): Promise<void> {
  await ensureDataDir();
  await ensureDir(UPLOAD_DIR);

  // Warm up image validation cache with curated collection filenames
  const allFilenames: string[] = [];
  for (const collection of Object.values(CURATED_COLLECTIONS)) {
    for (const artwork of collection.artworks) {
      if (artwork.wikimedia) {
        allFilenames.push(artwork.wikimedia);
      }
    }
  }

  // Run cache warmup in background
  warmupCache(allFilenames)
    .then((result) => {
      log.info('Image validation cache warmed up', { ...result });
    })
    .catch((err) => {
      log.error('Cache warmup failed', { error: err instanceof Error ? err.message : String(err) });
    });

  app.listen(PORT, '0.0.0.0', () => {
    log.info('Glance server started', {
      port: PORT,
      version: IMAGE_VERSION,
      buildDate: BUILD_DATE_HUMAN,
    });
  });
}

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) =>
    log.error('Failed to start server', { error: err instanceof Error ? err.message : String(err) })
  );
}

// Export for testing
export { app };
export const convertImageToRGB = imageProcessing.convertImageToRGB;
export const applyDithering = imageProcessing.applyDithering;
export const findClosestSpectraColor = imageProcessing.findClosestSpectraColor;
