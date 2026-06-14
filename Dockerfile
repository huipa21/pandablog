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
FROM ${NODE_IMAGE} AS runtime

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
RUN mkdir -p storage/uploads storage/variants storage/downloads storage/backups storage/geoip .data/rate-limit \
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
