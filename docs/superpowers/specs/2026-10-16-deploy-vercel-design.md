# Deploy en Vercel — diseño

Fecha: 2026-10-16
Estado: en revisión.
Depende de: `docs/superpowers/specs/2026-10-16-login-multiusuario-design.md` (rama `feat/login-multiusuario`).

## Objetivo

Publicar Ledgerly en internet para que lo usen el owner y otra persona, cada uno con sus datos, sin depender de
que la Mac esté prendida. Vercel **reemplaza** a la versión publicada en la Mac (servicio de launchd + Tailscale):
Atlas pasa a ser la única base de producción y Vercel la única app.

## Fuera de alcance

- Dominio propio: la app vive en un subdominio de `vercel.app`.
- Importación por mail para el segundo usuario (sigue siendo solo del owner).
- Plan pago de Vercel: todo entra en Hobby.
- Avisos por fuera de la app (mail, push).
- Arreglos menores diferidos del proyecto de login (callback que no redirige ante fallas internas, guarda con
  `userId: null`, etc.): tienen su propio seguimiento.

## Decisiones tomadas

- **Vercel reemplaza a la Mac.** Se apagan el servicio y el auto-deploy, y se borran sus scripts del repo.
- **Enfoque de deploy:** cliente de Vite como sitio estático + Express como **una sola función** catch-all
  (`api/[...path].ts`), mismo dominio para app y API. Así la cookie de sesión y el chequeo de `Origin` del login no
  cambian.
- **Base:** MongoDB Atlas, cluster **Free**, con backups activados.
- **Plan Hobby**, funciones en la misma zona que Atlas.
- **Mails:** dos cron jobs diarios de Vercel (uno por fuente), protegidos con `CRON_SECRET`. La agenda
  (`MAIL_SYNC_DAYS`) se evalúa en hora de Argentina. La contraseña de iCloud pasa a una variable de entorno.
- **OCR de cupones en imagen:** Google Cloud Vision detrás de la misma interfaz que el OCR de macOS.
- **Avisos:** un punto en el ícono de Importar cuando la búsqueda automática dejó novedades sin ver. Se borran las
  notificaciones de macOS.
- **Dominio:** subdominio de `vercel.app`.
- **Desarrollo local:** sigue con el Mongo de Docker. Atlas es solo producción.

## Límites de la plataforma que condicionan el diseño

| Límite | Valor | Consecuencia |
|---|---|---|
| Duración máxima de una función (Hobby) | 300 s | `maxDuration: 300`; cada fuente de mail en su propio cron |
| Body de request/response | 4,5 MB | subida web limitada a 4 MB (los PDFs reales pesan hasta ~300 KB) |
| Cron en Hobby | una vez por día, ±59 min | la hora de la búsqueda vive en `vercel.json` |
| `express.static` | no sirve archivos en Vercel | el cliente lo sirve el CDN como sitio estático |
| Atlas Free | 0,5 GB, 500 conexiones, 100 ops/s | la base actual pesa ~2 MB; pool de conexiones chico |
| Google Vision | 1000 imágenes/mes gratis, 20 MB por imagen, sin HEIC | HEIC se rechaza con mensaje; cuenta de facturación con alerta |

## Arquitectura en Vercel

### Proyecto

- Proyecto de Vercel conectado al repo de GitHub; rama de producción `main`. Cada merge a `main` deploya; reemplaza
  el auto-deploy de la Mac.
- Región de funciones: la misma zona que el cluster de Atlas (`gru1` si Atlas Free ofrece São Paulo; si no,
  `us-east-1` con `iad1`).
- Variables de entorno **solo en el entorno Production** y marcadas como *Sensitive*. Los preview deployments no
  tienen base ni secretos, así que una rama sin mergear nunca toca datos reales; además quedan detrás de la
  autenticación de Vercel que trae por defecto.

### Build y ruteo

