# Importar resúmenes desde Gmail — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo). Rama `feat/importacion-gmail`, creada desde
`feat/base-nuevas-features`.

## Objetivo

Que los PDFs que ya me llegan por mail (resúmenes Visa Signature e ICBC, cupones de la hipoteca UVA y
del plan del auto, recibos de sueldo) entren a Ledgerly **sin descargarlos y subirlos a mano**.

El server lee mi casilla de Gmail con permiso de **solo lectura**, busca mails con PDFs adjuntos, los
baja en memoria y los pasa por **el mismo pipeline** que usa `POST /api/import`
(`extractPdfText` → `detectDocumentKind` → `importStatement` / `importCoupon` / `importAutoCoupon` /
`importPayslip`). La página **Importar** suma una sección **«Gmail»** con el estado, el botón
**«Buscar en Gmail»** y el resultado de la última búsqueda. Opcionalmente, el server repite la
búsqueda solo cada N minutos.

Las credenciales **todavía no existen**: las cargo después en `.env`. Sin ellas la feature queda
**deshabilitada de forma explícita**: la UI lo dice, el server arranca y responde normal, y nada
intenta conectarse a Google.

## Lo que ya trae la base

`feat/base-nuevas-features` (ver `2026-10-03-base-nuevas-features-design.md`) dejó en su forma final
los archivos compartidos. Esta feature **no los toca**:

- Modelos `GmailSyncRunModel` / `GmailSyncRunDoc` y `GmailAttachmentModel` / `GmailAttachmentDoc` en
  `server/src/db/models.ts` (schemas de la sección «Datos», con tests en `models.test.ts`).
- El router `gmailRouter` (stub en `server/src/http/routes/gmail.ts`) montado en `app.ts` como
  `app.use("/api/gmail", gmailRouter)`, después de `/api/imports`. Esta feature reemplaza el stub.
- Los DTOs `gmailSyncOutcomeSchema`, `gmailSyncTriggerSchema`, `gmailSyncItemDtoSchema`,
  `gmailSyncRunDtoSchema`, `gmailStatusDtoSchema` y sus tipos en `shared/src/dtos.ts`, con tests.
- Los hooks `useGmailStatus()` y `useGmailSync()` en `client/src/api/hooks.ts`.
- `ImportPage.tsx` ya renderiza `<GmailImportSection />` después del resultado de la subida y antes
  de `StatementReviewSection` y de «Archivos importados». `ImportPage.test.tsx` ya responde
  `/gmail/status` con el status deshabilitado y ya verifica el orden de los encabezados.
- El script `gmail:auth` en el `package.json` raíz, el bloque `GMAIL_*` de `.env.example`, la línea
  de «Scripts», la sección «Importar desde Gmail (opcional)» y la línea de «Privacidad» del README.

Lo que es de esta feature: `server/src/ingestion/errors.ts`, `server/src/import/importStatement.ts`
(+test), `server/src/import/importPdf.ts` (+test, nuevo), `server/src/http/routes/import.ts` (+test),
`server/src/index.ts`, todo `server/src/gmail/*`, `server/src/http/routes/gmail.ts` (+test),
`server/src/testing/gmailFixtures.ts`, `client/src/gmailImport.ts` (+test),
`client/src/components/GmailImportSection.tsx` (+test) y `client/src/components/GmailSyncResult.tsx`.

## Decisiones tomadas

- **Gmail API por REST con `fetch`, sin dependencias.** Se usan cuatro endpoints (token, listar,
  leer mensaje, bajar adjunto). `googleapis` pesa decenas de MB para eso, y el repo ya consume APIs
  con `fetch` (`dollarRate.ts`, `macroSources.ts`) y las testea con `fetch` stubbeado.
- **OAuth2 con cliente «App de escritorio», scope `gmail.readonly` y refresh token en `.env`.** El
  token se obtiene una sola vez con un script del repo, `bun run gmail:auth` (loopback a
  `127.0.0.1` + PKCE), que **escribe** `GMAIL_REFRESH_TOKEN` en `.env` y **no lo imprime**.
- **Detección por contenido, no por remitente.** La consulta por defecto es
  `has:attachment filename:pdf newer_than:90d`: trae cualquier PDF de los últimos 90 días y decide
  `detectDocumentKind`, que es lo que de verdad sabe qué es un resumen. Un PDF ajeno (una factura, un
  pasaje) queda **«omitido» una sola vez** y no se vuelve a bajar. No hay que adivinar remitentes ni
  asuntos, que cambian sin aviso y harían perder documentos en silencio.
- **`GMAIL_QUERY` para acotar por remitente o asunto.** Vive en `.env`, no en el código: así las
  direcciones del banco y del empleador no quedan commiteadas. El README muestra cómo armarla.
- **Registro de adjuntos procesados** (`GmailAttachment`), con clave `(messageId, partId)`. El
  `attachmentId` de Gmail **no es estable** (cambia en cada lectura del mensaje), el `partId` sí.
  Lo ya procesado no se vuelve a bajar. Solo se reintenta lo que terminó en error inesperado.
- **Lo que borro no vuelve solo.** Si borro desde «Archivos importados» algo que vino de Gmail, el
  registro sigue diciendo «importado» y la búsqueda no lo reimporta. Para reimportarlo, lo subo a mano.
- **Dedup de resúmenes por clave natural, además de `sourceHash`.** El PDF que manda el banco por
  mail no tiene por qué tener los mismos bytes que el que bajé del home banking. Hoy eso crearía un
  segundo `Statement` con 0 movimientos (los movimientos ya se deduplican por `fingerprint`) que, por
  ser el más nuevo con el mismo `closingDate`, `latestStatementIdsPerIssuer` elegiría como «último
  resumen», y el gráfico del último resumen quedaría vacío. `importStatement` pasa a considerar
  duplicado un resumen con el mismo `(issuer, cardLabel, closingDate)`. Cupones y recibos ya
  deduplican por clave natural.
- **Un único punto de entrada para importar un PDF:** `importPdf` (nuevo), que extrae lo que hoy está
  dentro del handler de `POST /api/import`. Lo usan la ruta y la sincronización de Gmail.
