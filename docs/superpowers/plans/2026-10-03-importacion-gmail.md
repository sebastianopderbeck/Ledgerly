# Importar resúmenes desde Gmail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el server lea Gmail en solo lectura, baje los PDFs adjuntos en memoria y los importe con el mismo pipeline que `POST /api/import`, con un botón «Buscar en Gmail» en Importar y un job opcional, y que sin credenciales todo quede deshabilitado de forma explícita.

**Architecture:** El handler de `POST /api/import` se mueve a `importPdf` (un único punto de entrada para importar un PDF), que la ruta y la sincronización comparten. `server/src/gmail/` tiene la config leída del entorno, un cliente REST de Gmail con `fetch` (sin dependencias), la sincronización idempotente con un registro de adjuntos `(messageId, partId)`, el job con `setTimeout` encadenado y el script de autorización OAuth con PKCE. El cliente suma lógica pura en `gmailImport.ts` y dos componentes que pintan el status y la última corrida.

**Tech Stack:** TypeScript, Express + Mongoose (server), React 18 + MUI 6 + React Query 5 (client), Zod DTOs en `shared`, Vitest + supertest + `mongodb-memory-server`, bun.

**Spec:** `docs/superpowers/specs/2026-10-03-importacion-gmail-design.md`

## Global Constraints

- **La base ya trae** modelos (`GmailSyncRunModel`, `GmailAttachmentModel`), DTOs y tipos `Gmail*`, hooks `useGmailStatus` / `useGmailSync`, el slot `<GmailImportSection />` en `ImportPage`, el script `gmail:auth`, `.env.example` y README. **No tocar**: `shared/*`, `server/src/db/models.ts`, `server/src/http/app.ts`, `server/src/http/mappers.ts`, `client/src/api/hooks.ts`, `ImportPage.tsx`, `ImportPage.test.tsx`, `App.tsx`, `layout/*`, `package.json`(s), `bun.lock`, `.env.example`, `README.md`.
- **Constantes:** `MAX_PDF_BYTES = 15 * 1024 * 1024`; `GMAIL_LIST_LIMIT = 500`; `GMAIL_MAX_MESSAGES_PER_RUN = 50`; `GMAIL_STARTUP_DELAY_MS = 60_000`; `MIN_GMAIL_INTERVAL_MINUTES = 15`; `DEFAULT_GMAIL_QUERY = "has:attachment filename:pdf newer_than:90d"`; `GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"`; `NO_PDF_PART_ID = "-"`.
- **Privacidad:** ningún mensaje de error, log ni respuesta incluye el refresh token, el secreto ni el cuerpo de una respuesta de Google. No se guarda asunto, remitente ni cuerpo de ningún mail. Fixtures 100 % sintéticos (`msg-1`, `resumen-sintetico.pdf`, textos de `server/src/parsers/__fixtures__/*.sample.txt`). `examples/` nunca se commitea.
- **Sin red en tests:** `fetch` stubbeado con `vi.stubGlobal` o cliente de Gmail fake; `fetchOficialRate` mockeado donde se importen cupones o recibos.
- **Sin comentarios en el código** (regla global del usuario). Componentes funcionales con destructuring en la firma, fragments cortos, early returns, `key` con id, interfaces para props, `any` prohibido, lógica antes del `return`.
- **Tests del cliente:** el auto-cleanup de RTL está apagado → `afterEach(cleanup)` en todo archivo con más de un `render`.
- **Mobile:** `useIsMobile()`, objetivos táctiles de 44 px con `tapTargetSx` / `MIN_TAP_SIZE` de `client/src/components/tapTarget.ts`.
- **Comandos:** un archivo `bunx vitest run <ruta>`; suite `bun run test`; tipos `bun run typecheck`; build `bun run build`.
- **Commits:** en la rama `feat/importacion-gmail`, con pathspec explícito, mensajes convencionales en español (`feat(server): …`, `feat(client): …`, `refactor(server): …`, `docs: …`) que terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca push ni PR.

## Review Focus

- **Mail con dos PDFs cuando Gmail falla al bajar el segundo:** el segundo tiene que quedar `failed` (no ausente) para que el mail vuelva a estar pendiente y la próxima corrida lo importe. Test en Task 5.
- **Error que no es de Gmail fuera de la importación** (Mongo al leer el registro, una excepción cualquiera en `listMessageIds`): la corrida termina en `status: "error"` con el mensaje y `syncGmail` no lanza. Test en Task 5.
- **Corrida que rechaza:** `runGmailSync` tiene que liberar `inFlight` también al rechazar; si no, todas las búsquedas siguientes devuelven el mismo rechazo para siempre. Test en Task 5.
- **El job sobrevive a una corrida que rechaza:** loguea el error y programa la próxima; nunca tira el proceso. Test en Task 7.
- **Mail cuyo cuerpo entero es el PDF** (sin `parts`, `partId: ""` en la raíz): se detecta y se registra con `partId: "0"`, nunca con `""` (que Mongoose rechazaría como `required`). Test en Task 4.

---

### Task 1: `IngestionError`, `importPdf` y la ruta de importación delegando

**Files:**
- Modify: `server/src/ingestion/errors.ts`
- Create: `server/src/ingestion/errors.test.ts`
- Create: `server/src/import/importPdf.ts`
- Create: `server/src/import/importPdf.test.ts`
- Modify: `server/src/http/routes/import.ts`
- Modify: `server/src/http/routes/import.test.ts`

**Interfaces:**
- Produces: `class IngestionError extends Error`, `class EncryptedPdfError extends IngestionError` en `errors.ts`; `MAX_PDF_BYTES`, `interface ImportPdfInput { data: Uint8Array; fileName: string; replace?: boolean }`, `interface ImportPdfOutcome { result: ImportResultUnionDTO; file: ImportedFileDTO }`, `importPdf(input): Promise<ImportPdfOutcome>` en `importPdf.ts`. Los consume `syncGmail` (Task 5).

- [ ] **Step 1: Write the failing tests**

`server/src/ingestion/errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  EncryptedPdfError, IngestionError, InvalidAutoCouponError, InvalidCouponError, InvalidPayslipError,
  NoTextError, NoTransactionsError, UnsupportedFormatError,
} from "./errors.js";

describe("errores de ingestión", () => {
  it("todos extienden IngestionError y conservan su nombre y mensaje", () => {
    const errors = [
      new NoTextError(), new UnsupportedFormatError(), new NoTransactionsError(), new InvalidCouponError(),
      new InvalidAutoCouponError(), new InvalidPayslipError(), new EncryptedPdfError(),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(IngestionError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message.length).toBeGreaterThan(0);
    }
    expect(errors.map((error) => error.name)).toEqual([
      "NoTextError", "UnsupportedFormatError", "NoTransactionsError", "InvalidCouponError",
      "InvalidAutoCouponError", "InvalidPayslipError", "EncryptedPdfError",
    ]);
  });

  it("EncryptedPdfError explica que el PDF tiene contraseña", () => {
    expect(new EncryptedPdfError().message).toBe("El PDF está protegido con contraseña");
  });
});
```

`server/src/import/importPdf.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";

vi.mock("../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn(async () => null) }));
import { extractPdfText } from "../pdf/extract.js";
import { importPdf } from "./importPdf.js";
import { EncryptedPdfError, NoTextError, UnsupportedFormatError } from "../ingestion/errors.js";
import { StatementModel } from "../db/models.js";

withDb();
const mocked = vi.mocked(extractPdfText);
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../parsers/__fixtures__/${name}`, import.meta.url)), "utf8");
const pdf = (label: string) => new TextEncoder().encode(`pdf-sintetico-${label}`);

beforeEach(() => mocked.mockReset());

describe("importPdf", () => {
  it("importa un resumen de tarjeta y describe el archivo", async () => {
    mocked.mockResolvedValue({ text: fixture("icbc.sample.txt"), meta });
    const { result, file } = await importPdf({ data: pdf("icbc"), fileName: "resumen-sintetico.pdf" });
    if (result.kind !== "statement") throw new Error("esperaba un resumen");
    expect(result.status).toBe("imported");
    expect(file).toMatchObject({ id: result.statement.id, kind: "statement", fileName: "resumen-sintetico.pdf" });
    expect(file.description).toBe(`${result.statement.cardLabel} · ${result.transactionCount} movimientos`);
    expect(await StatementModel.countDocuments()).toBe(1);
  });

  it("reimportar el mismo PDF es duplicate y describe el existente", async () => {
    mocked.mockResolvedValue({ text: fixture("icbc.sample.txt"), meta });
    const first = await importPdf({ data: pdf("icbc"), fileName: "resumen-sintetico.pdf" });
    const second = await importPdf({ data: pdf("icbc"), fileName: "resumen-sintetico.pdf" });
    expect(second.result.status).toBe("duplicate");
    expect(second.file.id).toBe(first.file.id);
    expect(second.file.description).toBe(first.file.description);
  });

  it("importa un cupón de la hipoteca", async () => {
    mocked.mockResolvedValue({ text: fixture("icbc-mortgage.sample.txt"), meta });
    const { result, file } = await importPdf({ data: pdf("cupon"), fileName: "cupon-sintetico.pdf" });
    expect(result.kind).toBe("coupon");
    expect(file.kind).toBe("coupon");
    expect(file.description).toMatch(/^Préstamo .+ · cuota 1$/);
  });

  it("importa un cupón del plan del auto", async () => {
    mocked.mockResolvedValue({ text: fixture("auto-plan.sample.txt"), meta });
    const { result, file } = await importPdf({ data: pdf("auto"), fileName: "auto-sintetico.pdf" });
    expect(result.kind).toBe("auto");
    expect(file.kind).toBe("auto");
    expect(file.description).toMatch(/^Grupo .+ · cuota 2$/);
  });

  it("importa un recibo de sueldo", async () => {
    mocked.mockResolvedValue({ text: fixture("payslip.sample.txt"), meta });
    const { result, file } = await importPdf({ data: pdf("recibo"), fileName: "recibo-sintetico.pdf" });
    expect(result.kind).toBe("payslip");
    expect(file.kind).toBe("payslip");
    expect(file.description).toMatch(/^Período \d{4}-\d{2}/);
  });

  it("un PDF con contraseña de usuario es EncryptedPdfError", async () => {
    mocked.mockRejectedValue(Object.assign(new Error("No password given"), { name: "PasswordException" }));
    await expect(importPdf({ data: pdf("protegido"), fileName: "protegido.pdf" }))
      .rejects.toBeInstanceOf(EncryptedPdfError);
  });

  it("otros errores de extracción siguen de largo", async () => {
    mocked.mockRejectedValue(new Error("PDF roto"));
    await expect(importPdf({ data: pdf("roto"), fileName: "roto.pdf" })).rejects.toThrow("PDF roto");
  });

  it("un PDF casi sin texto es NoTextError", async () => {
    mocked.mockResolvedValue({ text: "   corto   ", meta });
    await expect(importPdf({ data: pdf("escaneado"), fileName: "escaneado.pdf" })).rejects.toBeInstanceOf(NoTextError);
  });

  it("un documento ajeno es UnsupportedFormatError", async () => {
    mocked.mockResolvedValue({ text: "factura de luz sin ningún marcador conocido de resumen", meta });
    await expect(importPdf({ data: pdf("factura"), fileName: "factura.pdf" }))
      .rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});
```

Al final de `server/src/http/routes/import.test.ts`:

```typescript
describe("POST /api/import (PDF con contraseña)", () => {
  it("responde 422 con un mensaje claro", async () => {
    mocked.mockRejectedValue(Object.assign(new Error("No password given"), { name: "PasswordException" }));
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "protegido.pdf");
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("El PDF está protegido con contraseña");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run server/src/ingestion/errors.test.ts server/src/import/importPdf.test.ts server/src/http/routes/import.test.ts`
Expected: FAIL — `IngestionError`/`EncryptedPdfError` no existen, `./importPdf.js` no existe, y el test nuevo de la ruta recibe 500.

- [ ] **Step 3: Write the implementation**

`server/src/ingestion/errors.ts` completo:

```typescript
export class IngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestionError";
  }
}

export class NoTextError extends IngestionError {
  constructor() {
    super("No se pudo extraer texto del PDF (¿escaneado o corrupto?)");
    this.name = "NoTextError";
  }
}

export class UnsupportedFormatError extends IngestionError {
  constructor() {
    super("Formato de resumen no reconocido");
    this.name = "UnsupportedFormatError";
  }
}

export class NoTransactionsError extends IngestionError {
  constructor() {
    super("No se encontraron movimientos en el resumen");
    this.name = "NoTransactionsError";
  }
}

export class InvalidCouponError extends IngestionError {
  constructor() {
    super("El cupón tiene un formato inesperado");
    this.name = "InvalidCouponError";
  }
}

export class InvalidAutoCouponError extends IngestionError {
  constructor() {
    super("El cupón del plan de auto tiene un formato inesperado");
    this.name = "InvalidAutoCouponError";
  }
}

export class InvalidPayslipError extends IngestionError {
  constructor() {
    super("El recibo de sueldo tiene un formato inesperado");
    this.name = "InvalidPayslipError";
  }
}

export class EncryptedPdfError extends IngestionError {
  constructor() {
    super("El PDF está protegido con contraseña");
    this.name = "EncryptedPdfError";
  }
}
```

`server/src/import/importPdf.ts`:

```typescript
import type { ExtractedPdf, ImportedFileDTO, ImportedFileKind, ImportResultUnionDTO } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { detectDocumentKind } from "../ingestion/detectDocumentKind.js";
import { EncryptedPdfError, NoTextError, UnsupportedFormatError } from "../ingestion/errors.js";
import { AutoCouponModel, MortgageCouponModel, PayslipModel, StatementModel } from "../db/models.js";
import {
  autoCouponToImportedFileDTO, mortgageCouponToImportedFileDTO, payslipToImportedFileDTO, statementToImportedFileDTO,
  toAutoCouponDTO, toMortgageCouponDTO, toPayslipDTO, toStatementDTO,
} from "../http/mappers.js";
import { importAutoCoupon } from "./importAutoCoupon.js";
import { importCoupon } from "./importCoupon.js";
import { importPayslip } from "./importPayslip.js";
import { importStatement } from "./importStatement.js";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MIN_TEXT_LENGTH = 20;

export interface ImportPdfInput {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
}

export interface ImportPdfOutcome {
  result: ImportResultUnionDTO;
  file: ImportedFileDTO;
}

interface KindImportInput {
  data: Uint8Array;
  fileName: string;
  replace: boolean;
  extracted: ExtractedPdf;
}

type KindImporter = (input: KindImportInput) => Promise<ImportPdfOutcome>;

const isPasswordError = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { name?: unknown }).name === "PasswordException";

const extract = async (data: Uint8Array): Promise<ExtractedPdf> => {
  try {
    return await extractPdfText(data);
  } catch (err) {
    if (isPasswordError(err)) throw new EncryptedPdfError();
    throw err;
  }
};

const found = <T>(doc: T | null): T => {
  if (!doc) throw new Error("No se encontró el documento recién importado");
  return doc;
};

const importStatementPdf: KindImporter = async (input) => {
  const { status, statementId, transactionCount } = await importStatement(input);
  const doc = found(await StatementModel.findById(statementId));
  return {
    result: { kind: "statement", status, statement: toStatementDTO(doc, transactionCount), transactionCount },
    file: statementToImportedFileDTO(doc, transactionCount),
  };
};

const importMortgageCouponPdf: KindImporter = async (input) => {
  const { status, couponId } = await importCoupon(input);
  const doc = found(await MortgageCouponModel.findById(couponId));
  return {
    result: { kind: "coupon", status, coupon: toMortgageCouponDTO(doc) },
    file: mortgageCouponToImportedFileDTO(doc),
  };
};

const importAutoCouponPdf: KindImporter = async (input) => {
  const { status, couponId } = await importAutoCoupon(input);
  const doc = found(await AutoCouponModel.findById(couponId));
  return {
    result: { kind: "auto", status, coupon: toAutoCouponDTO(doc) },
    file: autoCouponToImportedFileDTO(doc),
  };
};

const importPayslipPdf: KindImporter = async (input) => {
  const { status, payslipId } = await importPayslip(input);
  const doc = found(await PayslipModel.findById(payslipId));
  return {
    result: { kind: "payslip", status, payslip: toPayslipDTO(doc) },
    file: payslipToImportedFileDTO(doc),
  };
};

const importers: Record<ImportedFileKind, KindImporter> = {
  statement: importStatementPdf,
  coupon: importMortgageCouponPdf,
  auto: importAutoCouponPdf,
  payslip: importPayslipPdf,
};

export async function importPdf({ data, fileName, replace = false }: ImportPdfInput): Promise<ImportPdfOutcome> {
  const extracted = await extract(data);
  if (extracted.text.trim().length < MIN_TEXT_LENGTH) throw new NoTextError();
  const kind = detectDocumentKind(extracted.text, extracted.meta);
  if (kind === "unknown") throw new UnsupportedFormatError();
  return importers[kind]({ data, fileName, replace, extracted });
}
```

`server/src/http/routes/import.ts` completo:

```typescript
import { Router, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { importPdf, MAX_PDF_BYTES } from "../../import/importPdf.js";
import { IngestionError } from "../../ingestion/errors.js";

export const MAX_UPLOAD_BYTES = MAX_PDF_BYTES;

const isPdf = (file: Express.Multer.File): boolean =>
  file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isPdf(file)) {
      cb(new HttpError(400, "Sólo se aceptan archivos PDF"));
      return;
    }
    cb(null, true);
  },
});