- Install: `bun install --frozen-lockfile`. Build: `bun run build` (Vite) → `client/dist` como output estático.
- `api/[...path].ts`: función de Node que exporta la app de Express armada con
  `createApp(readAuthConfig(process.env))`, después de asegurar la conexión a Mongo.
- `vercel.json`:
  - `outputDirectory: "client/dist"`;
  - `functions["api/[...path].ts"].maxDuration = 300`;
  - rewrite del SPA: todo lo que no empieza con `/api/` va a `/index.html`;
  - `crons` (sección Mails);
  - headers de seguridad (sección Seguridad).

### Conexión a Mongo

Un módulo `server/src/db/serverlessConnection.ts` guarda una promesa de conexión a nivel módulo:

- la primera invocación de una instancia conecta; las siguientes reusan la misma conexión;
- `maxPoolSize: 5`;
- si la conexión falla, la promesa se descarta para que el próximo request reintente, y el request actual responde
  500 `{ error: "Error interno" }`.

### Qué deja de usarse

- En Vercel: `serveClient` (lo reemplaza el CDN) y `server/src/index.ts`, que queda solo para `bun run dev` y
  `bun run start` locales.
- Se borran:
  - la agenda con timers (`server/src/mail/mailJob.ts`, la recuperación de corridas perdidas, `MAIL_SYNC_HOUR`,
    `MAIL_STARTUP_DELAY_MS`, `MAX_TIMER_MS`, `nextScheduledRun`, `nextMailRunDelayMs`);
  - las notificaciones de macOS (`server/src/mail/notifyRun.ts`);
  - los scripts del servicio de la Mac: `scripts/install-service.sh`, `scripts/deploy.sh`,
    `scripts/auto-deploy.sh`, `scripts/service-common.sh`, `scripts/test-service-scripts.sh`, y los scripts
    `service:install`, `deploy` y `test:scripts` de `package.json`;
  - la sección «Versión publicada (privada)» del README, reemplazada por «Producción en Vercel».

### Riesgo a validar primero

Que Vercel buildee la función con `@ledgerly/shared`, que hoy se importa como TypeScript sin compilar desde un
workspace de bun (`"main": "src/index.ts"`). El primer paso del plan es un deploy de prueba con una ruta mínima que
importe algo de `@ledgerly/shared`. Si no anda, `shared` se compila a JavaScript antes del deploy y su `package.json`
apunta al compilado.

## Base en Atlas

- Cluster **Free**; región elegida en la consola (São Paulo si está disponible para Free, si no `us-east-1`).
- Un usuario de base solo para la app, con contraseña aleatoria larga y rol `readWrite` sobre la base `ledgerly`.
- Acceso de red `0.0.0.0/0`: Vercel Hobby no tiene IPs fijas. La protección son las credenciales y TLS (Atlas lo
  exige siempre).
- **Backups activados** en el cluster: un snapshot diario, se guardan los últimos cuatro.
- `MONGO_URL` con el string `mongodb+srv://` de Atlas, solo en Production.

### Scripts nuevos

- `bun run backup`: `mongodump` de Atlas a `backups/ledgerly-<AAAA-MM-DD>.archive` en la Mac, usando la imagen de
  Docker `mongo:7` (no hace falta instalar las herramientas de Mongo). La URL de Atlas se lee de `ATLAS_URL` en el
  `.env` local. `backups/` va al `.gitignore`.
- `bun run backup:restore-local`: restaura el último archivo de `backups/` en el Mongo de Docker local
  (`--drop`), para desarrollar con datos reales.

## Mails en Vercel

### Cron

En `vercel.json`:

| Path | Horario (UTC) | Hora en Argentina |
|---|---|---|
| `/api/cron/mail/icloud` | `0 0 * * *` | entre las 21 y las 22 |
| `/api/cron/mail/gmail` | `0 1 * * *` | entre las 22 y las 23 |

Cada fuente corre en su propia invocación, con sus 300 s; una que falle no frena a la otra.

### Endpoint `GET /api/cron/mail/:source`

