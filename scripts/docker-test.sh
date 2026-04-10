#!/usr/bin/env bash
# scripts/docker-test.sh — smoke tests for the mina-explorer container image.
#
# Builds the image (unless SKIP_BUILD=1) and runs HTTP + entrypoint validation
# assertions against the resulting container. CI calls this script after the
# build step; locally you can run it standalone:
#
#   ./scripts/docker-test.sh                       # build + test with docker
#   RUNTIME=podman ./scripts/docker-test.sh        # build + test with podman
#   SKIP_BUILD=1 ./scripts/docker-test.sh          # test an existing image
#   HOST_PORT=8088 ./scripts/docker-test.sh        # publish on a different port
#
# Env vars:
#   RUNTIME      docker | podman                              (default: docker)
#   IMAGE        image repository to build/test                (default: localhost/mina-explorer)
#   TAG          single tag to test                            (default: dev)
#   HOST_PORT    host port to publish on                       (default: 8080)
#   SKIP_BUILD   set to 1 to skip the build step               (default: 0)
#   SKIP_COMPOSE set to 1 to skip the compose round-trip test  (default: 0)

set -euo pipefail

RUNTIME="${RUNTIME:-docker}"
IMAGE="${IMAGE:-localhost/mina-explorer}"
TAG="${TAG:-dev}"
HOST_PORT="${HOST_PORT:-8080}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_COMPOSE="${SKIP_COMPOSE:-0}"

TEST_IMAGE="${IMAGE}:${TAG}"
CONTAINER_NAME="mina-explorer-test-$$"
TMPDIR_TEST="${TMPDIR:-/tmp}/mina-explorer-test-$$"
mkdir -p "$TMPDIR_TEST"

# ----- helpers -----

