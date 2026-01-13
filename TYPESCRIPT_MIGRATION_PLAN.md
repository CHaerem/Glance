# TypeScript Migration Plan

This document outlines the comprehensive plan to migrate the Glance server from JavaScript to TypeScript.

## Current State Analysis

### Codebase Metrics

| Metric | Value |
|--------|-------|
| Total Source Files | 48 |
| Total Lines of Code | 11,208 |
| Total Test Lines | 5,665 |
| External Dependencies | 10 production + 5 dev |
| Module Pattern | 100% CommonJS |
| Existing TypeScript | 0 files |
| Circular Dependencies | 0 (clean!) |

### Architecture Overview

```
server/
├── server.js (693 LOC) - Main entry point
├── middleware/
│   └── auth.js (106 LOC)
├── routes/ (3,623 LOC total, 12 modules)
│   └── Factory pattern: createXxxRoutes(deps) => Router
├── services/ (2,241 LOC total, 5 modules)
│   └── Mix of classes and functional APIs
├── utils/ (589 LOC total, 5 modules)
│   └── Pure functions + shared state
└── mcp/
    └── index.js (492 LOC) - MCP server for Claude.ai
```

### Complexity Assessment

| Tier | Files | Description |
|------|-------|-------------|
| **VERY HIGH** | image-processing.js (626), museum-api.js (804) | Complex algorithms, many functions |
| **HIGH** | upload.js (478), openai-search.js (451), server.js (693) | Many dependencies, async operations |
| **MEDIUM** | Most routes (200-400 LOC each) | Standard CRUD patterns |
| **LOW** | Utilities, middleware | Simple pure functions |

---

## Migration Strategy

### Approach: Incremental Migration with Strict Types

1. **Keep existing `.js` files working** during migration (TypeScript will coexist)
2. **Migrate leaf modules first** (utilities → services → routes → server.js)
3. **Enable strict mode from the start** to catch issues early
4. **Convert tests alongside source files** to maintain coverage

### Directory Structure (Post-Migration)

```
server/
├── src/
│   ├── types/              # Shared type definitions
│   │   ├── index.ts        # Re-exports all types
│   │   ├── artwork.ts      # Artwork, Museum types
│   │   ├── device.ts       # Device status types
│   │   ├── api.ts          # Request/Response types
│   │   └── config.ts       # Configuration types
│   ├── middleware/
│   │   └── auth.ts
│   ├── routes/
│   │   └── *.ts
│   ├── services/
│   │   └── *.ts
│   ├── utils/
│   │   └── *.ts
│   ├── mcp/
│   │   └── index.ts
│   └── server.ts
├── __tests__/              # Keep tests at root level
│   └── *.test.ts
├── dist/                   # Compiled output
├── tsconfig.json
└── package.json
```

---

## Phase 1: Foundation (Types & Configuration)

### 1.1 Install TypeScript Dependencies

```bash
npm install --save-dev \
  typescript@^5.3.0 \
  ts-node@^10.9.2 \
  @types/node@^20.10.0 \
  @types/express@^4.17.21 \
  @types/multer@^1.4.11 \
  @types/uuid@^9.0.7 \
  @types/cors@^2.8.17 \
  ts-jest@^29.1.1
```

### 1.2 Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "__tests__", "coverage"]
}
```

### 1.3 Create Core Type Definitions

**`src/types/artwork.ts`**
```typescript
export interface Artwork {
  id: string;
  title: string;
  artist: string;
  date: string;
  imageUrl: string;
  thumbnailUrl: string;
  source: string;
  museum?: string;
  description?: string;
  medium?: string;
  dimensions?: string;
  creditLine?: string;
}

export interface SearchResult {
  results: Artwork[];
  metadata: {
    query: string;
    resultsCount: number;
    searchType: 'keyword' | 'semantic' | 'random';
    sources?: string[];
  };
}

export interface Museum {
  id: string;
  name: string;
  apiUrl: string;
  enabled: boolean;
}

export type MuseumSource =
  | 'met'
  | 'artic'
  | 'cleveland'
  | 'rijksmuseum'
  | 'harvard'
  | 'smithsonian'
  | 'europeana'
  | 'wikimedia';
```

**`src/types/device.ts`**
```typescript
export interface DeviceStatus {
  deviceId: string;
  status: 'online' | 'offline' | 'sleeping' | 'updating' | 'error';
  battery?: number;
  batteryVoltage?: number;
  charging?: boolean;
  signal?: number;
  firmwareVersion?: string;
  lastSeen: number;
  ip?: string;
  otaHistory?: OTAEvent[];
}

