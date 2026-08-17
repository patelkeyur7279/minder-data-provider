#!/usr/bin/env bash
# Self-contained CI smoke test for the React Router (Remix) example.
#
#   1. Starts the mock upstream (mock-upstream.mjs) on :8788.
#   2. Starts the ALREADY-BUILT app (`npm run build` must have run first,
#      producing build/server/index.js) via react-router-serve on a fixed
#      port.
#   3. curl-verifies the served page HTML contains a marker string AND the
#      loader-fetched upstream data ("Ada").
#
# Every wait is bounded (no infinite loops); background processes are always
# killed on exit, whether the script succeeds or fails.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

APP_PORT=3131
MOCK_PORT=8788
# A plain attribute string (no HTML entities) so it survives byte-for-byte
# from JSX into the server-rendered HTML — see app/routes/home.tsx.
MARKER='data-testid="app-root"'

if [ ! -f "./build/server/index.js" ]; then
  echo "build/server/index.js not found — run 'npm run build' before 'npm run ci:smoke'" >&2
  exit 1
fi

MOCK_PID=""
APP_PID=""

cleanup() {
  local code=$?
  # SIGTERM first, then a bounded grace period, then SIGKILL any stragglers.
  # Deliberately does NOT call a bare `wait` (which can hang indefinitely if
  # a process ignores SIGTERM) — every step here is bounded.
  [ -n "$APP_PID" ] && kill "$APP_PID" >/dev/null 2>&1 || true
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" >/dev/null 2>&1 || true
  for _ in $(seq 1 10); do
    alive=0
    [ -n "$APP_PID" ] && kill -0 "$APP_PID" >/dev/null 2>&1 && alive=1
    [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" >/dev/null 2>&1 && alive=1
    [ "$alive" -eq 0 ] && break
    sleep 0.5
  done
  [ -n "$APP_PID" ] && kill -9 "$APP_PID" >/dev/null 2>&1 || true
  [ -n "$MOCK_PID" ] && kill -9 "$MOCK_PID" >/dev/null 2>&1 || true
  exit "$code"
}
trap cleanup EXIT INT TERM

echo "Starting mock upstream on :$MOCK_PORT..."
node ./mock-upstream.mjs &
MOCK_PID=$!

echo "Waiting for mock upstream readiness (max 30s)..."
mock_ready=0
for _ in $(seq 1 30); do
  if curl -sf --max-time 2 "http://127.0.0.1:$MOCK_PORT/users" >/dev/null 2>&1; then
    mock_ready=1
    break
  fi
  sleep 1
done
if [ "$mock_ready" -ne 1 ]; then
  echo "Mock upstream did not become ready in time" >&2
  exit 1
fi

echo "Starting app on :$APP_PORT..."
# Invoke the local binary directly (not via `npx`/`npm exec`) so $! is the
# actual server process, not an npm wrapper — killing a wrapper PID does not
# reliably kill its child, which previously left the server running and
# hung the cleanup trap's wait.
PORT="$APP_PORT" HOST="127.0.0.1" MOCK_UPSTREAM_URL="http://127.0.0.1:$MOCK_PORT" \
  ./node_modules/.bin/react-router-serve ./build/server/index.js &
APP_PID=$!

echo "Waiting for app readiness (max 60s)..."
app_ready=0
for _ in $(seq 1 60); do
  if curl -sf --max-time 2 "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
    app_ready=1
    break
  fi
  sleep 1
done
if [ "$app_ready" -ne 1 ]; then
  echo "App did not become ready in time" >&2
  exit 1
fi

echo "Verifying page HTML (marker + loader data)..."
HTML=$(curl -sf --max-time 5 "http://127.0.0.1:$APP_PORT/")

if ! grep -qF "$MARKER" <<<"$HTML"; then
  echo "Marker string ($MARKER) not found in page HTML" >&2
  exit 1
fi

if ! grep -qF "Ada" <<<"$HTML"; then
  echo "Loader-fetched data ('Ada') not found in page HTML" >&2
  exit 1
fi

echo "ci:smoke OK — marker ($MARKER) and loader data ('Ada') both present in SSR HTML on :$APP_PORT."
