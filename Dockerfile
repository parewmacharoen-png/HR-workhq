# ============================================================================
# WorkHQ Backend — Dockerfile
# Multi-stage build preserving the monorepo layout (backend/ + prisma/).
#
# Build:
#   docker build -t workhq-backend .
#
# Run:
#   docker run -p 3000:3000 --env-file backend/.env workhq-backend
# ============================================================================

# ── deps stage ────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /workhq/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts

# ── builder stage ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /workhq

COPY --from=deps /workhq/backend/node_modules ./backend/node_modules
COPY prisma ./prisma
COPY backend ./backend

WORKDIR /workhq/backend
# Use local prisma binary (avoids npx auto-install hang when schema lives outside package root)
RUN ./node_modules/.bin/prisma generate --schema=../prisma/schema.prisma
RUN npm run build

# ── runner stage ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

LABEL org.opencontainers.image.title="WorkHQ API"
LABEL org.opencontainers.image.description="Telegram-first workforce management platform"

WORKDIR /workhq

RUN groupadd --gid 1001 nodejs \
 && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nestjs

COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /workhq/backend
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /workhq/backend/dist ./dist
COPY --from=builder /workhq/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /workhq/backend/node_modules/@prisma ./node_modules/@prisma
COPY prisma /workhq/prisma

RUN mkdir -p /var/workhq/storage/documents \
 && chown -R nestjs:nodejs /var/workhq/storage

ENV DOCUMENT_STORAGE_BASE_PATH=/var/workhq/storage/documents

USER nestjs

EXPOSE 3000

HEALTHCHECK \
  --interval=30s \
  --timeout=5s \
  --start-period=45s \
  --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
