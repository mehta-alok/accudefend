# ============================================================================
# AccuDefend - Multi-stage Dockerfile
# ============================================================================
# Build: docker build -t accudefend:latest .
# Run:   docker run -p 8000:8000 -p 3000:3000 accudefend:latest
# ============================================================================

# =============================================================================
# Stage 1: Backend Build
# =============================================================================
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy backend source
COPY backend/ ./

# Generate Prisma client
RUN npx prisma generate

# =============================================================================
# Stage 2: Frontend Build
# =============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build for production
RUN npm run build

# =============================================================================
# Stage 3: Production Image
# =============================================================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S accudefend && \
    adduser -S accudefend -u 1001 -G accudefend

WORKDIR /app

# Copy backend
COPY --from=backend-builder --chown=accudefend:accudefend /app/backend ./backend

# Copy frontend build
COPY --from=frontend-builder --chown=accudefend:accudefend /app/frontend/dist ./frontend/dist

# Copy startup script
COPY --chown=accudefend:accudefend scripts/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set environment
ENV NODE_ENV=production
ENV PORT=8000

# Expose ports
EXPOSE 8000

# Switch to non-root user
USER accudefend

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8000/health || exit 1

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["docker-entrypoint.sh"]