const uploadPdf = (req: Request, res: Response, next: NextFunction): void => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new HttpError(413, `El archivo supera el máximo de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`));
        return;
      }
      next(new HttpError(400, "Subida inválida"));
      return;
    }
    next(err);
  });
};

export const importRouter = Router();

importRouter.post("/", uploadPdf, asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Falta el archivo (campo 'file')");
  try {
    const { result } = await importPdf({
      data: req.file.buffer,
      fileName: req.file.originalname,
      replace: req.query.replace === "true",
    });
    res.status(result.status === "duplicate" ? 200 : 201).json(result);
  } catch (err) {
    if (err instanceof IngestionError) throw new HttpError(422, err.message);
    throw err;
  }
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run server/src/ingestion server/src/import/importPdf.test.ts server/src/http/routes/import.test.ts server/src/http/routes/statements.test.ts`
Expected: PASS (los tests viejos de `import.test.ts` siguen verdes sin cambios).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/ingestion/errors.ts server/src/ingestion/errors.test.ts server/src/import/importPdf.ts server/src/import/importPdf.test.ts server/src/http/routes/import.ts server/src/http/routes/import.test.ts
git commit -m "refactor(server): importPdf como único punto de entrada para importar un PDF" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dedup de resúmenes por clave natural

**Files:**
- Modify: `server/src/import/importStatement.ts`
- Modify: `server/src/import/importStatement.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `importStatement` mantiene su firma `({ data, fileName, replace?, extracted? }) => Promise<{ status: "imported" | "duplicate"; statementId: string; transactionCount: number }>`; ahora `duplicate` también cuando existe un `Statement` con el mismo `(issuer, cardLabel, closingDate)`.

- [ ] **Step 1: Ajustar los tests existentes y escribir los nuevos**

En `server/src/import/importStatement.test.ts`, reemplazar `stmtWith` y los dos tests de «dedup entre resúmenes» por:

```typescript
const stmtWith = (rows: ParsedStatement["rows"], closingDate = "2026-07-02"): ParsedStatement => ({
  header: {
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate, dueDate: "2026-07-14",
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
  },
  rows,
});
const okMeta = { reconciliation: { ok: true, entries: [] },
  meta: { producer: null, creator: null, pageCount: 1, encrypted: false } };

describe("importStatement dedup entre resúmenes", () => {
  it("no duplica una línea idéntica (misma cuota) presente en dos resúmenes distintos", async () => {
    mocked.mockResolvedValueOnce({ statement: stmtWith([cuotaRow(5)]), ...okMeta });
    await importStatement({ data: new Uint8Array([1]), fileName: "a.pdf" });
    mocked.mockResolvedValueOnce({ statement: stmtWith([cuotaRow(5), cuotaRow(6)], "2026-08-02"), ...okMeta });
    const res = await importStatement({ data: new Uint8Array([2]), fileName: "b.pdf" });
    expect(res.transactionCount).toBe(1);
    expect(await TransactionModel.countDocuments()).toBe(2);
  });

  it("conserva cuotas distintas de la misma compra (no son duplicados)", async () => {
    mocked.mockResolvedValueOnce({ statement: stmtWith([cuotaRow(5)]), ...okMeta });
    await importStatement({ data: new Uint8Array([1]), fileName: "a.pdf" });
    mocked.mockResolvedValueOnce({ statement: stmtWith([cuotaRow(6)], "2026-08-02"), ...okMeta });
    await importStatement({ data: new Uint8Array([2]), fileName: "b.pdf" });
    expect(await TransactionModel.countDocuments()).toBe(2);
  });
});

describe("importStatement dedup por clave natural", () => {
  it("la misma tarjeta y el mismo cierre con otros bytes es duplicate, sin segundo resumen", async () => {
    await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "home-banking.pdf" });
    const res = await importStatement({ data: new Uint8Array([4, 5, 6]), fileName: "mail.pdf" });
    const only = await StatementModel.findOne();
    expect(res.status).toBe("duplicate");
    expect(res.statementId).toBe(only?._id.toString());
    expect(res.transactionCount).toBe(2);
    expect(only?.sourceFileName).toBe("home-banking.pdf");
    expect(await StatementModel.countDocuments()).toBe(1);
  });

  it("con replace reemplaza el resumen de la misma tarjeta y cierre", async () => {
    await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "home-banking.pdf" });
    const res = await importStatement({ data: new Uint8Array([4, 5, 6]), fileName: "mail.pdf", replace: true });
    expect(res.status).toBe("imported");
    expect(res.transactionCount).toBe(2);
    expect(await StatementModel.countDocuments()).toBe(1);
    expect((await StatementModel.findOne())?.sourceFileName).toBe("mail.pdf");
    expect(await TransactionModel.countDocuments()).toBe(2);
  });

  it("otra tarjeta con el mismo cierre no es duplicado", async () => {
    await importStatement({ data: new Uint8Array([1]), fileName: "icbc.pdf" });
    mocked.mockResolvedValueOnce({
      statement: { ...parsed, header: { ...parsed.header, issuer: "visa_signature", cardLabel: "Visa Signature ****1234" } },
      ...okMeta,
    });
    const res = await importStatement({ data: new Uint8Array([2]), fileName: "visa.pdf" });
    expect(res.status).toBe("imported");
    expect(await StatementModel.countDocuments()).toBe(2);
  });

  it("sin fecha de cierre no deduplica por clave natural", async () => {
    mocked.mockResolvedValue({ statement: { ...parsed, header: { ...parsed.header, closingDate: null } }, ...okMeta });
    await importStatement({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const res = await importStatement({ data: new Uint8Array([2]), fileName: "b.pdf" });
    expect(res.status).toBe("imported");
    expect(await StatementModel.countDocuments()).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `bunx vitest run server/src/import/importStatement.test.ts`
Expected: FAIL en «la misma tarjeta y el mismo cierre…» (devuelve `imported` y deja 2 statements) y en «con replace reemplaza…» (quedan 2 statements). El resto pasa.

- [ ] **Step 3: Write the implementation**

En `server/src/import/importStatement.ts`, reemplazar `importStatement` (el `fingerprintOf` y `PARSER_VERSION` quedan igual) e importar los tipos:

```typescript
import type { ExtractedPdf, ParsedStatement } from "@ledgerly/shared";
import type { Types } from "mongoose";
```

```typescript
interface ImportStatementResult {
  status: "imported" | "duplicate";
  statementId: string;
  transactionCount: number;
}

const duplicateOf = async (statementId: Types.ObjectId): Promise<ImportStatementResult> => ({
  status: "duplicate",
  statementId: statementId.toString(),
  transactionCount: await TransactionModel.countDocuments({ statementId }),
});

const removeStatement = async (statementId: Types.ObjectId): Promise<void> => {
  await TransactionModel.deleteMany({ statementId });
  await StatementModel.deleteOne({ _id: statementId });
};

const findSameStatement = async (header: ParsedStatement["header"]) => {
  if (!header.closingDate) return null;
  return StatementModel.findOne({
    issuer: header.issuer,
    cardLabel: header.cardLabel,
    closingDate: new Date(header.closingDate),
  });
};

export async function importStatement(input: {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
  extracted?: ExtractedPdf;
}): Promise<ImportStatementResult> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");

  const sameFile = await StatementModel.findOne({ sourceHash });
  if (sameFile && !input.replace) return duplicateOf(sameFile._id);
  if (sameFile) await removeStatement(sameFile._id);

  const { statement, reconciliation, meta } = await parseStatement(input.data, input.extracted);
  const sameStatement = await findSameStatement(statement.header);
  if (sameStatement && !input.replace) return duplicateOf(sameStatement._id);
  if (sameStatement) await removeStatement(sameStatement._id);

  const rules = (await CategoryRuleModel.find({ enabled: true }).lean()) as unknown as RuleInput[];
```

…y desde `const created = await StatementModel.create({` hasta el final, igual que antes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run server/src/import server/src/http/routes`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/import/importStatement.ts server/src/import/importStatement.test.ts
git commit -m "feat(server): un resumen con la misma tarjeta y cierre es duplicado aunque cambien los bytes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Configuración de Gmail desde el entorno

**Files:**
- Create: `server/src/gmail/gmailConfig.ts`
- Create: `server/src/gmail/gmailConfig.test.ts`

**Interfaces:**
- Produces: `GMAIL_READONLY_SCOPE`, `GMAIL_CREDENTIAL_VARS`, `DEFAULT_GMAIL_QUERY`, `MIN_GMAIL_INTERVAL_MINUTES`, `interface GmailCredentials { clientId: string; clientSecret: string; refreshToken: string }`, `interface GmailConfig { credentials: GmailCredentials; query: string; intervalMinutes: number | null }`, `missingGmailVars(env): string[]`, `parseGmailInterval(raw): number | null`, `readGmailConfig(env): GmailConfig | null`, `describeGmailSetup(env): string`. Los consumen el cliente (Task 4), la sincronización (Task 5), la ruta (Task 6), el job e `index.ts` (Task 7) y el script (Task 8).

- [ ] **Step 1: Write the failing test**

`server/src/gmail/gmailConfig.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  DEFAULT_GMAIL_QUERY, describeGmailSetup, missingGmailVars, parseGmailInterval, readGmailConfig,
} from "./gmailConfig.js";

const CREDENTIALS = {
  GMAIL_CLIENT_ID: "id-sintetico.apps.googleusercontent.com",
  GMAIL_CLIENT_SECRET: "secreto-sintetico",
  GMAIL_REFRESH_TOKEN: "1//refresh-sintetico",
};
const env = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({ ...CREDENTIALS, ...extra });

describe("readGmailConfig", () => {
  it("con las tres credenciales devuelve la config con la consulta por defecto y sin intervalo", () => {
    expect(readGmailConfig(env())).toEqual({
      credentials: {
        clientId: CREDENTIALS.GMAIL_CLIENT_ID,
        clientSecret: CREDENTIALS.GMAIL_CLIENT_SECRET,
        refreshToken: CREDENTIALS.GMAIL_REFRESH_TOKEN,
      },
      query: DEFAULT_GMAIL_QUERY,
      intervalMinutes: null,
    });
  });

  it.each(["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"])("sin %s devuelve null", (key) => {
    expect(readGmailConfig(env({ [key]: undefined }))).toBeNull();
  });

  it("una credencial en blanco cuenta como faltante", () => {
    expect(readGmailConfig(env({ GMAIL_REFRESH_TOKEN: "   " }))).toBeNull();
  });

  it("recorta los espacios de las credenciales", () => {
    expect(readGmailConfig(env({ GMAIL_CLIENT_ID: "  id-con-espacios  " }))?.credentials.clientId).toBe("id-con-espacios");
  });

  it("usa GMAIL_QUERY recortada, o la consulta por defecto si está vacía", () => {
    expect(readGmailConfig(env({ GMAIL_QUERY: "  from:banco has:attachment  " }))?.query).toBe("from:banco has:attachment");
    expect(readGmailConfig(env({ GMAIL_QUERY: "   " }))?.query).toBe(DEFAULT_GMAIL_QUERY);
  });

  it("lee el intervalo de la búsqueda automática", () => {
    expect(readGmailConfig(env({ GMAIL_SYNC_INTERVAL_MINUTES: "360" }))?.intervalMinutes).toBe(360);
  });
});

describe("missingGmailVars", () => {
  it("nombra solo las credenciales que faltan", () => {
    expect(missingGmailVars(env())).toEqual([]);
    expect(missingGmailVars(env({ GMAIL_CLIENT_SECRET: "" }))).toEqual(["GMAIL_CLIENT_SECRET"]);
    expect(missingGmailVars({})).toEqual(["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"]);
  });
});

describe("parseGmailInterval", () => {
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
    expect(parseGmailInterval(raw)).toBe(expected);
  });
});

describe("describeGmailSetup", () => {
  const lines = [
    describeGmailSetup({}),
    describeGmailSetup(env()),
    describeGmailSetup(env({ GMAIL_SYNC_INTERVAL_MINUTES: "5" })),
    describeGmailSetup(env({ GMAIL_SYNC_INTERVAL_MINUTES: "360" })),
  ];

  it("arma la línea de arranque para cada caso", () => {
    expect(lines).toEqual([
      "Gmail: deshabilitado (faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)",
      "Gmail: búsqueda manual; automática apagada",
      "Gmail: búsqueda manual; GMAIL_SYNC_INTERVAL_MINUTES inválido (entero ≥ 15), automática apagada",
      "Gmail: búsqueda automática cada 360 min",
    ]);
  });

  it("nunca incluye los valores de las credenciales", () => {
    for (const line of lines) {
      for (const value of Object.values(CREDENTIALS)) expect(line).not.toContain(value);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/gmail/gmailConfig.test.ts`
Expected: FAIL — `./gmailConfig.js` no existe.

- [ ] **Step 3: Write the implementation**

`server/src/gmail/gmailConfig.ts`:

```typescript
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_CREDENTIAL_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] as const;
export const DEFAULT_GMAIL_QUERY = "has:attachment filename:pdf newer_than:90d";
export const MIN_GMAIL_INTERVAL_MINUTES = 15;

const INTEGER = /^\d+$/;

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GmailConfig {
  credentials: GmailCredentials;
  query: string;
  intervalMinutes: number | null;
}

const valueOf = (env: NodeJS.ProcessEnv, key: string): string => env[key]?.trim() ?? "";

export function missingGmailVars(env: NodeJS.ProcessEnv): string[] {
  return GMAIL_CREDENTIAL_VARS.filter((key) => valueOf(env, key) === "");
}

export function parseGmailInterval(raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (!INTEGER.test(value)) return null;
  const minutes = Number(value);
  return minutes >= MIN_GMAIL_INTERVAL_MINUTES ? minutes : null;
}

export function readGmailConfig(env: NodeJS.ProcessEnv): GmailConfig | null {
  if (missingGmailVars(env).length > 0) return null;
  return {
    credentials: {
      clientId: valueOf(env, "GMAIL_CLIENT_ID"),
      clientSecret: valueOf(env, "GMAIL_CLIENT_SECRET"),
      refreshToken: valueOf(env, "GMAIL_REFRESH_TOKEN"),
    },
    query: valueOf(env, "GMAIL_QUERY") || DEFAULT_GMAIL_QUERY,
    intervalMinutes: parseGmailInterval(env.GMAIL_SYNC_INTERVAL_MINUTES),
  };
}

export function describeGmailSetup(env: NodeJS.ProcessEnv): string {
  const missing = missingGmailVars(env);
  if (missing.length > 0) return `Gmail: deshabilitado (faltan ${missing.join(", ")})`;
  const intervalMinutes = parseGmailInterval(env.GMAIL_SYNC_INTERVAL_MINUTES);
  if (intervalMinutes !== null) return `Gmail: búsqueda automática cada ${intervalMinutes} min`;
  if (valueOf(env, "GMAIL_SYNC_INTERVAL_MINUTES") !== "") {
    return `Gmail: búsqueda manual; GMAIL_SYNC_INTERVAL_MINUTES inválido (entero ≥ ${MIN_GMAIL_INTERVAL_MINUTES}), automática apagada`;
  }
  return "Gmail: búsqueda manual; automática apagada";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/gmail/gmailConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/gmail/gmailConfig.ts server/src/gmail/gmailConfig.test.ts
git commit -m "feat(server): configuración de Gmail leída del entorno, sin exponer valores" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cliente REST de Gmail con `fetch`

**Files:**
- Create: `server/src/gmail/gmailClient.ts`
- Create: `server/src/gmail/gmailClient.test.ts`

**Interfaces:**
- Consumes: `GmailCredentials` (Task 3).
- Produces: `GmailMessagePart`, `GmailPdfPart { partId: string; fileName: string; size: number; attachmentId: string | null; inlineData: string | null }`, `GmailMessage { id: string; receivedAt: string; pdfParts: GmailPdfPart[] }`, `GmailClient { listMessageIds(query, limit): Promise<string[]>; getMessage(id): Promise<GmailMessage>; downloadPart(messageId, part): Promise<Uint8Array> }`, `GmailAuthError`, `GmailApiError`, `collectPdfParts(payload)`, `createGmailClient(credentials)`. Los consumen Tasks 5, 6 y los fixtures.

- [ ] **Step 1: Write the failing test**

`server/src/gmail/gmailClient.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  collectPdfParts, createGmailClient, GmailApiError, GmailAuthError, type GmailMessagePart,
} from "./gmailClient.js";

const credentials = { clientId: "id-sintetico", clientSecret: "secreto-sintetico", refreshToken: "refresh-sintetico" };
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokenOk = (expiresIn = 3599) => json({ access_token: "access-sintetico", expires_in: expiresIn, token_type: "Bearer" });
const isToken = (url: string) => url === "https://oauth2.googleapis.com/token";

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

const stubFetch = (route: Route) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => route(String(url), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const tokenCalls = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.filter(([url]) => isToken(url));
const apiCalls = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.filter(([url]) => !isToken(url));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createGmailClient: token", () => {
  it("pide el access token una sola vez con el refresh token y lo reutiliza", async () => {
    const fetchMock = stubFetch((url) => (isToken(url) ? tokenOk() : json({ messages: [{ id: "msg-1" }] })));
    const client = createGmailClient(credentials);
    await client.listMessageIds("has:attachment", 10);
    await client.listMessageIds("has:attachment", 10);
    expect(tokenCalls(fetchMock)).toHaveLength(1);
    const [, tokenInit] = tokenCalls(fetchMock)[0];
    expect(tokenInit?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(tokenInit?.body)))).toEqual({
      client_id: "id-sintetico", client_secret: "secreto-sintetico", refresh_token: "refresh-sintetico", grant_type: "refresh_token",
    });
    const [, apiInit] = apiCalls(fetchMock)[0];
    expect(apiInit?.headers).toEqual({ Authorization: "Bearer access-sintetico" });
  });

  it("renueva el token 60 s antes de que venza", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
    const fetchMock = stubFetch((url) => (isToken(url) ? tokenOk(120) : json({ messages: [] })));
    const client = createGmailClient(credentials);
    await client.listMessageIds("q", 10);
    vi.setSystemTime(new Date("2026-10-03T12:00:59.000Z"));
    await client.listMessageIds("q", 10);
    expect(tokenCalls(fetchMock)).toHaveLength(1);
    vi.setSystemTime(new Date("2026-10-03T12:01:01.000Z"));
    await client.listMessageIds("q", 10);
    expect(tokenCalls(fetchMock)).toHaveLength(2);
  });

  it("invalid_grant es GmailAuthError y el mensaje no trae ni el refresh token ni el secreto", async () => {
    stubFetch((url) => (isToken(url)
      ? json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)
      : json({})));
    const error = await createGmailClient(credentials).listMessageIds("q", 1).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GmailAuthError);
    const message = (error as Error).message;
    expect(message).toContain("bun run gmail:auth");
    expect(message).not.toContain("refresh-sintetico");
    expect(message).not.toContain("secreto-sintetico");
    expect(message).not.toContain("expired or revoked");
  });

  it("invalid_client es GmailAuthError que apunta al .env", async () => {
    stubFetch((url) => (isToken(url) ? json({ error: "invalid_client" }, 401) : json({})));
    await expect(createGmailClient(credentials).listMessageIds("q", 1))
      .rejects.toThrow(new GmailAuthError("Gmail rechazó GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET. Revisalos en el .env."));
  });
});