- **La búsqueda manual es sincrónica**, con un tope de **50 mails nuevos por corrida**. Si quedan
  más, el resultado lo dice (`hasMore`) y se vuelve a tocar el botón. Sin polling ni jobs en cola.
- **Las corridas concurrentes se unen.** Si toco el botón mientras corre la búsqueda automática,
  recibo el resultado de esa misma corrida (una sola promesa en vuelo por proceso). Ese resultado
  dice `trigger: "job"`, porque es la corrida automática.
- **Los errores de Gmail no son 500.** Un token vencido, una API deshabilitada o un corte de red
  dejan la corrida con `status: "error"` y un mensaje claro, que la UI muestra. El job nunca tira el
  proceso.
- **Job periódico opcional** con `GMAIL_SYNC_INTERVAL_MINUTES` (entero ≥ 15). Sin la variable, solo
  hay búsqueda manual. La primera corrida tiene en cuenta la última que quedó registrada: el deploy
  automático reinicia el servicio con cada cambio en `main`, y un `setInterval` puro no llegaría
  nunca a dispararse.
- **Recomendado:** prender el job **solo en la versión publicada** (`~/Services/ledgerly/.env`). La
  base es compartida con `bun run dev`. Dos jobs no rompen nada (todo es idempotente), pero duplican
  el trabajo.

### Decisiones de implementación (autónomas, al bajar el diseño a código)

- **Un adjunto que falla al bajarse queda registrado como `failed` antes de cortar la corrida.** Si
  un mail trae dos PDFs y el segundo falla por un error de Gmail, sin ese registro el mail quedaría
  con una sola entrada `imported`, dejaría de estar pendiente y el segundo PDF no se bajaría nunca.
  Con la entrada `failed`, el mail vuelve a estar pendiente y la próxima corrida lo reintenta.
- **Cualquier error fuera de la importación de un adjunto corta la corrida con `status: "error"`**,
  no solo `GmailAuthError` / `GmailApiError`: un error inesperado (por ejemplo, Mongo al leer el
  registro) también queda como corrida con error, con su mensaje, y `syncGmail` no lanza. Si Mongo
  está caído, guardar la corrida también falla: en la ruta eso es un 500 y en el job se loguea.
- **El registro guarda `partId` en cada entrada** (`GmailLedgerEntry` lleva `messageId`, `partId` y
  `outcome`): `selectPendingMessages` solo mira `messageId` y `outcome`, y `syncGmail` usa el
  `partId` para saltear las partes ya resueltas de un mail que se relee.
- **Un mail cuyo cuerpo entero es el PDF** (sin `parts`) también cuenta: `collectPdfParts` revisa la
  raíz del `payload`. Como Gmail le da `partId: ""` a la raíz, un `partId` vacío se normaliza a `"0"`
  (el `"-"` queda reservado para «sin PDF adjunto»).
- **`importPdf` usa el `transactionCount` que ya devuelve `importStatement`** para el `file` de un
  resumen, en lugar de otro `countDocuments`: `importStatement` ya lo calcula con `countDocuments` en
  el camino de duplicado y es la cantidad insertada en el de importado, así que da lo mismo.
- **Un cliente de Gmail por corrida.** `runGmailSync` crea el cliente en cada corrida: pide un access
  token por corrida y nunca guarda tokens entre corridas.
- **Los ítems de una corrida se devuelven en el orden en que se procesaron** (`processedAt`), que es
  el de Gmail: lo más nuevo primero.
- **Interfaz:** «Omitido» va en `warning` (el motivo puede ser un resumen con contraseña, que conviene
  ver); el aviso de deshabilitada concuerda en número («Falta GMAIL_REFRESH_TOKEN … para obtenerla»
  / «Faltan … para obtenerlas»); la línea «Última búsqueda» usa la corrida que se muestra (la recién
  hecha o la última del status), para que no quede vieja mientras se refresca el status.
- **Limitación aceptada:** si el proceso muere a mitad de un mail con varios PDFs, las partes que no
  llegaron a registrarse no se reintentan (el mail ya tiene entradas no fallidas). Para un solo
  usuario con mails de un PDF, no justifica un registro por mail.

### Enfoques descartados

- **IMAP con contraseña de aplicación:** exige 2FA y una contraseña que da acceso total a la cuenta
  (leer, borrar y mandar mails), y suma dos dependencias (`imapflow` y `mailparser`).
- **Service account:** no funciona con Gmail personal, solo con Workspace y delegación de dominio.
- **Botón «Conectar Gmail» con OAuth desde la UI:** necesita un redirect URI estable registrado en
  Google y guardar tokens en Mongo. Para un solo usuario detrás de Tailscale no se justifica. El
  script de una vez resuelve lo mismo.
- **Filtrar por remitentes fijos en el código:** no conozco las direcciones reales, y commitearlas
  expone datos personales (empleador, bancos).
- **Push con Pub/Sub (`users.watch`):** requiere un endpoint público, y la app no se expone a internet.

## Datos

### Variables de entorno (nuevas, todas opcionales)

| Variable | Uso |
|---|---|
| `GMAIL_CLIENT_ID` | ID del cliente OAuth «App de escritorio» |
| `GMAIL_CLIENT_SECRET` | Secreto de ese cliente |
| `GMAIL_REFRESH_TOKEN` | Lo escribe `bun run gmail:auth` |
| `GMAIL_QUERY` | Consulta de Gmail. Default `has:attachment filename:pdf newer_than:90d` |
| `GMAIL_SYNC_INTERVAL_MINUTES` | Intervalo del job, entero ≥ 15. Ausente o inválido → job apagado |

Las tres primeras son las **credenciales**: si falta cualquiera (o está vacía después de `trim`), la
feature está deshabilitada. Ningún valor se loguea ni viaja al cliente. El status solo informa los
**nombres** de las variables que faltan.

### Colecciones (ya en la base) — `server/src/db/models.ts`

