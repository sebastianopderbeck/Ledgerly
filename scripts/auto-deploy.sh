#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_DIR/scripts/service-common.sh"
STATE_FILE="$PROD_DIR/.git/ledgerly-auto-deploy"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

notify() {
  osascript -e "display notification \"$1\" with title \"Ledgerly\"" >/dev/null 2>&1 || true
}

short() {
  git -C "$PROD_DIR" rev-parse --short "$1"
}

git -C "$PROD_DIR" fetch origin --quiet 2>/dev/null || exit 0
TARGET="$(git -C "$PROD_DIR" rev-parse origin/main)"
PREVIOUS="$(git -C "$PROD_DIR" rev-parse HEAD)"
LAST="$(cat "$STATE_FILE" 2>/dev/null || echo "$PREVIOUS")"
[[ "$TARGET" != "$LAST" ]] || exit 0
if [[ "$TARGET" == "$PREVIOUS" ]]; then
  echo "$TARGET" > "$STATE_FILE"
  exit 0
fi

RUN_DIR="$(mktemp -d)"
trap 'rm -rf "$RUN_DIR"' EXIT
mkdir "$RUN_DIR/scripts"
cp "$REPO_DIR/scripts/deploy.sh" "$REPO_DIR/scripts/service-common.sh" "$RUN_DIR/scripts/"

log "origin/main cambió a $(short "$TARGET"): publicando"
CODE=0
bash "$RUN_DIR/scripts/deploy.sh" "$TARGET" || CODE=$?
((CODE != DEPLOY_BUSY)) || exit 0
echo "$TARGET" > "$STATE_FILE"
if ((CODE == 0)); then
  notify "Publicado $(short "$TARGET")"
  exit 0
fi

if [[ "$(git -C "$PROD_DIR" rev-parse HEAD)" == "$PREVIOUS" ]]; then
  notify "Falló el deploy de $(short "$TARGET"). Log: $AUTO_LOG"
  exit 1
fi

log "Volviendo a $(short "$PREVIOUS")"
if bash "$RUN_DIR/scripts/deploy.sh" "$PREVIOUS"; then
  notify "Falló el deploy de $(short "$TARGET"). Sigue publicado $(short "$PREVIOUS")"
else
  notify "Falló el deploy de $(short "$TARGET") y la vuelta a $(short "$PREVIOUS"). Ledgerly puede estar caído"
fi
exit 1