- Se monta antes de `requireUser` (no hay sesión en un cron).
- Vercel manda `Authorization: Bearer <CRON_SECRET>` cuando la variable `CRON_SECRET` existe. El endpoint lo
  compara en tiempo constante; sin el header o con otro valor, 401 `{ error: "No autorizado" }`.
- `source` fuera de `gmail`/`icloud`: 400.
- Calcula el **número de día** de hoy en `America/Argentina/Buenos_Aires` con `Intl.DateTimeFormat` (Vercel corre
  en UTC y no deja configurar `TZ`) y lo chequea contra el rango de `MAIL_SYNC_DAYS`. La comparación recibe el número
  de día, no un `Date`, para que dé lo mismo en UTC (Vercel) y en hora local (desarrollo). Fuera de agenda: 200
  `{ skipped: "fuera de agenda" }`.
- Busca el owner con `findOwnerId(OWNER_EMAIL)`. Sin owner: 200 `{ skipped: MISSING_OWNER }` y `console.error`.
- Fuente sin configurar: 200 `{ skipped: "<fuente> no está configurado: falta …" }`.
- Si toca: `runMailSync(ownerId, source, openClient, "job")` y 200 con el resumen de la corrida.
- Un error inesperado: 500 (queda en los logs de cron de Vercel).
- Si la función se corta por tiempo, lo procesado ya quedó guardado adjunto por adjunto y la próxima corrida sigue
  desde ahí, como hoy con `hasMore`.

### Fuentes

- **iCloud:** la contraseña de app sale de `ICLOUD_APP_PASSWORD`. Si no está y el server corre en macOS, se usa el
  Llavero (solo para desarrollo). Los textos de «qué falta» nombran la variable.
