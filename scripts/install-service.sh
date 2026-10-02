#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO_DIR/scripts/service-common.sh"

NODE_BIN="$(command -v node)" || fail "No encuentro node en el PATH"
NODE_DIR="$(dirname "$NODE_BIN")"

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

plutil -lint "$PLIST" >/dev/null || fail "El plist generado no es válido: $PLIST"

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  launchctl bootout "$DOMAIN/$LABEL"
  for _ in $(seq 1 20); do
    launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break
    sleep 0.25
  done
fi
launchctl enable "$DOMAIN/$LABEL"
launchctl bootstrap "$DOMAIN" "$PLIST"

echo "✔ Servicio $LABEL instalado (node: $NODE_BIN)"
exec bash "$REPO_DIR/scripts/deploy.sh"
