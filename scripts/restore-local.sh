#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="ledgerly-mongo"

fail() { echo "✖ $1" >&2; exit 1; }

LATEST="$(ls -1t "$REPO_DIR"/backups/ledgerly-*.archive 2>/dev/null | head -n 1 || true)"
[[ -n "$LATEST" ]] || fail "No hay backups en backups/. Corré primero: bun run backup"
[[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" == "true" ]] \
  || fail "No está corriendo $CONTAINER (docker compose up -d)"

docker cp "$LATEST" "$CONTAINER:/tmp/restore.archive"
docker exec "$CONTAINER" mongorestore --archive=/tmp/restore.archive --drop --nsInclude='ledgerly.*'
docker exec "$CONTAINER" rm -f /tmp/restore.archive
echo "✓ Base local restaurada desde $(basename "$LATEST")"
