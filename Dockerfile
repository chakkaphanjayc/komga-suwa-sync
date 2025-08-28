# =================================================================
# Multi-stage Dockerfile for Komga-Suwayomi Sync Service
# =================================================================
# This Dockerfile creates an optimized production image for Linux deployment

# Build stage - Compile TypeScript and install dependencies
FROM node:20-alpine AS builder

# Install security updates
RUN apk update && apk upgrade && \
    apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci --only=production=false

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript to JavaScript
RUN npm run build

# Production stage - Create minimal runtime image
FROM node:20-alpine AS production

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S komga-sync -u 1001

# Create startup script to fix permissions
RUN echo '#!/bin/sh' > /usr/local/bin/start.sh && \
    echo 'echo "Fixing permissions..."' >> /usr/local/bin/start.sh && \
    echo 'if [ -d "/app/data" ]; then' >> /usr/local/bin/start.sh && \
    echo '  chown -R komga-sync:nodejs /app/data' >> /usr/local/bin/start.sh && \
    echo '  chmod -R 755 /app/data' >> /usr/local/bin/start.sh && \
    echo 'fi' >> /usr/local/bin/start.sh && \
    echo 'if [ -f "/app/.env" ]; then' >> /usr/local/bin/start.sh && \
    echo '  chown komga-sync:nodejs /app/.env' >> /usr/local/bin/start.sh && \
    echo '  chmod 644 /app/.env' >> /usr/local/bin/start.sh && \
    echo 'fi' >> /usr/local/bin/start.sh && \
    echo 'echo "Starting application..."' >> /usr/local/bin/start.sh && \
    echo 'exec "$@"' >> /usr/local/bin/start.sh && \
    chmod +x /usr/local/bin/start.sh

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy public assets
COPY public/ ./public/

# Copy nginx configuration (for reference)
COPY nginx.conf ./

# Create data directory for SQLite database
RUN mkdir -p /app/data && \
    chown -R komga-sync:nodejs /app/data

# Switch to non-root user
USER komga-sync

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application with permission fix
CMD ["/usr/local/bin/start.sh", "npm", "start"]
