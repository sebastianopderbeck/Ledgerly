LABEL="com.ledgerly.server"
PROD_DIR="${LEDGERLY_PROD_DIR:-$HOME/Services/ledgerly}"
LOG_DIR="$HOME/Library/Logs/Ledgerly"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
REQUIRED_HOST="127.0.0.1"
AUTO_LABEL="com.ledgerly.auto-deploy"
AUTO_PLIST="$HOME/Library/LaunchAgents/$AUTO_LABEL.plist"
AUTO_LOG="$LOG_DIR/auto-deploy.log"
DEPLOY_BUSY=75

fail() {
  echo "✖ $*" >&2
  exit 1
}

env_value() {
  sed -n "s/^$1=//p" "$PROD_DIR/.env"
}

supports_host() {
  git -C "$PROD_DIR" cat-file -e "$1:server/src/http/listenOptions.ts" 2>/dev/null
}

require_loopback_host() {
  local host
  host="$(env_value HOST)"
  [[ "$host" == "$REQUIRED_HOST" ]] ||
    fail "HOST en $PROD_DIR/.env es '$host' y tiene que ser $REQUIRED_HOST para no exponer la app"
}
