# Importar resúmenes desde iCloud — diseño

Fecha: 2026-10-05
Estado: pendiente de revisión. Rama `feat/importacion-icloud`, creada desde `feat/importacion-gmail`.

## Objetivo

Que los resúmenes de tarjeta (ICBC y Visa Signature) y los cupones (hipoteca UVA y plan del auto)
entren a Ledgerly **solos**, sin descargarlos ni subirlos a mano, y que me entere si algo falla.

Esos mails llegan a **mi casilla de iCloud**, no a Gmail. La importación desde Gmail de
`feat/importacion-gmail` no los ve nunca; le sirve a los recibos de sueldo, que llegan a la casilla
de Gmail del trabajo. Este diseño **suma iCloud como segunda fuente** de esa misma importación y deja
las dos funcionando.

## Punto de partida

`feat/importacion-gmail` (ver `2026-10-03-importacion-gmail-design.md`) ya resuelve todo lo que no
depende del proveedor:

- `importPdf` como único punto de entrada para importar un PDF (lo usan `POST /api/import` y la
  sincronización).
- Un motor idempotente (`syncGmail`): lista mensajes, lleva un registro por adjunto con clave
  `(messageId, partId)`, procesa hasta 50 mails nuevos por corrida, une corridas concurrentes y
  nunca tira el proceso.
- Detección **por contenido**: baja cualquier PDF y decide `detectDocumentKind`. Un PDF ajeno queda
  «omitido» una sola vez.
- Dedup de resúmenes por `(issuer, cardLabel, closingDate)` además de `sourceHash`, para que el PDF
  del mail y el del home banking no generen dos resúmenes.
- Job periódico opcional que respeta la última corrida registrada aunque el server se reinicie.
- Sección «Gmail» en Importar con estado, botón, resultado y omitidos colapsados, en compu y mobile.

Las colecciones `gmailsyncruns` y `gmailattachments` existen en la base compartida pero están
**vacías** (verificado el 2026-10-05: nunca se cargaron credenciales de Gmail).

## Decisiones tomadas

- **Se apila sobre `feat/importacion-gmail`** en vez de arrancar desde `main`: reusar el motor, el
  registro y la UI es mucho menos código, y evita los conflictos de tener dos refactors de
  `import.ts`. La contra aceptada: esta rama se mergea después de esa.
- **Las dos fuentes quedan activas.** iCloud para resúmenes y cupones; Gmail para recibos (si el
  Workspace de parsimotion permite el OAuth).
- **El motor se generaliza a «mail» con un campo `source`** (`"gmail" | "icloud"`), en lugar de
  copiar `syncGmail` para iCloud. Modelos, DTOs, rutas, hooks y componentes pasan de `Gmail*` a
  `Mail*`. Como las colecciones de Gmail están vacías, el renombre no migra datos.
- **iCloud por IMAP con contraseña de app.** iCloud no ofrece OAuth para terceros; IMAP
  (`imap.mail.me.com:993`, TLS) con una contraseña específica de app es el camino que Apple
  documenta. Se revoca sola, sin tocar la contraseña de Apple.
- **La contraseña vive en el Llavero de macOS**, no en `.env`: da acceso a todo el mail de iCloud.
  Servicio `ledgerly-icloud-imap`, cuenta = `ICLOUD_USER`. El server la lee con
  `/usr/bin/security` en cada corrida y no la cachea.
- **Una sola dependencia nueva: `imapflow`.** Trae `bodyStructure` (para encontrar las partes PDF
  sin bajar el mail entero) y `download()` decodifica base64 / quoted-printable. No hace falta
  `mailparser`.
- **Solo lectura estricta en iCloud.** Las carpetas se abren con `EXAMINE` (read-only): la
  sincronización no marca como leído, no mueve y no borra nada.
- **Ventana de búsqueda por fecha fija:** `ICLOUD_SINCE=2026-09-01` en la versión publicada, así
  entran los resúmenes de septiembre que ya llegaron. Lo que ya esté cargado termina como «Ya
  estaba». Sin la variable, la ventana es de 90 días hacia atrás, igual que el default de Gmail.