- **Gmail:** sin cambios (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_QUERY`).
- El botón «Buscar» de Importar sigue igual: corre dentro del request, con hasta 300 s.

## OCR de cupones en imagen con Google Vision

### Elección de proveedor

`recognizeImage(data, fileName)` mantiene su firma y su salida (`OcrObservation[]`) y elige:

1. Con `GOOGLE_VISION_API_KEY`: Google Cloud Vision.
2. Sin esa variable y en macOS: el Vision local de hoy (desarrollo).
3. Si no: `OcrUnavailableError`, como hoy en Linux.

### Adaptador de Google

- `POST https://vision.googleapis.com/v1/images:annotate?key=…` con la imagen en base64 y
  `features: [{ type: "DOCUMENT_TEXT_DETECTION" }]`, timeout de 30 s.
- De `fullTextAnnotation.pages[0]` toma ancho y alto, y de cada palabra (`blocks → paragraphs → words`, texto =
  símbolos unidos) arma una `OcrObservation` con las mismas convenciones que el OCR de macOS: `x` = borde izquierdo
  normalizado, `y` = centro vertical normalizado desde arriba, `height` = alto normalizado. `toLines` y el parser
  del cupón no cambian.
- Una respuesta con error de Google o sin `fullTextAnnotation`: `OcrFailedError` (el mensaje de siempre); se
  loguea el status y el mensaje de Google, nunca la imagen.
- HEIC (por tipo o extensión) con Google como proveedor: error de ingesta con «Mandá la imagen como JPG o PNG».

### Configuración en Google Cloud

- Activar Cloud Vision API en el proyecto de Google Cloud existente.
- Cuenta de facturación (Google la pide aunque el uso quede en el cupo gratis) con una alerta de presupuesto de
  USD 1.
- Una API key **restringida a Cloud Vision API**, guardada en `GOOGLE_VISION_API_KEY` (Production). Nunca llega
  al cliente.

### Validación temprana

Antes de cablear el adaptador en la importación, pasar por Google las imágenes de cupones reales disponibles y
comparar las líneas de `toLines` con `server/src/parsers/__fixtures__/icbc-mortgage-image.sample.txt` y con lo que
espera `icbcMortgageImageParser`. Si el espaciado o el orden difieren, se ajusta la unión de palabras antes de
seguir.

## Aviso de mails en la app

- `User` gana `mailNoticeSeenAt: Date | null` (por defecto `null`).
- `GET /api/mail/notice` (solo owner): `{ pending: boolean }`. `pending` es `true` si existe una corrida automática
  (`trigger: "job"`) del owner, posterior a `mailNoticeSeenAt` (o cualquiera si es `null`), que terminó con
  `status: "error"` o tiene algún adjunto `imported` o `failed`.
- `POST /api/mail/notice/seen` (solo owner): pone `mailNoticeSeenAt` en ahora, 204.
- Cliente:
  - `useMailNotice()` solo se consulta si `me.isOwner`;
  - el ícono de Importar del `TopActionsPill` lleva un `Badge` de MUI en variante punto cuando `pending`, con
    `aria-label` «importar, hay novedades de mails»;
  - al montar `ImportPage` el owner llama a `seen` e invalida `useMailNotice`.
- Shared: `mailNoticeDtoSchema` / `MailNoticeDTO`.

## Límite de subida

- `MAX_UPLOAD_BYTES` de las rutas de subida (`/api/import`, `/api/statements`) pasa a **4 MB**; multer responde
  413 `{ error: "El archivo supera el máximo de 4 MB" }`.
- El cliente chequea el tamaño antes de mandar y muestra el mismo mensaje sin hacer el request.
- `MAX_PDF_BYTES` (adjuntos de mails, 15 MB) no cambia: no pasan por el body del request.

## Seguridad

- HTTPS de Vercel; cookie de sesión `Secure` porque `PUBLIC_URL` es https; HSTS lo pone Vercel en `*.vercel.app`.
- Headers en `vercel.json` para todas las rutas: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: same-origin`, `Content-Security-Policy: frame-ancestors 'none'`.
- Secretos solo en Production y *Sensitive*: `SESSION_SECRET`, `CRON_SECRET` (aleatorio, 32+ caracteres),
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_VISION_API_KEY`, `GMAIL_*`, `ICLOUD_APP_PASSWORD`, `MONGO_URL`.
- Sin rate limiting propio: todo lo que toca datos está detrás del login; el firewall de Vercel cubre lo básico.
- La app deja de estar en Tailscale (`tailscale serve reset`).

## Errores

| Caso | Respuesta |
|---|---|
| Mongo no conecta al arrancar la instancia | 500 `{ error: "Error interno" }`; el próximo request reintenta |
| Cron sin secreto o con otro | 401 `{ error: "No autorizado" }` |
| Cron fuera de agenda / sin owner / fuente sin configurar | 200 con `skipped` y el motivo |
| Cron con error inesperado | 500, visible en los logs de cron |
| Subida de más de 4 MB | 413 `{ error: "El archivo supera el máximo de 4 MB" }` |
| Google Vision falla | el error de OCR de siempre; status y mensaje en el log |
| Imagen HEIC | «Mandá la imagen como JPG o PNG» |
| `/api/mail/notice*` sin ser owner | 403 (como el resto de `/api/mail`) |

## Variables de entorno de producción

| Variable | Valor |
|---|---|
| `MONGO_URL` | `mongodb+srv://…` de Atlas |
| `PUBLIC_URL` | `https://<app>.vercel.app` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | cliente OAuth del login (con la redirect URI de Vercel) |
| `SESSION_SECRET`, `OWNER_EMAIL`, `ALLOWED_EMAILS` | como en el spec del login |
| `CRON_SECRET` | aleatorio, 32+ caracteres |
| `MAIL_SYNC_DAYS` | `25-5` |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_QUERY` | como hoy (opcionales) |
| `ICLOUD_USER`, `ICLOUD_APP_PASSWORD`, `ICLOUD_SINCE`, `ICLOUD_MAILBOXES` | como hoy, con la contraseña en variable (opcionales) |
| `GOOGLE_VISION_API_KEY` | API key restringida a Cloud Vision |

`.env.example` documenta las nuevas (`CRON_SECRET`, `ICLOUD_APP_PASSWORD`, `GOOGLE_VISION_API_KEY`, `ATLAS_URL`) y
saca `MAIL_SYNC_HOUR`.

## El corte

Va al README, sección «Producción en Vercel». Entre los pasos 1 y 6 nadie escribe en ninguna base.

1. Apagar el servicio de la Mac y el auto-deploy:
   `launchctl bootout gui/$(id -u)/com.ledgerly.auto-deploy` y `launchctl bootout gui/$(id -u)/com.ledgerly.server`.
2. Backup del Mongo local fuera del volumen (`mongodump` + `docker cp`).
3. En el Mongo local, con la rama ya mergeada o desde ella: `bun run migrate:owner` con el `OWNER_EMAIL` de
   producción.
4. Crear el cluster de Atlas (región, usuario, acceso de red, backups) y restaurar:
   `mongodump` del Docker local → `mongorestore` a Atlas, base `ledgerly`.
5. Crear el proyecto de Vercel, conectar el repo, elegir la región y cargar las variables en Production. Sumar la
   redirect URI `https://<app>.vercel.app/api/auth/google/callback` al cliente OAuth del login. Activar Cloud
   Vision y crear su API key.
6. Merge a `main` → deploy de producción.
7. Checklist de verificación (sección Testing).
8. Sumar a la otra persona: `ALLOWED_EMAILS` en Vercel (redeploy) y usuario de prueba en Google.
9. Limpiar la Mac: borrar los `.plist` de `~/Library/LaunchAgents`, `tailscale serve reset`. El volumen de Docker
   queda como copia vieja.

## Testing

TDD, como el resto del repo.

- **Cron:** sin header, con secreto equivocado y con el correcto; `source` inválida; agenda en hora de Argentina
  (`2026-10-25T00:30:00Z` es el 24 en Buenos Aires → fuera de `25-5`; `2026-10-26T00:30:00Z` es el 25 → adentro);
  sin owner; fuente sin configurar; corrida feliz con un cliente de mail falso.
- **Conexión serverless:** dos llamadas usan una sola conexión; tras un fallo, la siguiente reintenta.
- **OCR:** el adaptador de Google con una respuesta JSON sintética (coordenadas normalizadas, orden de palabras,
  líneas que arma `toLines`); elección de proveedor (key, macOS, ninguno); HEIC rechazado; error de Google →
  `OcrFailedError`.
- **iCloud:** `ICLOUD_APP_PASSWORD` tiene prioridad sobre el Llavero; sin ninguno, «qué falta» la nombra.
- **Aviso de mails:** qué corridas lo prenden (job con importados, con fallidos, con error) y cuáles no (manual,
  job sin novedades, anteriores a `seen`); `seen` lo apaga; quien no es owner recibe 403; el punto en el cliente
  aparece, tiene su `aria-label` y se apaga al entrar a Importar.
- **Subida:** 413 arriba de 4 MB en las dos rutas; el cliente avisa sin hacer el request.
- **`vercel.json`:** los paths de `crons` existen como rutas del server; el rewrite del SPA no tapa `/api/`; la
  función tiene `maxDuration: 300`.
- **Se borran** los tests de `mailJob`, `notifyRun`, la agenda con timers y `test-service-scripts.sh`.

### Checklist después del deploy (manual)

1. Login del owner en la web y en la PWA instalada en el iPhone; ver los datos migrados.
2. Importar un PDF de resumen y un cupón en imagen.
3. «Buscar» en iCloud y en Gmail a mano.
4. Disparar cada cron con `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/cron/mail/icloud`
   y ver el resumen; ver el punto en Importar y que se apaga al entrar.
5. Login del otro usuario: arranca vacío y no ve «Mails».

## Fuentes

- Límites de funciones: https://vercel.com/docs/functions/limitations
- Cron jobs en Hobby: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Express en Vercel: https://vercel.com/docs/frameworks/backend/express
- Límites de Atlas Free: https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/
- Formatos de Google Vision: https://docs.cloud.google.com/vision/docs/supported-files
- Precios de Google Vision: https://cloud.google.com/vision/pricing