describe("createGmailClient: API", () => {
  it("listMessageIds pagina con nextPageToken y manda la consulta url-encodeada", async () => {
    const fetchMock = stubFetch((url) => {
      if (isToken(url)) return tokenOk();
      return url.includes("pageToken=p2")
        ? json({ messages: [{ id: "msg-3" }] })
        : json({ messages: [{ id: "msg-1" }, { id: "msg-2" }], nextPageToken: "p2" });
    });
    const ids = await createGmailClient(credentials).listMessageIds("has:attachment filename:pdf", 10);
    expect(ids).toEqual(["msg-1", "msg-2", "msg-3"]);
    expect(apiCalls(fetchMock).map(([url]) => url)).toEqual([
      `${API}/messages?q=has%3Aattachment%20filename%3Apdf&maxResults=100`,
      `${API}/messages?q=has%3Aattachment%20filename%3Apdf&maxResults=100&pageToken=p2`,
    ]);
  });

  it("listMessageIds corta en el límite", async () => {
    const fetchMock = stubFetch((url) => (isToken(url)
      ? tokenOk()
      : json({ messages: [{ id: `msg-${Math.random()}` }, { id: `msg-${Math.random()}` }], nextPageToken: "siguiente" })));
    const ids = await createGmailClient(credentials).listMessageIds("q", 3);
    expect(ids).toHaveLength(3);
    expect(apiCalls(fetchMock)).toHaveLength(2);
  });

  it("getMessage mapea internalDate y las partes PDF", async () => {
    const fetchMock = stubFetch((url) => (isToken(url) ? tokenOk() : json({
      id: "msg-1",
      internalDate: "1759500000000",
      payload: {
        partId: "", mimeType: "multipart/mixed",
        parts: [
          { partId: "0", mimeType: "text/plain", filename: "", body: { size: 4, data: "aG9sYQ" } },
          { partId: "1", mimeType: "application/pdf", filename: "resumen-sintetico.pdf", body: { attachmentId: "att-1", size: 2048 } },
        ],
      },
    })));
    expect(await createGmailClient(credentials).getMessage("msg-1")).toEqual({
      id: "msg-1",
      receivedAt: new Date(1759500000000).toISOString(),
      pdfParts: [{ partId: "1", fileName: "resumen-sintetico.pdf", size: 2048, attachmentId: "att-1", inlineData: null }],
    });
    expect(apiCalls(fetchMock)[0][0]).toBe(`${API}/messages/msg-1?format=full`);
  });

  it("downloadPart baja el adjunto y decodifica base64url", async () => {
    const fetchMock = stubFetch((url) => (isToken(url) ? tokenOk() : json({ size: 3, data: "-_-_" })));
    const part = { partId: "1", fileName: "a.pdf", size: 3, attachmentId: "att-1", inlineData: null };
    const bytes = await createGmailClient(credentials).downloadPart("msg-1", part);
    expect(Array.from(bytes)).toEqual([0xfb, 0xff, 0xbf]);
    expect(apiCalls(fetchMock)[0][0]).toBe(`${API}/messages/msg-1/attachments/att-1`);
  });

  it("downloadPart usa inlineData sin pedir nada", async () => {
    const fetchMock = stubFetch(() => json({}));
    const part = { partId: "1", fileName: "a.pdf", size: 3, attachmentId: null, inlineData: "-_-_" };
    const bytes = await createGmailClient(credentials).downloadPart("msg-1", part);
    expect(Array.from(bytes)).toEqual([0xfb, 0xff, 0xbf]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un 401 de la API renueva el token y reintenta una vez", async () => {
    let apiHits = 0;
    const fetchMock = stubFetch((url) => {
      if (isToken(url)) return tokenOk();
      apiHits += 1;
      return apiHits === 1 ? json({ error: { code: 401 } }, 401) : json({ messages: [{ id: "msg-1" }] });
    });
    expect(await createGmailClient(credentials).listMessageIds("q", 10)).toEqual(["msg-1"]);
    expect(tokenCalls(fetchMock)).toHaveLength(2);
    expect(apiCalls(fetchMock)).toHaveLength(2);
  });

  it("un 403 es GmailApiError que sugiere habilitar la Gmail API", async () => {
    stubFetch((url) => (isToken(url) ? tokenOk() : json({ error: { code: 403, message: "detalle de Google" } }, 403)));
    await expect(createGmailClient(credentials).listMessageIds("q", 1)).rejects.toThrow(new GmailApiError(
      "Gmail respondió 403: revisá que la Gmail API esté habilitada en tu proyecto de Google Cloud.",
    ));
  });

  it("otro error HTTP es GmailApiError con el status", async () => {
    stubFetch((url) => (isToken(url) ? tokenOk() : json({ error: { code: 500 } }, 500)));
    await expect(createGmailClient(credentials).getMessage("msg-1")).rejects.toThrow(new GmailApiError("Gmail respondió 500."));
  });

  it("una falla de red es GmailApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(createGmailClient(credentials).listMessageIds("q", 1))
      .rejects.toThrow(new GmailApiError("No se pudo conectar con Gmail: fetch failed"));
  });
});

