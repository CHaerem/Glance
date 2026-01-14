# Build stage - compiles TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies using npm ci (faster, uses lockfile)
# Sharp v0.32+ ships prebuilt binaries for linux/arm64, no build tools needed
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy TypeScript source files
COPY src ./src

# Compile TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Runtime stage - alpine is smaller
FROM node:20-alpine

# Install tini for proper signal handling
RUN apk add --no-cache tini

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

# Copy built node_modules and compiled TypeScript from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy source code, UI files, and assets (combined for fewer layers)
COPY server.js simple-ui.html admin.html bhutan.svg ./
COPY public ./public
COPY routes ./routes
COPY services ./services
COPY utils ./utils
COPY data ./data
COPY scripts ./scripts
COPY middleware ./middleware
COPY mcp ./mcp

# Create non-root user for security (alpine uses addgroup/adduser)
RUN addgroup -g 1001 nodejs && \
    adduser -u 1001 -G nodejs -s /bin/sh -D glance

# Create data and uploads directories with proper permissions
RUN mkdir -p /app/data /app/uploads && chown -R glance:nodejs /app

# Switch to non-root user
USER glance

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use tini (built into alpine) to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start the server
CMD ["node", "server.js"]
