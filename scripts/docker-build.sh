#!/usr/bin/env bash
# scripts/docker-build.sh — build the mina-explorer container image.
#
# This script is the source of truth for building the image — CI invokes it
# with env vars; you can run it locally the same way.
#
# Examples:
#
#   # Build for the host arch with podman, image lands in local store
#   RUNTIME=podman ./scripts/docker-build.sh
#
#   # Build with docker, custom tag
#   RUNTIME=docker TAGS=v0.2.1 ./scripts/docker-build.sh
#
#   # Multi-arch build pushed to your own GHCR namespace
#   RUNTIME=docker \
#     IMAGE=ghcr.io/myuser/mina-explorer \
#     TAGS=v0.2.1,latest \
#     PLATFORMS=linux/amd64,linux/arm64 \
#     PUSH=1 \
#     ./scripts/docker-build.sh
#
#   # Customise the SPA base path (e.g. serve under /explorer/ behind a proxy)
#   VITE_BASE_PATH=/explorer/ ./scripts/docker-build.sh
#
# Env vars:
#   RUNTIME         docker | podman                            (default: docker)
#   IMAGE           image repository                            (default: localhost/mina-explorer)
#   TAGS            comma-separated tags                        (default: dev)
#   PLATFORMS       comma-separated build platforms             (default: <host arch only>)
#   PUSH            1 to push after build                       (default: 0)
#   VITE_BASE_PATH  SPA base path baked into the build          (default: /)
#   DOCKERFILE      path to Dockerfile                          (default: Dockerfile)
#   CONTEXT         build context directory                     (default: .)

set -euo pipefail

RUNTIME="${RUNTIME:-docker}"
IMAGE="${IMAGE:-localhost/mina-explorer}"
TAGS="${TAGS:-dev}"
PLATFORMS="${PLATFORMS:-}"
PUSH="${PUSH:-0}"
VITE_BASE_PATH="${VITE_BASE_PATH:-/}"
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
CONTEXT="${CONTEXT:-.}"

if ! command -v "$RUNTIME" >/dev/null 2>&1; then
  echo "error: container runtime '$RUNTIME' not found in PATH" >&2
  echo "       set RUNTIME=docker (default) or RUNTIME=podman" >&2
  exit 1
fi

# Build --tag arguments from comma-separated TAGS
tag_args=()
IFS=',' read -ra _tag_list <<<"$TAGS"
for t in "${_tag_list[@]}"; do
  tag_args+=(--tag "${IMAGE}:${t}")
done

# Decide between plain `build` and `buildx build`:
# - PUSH=1: must use buildx (plain build has no --push in docker or podman)
# - PLATFORMS set: must use buildx (multi-platform requires buildkit)
# - Otherwise: plain build is fastest and lands the image in the local store
#
# When using buildx WITHOUT --push, we need --load so the image lands in the
# local engine store (otherwise it stays in buildx's cache only and tools
# like `docker run` / `podman run` can't find it). --load only works for
# single-platform builds; multi-platform without push is cache-only and
# emits a warning so the user knows the image isn't loadable.
if [ "$PUSH" = "1" ] || [ -n "$PLATFORMS" ]; then
  build_cmd=(buildx build)
  if [ -n "$PLATFORMS" ]; then
    build_cmd+=(--platform "$PLATFORMS")
  fi
  if [ "$PUSH" = "1" ]; then
    build_cmd+=(--push)
  elif [ -n "$PLATFORMS" ]; then
    case "$PLATFORMS" in
      *,*)
        echo "warning: multi-platform build without PUSH=1 — image will live in the buildx cache only" >&2
        ;;
      *)
        build_cmd+=(--load)
        ;;
    esac
  fi
else
  build_cmd=(build)
fi

extra_args=(
  --file "$DOCKERFILE"
  --build-arg "VITE_BASE_PATH=${VITE_BASE_PATH}"
)

set -x
exec "$RUNTIME" "${build_cmd[@]}" "${extra_args[@]}" "${tag_args[@]}" "$CONTEXT"