describe("collectPdfParts", () => {
  it("encuentra PDFs en multipart anidado e ignora texto e imágenes", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "multipart/mixed",
      parts: [
        {
          partId: "0", mimeType: "multipart/alternative",
          parts: [
            { partId: "0.0", mimeType: "text/plain", filename: "", body: { size: 5, data: "aG9sYQ" } },
            { partId: "0.1", mimeType: "text/html", filename: "", body: { size: 5, data: "aG9sYQ" } },
          ],
        },
        {
          partId: "1", mimeType: "multipart/mixed",
          parts: [
            { partId: "1.0", mimeType: "application/pdf", filename: "a.pdf", body: { attachmentId: "att-a", size: 10 } },
            { partId: "1.1", mimeType: "image/png", filename: "logo.png", body: { attachmentId: "att-logo", size: 3 } },
          ],
        },
      ],
    };
    expect(collectPdfParts(payload)).toEqual([
      { partId: "1.0", fileName: "a.pdf", size: 10, attachmentId: "att-a", inlineData: null },
    ]);
  });

  it("acepta application/octet-stream con extensión .PDF", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "multipart/mixed",
      parts: [{ partId: "2", mimeType: "application/octet-stream", filename: "RESUMEN.PDF", body: { attachmentId: "att-2", size: 5 } }],
    };
    expect(collectPdfParts(payload).map(({ fileName }) => fileName)).toEqual(["RESUMEN.PDF"]);
  });

  it("nombra adjunto-<partId>.pdf a un PDF sin filename y conserva los datos inline", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "multipart/mixed",
      parts: [{ partId: "3", mimeType: "application/pdf", filename: "", body: { data: "JVBERi0", size: 5 } }],
    };
    expect(collectPdfParts(payload)).toEqual([
      { partId: "3", fileName: "adjunto-3.pdf", size: 5, attachmentId: null, inlineData: "JVBERi0" },
    ]);
  });

  it("ignora una parte PDF sin contenido", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "multipart/mixed",
      parts: [{ partId: "4", mimeType: "application/pdf", filename: "vacio.pdf", body: { size: 0 } }],
    };
    expect(collectPdfParts(payload)).toEqual([]);
  });

  it("detecta un mail cuyo cuerpo entero es el PDF y le da partId 0", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "application/pdf", filename: "resumen.pdf", body: { attachmentId: "att-root", size: 7 },
    };
    expect(collectPdfParts(payload)).toEqual([
      { partId: "0", fileName: "resumen.pdf", size: 7, attachmentId: "att-root", inlineData: null },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/gmail/gmailClient.test.ts`
Expected: FAIL — `./gmailClient.js` no existe.

- [ ] **Step 3: Write the implementation**

`server/src/gmail/gmailClient.ts`:

```typescript
import type { GmailCredentials } from "./gmailConfig.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const LIST_PAGE_SIZE = 100;
const TOKEN_RENEW_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_TTL_SECONDS = 3600;
const ROOT_PART_ID = "0";
const PDF_FILE_NAME = /\.pdf$/i;

const INVALID_GRANT_MESSAGE =
  "Gmail rechazó el refresh token (venció o fue revocado). Volvé a correr bun run gmail:auth y reiniciá el server.";
const INVALID_CLIENT_MESSAGE = "Gmail rechazó GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET. Revisalos en el .env.";
const FORBIDDEN_MESSAGE =
  "Gmail respondió 403: revisá que la Gmail API esté habilitada en tu proyecto de Google Cloud.";
const NO_ACCESS_TOKEN_MESSAGE = "Gmail no devolvió un access token.";
const NO_CONTENT_MESSAGE = "El adjunto no tiene contenido para bajar.";

export interface GmailMessagePart {
  partId?: string;
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
}

export interface GmailPdfPart {
  partId: string;
  fileName: string;
  size: number;
  attachmentId: string | null;
  inlineData: string | null;
}

export interface GmailMessage {
  id: string;
  receivedAt: string;
  pdfParts: GmailPdfPart[];
}

export interface GmailClient {
  listMessageIds(query: string, limit: number): Promise<string[]>;
  getMessage(id: string): Promise<GmailMessage>;
  downloadPart(messageId: string, part: GmailPdfPart): Promise<Uint8Array>;
}

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

export class GmailApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailApiError";
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface ListResponse {
  messages?: { id: string }[];
  nextPageToken?: string;
}

interface MessageResponse {
  id?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

interface AttachmentResponse {
  data?: string;
}

const isPdfPart = ({ filename, mimeType }: GmailMessagePart): boolean =>
  PDF_FILE_NAME.test(filename ?? "") || mimeType === "application/pdf";

const hasContent = ({ body }: GmailMessagePart): boolean => Boolean(body?.attachmentId || body?.data);

const toPdfPart = ({ partId, filename, body }: GmailMessagePart): GmailPdfPart => {
  const id = partId || ROOT_PART_ID;
  return {
    partId: id,
    fileName: filename?.trim() || `adjunto-${id}.pdf`,
    size: body?.size ?? 0,
    attachmentId: body?.attachmentId ?? null,
    inlineData: body?.data ?? null,
  };
};

export function collectPdfParts(payload: GmailMessagePart): GmailPdfPart[] {
  const own = isPdfPart(payload) && hasContent(payload) ? [toPdfPart(payload)] : [];
  return [...own, ...(payload.parts ?? []).flatMap(collectPdfParts)];
}

const errorCodeOf = async (response: Response): Promise<string | null> => {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : null;
};

const tokenError = async (response: Response): Promise<Error> => {
  const code = await errorCodeOf(response);
  if (code === "invalid_grant") return new GmailAuthError(INVALID_GRANT_MESSAGE);
  if (code === "invalid_client" || code === "unauthorized_client" || response.status === 401) {
    return new GmailAuthError(INVALID_CLIENT_MESSAGE);
  }
  return new GmailApiError(`Gmail respondió ${response.status}.`);
};

const apiError = ({ status }: Response): GmailApiError =>
  new GmailApiError(status === 403 ? FORBIDDEN_MESSAGE : `Gmail respondió ${status}.`);

const send = async (url: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new GmailApiError(`No se pudo conectar con Gmail: ${err instanceof Error ? err.message : String(err)}`);
  }
};

const decodeBase64Url = (data: string): Uint8Array => new Uint8Array(Buffer.from(data, "base64url"));

const receivedAtOf = (internalDate: string | undefined): string => {
  const millis = Number(internalDate);
  return internalDate && Number.isFinite(millis) ? new Date(millis).toISOString() : new Date().toISOString();
};

const listPath = (query: string, pageToken: string | undefined): string => {
  const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
  return `/messages?q=${encodeURIComponent(query)}&maxResults=${LIST_PAGE_SIZE}${page}`;
};

export function createGmailClient({ clientId, clientSecret, refreshToken }: GmailCredentials): GmailClient {
  let accessToken: string | null = null;
  let renewAt = 0;

  const requestToken = async (): Promise<string> => {
    const response = await send(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw await tokenError(response);
    const { access_token: token, expires_in: ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS } = (await response.json()) as TokenResponse;
    if (!token) throw new GmailApiError(NO_ACCESS_TOKEN_MESSAGE);
    accessToken = token;
    renewAt = Date.now() + ttlSeconds * 1000 - TOKEN_RENEW_MARGIN_MS;
    return token;
  };

  const validToken = async (): Promise<string> =>
    (accessToken && Date.now() < renewAt ? accessToken : requestToken());

  const authorized = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });

  const get = async <T>(path: string): Promise<T> => {
    const url = `${GMAIL_API_URL}${path}`;
    const first = await send(url, authorized(await validToken()));
    const response = first.status === 401 ? await send(url, authorized(await requestToken())) : first;
    if (!response.ok) throw apiError(response);
    return (await response.json()) as T;
  };

  return {
    async listMessageIds(query, limit) {
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const page = await get<ListResponse>(listPath(query, pageToken));
        ids.push(...(page.messages ?? []).map(({ id }) => id));
        pageToken = page.nextPageToken;
      } while (pageToken && ids.length < limit);
      return ids.slice(0, limit);
    },

    async getMessage(id) {
      const message = await get<MessageResponse>(`/messages/${encodeURIComponent(id)}?format=full`);
      return {
        id: message.id ?? id,
        receivedAt: receivedAtOf(message.internalDate),
        pdfParts: message.payload ? collectPdfParts(message.payload) : [],
      };
    },

    async downloadPart(messageId, part) {
      if (part.inlineData) return decodeBase64Url(part.inlineData);
      if (!part.attachmentId) throw new GmailApiError(NO_CONTENT_MESSAGE);
      const path = `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.attachmentId)}`;
      const attachment = await get<AttachmentResponse>(path);
      return decodeBase64Url(attachment.data ?? "");
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/gmail/gmailClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/gmail/gmailClient.ts server/src/gmail/gmailClient.test.ts
git commit -m "feat(server): cliente REST de Gmail de solo lectura con fetch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sincronización idempotente (`syncGmail`, mappers y fixtures)

**Files:**
- Create: `server/src/gmail/gmailMappers.ts`
- Create: `server/src/gmail/gmailMappers.test.ts`
- Create: `server/src/testing/gmailFixtures.ts`
- Create: `server/src/gmail/syncGmail.ts`
- Create: `server/src/gmail/syncGmail.test.ts`

**Interfaces:**
- Consumes: `GmailClient`, `GmailMessage`, `GmailPdfPart`, `createGmailClient`, `GmailApiError`, `GmailAuthError` (Task 4); `GmailConfig` (Task 3); `importPdf`, `MAX_PDF_BYTES`, `ImportPdfInput`, `ImportPdfOutcome`, `IngestionError`, `EncryptedPdfError` (Task 1); `GmailSyncRunModel`, `GmailAttachmentModel` (base).
- Produces: `toGmailSyncItemDTO(doc)`, `toGmailSyncRunDTO(run, items)`; `fakeGmailClient(messages)`, `pdfPart(partId, fileName, size?)`, `fakePdfBytes(messageId, partId)`, `FAKE_RECEIVED_AT`; `GMAIL_LIST_LIMIT`, `GMAIL_MAX_MESSAGES_PER_RUN`, `NO_PDF_PART_ID`, `GmailLedgerEntry`, `selectPendingMessages`, `classifyImportError`, `SyncGmailDeps`, `syncGmail(deps): Promise<GmailSyncRunDTO>`, `runGmailSync(config, trigger): Promise<GmailSyncRunDTO>`, `findLastGmailRun(): Promise<GmailSyncRunDTO | null>`. Los consumen la ruta (Task 6) y el job (Task 7).

- [ ] **Step 1: Write the failing tests**

`server/src/gmail/gmailMappers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { gmailSyncRunDtoSchema } from "@ledgerly/shared";
import { withDb } from "../testing/withDb.js";
import { GmailAttachmentModel, GmailSyncRunModel } from "../db/models.js";
import { toGmailSyncItemDTO, toGmailSyncRunDTO } from "./gmailMappers.js";

withDb();

const attachment = (overrides: Record<string, unknown> = {}) => GmailAttachmentModel.create({
  messageId: "msg-1", partId: "1", runId: new Types.ObjectId(), fileName: "resumen-sintetico.pdf",
  receivedAt: new Date("2026-09-28T12:00:00.000Z"), outcome: "imported", kind: "statement", documentId: "stmt-1",
  detail: "ICBC · 3 movimientos", processedAt: new Date("2026-10-03T12:00:01.000Z"), ...overrides,
});

describe("toGmailSyncItemDTO", () => {
  it("mapea un adjunto importado", async () => {
    const doc = await attachment();
    expect(toGmailSyncItemDTO(doc)).toEqual({
      id: doc._id.toString(), fileName: "resumen-sintetico.pdf", receivedAt: "2026-09-28T12:00:00.000Z",
      outcome: "imported", kind: "statement", documentId: "stmt-1", detail: "ICBC · 3 movimientos",
    });
  });

  it("un omitido queda sin kind ni documento", async () => {
    const doc = await attachment({ outcome: "skipped", kind: null, documentId: null, detail: "Formato de resumen no reconocido" });
    expect(toGmailSyncItemDTO(doc)).toMatchObject({ outcome: "skipped", kind: null, documentId: null });
  });
});

describe("toGmailSyncRunDTO", () => {
  it("arma la corrida con sus ítems y cumple el schema", async () => {
    const run = await GmailSyncRunModel.create({
      trigger: "job", startedAt: new Date("2026-10-03T12:00:00.000Z"), finishedAt: new Date("2026-10-03T12:00:05.000Z"),
      status: "error", error: "Gmail respondió 500.", messagesChecked: 1, hasMore: true,
    });
    const item = await attachment({ runId: run._id });
    const dto = toGmailSyncRunDTO(run, [item]);
    expect(dto).toEqual({
      trigger: "job", startedAt: "2026-10-03T12:00:00.000Z", finishedAt: "2026-10-03T12:00:05.000Z",
      status: "error", error: "Gmail respondió 500.", messagesChecked: 1, hasMore: true, items: [toGmailSyncItemDTO(item)],
    });
    expect(() => gmailSyncRunDtoSchema.parse(dto)).not.toThrow();
  });
});
```

`server/src/gmail/syncGmail.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StatementDTO } from "@ledgerly/shared";
import { withDb } from "../testing/withDb.js";
import { FAKE_RECEIVED_AT, fakeGmailClient, fakePdfBytes, pdfPart } from "../testing/gmailFixtures.js";

vi.mock("./gmailClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./gmailClient.js")>()),
  createGmailClient: vi.fn(),
}));
import { createGmailClient, GmailApiError, GmailAuthError } from "./gmailClient.js";
import { GmailAttachmentModel, GmailSyncRunModel } from "../db/models.js";
import { EncryptedPdfError, UnsupportedFormatError } from "../ingestion/errors.js";
import { MAX_PDF_BYTES, type ImportPdfInput, type ImportPdfOutcome } from "../import/importPdf.js";
import type { GmailConfig } from "./gmailConfig.js";
import {
  classifyImportError, findLastGmailRun, GMAIL_LIST_LIMIT, NO_PDF_PART_ID, runGmailSync, selectPendingMessages, syncGmail,
} from "./syncGmail.js";

withDb();

const QUERY = "has:attachment filename:pdf";

const statementDto = (id: string): StatementDTO => ({
  id, issuer: "visa_signature", cardLabel: "Visa Signature ****1234", last4: "1234",
  closingDate: "2026-09-25", dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 3000, usd: 0 }, saldoActual: { ars: 3000, usd: 0 },
    pagoMinimo: { ars: 300, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "resumen-sintetico.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
  transactionCount: 3, uploadedAt: "2026-09-28T12:00:00.000Z",
});

const statementOutcome = (status: "imported" | "duplicate", id: string): ImportPdfOutcome => ({
  result: { kind: "statement", status, statement: statementDto(id), transactionCount: 3 },
  file: {
    id, kind: "statement", fileName: "resumen-sintetico.pdf", uploadedAt: "2026-09-28T12:00:00.000Z",
    documentDate: "2026-09-25", description: "Visa Signature ****1234 · 3 movimientos", needsReview: false,
  },
});

const importByName = (outcomes: Record<string, ImportPdfOutcome | Error>) =>
  vi.fn(async ({ fileName }: ImportPdfInput): Promise<ImportPdfOutcome> => {
    const outcome = outcomes[fileName];
    if (!outcome) throw new UnsupportedFormatError();
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });

const ticking = () => {
  let millis = Date.parse("2026-10-03T12:00:00.000Z");
  return () => {
    millis += 1000;
    return new Date(millis);
  };
};

const summaryOf = (items: { fileName: string; outcome: string; kind: string | null; documentId: string | null }[]) =>
  items.map(({ fileName, outcome, kind, documentId }) => ({ fileName, outcome, kind, documentId }));

describe("selectPendingMessages", () => {
  it("sin registro, todos están pendientes en el orden de Gmail", () => {
    expect(selectPendingMessages(["msg-3", "msg-2", "msg-1"], [], 10)).toEqual({ batch: ["msg-3", "msg-2", "msg-1"], hasMore: false });
  });

  it("saltea los ya resueltos y retoma los que tienen alguna parte fallida", () => {
    const ledger = [
      { messageId: "msg-1", partId: "1", outcome: "imported" as const },
      { messageId: "msg-2", partId: "1", outcome: "imported" as const },
      { messageId: "msg-2", partId: "2", outcome: "failed" as const },
      { messageId: "msg-3", partId: "-", outcome: "skipped" as const },
    ];
    expect(selectPendingMessages(["msg-4", "msg-3", "msg-2", "msg-1"], ledger, 10))
      .toEqual({ batch: ["msg-4", "msg-2"], hasMore: false });
  });

  it("toma los primeros max y avisa que quedan más", () => {
    expect(selectPendingMessages(["msg-3", "msg-2", "msg-1"], [], 2)).toEqual({ batch: ["msg-3", "msg-2"], hasMore: true });
  });
});

describe("classifyImportError", () => {
  it("un error de ingestión es omitido con su motivo", () => {
    expect(classifyImportError(new UnsupportedFormatError())).toEqual({ outcome: "skipped", detail: "Formato de resumen no reconocido" });
    expect(classifyImportError(new EncryptedPdfError())).toEqual({ outcome: "skipped", detail: "El PDF está protegido con contraseña" });
  });

  it("cualquier otro error es fallido, con su mensaje o «Error inesperado»", () => {
    expect(classifyImportError(new Error("Mongo se cayó"))).toEqual({ outcome: "failed", detail: "Mongo se cayó" });
    expect(classifyImportError(new Error(""))).toEqual({ outcome: "failed", detail: "Error inesperado" });
    expect(classifyImportError("texto")).toEqual({ outcome: "failed", detail: "Error inesperado" });
  });
});

describe("syncGmail", () => {
  it("registra importados, duplicados y omitidos en el registro y en la corrida", async () => {
    const client = fakeGmailClient([
      { id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] },
      { id: "msg-2", pdfParts: [pdfPart("1", "resumen-repetido.pdf")] },
      { id: "msg-3", pdfParts: [pdfPart("2", "factura-ajena.pdf")] },
    ]);
    const importPdf = importByName({
      "resumen-sintetico.pdf": statementOutcome("imported", "stmt-1"),
      "resumen-repetido.pdf": statementOutcome("duplicate", "stmt-0"),
    });
    const run = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf, now: ticking() });
    expect(run).toMatchObject({ trigger: "manual", status: "ok", error: null, messagesChecked: 3, hasMore: false });
    expect(summaryOf(run.items)).toEqual([
      { fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement", documentId: "stmt-1" },
      { fileName: "resumen-repetido.pdf", outcome: "duplicate", kind: "statement", documentId: "stmt-0" },
      { fileName: "factura-ajena.pdf", outcome: "skipped", kind: null, documentId: null },
    ]);
    expect(run.items.map(({ detail }) => detail)).toEqual([
      "Visa Signature ****1234 · 3 movimientos", "Visa Signature ****1234 · 3 movimientos", "Formato de resumen no reconocido",
    ]);
    expect(run.items[0].receivedAt).toBe(FAKE_RECEIVED_AT);
    expect(client.listMessageIds).toHaveBeenCalledWith(QUERY, GMAIL_LIST_LIMIT);
    expect(importPdf).toHaveBeenCalledWith({ data: fakePdfBytes("msg-1", "1"), fileName: "resumen-sintetico.pdf" });
    expect(await GmailAttachmentModel.countDocuments()).toBe(3);
    expect(await GmailSyncRunModel.countDocuments()).toBe(1);
  });

  it("una segunda corrida no vuelve a leer los mails ya procesados", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]);
    const importPdf = importByName({ "resumen-sintetico.pdf": statementOutcome("imported", "stmt-1") });
    await syncGmail({ client, query: QUERY, trigger: "manual", importPdf });
    client.getMessage.mockClear();
    const second = await syncGmail({ client, query: QUERY, trigger: "job", importPdf });
    expect(client.getMessage).not.toHaveBeenCalled();
    expect(second).toMatchObject({ trigger: "job", status: "ok", messagesChecked: 0, items: [] });
    expect(await GmailSyncRunModel.countDocuments()).toBe(2);
  });

  it("un adjunto que falló se reintenta y pasa a importado", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]);
    const importPdf = vi.fn<(input: ImportPdfInput) => Promise<ImportPdfOutcome>>()
      .mockRejectedValueOnce(new Error("Mongo se cayó"))
      .mockResolvedValueOnce(statementOutcome("imported", "stmt-1"));
    const first = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(first.status).toBe("ok");
    expect(first.items).toMatchObject([{ outcome: "failed", detail: "Mongo se cayó" }]);
    const second = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(second.items).toMatchObject([{ outcome: "imported", documentId: "stmt-1" }]);
    expect(client.getMessage).toHaveBeenCalledTimes(2);
    expect(await GmailAttachmentModel.countDocuments()).toBe(1);
  });

  it("un adjunto de más de 15 MB queda omitido sin bajarlo", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "enorme.pdf", MAX_PDF_BYTES + 1)] }]);
    const importPdf = importByName({});
    const run = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(run.items).toMatchObject([{ fileName: "enorme.pdf", outcome: "skipped", detail: "Supera el máximo de 15 MB" }]);
    expect(client.downloadPart).not.toHaveBeenCalled();
    expect(importPdf).not.toHaveBeenCalled();
  });

  it("un mail sin PDF queda registrado con partId «-» y no se relee", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [] }]);
    const run = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}) });
    expect(run.items).toMatchObject([{ fileName: "(sin PDF adjunto)", outcome: "skipped", detail: "El mail no trae un PDF adjunto" }]);
    expect((await GmailAttachmentModel.findOne())?.partId).toBe(NO_PDF_PART_ID);
    client.getMessage.mockClear();
    await syncGmail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}) });
    expect(client.getMessage).not.toHaveBeenCalled();
  });

  it("un PDF con contraseña queda omitido con el motivo", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "protegido.pdf")] }]);
    const run = await syncGmail({
      client, query: QUERY, trigger: "manual", importPdf: importByName({ "protegido.pdf": new EncryptedPdfError() }),
    });
    expect(run.items).toMatchObject([{ outcome: "skipped", detail: "El PDF está protegido con contraseña" }]);
  });

  it("un GmailAuthError al listar deja una corrida con error, guardada y sin lanzar", async () => {
    const client = fakeGmailClient([]);
    client.listMessageIds.mockRejectedValueOnce(new GmailAuthError("Gmail rechazó el refresh token (venció o fue revocado)."));
    const run = await syncGmail({ client, query: QUERY, trigger: "job", importPdf: importByName({}) });
    expect(run).toMatchObject({
      status: "error", error: "Gmail rechazó el refresh token (venció o fue revocado).", messagesChecked: 0, items: [],
    });
    expect(await GmailSyncRunModel.countDocuments()).toBe(1);
  });

  it("un error inesperado fuera de la importación también termina en corrida con error", async () => {
    const client = fakeGmailClient([]);
    client.listMessageIds.mockRejectedValueOnce(new Error("se rompió algo"));
    const run = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}) });
    expect(run).toMatchObject({ status: "error", error: "se rompió algo" });
  });

  it("un error al leer un mail a mitad de camino conserva lo procesado antes", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]);
    client.listMessageIds.mockResolvedValueOnce(["msg-1", "msg-borrado"]);
    const importPdf = importByName({ "resumen-sintetico.pdf": statementOutcome("imported", "stmt-1") });
    const run = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(run).toMatchObject({ status: "error", error: "Gmail respondió 404.", messagesChecked: 1 });
    expect(run.items).toMatchObject([{ fileName: "resumen-sintetico.pdf", outcome: "imported" }]);
  });

  it("si Gmail falla al bajar el segundo PDF de un mail, ese PDF queda fallido y la próxima corrida lo importa", async () => {
    const client = fakeGmailClient([
      { id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf"), pdfPart("2", "cupon-sintetico.pdf")] },
    ]);
    client.downloadPart
      .mockResolvedValueOnce(fakePdfBytes("msg-1", "1"))
      .mockRejectedValueOnce(new GmailApiError("Gmail respondió 500."));
    const importPdf = importByName({
      "resumen-sintetico.pdf": statementOutcome("imported", "stmt-1"),
      "cupon-sintetico.pdf": statementOutcome("imported", "stmt-2"),
    });
    const first = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf, now: ticking() });
    expect(first).toMatchObject({ status: "error", error: "Gmail respondió 500." });
    expect(summaryOf(first.items)).toEqual([
      { fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement", documentId: "stmt-1" },
      { fileName: "cupon-sintetico.pdf", outcome: "failed", kind: null, documentId: null },
    ]);
    const second = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(second.status).toBe("ok");
    expect(summaryOf(second.items)).toEqual([
      { fileName: "cupon-sintetico.pdf", outcome: "imported", kind: "statement", documentId: "stmt-2" },
    ]);
    expect(importPdf).toHaveBeenCalledTimes(2);
  });

  it("con maxMessages avisa que quedan mails y la próxima corrida sigue", async () => {
    const client = fakeGmailClient([
      { id: "msg-2", pdfParts: [pdfPart("1", "factura-a.pdf")] },
      { id: "msg-1", pdfParts: [pdfPart("1", "factura-b.pdf")] },
    ]);
    const first = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}), maxMessages: 1 });
    expect(first).toMatchObject({ messagesChecked: 1, hasMore: true });
    expect(first.items.map(({ fileName }) => fileName)).toEqual(["factura-a.pdf"]);
    const second = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}), maxMessages: 1 });
    expect(second).toMatchObject({ messagesChecked: 1, hasMore: false });
    expect(second.items.map(({ fileName }) => fileName)).toEqual(["factura-b.pdf"]);
  });
});

describe("findLastGmailRun", () => {
  it("sin corridas devuelve null", async () => {
    expect(await findLastGmailRun()).toBeNull();
  });

  it("devuelve la corrida más nueva con sus ítems", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "factura.pdf")] }]);
    const clock = ticking();
    await syncGmail({ client, query: QUERY, trigger: "job", importPdf: importByName({}), now: clock });
    const latest = await syncGmail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}), now: clock });
    expect(await findLastGmailRun()).toEqual(latest);
  });
});

describe("runGmailSync", () => {
  const config: GmailConfig = {
    credentials: { clientId: "id-sintetico", clientSecret: "secreto-sintetico", refreshToken: "refresh-sintetico" },
    query: QUERY,
    intervalMinutes: null,
  };

  beforeEach(() => {
    vi.mocked(createGmailClient).mockReset();
    vi.mocked(createGmailClient).mockImplementation(() => fakeGmailClient([]));
  });

  it("une las llamadas concurrentes en una sola corrida", async () => {
    const manual = runGmailSync(config, "manual");
    const job = runGmailSync(config, "job");
    expect(job).toBe(manual);
    expect((await manual).trigger).toBe("manual");
    expect(createGmailClient).toHaveBeenCalledTimes(1);
    expect(createGmailClient).toHaveBeenCalledWith(config.credentials);
  });

  it("cuando termina, la próxima llamada arranca otra corrida", async () => {
    await runGmailSync(config, "manual");
    await runGmailSync(config, "manual");
    expect(createGmailClient).toHaveBeenCalledTimes(2);
    expect(await GmailSyncRunModel.countDocuments()).toBe(2);
  });

  it("después de un rechazo, la próxima llamada arranca otra corrida", async () => {
    const create = vi.spyOn(GmailSyncRunModel, "create").mockRejectedValueOnce(new Error("Mongo caído"));
    await expect(runGmailSync(config, "manual")).rejects.toThrow("Mongo caído");
    create.mockRestore();
    const run = await runGmailSync(config, "manual");
    expect(run.status).toBe("ok");
    expect(createGmailClient).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run server/src/gmail/gmailMappers.test.ts server/src/gmail/syncGmail.test.ts`
Expected: FAIL — `./gmailMappers.js`, `../testing/gmailFixtures.js` y `./syncGmail.js` no existen.

- [ ] **Step 3: Write the implementation**

`server/src/gmail/gmailMappers.ts`:

```typescript
import type { HydratedDocument } from "mongoose";
import type { GmailSyncItemDTO, GmailSyncRunDTO } from "@ledgerly/shared";
import type { GmailAttachmentDoc, GmailSyncRunDoc } from "../db/models.js";

export function toGmailSyncItemDTO(doc: HydratedDocument<GmailAttachmentDoc>): GmailSyncItemDTO {
  return {
    id: doc._id.toString(),
    fileName: doc.fileName,
    receivedAt: doc.receivedAt.toISOString(),
    outcome: doc.outcome as GmailSyncItemDTO["outcome"],
    kind: (doc.kind ?? null) as GmailSyncItemDTO["kind"],
    documentId: doc.documentId ?? null,
    detail: doc.detail,
  };
}

export function toGmailSyncRunDTO(
  run: HydratedDocument<GmailSyncRunDoc>,
  items: HydratedDocument<GmailAttachmentDoc>[],
): GmailSyncRunDTO {
  return {
    trigger: run.trigger as GmailSyncRunDTO["trigger"],
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt.toISOString(),
    status: run.status as GmailSyncRunDTO["status"],
    error: run.error ?? null,
    messagesChecked: run.messagesChecked,
    hasMore: run.hasMore,
    items: items.map(toGmailSyncItemDTO),
  };
}
```

`server/src/testing/gmailFixtures.ts`:

```typescript
import { vi } from "vitest";
import { GmailApiError, type GmailClient, type GmailMessage, type GmailPdfPart } from "../gmail/gmailClient.js";

export interface FakeGmailMessage {
  id: string;
  receivedAt?: string;
  pdfParts: GmailPdfPart[];
}

export const FAKE_RECEIVED_AT = "2026-09-28T12:00:00.000Z";

export const pdfPart = (partId: string, fileName: string, size = 2048): GmailPdfPart => ({
  partId, fileName, size, attachmentId: `att-${partId}`, inlineData: null,
});

export const fakePdfBytes = (messageId: string, partId: string): Uint8Array =>
  new TextEncoder().encode(`pdf-sintetico:${messageId}:${partId}`);

export function fakeGmailClient(messages: FakeGmailMessage[]) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return {
    listMessageIds: vi.fn(async (_query: string, limit: number): Promise<string[]> =>
      messages.map(({ id }) => id).slice(0, limit)),
    getMessage: vi.fn(async (id: string): Promise<GmailMessage> => {
      const message = byId.get(id);
      if (!message) throw new GmailApiError("Gmail respondió 404.");
      return { id, receivedAt: message.receivedAt ?? FAKE_RECEIVED_AT, pdfParts: message.pdfParts };
    }),
    downloadPart: vi.fn(async (messageId: string, part: GmailPdfPart): Promise<Uint8Array> =>
      fakePdfBytes(messageId, part.partId)),
  } satisfies GmailClient;
}
```

`server/src/gmail/syncGmail.ts`:

```typescript
import { Types } from "mongoose";
import type { GmailSyncOutcome, GmailSyncRunDTO, GmailSyncTrigger, ImportedFileKind } from "@ledgerly/shared";
import { GmailAttachmentModel, GmailSyncRunModel } from "../db/models.js";
import { IngestionError } from "../ingestion/errors.js";
import {
  importPdf as importPdfFile, MAX_PDF_BYTES, type ImportPdfInput, type ImportPdfOutcome,
} from "../import/importPdf.js";
import { createGmailClient, type GmailClient, type GmailMessage, type GmailPdfPart } from "./gmailClient.js";
import type { GmailConfig } from "./gmailConfig.js";
import { toGmailSyncRunDTO } from "./gmailMappers.js";

export const GMAIL_LIST_LIMIT = 500;
export const GMAIL_MAX_MESSAGES_PER_RUN = 50;
export const NO_PDF_PART_ID = "-";

const NO_PDF_FILE_NAME = "(sin PDF adjunto)";
const NO_PDF_DETAIL = "El mail no trae un PDF adjunto";
const TOO_BIG_DETAIL = "Supera el máximo de 15 MB";
const UNEXPECTED_ERROR = "Error inesperado";

export interface GmailLedgerEntry {
  messageId: string;
  partId: string;
  outcome: GmailSyncOutcome;
}

export interface SyncGmailDeps {
  client: GmailClient;
  query: string;
  trigger: GmailSyncTrigger;
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
  outcome: GmailSyncOutcome;
  kind: ImportedFileKind | null;
  documentId: string | null;
  detail: string;
}

interface RunContext {
  runId: Types.ObjectId;
  client: GmailClient;
  importPdf: (input: ImportPdfInput) => Promise<ImportPdfOutcome>;
  now: () => Date;
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

export function selectPendingMessages(ids: string[], ledger: GmailLedgerEntry[], max: number): PendingSelection {
  const outcomesByMessage = new Map<string, GmailSyncOutcome[]>();
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

const readLedger = async (ids: string[]): Promise<GmailLedgerEntry[]> => {
  const docs = await GmailAttachmentModel.find({ messageId: { $in: ids } }, { messageId: 1, partId: 1, outcome: 1 }).lean();
  return docs.map(({ messageId, partId, outcome }) => ({ messageId, partId, outcome: outcome as GmailSyncOutcome }));
};

const recordPart = async (
  ctx: RunContext, message: GmailMessage, partId: string, fileName: string, result: PartResult,
): Promise<void> => {
  await GmailAttachmentModel.updateOne(
    { messageId: message.id, partId },
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

const downloadPart = async (ctx: RunContext, message: GmailMessage, part: GmailPdfPart): Promise<Uint8Array> => {
  try {
    return await ctx.client.downloadPart(message.id, part);
  } catch (err) {
    await recordPart(ctx, message, part.partId, part.fileName, { outcome: "failed", detail: errorMessage(err), ...NO_DOCUMENT });
    throw err;
  }
};

const processPart = async (ctx: RunContext, message: GmailMessage, part: GmailPdfPart): Promise<PartResult> => {
  if (part.size > MAX_PDF_BYTES) return { outcome: "skipped", detail: TOO_BIG_DETAIL, ...NO_DOCUMENT };
  const data = await downloadPart(ctx, message, part);
  return importPart(ctx, data, part.fileName);
};

const processMessage = async (ctx: RunContext, message: GmailMessage): Promise<void> => {
  if (message.pdfParts.length === 0) {
    await recordPart(ctx, message, NO_PDF_PART_ID, NO_PDF_FILE_NAME, { outcome: "skipped", detail: NO_PDF_DETAIL, ...NO_DOCUMENT });
    return;
  }
  for (const part of message.pdfParts) {
    if (ctx.settled.has(ledgerKey(message.id, part.partId))) continue;
    await recordPart(ctx, message, part.partId, part.fileName, await processPart(ctx, message, part));
  }
};

const scanMailbox = async (
  ctx: RunContext, query: string, maxMessages: number, progress: RunProgress,
): Promise<void> => {
  const ids = await ctx.client.listMessageIds(query, GMAIL_LIST_LIMIT);
  const ledger = await readLedger(ids);
  const { batch, hasMore } = selectPendingMessages(ids, ledger, maxMessages);
  progress.hasMore = hasMore;
  ledger.forEach(({ messageId, partId, outcome }) => {
    if (outcome !== "failed") ctx.settled.add(ledgerKey(messageId, partId));
  });
  for (const messageId of batch) {
    const message = await ctx.client.getMessage(messageId);
    progress.messagesChecked += 1;
    await processMessage(ctx, message);
  }
};

const itemsOf = (runId: Types.ObjectId) => GmailAttachmentModel.find({ runId }).sort({ processedAt: 1, _id: 1 });

export async function syncGmail({
  client, query, trigger, importPdf = importPdfFile, maxMessages = GMAIL_MAX_MESSAGES_PER_RUN, now = () => new Date(),
}: SyncGmailDeps): Promise<GmailSyncRunDTO> {
  const runId = new Types.ObjectId();
  const startedAt = now();
  const ctx: RunContext = { runId, client, importPdf, now, settled: new Set() };
  const progress: RunProgress = { messagesChecked: 0, hasMore: false, error: null };
  try {
    await scanMailbox(ctx, query, maxMessages, progress);
  } catch (err) {
    progress.error = errorMessage(err);
  }
  const run = await GmailSyncRunModel.create({
    _id: runId,
    trigger,
    startedAt,
    finishedAt: now(),
    status: progress.error ? "error" : "ok",
    error: progress.error,
    messagesChecked: progress.messagesChecked,
    hasMore: progress.hasMore,
  });
  return toGmailSyncRunDTO(run, await itemsOf(runId));
}

let inFlight: Promise<GmailSyncRunDTO> | null = null;

export function runGmailSync(config: GmailConfig, trigger: GmailSyncTrigger): Promise<GmailSyncRunDTO> {
  if (inFlight) return inFlight;
  const run = syncGmail({ client: createGmailClient(config.credentials), query: config.query, trigger });
  const tracked = run.finally(() => {
    inFlight = null;
  });
  inFlight = tracked;
  return tracked;
}

export async function findLastGmailRun(): Promise<GmailSyncRunDTO | null> {
  const run = await GmailSyncRunModel.findOne().sort({ startedAt: -1 });
  return run ? toGmailSyncRunDTO(run, await itemsOf(run._id)) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run server/src/gmail`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/gmail/gmailMappers.ts server/src/gmail/gmailMappers.test.ts server/src/testing/gmailFixtures.ts server/src/gmail/syncGmail.ts server/src/gmail/syncGmail.test.ts
git commit -m "feat(server): sincronización idempotente de PDFs de Gmail con registro de adjuntos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ruta `/api/gmail` (status y búsqueda manual)

**Files:**
- Modify: `server/src/http/routes/gmail.ts` (reemplaza el stub)
- Create: `server/src/http/routes/gmail.test.ts`

**Interfaces:**
- Consumes: `readGmailConfig`, `missingGmailVars` (Task 3); `runGmailSync`, `findLastGmailRun` (Task 5); `gmailRouter` ya montado en `/api/gmail` por la base.
- Produces: `GET /api/gmail/status → 200 GmailStatusDTO`; `POST /api/gmail/sync → 200 GmailSyncRunDTO | 409 { error }`. Los consumen `useGmailStatus` / `useGmailSync` (base) y la UI (Task 10).

- [ ] **Step 1: Write the failing test**

`server/src/http/routes/gmail.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { gmailStatusDtoSchema, gmailSyncRunDtoSchema } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { fakeGmailClient, pdfPart } from "../../testing/gmailFixtures.js";

vi.mock("../../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
vi.mock("../../gmail/gmailClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../gmail/gmailClient.js")>()),
  createGmailClient: vi.fn(),
}));
import { extractPdfText } from "../../pdf/extract.js";
import { createGmailClient, GmailAuthError } from "../../gmail/gmailClient.js";
import { StatementModel } from "../../db/models.js";
import { createApp } from "../app.js";

withDb();
const app = createApp();
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const statementText = readFileSync(
  fileURLToPath(new URL("../../parsers/__fixtures__/icbc.sample.txt", import.meta.url)), "utf8",
);
const CREDENTIAL_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"];
const SECRETS = ["secreto-sintetico", "refresh-sintetico"];

const enableGmail = (extra: Record<string, string> = {}) => {
  vi.stubEnv("GMAIL_CLIENT_ID", "id-sintetico");
  vi.stubEnv("GMAIL_CLIENT_SECRET", "secreto-sintetico");
  vi.stubEnv("GMAIL_REFRESH_TOKEN", "refresh-sintetico");
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
};

beforeEach(() => {
  for (const key of [...CREDENTIAL_VARS, "GMAIL_QUERY", "GMAIL_SYNC_INTERVAL_MINUTES"]) vi.stubEnv(key, "");
  vi.mocked(createGmailClient).mockReset();
  vi.mocked(extractPdfText).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/gmail/status", () => {
  it("sin credenciales informa deshabilitado y qué variables faltan", async () => {
    const res = await request(app).get("/api/gmail/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, missing: CREDENTIAL_VARS, query: null, intervalMinutes: null, lastRun: null });
    expect(() => gmailStatusDtoSchema.parse(res.body)).not.toThrow();
  });

  it("con credenciales informa la consulta y el intervalo, sin exponer secretos", async () => {
    enableGmail({ GMAIL_SYNC_INTERVAL_MINUTES: "360" });
    const res = await request(app).get("/api/gmail/status");
    expect(res.body).toEqual({
      enabled: true, missing: [], query: "has:attachment filename:pdf newer_than:90d", intervalMinutes: 360, lastRun: null,
    });
    for (const secret of SECRETS) expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it("un intervalo inválido queda como búsqueda automática apagada", async () => {
    enableGmail({ GMAIL_SYNC_INTERVAL_MINUTES: "5", GMAIL_QUERY: "from:banco has:attachment" });
    const res = await request(app).get("/api/gmail/status");
    expect(res.body).toMatchObject({ enabled: true, query: "from:banco has:attachment", intervalMinutes: null });
  });
});

describe("POST /api/gmail/sync", () => {
  it("sin credenciales responde 409 sin intentar conectarse", async () => {
    const res = await request(app).post("/api/gmail/sync");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Gmail no está configurado: faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN");
    expect(createGmailClient).not.toHaveBeenCalled();
  });

  it("importa el resumen de un mail y después el status trae la corrida", async () => {
    enableGmail();
    vi.mocked(extractPdfText).mockResolvedValue({ text: statementText, meta });
    vi.mocked(createGmailClient).mockReturnValue(
      fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]),
    );
    const res = await request(app).post("/api/gmail/sync");
    expect(res.status).toBe(200);
    const run = gmailSyncRunDtoSchema.parse(res.body);
    expect(run).toMatchObject({ trigger: "manual", status: "ok", messagesChecked: 1 });
    expect(run.items).toMatchObject([{ fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement" }]);
    expect(await StatementModel.countDocuments()).toBe(1);
    expect(run.items[0].documentId).toBe((await StatementModel.findOne())?._id.toString());

    const status = await request(app).get("/api/gmail/status");
    expect(status.body.lastRun).toEqual(res.body);
  });

  it("un token rechazado responde 200 con la corrida en error", async () => {
    enableGmail();
    const client = fakeGmailClient([]);
    client.listMessageIds.mockRejectedValue(new GmailAuthError("Gmail rechazó el refresh token (venció o fue revocado)."));
    vi.mocked(createGmailClient).mockReturnValue(client);
    const res = await request(app).post("/api/gmail/sync");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "error", error: "Gmail rechazó el refresh token (venció o fue revocado)." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/gmail.test.ts`
Expected: FAIL — el stub no tiene handlers: `/api/gmail/status` y `/api/gmail/sync` responden 404.

- [ ] **Step 3: Write the implementation**

`server/src/http/routes/gmail.ts` completo:

```typescript
import { Router } from "express";
import type { GmailStatusDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { missingGmailVars, readGmailConfig } from "../../gmail/gmailConfig.js";
import { findLastGmailRun, runGmailSync } from "../../gmail/syncGmail.js";

export const gmailRouter = Router();

gmailRouter.get("/status", asyncHandler(async (_req, res) => {
  const config = readGmailConfig(process.env);
  const status: GmailStatusDTO = {
    enabled: config !== null,
    missing: missingGmailVars(process.env),
    query: config?.query ?? null,
    intervalMinutes: config?.intervalMinutes ?? null,
    lastRun: await findLastGmailRun(),
  };
  res.json(status);
}));

gmailRouter.post("/sync", asyncHandler(async (_req, res) => {
  const config = readGmailConfig(process.env);
  if (!config) {
    throw new HttpError(409, `Gmail no está configurado: faltan ${missingGmailVars(process.env).join(", ")}`);
  }
  res.json(await runGmailSync(config, "manual"));
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/http/routes/gmail.ts server/src/http/routes/gmail.test.ts
git commit -m "feat(server): GET /api/gmail/status y POST /api/gmail/sync" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Job periódico y arranque del server

**Files:**
- Create: `server/src/gmail/gmailJob.ts`
- Create: `server/src/gmail/gmailJob.test.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `GmailConfig`, `describeGmailSetup`, `readGmailConfig` (Task 3); `runGmailSync`, `findLastGmailRun` (Task 5).
- Produces: `GMAIL_STARTUP_DELAY_MS`, `nextGmailRunDelayMs(lastStartedAt, intervalMinutes, now): number`, `formatGmailRunLog(run): string`, `startGmailJob(config): Promise<() => void>`.

- [ ] **Step 1: Write the failing test**

`server/src/gmail/gmailJob.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GmailSyncItemDTO, GmailSyncRunDTO } from "@ledgerly/shared";

vi.mock("./syncGmail.js", () => ({ runGmailSync: vi.fn(), findLastGmailRun: vi.fn() }));
import { findLastGmailRun, runGmailSync } from "./syncGmail.js";
import type { GmailConfig } from "./gmailConfig.js";
import { formatGmailRunLog, GMAIL_STARTUP_DELAY_MS, nextGmailRunDelayMs, startGmailJob } from "./gmailJob.js";

const MINUTE = 60_000;
const NOW = new Date("2026-10-03T12:00:00.000Z");
const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE);

const config = (intervalMinutes: number | null): GmailConfig => ({
  credentials: { clientId: "id-sintetico", clientSecret: "secreto-sintetico", refreshToken: "refresh-sintetico" },
  query: "has:attachment",
  intervalMinutes,
});

const item = (id: string, outcome: GmailSyncItemDTO["outcome"]): GmailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: "2026-09-28T12:00:00.000Z", outcome, kind: null, documentId: null, detail: "x",
});

const runOf = (overrides: Partial<GmailSyncRunDTO> = {}): GmailSyncRunDTO => ({
  trigger: "job", startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), status: "ok", error: null,
  messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

describe("nextGmailRunDelayMs", () => {
  it("sin corridas espera el delay de arranque", () => {
    expect(nextGmailRunDelayMs(null, 360, NOW)).toBe(GMAIL_STARTUP_DELAY_MS);
  });

  it("con una corrida reciente espera lo que falta del intervalo", () => {
    expect(nextGmailRunDelayMs(minutesBefore(60), 360, NOW)).toBe(300 * MINUTE);
  });

  it("con una corrida vieja usa el piso de 60 s", () => {
    expect(nextGmailRunDelayMs(minutesBefore(3 * 24 * 60), 360, NOW)).toBe(GMAIL_STARTUP_DELAY_MS);
  });

  it("nunca baja del piso aunque falten segundos", () => {
    const delay = nextGmailRunDelayMs(new Date(NOW.getTime() - (360 * MINUTE - 30_000)), 360, NOW);
    expect(delay).toBe(GMAIL_STARTUP_DELAY_MS);
    expect(delay).toBeGreaterThan(0);
  });
});

describe("formatGmailRunLog", () => {
  it("resume una corrida automática ok", () => {
    const run = runOf({ messagesChecked: 2, items: [item("a", "imported"), item("b", "skipped")] });
    expect(formatGmailRunLog(run)).toBe(
      "Gmail (automática): 2 mails nuevos · importados 1 · ya estaban 0 · omitidos 1 · con error 0",
    );
  });

  it("usa el singular con un solo mail", () => {
    expect(formatGmailRunLog(runOf({ messagesChecked: 1, items: [item("a", "duplicate")] })))
      .toBe("Gmail (automática): 1 mail nuevo · importados 0 · ya estaban 1 · omitidos 0 · con error 0");
  });

  it("muestra el error de una corrida fallida", () => {
    expect(formatGmailRunLog(runOf({ status: "error", error: "Gmail respondió 500." })))
      .toBe("Gmail (automática): error — Gmail respondió 500.");
  });

  it("dice manual si la corrida a la que se unió el job era manual", () => {
    expect(formatGmailRunLog(runOf({ trigger: "manual" }))).toMatch(/^Gmail \(manual\): /);
  });
});

describe("startGmailJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(runGmailSync).mockReset();
    vi.mocked(findLastGmailRun).mockReset();
    vi.mocked(findLastGmailRun).mockResolvedValue(null);
    vi.mocked(runGmailSync).mockResolvedValue(runOf());
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("corre al delay de arranque, loguea y encadena la siguiente al intervalo", async () => {
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS - 1);
    expect(runGmailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runGmailSync).toHaveBeenCalledTimes(1);
    expect(runGmailSync).toHaveBeenCalledWith(config(360), "job");
    expect(console.log).toHaveBeenCalledWith(formatGmailRunLog(runOf()));
    await vi.advanceTimersByTimeAsync(360 * MINUTE);
    expect(runGmailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("respeta la última corrida registrada", async () => {
    vi.mocked(findLastGmailRun).mockResolvedValue(runOf({ startedAt: minutesBefore(60).toISOString() }));
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(300 * MINUTE - 1);
    expect(runGmailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runGmailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("loguea con console.error una corrida que terminó en error", async () => {
    vi.mocked(runGmailSync).mockResolvedValue(runOf({ status: "error", error: "Gmail respondió 403." }));
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS);
    expect(console.error).toHaveBeenCalledWith("Gmail (automática): error — Gmail respondió 403.");
    stop();
  });

  it("sigue programando aunque una corrida rechace", async () => {
    vi.mocked(runGmailSync).mockRejectedValueOnce(new Error("Mongo caído"));
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS);
    expect(console.error).toHaveBeenCalledWith("Gmail (automática): error — Mongo caído");
    await vi.advanceTimersByTimeAsync(360 * MINUTE);
    expect(runGmailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("si no puede leer la última corrida arranca con el delay de arranque", async () => {
    vi.mocked(findLastGmailRun).mockRejectedValue(new Error("Mongo caído"));
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS);
    expect(runGmailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("la función devuelta cancela la próxima corrida", async () => {
    const stop = await startGmailJob(config(360));
    stop();
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS + 720 * MINUTE);
    expect(runGmailSync).not.toHaveBeenCalled();
  });

  it("sin intervalo no programa nada", async () => {
    await startGmailJob(config(null));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS + 720 * MINUTE);
    expect(runGmailSync).not.toHaveBeenCalled();
    expect(findLastGmailRun).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/gmail/gmailJob.test.ts`
Expected: FAIL — `./gmailJob.js` no existe.

- [ ] **Step 3: Write the implementation**

`server/src/gmail/gmailJob.ts`:

```typescript
import type { GmailSyncOutcome, GmailSyncRunDTO, GmailSyncTrigger } from "@ledgerly/shared";
import type { GmailConfig } from "./gmailConfig.js";
import { findLastGmailRun, runGmailSync } from "./syncGmail.js";

export const GMAIL_STARTUP_DELAY_MS = 60_000;
const MINUTE_MS = 60_000;
const UNEXPECTED_ERROR = "Error inesperado";

const TRIGGER_LOG_LABELS: Record<GmailSyncTrigger, string> = { manual: "manual", job: "automática" };

export function nextGmailRunDelayMs(lastStartedAt: Date | null, intervalMinutes: number, now: Date): number {
  if (!lastStartedAt) return GMAIL_STARTUP_DELAY_MS;
  const dueInMs = lastStartedAt.getTime() + intervalMinutes * MINUTE_MS - now.getTime();
  return Math.max(GMAIL_STARTUP_DELAY_MS, dueInMs);
}

const countOf = (run: GmailSyncRunDTO, outcome: GmailSyncOutcome): number =>
  run.items.filter((item) => item.outcome === outcome).length;

const mailsLabel = (count: number): string => (count === 1 ? "1 mail nuevo" : `${count} mails nuevos`);

const logPrefix = (trigger: GmailSyncTrigger): string => `Gmail (${TRIGGER_LOG_LABELS[trigger]})`;

export function formatGmailRunLog(run: GmailSyncRunDTO): string {
  const prefix = logPrefix(run.trigger);
  if (run.status === "error") return `${prefix}: error — ${run.error ?? UNEXPECTED_ERROR}`;
  const counts = [
    `importados ${countOf(run, "imported")}`,
    `ya estaban ${countOf(run, "duplicate")}`,
    `omitidos ${countOf(run, "skipped")}`,
    `con error ${countOf(run, "failed")}`,
  ];
  return `${prefix}: ${[mailsLabel(run.messagesChecked), ...counts].join(" · ")}`;
}

const logRun = (run: GmailSyncRunDTO): void => {
  const line = formatGmailRunLog(run);
  if (run.status === "error") console.error(line);
  else console.log(line);
};

const lastStartedAt = async (): Promise<Date | null> => {
  try {
    const run = await findLastGmailRun();
    return run ? new Date(run.startedAt) : null;
  } catch {
    return null;
  }
};

export async function startGmailJob(config: GmailConfig): Promise<() => void> {
  const { intervalMinutes } = config;
  if (intervalMinutes === null) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const runOnce = async (): Promise<void> => {
    try {
      logRun(await runGmailSync(config, "job"));
    } catch (err) {
      console.error(`${logPrefix("job")}: error — ${err instanceof Error ? err.message : UNEXPECTED_ERROR}`);
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

  schedule(nextGmailRunDelayMs(await lastStartedAt(), intervalMinutes, new Date()));

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
```

Si el typecheck resuelve `setTimeout` al de DOM (devuelve `number`, sin `unref`), tipar `timer` como `NodeJS.Timeout | null` y usar `globalThis.setTimeout` con el tipo de Node; no importar de `node:timers`, porque los fake timers de Vitest parchean el global y no el módulo.

`server/src/index.ts` completo:

```typescript
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./http/app.js";
import { serveClient } from "./http/serveClient.js";
import { resolveListenOptions } from "./http/listenOptions.js";
import { connectMongo } from "./db/connection.js";
import { describeGmailSetup, readGmailConfig } from "./gmail/gmailConfig.js";
import { startGmailJob } from "./gmail/gmailJob.js";

const { port, host } = resolveListenOptions(process.env);
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
const clientDist = join(dirname(fileURLToPath(import.meta.url)), "../../client/dist");

await connectMongo(MONGO_URL);
const app = createApp();
serveClient(app, clientDist);

const logListening = (): void => {
  console.log(`Ledgerly API en http://${host ?? "localhost"}:${port}`);
};

if (host) {
  app.listen(port, host, logListening);
} else {
  app.listen(port, logListening);
}

console.log(describeGmailSetup(process.env));
const gmailConfig = readGmailConfig(process.env);
if (gmailConfig?.intervalMinutes) await startGmailJob(gmailConfig);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/gmail`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/gmail/gmailJob.ts server/src/gmail/gmailJob.test.ts server/src/index.ts
git commit -m "feat(server): búsqueda automática en Gmail opcional y log de configuración al arrancar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Script de autorización `bun run gmail:auth`

**Files:**
- Create: `server/src/gmail/authorizeGmail.ts`
- Create: `server/src/gmail/authorizeGmail.test.ts`

**Interfaces:**
- Consumes: `GMAIL_READONLY_SCOPE` (Task 3). El script `gmail:auth` ya está en el `package.json` raíz (base).
- Produces: `createPkcePair()`, `buildGmailAuthUrl(input)`, `exchangeGmailCode(input)`, `upsertEnvVar(content, key, value)`.

- [ ] **Step 1: Write the failing test**

`server/src/gmail/authorizeGmail.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { GMAIL_READONLY_SCOPE } from "./gmailConfig.js";
import { buildGmailAuthUrl, createPkcePair, exchangeGmailCode, upsertEnvVar } from "./authorizeGmail.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const exchangeInput = {
  clientId: "id-sintetico", clientSecret: "secreto-sintetico", code: "codigo-sintetico",
  redirectUri: "http://127.0.0.1:5555/oauth2callback", codeVerifier: "verifier-sintetico",
};

afterEach(() => vi.unstubAllGlobals());

describe("buildGmailAuthUrl", () => {
  it("pide solo lectura, acceso offline, consentimiento y PKCE S256", () => {
    const url = new URL(buildGmailAuthUrl({
      clientId: "id-sintetico", redirectUri: "http://127.0.0.1:5555/oauth2callback", state: "estado", codeChallenge: "desafio",
    }));
    expect(`${url.origin}${url.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "id-sintetico",
      redirect_uri: "http://127.0.0.1:5555/oauth2callback",
      response_type: "code",
      scope: GMAIL_READONLY_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state: "estado",
      code_challenge: "desafio",
      code_challenge_method: "S256",
    });
  });
});

describe("createPkcePair", () => {
  it("el challenge es el SHA-256 en base64url del verifier", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("genera un verifier distinto cada vez", () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
  });
});

describe("exchangeGmailCode", () => {
  it("manda el código con el verifier y devuelve el refresh token", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ access_token: "access-sintetico", refresh_token: "1//refresh-sintetico" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await exchangeGmailCode(exchangeInput)).toBe("1//refresh-sintetico");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      client_id: "id-sintetico",
      client_secret: "secreto-sintetico",
      code: "codigo-sintetico",
      code_verifier: "verifier-sintetico",
      redirect_uri: "http://127.0.0.1:5555/oauth2callback",
      grant_type: "authorization_code",
    });
  });

  it("falla con un mensaje claro si Google no devuelve refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ access_token: "access-sintetico" })));
    await expect(exchangeGmailCode(exchangeInput)).rejects.toThrow(
      "Google no devolvió refresh token; revocá el acceso de Ledgerly en tu cuenta y volvé a correr el script",
    );
  });

  it("falla con el status y el código de Google si rechaza el código, sin el secreto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_grant", error_description: "Bad Request" }, 400)));
    const error = await exchangeGmailCode(exchangeInput).catch((err: unknown) => err as Error);
    expect(error.message).toBe("Google rechazó la autorización (400, invalid_grant).");
    expect(error.message).not.toContain("secreto-sintetico");
  });
});

describe("upsertEnvVar", () => {
  const ENV = "MONGO_URL=mongodb://localhost:27017/ledgerly\nGMAIL_CLIENT_ID=id\nGMAIL_REFRESH_TOKEN=\nPORT=4000\n";

  it("reemplaza la línea existente y conserva las demás", () => {
    expect(upsertEnvVar(ENV, "GMAIL_REFRESH_TOKEN", "1//nuevo")).toBe(
      "MONGO_URL=mongodb://localhost:27017/ledgerly\nGMAIL_CLIENT_ID=id\nGMAIL_REFRESH_TOKEN=1//nuevo\nPORT=4000\n",
    );
  });

  it("agrega la variable al final si no estaba", () => {
    expect(upsertEnvVar("A=1\n", "GMAIL_REFRESH_TOKEN", "x")).toBe("A=1\nGMAIL_REFRESH_TOKEN=x\n");
  });

  it("respeta un archivo sin salto final", () => {
    expect(upsertEnvVar("A=1", "GMAIL_REFRESH_TOKEN", "x")).toBe("A=1\nGMAIL_REFRESH_TOKEN=x");
  });

  it("en un archivo vacío deja solo la variable", () => {
    expect(upsertEnvVar("", "GMAIL_REFRESH_TOKEN", "x")).toBe("GMAIL_REFRESH_TOKEN=x\n");
  });

  it("no confunde otra variable que empieza igual ni un comentario", () => {
    const content = "GMAIL_REFRESH_TOKEN_VIEJO=a\n# GMAIL_REFRESH_TOKEN=comentado\n";
    expect(upsertEnvVar(content, "GMAIL_REFRESH_TOKEN", "x")).toBe(`${content}GMAIL_REFRESH_TOKEN=x\n`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/gmail/authorizeGmail.test.ts`
Expected: FAIL — `./authorizeGmail.js` no existe.

- [ ] **Step 3: Write the implementation**

`server/src/gmail/authorizeGmail.ts`:

```typescript
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { GMAIL_READONLY_SCOPE } from "./gmailConfig.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const LOOPBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/oauth2callback";
const AUTH_TIMEOUT_MS = 5 * 60_000;
const REFRESH_TOKEN_VAR = "GMAIL_REFRESH_TOKEN";
const ENV_FILE_MODE = 0o600;
const PAGE_HEADERS = { "Content-Type": "text/html; charset=utf-8" };
const NO_REFRESH_TOKEN_MESSAGE =
  "Google no devolvió refresh token; revocá el acceso de Ledgerly en tu cuenta y volvé a correr el script";

interface PkcePair {
  verifier: string;
  challenge: string;
}

interface GmailAuthUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

interface GmailCodeExchangeInput {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

interface TokenExchangeResponse {
  refresh_token?: string;
  error?: string;
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildGmailAuthUrl({ clientId, redirectUri, state, codeChallenge }: GmailAuthUrlInput): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGmailCode({
  clientId, clientSecret, code, redirectUri, codeVerifier,
}: GmailCodeExchangeInput): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await response.json().catch(() => null)) as TokenExchangeResponse | null;
  if (!response.ok) {
    const code = body?.error ? `, ${body.error}` : "";
    throw new Error(`Google rechazó la autorización (${response.status}${code}).`);
  }
  if (!body?.refresh_token) throw new Error(NO_REFRESH_TOKEN_MESSAGE);
  return body.refresh_token;
}

export function upsertEnvVar(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const lines = content.split("\n");
  const index = lines.findIndex((current) => current.trimStart().startsWith(`${key}=`));
  if (index >= 0) return lines.map((current, position) => (position === index ? line : current)).join("\n");
  if (content === "") return `${line}\n`;
  return content.endsWith("\n") ? `${content}${line}\n` : `${content}\n${line}`;
}

const page = (message: string): string =>
  `<!doctype html><meta charset="utf-8"><title>Ledgerly</title><p style="font-family:system-ui;margin:2rem">${message}</p>`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const listenOnLoopback = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, LOOPBACK_HOST, () => resolve((server.address() as AddressInfo).port));
  });

const waitForAuthorizationCode = (server: Server, state: string): Promise<string> =>
  new Promise((resolve, reject) => {
    server.on("request", (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`);
      if (url.pathname !== CALLBACK_PATH || url.searchParams.get("state") !== state) {
        res.writeHead(404, PAGE_HEADERS).end(page("No encontrado."));
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(200, PAGE_HEADERS).end(page("Cancelaste la autorización. Ya podés cerrar esta pestaña."));
        const denied = url.searchParams.get("error") === "access_denied";
        reject(new Error(denied ? "Cancelaste la autorización." : "Google no devolvió un código de autorización."));
        return;
      }
      res.writeHead(200, PAGE_HEADERS).end(page("Listo, ya podés cerrar esta pestaña."));
      resolve(code);
    });
  });

const saveRefreshToken = (refreshToken: string): void => {
  const envPath = join(process.cwd(), ".env");
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  writeFileSync(envPath, upsertEnvVar(current, REFRESH_TOKEN_VAR, refreshToken), { mode: ENV_FILE_MODE });
};

const authorizeGmail = async (): Promise<void> => {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) fail("Primero cargá GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET en .env (ver README).");

  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString("hex");
  const server = createServer();
  const port = await listenOnLoopback(server);
  const redirectUri = `http://${LOOPBACK_HOST}:${port}${CALLBACK_PATH}`;
  const timeout = setTimeout(() => fail("Se venció la espera."), AUTH_TIMEOUT_MS);
  const authUrl = buildGmailAuthUrl({ clientId, redirectUri, state, codeChallenge: challenge });
  console.log(`Abrí este link y autorizá a Ledgerly (solo lectura): ${authUrl}`);

  try {
    const code = await waitForAuthorizationCode(server, state);
    const refreshToken = await exchangeGmailCode({ clientId, clientSecret, code, redirectUri, codeVerifier: verifier });
    saveRefreshToken(refreshToken);
    console.log("Listo: guardé GMAIL_REFRESH_TOKEN en .env. Reiniciá el server para que lo tome.");
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
    server.closeAllConnections();
    server.close();
  }
};

