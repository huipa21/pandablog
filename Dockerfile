# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
FROM node:22-bookworm-slim AS builder

# Build deps for native modules (sharp, argon2)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 make g++ pkg-config libc6-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all deps (incl. dev) for `nuxt build`
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Copy sources and build
COPY . .

# Build does NOT need real secrets at runtime — runtimeConfig is overridden
# at boot via NUXT_* env vars. We only set a placeholder session password to
# satisfy nuxt.config.ts production guard.
ENV NODE_ENV=production \
    NUXT_TELEMETRY_DISABLED=1 \
    NUXT_SESSION_PASSWORD=build-time-placeholder-replace-via-runtime-env-vars

RUN npm run build

# Prune workspace down to runtime artefacts
RUN mkdir -p /app/runtime \
 && cp -r .output                  /app/runtime/.output \
 && cp -r themes                   /app/runtime/themes \
 && mkdir -p /app/runtime/server/utils \
 && cp server/utils/schema.surql   /app/runtime/server/utils/schema.surql \
 && cp package.json                /app/runtime/package.json \
 && mkdir -p /app/runtime/.output/server/node_modules \
 && cp -r node_modules/node-cron   /app/runtime/.output/server/node_modules/node-cron


# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim AS runtime

# Runtime libs needed by sharp / argon2 native bindings
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs nuxt

WORKDIR /app

COPY --from=builder --chown=nuxt:nodejs /app/runtime/ ./

# Storage + data dirs (volumes mount over these)
RUN mkdir -p storage/uploads storage/variants storage/downloads storage/backups .data/rate-limit \
 && chown -R nuxt:nodejs storage .data

USER nuxt

ENV NODE_ENV=production \
    NUXT_TELEMETRY_DISABLED=1 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    PORT=3000

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
