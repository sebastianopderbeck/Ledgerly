#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_DIR/scripts/service-common.sh"

NODE_BIN="$(command -v node)" || fail "No encuentro node en el PATH"
NODE_DIR="$(dirname "$NODE_BIN")"
BUN_BIN="$(command -v bun)" || fail "No encuentro bun en el PATH"
GIT_BIN="$(command -v git)" || fail "No encuentro git en el PATH"

load_agent() {
  local label="$1" plist="$2"
  plutil -lint "$plist" >/dev/null || fail "El plist generado no es válido: $plist"
  if launchctl print "$DOMAIN/$label" >/dev/null 2>&1; then
    launchctl bootout "$DOMAIN/$label"
    for _ in $(seq 1 20); do
      launchctl print "$DOMAIN/$label" >/dev/null 2>&1 || break
      sleep 0.25
    done
  fi
  launchctl enable "$DOMAIN/$label"
  launchctl bootstrap "$DOMAIN" "$plist"
}

if [[ ! -d "$PROD_DIR/.git" ]]; then
  mkdir -p "$(dirname "$PROD_DIR")"
  git clone "$(git -C "$REPO_DIR" remote get-url origin)" "$PROD_DIR"
fi

if [[ ! -f "$PROD_DIR/.env" ]]; then
  cat > "$PROD_DIR/.env" <<EOF
MONGO_URL=mongodb://localhost:27018/ledgerly
PORT=4100
HOST=$REQUIRED_HOST
EOF
fi

require_loopback_host

if ! supports_host HEAD; then
  git -C "$PROD_DIR" fetch origin --quiet
  supports_host origin/main ||
    fail "origin/main todavía no soporta HOST: pusheá los cambios a main antes de instalar"
  git -C "$PROD_DIR" reset --hard --quiet origin/main
fi

mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-s</string>
    <string>$NODE_BIN</string>
    <string>--env-file=.env</string>
    <string>--import</string>
    <string>tsx</string>
    <string>server/src/index.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROD_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/server.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/server.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NODE_DIR:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

load_agent "$LABEL" "$PLIST"
echo "✔ Servicio $LABEL instalado (node: $NODE_BIN)"
bash "$REPO_DIR/scripts/deploy.sh"

if [[ ! -f "$PROD_DIR/scripts/auto-deploy.sh" ]]; then
  echo "⚠ origin/main todavía no tiene scripts/auto-deploy.sh: el deploy automático queda sin instalar. Pusheá a main y volvé a correr: bun run service:install"
  exit 0
fi

cat > "$AUTO_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$AUTO_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PROD_DIR/scripts/auto-deploy.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROD_DIR</string>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$AUTO_LOG</string>
  <key>StandardErrorPath</key>
  <string>$AUTO_LOG</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NODE_DIR:$(dirname "$BUN_BIN"):$(dirname "$GIT_BIN"):/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
EOF

load_agent "$AUTO_LABEL" "$AUTO_PLIST"
echo "✔ Deploy automático $AUTO_LABEL instalado: publica origin/main cada vez que cambia (log: $AUTO_LOG)"