```ts
const gmailSyncRunSchema = new Schema({
  trigger: { type: String, required: true, enum: ["manual", "job"] },
  startedAt: { type: Date, required: true, index: true },
  finishedAt: { type: Date, required: true },
  status: { type: String, required: true, enum: ["ok", "error"] },
  error: { type: String, default: null },
  messagesChecked: { type: Number, required: true },
  hasMore: { type: Boolean, required: true },
});

const gmailAttachmentSchema = new Schema({
  messageId: { type: String, required: true },
  partId: { type: String, required: true },
  runId: { type: Schema.Types.ObjectId, ref: "GmailSyncRun", required: true, index: true },
  fileName: { type: String, required: true },
  receivedAt: { type: Date, required: true },
  outcome: { type: String, required: true, enum: ["imported", "duplicate", "skipped", "failed"] },
  kind: { type: String, enum: ["statement", "coupon", "auto", "payslip", null], default: null },
  documentId: { type: String, default: null },
  detail: { type: String, required: true },
  processedAt: { type: Date, required: true },
});
gmailAttachmentSchema.index({ messageId: 1, partId: 1 }, { unique: true });
```

- `GmailSyncRun`: un documento por corrida. El status muestra la última (`sort({ startedAt: -1 })`).
  El `_id` se genera al empezar (`new Types.ObjectId()`) y el documento se inserta al terminar. Si el
  proceso muere a mitad de camino, los adjuntos quedan registrados con un `runId` huérfano, y eso no
  rompe nada.
- `GmailAttachment`: el registro de adjuntos que da la idempotencia. `kind` y `documentId` se
  completan en `imported` / `duplicate` (el `_id` del `Statement`, `MortgageCoupon`, `AutoCoupon` o
  `Payslip`). `detail` es la descripción del archivo importado o el motivo de la omisión.
- **No se guarda nada del mail**: ni asunto, ni remitente, ni cuerpo. Los PDFs se procesan en memoria
  y nunca se escriben a disco. De los PDFs ajenos solo queda el nombre del archivo.
- Un mail que matchea la consulta pero no trae ninguna parte PDF (p. ej. un `.pdf.zip`) se registra
  con `partId: "-"`, `fileName: "(sin PDF adjunto)"`, `outcome: "skipped"` y
  `detail: "El mail no trae un PDF adjunto"`, para no volver a leerlo en cada corrida.

### Colecciones existentes que cambian

- **`Statement`** — sin cambios de schema. Cambia `importStatement`
  (`server/src/import/importStatement.ts`): después del camino rápido por `sourceHash`, parsea y
  busca `StatementModel.findOne({ issuer, cardLabel, closingDate: new Date(closingDate) })`. Si
  existe y no hay `replace`, devuelve `{ status: "duplicate", statementId, transactionCount }` (los
  movimientos de ese statement, con `countDocuments`). Con `replace`, borra ese statement y sus
  transacciones antes de insertar. Si `closingDate` es `null`, no hay chequeo por clave natural y
  queda solo el de hash.
- `MortgageCoupon`, `AutoCoupon` y `Payslip`: sin cambios. Ya deduplican por
  `(prestamoNro, cuotaNro)`, `(grupo, orden, cuotaNro)` y `(cuil, periodo, tipo)`.

## Cálculo

No hay agregaciones por mes. La lógica son funciones puras de selección y clasificación, todas
testeables sin red ni DB.

### `server/src/gmail/gmailConfig.ts`

```ts
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_CREDENTIAL_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] as const;
export const DEFAULT_GMAIL_QUERY = "has:attachment filename:pdf newer_than:90d";
export const MIN_GMAIL_INTERVAL_MINUTES = 15;

export interface GmailCredentials { clientId: string; clientSecret: string; refreshToken: string }
export interface GmailConfig { credentials: GmailCredentials; query: string; intervalMinutes: number | null }

export function missingGmailVars(env: NodeJS.ProcessEnv): string[]
export function parseGmailInterval(raw: string | undefined): number | null
export function readGmailConfig(env: NodeJS.ProcessEnv): GmailConfig | null
export function describeGmailSetup(env: NodeJS.ProcessEnv): string
```

- `parseGmailInterval`: `undefined` o vacío → `null`. Un valor que no es entero o es `< 15` también
  da `null`.
- `readGmailConfig`: `null` si `missingGmailVars` no está vacío. `query` = `GMAIL_QUERY` con `trim`,
  o `DEFAULT_GMAIL_QUERY` si está vacía.
- `describeGmailSetup` arma la línea que loguea el arranque, sin valores:
  - `Gmail: deshabilitado (faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)`
  - `Gmail: búsqueda manual; automática apagada`
  - `Gmail: búsqueda manual; GMAIL_SYNC_INTERVAL_MINUTES inválido (entero ≥ 15), automática apagada`
  - `Gmail: búsqueda automática cada 360 min`

### `server/src/gmail/gmailClient.ts`

```ts
export interface GmailMessagePart {
  partId?: string; filename?: string; mimeType?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
}
export interface GmailPdfPart { partId: string; fileName: string; size: number; attachmentId: string | null; inlineData: string | null }
export interface GmailMessage { id: string; receivedAt: string; pdfParts: GmailPdfPart[] }
export interface GmailClient {
  listMessageIds(query: string, limit: number): Promise<string[]>;
  getMessage(id: string): Promise<GmailMessage>;
  downloadPart(messageId: string, part: GmailPdfPart): Promise<Uint8Array>;
}
export class GmailAuthError extends Error {}
export class GmailApiError extends Error {}

export function collectPdfParts(payload: GmailMessagePart): GmailPdfPart[]
export function createGmailClient(credentials: GmailCredentials): GmailClient
```

- `collectPdfParts` (pura) recorre el `payload` y sus `parts` de forma recursiva (`multipart/mixed`
  dentro de `multipart/alternative`, etc.). Una parte es PDF si `filename` termina en `.pdf` (sin
  importar mayúsculas) **o** `mimeType === "application/pdf"`: los bancos suelen mandar
  `application/octet-stream`. Exige `body.attachmentId` o `body.data`. Si falta `filename`, usa
  `adjunto-<partId>.pdf`. Un `partId` vacío o ausente pasa a `"0"`. Ignora las partes de texto y las
  imágenes inline.