stop_container() {
  $RUNTIME stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  $RUNTIME rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

final_cleanup() {
  stop_container
  rm -rf "$TMPDIR_TEST" 2>/dev/null || true
}
trap final_cleanup EXIT INT TERM

PASS_COUNT=0
FAIL_COUNT=0

assert() {
  local description="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "  PASS: $description"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "  FAIL: $description" >&2
    echo "        condition: $cmd" >&2
    return 1
  fi
}

wait_for_http() {
  local url="$1"
  local attempts=20
  while [ "$attempts" -gt 0 ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    sleep 0.5
    attempts=$((attempts - 1))
  done
  echo "  FAIL: $url did not respond within 10s" >&2
  $RUNTIME logs "$CONTAINER_NAME" 2>&1 | sed 's/^/      /' >&2 || true
  return 1
}

run_default_container() {
  $RUNTIME run --rm -d \
    -p "${HOST_PORT}:8080" \
    --name "$CONTAINER_NAME" \
    "$TEST_IMAGE" >/dev/null
  wait_for_http "http://localhost:${HOST_PORT}/"
}

# ----- 1. Build (unless skipped) -----

if [ "$SKIP_BUILD" != "1" ]; then
  echo ">>> Building $TEST_IMAGE with RUNTIME=$RUNTIME"
  RUNTIME="$RUNTIME" IMAGE="$IMAGE" TAGS="$TAG" \
    ./scripts/docker-build.sh
  echo
fi

# ----- 2. Default mode (no env vars) -----

echo ">>> Test 1: default mode — no MINA_EXPLORER_* env vars"
run_default_container

assert "/ serves the React root div" \
  'curl -fsS "http://localhost:${HOST_PORT}/" | grep -q "<div id=\"root\">"'

assert "/config.js is the bundled placeholder" \
  'curl -fsS "http://localhost:${HOST_PORT}/config.js" | grep -q "Runtime config placeholder"'

assert "/index.html sends no-cache header" \
  'curl -fsSI "http://localhost:${HOST_PORT}/index.html" | grep -qi "cache-control: no-cache"'

assert "/config.js sends no-cache header" \
  'curl -fsSI "http://localhost:${HOST_PORT}/config.js" | grep -qi "cache-control: no-cache"'

assert "SPA fallback serves index.html for unknown routes" \
  'curl -fsS "http://localhost:${HOST_PORT}/this-route-does-not-exist" | grep -q "<div id=\"root\">"'

assert "/assets requests get an immutable cache-control header" \
  'asset=$(curl -fsS "http://localhost:${HOST_PORT}/" | grep -oE "/assets/[^\"]+\.js" | head -1); curl -fsSI "http://localhost:${HOST_PORT}${asset}" | grep -qi "cache-control: public, immutable"'

assert "entrypoint logged the no-env-vars passthrough" \
  'grep -q "no MINA_EXPLORER_.* env vars set" <($RUNTIME logs "$CONTAINER_NAME" 2>&1)'

stop_container
echo

# ----- 3. Runtime override mode -----

echo ">>> Test 2: runtime override via -e"
$RUNTIME run --rm -d \
  -p "${HOST_PORT}:8080" \
  --name "$CONTAINER_NAME" \
  -e MINA_EXPLORER_DEFAULT_NETWORK=mainnet \
  -e MINA_EXPLORER_NETWORKS='{"mainnet":{"archiveEndpoint":"https://test-archive.example.com","daemonEndpoint":"https://test-daemon.example.com/graphql"}}' \
  "$TEST_IMAGE" >/dev/null
wait_for_http "http://localhost:${HOST_PORT}/config.js"

assert "config.js no longer matches the bundled placeholder" \
  '! curl -fsS "http://localhost:${HOST_PORT}/config.js" | grep -q "Runtime config placeholder"'

assert "config.js sets defaultNetwork to mainnet" \
  'curl -fsS "http://localhost:${HOST_PORT}/config.js" | grep -q "defaultNetwork: \"mainnet\""'

assert "config.js contains the override archive endpoint" \
  'curl -fsS "http://localhost:${HOST_PORT}/config.js" | grep -q "test-archive.example.com"'

assert "entrypoint logged the runtime config write" \
  'grep -q "runtime config written" <($RUNTIME logs "$CONTAINER_NAME" 2>&1)'

stop_container
echo

# ----- 4. Bad-JSON validation -----

echo ">>> Test 3: invalid JSON aborts before nginx starts"
RC=0
$RUNTIME run --rm \
  --name "$CONTAINER_NAME" \
  -e MINA_EXPLORER_NETWORKS='{not json' \
  "$TEST_IMAGE" >"$TMPDIR_TEST/badjson.log" 2>&1 || RC=$?

assert "container exited non-zero on bad JSON" \
  '[ "$RC" -ne 0 ]'

assert "validation error message printed" \
  'grep -q "is not valid JSON" "$TMPDIR_TEST/badjson.log"'

assert "nginx never reached config-complete" \
  '! grep -q "Configuration complete" "$TMPDIR_TEST/badjson.log"'

echo

# ----- 5. Invalid identifier validation (security: prevents JS injection) -----

echo ">>> Test 4: invalid network id aborts (security check)"
RC=0
$RUNTIME run --rm \
  --name "$CONTAINER_NAME" \
  -e MINA_EXPLORER_DEFAULT_NETWORK='evil"; alert(1); //' \
  "$TEST_IMAGE" >"$TMPDIR_TEST/badid.log" 2>&1 || RC=$?

assert "container exited non-zero on invalid identifier" \
  '[ "$RC" -ne 0 ]'

assert "identifier validation error printed" \
  'grep -q "invalid characters" "$TMPDIR_TEST/badid.log"'

echo

# ----- 6. Compose round-trip (optional) -----

if [ "$SKIP_COMPOSE" != "1" ]; then
  COMPOSE_CMD=""
  if command -v podman-compose >/dev/null 2>&1 && [ "$RUNTIME" = "podman" ]; then
    COMPOSE_CMD="podman-compose"
  elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  fi

  if [ -n "$COMPOSE_CMD" ]; then
    echo ">>> Test 5: compose round-trip with $COMPOSE_CMD"

    # Validate the compose file parses (rejects YAML / schema errors)
    assert "compose.yaml parses" \
      'MINA_EXPLORER_IMAGE="$TEST_IMAGE" $COMPOSE_CMD -f compose.yaml config'

    # Bring up the service using the locally-built image via env var override
    MINA_EXPLORER_IMAGE="$TEST_IMAGE" $COMPOSE_CMD -f compose.yaml up -d >/dev/null 2>&1 || {
      echo "  FAIL: compose up did not start the service" >&2
      $COMPOSE_CMD -f compose.yaml logs >&2 || true
      $COMPOSE_CMD -f compose.yaml down >/dev/null 2>&1 || true
      exit 1
    }

    wait_for_http "http://localhost:${HOST_PORT}/" || {
      $COMPOSE_CMD -f compose.yaml down >/dev/null 2>&1 || true
      exit 1
    }

    assert "compose-managed container serves the React root div" \
      'curl -fsS "http://localhost:${HOST_PORT}/" | grep -q "<div id=\"root\">"'

    assert "compose-managed container serves /config.js placeholder" \
      'curl -fsS "http://localhost:${HOST_PORT}/config.js" | grep -q "__MINA_EXPLORER_CONFIG__"'

    $COMPOSE_CMD -f compose.yaml down >/dev/null 2>&1 || true
    echo
  else
    echo ">>> Test 5: compose round-trip — SKIPPED (no compose runtime found)"
    echo
  fi
fi

# ----- summary -----

echo "================================================================"
echo "Tests passed: $PASS_COUNT"
echo "Tests failed: $FAIL_COUNT"
echo "================================================================"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
