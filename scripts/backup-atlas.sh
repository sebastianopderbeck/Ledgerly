#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"

fail() { echo "✖ $1" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "Falta $ENV_FILE"
ATLAS_URL="$({ grep -E '^ATLAS_URL=' "$ENV_FILE" || true; } | head -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
[[ -n "$ATLAS_URL" ]] || fail "Falta ATLAS_URL en .env (el string mongodb+srv:// de Atlas)"
command -v docker >/dev/null || fail "Hace falta Docker"

mkdir -p "$REPO_DIR/backups"
NAME="ledgerly-$(date +%F).archive"
docker run --rm -v "$REPO_DIR/backups:/backups" mongo:7 \
  mongodump --uri="$ATLAS_URL" --db=ledgerly --archive="/backups/$NAME"
echo "✓ Backup en backups/$NAME"