- Token: `POST https://oauth2.googleapis.com/token` (`grant_type=refresh_token`). El access token se
  guarda en el closure del cliente y se renueva 60 s antes de `expires_in`. Si Gmail responde 401,
  se renueva una vez y se reintenta.
- Endpoints, con base `https://gmail.googleapis.com/gmail/v1/users/me`:
  - `GET /messages?q=<q>&maxResults=100&pageToken=…`: pagina hasta `limit` o hasta que no haya
    `nextPageToken`. `q` va con `encodeURIComponent`.
  - `GET /messages/{id}?format=full`: `receivedAt` = `new Date(Number(internalDate)).toISOString()`.
  - `GET /messages/{id}/attachments/{attachmentId}`: `Buffer.from(data, "base64url")`. Si la parte
    trae `inlineData`, se decodifica sin pedir nada.
- Errores. Los mensajes **nunca** incluyen el token, el secreto ni el cuerpo de la respuesta: solo el
  status HTTP.
  - `invalid_grant` → `GmailAuthError("Gmail rechazó el refresh token (venció o fue revocado). Volvé a correr bun run gmail:auth y reiniciá el server.")`
  - `invalid_client` / `unauthorized_client` / 401 del token → `GmailAuthError("Gmail rechazó GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET. Revisalos en el .env.")`
  - 403 → `GmailApiError("Gmail respondió 403: revisá que la Gmail API esté habilitada en tu proyecto de Google Cloud.")`
  - otro no-2xx → `GmailApiError("Gmail respondió <status>.")`
  - falla de red → `GmailApiError("No se pudo conectar con Gmail: <err.message>")`

### `server/src/import/importPdf.ts` (nuevo)

```ts
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export interface ImportPdfInput { data: Uint8Array; fileName: string; replace?: boolean }
export interface ImportPdfOutcome { result: ImportResultUnionDTO; file: ImportedFileDTO }
export async function importPdf(input: ImportPdfInput): Promise<ImportPdfOutcome>
```

Es el cuerpo actual del handler de `POST /api/import`, movido sin cambios de comportamiento:
`extractPdfText`, texto `< 20` → `NoTextError`, `detectDocumentKind`, el `importX` que corresponda,
`findById`, y el mapeo con `toXxxDTO` / `xxxToImportedFileDTO` de `server/src/http/mappers.ts`.
`unknown` → `UnsupportedFormatError`.

Dos agregados:

- Si `extractPdfText` lanza un error con `name === "PasswordException"` (pdf.js, PDF con contraseña
  de usuario), se traduce a `EncryptedPdfError`. Hoy eso es un 500 en la subida manual, y pasa a ser
  un 422 con mensaje claro.
- `server/src/ingestion/errors.ts` suma la clase base `IngestionError`. `NoTextError`,
  `UnsupportedFormatError`, `NoTransactionsError`, `InvalidCouponError`, `InvalidAutoCouponError`,
  `InvalidPayslipError` y la nueva `EncryptedPdfError("El PDF está protegido con contraseña")` la
  extienden.

`server/src/http/routes/import.ts` queda así: multer como hoy,
`export const MAX_UPLOAD_BYTES = MAX_PDF_BYTES`, `importPdf(...)` → `res.status(result.status ===
"duplicate" ? 200 : 201).json(result)`, y `err instanceof IngestionError` → `HttpError(422,
err.message)`.

### `server/src/gmail/syncGmail.ts`

```ts
export const GMAIL_LIST_LIMIT = 500;
export const GMAIL_MAX_MESSAGES_PER_RUN = 50;
export const NO_PDF_PART_ID = "-";

export interface GmailLedgerEntry { messageId: string; partId: string; outcome: GmailSyncOutcome }
export function selectPendingMessages(ids: string[], ledger: GmailLedgerEntry[], max: number): { batch: string[]; hasMore: boolean }
export function classifyImportError(err: unknown): { outcome: "skipped" | "failed"; detail: string }

export interface SyncGmailDeps {
  client: GmailClient;
  query: string;
  trigger: GmailSyncTrigger;
  importPdf?: (input: ImportPdfInput) => Promise<ImportPdfOutcome>;
  maxMessages?: number;
  now?: () => Date;
}
export async function syncGmail(deps: SyncGmailDeps): Promise<GmailSyncRunDTO>
export function runGmailSync(config: GmailConfig, trigger: GmailSyncTrigger): Promise<GmailSyncRunDTO>
export async function findLastGmailRun(): Promise<GmailSyncRunDTO | null>
```

- `selectPendingMessages` (pura): un mail está **pendiente** si no tiene entradas en el registro o si
  alguna terminó en `failed`. Respeta el orden de Gmail (del más nuevo al más viejo), así lo último
  que llegó entra primero. `batch` = los primeros `max` pendientes. `hasMore` = había más.
- `classifyImportError` (pura): `IngestionError` → `skipped` con `err.message` (por ejemplo
  «Formato de resumen no reconocido» o «El PDF está protegido con contraseña»). Cualquier otro error
  → `failed` con `err.message`, o «Error inesperado» si no hay mensaje.
- `syncGmail`:
  1. `listMessageIds(query, GMAIL_LIST_LIMIT)`.
  2. Lee el registro de esos ids y calcula `selectPendingMessages`.
  3. Por cada mail del lote, `getMessage`. Sin partes PDF → entrada `"-"` `skipped`. Por cada
     `pdfPart`:
     - si ya tiene entrada no fallida, se saltea en silencio;
     - si `size > MAX_PDF_BYTES` → `skipped`, «Supera el máximo de 15 MB», sin bajarlo;
     - si no, `downloadPart`. Si la descarga falla, la parte queda `failed` con el mensaje y el error
       sigue hacia el paso 4;
     - `importPdf({ data, fileName })` (nunca con `replace`) → `imported` / `duplicate` con
       `kind = result.kind`, `documentId = file.id` y `detail = file.description`;
     - si `importPdf` lanza, `classifyImportError`.

     Cada adjunto se guarda con `updateOne({ messageId, partId }, { $set }, { upsert: true })`.
  4. Cualquier error fuera de `importPdf` (`GmailAuthError` o `GmailApiError` en `list`, `get` o
     `download`, o uno inesperado) **corta la corrida**: `status: "error"`, `error: err.message`. Lo
     procesado hasta ahí queda registrado. No se lanza nada hacia afuera.
  5. Inserta el `GmailSyncRun`, con `messagesChecked` = mails del lote efectivamente leídos, y
     devuelve el DTO con los ítems de la corrida (`GmailAttachmentModel.find({ runId })`, en orden de
     `processedAt`).
