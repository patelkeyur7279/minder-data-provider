#!/usr/bin/env bash
# Self-contained CI smoke test for the Node.js Express API example.
#
# Starts a plain-Node mock upstream (mock-upstream.mjs, fixed port 4401) and
# the built Express server (dist/index.js, fixed port 4402 — distinct from
# the dev default 3001 so this can run alongside `npm run dev`), then
# curl-verifies:
#   - GET  /api/users   -> the minder() JSON data path against the mock
#                          upstream; response body contains "Ada"
#   - POST /api/webhook -> minder-data-provider/server's HMAC-SHA256
#                          verification (createWebhookHandler + secret() +
#                          toNodeHandler): a validly signed request returns
#                          200 {"verified":true,...}; a tampered signature
#                          returns 401.
#
# Bounded waits only (no infinite loops); background processes are always
# killed on exit via the trap below, whether the script succeeds or fails.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

MOCK_PORT=4401
SERVER_PORT=4402
HOST="127.0.0.1"
WEBHOOK_SECRET="nodejs-smoke-secret"

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

if [ ! -f dist/index.js ]; then
  echo "dist/index.js not found — building first"
  npm run build
fi

echo "Starting mock upstream on :${MOCK_PORT}"
node mock-upstream.mjs &
PIDS+=("$!")

echo "Starting server on :${SERVER_PORT}"
PORT="$SERVER_PORT" NODE_ENV=test API_URL="http://${HOST}:${MOCK_PORT}" NODEJS_WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  node dist/index.js &
PIDS+=("$!")

wait_for() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 60); do
    if curl -sf --max-time 2 "$url" > /dev/null 2>&1; then
      echo "${label} is up"
      return 0
    fi
    sleep 0.5
  done
  echo "${label} did not become ready in time" >&2
  return 1
}

wait_for "http://${HOST}:${MOCK_PORT}/users" "mock upstream"
wait_for "http://${HOST}:${SERVER_PORT}/health" "server"

echo "Verifying GET /api/users returns Ada"
curl -sf "http://${HOST}:${SERVER_PORT}/api/users" | grep -q "Ada"

echo "Verifying POST /api/webhook accepts a valid signature"
BODY='{"event":"ping"}'
SIG=$(node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha256',process.argv[1]).update(process.argv[2]).digest('hex'))" "$WEBHOOK_SECRET" "$BODY")
curl -sf -X POST "http://${HOST}:${SERVER_PORT}/api/webhook" \
  -H "content-type: application/json" \
  -H "x-minder-signature: $SIG" \
  -d "$BODY" | grep -q '"verified":true'

echo "Verifying POST /api/webhook rejects a tampered signature (401)"
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://${HOST}:${SERVER_PORT}/api/webhook" \
  -H "content-type: application/json" \
  -H "x-minder-signature: 0000000000000000000000000000000000000000000000000000000000000000" \
  -d "$BODY")
test "$STATUS" = "401"

echo "ci:smoke passed"
