# syntax=docker/dockerfile:1.7

# Default to Debian slim for native-module compatibility. For a smaller image
# experiment, build with: --build-arg NODE_IMAGE=node:22-alpine
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- Stage 1: build ----------
FROM ${NODE_IMAGE} AS builder

# Build deps for native modules (sharp, argon2)
RUN if command -v apt-get >/dev/null 2>&1; then \
            apt-get update \
            && apt-get install -y --no-install-recommends \
                    python3 make g++ pkg-config libc6-dev ca-certificates \
            && rm -rf /var/lib/apt/lists/*; \
        elif command -v apk >/dev/null 2>&1; then \
            apk add --no-cache python3 make g++ pkgconf ca-certificates; \
        else \
            echo "Unsupported base image: missing apt-get/apk" >&2; exit 1; \
        fi

WORKDIR /app

# Install all deps (incl. dev) for `nuxt build`
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Copy sources and build
COPY . .

# Build identity. `.git` is excluded by .dockerignore, so the version CANNOT be
# derived inside the image — it must be computed on the host and passed in.
# Use `npm run docker:build`, or compute it yourself:
#   docker build --build-arg APP_VERSION=$(node scripts/version.mjs) ... .
ARG APP_VERSION
ARG APP_COMMIT=""
ARG APP_COMMIT_DATE=""
RUN test -n "$APP_VERSION" || { \
      echo "ERROR: APP_VERSION build arg is required." >&2; \
      echo "Run 'npm run docker:build', or pass --build-arg APP_VERSION=\$(node scripts/version.mjs)" >&2; \
      exit 1; \
    }

# Build does NOT need real secrets at runtime — runtimeConfig is overridden
# at boot via NUXT_* env vars. We only set a placeholder session password to
# satisfy nuxt.config.ts production guard.
ENV NODE_ENV=production \
    NUXT_TELEMETRY_DISABLED=1 \
    NUXT_SESSION_PASSWORD=build-time-placeholder-replace-via-runtime-env-vars \
    APP_VERSION=${APP_VERSION} \
    APP_COMMIT=${APP_COMMIT} \
    APP_COMMIT_DATE=${APP_COMMIT_DATE}

RUN npm run build

# Prune workspace down to runtime artefacts
RUN mkdir -p /app/runtime \
 && cp -r .output                  /app/runtime/.output \
 && cp -r themes                   /app/runtime/themes \
 && mkdir -p /app/runtime/server/utils \
 && cp server/utils/schema.surql   /app/runtime/server/utils/schema.surql \
 && cp package.json                /app/runtime/package.json \
 && cp -r bin                      /app/runtime/bin \
 && mkdir -p /app/runtime/.output/server/node_modules \
 && cp -r node_modules/node-cron   /app/runtime/.output/server/node_modules/node-cron

# Freeze build identity for the `panda` CLI. git is not available at runtime,
# so this file is the only source of truth inside the image.
RUN node -e "const { writeFileSync } = require('node:fs'); \
const version = process.env.APP_VERSION; \
writeFileSync('/app/runtime/version.json', JSON.stringify({ \
  version, \
  sha: process.env.APP_COMMIT || null, \
  committedAt: process.env.APP_COMMIT_DATE || null, \
  dirty: /\.dirty\$/.test(version) \
}, null, 2) + '\n')"

RUN node -e "const { readFileSync, rmSync } = require('node:fs'); \
const BUNDLED = ['tesla', 'clay', 'notion', 'hexagon']; \
let themesEnabled = true; let bundled = {}; \
try { const manifest = JSON.parse(readFileSync('/app/pandablog.modules.json', 'utf8')); themesEnabled = manifest.modules?.themes?.enabled !== false; bundled = manifest.modules?.themes?.bundled || {}; } catch {} \
for (const theme of BUNDLED) { const keep = themesEnabled && bundled[theme] !== false; if (!keep) rmSync('/app/runtime/themes/' + theme, { recursive: true, force: true }); }"


# ---------- Stage 2: runtime ----------
FROM ${NODE_IMAGE} AS runtime

# ARGs do not cross build stages; re-declare for the image labels below.
ARG APP_VERSION
ARG APP_COMMIT=""
ARG APP_COMMIT_DATE=""

# Standard OCI metadata so `docker inspect` reveals the build without exec'ing
# into the container. `created` is the COMMIT date, not wall-clock time, so the
# same commit always yields identical labels.
LABEL org.opencontainers.image.title="PandaBlog" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${APP_COMMIT}" \
      org.opencontainers.image.created="${APP_COMMIT_DATE}"

# Runtime libs needed by sharp / argon2 native bindings
RUN if command -v apt-get >/dev/null 2>&1; then \
            apt-get update \
            && apt-get install -y --no-install-recommends ca-certificates tini \
            && rm -rf /var/lib/apt/lists/* \
            && groupadd --system --gid 1001 nodejs \
            && useradd  --system --uid 1001 --gid nodejs nuxt; \
        elif command -v apk >/dev/null 2>&1; then \
            apk add --no-cache ca-certificates tini libstdc++ \
            && addgroup -S -g 1001 nodejs \
            && adduser -S -D -H -u 1001 -G nodejs nuxt \
            && mkdir -p /usr/bin \
            && ln -sf /sbin/tini /usr/bin/tini; \
        else \
            echo "Unsupported base image: missing apt-get/apk" >&2; exit 1; \
        fi

WORKDIR /app

COPY --from=builder --chown=nuxt:nodejs /app/runtime/ ./

# Storage + data dirs (volumes mount over these)
# NOTE: in production the whole ./app-storage host dir is bind-mounted over
# /app/storage, which SHADOWS these baked-in dirs. The optional GeoIP database
# is therefore NOT shipped in the image — place dbip-city-lite.mmdb at
# ./app-storage/geoip/ on the host (the app also creates storage/geoip/ on
# boot so the drop location is visible) and restart the container.
RUN mkdir -p storage/uploads storage/variants storage/downloads storage/backups storage/geoip storage/logs storage/rate-limit \
 && chown -R nuxt:nodejs storage

# Operator CLI: `panda --version`, `panda info`, `panda health`.
# Must be created while still root — the shim lives outside /app.
RUN printf '#!/bin/sh\nexec node /app/bin/panda.mjs "$@"\n' > /usr/local/bin/panda \
 && chmod 0755 /usr/local/bin/panda

USER nuxt

ENV NODE_ENV=production \
    NUXT_TELEMETRY_DISABLED=1 \
    PANDABLOG_VERSION=${APP_VERSION} \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=1024 \
    PORT=3000

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
