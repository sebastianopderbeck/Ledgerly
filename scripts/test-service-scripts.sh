#!/usr/bin/env bash
set -uo pipefail

REPO_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(mktemp -d)"
PASS=0
FAILED=0

write_stubs() {
  mkdir -p "$STUB/bin"
  cat > "$STUB/bin/launchctl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$STUB/launchctl.log"
[[ "$*" == *auto-deploy* ]] && { [[ "$1" != print ]]; exit; }
case "$1" in
  print) [[ -f "$STUB/loaded" ]] ;;
  bootout)
    [[ -f "$STUB/bootout_fails" ]] && exit 36
    rm -f "$STUB/loaded" ;;
  bootstrap) touch "$STUB/loaded" ;;
  enable) rm -f "$STUB/disabled" ;;
  disable) touch "$STUB/disabled" ;;
  kickstart)
    if [[ -f "$STUB/crash" || -f "$STUB/crash_once" ]]; then
      rm -f "$STUB/crash_once"
      {
        echo "file:///app/node_modules/mongoose/lib/connection.js:1169"
        echo "    err = new ServerSelectionError();"
        echo "MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27018"
        for i in $(seq 1 40); do echo "    detalle $i"; done
        echo "Node.js v20.19.6"
      } >> "$HOME/Library/Logs/Ledgerly/server.err.log"
      rm -f "$STUB/listen"
      exit 0
    fi
    nohup sleep 300 >/dev/null 2>&1 &
    echo $! > "$STUB/pid"
    echo $! >> "$STUB/spawned"
    if [[ -f "$STUB/force_listen" ]]; then
      cp "$STUB/force_listen" "$STUB/listen"
    elif [[ -f "$LEDGERLY_PROD_DIR/server/src/http/listenOptions.ts" ]] && grep -q '^HOST=127.0.0.1$' "$LEDGERLY_PROD_DIR/.env"; then
      echo "127.0.0.1:4100" > "$STUB/listen"
    else
      echo "*:4100" > "$STUB/listen"
    fi ;;
esac
EOF
  cat > "$STUB/bin/lsof" <<'EOF'
#!/usr/bin/env bash
[[ -f "$STUB/listen" ]] || exit 1
pid="$(cat "$STUB/pid")"
kill -0 "$pid" 2>/dev/null || [[ "$pid" == 1000 ]] || exit 1
if [[ " $* " == *" -t "* ]]; then
  echo "$pid"
else
  printf 'p%s\nf20\nn%s\n' "$pid" "$(cat "$STUB/listen")"
fi
EOF
  printf '#!/usr/bin/env bash\necho %s\n' "'{\"status\":\"ok\"}'" > "$STUB/bin/curl"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$STUB/bin/bun"
  printf '#!/usr/bin/env bash\necho "$*" >> "$STUB/notify.log"\n' > "$STUB/bin/osascript"
  chmod +x "$STUB/bin/"*
}

write_plist() {
  cat > "$HOME/Library/LaunchAgents/com.ledgerly.server.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>com.ledgerly.server</string>
<key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-s</string><string>$(command -v node)</string></array>
</dict></plist>
EOF
}

setup() {
  local origin_has_host="$1"
  T="$ROOT/$2"
  mkdir -p "$T"
  export HOME="$T/home"
  export STUB="$T/stub"
  export LEDGERLY_PROD_DIR="$T/prod"
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/Ledgerly"
  write_stubs
  export PATH="$STUB/bin:$ORIGINAL_PATH"

  git init -q --bare -b main "$T/origin.git"
  git clone -q "$T/origin.git" "$T/work" 2>/dev/null
  mkdir -p "$T/work/server/src/http"
  echo "app.listen(PORT)" > "$T/work/server/src/index.ts"
  git -C "$T/work" add -A && git -C "$T/work" -c user.email=t@t -c user.name=t commit -qm "sin HOST"
  OLD_SHA="$(git -C "$T/work" rev-parse --short HEAD)"
  if [[ "$origin_has_host" == "con-host" ]]; then
    echo "export {}" > "$T/work/server/src/http/listenOptions.ts"
    git -C "$T/work" add -A && git -C "$T/work" -c user.email=t@t -c user.name=t commit -qm "con HOST"
  fi
  git -C "$T/work" push -q origin HEAD:main
  NEW_SHA="$(git -C "$T/work" rev-parse --short HEAD)"

  git clone -q "$T/origin.git" "$T/repo"
  mkdir -p "$T/repo/scripts"
  cp -R "$REPO_SRC/scripts/." "$T/repo/scripts/"
}

install_prod() {
  git clone -q "$T/origin.git" "$LEDGERLY_PROD_DIR"
  printf 'MONGO_URL=x\nPORT=4100\nHOST=127.0.0.1\n' > "$LEDGERLY_PROD_DIR/.env"
  write_plist
  touch "$STUB/loaded"
  echo 1000 > "$STUB/pid"
  echo "127.0.0.1:4100" > "$STUB/listen"
}

check() {
  local name="$1" condition="$2"
  if eval "$condition"; then
    PASS=$((PASS + 1)); echo "  ok   $name"
  else
    FAILED=$((FAILED + 1)); echo "  FAIL $name"
  fi
}

