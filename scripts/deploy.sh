#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_DIR/scripts/service-common.sh"
HEALTH_TIMEOUT_SECONDS="${LEDGERLY_HEALTH_TIMEOUT:-45}"
ERR_LOG="$LOG_DIR/server.err.log"

listener_pid() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -n 1
}

listen_addresses() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -Fn 2>/dev/null | sed -n 's/^n//p' | sort -u
}

wait_for_new_server() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  local pid
  while ((SECONDS < deadline)); do
    pid="$(listener_pid || true)"
    if [[ -n "$pid" && "$pid" != "$OLD_PID" ]] &&
      curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"ok"'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

stop_exposed_server() {
  local pid
  launchctl disable "$DOMAIN/$LABEL" || true
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  pid="$(listener_pid || true)"
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
  fi
}

[[ -d "$PROD_DIR/.git" ]] || fail "No existe $PROD_DIR. Corré primero: bun run service:install"
launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 ||
  fail "El servicio $LABEL no está cargado. Corré: bun run service:install"
NODE_BIN="$(plutil -extract ProgramArguments.2 raw "$PLIST")"
[[ -x "$NODE_BIN" ]] ||
  fail "El servicio apunta a un node que ya no existe ($NODE_BIN). Corré: bun run service:install"
PORT="$(env_value PORT)"
[[ -n "$PORT" ]] || fail "Falta PORT en $PROD_DIR/.env"
require_loopback_host

if [[ $# -eq 0 ]]; then
  git -C "$REPO_DIR" fetch origin --quiet
  UNPUSHED="$(git -C "$REPO_DIR" rev-list --count origin/main..main)"
  if ((UNPUSHED > 0)); then
    echo "⚠ main tiene $UNPUSHED commit(s) sin pushear: no se van a publicar."
  fi
fi

REF="${1:-origin/main}"
PREVIOUS="$(git -C "$PROD_DIR" rev-parse --short HEAD)"
git -C "$PROD_DIR" fetch origin --quiet
git -C "$PROD_DIR" rev-parse --verify --quiet "$REF^{commit}" >/dev/null ||
  fail "No existe el ref $REF en $PROD_DIR"
supports_host "$REF" ||
  fail "$REF no soporta HOST: publicarlo expondría el puerto $PORT a la red. Elegí un commit más nuevo"

trap 'echo "✖ Deploy fallido. Para volver atrás: bun run deploy $PREVIOUS" >&2' ERR
git -C "$PROD_DIR" reset --hard --quiet "$REF"
echo "→ Publicando $(git -C "$PROD_DIR" log -1 --oneline) (anterior: $PREVIOUS)"

cd "$PROD_DIR"
MONGOMS_DISABLE_POSTINSTALL=1 bun install --frozen-lockfile
bun run build

: > "$ERR_LOG"
OLD_PID="$(listener_pid || true)"
launchctl kickstart -k "$DOMAIN/$LABEL"

if ! wait_for_new_server; then
  tail -n 30 "$ERR_LOG" >&2
  CAUSE="$(grep -m 1 -E '^[[:alnum:]]*Error' "$ERR_LOG" || true)"
  if [[ -n "$CAUSE" ]]; then
    echo "Causa: $CAUSE" >&2
  fi
  fail "El servidor no respondió en ${HEALTH_TIMEOUT_SECONDS}s (log completo: $ERR_LOG). Para volver atrás: bun run deploy $PREVIOUS"
fi

ADDRESSES="$(listen_addresses || true)"
if [[ "$ADDRESSES" != "$REQUIRED_HOST:$PORT" ]]; then
  stop_exposed_server
  fail "El servidor escuchaba en '$ADDRESSES', no solo en $REQUIRED_HOST:$PORT. Servicio detenido y deshabilitado para no exponerlo. Corregilo, pusheá y corré: bun run service:install"
fi

echo "✔ Publicado $(git -C "$PROD_DIR" log -1 --oneline) en http://$REQUIRED_HOST:$PORT"
