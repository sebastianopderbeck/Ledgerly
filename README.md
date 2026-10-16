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
- `bun run backup` — copia la base de Atlas a `backups/` (ver «Producción en Vercel»)
- `bun run backup:restore-local` — restaura el último backup en el Mongo de Docker local
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
   - `https://<app>.vercel.app/api/auth/google/callback` (producción)
5. Copiar el ID y el secreto a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` del `.env`.

### Variables
`SESSION_SECRET` (al menos 32 caracteres: `openssl rand -base64 48`), `OWNER_EMAIL`, `ALLOWED_EMAILS` (separados por
coma) y `PUBLIC_URL` (`http://localhost:5173` en desarrollo, `https://<app>.vercel.app` en producción). Si falta
alguna, el server local no arranca y dice cuál; en Vercel la API responde «Error interno» y el log de la función dice
cuál (`Arranque: …`).

### Sumar o sacar a alguien
Sumar: agregar su mail a `ALLOWED_EMAILS` (y como usuario de prueba en Google) y reiniciar (en Vercel: cambiar la
variable y redeployar). Arranca vacío, con las reglas de categoría del sistema. Sacar: borrar su mail de
`ALLOWED_EMAILS` y reiniciar o redeployar; pierde el acceso aunque tenga una sesión abierta. Sus datos quedan en la
base.

### Puesta en marcha en producción
Ver «Producción en Vercel» → «El corte».

## Producción en Vercel

Ledgerly corre en Vercel: el cliente como sitio estático y la API de Express en una función
(`api/index.ts`; `vercel.json` manda ahí todo `/api/*`). La base es un cluster Free de MongoDB Atlas. Cada merge a `main` deploya
producción. Los preview deployments de las ramas no tienen variables: no tocan ninguna base (la API
responde «Error interno») y quedan detrás del login de Vercel.
Diseño: `docs/superpowers/specs/2026-10-16-deploy-vercel-design.md`.

### Variables de producción
Se cargan en el proyecto de Vercel → Settings → Environment Variables, **solo en Production** y
marcadas como **Sensitive**. Después de cambiar una, redeployar.

| Variable | Valor |
|---|---|
| `MONGO_URL` | `mongodb+srv://…` de Atlas |
| `PUBLIC_URL` | `https://<app>.vercel.app` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | cliente OAuth del login (con la redirect URI de Vercel) |
| `SESSION_SECRET`, `OWNER_EMAIL`, `ALLOWED_EMAILS` | como en «Login» |
| `CRON_SECRET` | aleatorio, 32+ caracteres (`openssl rand -base64 48`) |
| `MAIL_SYNC_DAYS` | `25-5` |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_QUERY` | como en el `.env` (opcionales) |
| `ICLOUD_USER`, `ICLOUD_APP_PASSWORD`, `ICLOUD_SINCE`, `ICLOUD_MAILBOXES` | como en el `.env`, con la contraseña de app en variable (opcionales) |
| `GOOGLE_VISION_API_KEY` | API key restringida a Cloud Vision |

### El corte
Se hace una sola vez. Entre los pasos 1 y 6 nadie escribe en ninguna base.

1. Apagar el servicio de la Mac y su auto-deploy:
   ```bash
   launchctl bootout gui/$(id -u)/com.ledgerly.auto-deploy
   launchctl bootout gui/$(id -u)/com.ledgerly.server
   ```
2. Backup del Mongo local, fuera del volumen de Docker:
   ```bash
   docker exec ledgerly-mongo mongodump --db=ledgerly --archive=/tmp/pre-vercel.archive
   docker cp ledgerly-mongo:/tmp/pre-vercel.archive ~/backup-pre-vercel.archive
   ```
3. En el Mongo local, con el `.env` apuntando a él y el `OWNER_EMAIL` de producción:
   `bun run migrate:owner`.
4. [MongoDB Atlas](https://cloud.mongodb.com): cluster **Free** en São Paulo (si Free no lo ofrece,
   `us-east-1`, y en `vercel.json` la región pasa a `iad1`). Database Access: un usuario solo para la
   app, contraseña aleatoria larga, rol `readWrite` sobre la base `ledgerly`. Network Access:
   `0.0.0.0/0` (Vercel no tiene IPs fijas; protegen las credenciales y TLS). Backup: snapshot
   diario, se guardan los últimos cuatro. Copiar el string `mongodb+srv://…/ledgerly` a `ATLAS_URL`
   en el `.env` local y restaurar:
   ```bash
   mkdir -p backups
   docker exec ledgerly-mongo mongodump --db=ledgerly --archive=/tmp/para-atlas.archive
   docker cp ledgerly-mongo:/tmp/para-atlas.archive backups/para-atlas.archive
   ATLAS_URL="$(grep -E '^ATLAS_URL=' .env | cut -d= -f2- | tr -d '"')"
   docker run --rm -v "$PWD/backups:/backups" mongo:7 \
     mongorestore --uri="$ATLAS_URL" --archive=/backups/para-atlas.archive --nsInclude='ledgerly.*'
   bun run backup
   ```
   El `bun run backup` del final prueba que el backup de Atlas anda.
