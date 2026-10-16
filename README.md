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
bun run migrate:owner      # crea tu usuario (OWNER_EMAIL)
bun run seed               # reglas de categoría base
bun run dev                # API :4000 + SPA :5173
```

## Scripts
- `bun run dev` — backend + frontend
- `bun run test` — toda la suite (Vitest)
- `bun run typecheck` — TypeScript de todo el monorepo
- `bun run migrate:owner` — crea el usuario owner y le asigna los datos que no tienen dueño (se puede correr varias veces)
- `bun run seed` — siembra reglas de categoría
- `bun run build` — build del cliente (`client/dist`)
- `bun run start` — server sin watch, sirviendo `client/dist`
- `bun run service:install` — instala la versión publicada y su deploy automático (ver abajo)
- `bun run deploy [ref]` — publica `origin/main` (o `ref`) en la versión publicada
- `bun run test:scripts` — prueba `install-service.sh` / `deploy.sh` con `launchctl` y `lsof` simulados
- `bun run gmail:auth` — autoriza a Ledgerly a leer tu Gmail (solo lectura) y guarda el refresh token en `.env`

## Login

Ledgerly pide entrar con Google. Solo entran el owner (`OWNER_EMAIL`) y los mails de `ALLOWED_EMAILS`; cada uno ve
únicamente sus datos. La sesión dura 30 días en una cookie; «Salir», en el menú del avatar, la cierra. La sección
«Mails» de Importar es solo del owner: la búsqueda automática de mails importa siempre a su nombre.
Diseño: `docs/superpowers/specs/2026-10-16-login-multiusuario-design.md`.

### Cliente de Google (una vez)
1. [Google Cloud Console](https://console.cloud.google.com) → Google Auth Platform → **Desarrollo de la marca**:
   nombre «Ledgerly» y tu mail.
2. **Público**: tipo **Externo**. Mientras la app esté en estado «Prueba», solo entran los mails cargados en
   **Usuarios de prueba** (la cuenta dueña del proyecto entra igual): sumá ahí a cada persona de `ALLOWED_EMAILS`,
   o publicá la app.
3. **Acceso a los datos**: solo `openid`, `email` y `profile`.
4. **Clientes** → Crear cliente → **Aplicación web**, con las redirect URIs:
   - `http://localhost:5173/api/auth/google/callback` (desarrollo)
   - `https://ledger.<tailnet>.ts.net/api/auth/google/callback` (versión publicada)
5. Copiar el ID y el secreto a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` del `.env`.

### Variables
`SESSION_SECRET` (al menos 32 caracteres: `openssl rand -base64 48`), `OWNER_EMAIL`, `ALLOWED_EMAILS` (separados por
coma) y `PUBLIC_URL` (`http://localhost:5173` en desarrollo, `https://ledger.<tailnet>.ts.net` en la publicada). Si
falta alguna, el server no arranca y dice cuál.

### Sumar o sacar a alguien
Sumar: agregar su mail a `ALLOWED_EMAILS` (y como usuario de prueba en Google) y reiniciar. Arranca vacío, con las
reglas de categoría del sistema. Sacar: borrar su mail de `ALLOWED_EMAILS` y reiniciar; pierde el acceso aunque tenga
una sesión abierta. Sus datos quedan en la base.

### Puesta en marcha en la versión publicada
1. Backup: `docker exec ledgerly-mongo mongodump --archive=/data/db/backup-pre-login.archive`.
2. Cliente de Google con la redirect URI de Tailscale (arriba).
3. Las variables nuevas en `~/Services/ledgerly/.env`, con `PUBLIC_URL=https://ledger.<tailnet>.ts.net`.
4. Merge a `main`: el auto-deploy publica. Si falta una variable el server no arranca y el auto-deploy vuelve solo
   al commit anterior.
5. `bun run migrate:owner` (desarrollo y publicada comparten el Mongo de Docker). Hasta correrlo, la app se ve vacía;
   no se pierde nada.
6. Entrar con la cuenta del owner.
7. Sumar a la otra persona (arriba).

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
   Los cupones del plan de auto (certisend) llegan sin adjunto, solo con un link: Ledgerly baja el
   PDF desde el link del cupón, leído solo de los mails enviados por la plataforma certisend
   (`@enviocertificado.com`) (únicamente `go.certisend.com/coupon/<id>` y su conversión
   en `html2pdf.certisend.com`; los links de seguimiento nunca se abren). La carpeta donde caen
   esos mails tiene que estar en `ICLOUD_MAILBOXES`, por ejemplo `ICLOUD_MAILBOXES=INBOX,Auto`.
4. Reiniciar `bun run dev` → Importar → **Buscar en iCloud**.
5. Versión publicada: copiar las líneas `ICLOUD_*` a `~/Services/ledgerly/.env`, sumar
   `MAIL_SYNC_DAYS=25-5` (y, si querés otra hora, `MAIL_SYNC_HOUR=21`; va de 0 a 23) y correr
   `launchctl kickstart -k gui/$(id -u)/com.ledgerly.server`. En `server.log` aparece
   `Mails: búsqueda automática todos los días a las 21 h, del 25 al 5`. La búsqueda corre una vez
   por día a esa hora, solo entre el 25 y el 5 (los resúmenes llegan dos veces por mes); el rango
   puede cruzar el fin de mes. Si la Mac estaba dormida o apagada a esa hora, o el servicio se
   reinició, la búsqueda que quedó pendiente corre a los 60 segundos de arrancar. Es una sola
   agenda para iCloud y Gmail. Dejar la búsqueda automática **solo** en la
   publicada. Las corridas automáticas avisan con una notificación de macOS cuando importan algo o
   algo falla; la primera vez puede hacer falta habilitar las notificaciones de «Script Editor» en
   Ajustes → Notificaciones. Si al arrancar el servicio falta la contraseña en el Llavero, la
   búsqueda automática corre igual: la tarjeta y la notificación te dicen qué falta, y empieza a
   funcionar apenas la cargues.
6. Revocar: borrar la contraseña de app en account.apple.com, el ítem del Llavero
   (`security delete-generic-password -s ledgerly-icloud-imap -a <tu-cuenta>@icloud.com`) y las
   líneas `ICLOUD_*`.

### Recibos de sueldo por reenvío

Para que la búsqueda de iCloud también importe los recibos de sueldo, crear en la casilla laboral
(Gmail) un filtro cuyo remitente sea el de liquidaciones de la empresa (`<remitente-de-recibos>`)
con la acción «Reenviar a» `<tu-cuenta>@icloud.com` (Gmail pide confirmar la dirección de destino
una sola vez). Los recibos llegan entonces a iCloud y entran por el mismo camino que los resúmenes.

Si Apple invalida la contraseña (cambio de contraseña de Apple o revocación), la tarjeta muestra el
error: generar una nueva y actualizarla con `security add-generic-password -U -s ledgerly-icloud-imap
-a <tu-cuenta>@icloud.com -w`. No hace falta reiniciar: cada corrida lee la contraseña del Llavero.

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
    `MAIL_SYNC_DAYS=25-5` (y, opcional, `MAIL_SYNC_HOUR=21`) y correr
    `launchctl kickstart -k gui/$(id -u)/com.ledgerly.server`. La agenda es la misma que la de
    iCloud (una vez por día a esa hora, solo del 25 al 5); si la Mac dormía a esa hora, la búsqueda
    pendiente corre al volver. En `server.log` aparece
    `Mails: búsqueda automática todos los días a las 21 h, del 25 al 5`. Dejar la búsqueda
    automática **solo** en la publicada.
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