- `runGmailSync` crea el cliente con `createGmailClient(config.credentials)` y llama a `syncGmail`.
  Guarda la promesa en una variable de módulo `inFlight`: mientras está en vuelo, cualquier llamada
  devuelve **la misma** promesa. Al resolverse (o rechazarse) la limpia.
- `findLastGmailRun`: la corrida con `startedAt` más nuevo, con sus ítems; `null` si no hay.

Los mappers `toGmailSyncItemDTO` y `toGmailSyncRunDTO` viven en `server/src/gmail/gmailMappers.ts`,
no en `http/mappers.ts`.

### `server/src/gmail/gmailJob.ts`

```ts
export const GMAIL_STARTUP_DELAY_MS = 60_000;
export function nextGmailRunDelayMs(lastStartedAt: Date | null, intervalMinutes: number, now: Date): number
export function formatGmailRunLog(run: GmailSyncRunDTO): string
export async function startGmailJob(config: GmailConfig): Promise<() => void>
```

- `nextGmailRunDelayMs` (pura). Sin corridas → `GMAIL_STARTUP_DELAY_MS`. Con corridas →
  `max(GMAIL_STARTUP_DELAY_MS, lastStartedAt + intervalMinutes·60 000 − now)`. Nunca negativo. Los
  reinicios frecuentes (deploy automático) no disparan búsquedas de más ni de menos.
- `startGmailJob` lee la última corrida y encadena `setTimeout` (no `setInterval`, así nunca se
  superponen): corre `runGmailSync(config, "job")`, loguea y programa la próxima a
  `intervalMinutes`. Si la corrida rechaza, loguea el error y programa la próxima igual. Los timers
  llevan `.unref()`. Devuelve una función que cancela el timer pendiente. Con
  `intervalMinutes: null` no programa nada.
- `formatGmailRunLog` (pura):
  - `Gmail (automática): 2 mails nuevos · importados 1 · ya estaban 0 · omitidos 1 · con error 0`
  - `Gmail (automática): error — <run.error>`

  Va a `console.log` / `console.error`, es decir a `~/Library/Logs/Ledgerly/server.log` en la versión
  publicada.

`server/src/index.ts`, después de levantar el server:

```ts
console.log(describeGmailSetup(process.env));
const gmailConfig = readGmailConfig(process.env);
if (gmailConfig?.intervalMinutes) await startGmailJob(gmailConfig);
```

### `server/src/gmail/authorizeGmail.ts` (script `bun run gmail:auth`)

```ts
export function createPkcePair(): { verifier: string; challenge: string }
export function buildGmailAuthUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge: string }): string
export async function exchangeGmailCode(input: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier: string }): Promise<string>
export function upsertEnvVar(content: string, key: string, value: string): string
```

- `buildGmailAuthUrl` arma `https://accounts.google.com/o/oauth2/v2/auth` con
  `response_type=code`, `scope=GMAIL_READONLY_SCOPE`, `access_type=offline`, `prompt=consent`
  (garantiza que vuelva un refresh token), `state`, `code_challenge` y
  `code_challenge_method=S256`.
- `exchangeGmailCode` hace `POST` al endpoint de token con `grant_type=authorization_code` y devuelve
  `refresh_token`. Si no viene, lanza «Google no devolvió refresh token; revocá el acceso de Ledgerly
  en tu cuenta y volvé a correr el script». Si Google responde no-2xx, lanza con el status y el código
  de error de Google, sin el cuerpo.
- `upsertEnvVar` (pura) reemplaza la línea `KEY=...` si existe, o agrega `KEY=value` al final. Respeta
  el resto de las líneas y el salto final.
- Bloque `if (process.argv[1]?.endsWith("authorizeGmail.ts"))`, como los seeds:
  1. Sin `GMAIL_CLIENT_ID` o `GMAIL_CLIENT_SECRET` → «Primero cargá GMAIL_CLIENT_ID y
     GMAIL_CLIENT_SECRET en .env (ver README).», y `exit 1`.
  2. Levanta un `http.createServer` en `127.0.0.1` y puerto `0`; el redirect es
     `http://127.0.0.1:<puerto>/oauth2callback`.
  3. Imprime «Abrí este link y autorizá a Ledgerly (solo lectura): <url>».
  4. En el callback valida `state`. Con `error=access_denied` → «Cancelaste la autorización.» y
     `exit 1`. Con código, responde una página «Listo, ya podés cerrar esta pestaña», intercambia el
     código y escribe `.env` (`process.cwd()`) con `upsertEnvVar`. Si el `.env` no existía, lo crea
     con permisos `0600`.
  5. Imprime «Listo: guardé GMAIL_REFRESH_TOKEN en .env. Reiniciá el server para que lo tome.».
     **Nunca imprime el token.**
  6. Si no llega nada en 5 minutos, «Se venció la espera.» y `exit 1`.

### Casos borde

| Situación | Comportamiento |
|---|---|
| Sin credenciales | `status.enabled = false`, `POST /sync` → 409, sin job, log «deshabilitado» al arrancar |
| Refresh token vencido o revocado | Corrida `error` con el mensaje de `GmailAuthError`. La UI lo muestra. El job sigue programado |
| Gmail API no habilitada | Corrida `error`, mensaje del 403 |
| PDF ajeno (factura, pasaje) | `skipped` «Formato de resumen no reconocido», una sola vez |
| PDF con contraseña | `skipped` «El PDF está protegido con contraseña» |
| PDF escaneado | `skipped` con el mensaje de `NoTextError` |
| Adjunto > 15 MB | `skipped` sin bajarlo |
| Mail sin PDF real | Entrada `partId: "-"` `skipped`, no se relee |
| Mail cuyo cuerpo es el PDF | Se importa como parte `"0"` |
| Resumen ya subido a mano (mismos bytes o misma clave natural) | `duplicate` con la descripción del existente |
| Error de Mongo al importar un adjunto | `failed`, se reintenta en la próxima corrida |
| Gmail falla al bajar el 2.º PDF de un mail | Ese PDF queda `failed`, la corrida termina en `error` y la próxima lo reintenta |
| Más de 50 mails pendientes | `hasMore: true`, la próxima corrida sigue |
| Botón durante la corrida automática | Devuelve el resultado de esa misma corrida |
| Archivo importado desde Gmail y después borrado | No se reimporta solo |