5. [Vercel](https://vercel.com/new): importar el repo de GitHub (preset **Other**: el build, la salida
   y la región salen de `vercel.json`; Node 22 sale de `engines`). Cargar las variables de arriba en
   Production. En el cliente OAuth del login, sumar la redirect URI
   `https://<app>.vercel.app/api/auth/google/callback`. En Google Cloud: habilitar **Cloud Vision
   API** (pide una cuenta de facturación), crear una API key restringida a Cloud Vision API y una
   alerta de presupuesto de USD 1; la key va en `GOOGLE_VISION_API_KEY`.
6. Merge a `main` → deploy de producción.
7. Verificar:
   1. Login del owner en la web y en la PWA instalada en el iPhone; ver los datos migrados.
   2. Importar un PDF de resumen y un cupón en imagen.
   3. «Buscar» en iCloud y en Gmail a mano.
   4. Disparar cada cron a mano (abajo) y ver el resumen; ver el punto en Importar y que se apaga
      al entrar.
   5. Login de la otra persona: arranca vacía y no ve «Mails».
8. Sumar a la otra persona: su mail en `ALLOWED_EMAILS` (redeploy) y como usuario de prueba en Google.
9. Limpiar la Mac:
   ```bash
   rm ~/Library/LaunchAgents/com.ledgerly.auto-deploy.plist ~/Library/LaunchAgents/com.ledgerly.server.plist
   tailscale serve reset
   ```
   El volumen de Docker queda como copia vieja.

### Búsqueda automática de mails
Dos cron de Vercel (`vercel.json`) llaman a `/api/cron/mail/icloud` a las 21 h de Argentina y a
`/api/cron/mail/gmail` a las 22 h, con una tolerancia de hasta una hora (plan Hobby). Corren todos los
días, pero solo buscan entre los días de `MAIL_SYNC_DAYS`, contados en hora de Argentina; fuera de
esos días responden `{"skipped":"fuera de agenda"}`. Vercel manda `CRON_SECRET` en cada llamada; sin
él, la ruta responde 401. Importan siempre a nombre del owner. Cuando una corrida automática importa
algo o algo falla, aparece un punto en el ícono de Importar; se apaga al entrar a Importar.

