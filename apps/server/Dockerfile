# syntax=docker/dockerfile:1.7

# Touched 2026-05-04 to invalidate Railway's "Watch Paths" cache after the
# packages/db and packages/shared package.json fixes (main → dist/index.js)
# that were not picked up by repeated CLI uploads.
# Touched again 2026-05-06: Railway kept reusing a stale build layer for the
# packages/shared TypeScript output even on SUCCESS deploys, so the
# nullish-coalescing fix on the webhook schema wasn't actually live.

# ── Stage 1: install deps for the whole workspace ────────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# Copy lockfile + workspace manifests first so this layer caches across edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/server/package.json apps/server/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# ── Stage 2: build TypeScript ────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/server apps/server
COPY packages packages

RUN pnpm --filter @dpm/shared run build && \
    pnpm --filter @dpm/db run build && \
    pnpm --filter @dpm/server run build

# Strip dev deps from node_modules to shrink the runtime image.
RUN pnpm --filter @dpm/server deploy --prod --ignore-scripts /out

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app

# Copy deployed app (already production-pruned).
COPY --from=build /out /app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--enable-source-maps"

EXPOSE 3000

# tini handles SIGTERM/SIGINT cleanly so graceful shutdown works on Railway.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