## API

Router `server/src/http/routes/gmail.ts` (ya registrado en `app.ts` como
`app.use("/api/gmail", gmailRouter)`).

- **`GET /api/gmail/status`** → `200 GmailStatusDTO`. Lee `readGmailConfig(process.env)` en cada
  request y `findLastGmailRun()`. Nunca falla por falta de credenciales.
- **`POST /api/gmail/sync`** → `200 GmailSyncRunDTO`, aunque la corrida termine con
  `status: "error"`. Sin configuración → `409 { error: "Gmail no está configurado: faltan <vars>" }`.

DTOs (ya en `shared/src/dtos.ts`):

```ts
export const gmailSyncOutcomeSchema = z.enum(["imported", "duplicate", "skipped", "failed"]);
export const gmailSyncTriggerSchema = z.enum(["manual", "job"]);

export const gmailSyncItemDtoSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  receivedAt: z.string(),
  outcome: gmailSyncOutcomeSchema,
  kind: importedFileKindSchema.nullable(),
  documentId: z.string().nullable(),
  detail: z.string(),
});

export const gmailSyncRunDtoSchema = z.object({
  trigger: gmailSyncTriggerSchema,
  startedAt: z.string(),
  finishedAt: z.string(),
  status: z.enum(["ok", "error"]),
  error: z.string().nullable(),
  messagesChecked: z.number().int(),
  hasMore: z.boolean(),
  items: z.array(gmailSyncItemDtoSchema),
});

export const gmailStatusDtoSchema = z.object({
  enabled: z.boolean(),
  missing: z.array(z.string()),
  query: z.string().nullable(),
  intervalMinutes: z.number().int().nullable(),
  lastRun: gmailSyncRunDtoSchema.nullable(),
});
```

`id` del ítem es el `_id` del `GmailAttachment` (la key de la lista). Con la feature deshabilitada:
`{ enabled: false, missing: [...], query: null, intervalMinutes: null, lastRun: <última o null> }`.

## UI

### Hooks (ya en `client/src/api/hooks.ts`)

```ts
export function useGmailStatus() {
  return useQuery({ queryKey: ["gmail-status"], queryFn: () => apiFetch<GmailStatusDTO>("/gmail/status") });
}
export function useGmailSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<GmailSyncRunDTO>("/gmail/sync", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

`invalidateQueries()` sin clave, igual que `useImportFile`: una búsqueda puede traer resúmenes,
cupones y recibos, y refresca de paso el status y «Archivos importados».

### Lógica pura — `client/src/gmailImport.ts`

```ts
export const GMAIL_OUTCOME_LABELS: Record<GmailSyncOutcome, string>
  // imported "Importado", duplicate "Ya estaba", skipped "Omitido", failed "Error"
export const GMAIL_OUTCOME_COLORS: Record<GmailSyncOutcome, "success" | "default" | "warning" | "error">
  // imported success, duplicate default, skipped warning, failed error
export function joinWithY(items: string[]): string
export function formatDateTime(iso: string): string
export function gmailMissingVarsMessage(missing: string[]): string
export function gmailIntervalLabel(minutes: number | null): string
export function gmailLastRunLabel(run: GmailSyncRunDTO | null): string
export function gmailRunSummary(run: GmailSyncRunDTO): string | null
export function splitGmailItems(items: GmailSyncItemDTO[]): { visible: GmailSyncItemDTO[]; skipped: GmailSyncItemDTO[] }
export function gmailItemSecondary(item: GmailSyncItemDTO): string
```

- `joinWithY(["A"])` → `"A"`, `["A","B"]` → `"A y B"`, `["A","B","C"]` → `"A, B y C"`.
- `formatDateTime`: `Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" })`.
- `gmailMissingVarsMessage`: «Faltan A, B y C en el .env del server. Los pasos para obtenerlas están
  en el README, sección «Importar desde Gmail»; después reiniciá el server.», en singular («Falta …
  para obtenerla») si es una sola.
- `gmailIntervalLabel`: `null` → `"apagada"`; múltiplo de 60 → `"cada 6 h"`; si no, `"cada 90 min"`.
- `gmailLastRunLabel`: `"Todavía no buscaste en Gmail."` o
  `"Última búsqueda: 3/10/26, 14:05 (automática)"` / `"(manual)"`.
- `gmailRunSummary`:
  - corrida con `error` y sin ítems → `null`, porque el error lo dice todo;
  - `messagesChecked === 0` → `"No había mails nuevos."`;
  - si no, `"Revisé 3 mails nuevos: 1 importado · 1 ya estaba · 1 omitido"`. Solo entran las cuentas
    distintas de cero, con plurales («2 importados», «2 ya estaban», «2 omitidos», «2 con error»).
    Con mails pero sin ítems → `"Revisé 1 mail nuevo: no tenía PDFs."` /
    `"Revisé 2 mails nuevos: no tenían PDFs."`.
- `splitGmailItems`: `visible` = importados, con error y ya estaban, en ese orden; `skipped` aparte.
- `gmailItemSecondary`: `[IMPORTED_FILE_KIND_LABELS[kind], detail, formatLocalDate(receivedAt)]`
  sin vacíos, unidos por `" · "`. Por ejemplo:
  `"Tarjeta · Visa Signature ****1234 · 42 movimientos · 2026-09-28"`.

### Componentes

**`client/src/components/GmailImportSection.tsx`**: exporta `GmailImportSection` (sin props), que
renderiza **siempre** el `<Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>Gmail</Typography>`
y un `GmailImportPanel` interno con early returns:

