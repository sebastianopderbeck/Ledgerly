# Importar desde iCloud — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar iCloud (IMAP) como segunda fuente de la importación por mail que trae `feat/importacion-gmail`, con notificaciones de macOS para las corridas automáticas.

**Architecture:** El motor de `feat/importacion-gmail` (registro por adjunto, corridas, job, UI) se renombra de «Gmail» a «mail» y pasa a trabajar por fuente (`source: "gmail" | "icloud"`) contra una interfaz `MailClient`. Gmail queda como un adaptador de su cliente REST; iCloud es un cliente nuevo sobre `imapflow` que abre las carpetas en solo lectura y lee la contraseña de app del Llavero en cada corrida. Las rutas pasan a `/api/mail/*`, la UI muestra una tarjeta por fuente, y el job avisa por `osascript` lo que importó o lo que falló.

**Tech Stack:** TypeScript estricto (NodeNext), Express, Mongoose, Zod (`@ledgerly/shared`), React + MUI + TanStack Query, Vitest + mongodb-memory-server + Testing Library + supertest, `imapflow` 2.x, `/usr/bin/security`, `osascript`.

**Spec:** `docs/superpowers/specs/2026-10-05-importacion-icloud-design.md`

## Global Constraints

- Todo se hace en el worktree `.claude/worktrees/importacion-icloud` (rama `feat/importacion-icloud`, apilada sobre `feat/importacion-gmail`). No cambiar de rama en el árbol principal del repo: lo usan otras sesiones.
- Comandos desde la raíz del worktree: `bun run test`, `bun run typecheck`. Un archivo: `bunx vitest run <ruta>`.
- Sin comentarios en el código (ni `//`, ni bloques, ni JSDoc).
- TypeScript estricto, sin `any` escrito a mano. Interfaces para props y tipos de retorno explícitos en lo exportado.
- React: componentes funcionales con destructuring en la firma, fragments `<>`, nunca el índice como `key`, early returns para loading/error, la lógica antes del `return`.
- Tests de cliente con `afterEach(cleanup)` (el auto-cleanup de Testing Library está apagado en este repo).
- Textos de UI, logs y errores en castellano rioplatense (voseo), como el resto de la app.
- Una sola dependencia nueva: `imapflow@^2.2.5` en `server/package.json`.
- Nada de direcciones de mail, remitentes ni datos reales en código, tests, fixtures o docs: todo sintético (`usuario-sintetico@icloud.com`, `banco.example`).
- La contraseña de app de iCloud nunca se loguea, no se cachea entre corridas y no viaja al cliente.
- iCloud se abre solo en lectura (`getMailboxLock(carpeta, { readOnly: true })`): nunca marcar, mover ni borrar.
- Commits: uno por tarea en `feat/importacion-icloud`, con pathspec explícito, mensaje `tipo(scope): …` en castellano y el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, **solo si el usuario autorizó commitear en esta ejecución**; si no, dejar los cambios en el working tree. Nunca `git push`.
- Servers temporales: nunca el puerto 4100 (servicio instalado) ni 4000/5173 (otras sesiones). Usar 4300+ después de chequear `lsof -iTCP:<puerto> -sTCP:LISTEN`, y matar solo el PID propio.

## Review Focus

1. **Un corte de red con la sesión IMAP abierta.** `ImapFlow` emite `error`; sin listener, Node tira el proceso entero y con él la app publicada. → Task 5 testea que `createImapFlow` registra un listener y que emitir `error` no lanza.
2. **El mismo mail en dos carpetas, o sin header `Message-ID`.** Tiene que contar una sola vez y con un id estable. → Task 5 (`newestFirst`, `imapMessageId` y el caso de dos carpetas en `openIcloudClient`).
3. **PDFs que no se anuncian como `application/pdf`.** `application/octet-stream` con nombre `.PDF`, nombre solo en `parameters.name`, el mail entero es el PDF, o un PDF dentro de un mail reenviado. → Task 5 (`collectImapPdfParts`).
4. **`security` devuelve la contraseña con `\n` final o falla con un stderr.** Se recorta, y el error nunca incluye la salida del comando. → Task 4 (`readIcloudPassword`).
5. **La contraseña vence y el job falla cada 6 h, o el job se une a una corrida manual en vuelo.** Una sola notificación, y ninguna para la manual. → Task 7 (`runNotifications`).

---

### Task 1: Descubrimiento en iCloud (spike descartable)

Confirma, con mails reales y sin tocar el repo, que los resúmenes y cupones llegan como PDF adjunto, en qué carpetas quedan y que el extractor los lee. **Es una compuerta:** si los PDFs vienen con contraseña o los mails solo traen un link, frenar y avisar al usuario antes de seguir con las tasks 4–8. Las tasks 2 y 3 no dependen de esta.

**Files:**
- Create (fuera del repo): `<scratchpad>/icloud-discovery/discover.ts`

**Interfaces:**
- Consumes: `extractPdfText` (`server/src/pdf/extract.ts`) y `detectDocumentKind` (`server/src/ingestion/detectDocumentKind.ts`) del worktree.
- Produces: la lista de carpetas a usar en `ICLOUD_MAILBOXES` (Task 8). Nada en el repo.

- [ ] **Step 1: Pedirle al usuario la contraseña de app en el Llavero**

El usuario tiene que generar una contraseña de app en account.apple.com → Inicio de sesión y seguridad → Contraseñas de apps («Ledgerly») y guardarla con:

```bash
security add-generic-password -s ledgerly-icloud-imap -a <cuenta>@icloud.com -w
```

Verificar sin leer la contraseña:

```bash
security find-generic-password -s ledgerly-icloud-imap -a <cuenta>@icloud.com >/dev/null && echo "está en el Llavero"
```

Expected: `está en el Llavero`.

- [ ] **Step 2: Preparar el directorio del spike**

`<scratchpad>` es el directorio scratchpad de la sesión (lo indica el system prompt).

```bash
bun install
mkdir -p <scratchpad>/icloud-discovery
cd <scratchpad>/icloud-discovery && bun init -y >/dev/null && bun add imapflow@^2.2.5
```

- [ ] **Step 3: Escribir `discover.ts`**

```ts
import { execFileSync } from "node:child_process";
import { buffer } from "node:stream/consumers";
import { ImapFlow, type MessageStructureObject } from "imapflow";

interface PdfPart {
  part: string;
  name: string;
  type: string;
  size: number;
}

const [user, sinceArg = "2025-10-01", worktree] = process.argv.slice(2);
const { extractPdfText } = await import(`${worktree}/server/src/pdf/extract.ts`);
const { detectDocumentKind } = await import(`${worktree}/server/src/ingestion/detectDocumentKind.ts`);

const pdfParts = (node: MessageStructureObject): PdfPart[] => {
  const name = (node.dispositionParameters?.filename ?? node.parameters?.name ?? "").trim();
  const isLeaf = !node.childNodes?.length;
  const own = isLeaf && (node.type.toLowerCase() === "application/pdf" || /\.pdf$/i.test(name))
    ? [{ part: node.part ?? "1", name, type: node.type, size: node.size ?? 0 }]
    : [];
  return [...own, ...(node.childNodes ?? []).flatMap(pdfParts)];
};

const verdictOf = async (content: NodeJS.ReadableStream | undefined): Promise<string> => {
  if (!content) return "sin contenido";
  try {
    const extracted = await extractPdfText(new Uint8Array(await buffer(content)));
    return `tipo=${detectDocumentKind(extracted.text, extracted.meta)} encriptado=${extracted.meta.encrypted}`;
  } catch (err) {
    return `error=${err instanceof Error ? err.name : "desconocido"}`;
  }
};

const password = execFileSync(
  "/usr/bin/security", ["find-generic-password", "-s", "ledgerly-icloud-imap", "-a", user, "-w"],
).toString().trim();
const client = new ImapFlow({ host: "imap.mail.me.com", port: 993, secure: true, auth: { user, pass: password }, logger: false });
client.on("error", (err: Error) => console.error(`imap: ${err.message}`));
await client.connect();
const folders = await client.list();
console.log(`Carpetas: ${folders.map(({ path }) => path).join(" | ")}`);
for (const { path } of folders) {
  const lock = await client.getMailboxLock(path, { readOnly: true });
  try {
    const uids = await client.search({ since: new Date(`${sinceArg}T00:00:00`) }, { uid: true });
    if (!uids || uids.length === 0) continue;
    const messages = await client.fetchAll(uids, { uid: true, envelope: true, internalDate: true, bodyStructure: true }, { uid: true });
    for (const message of messages) {
      for (const part of message.bodyStructure ? pdfParts(message.bodyStructure) : []) {
        const download = await client.download(String(message.uid), part.part, { uid: true });
        const verdict = await verdictOf(download.content);
        const date = new Date(message.internalDate ?? 0).toISOString().slice(0, 10);
        console.log([
          path, date, message.envelope?.from?.[0]?.address ?? "?",
          message.envelope?.messageId ? "Message-ID ok" : "SIN Message-ID",
          part.name || "(sin nombre)", part.type, `${part.size} B`, verdict,
        ].join(" · "));
      }
    }
  } finally {
    lock.release();
  }
}
await client.logout();
```

- [ ] **Step 4: Correrlo desde el worktree**

```bash
bunx tsx <scratchpad>/icloud-discovery/discover.ts <cuenta>@icloud.com 2025-10-01 "$PWD"
```

Expected: una línea `Carpetas: …` y una línea por PDF adjunto. Los resúmenes ICBC y Visa Signature tienen que salir con `tipo=statement encriptado=false`, y los cupones con `tipo=coupon` / `tipo=auto`.

- [ ] **Step 5: Decidir y reportar**

- Anotar en qué carpetas aparecen los PDFs de interés: es el valor de `ICLOUD_MAILBOXES` para la Task 8 (si es solo `INBOX`, no hace falta la variable).
- Si algún resumen sale `error=PasswordException`, `encriptado=true` o `tipo=unknown`, o si no aparece ningún PDF del banco: **frenar** y reportarle al usuario la salida, sin seguir con las tasks 4–8.
- Borrar el directorio del spike: `rm -rf <scratchpad>/icloud-discovery`. No se commitea nada.

---

### Task 2: Renombrar la sincronización de Gmail a «mail», sin cambios de comportamiento

Renombre mecánico: archivos e identificadores genéricos dejan de decir Gmail. Lo propio de Gmail (cliente REST, config, `/api/gmail/*`, status de Gmail, `useGmail*`) queda igual hasta las tasks 3 y 6.

**Files:**
- Move: `server/src/gmail/syncGmail.ts` → `server/src/mail/syncMail.ts` (y su `.test.ts`)
- Move: `server/src/gmail/gmailJob.ts` → `server/src/mail/mailJob.ts` (y su `.test.ts`)
- Move: `server/src/gmail/gmailMappers.ts` → `server/src/mail/mailMappers.ts` (y su `.test.ts`)
- Move: `server/src/testing/gmailFixtures.ts` → `server/src/testing/mailFixtures.ts`
- Move: `client/src/gmailImport.ts` → `client/src/mailImport.ts` (y su `.test.ts`)
- Move: `client/src/components/GmailImportSection.tsx` → `client/src/components/MailImportSection.tsx` (y su `.test.tsx`)
- Move: `client/src/components/GmailSyncResult.tsx` → `client/src/components/MailSyncResult.tsx`
- Modify (identificadores e imports): `server/src/db/models.ts`, `server/src/db/models.test.ts`, `shared/src/dtos.ts`, `shared/src/dtos.test.ts`, `server/src/http/routes/gmail.ts`, `server/src/http/routes/gmail.test.ts`, `server/src/index.ts`, `client/src/api/hooks.ts`, `client/src/pages/ImportPage.tsx`, `client/src/pages/ImportPage.test.tsx`

**Interfaces:**
- Produces (nombres nuevos que usan las tasks siguientes): `MailSyncRunModel`, `MailAttachmentModel`, `MailSyncRunDoc`, `MailAttachmentDoc`; `mailSyncOutcomeSchema`, `mailSyncTriggerSchema`, `mailSyncItemDtoSchema`, `mailSyncRunDtoSchema`, `MailSyncOutcome`, `MailSyncTrigger`, `MailSyncItemDTO`, `MailSyncRunDTO`; `syncMail`, `SyncMailDeps`, `runMailSync`, `findLastMailRun`, `MailLedgerEntry`, `MAIL_LIST_LIMIT`, `MAIL_MAX_MESSAGES_PER_RUN`, `NO_PDF_PART_ID`, `selectPendingMessages`, `classifyImportError`; `startMailJob`, `nextMailRunDelayMs`, `formatMailRunLog`, `MAIL_STARTUP_DELAY_MS`; `toMailSyncItemDTO`, `toMailSyncRunDTO`; cliente: `MailImportSection`, `MailSyncResult`, `MAIL_OUTCOME_LABELS`, `MAIL_OUTCOME_COLORS`, `MailOutcomeColor`, `MailItemsSplit`, `mailRunSummary`, `splitMailItems`, `mailItemSecondary`, `mailIntervalLabel`.
- Quedan con nombre de Gmail: todo `server/src/gmail/*`, `gmailRouter` y `/api/gmail/*`, `gmailStatusDtoSchema`/`GmailStatusDTO`, `useGmailStatus`/`useGmailSync`, `gmailMissingVarsMessage`, `gmailLastRunLabel`, `GmailDisabledNotice`/`GmailSyncCard`/`GmailImportPanel`, `fakeGmailClient`.

- [ ] **Step 1: Línea de base**

```bash
bun install && bun run typecheck && bun run test
```

Expected: typecheck sin errores y todos los tests en verde. Anotar la cantidad de tests: tiene que ser la misma al final de esta task.

- [ ] **Step 2: Mover los archivos**

```bash
mkdir -p server/src/mail
git mv server/src/gmail/syncGmail.ts server/src/mail/syncMail.ts
git mv server/src/gmail/syncGmail.test.ts server/src/mail/syncMail.test.ts
git mv server/src/gmail/gmailJob.ts server/src/mail/mailJob.ts
git mv server/src/gmail/gmailJob.test.ts server/src/mail/mailJob.test.ts
git mv server/src/gmail/gmailMappers.ts server/src/mail/mailMappers.ts
git mv server/src/gmail/gmailMappers.test.ts server/src/mail/mailMappers.test.ts
git mv server/src/testing/gmailFixtures.ts server/src/testing/mailFixtures.ts
git mv client/src/gmailImport.ts client/src/mailImport.ts
git mv client/src/gmailImport.test.ts client/src/mailImport.test.ts
git mv client/src/components/GmailImportSection.tsx client/src/components/MailImportSection.tsx
git mv client/src/components/GmailImportSection.test.tsx client/src/components/MailImportSection.test.tsx
git mv client/src/components/GmailSyncResult.tsx client/src/components/MailSyncResult.tsx
```

- [ ] **Step 3: Renombrar identificadores y rutas de import**

```bash
FILES=$(git ls-files 'server/src/*.ts' 'shared/src/*.ts' 'client/src/*.ts' 'client/src/*.tsx')
perl -pi -e '
  s/\bGmail(SyncRun|Attachment)(Model|Doc)?\b/Mail$1$2/g;
  s/\bgmail(SyncRun|Attachment)Schema\b/mail$1Schema/g;
  s/\bGmailSync(Outcome|Trigger|ItemDTO|RunDTO)\b/MailSync$1/g;
  s/\bgmailSync(OutcomeSchema|TriggerSchema|ItemDtoSchema|RunDtoSchema)\b/mailSync$1/g;
  s/\btoGmailSync(ItemDTO|RunDTO)\b/toMailSync$1/g;
  s/\bsyncGmail\b/syncMail/g;
  s/\bSyncGmailDeps\b/SyncMailDeps/g;
  s/\brunGmailSync\b/runMailSync/g;
  s/\bfindLastGmailRun\b/findLastMailRun/g;
  s/\bGmailLedgerEntry\b/MailLedgerEntry/g;
  s/\bGMAIL_(LIST_LIMIT|MAX_MESSAGES_PER_RUN|STARTUP_DELAY_MS|OUTCOME_LABELS|OUTCOME_COLORS)\b/MAIL_$1/g;
  s/\bstartGmailJob\b/startMailJob/g;
  s/\bnextGmailRunDelayMs\b/nextMailRunDelayMs/g;
  s/\bformatGmailRunLog\b/formatMailRunLog/g;
  s/\bgmail(Mappers|Job|Fixtures|Import)\b/mail$1/g;
  s/\bGmail(ImportSection|SyncResult|SyncResultProps|ItemList|ItemListProps|ItemRow|ItemRowProps|OutcomeColor|ItemsSplit)\b/Mail$1/g;
  s/\bgmail(RunSummary|ItemSecondary|IntervalLabel)\b/mail$1/g;
  s/\bsplitGmailItems\b/splitMailItems/g;
' $FILES
perl -pi -e 's{"\./gmail(Client|Config)\.js"}{"../gmail/gmail$1.js"}g' server/src/mail/*.ts
perl -pi -e 's{gmail/(syncMail|mailJob)\.js}{mail/$1.js}g' server/src/http/routes/gmail.ts server/src/index.ts
```

- [ ] **Step 4: Verificar que no quedó nada a medio renombrar**

```bash
git grep -nE 'syncGmail|GmailSyncRun|GmailAttachment|GmailSync(Outcome|Trigger|ItemDTO)|gmail(Mappers|Job|Fixtures|Import)\b|GmailImportSection|GmailSyncResult|splitGmailItems|GMAIL_(LIST_LIMIT|MAX_MESSAGES|STARTUP|OUTCOME)' -- server/src shared/src client/src
```

Expected: sin salida.

- [ ] **Step 5: Typecheck y tests**

```bash
bun run typecheck && bun run test
```

Expected: verde, con la misma cantidad de tests que en el Step 1. Si `tsc` marca un import que quedó apuntando a `./gmail…`, corregir ese path (es un caso que el Step 3 no cubrió) y repetir.

Nota: las colecciones pasan a ser `mailsyncruns` y `mailattachments`. Las viejas `gmailsyncruns` y `gmailattachments` de la base compartida están vacías (verificado el 2026-10-05), no hay datos que migrar.

- [ ] **Step 6: Commit (solo si el usuario lo autorizó)**