export interface OTAEvent {
  timestamp: number;
  type: 'started' | 'completed' | 'failed';
  fromVersion?: string;
  toVersion?: string;
  error?: string;
}

export interface DeviceCommand {
  command: 'refresh' | 'sleep' | 'wake' | 'reboot' | 'ota';
  payload?: Record<string, unknown>;
}
```

**`src/types/api.ts`**
```typescript
import type { Request, Response, NextFunction } from 'express';
import type { Artwork } from './artwork';

// Extended Express types
export interface TypedRequest<
  TBody = unknown,
  TQuery = Record<string, string>,
  TParams = Record<string, string>
> extends Request {
  body: TBody;
  query: TQuery;
  params: TParams;
}

export interface TypedResponse<TData = unknown> extends Response {
  json: (body: TData) => this;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CurrentDisplay {
  title: string;
  image: string;
  imageId: string;
  timestamp: number;
  sleepDuration: number;
  devServerHost?: string;
  artwork?: Artwork;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  version: string;
  buildDate: string;
  memoryUsage: NodeJS.MemoryUsage;
}

// Middleware types
export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;
```

**`src/types/config.ts`**
```typescript
export interface ServerSettings {
  nightSleepEnabled: boolean;
  nightSleepStartHour: number;
  nightSleepEndHour: number;
  notificationWebhook?: string;
  defaultSleepDuration: number;
}

export interface RouterDependencies {
  openai?: OpenAI;
  uploadDir: string;
  upload?: Multer;
  firmwareVersion: string;
  buildDate: string;
  imageVersion: string;
  buildDateHuman: string;
  glanceBaseUrl: string;
}

export interface LoggerConfig {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  lokiUrl?: string;
  lokiUser?: string;
  lokiToken?: string;
}
```

**`src/types/image.ts`**
```typescript
export type RGB = [number, number, number];
export type LAB = [number, number, number];

export interface PaletteColor {
  rgb: RGB;
  index: number;
  name: string;
}

export interface DitherOptions {
  width: number;
  height: number;
  palette: PaletteColor[];
  method: 'floyd-steinberg' | 'atkinson' | 'none';
}

export interface ImageProcessingResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: 'raw' | 'png' | 'jpeg';
  colorDepth: number;
}

// E-ink Spectra 6 color palette
export const SPECTRA_6_PALETTE: PaletteColor[] = [
  { rgb: [0, 0, 0], index: 0x00, name: 'black' },
  { rgb: [255, 255, 255], index: 0x01, name: 'white' },
  { rgb: [0, 255, 0], index: 0x02, name: 'green' },
  { rgb: [0, 0, 255], index: 0x03, name: 'blue' },
  { rgb: [255, 0, 0], index: 0x04, name: 'red' },
  { rgb: [255, 255, 0], index: 0x05, name: 'yellow' },
];
```

**`src/types/index.ts`** (Re-export all)
```typescript
export * from './artwork';
export * from './device';
export * from './api';
export * from './config';
export * from './image';
```

---

## Phase 2: Utilities Migration

### Migration Order (simplest → complex)

1. **`utils/state.ts`** (55 LOC) - In-memory arrays
2. **`utils/validation.ts`** (89 LOC) - Input sanitization
3. **`utils/time.ts`** (127 LOC) - Timezone utilities
4. **`utils/data-store.ts`** (138 LOC) - File I/O with caching
5. **`utils/image-validator.ts`** (239 LOC) - URL validation

### Example: `utils/validation.ts`

**Before (JavaScript):**
```javascript
function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  return input.slice(0, maxLength).trim();
}

function isValidDeviceId(deviceId) {
  return typeof deviceId === 'string' &&
         /^[a-zA-Z0-9_-]{1,64}$/.test(deviceId);
}

module.exports = { sanitizeString, isValidDeviceId };
```

**After (TypeScript):**
```typescript
export function sanitizeString(input: unknown, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  return input.slice(0, maxLength).trim();
}