run_deploy() {
  OUT="$(bash "$T/repo/scripts/deploy.sh" "$@" 2>&1)"; CODE=$?
}

run_install() {
  OUT="$(bash "$T/repo/scripts/install-service.sh" 2>&1)"; CODE=$?
}

run_auto() {
  OUT="$(bash "$T/repo/scripts/auto-deploy.sh" 2>&1)"; CODE=$?
}

push_commit() {
  echo "// $1" >> "$T/work/server/src/index.ts"
  git -C "$T/work" add -A && git -C "$T/work" -c user.email=t@t -c user.name=t commit -qm "$1"
  git -C "$T/work" push -q origin HEAD:main
  PUSHED="$(git -C "$T/work" rev-parse HEAD)"
}

prod_head() {
  git -C "$LEDGERLY_PROD_DIR" rev-parse HEAD
}

kickstarts() {
  cat "$STUB/launchctl.log" 2>/dev/null | grep -c kickstart
}

cleanup_spawned() {
  [[ -f "$STUB/spawned" ]] && xargs kill 2>/dev/null < "$STUB/spawned"
  true
}

ORIGINAL_PATH="$PATH"

echo "1. deploy a un ref sin soporte de HOST falla antes de tocar nada"
setup con-host t1; install_prod
run_deploy "$OLD_SHA"
check "exit 1" '[[ $CODE -eq 1 ]]'
check "mensaje no soporta HOST" '[[ "$OUT" == *"no soporta HOST"* ]]'
check "clon sigue en el commit nuevo" '[[ "$(git -C "$LEDGERLY_PROD_DIR" rev-parse --short HEAD)" == "$NEW_SHA" ]]'
check "sin kickstart" '! grep -q kickstart "$STUB/launchctl.log"'
cleanup_spawned

echo "2. HOST distinto de 127.0.0.1 en .env falla antes de tocar nada"
setup con-host t2; install_prod
sed -i '' 's/^HOST=.*/HOST=0.0.0.0/' "$LEDGERLY_PROD_DIR/.env"
run_deploy origin/main
check "exit 1" '[[ $CODE -eq 1 ]]'
check "mensaje HOST" '[[ "$OUT" == *"tiene que ser 127.0.0.1"* ]]'
check "sin kickstart" '! grep -q kickstart "$STUB/launchctl.log"'
cleanup_spawned

echo "3. la guarda deshabilita el servicio de forma persistente"
setup con-host t3; install_prod
echo "*:4100" > "$STUB/force_listen"
run_deploy origin/main
check "exit 1" '[[ $CODE -eq 1 ]]'
check "launchctl disable" 'grep -q "^disable gui/" "$STUB/launchctl.log"'
check "mensaje deshabilitado" '[[ "$OUT" == *"deshabilitado"* ]]'
cleanup_spawned

echo "4. la guarda avisa y mata el proceso aunque bootout falle"
setup con-host t4; install_prod
echo "*:4100" > "$STUB/force_listen"
touch "$STUB/bootout_fails"
run_deploy origin/main
check "exit 1" '[[ $CODE -eq 1 ]]'
check "mensaje de privacidad" '[[ "$OUT" == *"no solo en 127.0.0.1"* ]]'
check "proceso expuesto muerto" '! kill -0 "$(cat "$STUB/pid")" 2>/dev/null'
cleanup_spawned

echo "5. camino feliz"
setup con-host t5; install_prod
run_deploy
check "exit 0" '[[ $CODE -eq 0 ]]'
check "publicado" '[[ "$OUT" == *"✔ Publicado"* ]]'
cleanup_spawned

echo "6. install-service no registra el servicio si origin/main no soporta HOST"
setup sin-host t6
run_install
check "exit 1" '[[ $CODE -eq 1 ]]'
check "mensaje pusheá" '[[ "$OUT" == *"todavía no soporta HOST"* ]]'
check "sin bootstrap" '! grep -q bootstrap "$STUB/launchctl.log" 2>/dev/null'
cleanup_spawned

echo "7. install-service rehabilita antes de registrar y publica"
setup con-host t7
touch "$STUB/disabled"
run_install
check "exit 0" '[[ $CODE -eq 0 ]]'
check "enable antes de bootstrap" '[[ "$(grep -nE "^(enable|bootstrap) " "$STUB/launchctl.log" | head -n1)" == *"enable "* ]]'
check "publicado" '[[ "$OUT" == *"✔ Publicado"* ]]'
check "avisa que falta el deploy automático" '[[ "$OUT" == *"deploy automático queda sin instalar"* ]]'
check "sin plist de deploy automático" '[[ ! -f "$HOME/Library/LaunchAgents/com.ledgerly.auto-deploy.plist" ]]'
cleanup_spawned

