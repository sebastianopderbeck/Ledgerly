# Ledgerly

Gastos corrientes a partir del PDF del resumen de tarjeta (Visa Signature / ICBC).
Vite + React 18 + MUI · Express + MongoDB.

## Requisitos
- Node ≥ 20, Bun ≥ 1.1, Docker (para Mongo local).

## Puesta en marcha
```bash
bun install
cp .env.example .env
docker compose up -d       # MongoDB en localhost:27018
bun run seed               # reglas de categoría base
bun run dev                # API :4000 + SPA :5173
```

## Scripts
- `bun run dev` — backend + frontend
- `bun run test` — toda la suite (Vitest)
- `bun run typecheck` — TypeScript de todo el monorepo
- `bun run seed` — siembra reglas de categoría
- `bun run build` — build del cliente (`client/dist`)
- `bun run start` — server sin watch, sirviendo `client/dist`
- `bun run service:install` — instala la versión publicada y su deploy automático (ver abajo)
- `bun run deploy [ref]` — publica `origin/main` (o `ref`) en la versión publicada
- `bun run test:scripts` — prueba `install-service.sh` / `deploy.sh` con `launchctl` y `lsof` simulados
- `bun run gmail:auth` — autoriza a Ledgerly a leer tu Gmail (solo lectura) y guarda el refresh token en `.env`

## Versión publicada (privada)

Ledgerly corre de fondo en la Mac y se abre desde mis dispositivos vía Tailscale, sin exponerse a
internet. Diseño: `docs/superpowers/specs/2026-10-02-publicacion-privada-design.md`.

### Instalación (una vez)
1. Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**; `docker compose up -d`.
2. `bun run service:install` — clona `origin/main` en `~/Services/ledgerly`, crea su `.env`
   (puerto 4100, solo `127.0.0.1`), registra el servicio `com.ledgerly.server`, hace el primer deploy
   y registra el deploy automático `com.ledgerly.auto-deploy`.