- **Notificaciones de macOS** para las corridas automáticas de **cualquiera** de las dos fuentes
  (ver [Notificaciones](#notificaciones)). Las corridas manuales no notifican: el resultado ya se
  ve en pantalla.
- **Sin remitentes fijos en el código**, igual que Gmail: decide el contenido del PDF. Si hace falta
  acotar, se acota por carpeta (`ICLOUD_MAILBOXES`).

### Enfoques descartados

- **Un `syncIcloud` paralelo a `syncGmail`:** duplica el registro, las corridas, el job y la UI.
- **Contraseña de app en `.env`:** más simple y consistente con `GMAIL_REFRESH_TOKEN`, pero deja en
  texto plano una credencial con acceso total al mail. El Llavero cuesta una línea de `execFile`.
- **Regla de Mail.app + carpeta vigilada:** depende de Mail.app abierto y de un AppleScript frágil,
  y «Buscar ahora» no tendría nada que buscar.
- **IMAP IDLE / push:** una conexión abierta permanente para un mail por mes no se justifica; la
  corrida cada 6 h alcanza.
- **Desde `main`, independiente:** duplica `importPdf`, modelos y UI, y garantiza conflictos.

## Arquitectura

### Generalización del motor (renombres sobre `feat/importacion-gmail`)

| Antes | Después |
|---|---|
| `server/src/gmail/syncGmail.ts` | `server/src/mail/syncMail.ts` |
| `server/src/gmail/gmailJob.ts` | `server/src/mail/mailJob.ts` |
| `server/src/gmail/gmailMappers.ts` | `server/src/mail/mailMappers.ts` |
| interfaz `GmailClient` (en `gmailClient.ts`) | `MailClient` en `server/src/mail/mailClient.ts` |
| `GmailSyncRunModel` / `GmailAttachmentModel` | `MailSyncRunModel` / `MailAttachmentModel` |
| `gmailSync*Schema`, `gmailStatusDtoSchema` | `mailSync*Schema`, `mailSourceStatusDtoSchema` |
| `/api/gmail/status`, `/api/gmail/sync` | `/api/mail/status`, `/api/mail/:source/sync` |
| `useGmailStatus`, `useGmailSync` | `useMailStatus`, `useMailSync(source)` |
| `GmailImportSection`, `GmailSyncResult`, `gmailImport.ts` | `MailImportSection`, `MailSyncResult`, `mailImport.ts` |

Se quedan en `server/src/gmail/`: `gmailClient.ts` (ahora implementa `MailClient`),
`gmailConfig.ts` y `authorizeGmail.ts`.

`MailClient` es la interfaz que ya usa el motor, más un cierre:

```ts
export interface MailClient {
  listMessageIds(limit: number): Promise<string[]>;
  getMessage(id: string): Promise<MailMessage>;
  downloadPart(messageId: string, part: MailPdfPart): Promise<Uint8Array>;
  close(): Promise<void>;
}
```

- La consulta deja de ser un parámetro de `listMessageIds`: cada cliente la recibe al crearse
  (Gmail su `query`; iCloud sus carpetas y su fecha).
- `close()` se llama siempre al final de la corrida, también si falló. En Gmail no hace nada; en
  iCloud hace `logout`.
- `MailPdfPart` es `GmailPdfPart` sin los campos propios de Gmail: `{ partId, fileName, size }`.
  Cada cliente guarda lo que necesita para bajarla (Gmail su `attachmentId` / `inlineData`, iCloud
  el UID y la carpeta).

`runMailSync(source, config, trigger)` reemplaza a `runGmailSync`: una promesa en vuelo **por
fuente**. Una corrida de iCloud no espera a una de Gmail.

`startMailJob(source, config)` reemplaza a `startGmailJob`: un job por fuente, cada uno con su
intervalo y su última corrida. `nextRunDelayMs` busca la última corrida **de esa fuente**.

### Fuente iCloud — `server/src/icloud/`

| Archivo | Responsabilidad |
|---|---|
| `icloudConfig.ts` | Lee `ICLOUD_*` del entorno y el estado del Llavero. `readIcloudConfig`, `missingIcloudSetup`, `describeIcloudSetup` (la línea del log al arrancar). |
| `keychain.ts` | `hasIcloudPassword(user)` (`security find-generic-password -s … -a …`, sin `-w`) y `readIcloudPassword(user)` (con `-w`). El ejecutor de comandos se inyecta para testear. Fuera de macOS, no hay contraseña. |
| `icloudClient.ts` | `createIcloudClient(config, password): MailClient` sobre `imapflow`. |

`createIcloudClient` en cada corrida:

1. Conecta a `imap.mail.me.com:993` (TLS) con `ICLOUD_USER` y la contraseña.
2. `listMessageIds(limit)`: por cada carpeta de `ICLOUD_MAILBOXES`, la abre en solo lectura,
   busca `SINCE <fecha>` por UID y trae `envelope`, `internalDate` y `bodyStructure` de esos
   mensajes. **Se queda solo con los que tienen alguna parte PDF** (nombre `.pdf` o
   `application/pdf`, la misma regla que Gmail), así un newsletter no ensucia el registro. Devuelve
   los ids del más nuevo al más viejo, hasta `limit`, y guarda en memoria la estructura de cada uno.
3. `getMessage(id)`: devuelve lo guardado en el paso 2 (`receivedAt` = `internalDate`).
4. `downloadPart(id, part)`: abre la carpeta del mensaje en solo lectura y hace
   `download(uid, part.partId, { uid: true })`, que ya devuelve el contenido decodificado.

Identidad de un mensaje:

- `messageId` = el header `Message-ID` sin `<>`. Es estable aunque el mail cambie de carpeta y no
  depende del UID, que cambia si iCloud resetea `UIDVALIDITY`.
- Si un mail no tiene `Message-ID` (raro), se usa `<carpeta>/<uidValidity>/<uid>`.
- `partId` = el número de parte IMAP (`"2"`, `"1.2"`).

`size` es el tamaño de la parte según `bodyStructure`, que viene codificado (base64 ≈ ×1,37). El
tope de 15 MB queda por eso del lado conservador: alcanza y sobra para un resumen.

### Notificaciones — `server/src/mail/notifyRun.ts`

Después de cada corrida **automática** (`trigger: "job"`), y solo en macOS:

| Situación | Notificación |
|---|---|
| Uno o más adjuntos `imported` | «Ledgerly · iCloud» — «Importé el resumen ICBC» / «Importé 2 documentos: resumen ICBC y resumen Visa Signature» (con el `kind` de cada uno). |
| Un adjunto `failed` | «No pude importar Resumen6oct2026.pdf: \<detalle\>». |
| Un adjunto `skipped` por un documento **reconocido** que no se pudo leer (sin movimientos, cupón inválido, recibo inválido) | «Resumen6oct2026.pdf parece un resumen pero no lo pude leer: \<detalle\>». |
| La corrida terminó en `error` **y la anterior de esa fuente no** | «iCloud: \<error\>». Si la contraseña vence, avisa una vez, no cada 6 h. |

- Un adjunto `failed` que vuelve a fallar igual en la corrida siguiente no se vuelve a avisar.
- No notifican: `duplicate`, ni los `skipped` por formato desconocido o PDF sin texto (facturas,
  pasajes, PDFs ajenos), ni la vuelta de `error` a `ok`.
- Para distinguir el `skipped` «ajeno» del «reconocido pero roto», `classifyImportError` le pone
  `kind` a los errores de un documento reconocido (`NoTransactionsError` → `statement`,
  `InvalidCouponError` → `coupon`, `InvalidAutoCouponError` → `auto`, `InvalidPayslipError` →
  `payslip`) y lo guarda en el campo `kind` que el registro ya tiene. Un `skipped` con `kind` es un
  documento roto; sin `kind`, un PDF ajeno. La UI muestra los rotos a la vista (después de los
  errores) y deja solo los ajenos dentro de «Ver omitidos».
- Se manda con
  `execFile("osascript", ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run", título, texto])`:
  el texto viaja como argumento y nunca se interpola en el AppleScript, así un nombre de archivo
  con comillas no rompe nada.
- Si `osascript` falla, se loguea y sigue: una notificación nunca hace fallar una corrida.
- Limitación aceptada: aparece como notificación de «Script Editor» (la primera vez puede haber que
  habilitarla en Ajustes → Notificaciones) y tocarla no abre Ledgerly.

## Datos

### Variables de entorno nuevas (todas opcionales)

| Variable | Uso |
|---|---|
| `ICLOUD_USER` | Cuenta de iCloud (`<cuenta>@icloud.com`). Sin ella, iCloud está deshabilitado. |
| `ICLOUD_SINCE` | Fecha `AAAA-MM-DD` desde la que se buscan mails. Ausente o inválida → 90 días hacia atrás. |
| `ICLOUD_MAILBOXES` | Carpetas separadas por coma. Default `INBOX`. |
| `ICLOUD_SYNC_INTERVAL_MINUTES` | Igual que `GMAIL_SYNC_INTERVAL_MINUTES`: entero ≥ 15; ausente o inválido → solo manual. |

iCloud está **habilitado** cuando hay `ICLOUD_USER` **y** existe la contraseña en el Llavero. El
status informa qué falta con textos legibles: `ICLOUD_USER` y/o «la contraseña de app en el
Llavero (ledgerly-icloud-imap)». Ningún valor secreto viaja al cliente ni se loguea.
Si falta la contraseña pero hay intervalo, el job igual arranca: cada corrida falla con el mensaje del Llavero (se avisa una vez) hasta que se cargue.

### Colecciones — `server/src/db/models.ts`

`MailSyncRun` y `MailAttachment` son los schemas de Gmail con un campo más:

```ts
source: { type: String, required: true, enum: ["gmail", "icloud"] },
```

- Índice único de `MailAttachment`: `{ source: 1, messageId: 1, partId: 1 }`.
- Índice de `MailSyncRun`: `{ source: 1, startedAt: -1 }` (la última corrida de cada fuente).
- `runId` pasa a referenciar `MailSyncRun`.
- Igual que en Gmail, no se guarda asunto, remitente ni cuerpo; los PDFs se procesan en memoria.
- Las colecciones vacías `gmailsyncruns` y `gmailattachments` quedan huérfanas. Se pueden borrar
  a mano; no molestan.

### DTOs — `shared/src/dtos.ts`

- `mailSourceSchema = z.enum(["gmail", "icloud"])`.
- `mailSyncOutcomeSchema`, `mailSyncTriggerSchema`, `mailSyncItemDtoSchema`: iguales a los de Gmail.
- `mailSyncRunDtoSchema`: el de Gmail más `source`.
- `mailSourceStatusDtoSchema`:

```ts
z.object({
  source: mailSourceSchema,
  enabled: z.boolean(),
  missing: z.array(z.string()),
  scope: z.string().nullable(),
  intervalMinutes: z.number().int().nullable(),
  lastRun: mailSyncRunDtoSchema.nullable(),
});
```

`scope` describe qué se revisa: en Gmail la consulta (lo que hoy es `query`); en iCloud
«INBOX desde 01/09/2026».

## API

| Ruta | Respuesta |
|---|---|
| `GET /api/mail/status` | `MailSourceStatusDTO[]`, siempre las dos fuentes, en orden `icloud`, `gmail`. |
| `POST /api/mail/:source/sync` | `MailSyncRunDTO` de la corrida (o de la que ya estaba en vuelo). `400` si la fuente no existe; `409` si no está configurada, con lo que falta. |

`/api/gmail/*` desaparece: la rama de Gmail no está mergeada, no hay clientes viejos.

Al arrancar, el server loguea una línea por fuente (`describeGmailSetup` y `describeIcloudSetup`),
por ejemplo `iCloud: búsqueda automática cada 360 min (INBOX desde 2026-09-01)`.

## Interfaz

La sección de Importar pasa a llamarse **«Mails»** y muestra **una tarjeta por fuente**, iCloud
primero:

- Encabezado de tarjeta con el nombre de la fuente (la cuenta no viaja al cliente).
- Lo mismo que hoy muestra la tarjeta de Gmail: última búsqueda, búsqueda automática, alcance
  (`scope`), botón **«Buscar en iCloud»** / **«Buscar en Gmail»** y el resultado con los omitidos
  colapsados.
- Deshabilitada: el aviso con lo que falta y la sección del README que corresponde
  («Importar desde iCloud» o «Importar desde Gmail»).
- `hasMore`: «Quedan mails por revisar: tocá «Buscar en iCloud» otra vez».
- Mobile: las tarjetas se apilan; el botón ocupa el ancho y respeta el objetivo táctil de 44 px,
  como hoy.

`useMailSync(source)` invalida todas las queries al terminar, igual que `useGmailSync`.

## Errores

| Caso | Resultado |
|---|---|
| Falta la contraseña en el Llavero al correr | Corrida `error`: «Falta la contraseña de app de iCloud en el Llavero (ledgerly-icloud-imap). Pasos en el README, «Importar desde iCloud».» |
| iCloud rechaza el login (`authenticationFailed`) | `error`: «iCloud rechazó el usuario o la contraseña de app. Generá una nueva en account.apple.com y actualizala en el Llavero.» |
| Red caída, DNS, timeout | `error`: «No se pudo conectar con iCloud: \<motivo\>». La próxima corrida reintenta. |
| No existe una carpeta de `ICLOUD_MAILBOXES` | `error`: «No pude abrir la carpeta «\<nombre\>» de iCloud: \<motivo\>». |
| El Llavero no responde (bloqueado) | `error`: «El Llavero no respondió a tiempo (¿está bloqueado?)…». Nada se cuelga: las llamadas a `security` y `osascript` tienen un timeout de 10 s. |
| Falla la descarga de una parte | Igual que en Gmail: queda `failed`, la corrida corta con `error` y el mail se reintenta en la próxima. |
| PDF con contraseña o sin texto | `skipped` con el motivo (comportamiento actual de `importPdf`). |
| Se reinicia el server a mitad de corrida | Igual que en Gmail: idempotente; lo no registrado se retoma. |

Los errores de iCloud son clases propias (`IcloudAuthError`, `IcloudApiError`) con el mismo papel
que `GmailAuthError` / `GmailApiError`: el motor los convierte en una corrida `error` con mensaje,
nunca en un 500 ni en una excepción que tire el job.

## Seguridad y privacidad

- La contraseña de app solo existe en el Llavero y en memoria durante la corrida. No se loguea, no
  se cachea, no viaja al cliente.
- Se guarda en el Llavero con `security add-generic-password -s ledgerly-icloud-imap -a <cuenta> -w`
  **sin** pasar el valor: el comando lo pide y no queda en el historial de la shell.
- Carpetas en solo lectura (`EXAMINE`): nada cambia en iCloud.
- `/api/mail/*` queda detrás de Tailscale como el resto. Cuenta, carpetas y fecha solo se cambian
  en `.env`; la API solo dispara corridas.
- El job automático se configura **solo en la versión publicada** (`~/Services/ledgerly/.env`). La
  base es compartida con `bun run dev`: dos jobs no rompen nada, pero duplican el trabajo y las
  notificaciones.

## Tests

TDD, vitest, `mongodb-memory-server` y `fetch` / `execFile` stubbeados, como el resto del server.

- **Renombre del motor:** los tests de `syncGmail`, `gmailJob`, `gmailMappers`, la ruta y los
  componentes se mueven con su archivo y siguen pasando con `source: "gmail"`. Se agregan casos de
  aislamiento entre fuentes: el registro de una no saltea mensajes de la otra; una corrida en vuelo
  de iCloud no se une a una de Gmail; el job de cada fuente mira su propia última corrida.
- **`icloudClient`:** las partes puras como funciones exportadas y testeadas (encontrar las partes
  PDF en un `bodyStructure`, armar el `messageId`, ordenar y recortar). La conexión real **no** se
  testea automáticamente: se verifica a mano con «Buscar en iCloud».
- **`keychain` / `icloudConfig`:** con el ejecutor inyectado: contraseña presente, ausente, fuera de
  macOS; parseo de `ICLOUD_SINCE`, `ICLOUD_MAILBOXES` e intervalo; textos de `missing` y del log.
- **`notifyRun`:** con `execFile` inyectado: qué corridas notifican y con qué texto, que solo
  notifique `job`, la transición `ok → error`, el silencio en duplicados y omitidos ajenos, que los
  argumentos viajen como `argv`, y que un fallo de `osascript` no se propague.
- **Rutas:** forma de `GET /api/mail/status` con las dos fuentes, `400` por fuente desconocida,
  `409` por fuente sin configurar.
- **Cliente:** `mailImport.ts` (textos por fuente) y `MailImportSection` con las dos tarjetas en
  sus estados (habilitada, deshabilitada, buscando, error), con `afterEach(cleanup)`.

## Puesta en marcha (una vez)

1. **Descubrimiento** (antes de escribir código de la fuente): un script descartable en el
   scratchpad, solo lectura, lista carpeta, fecha y nombre de adjunto de los PDFs del último año en
   iCloud. Confirma en qué carpetas quedan los resúmenes y cupones y que los PDFs no traen
   contraseña. No se guarda nada en el repo.
2. Generar una contraseña de app en account.apple.com → Inicio de sesión y seguridad → Contraseñas
   de apps, con el nombre «Ledgerly».
3. `security add-generic-password -s ledgerly-icloud-imap -a <cuenta>@icloud.com -w`
4. En `~/Services/ledgerly/.env`: `ICLOUD_USER=<cuenta>@icloud.com`,
   `ICLOUD_SINCE=2026-09-01`, `ICLOUD_SYNC_INTERVAL_MINUTES=360` (y `ICLOUD_MAILBOXES` si el
   descubrimiento muestra otra carpeta).
5. `bun run deploy` y verificar en el log `iCloud: búsqueda automática cada 360 min (…)`.
6. Importar → **Buscar en iCloud**: tienen que entrar los resúmenes ICBC y Visa Signature de
   septiembre; lo ya cargado aparece como «Ya estaba».

El README suma la sección «Importar desde iCloud» con estos pasos, y cómo revocar el acceso
(borrar la contraseña de app en account.apple.com y el ítem del Llavero).

## Resultado del descubrimiento (2026-10-05)

- El resumen de la tarjeta ICBC llega a INBOX como PDF de e-resumen, con un encabezado que lista primero las etiquetas y después los valores. El parser ya lo lee.
- Los PDFs de la cuenta de ICBC llegan protegidos con contraseña y se omiten.
- El banco detrás de Visa Signature envía PDFs que son solo imagen, así que ese resumen no se puede importar desde el correo.
- Los cupones de hipotecario y de plan de auto no llegan a INBOX.
- `ICLOUD_MAILBOXES` se queda en `INBOX`: Enviados contiene copias que el propio usuario se envió y no debe escanearse.
- La detección de ICBC ahora exige "SALDO ANTERIOR", porque los vouchers de supermercado mencionan ICBC y se confundían con resúmenes.

## Fuera de alcance

- Recibos de sueldo por iCloud (no llegan ahí) y cualquier cambio a cómo Gmail los trata.
- Configurar cuenta, carpetas o fecha desde la UI.
- Mover, etiquetar o marcar como leídos los mails procesados.
- Notificaciones con ícono propio o que abran la app (necesitaría una app firmada).
- Reimportar automáticamente algo borrado desde «Archivos importados»: igual que en Gmail, se sube
  a mano.
