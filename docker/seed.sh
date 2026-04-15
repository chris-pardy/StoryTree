#!/usr/bin/env bash
#
# Reset the local branchline stack and seed it with two test accounts.
# Usage: ./docker/seed.sh
#
# This tears down the stack (destroying data volumes), brings it back up,
# and creates the test accounts on the PDS. Jetstream auto-subscribes to
# the PDS firehose on startup, so there's no separate crawl/register step
# like a real relay would need.
#
# Accounts created:
#   branchline-demo.test   / demo-password-123
#   branchline-friend.test / friend-password-123

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PDS_URL="${PDS_URL:-http://localhost:2584}"
JETSTREAM_URL="${JETSTREAM_URL:-http://localhost:6011}"

PDS_ENV_FILE="$SCRIPT_DIR/pds.env"
if [ ! -f "$PDS_ENV_FILE" ]; then
  echo "Missing $PDS_ENV_FILE — this file is gitignored; copy it from your password manager or regenerate the dev PDS credentials before running seed."
  exit 1
fi
# shellcheck disable=SC1090
set -a; . "$PDS_ENV_FILE"; set +a
if [ -z "${PDS_ADMIN_PASSWORD:-}" ]; then
  echo "PDS_ADMIN_PASSWORD not set in $PDS_ENV_FILE"
  exit 1
fi

pds_auth="Authorization: Basic $(printf 'admin:%s' "$PDS_ADMIN_PASSWORD" | base64)"

# --- Reset ---
echo "Tearing down stack..."
docker compose -f "$SCRIPT_DIR/docker-compose.yaml" down -v
echo "Starting stack..."
docker compose -f "$SCRIPT_DIR/docker-compose.yaml" up -d

wait_for() {
  local name="$1" url="$2"
  echo "Waiting for $name at $url..."
  for i in $(seq 1 60); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "$name is up."
      return 0
    fi
    if [ "$i" -eq 60 ]; then
      echo "$name not reachable after 60s, aborting."
      exit 1
    fi
    sleep 1
  done
}

wait_for "PDS"       "$PDS_URL/xrpc/_health"
# Jetstream's prometheus endpoint is its simplest liveness check.
wait_for "jetstream" "$JETSTREAM_URL/metrics"

# --- Create accounts ---
create_account() {
  local handle="$1"
  local password="$2"
  local email="$3"

  local invite
  invite=$(curl -sf -X POST "$PDS_URL/xrpc/com.atproto.server.createInviteCode" \
    -H 'Content-Type: application/json' \
    -H "$pds_auth" \
    -d '{"useCount":1}')
  local code
  code=$(echo "$invite" | grep -o '"code":"[^"]*"' | cut -d'"' -f4)

  local result
  result=$(curl -sf -X POST "$PDS_URL/xrpc/com.atproto.server.createAccount" \
    -H 'Content-Type: application/json' \
    -d "{\"handle\":\"$handle\",\"email\":\"$email\",\"password\":\"$password\",\"inviteCode\":\"$code\"}")
  local did
  did=$(echo "$result" | grep -o '"did":"[^"]*"' | head -1 | cut -d'"' -f4)

  CREATED_DID="$did"
  echo "  $handle -> $did"
}

echo "Creating accounts..."
DEMO_HANDLE="branchline-demo.test"
FRIEND_HANDLE="branchline-friend.test"
create_account "$DEMO_HANDLE"   "demo-password-123"   "demo@test.com"
DEMO_DID="$CREATED_DID"
create_account "$FRIEND_HANDLE" "friend-password-123" "friend@test.com"
FRIEND_DID="$CREATED_DID"

# --- Seed application database ---
# `down -v` wiped the postgres volume, so apply migrations before inserting.
echo "Waiting for postgres..."
for i in $(seq 1 30); do
  if docker compose -f "$SCRIPT_DIR/docker-compose.yaml" exec -T postgres \
       pg_isready -U branchline -d branchline >/dev/null 2>&1; then
    echo "postgres is up."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "postgres not reachable after 30s, aborting."
    exit 1
  fi
  sleep 1
done

echo "Running prisma migrations..."
( cd "$SCRIPT_DIR/.." && pnpm dotenv -e .env.local -- prisma migrate deploy )

echo "Generating dummy bud tree..."
( cd "$SCRIPT_DIR/.." && \
  DEMO_DID="$DEMO_DID" FRIEND_DID="$FRIEND_DID" \
  DEMO_HANDLE="$DEMO_HANDLE" FRIEND_HANDLE="$FRIEND_HANDLE" \
  pnpm dotenv -e .env.local -- tsx prisma/seed.ts )

echo "Done."
