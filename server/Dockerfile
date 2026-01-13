# Build stage - compiles TypeScript and native modules
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3, sharp)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better Docker layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev for TypeScript compilation)
RUN npm install && npm cache clean --force

# Copy TypeScript source files
COPY src ./src

# Compile TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Runtime stage - clean image without build tools
FROM node:20-slim

# Add metadata
LABEL org.opencontainers.image.title="Glance Server" \
      org.opencontainers.image.description="Local server for Glance ESP32 e-ink display project" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="MIT"

# Build metadata
ARG IMAGE_VERSION=local
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.revision="$IMAGE_VERSION" \
      org.opencontainers.image.created="$BUILD_DATE"
ENV IMAGE_VERSION=$IMAGE_VERSION
ENV BUILD_DATE=$BUILD_DATE

WORKDIR /app

# Install only runtime dependencies (dumb-init)
RUN apt-get update && apt-get install -y \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Copy built node_modules and compiled TypeScript from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy source code, UI files, and assets
COPY server.js ./
COPY simple-ui.html ./
COPY admin.html ./
COPY bhutan.svg ./
COPY public ./public
COPY routes ./routes
COPY services ./services
COPY utils ./utils
COPY data ./data
COPY scripts ./scripts
COPY middleware ./middleware
COPY mcp ./mcp

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home glance

# Create data and uploads directories with proper permissions
RUN mkdir -p /app/data /app/uploads && chown -R glance:nodejs /app

# Switch to non-root user
USER glance

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "server.js"]