export function isValidDeviceId(deviceId: unknown): deviceId is string {
  return typeof deviceId === 'string' &&
         /^[a-zA-Z0-9_-]{1,64}$/.test(deviceId);
}
```

---

## Phase 3: Services Migration

### Migration Order

1. **`services/logger.ts`** (128 LOC) - Used by everything else
2. **`services/statistics.ts`** (313 LOC) - API tracking
3. **`services/museum-api.ts`** (804 LOC) - Most complex, many types
4. **`services/image-processing.ts`** (626 LOC) - Complex algorithms
5. **`services/openai-search.ts`** (451 LOC) - Vector search

### Key Type Definitions for Services

**Logger Interface:**
```typescript
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  ts: number;
  level: LogLevel;
  service: string;
  message: string;
  component?: string;
  [key: string]: unknown;
}

export function createLogger(service: string): Logger;
```

**Statistics Interface:**
```typescript
export interface OpenAICall {
  timestamp: number;
  model: string;
  endpoint: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface ApiCall {
  timestamp: number;
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
}

export interface StatisticsSummary {
  openai: {
    calls: OpenAICall[];
    totalCost: number;
    totalTokens: number;
  };
  api: {
    calls: ApiCall[];
    totalRequests: number;
    avgDuration: number;
  };
}
```

---

## Phase 4: Middleware Migration

### `middleware/auth.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';

export interface AuthConfig {
  apiKeys: string[];
  localNetworkPrefixes: string[];
}

export const API_KEYS: string[] = process.env.API_KEYS?.split(',') ?? [];

export function isLocalRequest(req: Request): boolean;
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void;
export function optionalApiKeyAuth(req: Request, res: Response, next: NextFunction): void;
```

---

## Phase 5: Routes Migration

### Migration Order (by complexity)

| Order | Route | LOC | Complexity | Notes |
|-------|-------|-----|------------|-------|
| 1 | system.ts | 275 | Low | Health, settings |
| 2 | collections.ts | 185 | Low | Curated collections |
| 3 | playlists.ts | 210 | Low | Playlist management |
| 4 | metrics.ts | 339 | Medium | Prometheus metrics |
| 5 | logs.ts | 360 | Medium | Logging endpoints |
| 6 | devices.ts | 285 | Medium | Device status |
| 7 | firmware.ts | 290 | Medium | OTA updates |
| 8 | history.ts | 310 | Medium | History management |
| 9 | images.ts | 373 | High | Binary image serving |
| 10 | art.ts | 362 | High | Search, filtering |
| 11 | semantic-search.ts | 355 | High | OpenAI integration |
| 12 | upload.ts | 478 | Very High | Multer, image processing |

### Route Factory Pattern

**Before (JavaScript):**
```javascript
function createSystemRoutes(deps) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  return router;
}

module.exports = { createSystemRoutes };
```

**After (TypeScript):**
```typescript
import { Router, Request, Response } from 'express';
import type { HealthResponse, RouterDependencies } from '../types';

export function createSystemRoutes(deps: RouterDependencies): Router {
  const router = Router();

  router.get('/health', (req: Request, res: Response<HealthResponse>) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      version: deps.firmwareVersion,
      buildDate: deps.buildDate,
      memoryUsage: process.memoryUsage()
    });
  });

  return router;
}
```

---

## Phase 6: Server & MCP Migration

### Main Server Entry Point

The main `server.ts` will be migrated last as it imports all other modules.

Key changes:
- Type all Express middleware
- Type route factory parameters
- Type environment variables

### MCP Server

The MCP server uses the `@modelcontextprotocol/sdk` which provides types. Migration involves:
- Typing tool handlers
- Typing MCP responses
- Proper error handling with typed errors

---

## Phase 7: Test Migration

### Jest Configuration Update

**`jest.config.ts`:**
```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/types/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
```

### Test File Migration

Each `.test.js` file will be renamed to `.test.ts` with:
- Typed imports
- Typed mocks
- Typed test fixtures

---

## Phase 8: Build & Deployment Updates

### Package.json Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "start": "node dist/server.js",
    "dev": "ts-node-dev --respawn src/server.ts",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  }
}
```

### Dockerfile Update

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY public ./public
COPY data ./data

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### GitHub Actions Update

Add TypeScript build step before Docker build:
```yaml
- name: Build TypeScript
  working-directory: server
  run: |
    npm ci
    npm run build
    npm run typecheck
```

---

## Potential Issues & Solutions

### 1. Dynamic JSON Imports

**Problem:** Loading JSON files at runtime
```javascript
const data = JSON.parse(fs.readFileSync('data/playlists.json', 'utf8'));
```