3. Tailscale en la Mac: `brew install --cask tailscale-app`, iniciar sesión, activar **Launch at login**.
4. Tailscale en el celular: misma cuenta.
5. [Admin de Tailscale](https://login.tailscale.com/admin): DNS → **MagicDNS** y **HTTPS Certificates**;
   Machines → renombrar la Mac a algo neutro (p. ej. `ledger`) y **Disable key expiry**.
6. `tailscale serve --bg http://127.0.0.1:4100` → `https://ledger.<tailnet>.ts.net`.
   **Nunca `tailscale funnel`**: eso publica en internet.

### Actualizar
Automático: cada minuto `com.ledgerly.auto-deploy` revisa `origin/main` y, si cambió (push directo o
merge de un PR), lo publica y avisa con una notificación. Si el deploy falla, vuelve solo al commit
anterior, avisa, y no reintenta ese commit hasta el próximo cambio en `main`.

Manual: `bun run deploy` publica `origin/main` ya. Para volver a un commit: `bun run deploy <sha>`;
ese rollback se mantiene hasta el próximo cambio en `main`. Si hay otro deploy corriendo, espera a
que termine. Si cambia la versión de Node (nvm) o de Bun: `bun run service:install`.

### Disponibilidad
Solo con la Mac **enchufada y con la tapa abierta**. Tapa cerrada o batería = Mac dormida.

### Logs
```bash
tail -f ~/Library/Logs/Ledgerly/server.log ~/Library/Logs/Ledgerly/server.err.log
tail -f ~/Library/Logs/Ledgerly/auto-deploy.log
```

### Desinstalar
```bash
launchctl bootout gui/$(id -u)/com.ledgerly.auto-deploy
rm ~/Library/LaunchAgents/com.ledgerly.auto-deploy.plist
launchctl bootout gui/$(id -u)/com.ledgerly.server
rm ~/Library/LaunchAgents/com.ledgerly.server.plist
tailscale serve reset
```

## Importar desde iCloud (opcional)

Ledgerly puede revisar tu casilla de iCloud por IMAP en **solo lectura** (no marca, no mueve y no
borra nada) y pasar los PDFs adjuntos por el mismo importador que la subida manual. Sirve para los
resúmenes de tarjeta y los cupones que llegan a iCloud. Sin configurar, la tarjeta «iCloud» de la
sección «Mails» de Importar dice qué falta y el server no intenta conectarse.
Diseño: `docs/superpowers/specs/2026-10-05-importacion-icloud-design.md`.

1. [account.apple.com](https://account.apple.com) → Inicio de sesión y seguridad → **Contraseñas de
   apps** → generar una con el nombre «Ledgerly».
2. Guardarla en el Llavero. El comando la pide, así no queda en el historial:
   `security add-generic-password -s ledgerly-icloud-imap -a <tu-cuenta>@icloud.com -w`
3. En el `.env`: `ICLOUD_USER=<tu-cuenta>@icloud.com` y, si hace falta, `ICLOUD_SINCE=AAAA-MM-DD`
   (desde cuándo buscar; sin ella, los últimos 90 días) e `ICLOUD_MAILBOXES=INBOX,Otra carpeta`.
4. Reiniciar `bun run dev` → Importar → **Buscar en iCloud**.
5. Versión publicada: copiar las líneas `ICLOUD_*` a `~/Services/ledgerly/.env`, sumar
   `ICLOUD_SYNC_INTERVAL_MINUTES=360` y correr
   `launchctl kickstart -k gui/$(id -u)/com.ledgerly.server`. En `server.log` aparece
   `iCloud: búsqueda automática cada 360 min (…)`. Dejar la búsqueda automática **solo** en la
   publicada. Las corridas automáticas avisan con una notificación de macOS cuando importan algo o
   algo falla; la primera vez puede hacer falta habilitar las notificaciones de «Script Editor» en
   Ajustes → Notificaciones.
6. Revocar: borrar la contraseña de app en account.apple.com, el ítem del Llavero
   (`security delete-generic-password -s ledgerly-icloud-imap -a <tu-cuenta>@icloud.com`) y las
   líneas `ICLOUD_*`.

Si Apple invalida la contraseña (cambio de contraseña de Apple o revocación), la tarjeta muestra el
error: generar una nueva, actualizarla con `security add-generic-password -U -s ledgerly-icloud-imap
-a <tu-cuenta>@icloud.com -w` y reiniciar.

## Importar desde Gmail (opcional)

Ledgerly puede buscar en tu casilla los PDFs que te llegan por mail (resúmenes, cupones y recibos) y
pasarlos por el mismo importador que la subida manual. Lee el mail con permiso de **solo lectura**.
Sin las credenciales, la tarjeta «Gmail» de la sección «Mails» de Importar dice qué falta y el server no intenta conectarse.
Diseño: `docs/superpowers/specs/2026-10-03-importacion-gmail-design.md`.

1. [Google Cloud Console](https://console.cloud.google.com) → proyecto nuevo «Ledgerly».
2. APIs y servicios → Biblioteca → **Gmail API** → Habilitar.
3. Google Auth Platform → **Desarrollo de la marca**: nombre «Ledgerly» y tu mail como soporte y
   contacto. **Público**: tipo **Externo** (si la casilla es de un Google Workspace propio,
   **Interno**, y se saltea el paso 5).
4. **Acceso a los datos** → Agregar permisos → `https://www.googleapis.com/auth/gmail.readonly`.
5. **Público** → **Publicar app** (queda «En producción»). En estado «Prueba», Google vence el
   refresh token a los 7 días. No hace falta pedir verificación: al autorizar aparece «Google no
   verificó esta app» → Configuración avanzada → Ir a Ledgerly.
6. **Clientes** → Crear cliente → tipo **App de escritorio**, nombre «Ledgerly». Copiar el ID y el
   secreto a `GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET` del `.env`.
7. `bun run gmail:auth` → abrir el link, elegir la cuenta y aceptar el permiso de **solo lectura**.
   El script guarda `GMAIL_REFRESH_TOKEN` en `.env` y no lo muestra.
8. Reiniciar `bun run dev` → Importar → **Buscar en Gmail**.
9. (Opcional) Acotar la búsqueda: probarla antes en el buscador de Gmail y cargarla entre comillas,
   p. ej. `GMAIL_QUERY="from:(resumenes@mibanco.com.ar OR recibos@miempresa.com) has:attachment filename:pdf newer_than:90d"`.
10. Versión publicada: copiar las líneas `GMAIL_*` a `~/Services/ledgerly/.env`, sumar
    `GMAIL_SYNC_INTERVAL_MINUTES=360` y correr
    `launchctl kickstart -k gui/$(id -u)/com.ledgerly.server`. En `server.log` aparece
    `Gmail: búsqueda automática cada 360 min`. Dejar la búsqueda automática **solo** en la publicada.
11. Revocar: [myaccount.google.com/connections](https://myaccount.google.com/connections) →
    Ledgerly → Borrar todas las conexiones, y borrar las líneas `GMAIL_*`. Si el secreto se filtró,
    borrar el cliente en «Clientes» y crear otro.

Si Google revoca el token (cambio de contraseña, revocación manual o 6 meses sin uso), la sección
muestra el error: volver a correr `bun run gmail:auth`, copiar la línea nueva al `.env` que
corresponda y reiniciar.

## Privacidad
Los PDFs reales (`examples/`) están gitignoreados; los fixtures de test son sintéticos.
No se commitea data financiera real.
El refresh token de Gmail da lectura de todo el mail: vive solo en `.env` (gitignoreado), nunca se
loguea ni se manda al cliente. Los PDFs de Gmail se procesan en memoria; no se guarda asunto,
remitente ni cuerpo de ningún mail.
La contraseña de app de iCloud vive solo en el Llavero de macOS: el server la lee en cada corrida, nunca la loguea ni la manda al cliente.
