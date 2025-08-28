FROM node:20-slim AS base

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

FROM base AS build

# Install all dependencies (including dev dependencies for building)
RUN npm ci --include=dev && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

FROM base AS production

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package*.json ./

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R appuser:appuser /app

# Change ownership to non-root user
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "start"]