**Solution:** Create type definitions and use type guards
```typescript
import playlistsJson from '../data/playlists.json';
import type { Playlist } from '../types';

function isPlaylist(obj: unknown): obj is Playlist {
  return typeof obj === 'object' && obj !== null && 'id' in obj;
}
```

### 2. Multer File Types

**Problem:** `req.file` is not typed
```javascript
const file = req.file; // any
```

**Solution:** Extend Express Request type
```typescript
declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
      files?: Express.Multer.File[];
    }
  }
}
```

### 3. Sharp Return Types

**Problem:** Sharp methods return complex types
```javascript
const metadata = await sharp(buffer).metadata(); // any
```

**Solution:** Sharp has built-in types, just import properly
```typescript
import sharp, { Metadata } from 'sharp';
const metadata: Metadata = await sharp(buffer).metadata();
```

### 4. OpenAI SDK Types

**Problem:** OpenAI responses need proper typing
```typescript
import OpenAI from 'openai';
type ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;
```

### 5. In-Memory State

**Problem:** Module-level state needs typing
```javascript
const fileLocks = new Map(); // any
```

**Solution:**
```typescript
const fileLocks = new Map<string, Promise<void>>();
```

---

## Migration Checklist

### Phase 1: Foundation
- [ ] Install TypeScript dependencies
- [ ] Create tsconfig.json
- [ ] Create src/types/ directory
- [ ] Define core interfaces (Artwork, Device, API, Config, Image)
- [ ] Set up ESLint with TypeScript rules

### Phase 2: Utilities
- [ ] Migrate utils/state.ts
- [ ] Migrate utils/validation.ts
- [ ] Migrate utils/time.ts
- [ ] Migrate utils/data-store.ts
- [ ] Migrate utils/image-validator.ts
- [ ] Update utility tests

### Phase 3: Services
- [ ] Migrate services/logger.ts
- [ ] Migrate services/statistics.ts
- [ ] Migrate services/museum-api.ts
- [ ] Migrate services/image-processing.ts
- [ ] Migrate services/openai-search.ts
- [ ] Update service tests

### Phase 4: Middleware
- [ ] Migrate middleware/auth.ts
- [ ] Update middleware tests

### Phase 5: Routes
- [ ] Migrate routes/system.ts
- [ ] Migrate routes/collections.ts
- [ ] Migrate routes/playlists.ts
- [ ] Migrate routes/metrics.ts
- [ ] Migrate routes/logs.ts
- [ ] Migrate routes/devices.ts
- [ ] Migrate routes/firmware.ts
- [ ] Migrate routes/history.ts
- [ ] Migrate routes/images.ts
- [ ] Migrate routes/art.ts
- [ ] Migrate routes/semantic-search.ts
- [ ] Migrate routes/upload.ts
- [ ] Update route tests

### Phase 6: Server & MCP
- [ ] Migrate mcp/index.ts
- [ ] Migrate server.ts
- [ ] Update integration tests

### Phase 7: Tests
- [ ] Update jest.config.ts
- [ ] Migrate all test files to .test.ts
- [ ] Ensure 188 tests still pass

### Phase 8: Build & Deploy
- [ ] Update package.json scripts
- [ ] Update Dockerfile
- [ ] Update GitHub Actions workflow
- [ ] Test full CI/CD pipeline
- [ ] Deploy to production

---

## Benefits After Migration

1. **Type Safety**: Catch errors at compile time, not runtime
2. **Better IDE Support**: Autocomplete, refactoring, go-to-definition
3. **Self-Documenting**: Types serve as documentation
4. **Easier Refactoring**: Compiler catches breaking changes
5. **Better Error Messages**: TypeScript errors are more descriptive
6. **Future-Proof**: Modern JavaScript features with safety

---

## Timeline Estimate

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1: Foundation | 1 day | 1 day |
| Phase 2: Utilities | 1 day | 2 days |
| Phase 3: Services | 2-3 days | 5 days |
| Phase 4: Middleware | 0.5 day | 5.5 days |
| Phase 5: Routes | 3-4 days | 9 days |
| Phase 6: Server & MCP | 1 day | 10 days |
| Phase 7: Tests | 1-2 days | 12 days |
| Phase 8: Build & Deploy | 1 day | 13 days |

**Total: ~13 working days** for complete migration

---

## Next Steps

1. Review this plan and provide feedback
2. Decide on migration approach (full vs incremental)
3. Set up TypeScript tooling (Phase 1)
4. Begin migration with utilities (Phase 2)
