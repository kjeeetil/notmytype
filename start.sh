#!/bin/bash
set -euo pipefail

: "${PORT:=8080}"
: "${SERVER_PORT:=8081}"
: "${NEXT_PUBLIC_SOCKET_URL:=http://localhost:${SERVER_PORT}}"

export NODE_ENV=production
export NEXT_PUBLIC_SOCKET_URL

WEB_PORT="$PORT"

PORT="$SERVER_PORT" node /app/server/index.js &
SERVER_PID=$!

PORT="$WEB_PORT" node /app/web/server.js &
WEB_PID=$!

cleanup() {
  kill "$SERVER_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

wait -n "$SERVER_PID" "$WEB_PID"
