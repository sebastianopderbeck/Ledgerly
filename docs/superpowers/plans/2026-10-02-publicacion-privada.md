# Publicación privada con Tailscale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar Ledgerly corriendo de fondo en la MacBook como servicio de macOS, accesible solo desde los dispositivos del usuario vía Tailscale, con un `bun run deploy` que publica `origin/main`.

**Architecture:** Un clon aparte del repo en `~/Services/ledgerly` corre el server (que ya sirve `client/dist`) bajo un LaunchAgent `com.ledgerly.server`, envuelto en `caffeinate -s`, escuchando solo en `127.0.0.1:4100`. `tailscale serve` lo publica dentro del tailnet con HTTPS. Dos scripts bash (`install-service.sh`, `deploy.sh`) automatizan instalación y actualización; el server solo gana un `HOST` opcional.

**Tech Stack:** Node 20 (`--env-file`, `--import tsx`), Express, MongoDB en Docker, bun workspaces, Vite, launchd (`launchctl`, `plutil`), `caffeinate`, `lsof`, Tailscale, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-publicacion-privada-design.md`

## Global Constraints

- **Label del servicio:** `com.ledgerly.server`. Plist en `~/Library/LaunchAgents/com.ledgerly.server.plist`.
- **Clon publicado:** `${LEDGERLY_PROD_DIR:-$HOME/Services/ledgerly}`, sigue `origin/main`.
- **`.env` del clon:** `MONGO_URL=mongodb://localhost:27018/ledgerly`, `PORT=4100`, `HOST=127.0.0.1`.
- **Base compartida** con desarrollo: `mongodb://localhost:27018/ledgerly`. Desarrollo sigue en `:4000` / `:5173` sin `HOST`.
- **Logs:** `~/Library/Logs/Ledgerly/server.log` y `server.err.log`.
- **Node ≥ 20.6** (necesario para `--env-file` y `--import`); la máquina tiene 20.19.6 vía nvm.
- **Tailscale:** `tailscale serve --bg http://127.0.0.1:4100`. Nunca `tailscale funnel`.
- **Sin comentarios en el código** (regla global del usuario), tampoco en los scripts bash: nombres autoexplicativos.
- **TypeScript:** tipos explícitos, `any` prohibido.
- **Git:** el usuario maneja la integración. Trabajar en la rama `feat/publicacion-privada` (crearla desde `main` al empezar). Cada tarea termina con verificación y `git add` de sus archivos; **no** correr `git commit` ni `git push` salvo que el usuario lo pida en el momento.
- **Correr tests:** `bunx vitest run <archivo>`; typecheck: `bun run typecheck`.

## Review Focus

Entradas y condiciones que el spec implica y que los tests unitarios no cubren, ordenadas por probabilidad de morder:

1. **Mongo caída al arrancar o deployar** (Docker Desktop todavía levantando): el deploy falla en ≤ 45 s mostrando el log y el comando de rollback; cuando Mongo vuelve, el servicio se recupera solo. Prueba en Task 5, Step 6c.
2. **El server escucha fuera de `127.0.0.1`** (`.env` con otro `HOST`, o `origin/main` sin el soporte de `HOST`): el deploy detecta la interfaz con `lsof`, detiene el servicio y falla. Prueba en Task 5, Step 6d.
3. **El plist apunta a un Node que ya no existe** (cambio de versión con nvm): el deploy falla antes de tocar nada y dice que corras `bun run service:install`. Prueba en Task 5, Step 6e.
4. **Deploy antes de instalar o con el servicio descargado:** mensaje claro con el comando a correr, sin efectos. Prueba en Task 3, Step 5.
5. **Proceso viejo todavía vivo al reiniciar:** el deploy no se da por bueno contra el proceso viejo, y tras dos deploys seguidos hay un único proceso escuchando. Prueba en Task 5, Step 6a.

---

### Task 1: `HOST` opcional en el arranque del server