1. `isLoading` → `<CircularProgress size={24} />`.
2. `isError` → `<Alert severity="error">{error.message}</Alert>`.
3. `!status.enabled` → `Alert severity="info"` con `AlertTitle` «Importación desde Gmail
   deshabilitada» y `gmailMissingVarsMessage(missing)`. **Sin botón.**
4. Habilitada → `Card variant="outlined"` con:
   - `gmailLastRunLabel(run)` en `body1`, donde `run = sync.data ?? status.lastRun`;
   - «Búsqueda automática: {gmailIntervalLabel(intervalMinutes)}» en `body2`, `text.secondary`;
   - «Consulta: {query}» en `caption`, `text.secondary`, con `overflowWrap: "anywhere"`;
   - botón `variant="contained"` con `MailOutlineIcon`: «Buscar en Gmail». Mientras la mutación está
     pendiente, `disabled` con `CircularProgress size={16}` y el texto «Buscando…»;
   - `sync.isError` → `Alert severity="error"` con `sync.error.message` (p. ej. el 409);
   - `<GmailSyncResult run={run} />` si hay corrida.

**`client/src/components/GmailSyncResult.tsx`**: props `{ run: GmailSyncRunDTO }`.

- `run.status === "error"` → `Alert severity="error"` con `run.error`.
- `gmailRunSummary(run)` en `body2`, si no es `null`.
- `run.hasMore` → `Alert severity="info"`: «Quedan mails por revisar: tocá «Buscar en Gmail» otra vez.».
- `List` con `visible`. Cada `ListItem` (`key={item.id}`, `disableGutters`) muestra una fila
  flex-wrap con el `fileName` (`subtitle2`, `overflowWrap: "anywhere"`) y un `Chip size="small"` con
  `GMAIL_OUTCOME_LABELS` / `GMAIL_OUTCOME_COLORS`, y debajo `gmailItemSecondary(item)` en `body2`,
  `text.secondary`.
- Si hay omitidos, un botón de texto «Ver omitidos (N)» / «Ocultar omitidos» con `aria-expanded`
  muestra un `Collapse` con la misma lista para `skipped`. En la primera búsqueda, con la consulta
  amplia, puede haber varios PDFs ajenos, y así no empujan «Archivos importados» fuera de la vista.

### Página — `client/src/pages/ImportPage.tsx`

Sin cambios en esta feature: la base ya dejó el orden final. Título → dropzone → resultado de la
subida → **Gmail** → revisión del resumen → Archivos importados. La sección no usa el filtro de año
global.

### Compu y mobile

- **Compu:** dentro de la card, `Box` flex con `justifyContent: "space-between"` y `flexWrap:
  "wrap"`: los textos a la izquierda, el botón a la derecha.
- **Mobile** (`useIsMobile()`): el botón va `fullWidth` debajo de los textos, con `tapTargetSx`
  (44 px). «Ver omitidos» lleva `minHeight: MIN_TAP_SIZE` en las dos vistas. La lista no es una
  tabla: es la misma en las dos vistas y sus filas hacen wrap (chip debajo del nombre si no entra). No
  hace falta un componente aparte por vista.
- El `CardContent` usa el mismo padding que `RecordCard` (`p: 2`, `"&:last-child": { pb: 2 }`).

## README y `.env.example`

Ya están en la base: el bloque `GMAIL_*` de `.env.example`, la línea `bun run gmail:auth` en
«Scripts», la sección «Importar desde Gmail (opcional)» con los pasos de Google Cloud Console y la
línea de «Privacidad». Esta feature no los modifica.

## Tests

Ningún test hace llamadas reales: el cliente de Gmail es un fake o `fetch` está stubbeado. Los
fixtures son sintéticos (ids `msg-1`, archivos `resumen-sintetico.pdf`, texto de
`server/src/parsers/__fixtures__/*.sample.txt`).

- `server/src/testing/gmailFixtures.ts` (nuevo): `fakeGmailClient(messages: FakeGmailMessage[])` →
  `GmailClient` con `vi.fn` en los tres métodos, y `pdfPart(partId, fileName, size?)`.
- `server/src/gmail/gmailConfig.test.ts`: `null` si falta o está vacía cualquier credencial;
  `missingGmailVars` nombra solo las faltantes; query por defecto y override con `trim`;
  `parseGmailInterval` con `undefined`, `"360"`, `"abc"`, `"5"`, `"0"` y `"15"`; las cuatro líneas de
  `describeGmailSetup`, y que ninguna contiene los valores.
- `server/src/gmail/gmailClient.test.ts` (`vi.stubGlobal("fetch")`, como `dollarRate.test.ts`):
  - el token se pide una vez y se reutiliza;
  - `listMessageIds` pagina con `nextPageToken` y corta en `limit`, con `q` url-encodeado;
  - `getMessage` mapea `internalDate` y `pdfParts`;
  - `downloadPart` decodifica base64url y usa `inlineData` sin request;
  - `invalid_grant` → `GmailAuthError`, y el mensaje no contiene ni el refresh token ni el secreto;
  - 403 y 500 → `GmailApiError`; un 401 de la API renueva el token y reintenta una vez; una falla de
    red → `GmailApiError`.

  `collectPdfParts` con multipart anidado, `octet-stream` + `.PDF`, PDF sin filename, PDF en la raíz
  del payload, y partes no PDF ignoradas.
- `server/src/gmail/syncGmail.test.ts` (`withDb`, fake client e `importPdf` como `vi.fn`):
  - imported, duplicate y skipped quedan en el registro y en la corrida;
  - una segunda corrida no vuelve a llamar a `getMessage` para mails ya procesados;
  - un `failed` se reintenta y pasa a `imported`;
  - una parte > 15 MB no se baja;
  - un mail sin PDF queda con `partId: "-"`;
  - `GmailAuthError` en `list` → corrida `error` persistida, sin throw;
  - un error inesperado en `list` → corrida `error`, sin throw;
  - un error en `getMessage` a mitad de camino conserva lo anterior;
  - un error al bajar el segundo PDF de un mail lo deja `failed` y la próxima corrida lo importa;
  - `hasMore` con `maxMessages: 1`;
  - `EncryptedPdfError` → `skipped`.

  También `selectPendingMessages` y `classifyImportError` como puras, y que `runGmailSync` (con
  `vi.mock("./gmailClient.js")`) llamado dos veces seguidas devuelve la misma promesa y crea el
  cliente una sola vez, y que después de un rechazo la próxima llamada arranca otra corrida.