if (process.argv[1]?.endsWith("authorizeGmail.ts")) {
  await authorizeGmail();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/gmail/authorizeGmail.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add server/src/gmail/authorizeGmail.ts server/src/gmail/authorizeGmail.test.ts
git commit -m "feat(server): script gmail:auth con OAuth loopback y PKCE que guarda el refresh token en .env" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Lógica pura del cliente (`gmailImport.ts`)

**Files:**
- Create: `client/src/gmailImport.ts`
- Create: `client/src/gmailImport.test.ts`

**Interfaces:**
- Consumes: tipos `GmailSyncItemDTO`, `GmailSyncOutcome`, `GmailSyncRunDTO`, `GmailSyncTrigger` de `@ledgerly/shared` (solo tipos: un valor arrastraría zod al bundle); `formatLocalDate` (`client/src/format.ts`); `IMPORTED_FILE_KIND_LABELS` (`client/src/importedFiles.ts`).
- Produces: `GMAIL_OUTCOME_LABELS`, `GMAIL_OUTCOME_COLORS`, `GmailOutcomeColor`, `GmailItemsSplit`, `joinWithY`, `formatDateTime`, `gmailMissingVarsMessage`, `gmailIntervalLabel`, `gmailLastRunLabel`, `gmailRunSummary`, `splitGmailItems`, `gmailItemSecondary`. Los consumen los componentes (Task 10).

- [ ] **Step 1: Write the failing test**

`client/src/gmailImport.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { GmailSyncItemDTO, GmailSyncRunDTO } from "@ledgerly/shared";
import { formatLocalDate } from "./format.js";
import {
  formatDateTime, gmailIntervalLabel, gmailItemSecondary, gmailLastRunLabel, gmailMissingVarsMessage, gmailRunSummary,
  joinWithY, splitGmailItems,
} from "./gmailImport.js";

const RECEIVED_AT = "2026-09-28T12:00:00.000Z";
const SHORT_DATE_TIME = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

const item = (id: string, outcome: GmailSyncItemDTO["outcome"], overrides: Partial<GmailSyncItemDTO> = {}): GmailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: RECEIVED_AT, outcome, kind: null, documentId: null, detail: "Formato de resumen no reconocido",
  ...overrides,
});

const runOf = (overrides: Partial<GmailSyncRunDTO> = {}): GmailSyncRunDTO => ({
  trigger: "manual", startedAt: "2026-10-03T17:05:00.000Z", finishedAt: "2026-10-03T17:05:09.000Z", status: "ok", error: null,
  messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

describe("joinWithY", () => {
  it("une con comas y una «y» final", () => {
    expect(joinWithY([])).toBe("");
    expect(joinWithY(["A"])).toBe("A");
    expect(joinWithY(["A", "B"])).toBe("A y B");
    expect(joinWithY(["A", "B", "C"])).toBe("A, B y C");
  });
});

describe("gmailMissingVarsMessage", () => {
  it("nombra las variables que faltan", () => {
    expect(gmailMissingVarsMessage(["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"])).toBe(
      "Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN en el .env del server. Los pasos para obtenerlas están en el README, sección «Importar desde Gmail»; después reiniciá el server.",
    );
  });

  it("concuerda en singular cuando falta una sola", () => {
    expect(gmailMissingVarsMessage(["GMAIL_REFRESH_TOKEN"])).toBe(
      "Falta GMAIL_REFRESH_TOKEN en el .env del server. Los pasos para obtenerla están en el README, sección «Importar desde Gmail»; después reiniciá el server.",
    );
  });
});

describe("gmailIntervalLabel", () => {
  it("apagada, en horas si es múltiplo de 60, si no en minutos", () => {
    expect(gmailIntervalLabel(null)).toBe("apagada");
    expect(gmailIntervalLabel(360)).toBe("cada 6 h");
    expect(gmailIntervalLabel(60)).toBe("cada 1 h");
    expect(gmailIntervalLabel(90)).toBe("cada 90 min");
  });
});

describe("gmailLastRunLabel y formatDateTime", () => {
  it("sin corridas invita a buscar", () => {
    expect(gmailLastRunLabel(null)).toBe("Todavía no buscaste en Gmail.");
  });

  it("muestra la fecha corta y quién la disparó", () => {
    const expected = SHORT_DATE_TIME.format(new Date("2026-10-03T17:05:00.000Z"));
    expect(formatDateTime("2026-10-03T17:05:00.000Z")).toBe(expected);
    expect(gmailLastRunLabel(runOf())).toBe(`Última búsqueda: ${expected} (manual)`);
    expect(gmailLastRunLabel(runOf({ trigger: "job" }))).toBe(`Última búsqueda: ${expected} (automática)`);
  });
});

describe("gmailRunSummary", () => {
  it("una corrida con error y sin ítems no tiene resumen", () => {
    expect(gmailRunSummary(runOf({ status: "error", error: "Gmail respondió 500." }))).toBeNull();
  });

  it("sin mails nuevos lo dice", () => {
    expect(gmailRunSummary(runOf())).toBe("No había mails nuevos.");
  });

  it("cuenta solo lo distinto de cero, en singular", () => {
    const run = runOf({ messagesChecked: 3, items: [item("a", "imported"), item("b", "duplicate"), item("c", "skipped")] });
    expect(gmailRunSummary(run)).toBe("Revisé 3 mails nuevos: 1 importado · 1 ya estaba · 1 omitido");
  });

  it("usa los plurales", () => {
    const run = runOf({
      messagesChecked: 8,
      items: [
        item("a", "imported"), item("b", "imported"), item("c", "duplicate"), item("d", "duplicate"),
        item("e", "skipped"), item("f", "skipped"), item("g", "failed"), item("h", "failed"),
      ],
    });
    expect(gmailRunSummary(run)).toBe("Revisé 8 mails nuevos: 2 importados · 2 ya estaban · 2 omitidos · 2 con error");
  });

  it("con un mail y un error lo cuenta", () => {
    expect(gmailRunSummary(runOf({ messagesChecked: 1, items: [item("a", "failed")] })))
      .toBe("Revisé 1 mail nuevo: 1 con error");
  });

  it("con mails pero sin ítems dice que no tenían PDFs", () => {
    expect(gmailRunSummary(runOf({ messagesChecked: 1 }))).toBe("Revisé 1 mail nuevo: no tenía PDFs.");
    expect(gmailRunSummary(runOf({ messagesChecked: 2 }))).toBe("Revisé 2 mails nuevos: no tenían PDFs.");
  });

  it("una corrida con error que alcanzó a procesar algo también tiene resumen", () => {
    expect(gmailRunSummary(runOf({ status: "error", error: "x", messagesChecked: 1, items: [item("a", "imported")] })))
      .toBe("Revisé 1 mail nuevo: 1 importado");
  });
});

describe("splitGmailItems", () => {
  it("separa los omitidos y ordena importados, con error y ya estaban", () => {
    const items = [item("dup", "duplicate"), item("omit", "skipped"), item("err", "failed"), item("imp", "imported")];
    const { visible, skipped } = splitGmailItems(items);
    expect(visible.map(({ id }) => id)).toEqual(["imp", "err", "dup"]);
    expect(skipped.map(({ id }) => id)).toEqual(["omit"]);
  });
});

describe("gmailItemSecondary", () => {
  it("une tipo, detalle y fecha de recepción", () => {
    const imported = item("a", "imported", { kind: "statement", detail: "Visa Signature ****1234 · 42 movimientos" });
    expect(gmailItemSecondary(imported)).toBe(`Tarjeta · Visa Signature ****1234 · 42 movimientos · ${formatLocalDate(RECEIVED_AT)}`);
  });

  it("sin tipo deja solo el detalle y la fecha", () => {
    expect(gmailItemSecondary(item("b", "skipped"))).toBe(`Formato de resumen no reconocido · ${formatLocalDate(RECEIVED_AT)}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/gmailImport.test.ts`
Expected: FAIL — `./gmailImport.js` no existe.

- [ ] **Step 3: Write the implementation**

`client/src/gmailImport.ts`:

```typescript
import type { GmailSyncItemDTO, GmailSyncOutcome, GmailSyncRunDTO, GmailSyncTrigger } from "@ledgerly/shared";
import { formatLocalDate } from "./format.js";
import { IMPORTED_FILE_KIND_LABELS } from "./importedFiles.js";

export type GmailOutcomeColor = "success" | "default" | "warning" | "error";

export interface GmailItemsSplit {
  visible: GmailSyncItemDTO[];
  skipped: GmailSyncItemDTO[];
}

interface CountLabels {
  one: string;
  many: string;
}

export const GMAIL_OUTCOME_LABELS: Record<GmailSyncOutcome, string> = {
  imported: "Importado",
  duplicate: "Ya estaba",
  skipped: "Omitido",
  failed: "Error",
};

export const GMAIL_OUTCOME_COLORS: Record<GmailSyncOutcome, GmailOutcomeColor> = {
  imported: "success",
  duplicate: "default",
  skipped: "warning",
  failed: "error",
};

const TRIGGER_LABELS: Record<GmailSyncTrigger, string> = { manual: "manual", job: "automática" };

const OUTCOME_COUNT_LABELS: Record<GmailSyncOutcome, CountLabels> = {
  imported: { one: "importado", many: "importados" },
  duplicate: { one: "ya estaba", many: "ya estaban" },
  skipped: { one: "omitido", many: "omitidos" },
  failed: { one: "con error", many: "con error" },
};

const SUMMARY_ORDER: GmailSyncOutcome[] = ["imported", "duplicate", "skipped", "failed"];
const VISIBLE_ORDER: GmailSyncOutcome[] = ["imported", "failed", "duplicate"];
const MINUTES_PER_HOUR = 60;
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

export const joinWithY = (items: string[]): string =>
  (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

export const formatDateTime = (iso: string): string => DATE_TIME_FORMAT.format(new Date(iso));

export const gmailMissingVarsMessage = (missing: string[]): string => {
  const single = missing.length === 1;
  const verb = single ? "Falta" : "Faltan";
  const pronoun = single ? "obtenerla" : "obtenerlas";
  return `${verb} ${joinWithY(missing)} en el .env del server. Los pasos para ${pronoun} están en el README, sección «Importar desde Gmail»; después reiniciá el server.`;
};

export const gmailIntervalLabel = (minutes: number | null): string => {
  if (minutes === null) return "apagada";
  return minutes % MINUTES_PER_HOUR === 0 ? `cada ${minutes / MINUTES_PER_HOUR} h` : `cada ${minutes} min`;
};

export const gmailLastRunLabel = (run: GmailSyncRunDTO | null): string =>
  (run ? `Última búsqueda: ${formatDateTime(run.startedAt)} (${TRIGGER_LABELS[run.trigger]})` : "Todavía no buscaste en Gmail.");

const countOf = (items: GmailSyncItemDTO[], outcome: GmailSyncOutcome): number =>
  items.filter((item) => item.outcome === outcome).length;

const countLabel = (count: number, outcome: GmailSyncOutcome): string => {
  const { one, many } = OUTCOME_COUNT_LABELS[outcome];
  return `${count} ${count === 1 ? one : many}`;
};

export const gmailRunSummary = (run: GmailSyncRunDTO): string | null => {
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

export const splitGmailItems = (items: GmailSyncItemDTO[]): GmailItemsSplit => ({
  visible: VISIBLE_ORDER.flatMap((outcome) => items.filter((item) => item.outcome === outcome)),
  skipped: items.filter((item) => item.outcome === "skipped"),
});

export const gmailItemSecondary = ({ kind, detail, receivedAt }: GmailSyncItemDTO): string =>
  [kind ? IMPORTED_FILE_KIND_LABELS[kind] : "", detail, formatLocalDate(receivedAt)]
    .filter((part) => part !== "")
    .join(" · ");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/gmailImport.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/gmailImport.ts client/src/gmailImport.test.ts
git commit -m "feat(client): textos y agrupación del resultado de una búsqueda en Gmail" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Sección «Gmail» en Importar (compu y mobile)

**Files:**
- Create: `client/src/components/GmailSyncResult.tsx`
- Modify: `client/src/components/GmailImportSection.tsx` (reemplaza el stub)
- Create: `client/src/components/GmailImportSection.test.tsx`

**Interfaces:**
- Consumes: `useGmailStatus`, `useGmailSync` (base, `client/src/api/hooks.ts`); todo `gmailImport.ts` (Task 9); `useIsMobile`; `tapTargetSx`, `MIN_TAP_SIZE`.
- Produces: `GmailImportSection` (sin props, ya renderizado por `ImportPage`), `GmailSyncResult({ run })`.

- [ ] **Step 1: Write the failing test**

`client/src/components/GmailImportSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GmailStatusDTO, GmailSyncItemDTO, GmailSyncRunDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { formatLocalDate } from "../format.js";
import { GmailImportSection } from "./GmailImportSection.js";

const RECEIVED_AT = "2026-09-28T12:00:00.000Z";
const QUERY = "has:attachment filename:pdf newer_than:90d";

const item = (id: string, outcome: GmailSyncItemDTO["outcome"], overrides: Partial<GmailSyncItemDTO> = {}): GmailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: RECEIVED_AT, outcome, kind: null, documentId: null,
  detail: "Formato de resumen no reconocido", ...overrides,
});

const runOf = (overrides: Partial<GmailSyncRunDTO> = {}): GmailSyncRunDTO => ({
  trigger: "manual", startedAt: "2026-10-03T17:05:00.000Z", finishedAt: "2026-10-03T17:05:09.000Z", status: "ok", error: null,
  messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

const SYNC_RUN = runOf({
  messagesChecked: 3,
  items: [
    item("resumen-visa", "imported", { kind: "statement", documentId: "s1", detail: "Visa Signature ****1234 · 42 movimientos" }),
    item("recibo-septiembre", "duplicate", { kind: "payslip", documentId: "p1", detail: "Período 2026-09" }),
    item("factura-luz", "skipped"),
  ],
});

const DISABLED: GmailStatusDTO = {
  enabled: false, missing: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
  query: null, intervalMinutes: null, lastRun: null,
};

const enabled = (lastRun: GmailSyncRunDTO | null = null): GmailStatusDTO => ({
  enabled: true, missing: [], query: QUERY, intervalMinutes: 360, lastRun,
});

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface ApiHandlers {
  status: () => Response;
  sync?: () => Response | Promise<Response>;
}

const calls: { url: string; method: string }[] = [];

const stubApi = ({ status, sync = () => respond(SYNC_RUN) }: ApiHandlers) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    return url === "/api/gmail/sync" && method === "POST" ? sync() : status();
  }));
};

const searchButton = () => screen.findByRole("button", { name: "Buscar en Gmail" });

beforeEach(() => {
  calls.length = 0;
  emulateDesktop();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GmailImportSection", () => {
  it("deshabilitada explica qué falta y no ofrece buscar", async () => {
    stubApi({ status: () => respond(DISABLED) });
    renderWithProviders(<GmailImportSection />);
    expect(screen.getByRole("heading", { level: 2, name: "Gmail" })).toBeInTheDocument();
    expect(await screen.findByText("Importación desde Gmail deshabilitada")).toBeInTheDocument();
    expect(screen.getByText(/Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN en el \.env del server/))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buscar en gmail/i })).not.toBeInTheDocument();
  });

  it("si falla el status muestra el error", async () => {
    stubApi({ status: () => respond({ error: "Mongo caído" }, 500) });
    renderWithProviders(<GmailImportSection />);
    expect(await screen.findByText("Mongo caído")).toBeInTheDocument();
  });

  it("habilitada y sin corridas invita a buscar", async () => {
    stubApi({ status: () => respond(enabled()) });
    renderWithProviders(<GmailImportSection />);
    expect(await screen.findByText("Todavía no buscaste en Gmail.")).toBeInTheDocument();
    expect(screen.getByText("Búsqueda automática: cada 6 h")).toBeInTheDocument();
    expect(screen.getByText(`Consulta: ${QUERY}`)).toBeInTheDocument();
    expect(await searchButton()).toBeEnabled();
  });

  it("buscar llama a la API y muestra el resumen y los archivos", async () => {
    stubApi({ status: () => respond(enabled()) });
    renderWithProviders(<GmailImportSection />);
    await userEvent.click(await searchButton());
    expect(await screen.findByText("Revisé 3 mails nuevos: 1 importado · 1 ya estaba · 1 omitido")).toBeInTheDocument();
    expect(calls).toContainEqual({ url: "/api/gmail/sync", method: "POST" });
    expect(screen.getByText("resumen-visa.pdf")).toBeInTheDocument();
    expect(screen.getByText("Importado")).toBeInTheDocument();
    expect(screen.getByText(`Tarjeta · Visa Signature ****1234 · 42 movimientos · ${formatLocalDate(RECEIVED_AT)}`))
      .toBeInTheDocument();
    expect(screen.getByText("recibo-septiembre.pdf")).toBeInTheDocument();
    expect(screen.getByText("Ya estaba")).toBeInTheDocument();
    expect(screen.queryByText("factura-luz.pdf")).not.toBeInTheDocument();
    expect(screen.getByText(/^Última búsqueda: .+ \(manual\)$/)).toBeInTheDocument();
  });

  it("mientras busca el botón dice «Buscando…» y queda deshabilitado", async () => {
    let settle: (response: Response) => void = () => {};
    stubApi({
      status: () => respond(enabled()),
      sync: () => new Promise<Response>((resolve) => {
        settle = resolve;
      }),
    });
    renderWithProviders(<GmailImportSection />);
    await userEvent.click(await searchButton());
    expect(await screen.findByRole("button", { name: "Buscando…" })).toBeDisabled();
    settle(respond(SYNC_RUN));
    expect(await searchButton()).toBeEnabled();
  });

  it("si la búsqueda falla muestra el error del server", async () => {
    stubApi({
      status: () => respond(enabled()),
      sync: () => respond({ error: "Gmail no está configurado: faltan GMAIL_REFRESH_TOKEN" }, 409),
    });
    renderWithProviders(<GmailImportSection />);
    await userEvent.click(await searchButton());
    expect(await screen.findByText("Gmail no está configurado: faltan GMAIL_REFRESH_TOKEN")).toBeInTheDocument();
  });

  it("los omitidos se ven al desplegarlos", async () => {
    stubApi({ status: () => respond(enabled(SYNC_RUN)) });
    renderWithProviders(<GmailImportSection />);
    const toggle = await screen.findByRole("button", { name: "Ver omitidos (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("factura-luz.pdf")).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(await screen.findByText("factura-luz.pdf")).toBeInTheDocument();
    expect(screen.getByText("Omitido")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar omitidos" })).toHaveAttribute("aria-expanded", "true");
  });

  it("una corrida con error muestra el motivo", async () => {
    const message = "Gmail rechazó el refresh token (venció o fue revocado). Volvé a correr bun run gmail:auth y reiniciá el server.";
    stubApi({ status: () => respond(enabled(runOf({ trigger: "job", status: "error", error: message }))) });
    renderWithProviders(<GmailImportSection />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText(/^Última búsqueda: .+ \(automática\)$/)).toBeInTheDocument();
    expect(screen.queryByText("No había mails nuevos.")).not.toBeInTheDocument();
  });

  it("si quedan mails por revisar lo avisa", async () => {
    stubApi({ status: () => respond(enabled(runOf({ messagesChecked: 50, hasMore: true, items: [item("a", "skipped")] }))) });
    renderWithProviders(<GmailImportSection />);
    expect(await screen.findByText("Quedan mails por revisar: tocá «Buscar en Gmail» otra vez.")).toBeInTheDocument();
  });

  it("en compu el botón no ocupa todo el ancho", async () => {
    stubApi({ status: () => respond(enabled()) });
    renderWithProviders(<GmailImportSection />);
    expect(await searchButton()).not.toHaveClass("MuiButton-fullWidth");
  });

  it("en mobile el botón está presente y ocupa todo el ancho", async () => {
    emulateMobile();
    stubApi({ status: () => respond(enabled(SYNC_RUN)) });
    renderWithProviders(<GmailImportSection />);
    expect(await searchButton()).toHaveClass("MuiButton-fullWidth");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ver omitidos (1)" })).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/GmailImportSection.test.tsx`
Expected: FAIL — el stub solo muestra el encabezado (salvo el test de error del status y el de compu, todos fallan).

- [ ] **Step 3: Write the implementation**

`client/src/components/GmailSyncResult.tsx`:

```tsx
import { useCallback, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Collapse, List, ListItem, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { GmailSyncItemDTO, GmailSyncRunDTO } from "@ledgerly/shared";
import {
  GMAIL_OUTCOME_COLORS, GMAIL_OUTCOME_LABELS, gmailItemSecondary, gmailRunSummary, splitGmailItems,
} from "../gmailImport.js";
import { MIN_TAP_SIZE } from "./tapTarget.js";

interface GmailSyncResultProps {
  run: GmailSyncRunDTO;
}

interface GmailItemListProps {
  items: GmailSyncItemDTO[];
}

interface GmailItemRowProps {
  item: GmailSyncItemDTO;
}

const itemHeaderSx: SxProps<Theme> = { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1, rowGap: 0.5 };
const toggleSx: SxProps<Theme> = { ml: -1, mt: 0.5, minHeight: MIN_TAP_SIZE };

const chevronSx = (expanded: boolean): SxProps<Theme> => ({
  transform: expanded ? "rotate(180deg)" : "none",
  transition: "transform 200ms ease",
});

const GmailItemRow = ({ item }: GmailItemRowProps) => (
  <ListItem disableGutters sx={{ display: "block", py: 0.75 }}>
    <Box sx={itemHeaderSx}>
      <Typography variant="subtitle2" component="span" sx={{ overflowWrap: "anywhere", minWidth: 0 }}>
        {item.fileName}
      </Typography>
      <Chip size="small" label={GMAIL_OUTCOME_LABELS[item.outcome]} color={GMAIL_OUTCOME_COLORS[item.outcome]} />
    </Box>
    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
      {gmailItemSecondary(item)}
    </Typography>
  </ListItem>
);

const GmailItemList = ({ items }: GmailItemListProps) => {
  const rows = items.map((item) => <GmailItemRow key={item.id} item={item} />);
  return <List disablePadding>{rows}</List>;
};

export const GmailSyncResult = ({ run }: GmailSyncResultProps) => {
  const [showSkipped, setShowSkipped] = useState(false);
  const { visible, skipped } = useMemo(() => splitGmailItems(run.items), [run.items]);
  const toggleSkipped = useCallback(() => setShowSkipped((current) => !current), []);
  const summary = gmailRunSummary(run);
  const hasError = run.status === "error";
  const toggleLabel = showSkipped ? "Ocultar omitidos" : `Ver omitidos (${skipped.length})`;

  return (
    <Box sx={{ mt: 2 }}>
      {hasError && <Alert severity="error" sx={{ mb: 1.5 }}>{run.error}</Alert>}
      {summary && <Typography variant="body2" sx={{ mb: 1 }}>{summary}</Typography>}
      {run.hasMore && (
        <Alert severity="info" sx={{ mb: 1.5 }}>Quedan mails por revisar: tocá «Buscar en Gmail» otra vez.</Alert>
      )}
      {visible.length > 0 && <GmailItemList items={visible} />}
      {skipped.length > 0 && (
        <>
          <Button
            size="small"
            onClick={toggleSkipped}
            aria-expanded={showSkipped}
            endIcon={<ExpandMoreIcon sx={chevronSx(showSkipped)} />}
            sx={toggleSx}
          >
            {toggleLabel}
          </Button>
          <Collapse in={showSkipped} unmountOnExit>
            <GmailItemList items={skipped} />
          </Collapse>
        </>
      )}
    </Box>
  );
};
```

`client/src/components/GmailImportSection.tsx` completo:

```tsx
import { Alert, AlertTitle, Box, Button, Card, CardContent, CircularProgress, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import type { GmailStatusDTO } from "@ledgerly/shared";
import { useGmailStatus, useGmailSync } from "../api/hooks.js";
import { gmailIntervalLabel, gmailLastRunLabel, gmailMissingVarsMessage } from "../gmailImport.js";
import { useIsMobile } from "../useIsMobile.js";
import { GmailSyncResult } from "./GmailSyncResult.js";
import { tapTargetSx } from "./tapTarget.js";

interface GmailDisabledNoticeProps {
  missing: string[];
}

interface GmailSyncCardProps {
  status: GmailStatusDTO;
}

const cardContentSx: SxProps<Theme> = { p: 2, "&:last-child": { pb: 2 } };
const headerSx: SxProps<Theme> = {
  display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 2,
};
const textsSx: SxProps<Theme> = { flex: "1 1 240px", minWidth: 0 };

const GmailDisabledNotice = ({ missing }: GmailDisabledNoticeProps) => (
  <Alert severity="info">
    <AlertTitle>Importación desde Gmail deshabilitada</AlertTitle>
    {gmailMissingVarsMessage(missing)}
  </Alert>
);

const GmailSyncCard = ({ status }: GmailSyncCardProps) => {
  const isMobile = useIsMobile();
  const sync = useGmailSync();
  const run = sync.data ?? status.lastRun;
  const handleSync = () => sync.mutate();
  const buttonLabel = sync.isPending ? "Buscando…" : "Buscar en Gmail";
  const buttonIcon = sync.isPending ? <CircularProgress size={16} color="inherit" /> : <MailOutlineIcon />;
  const intervalText = `Búsqueda automática: ${gmailIntervalLabel(status.intervalMinutes)}`;
  const queryText = `Consulta: ${status.query ?? ""}`;

  return (
    <Card variant="outlined">
      <CardContent sx={cardContentSx}>
        <Box sx={headerSx}>
          <Box sx={textsSx}>
            <Typography variant="body1">{gmailLastRunLabel(run)}</Typography>
            <Typography variant="body2" color="text.secondary">{intervalText}</Typography>
            <Typography variant="caption" component="p" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
              {queryText}
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
        {run && <GmailSyncResult run={run} />}
      </CardContent>
    </Card>
  );
};

const GmailImportPanel = () => {
  const { data: status, isLoading, isError, error } = useGmailStatus();

  if (isLoading) return <CircularProgress size={24} />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;
  if (!status) return null;
  if (!status.enabled) return <GmailDisabledNotice missing={status.missing} />;
  return <GmailSyncCard status={status} />;
};

export const GmailImportSection = () => (
  <>
    <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>Gmail</Typography>
    <GmailImportPanel />
  </>
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run client/src/components/GmailImportSection.test.tsx client/src/pages/ImportPage.test.tsx client/src/App.test.tsx`
Expected: PASS (los tests de `ImportPage` siguen verdes con el status deshabilitado).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git add client/src/components/GmailSyncResult.tsx client/src/components/GmailImportSection.tsx client/src/components/GmailImportSection.test.tsx
git commit -m "feat(client): sección Gmail en Importar con búsqueda manual y resultado, en compu y mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verificación final

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa**

Run: `bun run test`
Expected: todos los archivos en verde (la base tenía 131 archivos y 891 tests pasando, 6 archivos salteados que dependen de `examples/`).

- [ ] **Step 2: Tipos y build**

Run: `bun run typecheck` → sin errores.
Run: `bun run build` → build de Vite sin errores.

- [ ] **Step 3: Privacidad**

Run: `git status --short` y `git log --stat feat/base-nuevas-features..HEAD` → ningún archivo de `examples/` ni `.env`; solo archivos de esta feature.
