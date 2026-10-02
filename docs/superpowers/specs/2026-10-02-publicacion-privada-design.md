# Publicación privada con Tailscale — diseño

Fecha: 2026-10-02
Estado: pendiente de revisión

## Objetivo

Tener Ledgerly **disponible desde mis dispositivos** (celular, otra compu), dentro y fuera de casa,
**sin exponerla a internet**. Nadie más que yo tiene que poder abrirla.

La versión publicada corre en mi MacBook, de fondo, y sobrevive reinicios. El desarrollo diario
(`bun run dev`) sigue funcionando en paralelo.

## Decisiones tomadas

- **Dónde corre:** en la MacBook Pro. Se acepta que la app esté disponible **solo mientras la Mac
  esté prendida, enchufada y con la tapa abierta** (ver [Límites](#límites)).
- **Acceso:** red privada de **Tailscale** con `tailscale serve`. Sin URL pública, sin Cloudflare,
  sin login dentro de la app: Tailscale es la barrera de acceso.
- **Arranque:** servicio de macOS (**LaunchAgent**) que arranca al iniciar sesión y se relanza si
  se cae.
- **Datos:** la versión publicada y la de desarrollo **comparten la misma base**
  (`mongodb://localhost:27018/ledgerly`). Lo que se importe o siembre en una aparece en la otra.
- **Código publicado:** un **clon aparte** del repo en `~/Services/ledgerly`, que sigue
  `origin/main`. La versión publicada solo cambia cuando corro `bun run deploy`; nunca toma código a
  medio hacer del working tree.

### Enfoques descartados

- **Solo red local** (`http://mac.local:4100`): no anda fuera de casa, no tiene HTTPS, y como la app
  no tiene login, cualquiera en el Wi-Fi vería las finanzas.
- **Cloudflare Tunnel + Access:** URL pública con login por email. Solo se justifica para entrar
  desde dispositivos donde no se puede instalar nada; va contra el requisito de no exponerla.
- **`git worktree` en vez de clon:** git no permite tener `main` checkouteado en dos worktrees a la
  vez, y el repo de desarrollo vive en `main`. El clon además calza con el flujo actual: pusheo a
  `main` y la versión publicada toma de ahí.
- **`pmset` global para evitar el sueño:** cambia el comportamiento de energía de toda la Mac.
  `caffeinate` atado al servicio es más acotado.

## Arquitectura

```
iPhone / otra compu  (con Tailscale, misma cuenta)
        │  https://<mac>.<tailnet>.ts.net
        ▼
tailscale serve  (en la Mac, certificado HTTPS de Tailscale)
        │  http://127.0.0.1:4100
        ▼
LaunchAgent com.ledgerly.server
  caffeinate -s → node --import tsx server/src/index.ts   (~/Services/ledgerly)
        │  Express: /api/* + client/dist
        ▼
MongoDB en Docker (localhost:27018/ledgerly)  ◄── compartida con bun run dev (:4000 / :5173)
```

| Pieza | Publicada | Desarrollo |
|---|---|---|
| Código | `~/Services/ledgerly` (clon, `origin/main`) | repo en `WebstormProjects` (working tree) |
| Puerto | `4100` | `4000` (API) + `5173` (Vite) |
| Interfaz | `127.0.0.1` | todas (sin cambios) |
| Base | `ledgerly` en `:27018` | la misma |
| Cliente | `client/dist` servido por Express | Vite dev server con proxy |

## Cambios en el repo

### `server/src/index.ts`

Lee un `HOST` opcional. Si está definido, `app.listen(PORT, HOST)`; si no, se comporta como hoy
(escucha en todas las interfaces). El log de arranque muestra el host y puerto reales. Un `PORT`
que no sea un entero entre 1 y 65535 corta el arranque con `PORT inválido: <valor>`.

`bun run dev` no define `HOST`, así que desarrollo no cambia.

### `package.json` raíz

Scripts nuevos:

| Script | Comando |
|---|---|
| `build` | `bun run --filter '@ledgerly/client' build` |
| `start` | `node --env-file=.env --import tsx server/src/index.ts` |
| `deploy` | `bash scripts/deploy.sh` |
| `service:install` | `bash scripts/install-service.sh` |

`start` usa `node --import tsx` en vez de `tsx` para que el proceso de Node sea hijo directo de
`caffeinate` (el CLI de `tsx` agrega un proceso intermedio). Es el mismo comando que usa el plist.

### `docker-compose.yml`

- `restart: unless-stopped` en el servicio `mongo`, para que el contenedor vuelva solo cuando
  arranca Docker Desktop.
- El puerto se publica **solo en loopback**: `"127.0.0.1:27018:27017"`. Antes se publicaba en
  todas las interfaces y sin autenticación, así que cualquiera en el mismo Wi-Fi podía leer la base
  directamente; con el contenedor siempre arriba esa exposición sería permanente. La app y
  `bun run dev` se conectan por `localhost` y no cambian.

### `scripts/service-common.sh`

Constantes y chequeos que comparten los dos scripts (se carga con `source`): label, rutas, `fail`,
lectura de valores del `.env`, `supports_host <ref>` (el ref contiene
`server/src/http/listenOptions.ts`) y `require_loopback_host` (el `HOST` del `.env` es exactamente
`127.0.0.1`).

### `scripts/install-service.sh`

Instalación de una vez. **Idempotente**: se puede volver a correr sin romper nada.

1. Si `~/Services/ledgerly` no existe, `git clone` del `origin` del repo actual en esa ruta.
2. Si el clon no tiene `.env`, lo crea:
   ```
   MONGO_URL=mongodb://localhost:27018/ledgerly
   PORT=4100
   HOST=127.0.0.1
   ```
3. Exige que `HOST` sea `127.0.0.1` y que el commit del clon soporte `HOST`. Si no lo soporta, lo
   lleva a `origin/main`; si `origin/main` tampoco lo soporta, corta con "pusheá los cambios a main
   antes de instalar". Así `RunAtLoad` nunca levanta código que escucharía en todas las interfaces.
4. `mkdir -p ~/Library/Logs/Ledgerly` (launchd no crea el directorio de logs).
5. Genera `~/Library/LaunchAgents/com.ledgerly.server.plist` con la ruta absoluta de Node tomada
   de `command -v node` **en el momento de correr el script** (launchd no carga nvm).
6. Si el servicio ya estaba cargado, `launchctl bootout`; después `launchctl enable` (deshace un
   `disable` de la guarda de privacidad) y `launchctl bootstrap gui/$(id -u)` con el plist nuevo.
7. Corre `deploy.sh`, así una sola instrucción deja todo publicado. Entre el `bootstrap` y el final
   del deploy, un clon recién creado todavía no tiene `node_modules`: el servicio falla y launchd lo
   reintenta hasta que el deploy lo reinicia. Es esperado y dura lo que tarde `bun install`.

Si cambio de versión de Node con nvm, vuelvo a correr `bun run service:install`.

Contenido del plist:

| Clave | Valor |
|---|---|
| `Label` | `com.ledgerly.server` |
| `ProgramArguments` | `/usr/bin/caffeinate -s <node> --env-file=.env --import tsx server/src/index.ts` |
| `WorkingDirectory` | `~/Services/ledgerly` (ruta absoluta) |
| `RunAtLoad` | `true` |
| `KeepAlive` | `true` |
| `StandardOutPath` | `~/Library/Logs/Ledgerly/server.log` |
| `StandardErrorPath` | `~/Library/Logs/Ledgerly/server.err.log` |
| `EnvironmentVariables.PATH` | directorio de `<node>` + `/usr/bin:/bin` |

`caffeinate -s` envuelve a Node: mientras el servicio vive, el sistema no se duerme **si está
enchufado**; a batería se duerme normal. Al parar o reiniciar el servicio, launchd mata todo el
grupo de procesos del job (comportamiento por defecto, `AbandonProcessGroup` en `false`), así que
Node no queda huérfano ocupando el puerto.

### `scripts/deploy.sh [ref]`

Se corre desde el repo de desarrollo con `bun run deploy`. Opera sobre `LEDGERLY_PROD_DIR`
(por defecto `~/Services/ledgerly`).

1. **Precondiciones**, cada una con un mensaje que dice qué correr:
   - existe el clon → si no, `bun run service:install`;
   - el servicio está cargado en launchd → si no, `bun run service:install`;
   - el Node al que apunta el plist existe → si no (p. ej. se desinstaló esa versión de nvm),
     `bun run service:install`;
   - el `HOST` del `.env` es exactamente `127.0.0.1` → si no, corta sin tocar nada.
2. Si se corre sin `ref` y el repo de desarrollo tiene commits en `main` que no están en
   `origin/main`, **avisa** (no corta): esos commits no se van a deployar.
3. Anota el commit actual del clon y hace `git fetch origin`. Corta sin tocar nada si `ref` no
   existe o **no soporta `HOST`** (p. ej. un rollback a un commit anterior a esta feature):
   publicarlo expondría el puerto. Recién entonces `git reset --hard ${ref:-origin/main}`. El
   `reset --hard` es seguro porque nadie edita ese clon; `.env` y `node_modules` están
   gitignoreados y sobreviven.
4. `MONGOMS_DISABLE_POSTINSTALL=1 bun install --frozen-lockfile`. La variable evita que
   `mongodb-memory-server` baje el binario de Mongo, que solo usan los tests.
5. `bun run build`.
6. Vacía `server.err.log`, anota el PID que escucha en el puerto y corre
   `launchctl kickstart -k gui/$(id -u)/com.ledgerly.server`.
7. Sondea hasta 45 segundos que **un proceso nuevo** (PID distinto al anotado) escuche en el puerto
   y que `http://127.0.0.1:4100/api/health` responda `ok`. Exigir el PID nuevo evita dar por bueno
   el deploy contra el proceso viejo mientras muere. Los 45 segundos superan los 30 que tarda
   Mongoose en rendirse si Mongo no responde, así el error llega al log antes de mostrarlo. Si no
   lo logra, sale con error y muestra las últimas 30 líneas de `server.err.log`.
8. **Guarda de privacidad**, última línea de defensa (los chequeos de los pasos 1 y 3 ya previenen
   los casos conocidos): verifica con `lsof` que el puerto escuche **solo** en `127.0.0.1`. Si
   escucha en otra interfaz, `launchctl disable` (persiste entre reinicios: el servicio no vuelve a
   arrancar al iniciar sesión), `launchctl bootout`, y si igual queda un proceso escuchando, lo mata.
   Sale con error aunque alguno de esos pasos falle, diciendo que hay que corregir, pushear y correr
   `bun run service:install` (que rehabilita el servicio).
9. Imprime el commit publicado (`git log -1 --oneline`).

El servidor solo empieza a escuchar después de conectar a Mongo (`await connectMongo` antes de
`listen`), así que un `/api/health` en `ok` también confirma la conexión a la base.

**Rollback:** `bun run deploy <sha>` publica ese commit, siempre que soporte `HOST`. Cualquier falla
después del `reset --hard` imprime el comando exacto para volver al commit anterior; las fallas
anteriores no cambiaron nada y no lo imprimen.

### `README.md`

Sección nueva **"Versión publicada (privada)"** con: la instalación de una vez (Tailscale +
`service:install` + `tailscale serve`), el flujo de deploy, dónde están los logs, y cómo
desinstalar:

```
launchctl bootout gui/$(id -u)/com.ledgerly.server
rm ~/Library/LaunchAgents/com.ledgerly.server.plist
tailscale serve reset
```

### Lo que no cambia

- **CORS** (`server/src/http/app.ts`): la versión publicada sirve cliente y API desde el mismo
  origen, así que el `cors({ origin: "http://localhost:5173" })` no interviene.
- **Cliente:** ya llama a `/api` con rutas relativas.

## Configuración manual (fuera del repo)

Pasos que hago yo una vez; el README los lista en orden.

**Docker Desktop**
- Settings → General → **Start Docker Desktop when you sign in**.

**Tailscale en la Mac**
1. `brew install --cask tailscale-app` (el cask `tailscale` es un alias de este), abrir la app,
   iniciar sesión, activar **Launch at login**.
2. Activar la CLI desde la app si `tailscale` no queda en el `PATH`.

**Tailscale en el celular**
- Instalar la app e iniciar sesión **con la misma cuenta**.

**Consola de admin** (login.tailscale.com/admin)
1. **DNS:** activar **MagicDNS** y **HTTPS Certificates**.
2. **Machines → la Mac:** renombrarla a algo neutro (p. ej. `ledger`) y **Disable key expiry**.
   Sin esto, la Mac se cae de la red cada 180 días hasta reautenticar.

**Publicar**
```
tailscale serve --bg http://127.0.0.1:4100
```
`--bg` deja la configuración persistida entre reinicios. **Nunca `tailscale funnel`**: eso sí
publica en internet.

**Opcional:** en Safari del iPhone, Compartir → Agregar a inicio.

## Seguridad y privacidad

- Solo los dispositivos con sesión en mi tailnet llegan a la app. Si nunca invito a nadie al
  tailnet, soy solo yo.
- MongoDB se publica solo en `127.0.0.1:27018`: la base no tiene autenticación, así que no puede
  ser alcanzable desde la red.
- El servidor escucha en `127.0.0.1`: ni siquiera otros equipos en el mismo Wi-Fi pueden
  conectarse directo al puerto 4100.
- La app no tiene login propio. Quien tenga uno de mis dispositivos desbloqueado y con Tailscale
  conectado puede entrar, igual que con cualquier app con sesión abierta.
- **Certificate Transparency:** el certificado HTTPS hace público el nombre
  `<mac>.<tailnet>.ts.net` en los logs de CT. El contenido y el acceso siguen privados, pero el
  nombre de la máquina se ve: por eso se renombra a algo neutro.

## Límites

- **Tapa cerrada = Mac dormida.** Ninguna configuración de software lo evita, salvo modo clamshell
  (monitor externo + cargador). La app está disponible solo con la Mac enchufada y la tapa abierta.
  La pantalla sí puede apagarse.
- **A batería se duerme** con la configuración normal de energía (`caffeinate -s` solo actúa
  enchufada).
- **Base compartida:** si en desarrollo cambio el formato de los datos, la versión publicada puede
  leer documentos que todavía no entiende hasta que haga deploy. Aceptable para uso personal.

## Verificación

**Automática**
- `bun run test`, `bun run typecheck` y `bun run build` en verde.

**Manual** (después de la instalación)
1. `curl http://127.0.0.1:4100/api/health` → `{"status":"ok"}`.
2. `curl http://<IP LAN de la Mac>:4100/api/health` → conexión rechazada, y
   `nc -z <IP LAN de la Mac> 27018` → rechazado (Mongo no se ve desde la red).
3. Desde el celular **con Wi-Fi apagado**, `https://<mac>.<tailnet>.ts.net` abre el dashboard y
   permite importar un PDF.
4. Desde un dispositivo sin Tailscale, la URL no carga.
5. `kill` del proceso de Node → vuelve solo en ~10 segundos; `lsof -i :4100` muestra un único
   proceso.
6. `bun run deploy` dos veces seguidas → ambas terminan en `ok`, sin `EADDRINUSE` en el log.
7. Reiniciar la Mac e iniciar sesión → todo vuelve sin intervención.
8. `bun run dev` en paralelo sigue andando en `:4000` / `:5173`.

## Fuera de alcance

- **Backups de Mongo.** El volumen de Docker es la única copia de los datos. Recomendado como
  próximo paso, en un diseño aparte.
- **Deploy automático al pushear.**
- **Servidor siempre prendido** (Mac mini, Raspberry, VPS) para no depender de la MacBook.
