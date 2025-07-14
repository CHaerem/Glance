FROM node:18-alpine

# Add metadata
LABEL org.opencontainers.image.title="Glance Server" \
      org.opencontainers.image.description="Local server for Glance ESP32 e-ink display project" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies with production optimization
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY server.js ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S glance -u 1001 -G nodejs

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R glance:nodejs /app

# Switch to non-root user
USER glance

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "server.js"]