```bash
git add -A -- server/src shared/src client/src
git commit -m "refactor: la sincronización de Gmail pasa a llamarse de mails, sin cambios de comportamiento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Corridas, registro y job por fuente

El motor deja de conocer a Gmail: trabaja con un `MailClient` que se abre por corrida, guarda la fuente en cada corrida y en cada adjunto, y une solo las corridas concurrentes de la misma fuente. Gmail se adapta con `gmailMailClient`. Las rutas siguen en `/api/gmail/*` hasta la Task 6.

**Files:**
- Create: `server/src/mail/mailClient.ts`, `server/src/mail/mailSourceSetup.ts`, `server/src/gmail/gmailSource.ts`, `server/src/gmail/gmailSource.test.ts`
- Modify: `shared/src/dtos.ts`, `shared/src/dtos.test.ts`, `server/src/db/models.ts`, `server/src/db/models.test.ts`, `server/src/mail/syncMail.ts`, `server/src/mail/syncMail.test.ts`, `server/src/mail/mailMappers.ts`, `server/src/mail/mailMappers.test.ts`, `server/src/mail/mailJob.ts`, `server/src/mail/mailJob.test.ts`, `server/src/testing/mailFixtures.ts`, `server/src/http/routes/gmail.ts`, `server/src/index.ts`, `client/src/mailImport.test.ts`, `client/src/components/MailImportSection.test.tsx`

**Interfaces:**
- Consumes: los nombres de la Task 2.
- Produces:

```ts
export const mailSourceSchema = z.enum(["gmail", "icloud"]);
export type MailSource = z.infer<typeof mailSourceSchema>;
export const MAIL_SOURCE_LABELS: Record<MailSource, string>;

export interface MailPdfPart { partId: string; fileName: string; size: number }
export interface MailMessage<P extends MailPdfPart = MailPdfPart> { id: string; receivedAt: string; pdfParts: P[] }
export interface MailClient<P extends MailPdfPart = MailPdfPart> {
  listMessageIds(limit: number): Promise<string[]>;
  getMessage(id: string): Promise<MailMessage<P>>;
  downloadPart(messageId: string, part: P): Promise<Uint8Array>;
  close(): Promise<void>;
}
export type OpenMailClient = () => Promise<MailClient>;

export interface MailSourceSetup {
  source: MailSource; missing: string[]; scope: string | null; intervalMinutes: number | null; openClient: OpenMailClient | null;
}

export function syncMail(deps: SyncMailDeps): Promise<MailSyncRunDTO>;
export function runMailSync(source: MailSource, openClient: OpenMailClient, trigger: MailSyncTrigger): Promise<MailSyncRunDTO>;
export function findLastMailRun(source: MailSource): Promise<MailSyncRunDTO | null>;
export function startMailJob(setup: MailSourceSetup): Promise<() => void>;
export function gmailMailClient(client: GmailClient, query: string): MailClient<GmailPdfPart>;
export function gmailSourceSetup(env: NodeJS.ProcessEnv): MailSourceSetup;
export function fakeMailClient<P extends MailPdfPart = GmailPdfPart>(messages: FakeMailMessage<P>[]): MailClient<P> & mocks;
```

`MailSyncRunDTO` suma `source: MailSource`.

- [ ] **Step 1: DTOs con fuente**

En `shared/src/dtos.ts`, antes de `export const mailSyncOutcomeSchema`:

```ts
export const mailSourceSchema = z.enum(["gmail", "icloud"]);
export const MAIL_SOURCE_LABELS: Record<MailSource, string> = { gmail: "Gmail", icloud: "iCloud" };
```

En `mailSyncRunDtoSchema`, como primer campo del `z.object({`:

```ts
  source: mailSourceSchema,
```

Junto a `export type MailSyncTrigger = …`:

```ts
export type MailSource = z.infer<typeof mailSourceSchema>;
```

En `shared/src/dtos.test.ts`: sumar `mailSyncRunDtoSchema` al import de `./dtos.js`; en el `lastRun` del test «valida un status habilitado con la última corrida», cambiar `trigger: "job", startedAt: "2026-10-03T14:05:00.000Z"` por `source: "gmail", trigger: "job", startedAt: "2026-10-03T14:05:00.000Z"`; y agregar al final:

```ts
describe("mailSyncRunDtoSchema", () => {
  const run = {
    source: "icloud", trigger: "job", startedAt: "2026-10-05T12:00:00.000Z", finishedAt: "2026-10-05T12:00:09.000Z",
    status: "ok", error: null, messagesChecked: 0, hasMore: false, items: [],
  };

  it("acepta las dos fuentes y rechaza otra", () => {
    expect(mailSyncRunDtoSchema.parse(run).source).toBe("icloud");
    expect(mailSyncRunDtoSchema.parse({ ...run, source: "gmail" }).source).toBe("gmail");
    expect(() => mailSyncRunDtoSchema.parse({ ...run, source: "yahoo" })).toThrow();
  });
});
```

- [ ] **Step 2: Modelos con fuente — test que falla**

En `server/src/db/models.test.ts`, reemplazar el helper `gmailAttachment` por:

```ts
const mailAttachment = (runId: Types.ObjectId, partId: string, source: string) => ({
  source, messageId: "msg-1", partId, runId, fileName: "resumen-sintetico.pdf", receivedAt: new Date("2026-09-28T10:00:00Z"),
  outcome: "skipped", detail: "Formato de resumen no reconocido", processedAt: new Date("2026-10-03T12:00:00Z"),
});
```

y reemplazar el test «cada adjunto de Gmail se registra una sola vez por mensaje y parte» por:

```ts
  it("cada adjunto se registra una sola vez por fuente, mensaje y parte", async () => {
    await MailAttachmentModel.init();
    const run = await MailSyncRunModel.create({
      source: "gmail", trigger: "manual", startedAt: new Date("2026-10-03T12:00:00Z"),
      finishedAt: new Date("2026-10-03T12:00:05Z"), status: "ok", messagesChecked: 1, hasMore: false,
    });
    expect(run.error).toBeNull();
    const attachment = await MailAttachmentModel.create(mailAttachment(run._id, "1", "gmail"));
    expect(attachment.kind).toBeNull();
    expect(attachment.documentId).toBeNull();
    await expect(MailAttachmentModel.create(mailAttachment(run._id, "1", "gmail"))).rejects.toThrow();
    await expect(MailAttachmentModel.create(mailAttachment(run._id, "2", "gmail"))).resolves.toBeDefined();
    await expect(MailAttachmentModel.create(mailAttachment(run._id, "1", "icloud"))).resolves.toBeDefined();
  });

  it("una corrida sin fuente o con una fuente desconocida se rechaza", async () => {
    const base = {
      trigger: "manual", startedAt: new Date("2026-10-03T12:00:00Z"), finishedAt: new Date("2026-10-03T12:00:05Z"),
      status: "ok", messagesChecked: 0, hasMore: false,
    };
    await expect(MailSyncRunModel.create(base)).rejects.toThrow();
    await expect(MailSyncRunModel.create({ ...base, source: "yahoo" })).rejects.toThrow();
  });
```

Run: `bunx vitest run server/src/db/models.test.ts`
Expected: FAIL (`icloud` choca con el índice único viejo y la corrida sin fuente se guarda).

- [ ] **Step 3: Modelos con fuente — implementación**

En `server/src/db/models.ts`, reemplazar los dos schemas de mail y el índice por:

```ts
const mailSyncRunSchema = new Schema({
  source: { type: String, required: true, enum: ["gmail", "icloud"] },
  trigger: { type: String, required: true, enum: ["manual", "job"] },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, required: true },
  status: { type: String, required: true, enum: ["ok", "error"] },
  error: { type: String, default: null },
  messagesChecked: { type: Number, required: true },
  hasMore: { type: Boolean, required: true },
});
mailSyncRunSchema.index({ source: 1, startedAt: -1 });

const mailAttachmentSchema = new Schema({
  source: { type: String, required: true, enum: ["gmail", "icloud"] },
  messageId: { type: String, required: true },
  partId: { type: String, required: true },
  runId: { type: Schema.Types.ObjectId, ref: "MailSyncRun", required: true, index: true },
  fileName: { type: String, required: true },
  receivedAt: { type: Date, required: true },
  outcome: { type: String, required: true, enum: ["imported", "duplicate", "skipped", "failed"] },
  kind: { type: String, enum: ["statement", "coupon", "auto", "payslip", null], default: null },
  documentId: { type: String, default: null },
  detail: { type: String, required: true },
  processedAt: { type: Date, required: true },
});
mailAttachmentSchema.index({ source: 1, messageId: 1, partId: 1 }, { unique: true });
```

Run: `bunx vitest run server/src/db/models.test.ts`
Expected: PASS.

- [ ] **Step 4: Interfaz `MailClient` y `MailSourceSetup`**

`server/src/mail/mailClient.ts`:

```ts
export interface MailPdfPart {
  partId: string;
  fileName: string;
  size: number;
}

export interface MailMessage<P extends MailPdfPart = MailPdfPart> {
  id: string;
  receivedAt: string;
  pdfParts: P[];
}

export interface MailClient<P extends MailPdfPart = MailPdfPart> {
  listMessageIds(limit: number): Promise<string[]>;
  getMessage(id: string): Promise<MailMessage<P>>;
  downloadPart(messageId: string, part: P): Promise<Uint8Array>;
  close(): Promise<void>;
}

export type OpenMailClient = () => Promise<MailClient>;
```

Los métodos van con sintaxis de método (no propiedades función) a propósito: así un `MailClient<GmailPdfPart>` se puede usar donde se espera un `MailClient`.

`server/src/mail/mailSourceSetup.ts`:

```ts
import type { MailSource } from "@ledgerly/shared";
import type { OpenMailClient } from "./mailClient.js";

export interface MailSourceSetup {
  source: MailSource;
  missing: string[];
  scope: string | null;
  intervalMinutes: number | null;
  openClient: OpenMailClient | null;
}
```

- [ ] **Step 5: Fixture `fakeMailClient`**

En `server/src/testing/mailFixtures.ts`, sumar a los imports `import type { MailClient, MailMessage, MailPdfPart } from "../mail/mailClient.js";` y agregar al final:

```ts
export interface FakeMailMessage<P extends MailPdfPart = GmailPdfPart> {
  id: string;
  receivedAt?: string;
  pdfParts: P[];
}

export function fakeMailClient<P extends MailPdfPart = GmailPdfPart>(messages: FakeMailMessage<P>[]) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return {
    listMessageIds: vi.fn(async (limit: number): Promise<string[]> => messages.map(({ id }) => id).slice(0, limit)),
    getMessage: vi.fn(async (id: string): Promise<MailMessage<P>> => {
      const message = byId.get(id);
      if (!message) throw new GmailApiError("Gmail respondió 404.");
      return { id, receivedAt: message.receivedAt ?? FAKE_RECEIVED_AT, pdfParts: message.pdfParts };
    }),
    downloadPart: vi.fn(async (messageId: string, part: P): Promise<Uint8Array> => fakePdfBytes(messageId, part.partId)),
    close: vi.fn(async (): Promise<void> => undefined),
  } satisfies MailClient<P>;
}
```

- [ ] **Step 6: Tests del motor por fuente — que fallen**

En `server/src/mail/syncMail.test.ts`:

1. Reemplazar el bloque desde `import { FAKE_RECEIVED_AT, fakeGmailClient, …` hasta `const QUERY = "has:attachment filename:pdf";` (incluye el `vi.mock` de `../gmail/gmailClient.js` y el import de `GmailConfig`) por:

```ts
import { FAKE_RECEIVED_AT, fakeMailClient, fakePdfBytes, pdfPart } from "../testing/mailFixtures.js";
import { GmailApiError, GmailAuthError } from "../gmail/gmailClient.js";
import { MailAttachmentModel, MailSyncRunModel } from "../db/models.js";
import { EncryptedPdfError, UnsupportedFormatError } from "../ingestion/errors.js";
import { MAX_PDF_BYTES, type ImportPdfInput, type ImportPdfOutcome } from "../import/importPdf.js";
import type { MailClient } from "./mailClient.js";
import {
  classifyImportError, findLastMailRun, MAIL_LIST_LIMIT, NO_PDF_PART_ID, runMailSync, selectPendingMessages, syncMail,
} from "./syncMail.js";

withDb();

const gmail = (client: MailClient) => ({ source: "gmail" as const, openClient: async () => client });
const icloud = (client: MailClient) => ({ source: "icloud" as const, openClient: async () => client });
```

2. Reemplazos mecánicos:

```bash
perl -pi -e '
  s/fakeGmailClient\(/fakeMailClient(/g;
  s/client, query: QUERY, /...gmail(client), /g;
  s/toHaveBeenCalledWith\(QUERY, MAIL_LIST_LIMIT\)/toHaveBeenCalledWith(MAIL_LIST_LIMIT)/g;
  s/findLastMailRun\(\)/findLastMailRun("gmail")/g;
' server/src/mail/syncMail.test.ts
```

3. Agregar al final del `describe("syncMail", …)`:

```ts
  it("guarda la fuente en la corrida y en el registro, y cierra el cliente", async () => {
    const client = fakeMailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "factura.pdf")] }]);
    const run = await syncMail({ ...icloud(client), trigger: "manual", importPdf: importByName({}) });
    expect(run.source).toBe("icloud");
    expect((await MailAttachmentModel.findOne())?.source).toBe("icloud");
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("el registro de una fuente no saltea los mails de la otra", async () => {
    const messages = [{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }];
    const importPdf = importByName({ "resumen-sintetico.pdf": statementOutcome("imported", "stmt-1") });
    await syncMail({ ...gmail(fakeMailClient(messages)), trigger: "manual", importPdf });
    const icloudClient = fakeMailClient(messages);
    const run = await syncMail({ ...icloud(icloudClient), trigger: "manual", importPdf });
    expect(icloudClient.getMessage).toHaveBeenCalledWith("msg-1");
    expect(run.messagesChecked).toBe(1);
    expect(await MailAttachmentModel.countDocuments()).toBe(2);
  });

  it("si no se puede abrir el cliente, la corrida queda en error", async () => {
    const run = await syncMail({
      source: "icloud", trigger: "job", importPdf: importByName({}),
      openClient: async () => {
        throw new Error("iCloud rechazó el usuario o la contraseña de app.");
      },
    });
    expect(run).toMatchObject({
      source: "icloud", status: "error", error: "iCloud rechazó el usuario o la contraseña de app.", messagesChecked: 0, items: [],
    });
  });

  it("cierra el cliente aunque la corrida falle, y un error al cerrar no la cambia", async () => {
    const client = fakeMailClient([]);
    client.listMessageIds.mockRejectedValueOnce(new Error("se cortó la conexión"));
    client.close.mockRejectedValueOnce(new Error("logout falló"));
    const run = await syncMail({ ...gmail(client), trigger: "manual", importPdf: importByName({}) });
    expect(run).toMatchObject({ status: "error", error: "se cortó la conexión" });
    expect(client.close).toHaveBeenCalledTimes(1);
  });
```

4. Agregar al final del `describe("findLastMailRun", …)`:

```ts
  it("solo mira las corridas de la fuente pedida", async () => {
    await syncMail({ ...icloud(fakeMailClient([])), trigger: "manual", importPdf: importByName({}) });
    expect(await findLastMailRun("gmail")).toBeNull();
    expect((await findLastMailRun("icloud"))?.source).toBe("icloud");
  });
```

5. Reemplazar todo el `describe("runMailSync", …)` por:

```ts
describe("runMailSync", () => {
  it("une las llamadas concurrentes de la misma fuente en una sola corrida", async () => {
    const openClient = vi.fn(async () => fakeMailClient([]));
    const manual = runMailSync("gmail", openClient, "manual");
    const job = runMailSync("gmail", openClient, "job");
    expect(job).toBe(manual);
    expect((await manual).trigger).toBe("manual");
    expect(openClient).toHaveBeenCalledTimes(1);
  });

  it("las corridas de fuentes distintas no se unen", async () => {
    const gmailRun = runMailSync("gmail", vi.fn(async () => fakeMailClient([])), "manual");
    const icloudRun = runMailSync("icloud", vi.fn(async () => fakeMailClient([])), "manual");
    expect(icloudRun).not.toBe(gmailRun);
    expect((await gmailRun).source).toBe("gmail");
    expect((await icloudRun).source).toBe("icloud");
  });

  it("cuando termina, la próxima llamada arranca otra corrida", async () => {
    const openClient = vi.fn(async () => fakeMailClient([]));
    await runMailSync("gmail", openClient, "manual");
    await runMailSync("gmail", openClient, "manual");
    expect(openClient).toHaveBeenCalledTimes(2);
    expect(await MailSyncRunModel.countDocuments()).toBe(2);
  });

  it("después de un rechazo, la próxima llamada arranca otra corrida", async () => {
    const openClient = vi.fn(async () => fakeMailClient([]));
    const create = vi.spyOn(MailSyncRunModel, "create").mockRejectedValueOnce(new Error("Mongo caído"));
    await expect(runMailSync("gmail", openClient, "manual")).rejects.toThrow("Mongo caído");
    create.mockRestore();
    const run = await runMailSync("gmail", openClient, "manual");
    expect(run.status).toBe("ok");
    expect(openClient).toHaveBeenCalledTimes(2);
  });
});
```

Run: `bunx vitest run server/src/mail/syncMail.test.ts`
Expected: FAIL (`syncMail` todavía espera `client` y `query`).

- [ ] **Step 7: Motor por fuente — implementación**

Reemplazar `server/src/mail/syncMail.ts` completo por:

```ts
import { Types } from "mongoose";
import type { ImportedFileKind, MailSource, MailSyncOutcome, MailSyncRunDTO, MailSyncTrigger } from "@ledgerly/shared";
import { MailAttachmentModel, MailSyncRunModel } from "../db/models.js";
import { IngestionError } from "../ingestion/errors.js";
import {
  importPdf as importPdfFile, MAX_PDF_BYTES, type ImportPdfInput, type ImportPdfOutcome,
} from "../import/importPdf.js";
import type { MailClient, MailMessage, MailPdfPart, OpenMailClient } from "./mailClient.js";
import { toMailSyncRunDTO } from "./mailMappers.js";

export const MAIL_LIST_LIMIT = 500;
export const MAIL_MAX_MESSAGES_PER_RUN = 50;
export const NO_PDF_PART_ID = "-";

const NO_PDF_FILE_NAME = "(sin PDF adjunto)";
const NO_PDF_DETAIL = "El mail no trae un PDF adjunto";
const TOO_BIG_DETAIL = "Supera el máximo de 15 MB";
const UNEXPECTED_ERROR = "Error inesperado";

export interface MailLedgerEntry {
  messageId: string;
  partId: string;
  outcome: MailSyncOutcome;
}

export interface SyncMailDeps {
  source: MailSource;
  openClient: OpenMailClient;
  trigger: MailSyncTrigger;
  importPdf?: (input: ImportPdfInput) => Promise<ImportPdfOutcome>;
  maxMessages?: number;
  now?: () => Date;
}

interface PendingSelection {
  batch: string[];
  hasMore: boolean;
}

interface ImportErrorOutcome {
  outcome: "skipped" | "failed";
  detail: string;
}

interface PartResult {
  outcome: MailSyncOutcome;
  kind: ImportedFileKind | null;
  documentId: string | null;
  detail: string;
}

interface ScanContext {
  source: MailSource;
  runId: Types.ObjectId;
  client: MailClient;
  importPdf: (input: ImportPdfInput) => Promise<ImportPdfOutcome>;
  now: () => Date;
}

interface RunContext extends ScanContext {
  settled: Set<string>;
}

interface RunProgress {
  messagesChecked: number;
  hasMore: boolean;
  error: string | null;
}

const NO_DOCUMENT = { kind: null, documentId: null } as const;

const errorMessage = (err: unknown): string => (err instanceof Error && err.message ? err.message : UNEXPECTED_ERROR);

const ledgerKey = (messageId: string, partId: string): string => `${messageId}/${partId}`;

export function selectPendingMessages(ids: string[], ledger: MailLedgerEntry[], max: number): PendingSelection {
  const outcomesByMessage = new Map<string, MailSyncOutcome[]>();
  for (const { messageId, outcome } of ledger) {
    outcomesByMessage.set(messageId, [...(outcomesByMessage.get(messageId) ?? []), outcome]);
  }
  const pending = ids.filter((id) => {
    const outcomes = outcomesByMessage.get(id);
    return !outcomes || outcomes.includes("failed");
  });
  return { batch: pending.slice(0, max), hasMore: pending.length > max };
}

export function classifyImportError(err: unknown): ImportErrorOutcome {
  if (err instanceof IngestionError) return { outcome: "skipped", detail: err.message };
  return { outcome: "failed", detail: errorMessage(err) };
}

const readLedger = async (source: MailSource, ids: string[]): Promise<MailLedgerEntry[]> => {
  const docs = await MailAttachmentModel.find(
    { source, messageId: { $in: ids } }, { messageId: 1, partId: 1, outcome: 1 },
  ).lean();
  return docs.map(({ messageId, partId, outcome }) => ({ messageId, partId, outcome: outcome as MailSyncOutcome }));
};

const settledKeys = (ledger: MailLedgerEntry[]): Set<string> =>
  new Set(ledger.filter(({ outcome }) => outcome !== "failed").map(({ messageId, partId }) => ledgerKey(messageId, partId)));

const recordPart = async (
  ctx: RunContext, message: MailMessage, partId: string, fileName: string, result: PartResult,
): Promise<void> => {
  await MailAttachmentModel.updateOne(
    { source: ctx.source, messageId: message.id, partId },
    { $set: { runId: ctx.runId, fileName, receivedAt: new Date(message.receivedAt), ...result, processedAt: ctx.now() } },
    { upsert: true },
  );
};

const importPart = async (ctx: RunContext, data: Uint8Array, fileName: string): Promise<PartResult> => {
  try {
    const { result, file } = await ctx.importPdf({ data, fileName });
    return { outcome: result.status, kind: result.kind, documentId: file.id, detail: file.description };
  } catch (err) {
    return { ...classifyImportError(err), ...NO_DOCUMENT };
  }
};

const downloadPart = async (ctx: RunContext, message: MailMessage, part: MailPdfPart): Promise<Uint8Array> => {
  try {
    return await ctx.client.downloadPart(message.id, part);
  } catch (err) {
    await recordPart(ctx, message, part.partId, part.fileName, { outcome: "failed", detail: errorMessage(err), ...NO_DOCUMENT });
    throw err;
  }
};

const processPart = async (ctx: RunContext, message: MailMessage, part: MailPdfPart): Promise<PartResult> => {
  if (part.size > MAX_PDF_BYTES) return { outcome: "skipped", detail: TOO_BIG_DETAIL, ...NO_DOCUMENT };
  const data = await downloadPart(ctx, message, part);
  return importPart(ctx, data, part.fileName);
};

const processMessage = async (ctx: RunContext, message: MailMessage): Promise<void> => {
  if (message.pdfParts.length === 0) {
    await recordPart(ctx, message, NO_PDF_PART_ID, NO_PDF_FILE_NAME, { outcome: "skipped", detail: NO_PDF_DETAIL, ...NO_DOCUMENT });
    return;
  }
  for (const part of message.pdfParts) {
    if (ctx.settled.has(ledgerKey(message.id, part.partId))) continue;
    await recordPart(ctx, message, part.partId, part.fileName, await processPart(ctx, message, part));
  }
};

const scanMailbox = async (scan: ScanContext, maxMessages: number, progress: RunProgress): Promise<void> => {
  const ids = await scan.client.listMessageIds(MAIL_LIST_LIMIT);
  const ledger = await readLedger(scan.source, ids);
  const { batch, hasMore } = selectPendingMessages(ids, ledger, maxMessages);
  const ctx: RunContext = { ...scan, settled: settledKeys(ledger) };
  progress.hasMore = hasMore;
  for (const messageId of batch) {
    const message = await ctx.client.getMessage(messageId);
    progress.messagesChecked += 1;
    await processMessage(ctx, message);
  }
};

const closeQuietly = async (client: MailClient | null): Promise<void> => {
  await client?.close().catch(() => undefined);
};

const itemsOf = (runId: Types.ObjectId) => MailAttachmentModel.find({ runId }).sort({ processedAt: 1, _id: 1 });

export async function syncMail({
  source, openClient, trigger, importPdf = importPdfFile, maxMessages = MAIL_MAX_MESSAGES_PER_RUN, now = () => new Date(),
}: SyncMailDeps): Promise<MailSyncRunDTO> {
  const runId = new Types.ObjectId();
  const startedAt = now();
  const progress: RunProgress = { messagesChecked: 0, hasMore: false, error: null };
  let client: MailClient | null = null;
  try {
    client = await openClient();
    await scanMailbox({ source, runId, client, importPdf, now }, maxMessages, progress);
  } catch (err) {
    progress.error = errorMessage(err);
  }
  await closeQuietly(client);
  const run = await MailSyncRunModel.create({
    _id: runId,
    source,
    trigger,
    startedAt,
    finishedAt: now(),
    status: progress.error ? "error" : "ok",
    error: progress.error,
    messagesChecked: progress.messagesChecked,
    hasMore: progress.hasMore,
  });
  return toMailSyncRunDTO(run, await itemsOf(runId));
}

const inFlight = new Map<MailSource, Promise<MailSyncRunDTO>>();

export function runMailSync(source: MailSource, openClient: OpenMailClient, trigger: MailSyncTrigger): Promise<MailSyncRunDTO> {
  const current = inFlight.get(source);
  if (current) return current;
  const tracked = syncMail({ source, openClient, trigger }).finally(() => {
    inFlight.delete(source);
  });
  inFlight.set(source, tracked);
  return tracked;
}

export async function findLastMailRun(source: MailSource): Promise<MailSyncRunDTO | null> {
  const run = await MailSyncRunModel.findOne({ source }).sort({ startedAt: -1 });
  return run ? toMailSyncRunDTO(run, await itemsOf(run._id)) : null;
}
```

En `server/src/mail/mailMappers.ts`, en `toMailSyncRunDTO`, sumar como primera propiedad del objeto devuelto:

```ts
    source: run.source as MailSyncRunDTO["source"],
```

En `server/src/mail/mailMappers.test.ts`:

```bash
perl -pi -e 's/^  messageId: "msg-1", partId: "1", runId:/  source: "gmail", messageId: "msg-1", partId: "1", runId:/; s/(\s)trigger: "job", startedAt:/$1source: "gmail", trigger: "job", startedAt:/g' server/src/mail/mailMappers.test.ts
```

Run: `bunx vitest run server/src/mail/syncMail.test.ts server/src/mail/mailMappers.test.ts`
Expected: PASS.

- [ ] **Step 8: Adaptador de Gmail — test que falla**

`server/src/gmail/gmailSource.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeGmailClient, pdfPart } from "../testing/mailFixtures.js";

vi.mock("./gmailClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./gmailClient.js")>()),
  createGmailClient: vi.fn(),
}));
import { createGmailClient } from "./gmailClient.js";
import { gmailMailClient, gmailSourceSetup } from "./gmailSource.js";

const CREDENTIALS = {
  GMAIL_CLIENT_ID: "id-sintetico", GMAIL_CLIENT_SECRET: "secreto-sintetico", GMAIL_REFRESH_TOKEN: "refresh-sintetico",
};

beforeEach(() => {
  vi.mocked(createGmailClient).mockReset();
});

describe("gmailMailClient", () => {
  it("lista con la consulta fija y delega lectura y descarga", async () => {
    const raw = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]);
    const client = gmailMailClient(raw, "from:banco has:attachment");
    expect(await client.listMessageIds(7)).toEqual(["msg-1"]);
    expect(raw.listMessageIds).toHaveBeenCalledWith("from:banco has:attachment", 7);
    const message = await client.getMessage("msg-1");
    await client.downloadPart("msg-1", message.pdfParts[0]);
    expect(raw.downloadPart).toHaveBeenCalledWith("msg-1", message.pdfParts[0]);
    await expect(client.close()).resolves.toBeUndefined();
  });
});

describe("gmailSourceSetup", () => {
  it("sin credenciales queda deshabilitada, con lo que falta y sin cliente", () => {
    expect(gmailSourceSetup({})).toEqual({
      source: "gmail", missing: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
      scope: null, intervalMinutes: null, openClient: null,
    });
  });

  it("con credenciales informa consulta e intervalo, y crea el cliente recién al abrir", async () => {
    const raw = fakeGmailClient([]);
    vi.mocked(createGmailClient).mockReturnValue(raw);
    const setup = gmailSourceSetup({
      ...CREDENTIALS, GMAIL_QUERY: "from:banco has:attachment", GMAIL_SYNC_INTERVAL_MINUTES: "360",
    });
    expect(setup).toMatchObject({ source: "gmail", missing: [], scope: "from:banco has:attachment", intervalMinutes: 360 });
    expect(createGmailClient).not.toHaveBeenCalled();
    const client = await setup.openClient?.();
    await client?.listMessageIds(3);
    expect(createGmailClient).toHaveBeenCalledWith({
      clientId: "id-sintetico", clientSecret: "secreto-sintetico", refreshToken: "refresh-sintetico",
    });
    expect(raw.listMessageIds).toHaveBeenCalledWith("from:banco has:attachment", 3);
  });
});
```

Run: `bunx vitest run server/src/gmail/gmailSource.test.ts`
Expected: FAIL («Cannot find module './gmailSource.js'»).

- [ ] **Step 9: Adaptador de Gmail — implementación**

`server/src/gmail/gmailSource.ts`:

```ts
import type { MailClient } from "../mail/mailClient.js";
import type { MailSourceSetup } from "../mail/mailSourceSetup.js";
import { createGmailClient, type GmailClient, type GmailPdfPart } from "./gmailClient.js";
import { missingGmailVars, readGmailConfig } from "./gmailConfig.js";

export function gmailMailClient(client: GmailClient, query: string): MailClient<GmailPdfPart> {
  return {
    listMessageIds: (limit) => client.listMessageIds(query, limit),
    getMessage: (id) => client.getMessage(id),
    downloadPart: (messageId, part) => client.downloadPart(messageId, part),
    close: async () => undefined,
  };
}

export function gmailSourceSetup(env: NodeJS.ProcessEnv): MailSourceSetup {
  const config = readGmailConfig(env);
  if (!config) {
    return { source: "gmail", missing: missingGmailVars(env), scope: null, intervalMinutes: null, openClient: null };
  }
  const { credentials, query, intervalMinutes } = config;
  return {
    source: "gmail",
    missing: [],
    scope: query,
    intervalMinutes,
    openClient: async () => gmailMailClient(createGmailClient(credentials), query),
  };
}
```

Run: `bunx vitest run server/src/gmail/gmailSource.test.ts`
Expected: PASS.

- [ ] **Step 10: Job por fuente — tests que fallan**

En `server/src/mail/mailJob.test.ts`:

1. Cambiar `import type { GmailConfig } from "../gmail/gmailConfig.js";` por `import type { MailSourceSetup } from "./mailSourceSetup.js";`.
2. Reemplazar la función `config` por:

```ts
const openClient = vi.fn();

const setup = (intervalMinutes: number | null, overrides: Partial<MailSourceSetup> = {}): MailSourceSetup => ({
  source: "gmail", missing: [], scope: "has:attachment", intervalMinutes, openClient, ...overrides,
});
```

3. En `runOf`, cambiar `trigger: "job", startedAt: NOW.toISOString(),` por `source: "gmail", trigger: "job", startedAt: NOW.toISOString(),`.
4. Reemplazos:

```bash
perl -pi -e 's/startMailJob\(config\(/startMailJob(setup(/g; s/toHaveBeenCalledWith\(config\(360\), "job"\)/toHaveBeenCalledWith("gmail", openClient, "job")/g' server/src/mail/mailJob.test.ts
```

5. Agregar al `describe("formatMailRunLog", …)`:

```ts
  it("usa el nombre de la fuente", () => {
    expect(formatMailRunLog(runOf({ source: "icloud", status: "error", error: "x" }))).toBe("iCloud (automática): error — x");
  });
```

6. Agregar al `describe("startMailJob", …)`:

```ts
  it("una fuente sin configurar no programa nada", async () => {
    await startMailJob(setup(360, { openClient: null, missing: ["GMAIL_REFRESH_TOKEN"] }));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS + 720 * MINUTE);
    expect(runMailSync).not.toHaveBeenCalled();
    expect(findLastMailRun).not.toHaveBeenCalled();
  });

  it("mira la última corrida de su propia fuente y corre esa fuente", async () => {
    const stop = await startMailJob(setup(360, { source: "icloud" }));
    expect(findLastMailRun).toHaveBeenCalledWith("icloud");
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(runMailSync).toHaveBeenCalledWith("icloud", openClient, "job");
    stop();
  });
```

Run: `bunx vitest run server/src/mail/mailJob.test.ts`
Expected: FAIL (`startMailJob` todavía espera un `GmailConfig`).

- [ ] **Step 11: Job por fuente — implementación**

Reemplazar `server/src/mail/mailJob.ts` completo por:

```ts
import {
  MAIL_SOURCE_LABELS, type MailSource, type MailSyncOutcome, type MailSyncRunDTO, type MailSyncTrigger,
} from "@ledgerly/shared";
import type { MailSourceSetup } from "./mailSourceSetup.js";
import { findLastMailRun, runMailSync } from "./syncMail.js";

export const MAIL_STARTUP_DELAY_MS = 60_000;
const MINUTE_MS = 60_000;
const UNEXPECTED_ERROR = "Error inesperado";

const TRIGGER_LOG_LABELS: Record<MailSyncTrigger, string> = { manual: "manual", job: "automática" };

export function nextMailRunDelayMs(lastStartedAt: Date | null, intervalMinutes: number, now: Date): number {
  if (!lastStartedAt) return MAIL_STARTUP_DELAY_MS;
  const dueInMs = lastStartedAt.getTime() + intervalMinutes * MINUTE_MS - now.getTime();
  return Math.max(MAIL_STARTUP_DELAY_MS, dueInMs);
}

const countOf = (run: MailSyncRunDTO, outcome: MailSyncOutcome): number =>
  run.items.filter((item) => item.outcome === outcome).length;

const mailsLabel = (count: number): string => (count === 1 ? "1 mail nuevo" : `${count} mails nuevos`);

const logPrefix = (source: MailSource, trigger: MailSyncTrigger): string =>
  `${MAIL_SOURCE_LABELS[source]} (${TRIGGER_LOG_LABELS[trigger]})`;

export function formatMailRunLog(run: MailSyncRunDTO): string {
  const prefix = logPrefix(run.source, run.trigger);
  if (run.status === "error") return `${prefix}: error — ${run.error ?? UNEXPECTED_ERROR}`;
  const counts = [
    `importados ${countOf(run, "imported")}`,
    `ya estaban ${countOf(run, "duplicate")}`,
    `omitidos ${countOf(run, "skipped")}`,
    `con error ${countOf(run, "failed")}`,
  ];
  return `${prefix}: ${[mailsLabel(run.messagesChecked), ...counts].join(" · ")}`;
}

const logRun = (run: MailSyncRunDTO): void => {
  const line = formatMailRunLog(run);
  if (run.status === "error") console.error(line);
  else console.log(line);
};

const lastStartedAt = async (source: MailSource): Promise<Date | null> => {
  try {
    const run = await findLastMailRun(source);
    return run ? new Date(run.startedAt) : null;
  } catch {
    return null;
  }
};

export async function startMailJob(setup: MailSourceSetup): Promise<() => void> {
  const { source, intervalMinutes, openClient } = setup;
  if (intervalMinutes === null || openClient === null) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const runOnce = async (): Promise<void> => {
    try {
      logRun(await runMailSync(source, openClient, "job"));
    } catch (err) {
      console.error(`${logPrefix(source, "job")}: error — ${err instanceof Error ? err.message : UNEXPECTED_ERROR}`);
    }
    schedule(intervalMinutes * MINUTE_MS);
  };

  const schedule = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      void runOnce();
    }, delayMs);
    timer.unref();
  };

  schedule(nextMailRunDelayMs(await lastStartedAt(source), intervalMinutes, new Date()));

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
```

Run: `bunx vitest run server/src/mail/mailJob.test.ts`
Expected: PASS.

- [ ] **Step 12: Ruta de Gmail y arranque**

Reemplazar `server/src/http/routes/gmail.ts` completo por:

```ts
import { Router } from "express";
import type { GmailStatusDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { missingGmailVars, readGmailConfig } from "../../gmail/gmailConfig.js";
import { gmailSourceSetup } from "../../gmail/gmailSource.js";
import { findLastMailRun, runMailSync } from "../../mail/syncMail.js";

export const gmailRouter = Router();

gmailRouter.get("/status", asyncHandler(async (_req, res) => {
  const config = readGmailConfig(process.env);
  const status: GmailStatusDTO = {
    enabled: config !== null,
    missing: missingGmailVars(process.env),
    query: config?.query ?? null,
    intervalMinutes: config?.intervalMinutes ?? null,
    lastRun: await findLastMailRun("gmail"),
  };
  res.json(status);
}));

gmailRouter.post("/sync", asyncHandler(async (_req, res) => {
  const setup = gmailSourceSetup(process.env);
  if (!setup.openClient) {
    throw new HttpError(409, `Gmail no está configurado: faltan ${setup.missing.join(", ")}`);
  }
  res.json(await runMailSync("gmail", setup.openClient, "manual"));
}));
```

En `server/src/index.ts`, cambiar `import { describeGmailSetup, readGmailConfig } from "./gmail/gmailConfig.js";` por:

```ts
import { describeGmailSetup } from "./gmail/gmailConfig.js";
import { gmailSourceSetup } from "./gmail/gmailSource.js";
```

y reemplazar las tres últimas líneas (`console.log(describeGmailSetup…)`, `const gmailConfig = …` y el `if (gmailConfig?.intervalMinutes) …`) por:

```ts
console.log(describeGmailSetup(process.env));
await startMailJob(gmailSourceSetup(process.env));
```

- [ ] **Step 13: Fixtures del cliente con fuente**

```bash
perl -pi -e 's/^  trigger: "manual", startedAt: "2026-10-03T17:05:00\.000Z"/  source: "gmail", trigger: "manual", startedAt: "2026-10-03T17:05:00.000Z"/' client/src/mailImport.test.ts client/src/components/MailImportSection.test.tsx
```

- [ ] **Step 14: Suite completa**

```bash
bun run typecheck && bun run test
```

Expected: verde. `server/src/http/routes/gmail.test.ts` pasa sin cambios: la respuesta trae `source: "gmail"` y el schema lo valida.

- [ ] **Step 15: Commit (solo si el usuario lo autorizó)**

```bash
git add -- shared/src/dtos.ts shared/src/dtos.test.ts server/src/db/models.ts server/src/db/models.test.ts \
  server/src/mail server/src/gmail/gmailSource.ts server/src/gmail/gmailSource.test.ts server/src/testing/mailFixtures.ts \
  server/src/http/routes/gmail.ts server/src/index.ts client/src/mailImport.test.ts client/src/components/MailImportSection.test.tsx
git commit -m "feat(server): las corridas y el registro de mails se guardan por fuente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Configuración de iCloud y contraseña en el Llavero

Lectura del entorno (`ICLOUD_*`), la ventana de búsqueda, el texto del log y el acceso al Llavero, sin red ni IMAP. El parseo del intervalo pasa a un módulo común para Gmail e iCloud.

**Files:**
- Create: `server/src/mail/syncInterval.ts`, `server/src/mail/syncInterval.test.ts`, `server/src/icloud/icloudErrors.ts`, `server/src/icloud/keychain.ts`, `server/src/icloud/keychain.test.ts`, `server/src/icloud/icloudConfig.ts`, `server/src/icloud/icloudConfig.test.ts`
- Modify: `server/src/gmail/gmailConfig.ts`, `server/src/gmail/gmailConfig.test.ts`

**Interfaces:**
- Produces:

```ts
export const MIN_SYNC_INTERVAL_MINUTES = 15;
export function parseSyncInterval(raw: string | undefined): number | null;

export class IcloudAuthError extends Error {}
export class IcloudApiError extends Error {}
export const ICLOUD_MISSING_PASSWORD_MESSAGE: string;
export const ICLOUD_AUTH_FAILED_MESSAGE: string;

export const KEYCHAIN_SERVICE = "ledgerly-icloud-imap";
export type RunCommand = (file: string, args: string[]) => Promise<string>;
export interface KeychainDeps { run?: RunCommand; platform?: NodeJS.Platform }
export function hasIcloudPassword(user: string, deps?: KeychainDeps): Promise<boolean>;
export function readIcloudPassword(user: string, deps?: KeychainDeps): Promise<string>;

export const ICLOUD_HOST = "imap.mail.me.com";
export const ICLOUD_PORT = 993;
export const ICLOUD_USER_VAR = "ICLOUD_USER";
export const ICLOUD_PASSWORD_MISSING = "la contraseña de app en el Llavero";
export interface IcloudConfig {
  user: string; since: string | null; sinceInvalid: boolean; mailboxes: string[];
  intervalMinutes: number | null; intervalInvalid: boolean;
}
export function readIcloudConfig(env: NodeJS.ProcessEnv): IcloudConfig | null;
export function parseIcloudSince(raw: string): string | null;
export function parseIcloudMailboxes(raw: string): string[];
export function icloudSearchSince(config: Pick<IcloudConfig, "since">, now: Date): Date;
export function icloudScopeLabel(config: Pick<IcloudConfig, "since" | "mailboxes">): string;
export function describeIcloudSetup(config: IcloudConfig | null, hasPassword: boolean): string;
```

- [ ] **Step 1: Intervalo común — test**

`server/src/mail/syncInterval.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MIN_SYNC_INTERVAL_MINUTES, parseSyncInterval } from "./syncInterval.js";

describe("parseSyncInterval", () => {
  it.each([
    [undefined, null],
    ["", null],
    ["360", 360],
    [" 90 ", 90],
    ["abc", null],
    ["5", null],
    ["0", null],
    ["15", 15],
    ["90.5", null],
    ["-30", null],
  ])("%j → %j", (raw, expected) => {
    expect(parseSyncInterval(raw)).toBe(expected);
  });

  it("el mínimo es de 15 minutos", () => {
    expect(MIN_SYNC_INTERVAL_MINUTES).toBe(15);
  });
});
```

En `server/src/gmail/gmailConfig.test.ts`: sacar `parseGmailInterval` del import y borrar el `describe("parseGmailInterval", …)` entero (los casos se mudaron arriba).

Run: `bunx vitest run server/src/mail/syncInterval.test.ts`
Expected: FAIL («Cannot find module './syncInterval.js'»).

- [ ] **Step 2: Intervalo común — implementación**

`server/src/mail/syncInterval.ts`:

```ts
export const MIN_SYNC_INTERVAL_MINUTES = 15;

const INTEGER = /^\d+$/;

export function parseSyncInterval(raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (!INTEGER.test(value)) return null;
  const minutes = Number(value);
  return minutes >= MIN_SYNC_INTERVAL_MINUTES ? minutes : null;
}
```

En `server/src/gmail/gmailConfig.ts`: borrar `export const MIN_GMAIL_INTERVAL_MINUTES = 15;`, `const INTEGER = /^\d+$/;` y la función `parseGmailInterval`; sumar `import { MIN_SYNC_INTERVAL_MINUTES, parseSyncInterval } from "../mail/syncInterval.js";` y correr:

```bash
perl -pi -e 's/\bparseGmailInterval\(/parseSyncInterval(/g; s/\bMIN_GMAIL_INTERVAL_MINUTES\b/MIN_SYNC_INTERVAL_MINUTES/g' server/src/gmail/gmailConfig.ts
```

Run: `bunx vitest run server/src/mail/syncInterval.test.ts server/src/gmail/gmailConfig.test.ts`
Expected: PASS.

- [ ] **Step 3: Llavero — test que falla**

`server/src/icloud/keychain.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { hasIcloudPassword, readIcloudPassword } from "./keychain.js";
import { IcloudAuthError, ICLOUD_MISSING_PASSWORD_MESSAGE } from "./icloudErrors.js";

const USER = "usuario-sintetico@icloud.com";
const LOOKUP = ["find-generic-password", "-s", "ledgerly-icloud-imap", "-a", USER];

describe("hasIcloudPassword", () => {
  it("busca el ítem por servicio y cuenta, sin pedir la contraseña", async () => {
    const run = vi.fn(async () => "keychain: \"/Users/x/Library/Keychains/login.keychain-db\"");
    expect(await hasIcloudPassword(USER, { run, platform: "darwin" })).toBe(true);
    expect(run).toHaveBeenCalledWith("/usr/bin/security", LOOKUP);
  });

  it("si security falla, no hay contraseña", async () => {
    const run = vi.fn(async (): Promise<string> => {
      throw new Error("The specified item could not be found in the keychain.");
    });
    expect(await hasIcloudPassword(USER, { run, platform: "darwin" })).toBe(false);
  });

  it("fuera de macOS no hay contraseña y no corre nada", async () => {
    const run = vi.fn(async () => "");
    expect(await hasIcloudPassword(USER, { run, platform: "linux" })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("readIcloudPassword", () => {
  it("la lee con -w y le saca el salto de línea", async () => {
    const run = vi.fn(async () => "abcd-efgh-ijkl-mnop\n");
    expect(await readIcloudPassword(USER, { run, platform: "darwin" })).toBe("abcd-efgh-ijkl-mnop");
    expect(run).toHaveBeenCalledWith("/usr/bin/security", [...LOOKUP, "-w"]);
  });

  it("si security falla tira IcloudAuthError con los pasos y sin la salida del comando", async () => {
    const run = vi.fn(async (): Promise<string> => {
      throw new Error("security: SecKeychainSearchCopyNext: dato-filtrado-sintetico");
    });
    const error = await readIcloudPassword(USER, { run, platform: "darwin" }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(IcloudAuthError);
    expect((error as Error).message).toBe(ICLOUD_MISSING_PASSWORD_MESSAGE);
    expect((error as Error).message).not.toContain("dato-filtrado-sintetico");
  });

  it("una contraseña vacía cuenta como faltante", async () => {
    const run = vi.fn(async () => "  \n");
    await expect(readIcloudPassword(USER, { run, platform: "darwin" })).rejects.toThrow(ICLOUD_MISSING_PASSWORD_MESSAGE);
  });

  it("fuera de macOS tira el mismo error sin correr nada", async () => {
    const run = vi.fn(async () => "abcd-efgh-ijkl-mnop");
    await expect(readIcloudPassword(USER, { run, platform: "linux" })).rejects.toBeInstanceOf(IcloudAuthError);
    expect(run).not.toHaveBeenCalled();
  });
});
```

Run: `bunx vitest run server/src/icloud/keychain.test.ts`
Expected: FAIL («Cannot find module './keychain.js'»).

- [ ] **Step 4: Llavero — implementación**

`server/src/icloud/icloudErrors.ts`:

```ts
export const ICLOUD_MISSING_PASSWORD_MESSAGE =
  "Falta la contraseña de app de iCloud en el Llavero (ledgerly-icloud-imap). Los pasos están en el README, sección «Importar desde iCloud».";
export const ICLOUD_AUTH_FAILED_MESSAGE =
  "iCloud rechazó el usuario o la contraseña de app. Generá una nueva en account.apple.com y actualizala en el Llavero (ledgerly-icloud-imap).";

export class IcloudAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcloudAuthError";
  }
}

export class IcloudApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcloudApiError";
  }
}
```

`server/src/icloud/keychain.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { IcloudAuthError, ICLOUD_MISSING_PASSWORD_MESSAGE } from "./icloudErrors.js";

export const KEYCHAIN_SERVICE = "ledgerly-icloud-imap";

const SECURITY_BIN = "/usr/bin/security";

export type RunCommand = (file: string, args: string[]) => Promise<string>;

export interface KeychainDeps {
  run?: RunCommand;
  platform?: NodeJS.Platform;
}

const execFileAsync = promisify(execFile);

const runCommand: RunCommand = async (file, args) => (await execFileAsync(file, args)).stdout;

const lookupArgs = (user: string): string[] => ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", user];

export async function hasIcloudPassword(
  user: string, { run = runCommand, platform = process.platform }: KeychainDeps = {},
): Promise<boolean> {
  if (platform !== "darwin") return false;
  try {
    await run(SECURITY_BIN, lookupArgs(user));
    return true;
  } catch {
    return false;
  }
}

export async function readIcloudPassword(
  user: string, { run = runCommand, platform = process.platform }: KeychainDeps = {},
): Promise<string> {
  const missing = new IcloudAuthError(ICLOUD_MISSING_PASSWORD_MESSAGE);
  if (platform !== "darwin") throw missing;
  const output = await run(SECURITY_BIN, [...lookupArgs(user), "-w"]).catch(() => {
    throw missing;
  });
  const password = output.trim();
  if (!password) throw missing;
  return password;
}
```

Run: `bunx vitest run server/src/icloud/keychain.test.ts`
Expected: PASS.

- [ ] **Step 5: Configuración — test que falla**

`server/src/icloud/icloudConfig.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  describeIcloudSetup, icloudScopeLabel, icloudSearchSince, parseIcloudMailboxes, parseIcloudSince, readIcloudConfig,
} from "./icloudConfig.js";

const USER = "usuario-sintetico@icloud.com";
const DAY_MS = 86_400_000;

describe("readIcloudConfig", () => {
  it("sin ICLOUD_USER no hay configuración", () => {
    expect(readIcloudConfig({})).toBeNull();
    expect(readIcloudConfig({ ICLOUD_USER: "   " })).toBeNull();
  });

  it("con solo la cuenta usa INBOX, la ventana por defecto y búsqueda manual", () => {
    expect(readIcloudConfig({ ICLOUD_USER: ` ${USER} ` })).toEqual({
      user: USER, since: null, sinceInvalid: false, mailboxes: ["INBOX"], intervalMinutes: null, intervalInvalid: false,
    });
  });

  it("lee fecha, carpetas e intervalo", () => {
    expect(readIcloudConfig({
      ICLOUD_USER: USER, ICLOUD_SINCE: "2026-09-01", ICLOUD_MAILBOXES: " INBOX , Bancos,,Bancos ",
      ICLOUD_SYNC_INTERVAL_MINUTES: "360",
    })).toEqual({
      user: USER, since: "2026-09-01", sinceInvalid: false, mailboxes: ["INBOX", "Bancos"], intervalMinutes: 360, intervalInvalid: false,
    });
  });

  it("marca la fecha y el intervalo inválidos", () => {
    expect(readIcloudConfig({ ICLOUD_USER: USER, ICLOUD_SINCE: "01/09/2026", ICLOUD_SYNC_INTERVAL_MINUTES: "5" }))
      .toMatchObject({ since: null, sinceInvalid: true, intervalMinutes: null, intervalInvalid: true });
  });
});

describe("parseIcloudSince", () => {
  it.each([
    ["2026-09-01", "2026-09-01"],
    ["2024-02-29", "2024-02-29"],
    ["2026-02-29", null],
    ["2026-13-01", null],
    ["2026-9-1", null],
    ["", null],
  ])("%j → %j", (raw, expected) => {
    expect(parseIcloudSince(raw)).toBe(expected);
  });
});

describe("parseIcloudMailboxes", () => {
  it("vacío vuelve a INBOX", () => {
    expect(parseIcloudMailboxes("")).toEqual(["INBOX"]);
    expect(parseIcloudMailboxes(" , ")).toEqual(["INBOX"]);
  });
});

describe("icloudSearchSince", () => {
  it("con fecha usa la medianoche local de ese día", () => {
    expect(icloudSearchSince({ since: "2026-09-01" }, new Date(2026, 9, 5, 12))).toEqual(new Date(2026, 8, 1));
  });

  it("sin fecha mira 90 días hacia atrás desde ahora", () => {
    const now = new Date(2026, 9, 5, 12);
    expect(icloudSearchSince({ since: null }, now)).toEqual(new Date(now.getTime() - 90 * DAY_MS));
  });
});

describe("icloudScopeLabel", () => {
  it("nombra las carpetas y la ventana", () => {
    expect(icloudScopeLabel({ since: "2026-09-01", mailboxes: ["INBOX"] })).toBe("INBOX · desde el 01/09/2026");
    expect(icloudScopeLabel({ since: null, mailboxes: ["INBOX", "Bancos"] })).toBe("INBOX, Bancos · últimos 90 días");
  });
});

describe("describeIcloudSetup", () => {
  it("dice qué falta", () => {
    expect(describeIcloudSetup(null, false)).toBe("iCloud: deshabilitado (falta ICLOUD_USER)");
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), false))
      .toBe("iCloud: deshabilitado (falta la contraseña de app en el Llavero)");
  });

  it("describe la búsqueda automática o manual con su alcance", () => {
    expect(describeIcloudSetup(readIcloudConfig({
      ICLOUD_USER: USER, ICLOUD_SINCE: "2026-09-01", ICLOUD_SYNC_INTERVAL_MINUTES: "360",
    }), true)).toBe("iCloud: búsqueda automática cada 360 min (INBOX · desde el 01/09/2026)");
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), true))
      .toBe("iCloud: búsqueda manual; automática apagada (INBOX · últimos 90 días)");
  });

  it("avisa los valores inválidos", () => {
    expect(describeIcloudSetup(readIcloudConfig({
      ICLOUD_USER: USER, ICLOUD_SINCE: "ayer", ICLOUD_SYNC_INTERVAL_MINUTES: "5",
    }), true)).toBe(
      "iCloud: búsqueda manual; automática apagada (INBOX · últimos 90 días); ICLOUD_SINCE inválido (AAAA-MM-DD), uso los últimos 90 días; ICLOUD_SYNC_INTERVAL_MINUTES inválido (entero ≥ 15), automática apagada",
    );
  });

  it("no incluye la cuenta", () => {
    expect(describeIcloudSetup(readIcloudConfig({ ICLOUD_USER: USER }), true)).not.toContain(USER);
  });
});
```

Run: `bunx vitest run server/src/icloud/icloudConfig.test.ts`
Expected: FAIL («Cannot find module './icloudConfig.js'»).

- [ ] **Step 6: Configuración — implementación**

`server/src/icloud/icloudConfig.ts`:

```ts
import { MIN_SYNC_INTERVAL_MINUTES, parseSyncInterval } from "../mail/syncInterval.js";

export const ICLOUD_HOST = "imap.mail.me.com";
export const ICLOUD_PORT = 993;
export const ICLOUD_USER_VAR = "ICLOUD_USER";
export const ICLOUD_PASSWORD_MISSING = "la contraseña de app en el Llavero";
export const DEFAULT_ICLOUD_MAILBOXES = ["INBOX"];
export const DEFAULT_ICLOUD_WINDOW_DAYS = 90;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export interface IcloudConfig {
  user: string;
  since: string | null;
  sinceInvalid: boolean;
  mailboxes: string[];
  intervalMinutes: number | null;
  intervalInvalid: boolean;
}

const valueOf = (env: NodeJS.ProcessEnv, key: string): string => env[key]?.trim() ?? "";

const localDate = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export function parseIcloudSince(raw: string): string | null {
  const match = ISO_DATE.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  const sameDay = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return sameDay ? raw : null;
}

export function parseIcloudMailboxes(raw: string): string[] {
  const names = raw.split(",").map((name) => name.trim()).filter((name) => name !== "");
  return names.length > 0 ? [...new Set(names)] : DEFAULT_ICLOUD_MAILBOXES;
}

export function readIcloudConfig(env: NodeJS.ProcessEnv): IcloudConfig | null {
  const user = valueOf(env, ICLOUD_USER_VAR);
  if (!user) return null;
  const rawSince = valueOf(env, "ICLOUD_SINCE");
  const rawInterval = valueOf(env, "ICLOUD_SYNC_INTERVAL_MINUTES");
  const since = rawSince ? parseIcloudSince(rawSince) : null;
  const intervalMinutes = parseSyncInterval(rawInterval);
  return {
    user,
    since,
    sinceInvalid: rawSince !== "" && since === null,
    mailboxes: parseIcloudMailboxes(valueOf(env, "ICLOUD_MAILBOXES")),
    intervalMinutes,
    intervalInvalid: rawInterval !== "" && intervalMinutes === null,
  };
}

export function icloudSearchSince({ since }: Pick<IcloudConfig, "since">, now: Date): Date {
  return since ? localDate(since) : new Date(now.getTime() - DEFAULT_ICLOUD_WINDOW_DAYS * DAY_MS);
}

const formatDay = (iso: string): string => iso.split("-").reverse().join("/");

export function icloudScopeLabel({ since, mailboxes }: Pick<IcloudConfig, "since" | "mailboxes">): string {
  const window = since ? `desde el ${formatDay(since)}` : `últimos ${DEFAULT_ICLOUD_WINDOW_DAYS} días`;
  return `${mailboxes.join(", ")} · ${window}`;
}

export function describeIcloudSetup(config: IcloudConfig | null, hasPassword: boolean): string {
  if (!config) return `iCloud: deshabilitado (falta ${ICLOUD_USER_VAR})`;
  if (!hasPassword) return `iCloud: deshabilitado (falta ${ICLOUD_PASSWORD_MISSING})`;
  const mode = config.intervalMinutes !== null
    ? `búsqueda automática cada ${config.intervalMinutes} min`
    : "búsqueda manual; automática apagada";
  const notes = [
    config.sinceInvalid ? `ICLOUD_SINCE inválido (AAAA-MM-DD), uso los últimos ${DEFAULT_ICLOUD_WINDOW_DAYS} días` : null,
    config.intervalInvalid
      ? `ICLOUD_SYNC_INTERVAL_MINUTES inválido (entero ≥ ${MIN_SYNC_INTERVAL_MINUTES}), automática apagada`
      : null,
  ].filter((note): note is string => note !== null);
  return [`iCloud: ${mode} (${icloudScopeLabel(config)})`, ...notes].join("; ");
}
```

Run: `bunx vitest run server/src/icloud/icloudConfig.test.ts`
Expected: PASS.

- [ ] **Step 7: Suite completa**

```bash
bun run typecheck && bun run test
```

Expected: verde.

- [ ] **Step 8: Commit (solo si el usuario lo autorizó)**

```bash
git add -- server/src/mail/syncInterval.ts server/src/mail/syncInterval.test.ts server/src/icloud \
  server/src/gmail/gmailConfig.ts server/src/gmail/gmailConfig.test.ts
git commit -m "feat(server): configuración de iCloud y contraseña de app leída del Llavero

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cliente IMAP de iCloud

`openIcloudClient` implementa `MailClient` sobre `imapflow`: se conecta, recorre las carpetas en solo lectura, se queda con los mails que traen PDF y baja cada parte por UID. La sesión IMAP se inyecta para testear sin red.

**Files:**
- Modify: `server/package.json`, `bun.lock`
- Create: `server/src/icloud/icloudClient.ts`, `server/src/icloud/icloudClient.test.ts`

**Interfaces:**
- Consumes: `MailClient`, `MailPdfPart` (Task 3); `ICLOUD_HOST`, `ICLOUD_PORT` (Task 4); `IcloudApiError`, `IcloudAuthError`, `ICLOUD_AUTH_FAILED_MESSAGE` (Task 4).
- Produces:

```ts
export interface IcloudPdfPart extends MailPdfPart { mailbox: string; uid: number }
export interface IcloudCandidate { id: string; mailbox: string; uid: number; receivedAt: string; pdfParts: IcloudPdfPart[] }
export interface ImapSession { readonly mailbox: false | { uidValidity: bigint }; connect(); getMailboxLock(); search(); fetchAll(); download(); logout() }
export interface IcloudClientOptions { user: string; password: string; mailboxes: string[]; since: Date; createSession?: (options: ImapFlowOptions) => ImapSession }
export function collectImapPdfParts(node: MessageStructureObject): MailPdfPart[];
export function imapMessageId(mailbox: string, uidValidity: bigint, uid: number, headerId: string | undefined): string;
export function newestFirst(candidates: IcloudCandidate[], limit: number): IcloudCandidate[];
export function createImapFlow(options: ImapFlowOptions): ImapFlow;
export function createImapSession(options: ImapFlowOptions): ImapSession;
export function openIcloudClient(options: IcloudClientOptions): Promise<MailClient<IcloudPdfPart>>;
```

- [ ] **Step 1: Dependencia**

```bash
bun add --cwd server imapflow@^2.2.5
```

Expected: `server/package.json` suma `"imapflow": "^2.2.5"` y `bun.lock` se actualiza.

- [ ] **Step 2: Tests que fallan**

`server/src/icloud/icloudClient.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { Readable } from "node:stream";
import type { FetchMessageObject, MessageStructureObject } from "imapflow";
import {
  collectImapPdfParts, createImapFlow, imapMessageId, newestFirst, openIcloudClient,
  type IcloudCandidate, type ImapSession,
} from "./icloudClient.js";
import { IcloudApiError, IcloudAuthError, ICLOUD_AUTH_FAILED_MESSAGE } from "./icloudErrors.js";

const SINCE = new Date(2026, 8, 1);
const USER = "usuario-sintetico@icloud.com";
const PASSWORD = "clave-app-sintetica";

interface FakeMailbox {
  uidValidity: bigint;
  messages: FetchMessageObject[];
}

const pdfNode = (part: string, filename: string, size = 2048): MessageStructureObject => ({
  part, type: "application/pdf", disposition: "attachment", dispositionParameters: { filename }, size,
});
const textNode = (part: string): MessageStructureObject => ({ part, type: "text/plain", size: 120 });
const multipart = (...childNodes: MessageStructureObject[]): MessageStructureObject => ({ type: "multipart/mixed", childNodes });

const message = (
  uid: number, receivedAt: string, bodyStructure: MessageStructureObject, messageId?: string,
): FetchMessageObject => ({ seq: uid, uid, internalDate: new Date(receivedAt), envelope: { messageId }, bodyStructure });

const fakeSession = (mailboxes: Record<string, FakeMailbox>) => {
  const state: { open: FakeMailbox | null } = { open: null };
  return {
    get mailbox(): false | { uidValidity: bigint } {
      return state.open ? { uidValidity: state.open.uidValidity } : false;
    },
    connect: vi.fn(async (): Promise<void> => undefined),
    getMailboxLock: vi.fn(async (path: string, _options: { readOnly: boolean }) => {
      const box = mailboxes[path];
      if (!box) throw new Error("Mailbox doesn't exist");
      state.open = box;
      return {
        release: () => {
          state.open = null;
        },
      };
    }),
    search: vi.fn(async (_query: { since: Date }, _options: { uid: true }): Promise<number[]> =>
      state.open?.messages.map(({ uid }) => uid) ?? []),
    fetchAll: vi.fn(async (range: number[]): Promise<FetchMessageObject[]> =>
      state.open?.messages.filter(({ uid }) => range.includes(uid)) ?? []),
    download: vi.fn(async (range: string, part: string): Promise<{ content?: Readable }> =>
      ({ content: Readable.from([Buffer.from(`pdf:${range}:${part}`)]) })),
    logout: vi.fn(async (): Promise<void> => undefined),
  } satisfies ImapSession;
};

type FakeSession = ReturnType<typeof fakeSession>;

interface OpenOptions {
  names?: string[];
  prepare?: (session: FakeSession) => void;
}

const open = (mailboxes: Record<string, FakeMailbox>, { names = Object.keys(mailboxes), prepare = () => {} }: OpenOptions = {}) => {
  const session = fakeSession(mailboxes);
  prepare(session);
  const createSession = vi.fn(() => session);
  const client = openIcloudClient({ user: USER, password: PASSWORD, mailboxes: names, since: SINCE, createSession });
  return { session, createSession, client };
};

const RESUMEN = message(
  11, "2026-09-30T13:00:00.000Z", multipart(textNode("1"), pdfNode("2", "Resumen6oct2026.pdf")), "<resumen@banco.example>",
);
const NEWSLETTER = message(12, "2026-10-01T09:00:00.000Z", multipart(textNode("1")), "<news@tienda.example>");
const CUPON = message(
  3, "2026-09-10T08:00:00.000Z", { type: "application/pdf", parameters: { name: "cupon.pdf" }, size: 2048 }, "<cupon@banco.example>",
);

describe("collectImapPdfParts", () => {
  it("encuentra los PDFs por tipo o por nombre, en cualquier nivel", () => {
    const structure = multipart(
      textNode("1"),
      pdfNode("2", "Resumen6oct2026.pdf", 51234),
      { part: "3", type: "application/octet-stream", parameters: { name: "CUPON.PDF" }, size: 900 },
      { part: "4", type: "image/png", dispositionParameters: { filename: "logo.png" }, size: 10 },
      { part: "5", type: "message/rfc822", childNodes: [textNode("5.1"), pdfNode("5.2", "reenviado.pdf")] },
    );
    expect(collectImapPdfParts(structure)).toEqual([
      { partId: "2", fileName: "Resumen6oct2026.pdf", size: 51234 },
      { partId: "3", fileName: "CUPON.PDF", size: 900 },
      { partId: "5.2", fileName: "reenviado.pdf", size: 2048 },
    ]);
  });

  it("si el mail entero es el PDF usa la parte 1", () => {
    expect(collectImapPdfParts({ type: "application/pdf", parameters: { name: "resumen.pdf" }, size: 10 }))
      .toEqual([{ partId: "1", fileName: "resumen.pdf", size: 10 }]);
  });

  it("un PDF sin nombre recibe uno por su parte", () => {
    expect(collectImapPdfParts(multipart({ part: "2", type: "APPLICATION/PDF" })))
      .toEqual([{ partId: "2", fileName: "adjunto-2.pdf", size: 0 }]);
  });
});

describe("imapMessageId", () => {
  it("usa el Message-ID sin los <>", () => {
    expect(imapMessageId("INBOX", 7n, 42, "<abc@banco.example>")).toBe("abc@banco.example");
  });

  it("sin Message-ID arma uno con carpeta, UIDVALIDITY y UID", () => {
    expect(imapMessageId("INBOX", 7n, 42, undefined)).toBe("INBOX/7/42");
    expect(imapMessageId("INBOX", 7n, 42, "  ")).toBe("INBOX/7/42");
  });
});

describe("newestFirst", () => {
  const candidate = (id: string, receivedAt: string, mailbox = "INBOX"): IcloudCandidate =>
    ({ id, mailbox, uid: 1, receivedAt, pdfParts: [] });

  it("ordena del más nuevo al más viejo, saca repetidos y corta en el límite", () => {
    const result = newestFirst([
      candidate("a", "2026-09-02T10:00:00.000Z"),
      candidate("b", "2026-09-30T10:00:00.000Z"),
      candidate("a", "2026-09-02T10:00:00.000Z", "Archivo"),
      candidate("c", "2026-09-15T10:00:00.000Z"),
    ], 2);
    expect(result.map(({ id }) => id)).toEqual(["b", "c"]);
  });

  it("de un repetido se queda con la primera carpeta", () => {
    const result = newestFirst([
      candidate("a", "2026-09-02T10:00:00.000Z", "INBOX"),
      candidate("a", "2026-09-02T10:00:00.000Z", "Archivo"),
    ], 10);
    expect(result.map(({ mailbox }) => mailbox)).toEqual(["INBOX"]);
  });
});

describe("openIcloudClient", () => {
  it("se conecta a iCloud por TLS con la cuenta y sin logs", async () => {
    const { createSession, session, client } = open({ INBOX: { uidValidity: 1n, messages: [] } });
    await client;
    expect(createSession).toHaveBeenCalledWith({
      host: "imap.mail.me.com", port: 993, secure: true, auth: { user: USER, pass: PASSWORD }, logger: false,
    });
    expect(session.connect).toHaveBeenCalledTimes(1);
  });

  it("lista solo los mails con PDF de todas las carpetas, del más nuevo al más viejo, en solo lectura", async () => {
    const { session, client } = open({
      INBOX: { uidValidity: 5n, messages: [RESUMEN, NEWSLETTER] },
      Bancos: { uidValidity: 9n, messages: [CUPON] },
    });
    expect(await (await client).listMessageIds(500)).toEqual(["resumen@banco.example", "cupon@banco.example"]);
    expect(session.getMailboxLock).toHaveBeenCalledWith("INBOX", { readOnly: true });
    expect(session.getMailboxLock).toHaveBeenCalledWith("Bancos", { readOnly: true });
    expect(session.search).toHaveBeenCalledWith({ since: SINCE }, { uid: true });
    expect(session.fetchAll).toHaveBeenCalledWith(
      [11, 12], { uid: true, envelope: true, internalDate: true, bodyStructure: true }, { uid: true },
    );
    expect(session.mailbox).toBe(false);
  });

  it("el mismo mail en dos carpetas cuenta una sola vez", async () => {
    const { client } = open({
      INBOX: { uidValidity: 5n, messages: [RESUMEN] },
      Archivo: { uidValidity: 6n, messages: [{ ...RESUMEN, uid: 99 }] },
    });
    expect(await (await client).listMessageIds(500)).toEqual(["resumen@banco.example"]);
  });

  it("getMessage devuelve las partes y downloadPart baja la parte por UID en su carpeta", async () => {
    const { session, client } = open({
      INBOX: { uidValidity: 5n, messages: [] },
      Bancos: { uidValidity: 9n, messages: [CUPON] },
    });
    const mail = await client;
    await mail.listMessageIds(500);
    const found = await mail.getMessage("cupon@banco.example");
    expect(found).toEqual({
      id: "cupon@banco.example", receivedAt: "2026-09-10T08:00:00.000Z",
      pdfParts: [{ partId: "1", fileName: "cupon.pdf", size: 2048, mailbox: "Bancos", uid: 3 }],
    });
    const bytes = await mail.downloadPart(found.id, found.pdfParts[0]);
    expect(new TextDecoder().decode(bytes)).toBe("pdf:3:1");
    expect(session.download).toHaveBeenCalledWith("3", "1", { uid: true });
    expect(session.getMailboxLock).toHaveBeenLastCalledWith("Bancos", { readOnly: true });
    expect(session.mailbox).toBe(false);
  });

  it("un mail desconocido o un adjunto vacío son errores de iCloud", async () => {
    const { session, client } = open({ INBOX: { uidValidity: 5n, messages: [RESUMEN] } });
    const mail = await client;
    await expect(mail.getMessage("otro@banco.example")).rejects.toBeInstanceOf(IcloudApiError);
    await mail.listMessageIds(500);
    const found = await mail.getMessage("resumen@banco.example");
    session.download.mockResolvedValueOnce({});
    await expect(mail.downloadPart(found.id, found.pdfParts[0])).rejects.toThrow("iCloud no devolvió el adjunto Resumen6oct2026.pdf.");
  });

  it("un login rechazado es IcloudAuthError con los pasos", async () => {
    const failure = Object.assign(new Error("Authentication failed"), { authenticationFailed: true });
    const { client } = open({}, { prepare: (session) => session.connect.mockRejectedValueOnce(failure) });
    const error = await client.catch((err: unknown) => err);
    expect(error).toBeInstanceOf(IcloudAuthError);
    expect((error as Error).message).toBe(ICLOUD_AUTH_FAILED_MESSAGE);
  });

  it("un corte al conectar es IcloudApiError con el motivo", async () => {
    const { client } = open({}, {
      prepare: (session) => session.connect.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND imap.mail.me.com")),
    });
    await expect(client).rejects.toThrow("No se pudo conectar con iCloud: getaddrinfo ENOTFOUND imap.mail.me.com");
  });

  it("una carpeta que no existe es IcloudApiError con su nombre", async () => {
    const { client } = open({ INBOX: { uidValidity: 5n, messages: [] } }, { names: ["INBOX", "Bancos"] });
    await expect((await client).listMessageIds(500))
      .rejects.toThrow("No pude abrir la carpeta «Bancos» de iCloud: Mailbox doesn't exist");
  });

  it("un error al buscar nombra la carpeta y libera el lock", async () => {
    const { session, client } = open({ INBOX: { uidValidity: 5n, messages: [] } }, {
      prepare: (fake) => fake.search.mockRejectedValueOnce(new Error("Connection closed")),
    });
    await expect((await client).listMessageIds(500)).rejects.toThrow("iCloud falló al revisar «INBOX»: Connection closed");
    expect(session.mailbox).toBe(false);
  });

  it("close hace logout y no propaga sus errores", async () => {
    const { session, client } = open({}, {
      prepare: (fake) => fake.logout.mockRejectedValueOnce(new Error("ya estaba cerrada")),
    });
    await expect((await client).close()).resolves.toBeUndefined();
    expect(session.logout).toHaveBeenCalledTimes(1);
  });
});

describe("createImapFlow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registra un listener de error para que un corte no tire el proceso", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const flow = createImapFlow({ host: "127.0.0.1", port: 1, secure: true, auth: { user: "u", pass: "p" }, logger: false });
    expect(flow.listenerCount("error")).toBe(1);
    expect(() => flow.emit("error", new Error("socket colgado"))).not.toThrow();
    expect(logged).toHaveBeenCalledWith("iCloud (IMAP): socket colgado");
  });
});
```

Run: `bunx vitest run server/src/icloud/icloudClient.test.ts`
Expected: FAIL («Cannot find module './icloudClient.js'»).

- [ ] **Step 3: Implementación**

`server/src/icloud/icloudClient.ts`:

```ts
import type { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import {
  ImapFlow, type FetchMessageObject, type FetchQueryObject, type ImapFlowOptions, type MessageStructureObject,
} from "imapflow";
import type { MailClient, MailPdfPart } from "../mail/mailClient.js";
import { ICLOUD_HOST, ICLOUD_PORT } from "./icloudConfig.js";
import { IcloudApiError, IcloudAuthError, ICLOUD_AUTH_FAILED_MESSAGE } from "./icloudErrors.js";

export interface IcloudPdfPart extends MailPdfPart {
  mailbox: string;
  uid: number;
}

export interface IcloudCandidate {
  id: string;
  mailbox: string;
  uid: number;
  receivedAt: string;
  pdfParts: IcloudPdfPart[];
}

export interface ImapSession {
  readonly mailbox: false | { uidValidity: bigint };
  connect(): Promise<void>;
  getMailboxLock(path: string, options: { readOnly: boolean }): Promise<{ release(): void }>;
  search(query: { since: Date }, options: { uid: true }): Promise<number[] | false | undefined>;
  fetchAll(range: number[], query: FetchQueryObject, options: { uid: true }): Promise<FetchMessageObject[]>;
  download(range: string, part: string, options: { uid: true }): Promise<{ content?: Readable }>;
  logout(): Promise<void>;
}

export interface IcloudClientOptions {
  user: string;
  password: string;
  mailboxes: string[];
  since: Date;
  createSession?: (options: ImapFlowOptions) => ImapSession;
}

const ROOT_PART_ID = "1";
const PDF_MIME = "application/pdf";
const PDF_FILE_NAME = /\.pdf$/i;
const UNEXPECTED_ERROR = "Error inesperado";
const FETCH_QUERY: FetchQueryObject = { uid: true, envelope: true, internalDate: true, bodyStructure: true };

const messageOf = (err: unknown): string => (err instanceof Error && err.message ? err.message : UNEXPECTED_ERROR);

const isAuthFailure = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { authenticationFailed?: unknown }).authenticationFailed === true;

const fileNameOf = ({ dispositionParameters, parameters }: MessageStructureObject): string =>
  (dispositionParameters?.filename ?? parameters?.name ?? "").trim();

const isPdfLeaf = (node: MessageStructureObject): boolean =>
  !node.childNodes?.length && (node.type.toLowerCase() === PDF_MIME || PDF_FILE_NAME.test(fileNameOf(node)));

export function collectImapPdfParts(node: MessageStructureObject): MailPdfPart[] {
  const partId = node.part ?? ROOT_PART_ID;
  const own = isPdfLeaf(node)
    ? [{ partId, fileName: fileNameOf(node) || `adjunto-${partId}.pdf`, size: node.size ?? 0 }]
    : [];
  return [...own, ...(node.childNodes ?? []).flatMap(collectImapPdfParts)];
}

export function imapMessageId(mailbox: string, uidValidity: bigint, uid: number, headerId: string | undefined): string {
  const fromHeader = headerId?.trim().replace(/^<|>$/g, "") ?? "";
  return fromHeader || `${mailbox}/${uidValidity}/${uid}`;
}

const toIso = (value: Date | string | undefined): string => {
  const date = new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const toCandidate = (mailbox: string, uidValidity: bigint, message: FetchMessageObject): IcloudCandidate | null => {
  if (!message.bodyStructure) return null;
  const pdfParts = collectImapPdfParts(message.bodyStructure).map((part) => ({ ...part, mailbox, uid: message.uid }));
  if (pdfParts.length === 0) return null;
  return {
    id: imapMessageId(mailbox, uidValidity, message.uid, message.envelope?.messageId),
    mailbox,
    uid: message.uid,
    receivedAt: toIso(message.internalDate),
    pdfParts,
  };
};

const isCandidate = (candidate: IcloudCandidate | null): candidate is IcloudCandidate => candidate !== null;

export function newestFirst(candidates: IcloudCandidate[], limit: number): IcloudCandidate[] {
  const unique = new Map<string, IcloudCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.id)) unique.set(candidate.id, candidate);
  }
  return [...unique.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, limit);
}

export function createImapFlow(options: ImapFlowOptions): ImapFlow {
  const flow = new ImapFlow(options);
  flow.on("error", (err: Error) => {
    console.error(`iCloud (IMAP): ${err.message}`);
  });
  return flow;
}

export function createImapSession(options: ImapFlowOptions): ImapSession {
  const flow = createImapFlow(options);
  return {
    get mailbox(): false | { uidValidity: bigint } {
      return flow.mailbox;
    },
    connect: () => flow.connect(),
    getMailboxLock: (path, lockOptions) => flow.getMailboxLock(path, lockOptions),
    search: (query, searchOptions) => flow.search(query, searchOptions),
    fetchAll: (range, query, fetchOptions) => flow.fetchAll(range, query, fetchOptions),
    download: (range, part, downloadOptions) => flow.download(range, part, downloadOptions),
    logout: () => flow.logout(),
  };
}

const connectError = (err: unknown): Error =>
  (isAuthFailure(err)
    ? new IcloudAuthError(ICLOUD_AUTH_FAILED_MESSAGE)
    : new IcloudApiError(`No se pudo conectar con iCloud: ${messageOf(err)}`));

export async function openIcloudClient({
  user, password, mailboxes, since, createSession = createImapSession,
}: IcloudClientOptions): Promise<MailClient<IcloudPdfPart>> {
  const session = createSession({ host: ICLOUD_HOST, port: ICLOUD_PORT, secure: true, auth: { user, pass: password }, logger: false });
  await session.connect().catch((err: unknown) => {
    throw connectError(err);
  });
  const known = new Map<string, IcloudCandidate>();

  const inMailbox = async <T>(mailbox: string, work: (uidValidity: bigint) => Promise<T>): Promise<T> => {
    const lock = await session.getMailboxLock(mailbox, { readOnly: true }).catch((err: unknown) => {
      throw new IcloudApiError(`No pude abrir la carpeta «${mailbox}» de iCloud: ${messageOf(err)}`);
    });
    try {
      return await work(session.mailbox ? session.mailbox.uidValidity : 0n);
    } finally {
      lock.release();
    }
  };

  const scan = (mailbox: string): Promise<IcloudCandidate[]> => inMailbox(mailbox, async (uidValidity) => {
    try {
      const uids = await session.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return [];
      const messages = await session.fetchAll(uids, FETCH_QUERY, { uid: true });
      return messages.map((message) => toCandidate(mailbox, uidValidity, message)).filter(isCandidate);
    } catch (err) {
      throw new IcloudApiError(`iCloud falló al revisar «${mailbox}»: ${messageOf(err)}`);
    }
  });

  return {
    async listMessageIds(limit) {
      const found: IcloudCandidate[] = [];
      for (const mailbox of mailboxes) found.push(...(await scan(mailbox)));
      const selected = newestFirst(found, limit);
      for (const candidate of selected) known.set(candidate.id, candidate);
      return selected.map(({ id }) => id);
    },

    async getMessage(id) {
      const candidate = known.get(id);
      if (!candidate) throw new IcloudApiError(`iCloud no encontró el mail ${id}.`);
      return { id, receivedAt: candidate.receivedAt, pdfParts: candidate.pdfParts };
    },

    async downloadPart(_messageId, part) {
      return inMailbox(part.mailbox, async () => {
        const { content } = await session.download(String(part.uid), part.partId, { uid: true });
        if (!content) throw new IcloudApiError(`iCloud no devolvió el adjunto ${part.fileName}.`);
        return new Uint8Array(await buffer(content));
      });
    },

    async close() {
      await session.logout().catch(() => undefined);
    },
  };
}
```

Run: `bunx vitest run server/src/icloud/icloudClient.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck**

```bash
bun run typecheck
```

Expected: sin errores. Si `createImapSession` no compila contra los tipos de `imapflow` (por ejemplo, la sobrecarga de `search` devuelve otro tipo), ajustar solo el adaptador (`createImapSession`) para que la interfaz `ImapSession` quede igual; los tests usan la interfaz, no `ImapFlow`.

- [ ] **Step 5: Commit (solo si el usuario lo autorizó)**

```bash
git add -- server/package.json bun.lock server/src/icloud/icloudClient.ts server/src/icloud/icloudClient.test.ts
git commit -m "feat(server): cliente IMAP de iCloud de solo lectura que encuentra los PDFs adjuntos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API y pantalla por fuente

Las rutas pasan a `/api/mail/status` (las dos fuentes, iCloud primero) y `/api/mail/:source/sync`; el server arranca un job por fuente; la sección de Importar se llama «Mails» y muestra una tarjeta por fuente. README y `.env.example` documentan iCloud.

**Files:**
- Create: `server/src/icloud/icloudSource.ts`, `server/src/icloud/icloudSource.test.ts`, `server/src/mail/mailSources.ts`, `server/src/http/routes/mail.ts`, `server/src/http/routes/mail.test.ts`, `client/src/components/MailSourceCard.tsx`
- Delete: `server/src/http/routes/gmail.ts`, `server/src/http/routes/gmail.test.ts`
- Modify: `server/src/http/app.ts`, `server/src/index.ts`, `shared/src/dtos.ts`, `shared/src/dtos.test.ts`, `client/src/api/hooks.ts`, `client/src/mailImport.ts`, `client/src/mailImport.test.ts`, `client/src/components/MailImportSection.tsx`, `client/src/components/MailImportSection.test.tsx`, `client/src/components/MailSyncResult.tsx`, `client/src/pages/ImportPage.test.tsx`, `README.md`, `.env.example`

**Interfaces:**
- Consumes: `MailSourceSetup`, `runMailSync`, `findLastMailRun`, `startMailJob`, `gmailSourceSetup`, `fakeMailClient` (Task 3); `readIcloudConfig`, `icloudScopeLabel`, `icloudSearchSince`, `describeIcloudSetup`, `ICLOUD_USER_VAR`, `ICLOUD_PASSWORD_MISSING`, `hasIcloudPassword`, `readIcloudPassword` (Task 4); `openIcloudClient`, `IcloudClientOptions`, `IcloudPdfPart` (Task 5).
- Produces:

```ts
export const mailSourceStatusDtoSchema; export type MailSourceStatusDTO;
export function icloudSourceSetup(env: NodeJS.ProcessEnv, deps?: IcloudSourceDeps): Promise<MailSourceSetup>;
export function describeIcloudSource(env: NodeJS.ProcessEnv, hasPassword?: (user: string) => Promise<boolean>): Promise<string>;
export const MAIL_SOURCE_ORDER: MailSource[];
export function readMailSourceSetup(source: MailSource, env: NodeJS.ProcessEnv): Promise<MailSourceSetup>;
export function readMailSourceSetups(env: NodeJS.ProcessEnv): Promise<MailSourceSetup[]>;
export const mailRouter: Router;
export function useMailStatus(); export function useMailSync(source: MailSource);
export const MailSourceCard; export const MailImportSection;
```

- [ ] **Step 1: DTO de status por fuente**

En `shared/src/dtos.ts`, reemplazar `export const gmailStatusDtoSchema = z.object({ … });` por:

```ts
export const mailSourceStatusDtoSchema = z.object({
  source: mailSourceSchema,
  enabled: z.boolean(),
  missing: z.array(z.string()),
  scope: z.string().nullable(),
  intervalMinutes: z.number().int().nullable(),
  lastRun: mailSyncRunDtoSchema.nullable(),
});
```

y `export type GmailStatusDTO = z.infer<typeof gmailStatusDtoSchema>;` por:

```ts
export type MailSourceStatusDTO = z.infer<typeof mailSourceStatusDtoSchema>;
```

En `shared/src/dtos.test.ts`, cambiar `gmailStatusDtoSchema` por `mailSourceStatusDtoSchema` en el import y reemplazar el `describe("gmailStatusDtoSchema", …)` por:

```ts
describe("mailSourceStatusDtoSchema", () => {
  it("valida un status habilitado con la última corrida", () => {
    const dto = {
      source: "icloud", enabled: true, missing: [], scope: "INBOX · desde el 01/09/2026", intervalMinutes: 360,
      lastRun: {
        source: "icloud", trigger: "job", startedAt: "2026-10-03T14:05:00.000Z", finishedAt: "2026-10-03T14:05:09.000Z",
        status: "ok", error: null, messagesChecked: 2, hasMore: false,
        items: [
          { id: "g1", fileName: "resumen-sintetico.pdf", receivedAt: "2026-09-28T10:00:00.000Z", outcome: "imported",
            kind: "statement", documentId: "s1", detail: "Visa Signature ****1234 · 42 movimientos" },
          { id: "g2", fileName: "factura.pdf", receivedAt: "2026-09-27T10:00:00.000Z", outcome: "skipped",
            kind: null, documentId: null, detail: "Formato de resumen no reconocido" },
        ],
      },
    };
    expect(mailSourceStatusDtoSchema.parse(dto)).toEqual(dto);
  });

  it("valida un status deshabilitado", () => {
    const dto = {
      source: "gmail", enabled: false, missing: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
      scope: null, intervalMinutes: null, lastRun: null,
    };
    expect(mailSourceStatusDtoSchema.parse(dto)).toEqual(dto);
  });
});
```

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: PASS (el typecheck queda roto hasta terminar la task: lo arreglan los pasos siguientes).

- [ ] **Step 2: Fuente iCloud — test que falla**

`server/src/icloud/icloudSource.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { fakeMailClient } from "../testing/mailFixtures.js";
import { describeIcloudSource, icloudSourceSetup } from "./icloudSource.js";

const USER = "usuario-sintetico@icloud.com";
const NOW = new Date(2026, 9, 5, 12);

const deps = (hasPassword: boolean) => ({
  hasPassword: vi.fn(async () => hasPassword),
  readPassword: vi.fn(async () => "clave-app-sintetica"),
  open: vi.fn(async () => fakeMailClient([])),
  now: () => NOW,
});

describe("icloudSourceSetup", () => {
  it("sin ICLOUD_USER queda deshabilitada sin mirar el Llavero", async () => {
    const d = deps(true);
    expect(await icloudSourceSetup({}, d)).toEqual({
      source: "icloud", missing: ["ICLOUD_USER"], scope: null, intervalMinutes: null, openClient: null,
    });
    expect(d.hasPassword).not.toHaveBeenCalled();
  });

  it("sin la contraseña en el Llavero queda deshabilitada", async () => {
    const d = deps(false);
    expect(await icloudSourceSetup({ ICLOUD_USER: USER }, d)).toMatchObject({
      source: "icloud", missing: ["la contraseña de app en el Llavero"], openClient: null,
    });
    expect(d.hasPassword).toHaveBeenCalledWith(USER);
  });

  it("habilitada informa alcance e intervalo, y lee la contraseña recién al abrir", async () => {
    const d = deps(true);
    const setup = await icloudSourceSetup({ ICLOUD_USER: USER, ICLOUD_SYNC_INTERVAL_MINUTES: "360" }, d);
    expect(setup).toMatchObject({ source: "icloud", missing: [], scope: "INBOX · últimos 90 días", intervalMinutes: 360 });
    expect(d.readPassword).not.toHaveBeenCalled();
    await setup.openClient?.();
    expect(d.readPassword).toHaveBeenCalledWith(USER);
    expect(d.open).toHaveBeenCalledWith({
      user: USER, password: "clave-app-sintetica", mailboxes: ["INBOX"], since: new Date(NOW.getTime() - 90 * 86_400_000),
    });
  });
});

describe("describeIcloudSource", () => {
  it("mira el Llavero solo si hay cuenta", async () => {
    const hasPassword = vi.fn(async () => true);
    expect(await describeIcloudSource({}, hasPassword)).toBe("iCloud: deshabilitado (falta ICLOUD_USER)");
    expect(hasPassword).not.toHaveBeenCalled();
    expect(await describeIcloudSource({ ICLOUD_USER: USER, ICLOUD_SINCE: "2026-09-01" }, hasPassword))
      .toBe("iCloud: búsqueda manual; automática apagada (INBOX · desde el 01/09/2026)");
  });
});
```

Run: `bunx vitest run server/src/icloud/icloudSource.test.ts`
Expected: FAIL («Cannot find module './icloudSource.js'»).

- [ ] **Step 3: Fuente iCloud y registro de fuentes — implementación**

`server/src/icloud/icloudSource.ts`:

```ts
import type { MailClient } from "../mail/mailClient.js";
import type { MailSourceSetup } from "../mail/mailSourceSetup.js";
import { openIcloudClient, type IcloudClientOptions } from "./icloudClient.js";
import {
  describeIcloudSetup, ICLOUD_PASSWORD_MISSING, ICLOUD_USER_VAR, icloudScopeLabel, icloudSearchSince, readIcloudConfig,
} from "./icloudConfig.js";
import { hasIcloudPassword, readIcloudPassword } from "./keychain.js";

export interface IcloudSourceDeps {
  hasPassword?: (user: string) => Promise<boolean>;
  readPassword?: (user: string) => Promise<string>;
  open?: (options: IcloudClientOptions) => Promise<MailClient>;
  now?: () => Date;
}

const disabled = (missing: string[]): MailSourceSetup =>
  ({ source: "icloud", missing, scope: null, intervalMinutes: null, openClient: null });

export async function icloudSourceSetup(env: NodeJS.ProcessEnv, {
  hasPassword = hasIcloudPassword, readPassword = readIcloudPassword, open = openIcloudClient, now = () => new Date(),
}: IcloudSourceDeps = {}): Promise<MailSourceSetup> {
  const config = readIcloudConfig(env);
  if (!config) return disabled([ICLOUD_USER_VAR]);
  if (!(await hasPassword(config.user))) return disabled([ICLOUD_PASSWORD_MISSING]);
  return {
    source: "icloud",
    missing: [],
    scope: icloudScopeLabel(config),
    intervalMinutes: config.intervalMinutes,
    openClient: async () => open({
      user: config.user,
      password: await readPassword(config.user),
      mailboxes: config.mailboxes,
      since: icloudSearchSince(config, now()),
    }),
  };
}

export async function describeIcloudSource(
  env: NodeJS.ProcessEnv, hasPassword: (user: string) => Promise<boolean> = hasIcloudPassword,
): Promise<string> {
  const config = readIcloudConfig(env);
  return describeIcloudSetup(config, config ? await hasPassword(config.user) : false);
}
```

`server/src/mail/mailSources.ts`:

```ts
import type { MailSource } from "@ledgerly/shared";
import { gmailSourceSetup } from "../gmail/gmailSource.js";
import { icloudSourceSetup } from "../icloud/icloudSource.js";
import type { MailSourceSetup } from "./mailSourceSetup.js";

export const MAIL_SOURCE_ORDER: MailSource[] = ["icloud", "gmail"];

const readers: Record<MailSource, (env: NodeJS.ProcessEnv) => Promise<MailSourceSetup>> = {
  gmail: async (env) => gmailSourceSetup(env),
  icloud: (env) => icloudSourceSetup(env),
};

export const readMailSourceSetup = (source: MailSource, env: NodeJS.ProcessEnv): Promise<MailSourceSetup> =>
  readers[source](env);

export const readMailSourceSetups = (env: NodeJS.ProcessEnv): Promise<MailSourceSetup[]> =>
  Promise.all(MAIL_SOURCE_ORDER.map((source) => readMailSourceSetup(source, env)));
```

Run: `bunx vitest run server/src/icloud/icloudSource.test.ts`
Expected: PASS.

- [ ] **Step 4: Rutas `/api/mail` — tests que fallan**

Borrar `server/src/http/routes/gmail.test.ts` y crear `server/src/http/routes/mail.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { mailSourceStatusDtoSchema, mailSyncRunDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { fakeGmailClient, fakeMailClient, pdfPart } from "../../testing/mailFixtures.js";

vi.mock("../../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
vi.mock("../../gmail/gmailClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../gmail/gmailClient.js")>()),
  createGmailClient: vi.fn(),
}));
vi.mock("../../icloud/keychain.js", () => ({ hasIcloudPassword: vi.fn(), readIcloudPassword: vi.fn() }));
vi.mock("../../icloud/icloudClient.js", () => ({ openIcloudClient: vi.fn() }));
import { extractPdfText } from "../../pdf/extract.js";
import { createGmailClient, GmailAuthError } from "../../gmail/gmailClient.js";
import { hasIcloudPassword, readIcloudPassword } from "../../icloud/keychain.js";
import { openIcloudClient } from "../../icloud/icloudClient.js";
import {
  IcloudAuthError, ICLOUD_AUTH_FAILED_MESSAGE, ICLOUD_MISSING_PASSWORD_MESSAGE,
} from "../../icloud/icloudErrors.js";
import { StatementModel } from "../../db/models.js";
import { createApp } from "../app.js";

withDb();
const app = createApp();
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const statementText = readFileSync(
  fileURLToPath(new URL("../../parsers/__fixtures__/icbc.sample.txt", import.meta.url)), "utf8",
);
const GMAIL_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
const ICLOUD_VARS = ["ICLOUD_USER", "ICLOUD_SINCE", "ICLOUD_MAILBOXES", "ICLOUD_SYNC_INTERVAL_MINUTES"];
const SECRETS = ["secreto-sintetico", "refresh-sintetico", "clave-app-sintetica"];
const ICLOUD_USER = "usuario-sintetico@icloud.com";

const enableGmail = (extra: Record<string, string> = {}) => {
  vi.stubEnv("GMAIL_CLIENT_ID", "id-sintetico");
  vi.stubEnv("GMAIL_CLIENT_SECRET", "secreto-sintetico");
  vi.stubEnv("GMAIL_REFRESH_TOKEN", "refresh-sintetico");
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
};

const enableIcloud = (extra: Record<string, string> = {}) => {
  vi.stubEnv("ICLOUD_USER", ICLOUD_USER);
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
  vi.mocked(hasIcloudPassword).mockResolvedValue(true);
  vi.mocked(readIcloudPassword).mockResolvedValue("clave-app-sintetica");
};

const statuses = async () => mailSourceStatusDtoSchema.array().parse((await request(app).get("/api/mail/status")).body);

beforeEach(() => {
  for (const key of [...GMAIL_VARS, "GMAIL_QUERY", "GMAIL_SYNC_INTERVAL_MINUTES", ...ICLOUD_VARS]) vi.stubEnv(key, "");
  vi.mocked(createGmailClient).mockReset();
  vi.mocked(extractPdfText).mockReset();
  vi.mocked(hasIcloudPassword).mockReset();
  vi.mocked(hasIcloudPassword).mockResolvedValue(false);
  vi.mocked(readIcloudPassword).mockReset();
  vi.mocked(openIcloudClient).mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/mail/status", () => {
  it("sin configurar informa las dos fuentes deshabilitadas, iCloud primero", async () => {
    const res = await request(app).get("/api/mail/status");
    expect(res.status).toBe(200);
    expect(mailSourceStatusDtoSchema.array().parse(res.body)).toEqual([
      { source: "icloud", enabled: false, missing: ["ICLOUD_USER"], scope: null, intervalMinutes: null, lastRun: null },
      { source: "gmail", enabled: false, missing: GMAIL_VARS, scope: null, intervalMinutes: null, lastRun: null },
    ]);
    expect(hasIcloudPassword).not.toHaveBeenCalled();
  });

  it("iCloud con cuenta pero sin contraseña en el Llavero dice qué falta", async () => {
    vi.stubEnv("ICLOUD_USER", ICLOUD_USER);
    const [icloud] = await statuses();
    expect(icloud).toMatchObject({ source: "icloud", enabled: false, missing: ["la contraseña de app en el Llavero"] });
    expect(hasIcloudPassword).toHaveBeenCalledWith(ICLOUD_USER);
  });

  it("habilitadas informan alcance e intervalo sin leer ni exponer secretos", async () => {
    enableIcloud({ ICLOUD_SINCE: "2026-09-01", ICLOUD_SYNC_INTERVAL_MINUTES: "360" });
    enableGmail({ GMAIL_QUERY: "from:banco has:attachment" });
    const res = await request(app).get("/api/mail/status");
    const [icloud, gmail] = mailSourceStatusDtoSchema.array().parse(res.body);
    expect(icloud).toEqual({
      source: "icloud", enabled: true, missing: [], scope: "INBOX · desde el 01/09/2026", intervalMinutes: 360, lastRun: null,
    });
    expect(gmail).toMatchObject({ source: "gmail", enabled: true, scope: "from:banco has:attachment", intervalMinutes: null });
    expect(readIcloudPassword).not.toHaveBeenCalled();
    for (const secret of SECRETS) expect(JSON.stringify(res.body)).not.toContain(secret);
  });
});

describe("POST /api/mail/:source/sync", () => {
  it("una fuente desconocida responde 400", async () => {
    const res = await request(app).post("/api/mail/yahoo/sync");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Fuente de mails desconocida: yahoo");
  });

  it("Gmail sin credenciales responde 409 sin intentar conectarse", async () => {
    const res = await request(app).post("/api/mail/gmail/sync");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Gmail no está configurado: faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN");
    expect(createGmailClient).not.toHaveBeenCalled();
  });

  it("iCloud sin cuenta responde 409 en singular", async () => {
    const res = await request(app).post("/api/mail/icloud/sync");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("iCloud no está configurado: falta ICLOUD_USER");
    expect(openIcloudClient).not.toHaveBeenCalled();
  });

  it("iCloud importa el resumen de un mail con la contraseña del Llavero y queda en su status", async () => {
    enableIcloud({ ICLOUD_SINCE: "2026-09-01", ICLOUD_MAILBOXES: "INBOX, Bancos" });
    vi.mocked(extractPdfText).mockResolvedValue({ text: statementText, meta });
    vi.mocked(openIcloudClient).mockResolvedValue(fakeMailClient([{
      id: "resumen@banco.example",
      pdfParts: [{ partId: "2", fileName: "resumen-sintetico.pdf", size: 2048, mailbox: "INBOX", uid: 11 }],
    }]));
    const res = await request(app).post("/api/mail/icloud/sync");
    expect(res.status).toBe(200);
    const run = mailSyncRunDtoSchema.parse(res.body);
    expect(run).toMatchObject({ source: "icloud", trigger: "manual", status: "ok", messagesChecked: 1 });
    expect(run.items).toMatchObject([{ fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement" }]);
    expect(openIcloudClient).toHaveBeenCalledWith({
      user: ICLOUD_USER, password: "clave-app-sintetica", mailboxes: ["INBOX", "Bancos"], since: new Date(2026, 8, 1),
    });
    expect(await StatementModel.countDocuments()).toBe(1);
    const [icloud, gmail] = await statuses();
    expect(icloud.lastRun).toEqual(res.body);
    expect(gmail.lastRun).toBeNull();
  });

  it("si iCloud rechaza el login responde 200 con la corrida en error", async () => {
    enableIcloud();
    vi.mocked(openIcloudClient).mockRejectedValue(new IcloudAuthError(ICLOUD_AUTH_FAILED_MESSAGE));
    const res = await request(app).post("/api/mail/icloud/sync");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: "icloud", status: "error", error: ICLOUD_AUTH_FAILED_MESSAGE });
  });

  it("si la contraseña desaparece del Llavero, la corrida queda en error con los pasos", async () => {
    enableIcloud();
    vi.mocked(readIcloudPassword).mockRejectedValue(new IcloudAuthError(ICLOUD_MISSING_PASSWORD_MESSAGE));
    const res = await request(app).post("/api/mail/icloud/sync");
    expect(res.body).toMatchObject({ status: "error", error: ICLOUD_MISSING_PASSWORD_MESSAGE });
    expect(openIcloudClient).not.toHaveBeenCalled();
  });

  it("Gmail importa el resumen de un mail y después el status trae la corrida", async () => {
    enableGmail();
    vi.mocked(extractPdfText).mockResolvedValue({ text: statementText, meta });
    vi.mocked(createGmailClient).mockReturnValue(
      fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]),
    );
    const res = await request(app).post("/api/mail/gmail/sync");
    expect(res.status).toBe(200);
    const run = mailSyncRunDtoSchema.parse(res.body);
    expect(run).toMatchObject({ source: "gmail", trigger: "manual", status: "ok", messagesChecked: 1 });
    expect(run.items).toMatchObject([{ fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement" }]);
    expect(run.items[0].documentId).toBe((await StatementModel.findOne())?._id.toString());
    const [, gmail] = await statuses();
    expect(gmail.lastRun).toEqual(res.body);
  });

  it("un token de Gmail rechazado responde 200 con la corrida en error", async () => {
    enableGmail();
    const client = fakeGmailClient([]);
    client.listMessageIds.mockRejectedValue(new GmailAuthError("Gmail rechazó el refresh token (venció o fue revocado)."));
    vi.mocked(createGmailClient).mockReturnValue(client);
    const res = await request(app).post("/api/mail/gmail/sync");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "error", error: "Gmail rechazó el refresh token (venció o fue revocado)." });
  });
});
```

Run: `bunx vitest run server/src/http/routes/mail.test.ts`
Expected: FAIL (404 en todas las rutas `/api/mail/*`).

- [ ] **Step 5: Rutas `/api/mail` — implementación**

Borrar `server/src/http/routes/gmail.ts` y crear `server/src/http/routes/mail.ts`:

```ts
import { Router } from "express";
import { MAIL_SOURCE_LABELS, mailSourceSchema, type MailSourceStatusDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { readMailSourceSetup, readMailSourceSetups } from "../../mail/mailSources.js";
import type { MailSourceSetup } from "../../mail/mailSourceSetup.js";
import { findLastMailRun, runMailSync } from "../../mail/syncMail.js";

export const mailRouter = Router();

const toStatus = async ({ source, missing, scope, intervalMinutes, openClient }: MailSourceSetup): Promise<MailSourceStatusDTO> => ({
  source, enabled: openClient !== null, missing, scope, intervalMinutes, lastRun: await findLastMailRun(source),
});

const missingText = (missing: string[]): string => `${missing.length === 1 ? "falta" : "faltan"} ${missing.join(", ")}`;

mailRouter.get("/status", asyncHandler(async (_req, res) => {
  const setups = await readMailSourceSetups(process.env);
  res.json(await Promise.all(setups.map(toStatus)));
}));

mailRouter.post("/:source/sync", asyncHandler(async (req, res) => {
  const parsed = mailSourceSchema.safeParse(req.params.source);
  if (!parsed.success) throw new HttpError(400, `Fuente de mails desconocida: ${req.params.source}`);
  const source = parsed.data;
  const setup = await readMailSourceSetup(source, process.env);
  if (!setup.openClient) {
    throw new HttpError(409, `${MAIL_SOURCE_LABELS[source]} no está configurado: ${missingText(setup.missing)}`);
  }
  res.json(await runMailSync(source, setup.openClient, "manual"));
}));
```

En `server/src/http/app.ts`: cambiar `import { gmailRouter } from "./routes/gmail.js";` por `import { mailRouter } from "./routes/mail.js";` y `app.use("/api/gmail", gmailRouter);` por `app.use("/api/mail", mailRouter);`.

En `server/src/index.ts`: reemplazar los imports `import { gmailSourceSetup } from "./gmail/gmailSource.js";` y `import { startMailJob } from "./mail/mailJob.js";` por:

```ts
import { describeIcloudSource } from "./icloud/icloudSource.js";
import { startMailJob } from "./mail/mailJob.js";
import { readMailSourceSetups } from "./mail/mailSources.js";
```

y las dos últimas líneas por:

```ts
console.log(describeGmailSetup(process.env));
console.log(await describeIcloudSource(process.env));
for (const setup of await readMailSourceSetups(process.env)) await startMailJob(setup);
```

Run: `bunx vitest run server/src/http/routes/mail.test.ts`
Expected: PASS.

- [ ] **Step 6: Textos del cliente por fuente — tests que fallan**

En `client/src/mailImport.test.ts`:

1. Reemplazar el import de `./mailImport.js` por:

```ts
import {
  formatDateTime, joinWithY, mailDisabledTitle, mailHasMoreMessage, mailIntervalLabel, mailItemSecondary, mailLastRunLabel,
  mailMissingMessage, mailRunSummary, mailScopeLabel, mailSearchLabel, splitMailItems,
} from "./mailImport.js";
```

2. Reemplazar el `describe("gmailMissingVarsMessage", …)` entero por:

```ts
describe("mailMissingMessage", () => {
  it("nombra lo que falta y la sección del README de la fuente", () => {
    expect(mailMissingMessage("gmail", ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"])).toBe(
      "Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN. Los pasos están en el README, sección «Importar desde Gmail»; después reiniciá el server.",
    );
  });

  it("concuerda en singular cuando falta una sola cosa", () => {
    expect(mailMissingMessage("icloud", ["la contraseña de app en el Llavero"])).toBe(
      "Falta la contraseña de app en el Llavero. Los pasos están en el README, sección «Importar desde iCloud»; después reiniciá el server.",
    );
  });
});
```

3. Reemplazar el `describe("gmailLastRunLabel y formatDateTime", …)` entero por:

```ts
describe("mailLastRunLabel y formatDateTime", () => {
  it("sin corridas invita a buscar en la fuente", () => {
    expect(mailLastRunLabel("gmail", null)).toBe("Todavía no buscaste en Gmail.");
    expect(mailLastRunLabel("icloud", null)).toBe("Todavía no buscaste en iCloud.");
  });

  it("muestra la fecha corta y quién la disparó", () => {
    const expected = SHORT_DATE_TIME.format(new Date("2026-10-03T17:05:00.000Z"));
    expect(formatDateTime("2026-10-03T17:05:00.000Z")).toBe(expected);
    expect(mailLastRunLabel("gmail", runOf())).toBe(`Última búsqueda: ${expected} (manual)`);
    expect(mailLastRunLabel("icloud", runOf({ trigger: "job" }))).toBe(`Última búsqueda: ${expected} (automática)`);
  });
});

describe("textos por fuente", () => {
  it("botón, título deshabilitado, alcance y aviso de pendientes", () => {
    expect(mailSearchLabel("icloud")).toBe("Buscar en iCloud");
    expect(mailSearchLabel("gmail")).toBe("Buscar en Gmail");
    expect(mailDisabledTitle("gmail")).toBe("Importación desde Gmail deshabilitada");
    expect(mailScopeLabel("gmail", "has:attachment")).toBe("Consulta: has:attachment");
    expect(mailScopeLabel("icloud", "INBOX · desde el 01/09/2026")).toBe("Revisa: INBOX · desde el 01/09/2026");
    expect(mailHasMoreMessage("icloud")).toBe("Quedan mails por revisar: tocá «Buscar en iCloud» otra vez.");
  });
});
```

Run: `bunx vitest run client/src/mailImport.test.ts`
Expected: FAIL (`mailMissingMessage` y compañía no existen).

- [ ] **Step 7: Textos del cliente por fuente — implementación**

Reemplazar `client/src/mailImport.ts` completo por:

```ts
import {
  MAIL_SOURCE_LABELS, type MailSource, type MailSyncItemDTO, type MailSyncOutcome, type MailSyncRunDTO, type MailSyncTrigger,
} from "@ledgerly/shared";
import { formatLocalDate } from "./format.js";
import { IMPORTED_FILE_KIND_LABELS } from "./importedFiles.js";

export type MailOutcomeColor = "success" | "default" | "warning" | "error";

export interface MailItemsSplit {
  visible: MailSyncItemDTO[];
  skipped: MailSyncItemDTO[];
}

interface CountLabels {
  one: string;
  many: string;
}

export const MAIL_OUTCOME_LABELS: Record<MailSyncOutcome, string> = {
  imported: "Importado",
  duplicate: "Ya estaba",
  skipped: "Omitido",
  failed: "Error",
};

export const MAIL_OUTCOME_COLORS: Record<MailSyncOutcome, MailOutcomeColor> = {
  imported: "success",
  duplicate: "default",
  skipped: "warning",
  failed: "error",
};

const TRIGGER_LABELS: Record<MailSyncTrigger, string> = { manual: "manual", job: "automática" };

const SETUP_SECTIONS: Record<MailSource, string> = { gmail: "Importar desde Gmail", icloud: "Importar desde iCloud" };

const SCOPE_PREFIXES: Record<MailSource, string> = { gmail: "Consulta", icloud: "Revisa" };

const OUTCOME_COUNT_LABELS: Record<MailSyncOutcome, CountLabels> = {
  imported: { one: "importado", many: "importados" },
  duplicate: { one: "ya estaba", many: "ya estaban" },
  skipped: { one: "omitido", many: "omitidos" },
  failed: { one: "con error", many: "con error" },
};

const SUMMARY_ORDER: MailSyncOutcome[] = ["imported", "duplicate", "skipped", "failed"];
const VISIBLE_ORDER: MailSyncOutcome[] = ["imported", "failed", "duplicate"];
const MINUTES_PER_HOUR = 60;
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

export const joinWithY = (items: string[]): string =>
  (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

export const formatDateTime = (iso: string): string => DATE_TIME_FORMAT.format(new Date(iso));

export const mailSearchLabel = (source: MailSource): string => `Buscar en ${MAIL_SOURCE_LABELS[source]}`;

export const mailDisabledTitle = (source: MailSource): string =>
  `Importación desde ${MAIL_SOURCE_LABELS[source]} deshabilitada`;

export const mailMissingMessage = (source: MailSource, missing: string[]): string => {
  const verb = missing.length === 1 ? "Falta" : "Faltan";
  return `${verb} ${joinWithY(missing)}. Los pasos están en el README, sección «${SETUP_SECTIONS[source]}»; después reiniciá el server.`;
};

export const mailScopeLabel = (source: MailSource, scope: string | null): string => `${SCOPE_PREFIXES[source]}: ${scope ?? ""}`;

export const mailIntervalLabel = (minutes: number | null): string => {
  if (minutes === null) return "apagada";
  return minutes % MINUTES_PER_HOUR === 0 ? `cada ${minutes / MINUTES_PER_HOUR} h` : `cada ${minutes} min`;
};

export const mailLastRunLabel = (source: MailSource, run: MailSyncRunDTO | null): string =>
  (run
    ? `Última búsqueda: ${formatDateTime(run.startedAt)} (${TRIGGER_LABELS[run.trigger]})`
    : `Todavía no buscaste en ${MAIL_SOURCE_LABELS[source]}.`);

export const mailHasMoreMessage = (source: MailSource): string =>
  `Quedan mails por revisar: tocá «${mailSearchLabel(source)}» otra vez.`;

const countOf = (items: MailSyncItemDTO[], outcome: MailSyncOutcome): number =>
  items.filter((item) => item.outcome === outcome).length;

const countLabel = (count: number, outcome: MailSyncOutcome): string => {
  const { one, many } = OUTCOME_COUNT_LABELS[outcome];
  return `${count} ${count === 1 ? one : many}`;
};

export const mailRunSummary = (run: MailSyncRunDTO): string | null => {
  if (run.status === "error" && run.items.length === 0) return null;
  if (run.messagesChecked === 0) return "No había mails nuevos.";
  const single = run.messagesChecked === 1;
  const mails = single ? "1 mail nuevo" : `${run.messagesChecked} mails nuevos`;
  if (run.items.length === 0) return `Revisé ${mails}: ${single ? "no tenía" : "no tenían"} PDFs.`;
  const counts = SUMMARY_ORDER
    .map((outcome) => ({ outcome, count: countOf(run.items, outcome) }))
    .filter(({ count }) => count > 0)
    .map(({ outcome, count }) => countLabel(count, outcome));
  return `Revisé ${mails}: ${counts.join(" · ")}`;
};

export const splitMailItems = (items: MailSyncItemDTO[]): MailItemsSplit => ({
  visible: VISIBLE_ORDER.flatMap((outcome) => items.filter((item) => item.outcome === outcome)),
  skipped: items.filter((item) => item.outcome === "skipped"),
});

export const mailItemSecondary = ({ kind, detail, receivedAt }: MailSyncItemDTO): string =>
  [kind ? IMPORTED_FILE_KIND_LABELS[kind] : "", detail, formatLocalDate(receivedAt)]
    .filter((part) => part !== "")
    .join(" · ");
```

En `client/src/components/MailSyncResult.tsx`: sumar `mailHasMoreMessage` al import de `../mailImport.js` y cambiar el texto fijo del aviso por:

```tsx
        <Alert severity="info" sx={{ mb: 1.5 }}>{mailHasMoreMessage(run.source)}</Alert>
```

Run: `bunx vitest run client/src/mailImport.test.ts`
Expected: PASS.

- [ ] **Step 8: Hooks**

En `client/src/api/hooks.ts`: en el import de `@ledgerly/shared`, cambiar `GmailStatusDTO, MailSyncRunDTO,` por `MailSource, MailSourceStatusDTO, MailSyncRunDTO,`; y reemplazar `useGmailStatus` y `useGmailSync` por:

```ts
export function useMailStatus() {
  return useQuery({ queryKey: ["mail-status"], queryFn: () => apiFetch<MailSourceStatusDTO[]>("/mail/status") });
}

export function useMailSync(source: MailSource) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<MailSyncRunDTO>(`/mail/${source}/sync`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

- [ ] **Step 9: Sección «Mails» — tests que fallan**

Reemplazar `client/src/components/MailImportSection.test.tsx` completo por:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MailSource, MailSourceStatusDTO, MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { formatLocalDate } from "../format.js";
import { MailImportSection } from "./MailImportSection.js";

const RECEIVED_AT = "2026-09-28T12:00:00.000Z";
const QUERY = "has:attachment filename:pdf newer_than:90d";
const ICLOUD_SCOPE = "INBOX · desde el 01/09/2026";
const GMAIL_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];

const item = (id: string, outcome: MailSyncItemDTO["outcome"], overrides: Partial<MailSyncItemDTO> = {}): MailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: RECEIVED_AT, outcome, kind: null, documentId: null,
  detail: "Formato de resumen no reconocido", ...overrides,
});

const runOf = (overrides: Partial<MailSyncRunDTO> = {}): MailSyncRunDTO => ({
  source: "icloud", trigger: "manual", startedAt: "2026-10-03T17:05:00.000Z", finishedAt: "2026-10-03T17:05:09.000Z",
  status: "ok", error: null, messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

const SYNC_RUN = runOf({
  messagesChecked: 3,
  items: [
    item("resumen-icbc", "imported", { kind: "statement", documentId: "s1", detail: "ICBC · 64 movimientos" }),
    item("cupon-hipoteca", "duplicate", { kind: "coupon", documentId: "c1", detail: "Cuota 14" }),
    item("factura-luz", "skipped"),
  ],
});

const disabled = (source: MailSource, missing: string[]): MailSourceStatusDTO =>
  ({ source, enabled: false, missing, scope: null, intervalMinutes: null, lastRun: null });

const icloudEnabled = (lastRun: MailSyncRunDTO | null = null): MailSourceStatusDTO =>
  ({ source: "icloud", enabled: true, missing: [], scope: ICLOUD_SCOPE, intervalMinutes: 360, lastRun });

const GMAIL_ENABLED: MailSourceStatusDTO =
  { source: "gmail", enabled: true, missing: [], scope: QUERY, intervalMinutes: null, lastRun: null };

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface ApiHandlers {
  status: () => Response;
  sync?: () => Response | Promise<Response>;
}

const calls: { url: string; method: string }[] = [];
const SYNC_URL = /^\/api\/mail\/\w+\/sync$/;

const stubApi = ({ status, sync = () => respond(SYNC_RUN) }: ApiHandlers) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    return SYNC_URL.test(url) && method === "POST" ? sync() : status();
  }));
};

const withStatuses = (...statuses: MailSourceStatusDTO[]) => stubApi({ status: () => respond(statuses) });

const card = (name: string) => screen.findByRole("region", { name });

const icloudButton = () => screen.findByRole("button", { name: "Buscar en iCloud" });

beforeEach(() => {
  calls.length = 0;
  emulateDesktop();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MailImportSection", () => {
  it("muestra una tarjeta por fuente, iCloud primero", async () => {
    withStatuses(disabled("icloud", ["ICLOUD_USER"]), disabled("gmail", GMAIL_VARS));
    renderWithProviders(<MailImportSection />);
    expect(screen.getByRole("heading", { level: 2, name: "Mails" })).toBeInTheDocument();
    await card("iCloud");
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual(["iCloud", "Gmail"]);
  });

  it("deshabilitadas explican qué falta y no ofrecen buscar", async () => {
    withStatuses(disabled("icloud", ["ICLOUD_USER"]), disabled("gmail", GMAIL_VARS));
    renderWithProviders(<MailImportSection />);
    const icloud = await card("iCloud");
    expect(within(icloud).getByText("Importación desde iCloud deshabilitada")).toBeInTheDocument();
    expect(within(icloud).getByText(
      "Falta ICLOUD_USER. Los pasos están en el README, sección «Importar desde iCloud»; después reiniciá el server.",
    )).toBeInTheDocument();
    const gmail = await card("Gmail");
    expect(within(gmail).getByText(/^Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buscar en/i })).not.toBeInTheDocument();
  });

  it("iCloud sin la contraseña en el Llavero lo dice", async () => {
    withStatuses(disabled("icloud", ["la contraseña de app en el Llavero"]), disabled("gmail", GMAIL_VARS));
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText(/^Falta la contraseña de app en el Llavero\. Los pasos están en el README/)).toBeInTheDocument();
  });

  it("si falla el status muestra el error", async () => {
    stubApi({ status: () => respond({ error: "Mongo caído" }, 500) });
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText("Mongo caído")).toBeInTheDocument();
  });

  it("habilitadas y sin corridas invitan a buscar, cada una con su alcance", async () => {
    withStatuses(icloudEnabled(), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    const icloud = await card("iCloud");
    expect(within(icloud).getByText("Todavía no buscaste en iCloud.")).toBeInTheDocument();
    expect(within(icloud).getByText("Búsqueda automática: cada 6 h")).toBeInTheDocument();
    expect(within(icloud).getByText(`Revisa: ${ICLOUD_SCOPE}`)).toBeInTheDocument();
    expect(await icloudButton()).toBeEnabled();
    const gmail = await card("Gmail");
    expect(within(gmail).getByText(`Consulta: ${QUERY}`)).toBeInTheDocument();
    expect(within(gmail).getByText("Búsqueda automática: apagada")).toBeInTheDocument();
    expect(within(gmail).getByRole("button", { name: "Buscar en Gmail" })).toBeEnabled();
  });

  it("buscar en iCloud llama a su ruta y muestra el resultado en su tarjeta", async () => {
    withStatuses(icloudEnabled(), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    await userEvent.click(await icloudButton());
    const icloud = await card("iCloud");
    expect(await within(icloud).findByText("Revisé 3 mails nuevos: 1 importado · 1 ya estaba · 1 omitido")).toBeInTheDocument();
    expect(calls).toContainEqual({ url: "/api/mail/icloud/sync", method: "POST" });
    expect(within(icloud).getByText("resumen-icbc.pdf")).toBeInTheDocument();
    expect(within(icloud).getByText(`Tarjeta · ICBC · 64 movimientos · ${formatLocalDate(RECEIVED_AT)}`)).toBeInTheDocument();
    expect(within(icloud).queryByText("factura-luz.pdf")).not.toBeInTheDocument();
    expect(within(await card("Gmail")).queryByText(/^Revisé/)).not.toBeInTheDocument();
  });

  it("mientras busca el botón dice «Buscando…» y queda deshabilitado", async () => {
    let settle: (response: Response) => void = () => {};
    stubApi({
      status: () => respond([icloudEnabled(), GMAIL_ENABLED]),
      sync: () => new Promise<Response>((resolve) => {
        settle = resolve;
      }),
    });
    renderWithProviders(<MailImportSection />);
    await userEvent.click(await icloudButton());
    expect(await screen.findByRole("button", { name: "Buscando…" })).toBeDisabled();
    settle(respond(SYNC_RUN));
    expect(await icloudButton()).toBeEnabled();
  });

  it("si la búsqueda falla muestra el error del server", async () => {
    stubApi({
      status: () => respond([icloudEnabled(), GMAIL_ENABLED]),
      sync: () => respond({ error: "iCloud no está configurado: falta ICLOUD_USER" }, 409),
    });
    renderWithProviders(<MailImportSection />);
    await userEvent.click(await icloudButton());
    expect(await screen.findByText("iCloud no está configurado: falta ICLOUD_USER")).toBeInTheDocument();
  });

  it("los omitidos se ven al desplegarlos", async () => {
    withStatuses(icloudEnabled(SYNC_RUN), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    const toggle = await screen.findByRole("button", { name: "Ver omitidos (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(await screen.findByText("factura-luz.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar omitidos" })).toHaveAttribute("aria-expanded", "true");
  });

  it("una corrida con error muestra el motivo", async () => {
    const message = "iCloud rechazó el usuario o la contraseña de app. Generá una nueva en account.apple.com y actualizala en el Llavero (ledgerly-icloud-imap).";
    withStatuses(icloudEnabled(runOf({ trigger: "job", status: "error", error: message })), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText(/^Última búsqueda: .+ \(automática\)$/)).toBeInTheDocument();
  });

  it("si quedan mails por revisar lo avisa con el botón de su fuente", async () => {
    withStatuses(icloudEnabled(runOf({ messagesChecked: 50, hasMore: true, items: [item("a", "skipped")] })), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    expect(await screen.findByText("Quedan mails por revisar: tocá «Buscar en iCloud» otra vez.")).toBeInTheDocument();
  });

  it("en compu el botón no ocupa todo el ancho", async () => {
    withStatuses(icloudEnabled(), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    expect(await icloudButton()).not.toHaveClass("MuiButton-fullWidth");
  });

  it("en mobile el botón ocupa todo el ancho", async () => {
    emulateMobile();
    withStatuses(icloudEnabled(SYNC_RUN), GMAIL_ENABLED);
    renderWithProviders(<MailImportSection />);
    expect(await icloudButton()).toHaveClass("MuiButton-fullWidth");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ver omitidos (1)" })).toBeInTheDocument());
  });
});
```

Run: `bunx vitest run client/src/components/MailImportSection.test.tsx`
Expected: FAIL (la sección todavía lee `/gmail/status`).

- [ ] **Step 10: Sección «Mails» — implementación**

`client/src/components/MailSourceCard.tsx`:

```tsx
import { Alert, AlertTitle, Box, Button, Card, CardContent, CircularProgress, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { MAIL_SOURCE_LABELS, type MailSource, type MailSourceStatusDTO } from "@ledgerly/shared";
import { useMailSync } from "../api/hooks.js";
import {
  mailDisabledTitle, mailIntervalLabel, mailLastRunLabel, mailMissingMessage, mailScopeLabel, mailSearchLabel,
} from "../mailImport.js";
import { useIsMobile } from "../useIsMobile.js";
import { MailSyncResult } from "./MailSyncResult.js";
import { tapTargetSx } from "./tapTarget.js";

interface MailSourceCardProps {
  status: MailSourceStatusDTO;
}

interface MailDisabledNoticeProps {
  source: MailSource;
  missing: string[];
}

interface MailSyncCardProps {
  status: MailSourceStatusDTO;
}

const cardContentSx: SxProps<Theme> = { p: 2, "&:last-child": { pb: 2 } };
const headerSx: SxProps<Theme> = {
  display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 2,
};
const textsSx: SxProps<Theme> = { flex: "1 1 240px", minWidth: 0 };

const MailDisabledNotice = ({ source, missing }: MailDisabledNoticeProps) => (
  <Alert severity="info">
    <AlertTitle>{mailDisabledTitle(source)}</AlertTitle>
    {mailMissingMessage(source, missing)}
  </Alert>
);

const MailSyncCard = ({ status }: MailSyncCardProps) => {
  const isMobile = useIsMobile();
  const sync = useMailSync(status.source);
  const run = sync.data ?? status.lastRun;
  const handleSync = () => sync.mutate();
  const buttonLabel = sync.isPending ? "Buscando…" : mailSearchLabel(status.source);
  const buttonIcon = sync.isPending ? <CircularProgress size={16} color="inherit" /> : <MailOutlineIcon />;
  const intervalText = `Búsqueda automática: ${mailIntervalLabel(status.intervalMinutes)}`;

  return (
    <Card variant="outlined">
      <CardContent sx={cardContentSx}>
        <Box sx={headerSx}>
          <Box sx={textsSx}>
            <Typography variant="body1">{mailLastRunLabel(status.source, run)}</Typography>
            <Typography variant="body2" color="text.secondary">{intervalText}</Typography>
            <Typography variant="caption" component="p" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
              {mailScopeLabel(status.source, status.scope)}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={buttonIcon}
            onClick={handleSync}
            disabled={sync.isPending}
            fullWidth={isMobile}
            sx={isMobile ? tapTargetSx : undefined}
          >
            {buttonLabel}
          </Button>
        </Box>
        {sync.isError && <Alert severity="error" sx={{ mt: 2 }}>{sync.error.message}</Alert>}
        {run && <MailSyncResult run={run} />}
      </CardContent>
    </Card>
  );
};

export const MailSourceCard = ({ status }: MailSourceCardProps) => {
  const title = MAIL_SOURCE_LABELS[status.source];
  const body = status.enabled
    ? <MailSyncCard status={status} />
    : <MailDisabledNotice source={status.source} missing={status.missing} />;

  return (
    <Box component="section" aria-label={title}>
      <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>{title}</Typography>
      {body}
    </Box>
  );
};
```

Reemplazar `client/src/components/MailImportSection.tsx` completo por:

```tsx
import { Alert, CircularProgress, Stack, Typography } from "@mui/material";
import type { MailSourceStatusDTO } from "@ledgerly/shared";
import { useMailStatus } from "../api/hooks.js";
import { MailSourceCard } from "./MailSourceCard.js";

interface MailSourceListProps {
  statuses: MailSourceStatusDTO[];
}

const MailSourceList = ({ statuses }: MailSourceListProps) => {
  const cards = statuses.map((status) => <MailSourceCard key={status.source} status={status} />);
  return <Stack spacing={3}>{cards}</Stack>;
};

const MailImportPanel = () => {
  const { data: statuses, isLoading, isError, error } = useMailStatus();

  if (isLoading) return <CircularProgress size={24} />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;
  if (!statuses) return null;
  return <MailSourceList statuses={statuses} />;
};

export const MailImportSection = () => (
  <>
    <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>Mails</Typography>
    <MailImportPanel />
  </>
);
```

En `client/src/pages/ImportPage.test.tsx`:
1. En el import de `@ledgerly/shared`, cambiar `gmailStatusDtoSchema` por `mailSourceStatusDtoSchema`.
2. Reemplazar la constante `GMAIL_DISABLED` por:

```ts
const MAIL_DISABLED = [
  { source: "icloud", enabled: false, missing: ["ICLOUD_USER"], scope: null, intervalMinutes: null, lastRun: null },
  {
    source: "gmail", enabled: false, missing: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
    scope: null, intervalMinutes: null, lastRun: null,
  },
];
```

3. Cambiar `if (url.includes("/gmail/status")) return GMAIL_DISABLED;` por `if (url.includes("/mail/status")) return MAIL_DISABLED;`.
4. Cambiar `expect(() => gmailStatusDtoSchema.parse(GMAIL_DISABLED)).not.toThrow();` por `expect(() => mailSourceStatusDtoSchema.array().parse(MAIL_DISABLED)).not.toThrow();`.
5. En el test «la sección Gmail va después…», renombrarlo a «la sección Mails va después del resultado de la subida y antes de «Archivos importados»» y cambiar las dos apariciones de `"Gmail"` por `"Mails"`.

Run: `bunx vitest run client/src/components/MailImportSection.test.tsx client/src/pages/ImportPage.test.tsx`
Expected: PASS.

- [ ] **Step 11: README y `.env.example`**

En `.env.example`, al final:

```
# Importación desde iCloud (opcional). Pasos en el README, sección «Importar desde iCloud».
# La contraseña de app va en el Llavero de macOS, no acá.
ICLOUD_USER=
# ICLOUD_SINCE=2026-09-01
# ICLOUD_MAILBOXES=INBOX
# ICLOUD_SYNC_INTERVAL_MINUTES=360
```

En `README.md`:

1. Antes de `## Importar desde Gmail (opcional)`, agregar:

```md
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
```

2. En la sección de Gmail, cambiar «la sección «Gmail» de Importar dice qué falta» por «la tarjeta «Gmail» de la sección «Mails» de Importar dice qué falta».
3. En «Privacidad», agregar al final: `La contraseña de app de iCloud vive solo en el Llavero de macOS: el server la lee en cada corrida, nunca la loguea ni la manda al cliente.`

- [ ] **Step 12: Verificar que no queda nada de la API vieja**

```bash
git grep -nE 'gmailStatusDtoSchema|GmailStatusDTO|useGmailStatus|useGmailSync|/api/gmail|gmailRouter|gmailMissingVarsMessage|gmailLastRunLabel' -- server/src shared/src client/src
```

Expected: sin salida.

- [ ] **Step 13: Suite completa**

```bash
bun run typecheck && bun run test
```

Expected: verde.

- [ ] **Step 14: Commit (solo si el usuario lo autorizó)**

```bash
git add -A -- server/src shared/src client/src README.md .env.example
git commit -m "feat: iCloud como segunda fuente de mails, con una tarjeta por fuente en Importar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Notificaciones de macOS

El job avisa lo que importó, lo que falló y los documentos reconocidos que no se pudieron leer; una corrida con error avisa solo si la anterior de esa fuente no había fallado. Para distinguir un PDF ajeno de un resumen roto, el registro guarda el tipo del documento reconocido.

**Files:**
- Create: `server/src/mail/notifyRun.ts`, `server/src/mail/notifyRun.test.ts`
- Modify: `server/src/mail/syncMail.ts`, `server/src/mail/syncMail.test.ts`, `server/src/mail/mailJob.ts`, `server/src/mail/mailJob.test.ts`, `client/src/mailImport.ts`, `client/src/mailImport.test.ts`

**Interfaces:**
- Consumes: `MailSyncRunDTO`, `MAIL_SOURCE_LABELS` (Task 3); `findLastMailRun`, `runMailSync` (Task 3).
- Produces:

```ts
export function classifyImportError(err: unknown): { outcome: "skipped" | "failed"; detail: string; kind: ImportedFileKind | null };
export type Notify = (title: string, message: string) => Promise<void>;
export interface NotifyDeps { notify?: Notify; platform?: NodeJS.Platform }
export const osascriptNotify: Notify;
export function runNotifications(run: MailSyncRunDTO, previous: MailSyncRunDTO | null): string[];
export function notifyRun(run: MailSyncRunDTO, previous: MailSyncRunDTO | null, deps?: NotifyDeps): Promise<void>;
```

- [ ] **Step 1: Tipo del documento roto — tests que fallan**

En `server/src/mail/syncMail.test.ts`, cambiar el import de `../ingestion/errors.js` por:

```ts
import {
  EncryptedPdfError, InvalidAutoCouponError, InvalidCouponError, InvalidPayslipError, NoTransactionsError, UnsupportedFormatError,
} from "../ingestion/errors.js";
```

y reemplazar el `describe("classifyImportError", …)` entero por:

```ts
describe("classifyImportError", () => {
  it("un error de ingestión es omitido con su motivo y sin tipo", () => {
    expect(classifyImportError(new UnsupportedFormatError()))
      .toEqual({ outcome: "skipped", detail: "Formato de resumen no reconocido", kind: null });
    expect(classifyImportError(new EncryptedPdfError()))
      .toEqual({ outcome: "skipped", detail: "El PDF está protegido con contraseña", kind: null });
  });

  it("un documento reconocido que no se pudo leer guarda su tipo", () => {
    expect(classifyImportError(new NoTransactionsError())).toMatchObject({ outcome: "skipped", kind: "statement" });
    expect(classifyImportError(new InvalidCouponError())).toMatchObject({ outcome: "skipped", kind: "coupon" });
    expect(classifyImportError(new InvalidAutoCouponError())).toMatchObject({ outcome: "skipped", kind: "auto" });
    expect(classifyImportError(new InvalidPayslipError())).toMatchObject({ outcome: "skipped", kind: "payslip" });
  });

  it("cualquier otro error es fallido, con su mensaje o «Error inesperado»", () => {
    expect(classifyImportError(new Error("Mongo se cayó"))).toEqual({ outcome: "failed", detail: "Mongo se cayó", kind: null });
    expect(classifyImportError(new Error(""))).toEqual({ outcome: "failed", detail: "Error inesperado", kind: null });
    expect(classifyImportError("texto")).toEqual({ outcome: "failed", detail: "Error inesperado", kind: null });
  });
});
```

y agregar al `describe("syncMail", …)`:

```ts
  it("un documento reconocido que no se puede leer queda omitido con su tipo", async () => {
    const client = fakeMailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-roto.pdf")] }]);
    const importPdf = importByName({ "resumen-roto.pdf": new NoTransactionsError() });
    const run = await syncMail({ ...gmail(client), trigger: "manual", importPdf });
    expect(summaryOf(run.items)).toEqual([{ fileName: "resumen-roto.pdf", outcome: "skipped", kind: "statement", documentId: null }]);
  });
```

Run: `bunx vitest run server/src/mail/syncMail.test.ts`
Expected: FAIL (`classifyImportError` no devuelve `kind`).

- [ ] **Step 2: Tipo del documento roto — implementación**

En `server/src/mail/syncMail.ts`:

1. Cambiar el import de `../ingestion/errors.js` por:

```ts
import {
  IngestionError, InvalidAutoCouponError, InvalidCouponError, InvalidPayslipError, NoTransactionsError,
} from "../ingestion/errors.js";
```

2. Reemplazar `interface ImportErrorOutcome { … }` y `classifyImportError` por:

```ts
interface ImportErrorOutcome {
  outcome: "skipped" | "failed";
  detail: string;
  kind: ImportedFileKind | null;
}

const recognizedKindOf = (err: IngestionError): ImportedFileKind | null => {
  if (err instanceof NoTransactionsError) return "statement";
  if (err instanceof InvalidCouponError) return "coupon";
  if (err instanceof InvalidAutoCouponError) return "auto";
  if (err instanceof InvalidPayslipError) return "payslip";
  return null;
};

export function classifyImportError(err: unknown): ImportErrorOutcome {
  if (err instanceof IngestionError) return { outcome: "skipped", detail: err.message, kind: recognizedKindOf(err) };
  return { outcome: "failed", detail: errorMessage(err), kind: null };
}
```

3. En el `catch` de `importPart`, cambiar `return { ...classifyImportError(err), ...NO_DOCUMENT };` por:

```ts
    return { ...classifyImportError(err), documentId: null };
```

Run: `bunx vitest run server/src/mail/syncMail.test.ts`
Expected: PASS.

- [ ] **Step 3: Los documentos rotos quedan a la vista en la UI**

En `client/src/mailImport.test.ts`, agregar al `describe("splitMailItems", …)`:

```ts
  it("un documento reconocido que no se pudo leer queda a la vista, después de los errores", () => {
    const items = [
      item("dup", "duplicate"), item("roto", "skipped", { kind: "statement" }), item("err", "failed"), item("omit", "skipped"),
    ];
    const { visible, skipped } = splitMailItems(items);
    expect(visible.map(({ id }) => id)).toEqual(["err", "roto", "dup"]);
    expect(skipped.map(({ id }) => id)).toEqual(["omit"]);
  });
```

Run: `bunx vitest run client/src/mailImport.test.ts`
Expected: FAIL (`roto` queda entre los omitidos).

En `client/src/mailImport.ts`, borrar `const VISIBLE_ORDER …` y reemplazar `splitMailItems` por:

```ts
const isUnreadable = ({ outcome, kind }: MailSyncItemDTO): boolean => outcome === "skipped" && kind !== null;

const byOutcome = (items: MailSyncItemDTO[], outcome: MailSyncOutcome): MailSyncItemDTO[] =>
  items.filter((item) => item.outcome === outcome);

export const splitMailItems = (items: MailSyncItemDTO[]): MailItemsSplit => ({
  visible: [
    ...byOutcome(items, "imported"), ...byOutcome(items, "failed"), ...items.filter(isUnreadable), ...byOutcome(items, "duplicate"),
  ],
  skipped: byOutcome(items, "skipped").filter((item) => !isUnreadable(item)),
});
```

Run: `bunx vitest run client/src/mailImport.test.ts`
Expected: PASS.

- [ ] **Step 4: Notificaciones — tests que fallan**

`server/src/mail/notifyRun.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type { MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((
    _file: string, _args: string[], callback: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    callback(null, { stdout: "", stderr: "" });
  }),
}));
import { execFile } from "node:child_process";
import { notifyRun, osascriptNotify, runNotifications } from "./notifyRun.js";

const item = (fileName: string, outcome: MailSyncItemDTO["outcome"], overrides: Partial<MailSyncItemDTO> = {}): MailSyncItemDTO => ({
  id: fileName, fileName, receivedAt: "2026-09-30T13:00:00.000Z", outcome, kind: null, documentId: null, detail: "detalle",
  ...overrides,
});

const runOf = (overrides: Partial<MailSyncRunDTO> = {}): MailSyncRunDTO => ({
  source: "icloud", trigger: "job", startedAt: "2026-10-05T12:00:00.000Z", finishedAt: "2026-10-05T12:00:09.000Z",
  status: "ok", error: null, messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

const AUTH_ERROR = "iCloud rechazó el usuario o la contraseña de app.";

describe("runNotifications", () => {
  it("un importado se anuncia con su detalle", () => {
    const run = runOf({ items: [item("Resumen6oct2026.pdf", "imported", { kind: "statement", detail: "ICBC · 64 movimientos" })] });
    expect(runNotifications(run, null)).toEqual(["Importé Resumen6oct2026.pdf: ICBC · 64 movimientos"]);
  });

  it("varios importados van en un solo aviso", () => {
    const run = runOf({ items: [item("a.pdf", "imported"), item("b.pdf", "imported"), item("c.pdf", "imported")] });
    expect(runNotifications(run, null)).toEqual(["Importé 3 documentos: a.pdf, b.pdf y c.pdf"]);
  });

  it("avisa los fallidos y los documentos reconocidos que no se pudieron leer, no los ajenos ni los repetidos", () => {
    const run = runOf({
      items: [
        item("roto.pdf", "failed", { detail: "Mongo se cayó" }),
        item("Resumen6oct2026.pdf", "skipped", { kind: "statement", detail: "No se encontraron movimientos en el resumen" }),
        item("factura.pdf", "skipped", { detail: "Formato de resumen no reconocido" }),
        item("viejo.pdf", "duplicate"),
      ],
    });
    expect(runNotifications(run, null)).toEqual([
      "No pude importar roto.pdf: Mongo se cayó",
      "Resumen6oct2026.pdf parece un resumen pero no lo pude leer: No se encontraron movimientos en el resumen",
    ]);
  });

  it("una corrida con error avisa solo si la anterior de la fuente no había fallado", () => {
    const failed = runOf({ status: "error", error: AUTH_ERROR });
    expect(runNotifications(failed, null)).toEqual([AUTH_ERROR]);
    expect(runNotifications(failed, runOf())).toEqual([AUTH_ERROR]);
    expect(runNotifications(failed, runOf({ status: "error", error: AUTH_ERROR }))).toEqual([]);
  });

  it("sin novedades, o en una corrida manual, no avisa nada", () => {
    expect(runNotifications(runOf({ items: [item("viejo.pdf", "duplicate")] }), null)).toEqual([]);
    expect(runNotifications(runOf({ trigger: "manual", items: [item("a.pdf", "imported")] }), null)).toEqual([]);
    expect(runNotifications(runOf({ trigger: "manual", status: "error", error: AUTH_ERROR }), null)).toEqual([]);
  });
});

describe("notifyRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("manda cada aviso con el título de la fuente", async () => {
    const notify = vi.fn(async (): Promise<void> => undefined);
    await notifyRun(runOf({ items: [item("a.pdf", "imported", { detail: "ICBC" })] }), null, { notify, platform: "darwin" });
    expect(notify).toHaveBeenCalledWith("Ledgerly · iCloud", "Importé a.pdf: ICBC");
  });

  it("fuera de macOS no hace nada", async () => {
    const notify = vi.fn(async (): Promise<void> => undefined);
    await notifyRun(runOf({ items: [item("a.pdf", "imported")] }), null, { notify, platform: "linux" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("si una notificación falla lo loguea y sigue con la próxima", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const notify = vi.fn(async (): Promise<void> => {
      throw new Error("osascript no está");
    });
    const run = runOf({ items: [item("a.pdf", "imported"), item("b.pdf", "failed")] });
    await expect(notifyRun(run, null, { notify, platform: "darwin" })).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledWith("Ledgerly · iCloud: no pude mostrar la notificación — osascript no está");
  });
});

describe("osascriptNotify", () => {
  it("pasa título y texto como argumentos, sin meterlos en el AppleScript", async () => {
    await osascriptNotify("Ledgerly · Gmail", 'Importé "raro" & cía.pdf: x');
    expect(execFile).toHaveBeenCalledWith(
      "osascript",
      [
        "-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run",
        "Ledgerly · Gmail", 'Importé "raro" & cía.pdf: x',
      ],
      expect.any(Function),
    );
  });
});
```

Run: `bunx vitest run server/src/mail/notifyRun.test.ts`
Expected: FAIL («Cannot find module './notifyRun.js'»).

- [ ] **Step 5: Notificaciones — implementación**

`server/src/mail/notifyRun.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MAIL_SOURCE_LABELS, type ImportedFileKind, type MailSyncItemDTO, type MailSyncRunDTO } from "@ledgerly/shared";

export type Notify = (title: string, message: string) => Promise<void>;

export interface NotifyDeps {
  notify?: Notify;
  platform?: NodeJS.Platform;
}

const execFileAsync = promisify(execFile);

const APPLESCRIPT = ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run"];
const UNEXPECTED_ERROR = "Error inesperado";

const KIND_PHRASES: Record<ImportedFileKind, string> = {
  statement: "un resumen",
  coupon: "un cupón de la hipoteca",
  auto: "un cupón del plan del auto",
  payslip: "un recibo de sueldo",
};

export const osascriptNotify: Notify = async (title, message) => {
  await execFileAsync("osascript", [...APPLESCRIPT, title, message]);
};

const joinWithY = (items: string[]): string =>
  (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

const itemsWith = (run: MailSyncRunDTO, outcome: MailSyncItemDTO["outcome"]): MailSyncItemDTO[] =>
  run.items.filter((item) => item.outcome === outcome);

const importedMessages = (items: MailSyncItemDTO[]): string[] => {
  if (items.length === 0) return [];
  if (items.length === 1) return [`Importé ${items[0].fileName}: ${items[0].detail}`];
  return [`Importé ${items.length} documentos: ${joinWithY(items.map(({ fileName }) => fileName))}`];
};

const failedMessages = (items: MailSyncItemDTO[]): string[] =>
  items.map(({ fileName, detail }) => `No pude importar ${fileName}: ${detail}`);

const unreadableMessages = (items: MailSyncItemDTO[]): string[] =>
  items.flatMap(({ fileName, detail, kind }) => (kind ? [`${fileName} parece ${KIND_PHRASES[kind]} pero no lo pude leer: ${detail}`] : []));

const runErrorMessages = (run: MailSyncRunDTO, previous: MailSyncRunDTO | null): string[] =>
  (run.status === "error" && previous?.status !== "error" ? [run.error ?? UNEXPECTED_ERROR] : []);

export function runNotifications(run: MailSyncRunDTO, previous: MailSyncRunDTO | null): string[] {
  if (run.trigger !== "job") return [];
  return [
    ...importedMessages(itemsWith(run, "imported")),
    ...failedMessages(itemsWith(run, "failed")),
    ...unreadableMessages(itemsWith(run, "skipped")),
    ...runErrorMessages(run, previous),
  ];
}

export async function notifyRun(
  run: MailSyncRunDTO, previous: MailSyncRunDTO | null, { notify = osascriptNotify, platform = process.platform }: NotifyDeps = {},
): Promise<void> {
  if (platform !== "darwin") return;
  const title = `Ledgerly · ${MAIL_SOURCE_LABELS[run.source]}`;
  for (const message of runNotifications(run, previous)) {
    try {
      await notify(title, message);
    } catch (err) {
      console.error(`${title}: no pude mostrar la notificación — ${err instanceof Error ? err.message : UNEXPECTED_ERROR}`);
    }
  }
}
```

Run: `bunx vitest run server/src/mail/notifyRun.test.ts`
Expected: PASS.

- [ ] **Step 6: El job avisa — tests que fallan**

En `server/src/mail/mailJob.test.ts`, después del `vi.mock("./syncMail.js", …)` y su import:

```ts
vi.mock("./notifyRun.js", () => ({ notifyRun: vi.fn() }));
import { notifyRun } from "./notifyRun.js";
```

En el `beforeEach` del `describe("startMailJob", …)`, sumar:

```ts
    vi.mocked(notifyRun).mockReset();
    vi.mocked(notifyRun).mockResolvedValue(undefined);
```

y agregar los tests:

```ts
  it("después de cada corrida automática avisa con la corrida y la anterior de su fuente", async () => {
    const previous = runOf({ startedAt: minutesBefore(400).toISOString(), status: "error", error: "x" });
    const run = runOf({ status: "error", error: "x" });
    vi.mocked(findLastMailRun).mockResolvedValue(previous);
    vi.mocked(runMailSync).mockResolvedValue(run);
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(notifyRun).toHaveBeenCalledWith(run, previous);
    stop();
  });

  it("si no puede leer la corrida anterior avisa igual, sin anterior", async () => {
    vi.mocked(findLastMailRun).mockRejectedValue(new Error("Mongo caído"));
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(notifyRun).toHaveBeenCalledWith(runOf(), null);
    stop();
  });
```

Run: `bunx vitest run server/src/mail/mailJob.test.ts`
Expected: FAIL (`notifyRun` no se llama).

- [ ] **Step 7: El job avisa — implementación**

En `server/src/mail/mailJob.ts`:

1. Sumar `import { notifyRun } from "./notifyRun.js";`.
2. Reemplazar `lastStartedAt` por:

```ts
const previousRun = async (source: MailSource): Promise<MailSyncRunDTO | null> => {
  try {
    return await findLastMailRun(source);
  } catch {
    return null;
  }
};
```

3. Reemplazar `runOnce` por:

```ts
  const runOnce = async (): Promise<void> => {
    const previous = await previousRun(source);
    try {
      const run = await runMailSync(source, openClient, "job");
      logRun(run);
      await notifyRun(run, previous);
    } catch (err) {
      console.error(`${logPrefix(source, "job")}: error — ${err instanceof Error ? err.message : UNEXPECTED_ERROR}`);
    }
    schedule(intervalMinutes * MINUTE_MS);
  };
```

4. Reemplazar la línea `schedule(nextMailRunDelayMs(await lastStartedAt(source), intervalMinutes, new Date()));` por:

```ts
  const last = await previousRun(source);
  schedule(nextMailRunDelayMs(last ? new Date(last.startedAt) : null, intervalMinutes, new Date()));
```

Run: `bunx vitest run server/src/mail/mailJob.test.ts`
Expected: PASS.

- [ ] **Step 8: Suite completa**

```bash
bun run typecheck && bun run test
```

Expected: verde.

- [ ] **Step 9: Commit (solo si el usuario lo autorizó)**

```bash
git add -- server/src/mail/notifyRun.ts server/src/mail/notifyRun.test.ts server/src/mail/syncMail.ts server/src/mail/syncMail.test.ts \
  server/src/mail/mailJob.ts server/src/mail/mailJob.test.ts client/src/mailImport.ts client/src/mailImport.test.ts
git commit -m "feat(server): las corridas automáticas de mails avisan con una notificación de macOS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verificación con iCloud real

Prueba de punta a punta contra la casilla real, con un server temporal propio. **Escribe en la base compartida** (es lo que se busca: entran los resúmenes de septiembre), así que pedir el OK del usuario antes del Step 4. El deploy queda para después de que el usuario mergee la pila (`feat/base-nuevas-features` → `feat/importacion-gmail` → `feat/importacion-icloud`) a `main`.

**Files:** ninguno.

- [ ] **Step 1: Suite y build**

```bash
bun run typecheck && bun run test && bun run build
```

Expected: verde y `client/dist` generado.

- [ ] **Step 2: Elegir un puerto libre**

```bash
lsof -iTCP:4300 -sTCP:LISTEN
```

Expected: sin salida. Si está ocupado, probar 4301, 4302…

- [ ] **Step 3: Levantar el server temporal**

Correr en background (Bash con `run_in_background`), con la carpeta que salió de la Task 1 en `ICLOUD_MAILBOXES`:

```bash
MONGO_URL=mongodb://localhost:27018/ledgerly PORT=4300 HOST=127.0.0.1 \
ICLOUD_USER=<cuenta>@icloud.com ICLOUD_SINCE=2026-09-01 ICLOUD_MAILBOXES=INBOX \
node --import tsx server/src/index.ts
```

Anotar el PID. Expected en la salida: `iCloud: búsqueda manual; automática apagada (INBOX · desde el 01/09/2026)` y `Ledgerly API en http://127.0.0.1:4300`.

- [ ] **Step 4: Status y primera corrida (con el OK del usuario)**

```bash
curl -s http://127.0.0.1:4300/api/mail/status | jq '.[] | {source, enabled, missing, scope}'
curl -s -X POST http://127.0.0.1:4300/api/mail/icloud/sync | jq '{status, error, messagesChecked, items: [.items[] | {fileName, outcome, kind, detail}]}'
```

Expected: iCloud `enabled: true`; la corrida `status: "ok"`, con los resúmenes ICBC y Visa Signature de septiembre como `imported` y lo que ya estaba cargado (por ejemplo, el resumen que vence el 08/09) como `duplicate`.

- [ ] **Step 5: Segunda corrida idempotente**

```bash
curl -s -X POST http://127.0.0.1:4300/api/mail/icloud/sync | jq '{status, messagesChecked}'
```

Expected: `{"status": "ok", "messagesChecked": 0}`.

- [ ] **Step 6: Pantalla**

Abrir `http://127.0.0.1:4300/import`: la sección «Mails» muestra la tarjeta de iCloud con la última búsqueda y su resultado, y la de Gmail deshabilitada. Repetir con el ancho de un celular (≈390 px): las tarjetas se apilan y el botón ocupa todo el ancho.

- [ ] **Step 7: Notificación**

```bash
bunx tsx -e 'import { osascriptNotify } from "./server/src/mail/notifyRun.ts"; await osascriptNotify("Ledgerly · iCloud", "Prueba de notificación");'
```

Expected: aparece la notificación en la Mac. Si no aparece, habilitar las notificaciones de «Script Editor» en Ajustes → Notificaciones y repetir.

- [ ] **Step 8: Apagar el server temporal**

```bash
kill <PID del Step 3>
```

Nunca matar por puerto.

- [ ] **Step 9: Reportar**

Contarle al usuario qué se importó, qué quedó como «Ya estaba» y lo que haya fallado, y dejarle los pasos de la versión publicada para cuando mergee la pila: las líneas `ICLOUD_*` en `~/Services/ledgerly/.env` (con `ICLOUD_SYNC_INTERVAL_MINUTES=360`), `launchctl kickstart -k gui/$(id -u)/com.ledgerly.server` y chequear en `server.log` la línea `iCloud: búsqueda automática cada 360 min (…)`. Mencionar que las colecciones vacías `gmailsyncruns` y `gmailattachments` se pueden borrar a mano.
