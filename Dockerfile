# syntax=docker/dockerfile:1.7
#
# Mina Explorer container image.
#
# Build with the helper script (CI uses this same script):
#   ./scripts/docker-build.sh
#
# Or directly with docker / podman:
#   docker build -t mina-explorer:dev .
#   podman build -t mina-explorer:dev .

ARG NODE_VERSION=22-alpine
ARG NGINX_VERSION=1.27-alpine

# ---- build stage --------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# Install dependencies first so the layer is cached when only src/ changes
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Source — keep COPY narrow so the .dockerignore allowlist is the source of truth
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

# VITE_BASE_PATH defaults to / for the container (root-served).
# Pass --build-arg VITE_BASE_PATH=/explorer/ to serve under a subpath instead.
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=${VITE_BASE_PATH}

RUN npx vite build

# ---- runtime stage ------------------------------------------------------
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runtime

# jq is used by the entrypoint hook to validate MINA_EXPLORER_NETWORKS JSON.
# Switch to root to install, then drop back to the unprivileged nginx user.
USER root
RUN apk add --no-cache jq

# Copy the built SPA. --chown=101:0 so the nginx-unprivileged user (UID 101)
# can overwrite /usr/share/nginx/html/config.js at container start.
COPY --chown=101:0 --from=build /app/dist /usr/share/nginx/html

# SPA fallback config (try_files → /index.html, no-cache on /index.html and /config.js)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Runtime config hook — runs before nginx starts via the
# nginx-unprivileged image's /docker-entrypoint.d/ mechanism.
COPY docker/entrypoint.sh /docker-entrypoint.d/40-mina-explorer-config.sh
RUN chmod +x /docker-entrypoint.d/40-mina-explorer-config.sh

USER 101

EXPOSE 8080

LABEL org.opencontainers.image.title="Mina Explorer" \
      org.opencontainers.image.description="Static SPA blockchain explorer for the Mina Protocol" \
      org.opencontainers.image.source="https://github.com/o1-labs/mina-explorer" \
      org.opencontainers.image.licenses="MIT"