- `server/src/gmail/gmailMappers.test.ts`: los dos mappers con documentos reales.
- `server/src/gmail/gmailJob.test.ts`: `nextGmailRunDelayMs` sin corridas, con corrida reciente,
  con corrida vieja (piso de 60 s) y nunca negativo. `startGmailJob` con `vi.useFakeTimers()` y
  `runGmailSync` mockeado: primera corrida al delay, encadena la siguiente, sigue programando si una
  corrida rechaza, y la función devuelta cancela. `formatGmailRunLog` en ok y en error.
- `server/src/gmail/authorizeGmail.test.ts`: `buildGmailAuthUrl` lleva el scope readonly,
  `access_type=offline`, `prompt=consent` y `S256`. `createPkcePair`: el challenge es el SHA-256
  base64url del verifier. `exchangeGmailCode` manda el body correcto y falla sin `refresh_token`.
  `upsertEnvVar` reemplaza, agrega y conserva las otras líneas.
- `server/src/http/routes/gmail.test.ts` (`withDb`, `vi.stubEnv` / `vi.unstubAllEnvs`, y
  `vi.mock` de `gmailClient.js` y de `pdf/extract.js`):
  - sin env → status `enabled: false` con los tres nombres y `POST /sync` → 409;
  - con env → status con `query` e `intervalMinutes`;
  - `POST /sync` con un mensaje fake cuyo PDF extrae el texto de `icbc.sample.txt` → 200, ítem
    `imported` de `kind: "statement"` y `StatementModel.countDocuments() === 1`;
  - después, el status trae `lastRun`;
  - un fake que lanza `GmailAuthError` → 200 con `status: "error"`.
- `server/src/import/importPdf.test.ts`: despacho por los cuatro kinds con `extractPdfText`
  mockeado; `PasswordException` → `EncryptedPdfError`; texto corto → `NoTextError`; `file.description`
  correcto.
- `server/src/import/importStatement.test.ts`:
  - `stmtWith(rows, closingDate = "2026-07-02")`, y los dos tests de «dedup entre resúmenes» usan
    cierres distintos para el segundo resumen;
  - nuevo: mismo `(issuer, cardLabel, closingDate)` con bytes distintos → `duplicate`, sin segundo
    statement;
  - nuevo: con `replace`, reemplaza por clave natural;
  - nuevo: `closingDate: null` no deduplica por clave natural.
- `server/src/http/routes/import.test.ts`: los tests actuales pasan sin cambios. Nuevo: PDF con
  contraseña (mock que rechaza con `name: "PasswordException"`) → 422.
- `client/src/gmailImport.test.ts`: `joinWithY`, `gmailMissingVarsMessage`, `gmailIntervalLabel`,
  `gmailLastRunLabel` (contra el mismo `Intl` para no depender de la zona horaria), las variantes de
  `gmailRunSummary` con sus plurales, `splitGmailItems` y `gmailItemSecondary`.
- `client/src/components/GmailImportSection.test.tsx`, con `afterEach(cleanup)` (en este repo el
  auto-cleanup de RTL está apagado):
  - deshabilitada → alerta con los nombres de las variables y sin botón;
  - error del status → alerta con el mensaje;
  - habilitada sin corridas → «Todavía no buscaste en Gmail.» y el botón;
  - click → `POST /api/gmail/sync`, se ven el resumen y los ítems; mientras tanto, «Buscando…»
    deshabilitado;
  - un 409 de la búsqueda muestra el error;
  - «Ver omitidos (N)» despliega los omitidos;
  - una corrida con `error` muestra la alerta, y una con `hasMore` muestra el aviso;
  - en mobile (`emulateMobile`) el botón está presente y ocupa todo el ancho.
- `client/src/pages/ImportPage.test.tsx`: ya preparado por la base, no se toca.

## Fuera de alcance

- PDFs con contraseña de usuario (p. ej. protegidos con el DNI): se informan como omitidos con el
  motivo. Si resultan ser el caso común, un diseño aparte puede sumar `GMAIL_PDF_PASSWORDS`.
- Mails que traen un **link** al resumen en lugar del adjunto.
- Escribir en Gmail (marcar como leído, etiquetar): el scope es de solo lectura a propósito.
- Push con Pub/Sub, varias casillas, y OAuth desde la UI.
- Notificaciones cuando entra algo nuevo.
- Marcar en «Archivos importados» qué vino de Gmail y qué se subió a mano.
- Historial de corridas en la UI: solo se muestra la última.
- Reimportar desde Gmail algo que se borró.
- Limpiar statements duplicados que ya existan en la base. La clave natural evita los nuevos.

## Orden de implementación

1. **Refactor sin cambio de comportamiento:** `IngestionError`, `importPdf` (más `EncryptedPdfError`)
   y la ruta `import.ts` delegando. Los tests de `import.test.ts` siguen verdes.
2. **Dedup por clave natural** en `importStatement`, con sus tests.
3. **Config y cliente de Gmail:** `gmailConfig.ts` y `gmailClient.ts`, con sus tests de `fetch`
   stubbeado.
4. **Sincronización:** `gmailMappers.ts`, `gmailFixtures.ts` y `syncGmail.ts`.
5. **Ruta `/api/gmail`.**
6. **Job y arranque:** `gmailJob.ts` e `index.ts`.
7. **Script de autorización:** `authorizeGmail.ts`.
8. **UI:** `gmailImport.ts`, `GmailSyncResult` y `GmailImportSection`.

## Operación

Sin credenciales no hay nada que hacer: la sección dice qué falta. Para activarla, seguir el README
una vez. El job conviene prenderlo solo en `~/Services/ledgerly/.env`. Si Google revoca el token
(cambio de contraseña, revocación manual, 6 meses sin uso), la sección muestra el error con la
instrucción: `bun run gmail:auth`, copiar la línea nueva a la `.env` que corresponda y reiniciar.