Disparar un cron a mano:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/cron/mail/icloud
```

### Cupones en imagen
En producción el OCR es Google Cloud Vision (`GOOGLE_VISION_API_KEY`). No lee HEIC: la app pide la
imagen como JPG o PNG. En la Mac, sin esa variable, usa el OCR de macOS.

### Límite de subida
La subida web acepta archivos de hasta 4 MB (Vercel corta los requests de más de 4,5 MB). Los
adjuntos de mail no pasan por ese límite.

### Backups
- Atlas guarda un snapshot diario (los últimos cuatro).
- `bun run backup`: copia la base de Atlas a `backups/ledgerly-<AAAA-MM-DD>.archive`. Necesita
  `ATLAS_URL` en el `.env` y Docker (usa la imagen `mongo:7`).
- `bun run backup:restore-local`: restaura el último archivo de `backups/` en el Mongo de Docker local
  (reemplaza lo que haya), para desarrollar con datos reales.

### Logs
`bunx vercel logs <url-del-deploy>` o la pestaña **Logs** del proyecto en Vercel.

## Importar desde iCloud (opcional)

Ledgerly puede revisar tu casilla de iCloud por IMAP en **solo lectura** (no marca, no mueve y no
borra nada) y pasar los PDFs adjuntos por el mismo importador que la subida manual. Sirve para los
resúmenes de tarjeta y los cupones que llegan a iCloud. Sin configurar, la tarjeta «iCloud» de la
sección «Mails» de Importar dice qué falta y el server no intenta conectarse.
Diseño: `docs/superpowers/specs/2026-10-05-importacion-icloud-design.md`.

1. [account.apple.com](https://account.apple.com) → Inicio de sesión y seguridad → **Contraseñas de
   apps** → generar una con el nombre «Ledgerly».
2. En desarrollo, guardarla en el Llavero (en producción va en `ICLOUD_APP_PASSWORD`, ver abajo). El
   comando la pide, así no queda en el historial:
   `security add-generic-password -s ledgerly-icloud-imap -a <tu-cuenta>@icloud.com -w`
3. En el `.env`: `ICLOUD_USER=<tu-cuenta>@icloud.com` y, si hace falta, `ICLOUD_SINCE=AAAA-MM-DD`
   (desde cuándo buscar; sin ella, los últimos 90 días) e `ICLOUD_MAILBOXES=INBOX,Otra carpeta`.
   Los cupones del plan de auto (certisend) llegan sin adjunto, solo con un link: Ledgerly baja el
   PDF desde el link del cupón, leído solo de los mails enviados por la plataforma certisend
   (`@enviocertificado.com`) (únicamente `go.certisend.com/coupon/<id>` y su conversión
   en `html2pdf.certisend.com`; los links de seguimiento nunca se abren). La carpeta donde caen
   esos mails tiene que estar en `ICLOUD_MAILBOXES`, por ejemplo `ICLOUD_MAILBOXES=INBOX,Auto`.
4. Reiniciar `bun run dev` → Importar → **Buscar en iCloud**.
5. Producción: cargar en Vercel `ICLOUD_USER`, `ICLOUD_APP_PASSWORD` (la contraseña de app) y, si
   hacen falta, `ICLOUD_SINCE` e `ICLOUD_MAILBOXES`, más `MAIL_SYNC_DAYS=25-5`, y redeployar. La
   búsqueda automática corre a las 21 h de Argentina (con hasta una hora de tolerancia), solo entre el
   25 y el 5 (los resúmenes llegan dos veces por mes); el rango puede cruzar el fin de mes. No hay
   notificaciones de macOS: el punto en Importar avisa cuando una corrida importa algo o algo falla.
   Ver «Producción en Vercel» → «Búsqueda automática de mails».
6. Revocar: borrar la contraseña de app en account.apple.com, el ítem del Llavero
   (`security delete-generic-password -s ledgerly-icloud-imap -a <tu-cuenta>@icloud.com`), las
   líneas `ICLOUD_*` y las variables `ICLOUD_*` de Vercel.

### Recibos de sueldo por reenvío

Para que la búsqueda de iCloud también importe los recibos de sueldo, crear en la casilla laboral
(Gmail) un filtro cuyo remitente sea el de liquidaciones de la empresa (`<remitente-de-recibos>`)
con la acción «Reenviar a» `<tu-cuenta>@icloud.com` (Gmail pide confirmar la dirección de destino
una sola vez). Los recibos llegan entonces a iCloud y entran por el mismo camino que los resúmenes.

Si Apple invalida la contraseña (cambio de contraseña de Apple o revocación), la tarjeta muestra el
error: generar una nueva y actualizarla con `security add-generic-password -U -s ledgerly-icloud-imap
-a <tu-cuenta>@icloud.com -w`. No hace falta reiniciar: cada corrida lee la contraseña del Llavero. En
producción: actualizar `ICLOUD_APP_PASSWORD` en Vercel y redeployar.

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
10. Producción: cargar las variables `GMAIL_*` en Vercel, más `MAIL_SYNC_DAYS=25-5`, y redeployar.
    La búsqueda automática corre a las 22 h de Argentina (con hasta una hora de tolerancia), solo del
    25 al 5, y avisa con el punto en Importar, como la de iCloud.
11. Revocar: [myaccount.google.com/connections](https://myaccount.google.com/connections) →
    Ledgerly → Borrar todas las conexiones, y borrar las líneas `GMAIL_*` y sus variables en Vercel.
    Si el secreto se filtró, borrar el cliente en «Clientes» y crear otro.

Si Google revoca el token (cambio de contraseña, revocación manual o 6 meses sin uso), la sección
muestra el error: volver a correr `bun run gmail:auth` y reiniciar; en producción, copiar el
`GMAIL_REFRESH_TOKEN` nuevo a la variable de Vercel y redeployar.

## Privacidad
Los PDFs reales (`examples/`) están gitignoreados; los fixtures de test son sintéticos.
No se commitea data financiera real.
El refresh token de Gmail da lectura de todo el mail: vive solo en `.env` (gitignoreado) y en las variables Sensitive de
Vercel, nunca se loguea ni se manda al cliente. Los PDFs de Gmail se procesan en memoria; no se guarda asunto,
remitente ni cuerpo de ningún mail.
La contraseña de app de iCloud vive en el Llavero de macOS (desarrollo) o en la variable Sensitive `ICLOUD_APP_PASSWORD`
de Vercel (producción): el server la lee en cada corrida, nunca la loguea ni la manda al cliente.
En producción, los cupones en imagen se mandan a Google Cloud Vision para leerlos; el server no loguea la imagen.
Los backups de `backups/` tienen datos reales y están gitignoreados.