echo "8. si el server no arranca, el deploy muestra la causa y dónde está el log"
setup con-host t8; install_prod
touch "$STUB/crash"
OUT="$(LEDGERLY_HEALTH_TIMEOUT=2 bash "$T/repo/scripts/deploy.sh" origin/main 2>&1)"; CODE=$?
check "exit 1" '[[ $CODE -eq 1 ]]'
check "causa visible" '[[ "$OUT" == *"Causa: MongooseServerSelectionError: connect ECONNREFUSED"* ]]'
check "ruta del log" '[[ "$OUT" == *"Library/Logs/Ledgerly/server.err.log"* ]]'
check "comando de rollback" '[[ "$OUT" == *"Para volver atrás: bun run deploy"* ]]'
cleanup_spawned

echo "9. sin cambios en origin/main el deploy automático no hace nada"
setup con-host t9; install_prod
run_auto
check "exit 0" '[[ $CODE -eq 0 ]]'
check "sin salida" '[[ -z "$OUT" ]]'
check "sin kickstart" '[[ "$(kickstarts)" == 0 ]]'
cleanup_spawned

echo "10. un push a main se publica solo y avisa"
setup con-host t10; install_prod
push_commit "nuevo"
run_auto
check "exit 0" '[[ $CODE -eq 0 ]]'
check "clon en el commit pusheado" '[[ "$(prod_head)" == "$PUSHED" ]]'
check "notificación de publicado" 'grep -q "Publicado" "$STUB/notify.log"'
run_auto
check "el chequeo siguiente no vuelve a publicar" '[[ "$(kickstarts)" == 1 ]]'
cleanup_spawned

echo "11. si el deploy falla vuelve al commit anterior y no reintenta"
setup con-host t11; install_prod
BEFORE="$(prod_head)"
push_commit "roto"
touch "$STUB/crash_once"
OUT="$(LEDGERLY_HEALTH_TIMEOUT=2 bash "$T/repo/scripts/auto-deploy.sh" 2>&1)"; CODE=$?
check "exit 1" '[[ $CODE -eq 1 ]]'
check "volvió al commit anterior" '[[ "$(prod_head)" == "$BEFORE" ]]'
check "notificación de falla" 'grep -q "Falló el deploy" "$STUB/notify.log"'
run_auto
check "no reintenta el commit roto" '[[ "$(kickstarts)" == 2 ]]'
cleanup_spawned

echo "12. un rollback manual se mantiene hasta el próximo push"
setup con-host t12; install_prod
BEFORE="$(prod_head)"
push_commit "v2"
run_auto
run_deploy "$BEFORE"
run_auto
check "sigue en el commit del rollback" '[[ "$(prod_head)" == "$BEFORE" ]]'
push_commit "v3"
run_auto
check "el push siguiente se publica" '[[ "$(prod_head)" == "$PUSHED" ]]'
cleanup_spawned

echo "13. con un deploy en curso, el automático espera al próximo chequeo"
setup con-host t13; install_prod
push_commit "v2"
lockf -t 0 "$LEDGERLY_PROD_DIR/.git/ledgerly-deploy.lock" bash -c 'touch "$STUB/held"; until [[ -f "$STUB/release" ]]; do sleep 0.1; done' &
HOLDER=$!
until [[ -f "$STUB/held" ]]; do sleep 0.1; done
run_deploy origin/main
check "deploy manual exit 75" '[[ $CODE -eq 75 ]]'
check "mensaje en curso" '[[ "$OUT" == *"Ya hay un deploy en curso"* ]]'
run_auto
check "automático exit 0" '[[ $CODE -eq 0 ]]'
check "todavía sin publicar" '[[ "$(prod_head)" != "$PUSHED" ]]'
touch "$STUB/release"; wait "$HOLDER"
run_auto
check "publica cuando se libera" '[[ "$(prod_head)" == "$PUSHED" ]]'
cleanup_spawned

echo "14. install-service instala el deploy automático cuando origin/main lo tiene"
setup con-host t14
mkdir -p "$T/work/scripts"
cp "$REPO_SRC/scripts/auto-deploy.sh" "$T/work/scripts/"
push_commit "auto-deploy"
run_install
AUTO_PLIST="$HOME/Library/LaunchAgents/com.ledgerly.auto-deploy.plist"
check "exit 0" '[[ $CODE -eq 0 ]]'
check "plist válido" 'plutil -lint "$AUTO_PLIST" >/dev/null'
check "corre el script del clon" '[[ "$(plutil -extract ProgramArguments.1 raw "$AUTO_PLIST")" == "$LEDGERLY_PROD_DIR/scripts/auto-deploy.sh" ]]'
check "cada 60 segundos" '[[ "$(plutil -extract StartInterval raw "$AUTO_PLIST")" == 60 ]]'
check "PATH con lsof" '[[ "$(plutil -extract EnvironmentVariables.PATH raw "$AUTO_PLIST")" == *":/usr/sbin"* ]]'
check "bootstrap del agente" 'grep -q "^bootstrap .*com.ledgerly.auto-deploy.plist" "$STUB/launchctl.log"'
check "mensaje instalado" '[[ "$OUT" == *"✔ Deploy automático"* ]]'
cleanup_spawned

rm -rf "$ROOT"
echo "resultado: $PASS ok, $FAILED fallidos"
[[ $FAILED -eq 0 ]]