**Files:**
- Create: `server/src/http/listenOptions.ts`
- Test: `server/src/http/listenOptions.test.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Produces: `resolveListenOptions(env: NodeJS.ProcessEnv): ListenOptions` y `interface ListenOptions { port: number; host?: string }`. Solo lo consume `server/src/index.ts`.

- [ ] **Step 1: Crear la rama**

```bash
git switch -c feat/publicacion-privada
```

- [ ] **Step 2: Write the failing test**

Crear `server/src/http/listenOptions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveListenOptions } from "./listenOptions.js";

describe("resolveListenOptions", () => {
  it("usa el puerto 4000 y todas las interfaces si no hay variables", () => {
    expect(resolveListenOptions({})).toEqual({ port: 4000 });
  });

  it("toma PORT y HOST del entorno", () => {
    expect(resolveListenOptions({ PORT: "4100", HOST: "127.0.0.1" })).toEqual({
      port: 4100,
      host: "127.0.0.1",
    });
  });

  it("trata un HOST vacío como no definido", () => {
    expect(resolveListenOptions({ PORT: "4100", HOST: "" })).toEqual({ port: 4100 });
  });

  it("rechaza un PORT que no es un entero", () => {
    expect(() => resolveListenOptions({ PORT: "abc" })).toThrow("PORT inválido: abc");
    expect(() => resolveListenOptions({ PORT: "4100.5" })).toThrow("PORT inválido: 4100.5");
  });

  it("rechaza un PORT fuera de rango", () => {
    expect(() => resolveListenOptions({ PORT: "0" })).toThrow("PORT inválido: 0");
    expect(() => resolveListenOptions({ PORT: "70000" })).toThrow("PORT inválido: 70000");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run server/src/http/listenOptions.test.ts`
Expected: FAIL porque no se puede resolver `./listenOptions.js` (el módulo no existe).

- [ ] **Step 4: Write minimal implementation**

Crear `server/src/http/listenOptions.ts`:

```typescript
export interface ListenOptions {
  port: number;
  host?: string;
}

const DEFAULT_PORT = 4000;
const MAX_PORT = 65535;

export function resolveListenOptions(env: NodeJS.ProcessEnv): ListenOptions {
  const rawPort = env.PORT ?? String(DEFAULT_PORT);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`PORT inválido: ${rawPort}`);
  }
  return env.HOST ? { port, host: env.HOST } : { port };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run server/src/http/listenOptions.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Usar `resolveListenOptions` en el arranque**

Reemplazar el contenido completo de `server/src/index.ts` por:

```typescript
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./http/app.js";
import { serveClient } from "./http/serveClient.js";
import { resolveListenOptions } from "./http/listenOptions.js";
import { connectMongo } from "./db/connection.js";

const { port, host } = resolveListenOptions(process.env);
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
const clientDist = join(dirname(fileURLToPath(import.meta.url)), "../../client/dist");

await connectMongo(MONGO_URL);
const app = createApp();
serveClient(app, clientDist);

const logListening = () => {
  console.log(`Ledgerly API en http://${host ?? "localhost"}:${port}`);
};

if (host) {
  app.listen(port, host, logListening);
} else {
  app.listen(port, logListening);
}
```

- [ ] **Step 7: Suite completa y typecheck**

Run: `bun run test && bun run typecheck`
Expected: todos los tests en verde, typecheck sin errores.

- [ ] **Step 8: Stage**

```bash
git add server/src/http/listenOptions.ts server/src/http/listenOptions.test.ts server/src/index.ts
```

---

### Task 2: Scripts `build` / `start` y Mongo con reinicio automático

**Files:**
- Modify: `package.json` (bloque `scripts`)
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `HOST` / `PORT` de Task 1.
- Produces: `bun run build` (genera `client/dist`) y `bun run start` (`node --env-file=.env --import tsx server/src/index.ts`). El plist de Task 3 usa exactamente esos argumentos de Node.

- [ ] **Step 1: Verificar que los scripts no existen**

Run: `bun run start`
Expected: FAIL con `error: Script not found "start"`.

- [ ] **Step 2: Agregar los scripts**

En `package.json`, dentro de `"scripts"`, agregar después de la línea de `"dev"`:

```json
    "build": "bun run --filter '@ledgerly/client' build",
    "start": "node --env-file=.env --import tsx server/src/index.ts",
```

- [ ] **Step 3: Reinicio automático de Mongo**

En `docker-compose.yml`, agregar `restart: unless-stopped` al servicio `mongo`, quedando:

```yaml
services:
  mongo:
    image: mongo:7
    container_name: ledgerly-mongo
    restart: unless-stopped
    ports:
      - "27018:27017"
    volumes:
      - ledgerly-mongo-data:/data/db
volumes:
  ledgerly-mongo-data:
```

Aplicar y verificar (recrea el contenedor; los datos viven en el volumen y se conservan):

```bash
docker compose up -d
docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' ledgerly-mongo
```

Expected: `unless-stopped`.

- [ ] **Step 4: Build del cliente**

Run: `bun run build && test -f client/dist/index.html && echo dist-ok`
Expected: salida de Vite terminando en `✓ built in …` y luego `dist-ok`.

- [ ] **Step 5: `start` con `HOST` escucha solo en loopback**

```bash
PORT=4101 HOST=127.0.0.1 bun run start > /tmp/ledgerly-start.log 2>&1 &
for _ in $(seq 1 20); do curl -fsS http://127.0.0.1:4101/api/health && break; sleep 1; done
echo
curl -s http://127.0.0.1:4101/ | grep -o '<title>Ledgerly</title>'
lsof -nP -iTCP:4101 -sTCP:LISTEN -Fn | sed -n 's/^n//p'
curl -s --max-time 3 "http://$(ipconfig getifaddr en0):4101/api/health"; echo "exit=$?"
lsof -ti tcp:4101 | xargs kill
```

Expected, en orden:
- `{"status":"ok"}`
- `<title>Ledgerly</title>` (Express sirve el build)
- `127.0.0.1:4101`
- `exit=7` (conexión rechazada desde la IP de la red local)

Las variables del entorno pisan las del `.env` (comportamiento de `--env-file`), por eso se puede probar desde el repo de desarrollo.

- [ ] **Step 6: Sin `HOST` el comportamiento no cambia**

```bash
PORT=4102 bun run start > /tmp/ledgerly-start.log 2>&1 &
for _ in $(seq 1 20); do curl -fsS http://127.0.0.1:4102/api/health >/dev/null && break; sleep 1; done
lsof -nP -iTCP:4102 -sTCP:LISTEN -Fn | sed -n 's/^n//p'
lsof -ti tcp:4102 | xargs kill
```

Expected: `*:4102` (todas las interfaces, como hoy).

- [ ] **Step 7: Stage**

```bash
git add package.json docker-compose.yml
```

---

### Task 3: Scripts de instalación y deploy

> **Nota posterior (review final):** los scripts del repo son la versión autoritativa. La review agregó `scripts/service-common.sh`, chequeos previos de `HOST` y de soporte de `HOST` en el ref, `launchctl disable`/`enable` en la guarda, y `scripts/test-service-scripts.sh` (`bun run test:scripts`). Detalle en el spec.

**Files:**
- Create: `scripts/install-service.sh`
- Create: `scripts/deploy.sh`
- Modify: `package.json` (bloque `scripts`)

**Interfaces:**
- Consumes: `bun run build` y los argumentos de Node de `bun run start` (Task 2); `HOST` (Task 1).
- Produces: `bun run service:install` y `bun run deploy [ref]`. Ambos aceptan `LEDGERLY_PROD_DIR` para cambiar la ruta del clon. `install-service.sh` termina ejecutando `deploy.sh`.

- [ ] **Step 1: Verificar que los scripts no existen**

Run: `bash scripts/deploy.sh`
Expected: FAIL con `bash: scripts/deploy.sh: No such file or directory`.

- [ ] **Step 2: Crear `scripts/install-service.sh`**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

LABEL="com.ledgerly.server"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_DIR="${LEDGERLY_PROD_DIR:-$HOME/Services/ledgerly}"
LOG_DIR="$HOME/Library/Logs/Ledgerly"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

fail() {
  echo "✖ $*" >&2
  exit 1
}

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
HOST=127.0.0.1
EOF
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
launchctl bootstrap "$DOMAIN" "$PLIST"

echo "✔ Servicio $LABEL instalado (node: $NODE_BIN)"
exec bash "$REPO_DIR/scripts/deploy.sh"
```

El índice `2` de `ProgramArguments` es la ruta de Node: `deploy.sh` la lee con `plutil -extract ProgramArguments.2`. Si se cambia el orden del array, hay que cambiar ese índice.

- [ ] **Step 3: Crear `scripts/deploy.sh`**

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

LABEL="com.ledgerly.server"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_DIR="${LEDGERLY_PROD_DIR:-$HOME/Services/ledgerly}"
LOG_DIR="$HOME/Library/Logs/Ledgerly"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
HEALTH_TIMEOUT_SECONDS=45

fail() {
  echo "✖ $*" >&2
  exit 1
}

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

[[ -d "$PROD_DIR/.git" ]] || fail "No existe $PROD_DIR. Corré primero: bun run service:install"
launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 ||
  fail "El servicio $LABEL no está cargado. Corré: bun run service:install"
NODE_BIN="$(plutil -extract ProgramArguments.2 raw "$PLIST")"
[[ -x "$NODE_BIN" ]] ||
  fail "El servicio apunta a un node que ya no existe ($NODE_BIN). Corré: bun run service:install"
PORT="$(sed -n 's/^PORT=//p' "$PROD_DIR/.env")"
[[ -n "$PORT" ]] || fail "Falta PORT en $PROD_DIR/.env"

if [[ $# -eq 0 ]]; then
  git -C "$REPO_DIR" fetch origin --quiet
  UNPUSHED="$(git -C "$REPO_DIR" rev-list --count origin/main..main)"
  if ((UNPUSHED > 0)); then
    echo "⚠ main tiene $UNPUSHED commit(s) sin pushear: no se van a publicar."
  fi
fi

REF="${1:-origin/main}"
PREVIOUS="$(git -C "$PROD_DIR" rev-parse --short HEAD)"
trap 'echo "✖ Deploy fallido. Para volver atrás: bun run deploy $PREVIOUS" >&2' ERR

git -C "$PROD_DIR" fetch origin --quiet
git -C "$PROD_DIR" reset --hard --quiet "$REF"
echo "→ Publicando $(git -C "$PROD_DIR" log -1 --oneline) (anterior: $PREVIOUS)"

cd "$PROD_DIR"
MONGOMS_DISABLE_POSTINSTALL=1 bun install --frozen-lockfile
bun run build

: > "$LOG_DIR/server.err.log"
OLD_PID="$(listener_pid || true)"
launchctl kickstart -k "$DOMAIN/$LABEL"

if ! wait_for_new_server; then
  tail -n 30 "$LOG_DIR/server.err.log" >&2
  fail "El servidor no respondió en ${HEALTH_TIMEOUT_SECONDS}s. Para volver atrás: bun run deploy $PREVIOUS"
fi

ADDRESSES="$(listen_addresses)"
if [[ "$ADDRESSES" != "127.0.0.1:$PORT" ]]; then
  launchctl bootout "$DOMAIN/$LABEL"
  fail "El servidor escuchaba en '$ADDRESSES', no solo en 127.0.0.1:$PORT. Servicio detenido para no exponerlo. Revisá HOST en $PROD_DIR/.env y corré: bun run service:install"
fi

echo "✔ Publicado $(git -C "$PROD_DIR" log -1 --oneline) en http://127.0.0.1:$PORT"
```

- [ ] **Step 4: Registrar los scripts en `package.json`**

En `package.json`, dentro de `"scripts"`, agregar después de `"start"`:

```json
    "deploy": "bash scripts/deploy.sh",
    "service:install": "bash scripts/install-service.sh",
```

Hacerlos ejecutables y chequear sintaxis:

```bash
chmod +x scripts/install-service.sh scripts/deploy.sh
bash -n scripts/install-service.sh && bash -n scripts/deploy.sh && echo syntax-ok
```

Expected: `syntax-ok`.

- [ ] **Step 5: Precondiciones del deploy (Review Focus 4)**

Todavía no hay nada instalado, así que estas pruebas no tienen efectos:

```bash
SANDBOX="$(mktemp -d)"
LEDGERLY_PROD_DIR="$SANDBOX/no-existe" bun run deploy; echo "exit=$?"
git init -q "$SANDBOX/clon-falso"
LEDGERLY_PROD_DIR="$SANDBOX/clon-falso" bun run deploy; echo "exit=$?"
rm -rf "$SANDBOX"
```

Expected:
- `✖ No existe …/no-existe. Corré primero: bun run service:install` y `exit=1`
- `✖ El servicio com.ledgerly.server no está cargado. Corré: bun run service:install` y `exit=1`

Si el segundo caso muestra otra cosa, verificar que `launchctl print gui/$(id -u)/com.ledgerly.server` falle (el servicio no debe estar instalado todavía).

- [ ] **Step 6: Stage**

```bash
git add scripts/install-service.sh scripts/deploy.sh package.json
```

---

### Task 4: Documentación en el README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: los nombres de scripts de Tasks 2 y 3 (`build`, `start`, `deploy`, `service:install`).

- [ ] **Step 1: Agregar los scripts nuevos a la lista**

En `README.md`, en la sección `## Scripts`, agregar al final de la lista:

```markdown
- `bun run build` — build del cliente (`client/dist`)
- `bun run start` — server sin watch, sirviendo `client/dist`
- `bun run service:install` — instala la versión publicada (ver abajo)
- `bun run deploy [ref]` — publica `origin/main` (o `ref`) en la versión publicada
```

- [ ] **Step 2: Agregar la sección de la versión publicada**

En `README.md`, antes de `## Privacidad`, insertar:

````markdown
## Versión publicada (privada)

Ledgerly corre de fondo en la Mac y se abre desde mis dispositivos vía Tailscale, sin exponerse a
internet. Diseño: `docs/superpowers/specs/2026-10-02-publicacion-privada-design.md`.

### Instalación (una vez)
1. Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**; `docker compose up -d`.
2. `bun run service:install` — clona `origin/main` en `~/Services/ledgerly`, crea su `.env`
   (puerto 4100, solo `127.0.0.1`), registra el servicio `com.ledgerly.server` y hace el primer deploy.
3. Tailscale en la Mac: `brew install --cask tailscale-app`, iniciar sesión, activar **Launch at login**.
4. Tailscale en el celular: misma cuenta.
5. [Admin de Tailscale](https://login.tailscale.com/admin): DNS → **MagicDNS** y **HTTPS Certificates**;
   Machines → renombrar la Mac a algo neutro (p. ej. `ledger`) y **Disable key expiry**.
6. `tailscale serve --bg http://127.0.0.1:4100` → `https://ledger.<tailnet>.ts.net`.
   **Nunca `tailscale funnel`**: eso publica en internet.

### Actualizar
Pushear a `main` y correr `bun run deploy`. Para volver a un commit: `bun run deploy <sha>`.
Si cambia la versión de Node (nvm): `bun run service:install`.

### Disponibilidad
Solo con la Mac **enchufada y con la tapa abierta**. Tapa cerrada o batería = Mac dormida.

### Logs
```bash
tail -f ~/Library/Logs/Ledgerly/server.log ~/Library/Logs/Ledgerly/server.err.log
```

### Desinstalar
```bash
launchctl bootout gui/$(id -u)/com.ledgerly.server
rm ~/Library/LaunchAgents/com.ledgerly.server.plist
tailscale serve reset
```
````

- [ ] **Step 3: Stage**

```bash
git add README.md
```

---

### Task 5: Instalación real y verificación de punta a punta

Esta tarea **no cambia código**: instala el servicio en la máquina del usuario y prueba los modos de
falla de `deploy.sh` (Task 3). Algunos pasos los tiene que hacer el usuario (cuentas, celular,
reinicio); están marcados **[usuario]**.

**Files:** ninguno.

**Interfaces:**
- Consumes: `bun run service:install`, `bun run deploy [ref]` (Task 3); `HOST` en `origin/main` (Task 1).

- [ ] **Step 1: GATE — los cambios tienen que estar en `origin/main`**

El clon publicado toma `origin/main`. Si se instala antes de que Tasks 1-4 estén ahí, el server no
conoce `HOST` y escucharía en todas las interfaces (la guarda de `deploy.sh` lo detendría, pero la
instalación fallaría).

**Frenar y pedirle al usuario** que commitee, mergee y pushee `feat/publicacion-privada` a `main`.
Esperar su confirmación y verificar:

```bash
git fetch origin && git cat-file -e origin/main:server/src/http/listenOptions.ts && echo gate-ok
```

Expected: `gate-ok`. Si falla, no seguir.

- [ ] **Step 2: [usuario] Docker al iniciar sesión**

Docker Desktop → Settings → General → activar **Start Docker Desktop when you sign in**.

Verificar Mongo:

```bash
docker compose up -d && docker inspect -f '{{.State.Running}} {{.HostConfig.RestartPolicy.Name}}' ledgerly-mongo
```

Expected: `true unless-stopped`.

- [ ] **Step 3: Instalar el servicio**

Run: `bun run service:install`
Expected (en orden): salida de `git clone`, `✔ Servicio com.ledgerly.server instalado (node: …/v20.19.6/bin/node)`, `→ Publicando <sha> <mensaje> (anterior: <sha>)`, salida de `bun install` y de Vite, y al final `✔ Publicado <sha> <mensaje> en http://127.0.0.1:4100`.

- [ ] **Step 4: Chequeos locales**

```bash
curl -s http://127.0.0.1:4100/api/health; echo
lsof -nP -iTCP:4100 -sTCP:LISTEN -Fn | sed -n 's/^n//p'
curl -s --max-time 3 "http://$(ipconfig getifaddr en0):4100/api/health"; echo "exit=$?"
nc -z -G 2 "$(ipconfig getifaddr en0)" 27018 && echo MONGO-EXPUESTO || echo mongo-rechazado
launchctl print gui/$(id -u)/com.ledgerly.server | grep -E '^\s+state ='
```

Expected: `{"status":"ok"}`, `127.0.0.1:4100`, `exit=7`, `mongo-rechazado`, `state = running`.

- [ ] **Step 5: Recuperación ante caída del proceso**

```bash
OLD=$(lsof -ti tcp:4100); kill "$OLD"
for _ in $(seq 1 30); do NEW=$(lsof -ti tcp:4100 || true); [[ -n "$NEW" && "$NEW" != "$OLD" ]] && break; sleep 1; done
echo "old=$OLD new=$NEW"; curl -s http://127.0.0.1:4100/api/health
```

Expected: `old` y `new` distintos y no vacíos, en ≤ ~15 s, y `{"status":"ok"}`.

- [ ] **Step 6: Modos de falla de `deploy.sh` (Review Focus 1, 2, 3, 5)**

**6a — dos deploys seguidos, un solo proceso (RF 5):**

```bash
bun run deploy && bun run deploy
lsof -ti tcp:4100 | wc -l | tr -d ' '
grep -c EADDRINUSE ~/Library/Logs/Ledgerly/server.err.log || true
```

Expected: ambos deploys terminan en `✔ Publicado …`; `1` proceso; `0` apariciones de `EADDRINUSE`.

**6b — rollback a un commit sin `HOST` se rechaza; rollback a uno con `HOST` funciona:**

```bash
bun run deploy 9f6f605; echo "exit=$?"
git -C ~/Services/ledgerly log -1 --format=%h
PREV=$(git -C ~/Services/ledgerly rev-list origin/main -- server/src/http/listenOptions.ts | sed -n 2p)
echo "prev=${PREV:-ninguno}"
```

Expected: `✖ 9f6f605 no soporta HOST: publicarlo expondría el puerto 4100 a la red…`, `exit=1`, y el clon sigue en el commit de `origin/main` (no se tocó nada). Si `prev` no es `ninguno`, correr `bun run deploy "$PREV" && bun run deploy` → ambos terminan en `✔ Publicado` (el primero publica `$PREV`, el segundo vuelve a `origin/main`). Si es `ninguno` (la feature entró en un solo commit), el rollback positivo queda cubierto por `bun run test:scripts`.

**6c — Mongo caída (RF 1):**

```bash
docker stop ledgerly-mongo
bun run deploy; echo "exit=$?"
```

Expected: tras ~45 s, las últimas líneas de `server.err.log` con `MongooseServerSelectionError`, la línea `✖ El servidor no respondió en 45s. Para volver atrás: bun run deploy <sha>` y `exit=1`.

Luego:

```bash
docker start ledgerly-mongo
for _ in $(seq 1 60); do curl -fsS http://127.0.0.1:4100/api/health && break; sleep 1; done; echo
```

Expected: `{"status":"ok"}` en ≤ ~45 s, sin tocar el servicio (lo relanza launchd).

**6d — `HOST` incorrecto se rechaza antes de tocar nada (RF 2):**

```bash
sed -i '' 's/^HOST=.*/HOST=0.0.0.0/' ~/Services/ledgerly/.env
bun run deploy; echo "exit=$?"
lsof -nP -iTCP:4100 -sTCP:LISTEN -Fn | sed -n 's/^n//p'
sed -i '' 's/^HOST=.*/HOST=127.0.0.1/' ~/Services/ledgerly/.env
```

Expected: `✖ HOST en …/.env es '0.0.0.0' y tiene que ser 127.0.0.1 para no exponer la app`, `exit=1`, y el servicio anterior sigue escuchando en `127.0.0.1:4100` (no hubo `kickstart`). La guarda posterior al arranque (`disable` + `bootout` + kill) no se puede disparar en la máquina real sin código roto; está cubierta por `bun run test:scripts` (casos 3 y 4).

**6e — Node inexistente (RF 3):**

```bash
plutil -replace ProgramArguments.2 -string /nonexistent/node ~/Library/LaunchAgents/com.ledgerly.server.plist
bun run deploy; echo "exit=$?"
bun run service:install
```

Expected: `✖ El servicio apunta a un node que ya no existe (/nonexistent/node). Corré: bun run service:install` y `exit=1`, sin `→ Publicando`; después `service:install` regenera el plist y termina en `✔ Publicado …`.

- [ ] **Step 7: Desarrollo en paralelo**

```bash
bun run dev > /tmp/ledgerly-dev.log 2>&1 &
for _ in $(seq 1 30); do curl -fsS http://localhost:5173/api/health >/dev/null && break; sleep 1; done
curl -s http://localhost:4000/api/health; echo
curl -s http://localhost:5173/api/health; echo
curl -s http://127.0.0.1:4100/api/health; echo
kill %1
lsof -ti tcp:4000,5173 | xargs kill 2>/dev/null || true
```

Expected: tres `{"status":"ok"}` (API de dev, proxy de Vite y versión publicada).

- [ ] **Step 8: [usuario] Tailscale**

1. `brew install --cask tailscale-app`, abrir la app, iniciar sesión, activar **Launch at login**.
2. Instalar Tailscale en el celular con la misma cuenta.
3. En login.tailscale.com/admin: DNS → **MagicDNS** y **HTTPS Certificates**; Machines → renombrar la Mac a `ledger` (o el nombre neutro que elija) y **Disable key expiry**.
4. Publicar (el usuario puede correrlo con `! ` en esta sesión):

```bash
tailscale serve --bg http://127.0.0.1:4100
tailscale serve status
```

Expected: `https://ledger.<tailnet>.ts.net (tailnet only)` → `proxy http://127.0.0.1:4100`. Si dice `Funnel on`, apagarlo con `tailscale funnel reset`.

- [ ] **Step 9: [usuario] Verificación desde afuera**

1. Celular con **Wi-Fi apagado**: abrir `https://ledger.<tailnet>.ts.net` → carga el dashboard con certificado válido. Importar un PDF desde la pantalla de importación → se procesa.
2. Un dispositivo **sin** Tailscale (o el celular con Tailscale desconectado): la misma URL no carga.
3. Reiniciar la Mac e iniciar sesión, sin tocar nada → desde el celular la URL vuelve a cargar en unos minutos (Docker, Mongo, servicio y Tailscale arrancan solos).

- [ ] **Step 10: Cierre**

Confirmar con el usuario que los pasos 8 y 9 dieron lo esperado. No hay archivos para stagear en esta tarea.
