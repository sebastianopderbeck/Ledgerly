# Sección "Auto" — Plan de ahorro (cupones Círculo de Inversores) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una sección **"Auto"** que replica la vista de Créditos (KPIs + 5 gráficos + tabla mes a mes + valor en USD editable) pero sobre los cupones del plan de ahorro de un auto (`examples/auto`, Círculo de Inversores / Citroën Plan).

**Architecture:** Slice vertical paralelo que espeja Créditos archivo por archivo (parser → ingestión → modelo → import → stats → ruta → UI), reutilizando las piezas genéricas (`extractPdfText`, `parseArAmount`, `parseSlashDate`, `fetchOficialRate`, `formatMoney`, el endpoint unificado `POST /api/import`, `ChartCard`/`nivoTheme`/`palette`/motion). Los conceptos del cupón varían por mes (8–11, reordenados, con etiqueta mutante `DIFERIMIENTO COMERCIAL 2/3` y montos negativos), así que se guardan como **array `{label, amount}[]`** y la tabla/gráfico derivan sus columnas de la unión de labels.

**Tech Stack:** TypeScript (ESM), Express 4 + Mongoose 8 + Multer + unpdf (server), React 18 + MUI v6 + TanStack Query v5 + Nivo + framer-motion (client), Zod (shared), Vitest + supertest + mongodb-memory-server + RTL. Runtime bun. `globalThis.fetch` para el dólar.

## Global Constraints

- **ESM:** todo import relativo con extensión `.js`; tipos desde `"@ledgerly/shared"`.
- **Sin `any`.** Interfaces para props y tipos de retorno. Destructuring en la firma del componente.
- **Componentes:** `export const` arrow, sin default exports. Estilos MUI v6 `sx`. Sin CSS Modules.
- **Sin comentarios en el código** (naming autoexplicativo).
- **Moneda union `"ARS" | "USD"`** — NO tocar. USD vía `formatMoney(v, "USD")`.
- **Copy en español.** Ruta `/auto`, nav "Auto".
- **Modelo Mongoose:** `export const XModel = mongoose.models.X ?? mongoose.model("X", schema)`; tipos vía `InferSchemaType`.
- **Plazo del plan:** constante `AUTO_CUOTAS_TOTALES = 120`.
- **`orden` normalizado** a sin ceros a la izquierda (`String(Number(...))`) — el mismo orden aparece como `097` y `97`.
- **`totalUsd = tipoCambioUsd ? totalAPagar / tipoCambioUsd : null`.** TC oficial buscado por `fechaVencimiento`.
- **Sin red real en tests:** mockear `fetch` / `fetchOficialRate` / `parseAutoCoupon` según la capa.
- **Test runner:** `bunx vitest run <path>` (un archivo); `bun run test` (todo). **Typecheck:** `bun run typecheck`.
- **Commits locales por tarea.** Mensaje termina con:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Shared — contratos (types + DTOs + union)

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `shared/src/dtos.ts`
- Test: `shared/src/dtos.test.ts`

**Interfaces:**
- Produces: `ParsedAutoConcept`, `ParsedAutoCoupon`, `AutoCouponParser` (types.ts); `autoConceptSchema`, `autoCouponDtoSchema`, `autoSummaryDtoSchema`, `autoImportResultSchema`, `AutoConceptDTO`, `AutoCouponDTO`, `AutoSummaryDTO` (dtos.ts); `importResultUnionSchema` gana la variante `{ kind: "auto" }`.

- [ ] **Step 1: Write the failing test** — append to `shared/src/dtos.test.ts`:

```ts
import { autoCouponDtoSchema, autoSummaryDtoSchema } from "./dtos.js";

describe("autoCouponDtoSchema", () => {
  it("valida un cupón de auto con conceptos", () => {
    const dto = {
      id: "x", grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
      fechaEmision: "2024-10-18", fechaVencimiento: "2024-11-11", comprobante: "000062757060",
      modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01,
      conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }, { label: "DIFERIMIENTO COMERCIAL", amount: -70607.06 }],
      totalAPagar: 268551.23, tipoCambioUsd: 1000, tipoCambioSource: "api", totalUsd: 268.55,
    };
    expect(autoCouponDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("autoSummaryDtoSchema", () => {
  it("valida el resumen del plan", () => {
    const dto = {
      grupo: "3684", orden: "97", plan: "K", modelo: "C3 AIRCROSS",
      cuotasPagadas: 4, cuotasTotales: 120, porcentajeAvance: 0.0333, totalPagado: 1428724.71,
      valorActualAuto: 41580000, totalPagadoUsd: 1000, ultimaCuota: 22, fechaUltimoVencimiento: "2026-07-10",
    };
    expect(autoSummaryDtoSchema.parse(dto)).toEqual(dto);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: FAIL — `autoCouponDtoSchema` no está exportado.

- [ ] **Step 3: Implement**

Append to `shared/src/types.ts`:

```ts
export interface ParsedAutoConcept {
  label: string;
  amount: number;
}

export interface ParsedAutoCoupon {
  grupo: string;
  orden: string;
  cuotaNro: number;
  plan: string;
  fechaEmision: string;
  fechaVencimiento: string;
  comprobante: string;
  modelo: string;
  valorMovil: number;
  conceptos: ParsedAutoConcept[];
  totalAPagar: number;
}

export interface AutoCouponParser {
  detect(text: string, meta: PdfMeta): boolean;
  parse(text: string, meta: PdfMeta): ParsedAutoCoupon;
}
```

In `shared/src/dtos.ts`, add after `creditSummaryDtoSchema` (after line 125):

```ts
export const autoConceptSchema = z.object({ label: z.string(), amount: z.number() });

export const autoCouponDtoSchema = z.object({
  id: z.string(),
  grupo: z.string(),
  orden: z.string(),
  cuotaNro: z.number().int().positive(),
  plan: z.string(),
  fechaEmision: z.string(),
  fechaVencimiento: z.string(),
  comprobante: z.string(),
  modelo: z.string(),
  valorMovil: z.number(),
  conceptos: z.array(autoConceptSchema),
  totalAPagar: z.number(),
  tipoCambioUsd: z.number().nullable(),
  tipoCambioSource: z.enum(["api", "manual"]).nullable(),
  totalUsd: z.number().nullable(),
});

export const autoSummaryDtoSchema = z.object({
  grupo: z.string(),
  orden: z.string(),
  plan: z.string(),
  modelo: z.string(),
  cuotasPagadas: z.number().int(),
  cuotasTotales: z.number().int(),
  porcentajeAvance: z.number(),
  totalPagado: z.number(),
  valorActualAuto: z.number(),
  totalPagadoUsd: z.number(),
  ultimaCuota: z.number().int(),
  fechaUltimoVencimiento: z.string(),
});
```

In `shared/src/dtos.ts`, add after `statementImportResultSchema` (after line 137):

```ts
export const autoImportResultSchema = z.object({
  kind: z.literal("auto"),
  status: z.enum(["imported", "duplicate"]),
  coupon: autoCouponDtoSchema,
});
```

Replace the `importResultUnionSchema` declaration (lines 138-141) with:

```ts
export const importResultUnionSchema = z.discriminatedUnion("kind", [
  couponImportResultSchema,
  statementImportResultSchema,
  autoImportResultSchema,
]);
```

Add to the `export type` block at the bottom (after line 156):

```ts
export type AutoConceptDTO = z.infer<typeof autoConceptSchema>;
export type AutoCouponDTO = z.infer<typeof autoCouponDtoSchema>;
export type AutoSummaryDTO = z.infer<typeof autoSummaryDtoSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run shared/src/dtos.test.ts` → Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck
git add shared/src/types.ts shared/src/dtos.ts shared/src/dtos.test.ts
git commit -m "feat(shared): add auto savings-plan coupon and summary contracts"
```

---

### Task 2: Parser — `autoPlanParser`

**Files:**
- Create: `server/src/parsers/autoPlan.ts`
- Create: `server/src/parsers/__fixtures__/auto-plan.sample.txt`
- Test: `server/src/parsers/autoPlan.test.ts`

**Interfaces:**
- Consumes: `parseArAmount`, `parseSlashDate` (`./normalize.js`); `AutoCouponParser`, `ParsedAutoConcept`, `ParsedAutoCoupon` (`@ledgerly/shared`).
- Produces: `autoPlanParser: AutoCouponParser`.

- [ ] **Step 1: Create the fixture** — `server/src/parsers/__fixtures__/auto-plan.sample.txt`:

```
Circulo de Inversores S.A.U. de Ahorro para Fines Determinados
OPDERBECK SEBASTIAN MICHEL ANTHONY
GRUPO 3684 ORDEN 097 CUOTA 002 PLAN K Fecha de Emisión 18/10/2024 VENCIMIENTO 11/11/2024 Comprobante Nro.: 000062757060 ANTICIPO ALICUOTA (AL) $ 235356,87 PORCION DE ALICUOTA DIFERIDA $ - 11767,85 IVA SOBRE CONCEPTOS GRAVADOS $ 5067,90 RECUP IMP BANCARIOS LEY 25413 $ 2157,79 DER. INSCRIP.PRORR. HIST (DIP) $ 34274,38 GASTOS ADMINISTRATIVOS $ 22358,90 SEGURO DE VIDA (SV) $ 23389,67 DIFERIMIENTO COMERCIAL $ - 70607,06 ACTUALIZACIÓN VALOR HIST.DIP $ 1029,89 GASTOS DE SELLADO PRORR (GSP) $ 26546,60 ACTUALIZACIÓN VALOR HIST.GSP $ 744,03 Clave de Acceso para pago redes Link y Banelco: 036840975 TOTAL A PAGAR $ 268551,23
Información sobre precio de la unidad Modelo de Ahorro Modelo Financiado A fecha vto. cuota anterior $ 28010000,00 $ 0,00 A fecha emisión de esta cuota $ 28240000,01 $ 0,00
Modelo de ahorro a fecha de emisión C3 AIRCROSS T200 FEEL PK MY24. Próximo Acto de Adjudicación
```

- [ ] **Step 2: Write the failing test** — `server/src/parsers/autoPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { autoPlanParser } from "./autoPlan.js";
import type { PdfMeta } from "@ledgerly/shared";

const text = readFileSync(fileURLToPath(new URL("./__fixtures__/auto-plan.sample.txt", import.meta.url)), "utf8");
const meta: PdfMeta = { producer: null, creator: null, pageCount: 3, encrypted: false };

describe("autoPlanParser.detect", () => {
  it("detecta el cupón de plan de ahorro", () => {
    expect(autoPlanParser.detect(text, meta)).toBe(true);
    expect(autoPlanParser.detect("INFORME DE COBRO DE CUOTA PRESTAMO", meta)).toBe(false);
  });
});

describe("autoPlanParser.parse", () => {
  const c = autoPlanParser.parse(text, meta);
  it("extrae identificadores y fechas (orden sin padding)", () => {
    expect(c.grupo).toBe("3684");
    expect(c.orden).toBe("97");
    expect(c.cuotaNro).toBe(2);
    expect(c.plan).toBe("K");
    expect(c.fechaEmision).toBe("2024-10-18");
    expect(c.fechaVencimiento).toBe("2024-11-11");
    expect(c.comprobante).toBe("000062757060");
  });
  it("extrae total, valor del auto y modelo", () => {
    expect(c.totalAPagar).toBe(268551.23);
    expect(c.valorMovil).toBe(28240000.01);
    expect(c.modelo).toBe("C3 AIRCROSS T200 FEEL PK MY24");
  });
  it("extrae los conceptos con signo", () => {
    expect(c.conceptos).toHaveLength(11);
    const byLabel = Object.fromEntries(c.conceptos.map((x) => [x.label, x.amount]));
    expect(byLabel["ANTICIPO ALICUOTA (AL)"]).toBe(235356.87);
    expect(byLabel["PORCION DE ALICUOTA DIFERIDA"]).toBe(-11767.85);
    expect(byLabel["DIFERIMIENTO COMERCIAL"]).toBe(-70607.06);
    expect(byLabel["RECUP IMP BANCARIOS LEY 25413"]).toBe(2157.79);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run server/src/parsers/autoPlan.test.ts`
Expected: FAIL — cannot find module `./autoPlan.js`.

- [ ] **Step 4: Implement** — `server/src/parsers/autoPlan.ts`:

```ts
import type { AutoCouponParser, ParsedAutoConcept, ParsedAutoCoupon } from "@ledgerly/shared";
import { parseArAmount, parseSlashDate } from "./normalize.js";

const MARKER = "Ahorro para Fines Determinados";
const HEADER = /GRUPO\s+(\d+)\s+ORDEN\s+(\d+)\s+CUOTA\s+(\d+)\s+PLAN\s+(\w+)/;
const EMISION = /Fecha de Emisión\s+(\d{2}\/\d{2}\/\d{4})/;
const VENCIMIENTO = /VENCIMIENTO\s+(\d{2}\/\d{2}\/\d{4})/;
const COMPROBANTE = /Comprobante Nro\.:\s*(\d+)/;
const TOTAL = /TOTAL A PAGAR\s+\$\s*(\d[\d.]*,\d{2})/;
const VALOR = /A fecha emisión de esta cuota\s+\$\s*(\d[\d.]*,\d{2})/;
const MODELO = /Modelo de ahorro a fecha de emisión\s+(.+?)\./;
const CONCEPT = /([A-ZÁÉÍÓÚ][^$\n]*?)\s+\$\s*(-\s*)?(\d[\d.]*,\d{2})/g;

function required(flat: string, re: RegExp, field: string): string {
  const m = flat.match(re);
  if (!m) throw new Error(`Cupón de auto inválido: falta ${field}`);
  return m[1];
}

function normalizeLabel(raw: string): string {
  const label = raw.replace(/\s+/g, " ").trim();
  return label.replace(/^(DIFERIMIENTO COMERCIAL)\s+\d+$/, "$1");
}

function parseConceptos(block: string): ParsedAutoConcept[] {
  const conceptos: ParsedAutoConcept[] = [];
  for (const m of block.matchAll(CONCEPT)) {
    const amount = parseArAmount(m[3]).amount * (m[2] ? -1 : 1);
    conceptos.push({ label: normalizeLabel(m[1]), amount });
  }
  return conceptos;
}

export const autoPlanParser: AutoCouponParser = {
  detect(text) {
    return text.includes(MARKER);
  },

  parse(text): ParsedAutoCoupon {
    const flat = text.replace(/\n+/g, " ");
    const header = flat.match(HEADER);
    if (!header) throw new Error("Cupón de auto inválido: falta encabezado grupo/orden/cuota");

    const comp = flat.match(COMPROBANTE);
    if (!comp) throw new Error("Cupón de auto inválido: falta comprobante");
    const startIdx = (comp.index ?? 0) + comp[0].length;
    const claveIdx = flat.indexOf("Clave de Acceso", startIdx);
    const totalIdx = flat.indexOf("TOTAL A PAGAR", startIdx);
    const endIdx = claveIdx === -1 ? totalIdx : claveIdx;
    const block = flat.slice(startIdx, endIdx === -1 ? undefined : endIdx);

    return {
      grupo: header[1],
      orden: String(Number(header[2])),
      cuotaNro: Number(header[3]),
      plan: header[4],
      fechaEmision: parseSlashDate(required(flat, EMISION, "fecha de emisión")),
      fechaVencimiento: parseSlashDate(required(flat, VENCIMIENTO, "vencimiento")),
      comprobante: comp[1],
      modelo: required(flat, MODELO, "modelo").trim(),
      valorMovil: parseArAmount(required(flat, VALOR, "valor del auto")).amount,
      conceptos: parseConceptos(block),
      totalAPagar: parseArAmount(required(flat, TOTAL, "total a pagar")).amount,
    };
  },
};
```

- [ ] **Step 5: Run test to verify it passes + commit**

Run: `bunx vitest run server/src/parsers/autoPlan.test.ts` → Expected: PASS.

```bash
git add server/src/parsers/autoPlan.ts server/src/parsers/__fixtures__/auto-plan.sample.txt server/src/parsers/autoPlan.test.ts
git commit -m "feat(parsers): add Circulo de Inversores auto savings-plan parser"
```

---

### Task 3: Ingestión — `parseAutoCoupon` + `detectDocumentKind`

**Files:**
- Modify: `server/src/ingestion/errors.ts`
- Create: `server/src/ingestion/parseAutoCoupon.ts`
- Modify: `server/src/ingestion/detectDocumentKind.ts`
- Test: `server/src/ingestion/parseAutoCoupon.test.ts`
- Test: `server/src/ingestion/detectDocumentKind.test.ts`

**Interfaces:**
- Consumes: `autoPlanParser` (Task 2); `extractPdfText`; `detectParser`.
- Produces: `InvalidAutoCouponError`; `parseAutoCoupon(data): Promise<{ coupon: ParsedAutoCoupon; meta: PdfMeta }>`; `detectDocumentKind` gana `"auto"`, tipo `DocumentKind` = `"coupon" | "auto" | "statement" | "unknown"`.

- [ ] **Step 1: Write the failing tests**

`server/src/ingestion/parseAutoCoupon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAutoCoupon } from "./parseAutoCoupon.js";

const pdf = readFileSync(fileURLToPath(new URL("../../../examples/auto/11-2024.pdf", import.meta.url)));

describe("parseAutoCoupon", () => {
  it("extrae y parsea un cupón real", async () => {
    const { coupon } = await parseAutoCoupon(new Uint8Array(pdf));
    expect(coupon.grupo).toBe("3684");
    expect(coupon.cuotaNro).toBe(2);
    expect(coupon.totalAPagar).toBe(268551.23);
    expect(coupon.valorMovil).toBe(28240000.01);
    expect(coupon.fechaVencimiento).toBe("2024-11-11");
    expect(coupon.conceptos.length).toBeGreaterThanOrEqual(10);
  });
});
```

In `server/src/ingestion/detectDocumentKind.test.ts`, add this `read` line after the existing fixture reads and this `describe` block (keep the existing tests intact):

```ts
const autoCoupon = readFileSync(fileURLToPath(new URL("../parsers/__fixtures__/auto-plan.sample.txt", import.meta.url)), "utf8");

describe("detectDocumentKind (auto)", () => {
  it("clasifica un cupón de plan de auto", () => {
    expect(detectDocumentKind(autoCoupon, meta)).toBe("auto");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run server/src/ingestion/parseAutoCoupon.test.ts server/src/ingestion/detectDocumentKind.test.ts`
Expected: FAIL — módulo `./parseAutoCoupon.js` no existe; `detectDocumentKind` devuelve `"unknown"` para el cupón de auto.

- [ ] **Step 3: Implement**

Append to `server/src/ingestion/errors.ts`:

```ts
export class InvalidAutoCouponError extends Error {
  constructor() {
    super("El cupón del plan de auto tiene un formato inesperado");
    this.name = "InvalidAutoCouponError";
  }
}
```

`server/src/ingestion/parseAutoCoupon.ts`:

```ts
import type { ParsedAutoCoupon, PdfMeta } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { autoPlanParser } from "../parsers/autoPlan.js";
import { InvalidAutoCouponError, NoTextError, UnsupportedFormatError } from "./errors.js";

export async function parseAutoCoupon(data: Uint8Array): Promise<{ coupon: ParsedAutoCoupon; meta: PdfMeta }> {
  const { text, meta } = await extractPdfText(data);
  if (text.trim().length < 20) throw new NoTextError();
  if (!autoPlanParser.detect(text, meta)) throw new UnsupportedFormatError();
  try {
    return { coupon: autoPlanParser.parse(text, meta), meta };
  } catch {
    throw new InvalidAutoCouponError();
  }
}
```

Replace `server/src/ingestion/detectDocumentKind.ts` with:

```ts
import type { PdfMeta } from "@ledgerly/shared";
import { icbcMortgageParser } from "../parsers/icbcMortgage.js";
import { autoPlanParser } from "../parsers/autoPlan.js";
import { detectParser } from "../parsers/registry.js";

export type DocumentKind = "coupon" | "auto" | "statement" | "unknown";

export function detectDocumentKind(text: string, meta: PdfMeta): DocumentKind {
  if (icbcMortgageParser.detect(text, meta)) return "coupon";
  if (autoPlanParser.detect(text, meta)) return "auto";
  if (detectParser(text, meta)) return "statement";
  return "unknown";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run server/src/ingestion/parseAutoCoupon.test.ts server/src/ingestion/detectDocumentKind.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/ingestion/errors.ts server/src/ingestion/parseAutoCoupon.ts server/src/ingestion/detectDocumentKind.ts server/src/ingestion/parseAutoCoupon.test.ts server/src/ingestion/detectDocumentKind.test.ts
git commit -m "feat(ingestion): auto coupon parsing and document-kind dispatch"
```

---

### Task 4: Modelo — `AutoCouponModel`

**Files:**
- Modify: `server/src/db/models.ts`
- Test: `server/src/db/models.test.ts`

**Interfaces:**
- Produces: `AutoCouponModel`, tipo `AutoCouponDoc`. Índice único `{ grupo, orden, cuotaNro }`. `conceptos` como subarray `{ label, amount }`.

- [ ] **Step 1: Write the failing test** — add `AutoCouponModel` to the existing import from `./models.js`, then append to `server/src/db/models.test.ts`:

```ts
describe("AutoCoupon", () => {
  const base = {
    grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
    fechaEmision: new Date("2024-10-18"), fechaVencimiento: new Date("2024-11-11"),
    comprobante: "000062757060", modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01,
    conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }, { label: "DIFERIMIENTO COMERCIAL", amount: -70607.06 }],
    totalAPagar: 268551.23, sourceFileName: "11-2024.pdf", sourceHash: "h1",
  };

  it("persiste un cupón de auto con conceptos", async () => {
    const c = await AutoCouponModel.create(base);
    expect(c._id).toBeDefined();
    expect(c.conceptos).toHaveLength(2);
    expect(c.conceptos[1].amount).toBe(-70607.06);
  });

  it("rechaza (grupo, orden, cuotaNro) duplicado", async () => {
    await AutoCouponModel.init();
    await AutoCouponModel.create(base);
    await expect(AutoCouponModel.create({ ...base, sourceHash: "h2" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/db/models.test.ts`
Expected: FAIL — `AutoCouponModel` no está exportado.

- [ ] **Step 3: Implement** — in `server/src/db/models.ts`, add before the `export type` block (before line 80):

```ts
const autoCouponConceptSchema = new Schema(
  { label: { type: String, required: true }, amount: { type: Number, required: true } },
  { _id: false },
);

const autoCouponSchema = new Schema(
  {
    grupo: { type: String, required: true, index: true },
    orden: { type: String, required: true },
    cuotaNro: { type: Number, required: true },
    plan: { type: String, required: true },
    fechaEmision: { type: Date, required: true },
    fechaVencimiento: { type: Date, required: true },
    comprobante: { type: String, required: true },
    modelo: { type: String, required: true },
    valorMovil: { type: Number, required: true },
    conceptos: { type: [autoCouponConceptSchema], default: [] },
    totalAPagar: { type: Number, required: true },
    tipoCambioUsd: { type: Number, default: null },
    tipoCambioSource: { type: String, enum: ["api", "manual", null], default: null },
    sourceFileName: { type: String, required: true },
    sourceHash: { type: String, required: true },
  },
  { timestamps: { createdAt: "uploadedAt", updatedAt: false } },
);
autoCouponSchema.index({ grupo: 1, orden: 1, cuotaNro: 1 }, { unique: true });
```

Add with the other `export type` lines:

```ts
export type AutoCouponDoc = InferSchemaType<typeof autoCouponSchema>;
```

Add with the other model exports:

```ts
export const AutoCouponModel: Model<AutoCouponDoc> =
  mongoose.models.AutoCoupon ?? mongoose.model("AutoCoupon", autoCouponSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/db/models.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/db/models.ts server/src/db/models.test.ts
git commit -m "feat(db): add AutoCoupon model with unique natural key and concept subarray"
```

---

### Task 5: Import — `importAutoCoupon` (dedupe + TC al importar)

**Files:**
- Create: `server/src/import/importAutoCoupon.ts`
- Test: `server/src/import/importAutoCoupon.test.ts`

**Interfaces:**
- Consumes: `parseAutoCoupon` (Task 3), `AutoCouponModel` (Task 4), `fetchOficialRate`.
- Produces: `importAutoCoupon(input: { data: Uint8Array; fileName: string; replace?: boolean }): Promise<{ status: "imported" | "duplicate"; couponId: string }>`.

- [ ] **Step 1: Write the failing test** — `server/src/import/importAutoCoupon.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";
import type { ParsedAutoCoupon } from "@ledgerly/shared";

vi.mock("../ingestion/parseAutoCoupon.js", () => ({ parseAutoCoupon: vi.fn() }));
vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { parseAutoCoupon } from "../ingestion/parseAutoCoupon.js";
import { fetchOficialRate } from "../fx/dollarRate.js";
import { importAutoCoupon } from "./importAutoCoupon.js";
import { AutoCouponModel } from "../db/models.js";

withDb();
const mockedParse = vi.mocked(parseAutoCoupon);
const mockedFx = vi.mocked(fetchOficialRate);

const coupon: ParsedAutoCoupon = {
  grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
  fechaEmision: "2024-10-18", fechaVencimiento: "2024-11-11", comprobante: "000062757060",
  modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01,
  conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }],
  totalAPagar: 268551.23,
};

beforeEach(() => {
  mockedParse.mockResolvedValue({ coupon, meta: { producer: null, creator: null, pageCount: 3, encrypted: false } });
  mockedFx.mockResolvedValue(1000);
});

describe("importAutoCoupon", () => {
  it("importa un cupón nuevo y guarda el TC oficial", async () => {
    const r = await importAutoCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    expect(r.status).toBe("imported");
    const doc = await AutoCouponModel.findOne({ cuotaNro: 2 });
    expect(doc?.tipoCambioUsd).toBe(1000);
    expect(doc?.tipoCambioSource).toBe("api");
    expect(doc?.conceptos).toHaveLength(1);
  });

  it("deduplica por (grupo, orden, cuotaNro) aunque cambien los bytes", async () => {
    await importAutoCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const r = await importAutoCoupon({ data: new Uint8Array([2, 3]), fileName: "b.pdf" });
    expect(r.status).toBe("duplicate");
    expect(await AutoCouponModel.countDocuments()).toBe(1);
  });

  it("importa igual si la API de dólar falla (tipoCambioUsd null)", async () => {
    mockedFx.mockResolvedValueOnce(null);
    const r = await importAutoCoupon({ data: new Uint8Array([9]), fileName: "c.pdf" });
    expect(r.status).toBe("imported");
    const doc = await AutoCouponModel.findOne({ cuotaNro: 2 });
    expect(doc?.tipoCambioUsd ?? null).toBeNull();
    expect(doc?.tipoCambioSource ?? null).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/import/importAutoCoupon.test.ts`
Expected: FAIL — cannot find module `./importAutoCoupon.js`.

- [ ] **Step 3: Implement** — `server/src/import/importAutoCoupon.ts`:

```ts
import { createHash } from "node:crypto";
import { parseAutoCoupon } from "../ingestion/parseAutoCoupon.js";
import { AutoCouponModel } from "../db/models.js";
import { fetchOficialRate } from "../fx/dollarRate.js";

export async function importAutoCoupon(input: {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
}): Promise<{ status: "imported" | "duplicate"; couponId: string }> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");
  const { coupon } = await parseAutoCoupon(input.data);

  const existing = await AutoCouponModel.findOne({
    grupo: coupon.grupo,
    orden: coupon.orden,
    cuotaNro: coupon.cuotaNro,
  });
  if (existing && !input.replace) return { status: "duplicate", couponId: existing._id.toString() };
  if (existing && input.replace) await AutoCouponModel.deleteOne({ _id: existing._id });

  const tipoCambioUsd = await fetchOficialRate(coupon.fechaVencimiento).catch(() => null);

  const created = await AutoCouponModel.create({
    grupo: coupon.grupo,
    orden: coupon.orden,
    cuotaNro: coupon.cuotaNro,
    plan: coupon.plan,
    fechaEmision: new Date(coupon.fechaEmision),
    fechaVencimiento: new Date(coupon.fechaVencimiento),
    comprobante: coupon.comprobante,
    modelo: coupon.modelo,
    valorMovil: coupon.valorMovil,
    conceptos: coupon.conceptos,
    totalAPagar: coupon.totalAPagar,
    sourceFileName: input.fileName,
    sourceHash,
    tipoCambioUsd,
    tipoCambioSource: tipoCambioUsd != null ? "api" : null,
  });
  return { status: "imported", couponId: created._id.toString() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/import/importAutoCoupon.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/import/importAutoCoupon.ts server/src/import/importAutoCoupon.test.ts
git commit -m "feat(import): import auto coupons with natural-key dedupe and USD rate"
```

---

### Task 6: Stats — `computeAutoProgress` + fixture

**Files:**
- Create: `server/src/testing/autoCouponFixtures.ts`
- Create: `server/src/stats/autoProgress.ts`
- Test: `server/src/stats/autoProgress.test.ts`

**Interfaces:**
- Consumes: `AutoSummaryDTO` (Task 1).
- Produces: `AUTO_CUOTAS_TOTALES = 120`; `AutoCouponInput`; `computeAutoProgress(coupons: AutoCouponInput[]): AutoSummaryDTO | null`; `RAW_AUTO_COUPONS`, `RawAutoCoupon`.

- [ ] **Step 1: Create the shared fixture** — `server/src/testing/autoCouponFixtures.ts` (valores reales de 4 cupones):

```ts
export interface RawAutoConcept {
  label: string;
  amount: number;
}

export interface RawAutoCoupon {
  grupo: string;
  orden: string;
  cuotaNro: number;
  plan: string;
  fechaEmision: string;
  fechaVencimiento: string;
  comprobante: string;
  modelo: string;
  valorMovil: number;
  conceptos: RawAutoConcept[];
  totalAPagar: number;
}

export const RAW_AUTO_COUPONS: RawAutoCoupon[] = [
  {
    grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
    fechaEmision: "2024-10-18", fechaVencimiento: "2024-11-11", comprobante: "000062757060",
    modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01, totalAPagar: 268551.23,
    conceptos: [
      { label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 },
      { label: "PORCION DE ALICUOTA DIFERIDA", amount: -11767.85 },
      { label: "IVA SOBRE CONCEPTOS GRAVADOS", amount: 5067.9 },
      { label: "RECUP IMP BANCARIOS LEY 25413", amount: 2157.79 },
      { label: "DER. INSCRIP.PRORR. HIST (DIP)", amount: 34274.38 },
      { label: "GASTOS ADMINISTRATIVOS", amount: 22358.9 },
      { label: "SEGURO DE VIDA (SV)", amount: 23389.67 },
      { label: "DIFERIMIENTO COMERCIAL", amount: -70607.06 },
      { label: "ACTUALIZACIÓN VALOR HIST.DIP", amount: 1029.89 },
      { label: "GASTOS DE SELLADO PRORR (GSP)", amount: 26546.6 },
      { label: "ACTUALIZACIÓN VALOR HIST.GSP", amount: 744.03 },
    ],
  },
  {
    grupo: "3684", orden: "97", cuotaNro: 11, plan: "K",
    fechaEmision: "2025-07-18", fechaVencimiento: "2025-08-11", comprobante: "000063935746",
    modelo: "AIRCROSS T200 FEEL PK MY26", valorMovil: 32110000.0, totalAPagar: 323378.16,
    conceptos: [
      { label: "ANTICIPO ALICUOTA (AL)", amount: 267610.09 },
      { label: "IVA SOBRE CONCEPTOS GRAVADOS", amount: 8282.48 },
      { label: "RECUP IMP BANCARIOS LEY 25413", amount: 2598.32 },
      { label: "SEGURO DE VIDA (SV)", amount: 24908.95 },
      { label: "DER. INSCRIP.PRORR. HIST (DIP)", amount: 34274.38 },
      { label: "GASTOS ADMINISTRATIVOS", amount: 26761.01 },
      { label: "DIFERIMIENTO COMERCIAL", amount: -80283.03 },
      { label: "ACTUALIZACIÓN VALOR HIST.DIP", amount: 5867.98 },
      { label: "GASTOS DE SELLADO PRORR (GSP)", amount: 26546.6 },
      { label: "ACTUALIZACIÓN VALOR HIST.GSP", amount: 6811.38 },
    ],
  },
  {
    grupo: "3684", orden: "97", cuotaNro: 17, plan: "K",
    fechaEmision: "2026-01-19", fechaVencimiento: "2026-02-10", comprobante: "000064824409",
    modelo: "AIRCROSS T200 FEEL PK MY26", valorMovil: 40110000.0, totalAPagar: 394224.89,
    conceptos: [
      { label: "ANTICIPO ALICUOTA (AL)", amount: 334283.43 },
      { label: "IVA SOBRE CONCEPTOS GRAVADOS", amount: 10352.48 },
      { label: "RECUP IMP BANCARIOS LEY 25413", amount: 3167.56 },
      { label: "ACTUALIZACIÓN VALOR HIST.DIP", amount: 15869.19 },
      { label: "GASTOS ADMINISTRATIVOS", amount: 33428.34 },
      { label: "DER. INSCRIP.PRORR. HIST (DIP)", amount: 34274.38 },
      { label: "DIFERIMIENTO COMERCIAL", amount: -66856.69 },
      { label: "SEGURO DE VIDA (SV)", amount: 29706.2 },
    ],
  },
  {
    grupo: "3684", orden: "97", cuotaNro: 22, plan: "K",
    fechaEmision: "2026-06-19", fechaVencimiento: "2026-07-10", comprobante: "000065709903",
    modelo: "AIRCROSS T200 FEEL PK MY26", valorMovil: 41580000.0, totalAPagar: 442570.43,
    conceptos: [
      { label: "ANTICIPO ALICUOTA (AL)", amount: 346534.65 },
      { label: "IVA SOBRE CONCEPTOS GRAVADOS", amount: 10995.68 },
      { label: "RECUP IMP BANCARIOS LEY 25413", amount: 3556.02 },
      { label: "GASTOS ADMINISTRATIVOS", amount: 34653.47 },
      { label: "DIFERIMIENTO COMERCIAL", amount: -34653.47 },
      { label: "DER. INSCRIP.PRORR. HIST (DIP)", amount: 34274.38 },
      { label: "ACTUALIZACIÓN VALOR HIST.DIP", amount: 17706.91 },
      { label: "SEGURO DE VIDA (SV)", amount: 29502.78 },
    ],
  },
];
```

- [ ] **Step 2: Write the failing test** — `server/src/stats/autoProgress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeAutoProgress } from "./autoProgress.js";
import { RAW_AUTO_COUPONS } from "../testing/autoCouponFixtures.js";

const inputs = RAW_AUTO_COUPONS.map((c) => ({
  grupo: c.grupo, orden: c.orden, plan: c.plan, modelo: c.modelo, cuotaNro: c.cuotaNro,
  fechaVencimiento: c.fechaVencimiento, valorMovil: c.valorMovil, totalAPagar: c.totalAPagar,
  totalUsd: null,
}));

describe("computeAutoProgress", () => {
  it("devuelve null sin cupones", () => {
    expect(computeAutoProgress([])).toBeNull();
  });

  it("deriva el avance con los cupones", () => {
    const r = computeAutoProgress(inputs)!;
    expect(r.cuotasPagadas).toBe(4);
    expect(r.cuotasTotales).toBe(120);
    expect(r.porcentajeAvance).toBeCloseTo(4 / 120, 5);
    expect(r.totalPagado).toBeCloseTo(1428724.71, 2);
    expect(r.valorActualAuto).toBe(41580000);
    expect(r.ultimaCuota).toBe(22);
    expect(r.fechaUltimoVencimiento).toBe("2026-07-10");
    expect(r.modelo).toBe("AIRCROSS T200 FEEL PK MY26");
  });

  it("suma totalPagadoUsd de los que tienen TC", () => {
    const withUsd = inputs.map((c, i) => ({ ...c, totalUsd: i === 0 ? 200 : null }));
    const r = computeAutoProgress(withUsd)!;
    expect(r.totalPagadoUsd).toBe(200);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run server/src/stats/autoProgress.test.ts`
Expected: FAIL — cannot find module `./autoProgress.js`.

- [ ] **Step 4: Implement** — `server/src/stats/autoProgress.ts`:

```ts
import type { AutoSummaryDTO } from "@ledgerly/shared";

export const AUTO_CUOTAS_TOTALES = 120;

export interface AutoCouponInput {
  grupo: string;
  orden: string;
  plan: string;
  modelo: string;
  cuotaNro: number;
  fechaVencimiento: string;
  valorMovil: number;
  totalAPagar: number;
  totalUsd: number | null;
}

export function computeAutoProgress(coupons: AutoCouponInput[]): AutoSummaryDTO | null {
  if (coupons.length === 0) return null;

  const sorted = [...coupons].sort((a, b) => a.cuotaNro - b.cuotaNro);
  const last = sorted[sorted.length - 1];
  const totalPagado = sorted.reduce((acc, c) => acc + c.totalAPagar, 0);
  const totalPagadoUsd = sorted.reduce((acc, c) => acc + (c.totalUsd ?? 0), 0);

  return {
    grupo: last.grupo,
    orden: last.orden,
    plan: last.plan,
    modelo: last.modelo,
    cuotasPagadas: sorted.length,
    cuotasTotales: AUTO_CUOTAS_TOTALES,
    porcentajeAvance: sorted.length / AUTO_CUOTAS_TOTALES,
    totalPagado,
    valorActualAuto: last.valorMovil,
    totalPagadoUsd,
    ultimaCuota: last.cuotaNro,
    fechaUltimoVencimiento: last.fechaVencimiento,
  };
}
```

- [ ] **Step 5: Run test to verify it passes + commit**

Run: `bunx vitest run server/src/stats/autoProgress.test.ts` → Expected: PASS.

```bash
bun run typecheck
git add server/src/testing/autoCouponFixtures.ts server/src/stats/autoProgress.ts server/src/stats/autoProgress.test.ts
git commit -m "feat(stats): derive auto savings-plan progress summary"
```

---

### Task 7: Mapper + router `/api/auto`

**Files:**
- Modify: `server/src/http/mappers.ts`
- Create: `server/src/http/routes/auto.ts`
- Modify: `server/src/http/app.ts`
- Test: `server/src/http/routes/auto.test.ts`

**Interfaces:**
- Consumes: `AutoCouponModel` (Task 4), `computeAutoProgress`+`AutoCouponInput` (Task 6), `AutoCouponDTO` (Task 1).
- Produces: `toAutoCouponDTO(doc)`; `autoRouter` montado en `/api/auto` con `GET /coupons`, `GET /summary`, `PATCH /coupons/:id`.

- [ ] **Step 1: Write the failing test** — `server/src/http/routes/auto.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { AutoCouponModel } from "../../db/models.js";
import { RAW_AUTO_COUPONS } from "../../testing/autoCouponFixtures.js";

withDb();
const app = createApp();

beforeEach(async () => {
  await AutoCouponModel.insertMany(
    RAW_AUTO_COUPONS.map((c) => ({
      ...c,
      fechaEmision: new Date(c.fechaEmision),
      fechaVencimiento: new Date(c.fechaVencimiento),
      sourceFileName: `${c.cuotaNro}.pdf`,
      sourceHash: `h${c.cuotaNro}`,
    })),
  );
});

describe("GET /api/auto/coupons", () => {
  it("lista los cupones ordenados con conceptos", async () => {
    const res = await request(app).get("/api/auto/coupons");
    expect(res.body).toHaveLength(4);
    expect(res.body[0].cuotaNro).toBe(2);
    expect(res.body[0].conceptos.length).toBeGreaterThan(5);
    expect(res.body[0].totalUsd).toBeNull();
  });
});

describe("GET /api/auto/summary", () => {
  it("devuelve el avance derivado", async () => {
    const res = await request(app).get("/api/auto/summary");
    expect(res.body.cuotasPagadas).toBe(4);
    expect(res.body.cuotasTotales).toBe(120);
    expect(res.body.valorActualAuto).toBe(41580000);
  });

  it("devuelve 204 sin cupones", async () => {
    await AutoCouponModel.deleteMany({});
    const res = await request(app).get("/api/auto/summary");
    expect(res.status).toBe(204);
  });
});

describe("PATCH /api/auto/coupons/:id", () => {
  it("setea el TC manual y recalcula totalUsd", async () => {
    const list = await request(app).get("/api/auto/coupons");
    const first = list.body[0];
    const res = await request(app).patch(`/api/auto/coupons/${first.id}`).send({ tipoCambioUsd: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.tipoCambioSource).toBe("manual");
    expect(res.body.totalUsd).toBeCloseTo(first.totalAPagar / 1000, 2);
  });

  it("rechaza tipoCambioUsd no positivo", async () => {
    const list = await request(app).get("/api/auto/coupons");
    const res = await request(app).patch(`/api/auto/coupons/${list.body[0].id}`).send({ tipoCambioUsd: 0 });
    expect(res.status).toBe(400);
  });

  it("404 si el cupón no existe", async () => {
    const res = await request(app).patch("/api/auto/coupons/64b7f9c2a1b2c3d4e5f60718").send({ tipoCambioUsd: 1000 });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/auto.test.ts`
Expected: FAIL — ruta `/api/auto` no montada (404).

- [ ] **Step 3: Implement**

In `server/src/http/mappers.ts`: add `AutoCouponDTO` to the shared import (line 1) and `AutoCouponDoc` to the models import (line 2), then append:

```ts
export function toAutoCouponDTO(doc: HydratedDocument<AutoCouponDoc>): AutoCouponDTO {
  return {
    id: doc._id.toString(),
    grupo: doc.grupo,
    orden: doc.orden,
    cuotaNro: doc.cuotaNro,
    plan: doc.plan,
    fechaEmision: doc.fechaEmision.toISOString().slice(0, 10),
    fechaVencimiento: doc.fechaVencimiento.toISOString().slice(0, 10),
    comprobante: doc.comprobante,
    modelo: doc.modelo,
    valorMovil: doc.valorMovil,
    conceptos: doc.conceptos.map((c) => ({ label: c.label, amount: c.amount })),
    totalAPagar: doc.totalAPagar,
    tipoCambioUsd: doc.tipoCambioUsd ?? null,
    tipoCambioSource: (doc.tipoCambioSource ?? null) as AutoCouponDTO["tipoCambioSource"],
    totalUsd: doc.tipoCambioUsd ? doc.totalAPagar / doc.tipoCambioUsd : null,
  };
}
```

`server/src/http/routes/auto.ts`:

```ts
import { Router } from "express";
import { HttpError, asyncHandler } from "../errors.js";
import { AutoCouponModel } from "../../db/models.js";
import { toAutoCouponDTO } from "../mappers.js";
import { computeAutoProgress } from "../../stats/autoProgress.js";

export const autoRouter = Router();

autoRouter.get("/coupons", asyncHandler(async (_req, res) => {
  const docs = await AutoCouponModel.find().sort({ cuotaNro: 1 });
  res.json(docs.map(toAutoCouponDTO));
}));

autoRouter.get("/summary", asyncHandler(async (_req, res) => {
  const docs = await AutoCouponModel.find().sort({ cuotaNro: 1 }).lean();
  const progress = computeAutoProgress(
    docs.map((c) => ({
      grupo: c.grupo,
      orden: c.orden,
      plan: c.plan,
      modelo: c.modelo,
      cuotaNro: c.cuotaNro,
      fechaVencimiento: c.fechaVencimiento.toISOString().slice(0, 10),
      valorMovil: c.valorMovil,
      totalAPagar: c.totalAPagar,
      totalUsd: c.tipoCambioUsd ? c.totalAPagar / c.tipoCambioUsd : null,
    })),
  );
  if (!progress) {
    res.status(204).end();
    return;
  }
  res.json(progress);
}));

autoRouter.patch("/coupons/:id", asyncHandler(async (req, res) => {
  const { tipoCambioUsd } = req.body as { tipoCambioUsd?: unknown };
  if (typeof tipoCambioUsd !== "number" || !(tipoCambioUsd > 0)) {
    throw new HttpError(400, "tipoCambioUsd debe ser un número positivo");
  }
  const doc = await AutoCouponModel.findByIdAndUpdate(
    req.params.id,
    { tipoCambioUsd, tipoCambioSource: "manual" },
    { new: true },
  );
  if (!doc) throw new HttpError(404, "Cupón no encontrado");
  res.json(toAutoCouponDTO(doc));
}));
```

In `server/src/http/app.ts`: add the import (with the other route imports) and mount it after `/api/credits`:

```ts
import { autoRouter } from "./routes/auto.js";
```
```ts
  app.use("/api/auto", autoRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/routes/auto.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/http/mappers.ts server/src/http/routes/auto.ts server/src/http/app.ts server/src/http/routes/auto.test.ts
git commit -m "feat(api): auto router with coupons, summary and USD-rate override"
```

---

### Task 8: `POST /api/import` — dispatch a `auto`

**Files:**
- Modify: `server/src/http/routes/import.ts`
- Test: `server/src/http/routes/import.test.ts`

**Interfaces:**
- Consumes: `detectDocumentKind` (Task 3, ahora con `"auto"`), `importAutoCoupon` (Task 5), `AutoCouponModel`, `toAutoCouponDTO`, `InvalidAutoCouponError`.
- Produces: respuesta `{ kind: "auto", status, coupon }` (201 nuevo / 200 duplicado); `InvalidAutoCouponError` → 422.

- [ ] **Step 1: Write the failing test** — in `server/src/http/routes/import.test.ts`, add the auto fixture read near the other `read(...)` lines, and add this `describe` block (keep existing tests intact):

```ts
const autoText = read("../../parsers/__fixtures__/auto-plan.sample.txt");

describe("POST /api/import (auto)", () => {
  it("importa un cupón de auto (kind auto, 201)", async () => {
    mocked.mockResolvedValue({ text: autoText, meta });
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "auto.pdf");
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("auto");
    expect(res.body.coupon.cuotaNro).toBe(2);
  });

  it("reimportar el mismo cupón de auto devuelve duplicate (200)", async () => {
    mocked.mockResolvedValue({ text: autoText, meta });
    await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "auto.pdf");
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "auto.pdf");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("duplicate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/import.test.ts`
Expected: FAIL — `res.body.kind` es `undefined` (cae en 422 unknown; el dispatch de auto no existe).

- [ ] **Step 3: Implement** — in `server/src/http/routes/import.ts`:

Add to the imports:

```ts
import { importAutoCoupon } from "../../import/importAutoCoupon.js";
```

Change the models import (line 8) to include `AutoCouponModel`:

```ts
import { AutoCouponModel, MortgageCouponModel, StatementModel } from "../../db/models.js";
```

Change the mappers import (line 9) to include `toAutoCouponDTO`:

```ts
import { toAutoCouponDTO, toMortgageCouponDTO, toStatementDTO } from "../mappers.js";
```

Change the ingestion-errors import (lines 10-12) to include `InvalidAutoCouponError`:

```ts
import {
  InvalidAutoCouponError, InvalidCouponError, NoTextError, NoTransactionsError, UnsupportedFormatError,
} from "../../ingestion/errors.js";
```

Add this branch right after the `if (kind === "coupon") { ... }` block (before `if (kind === "statement")`):

```ts
    if (kind === "auto") {
      const result = await importAutoCoupon({ data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await AutoCouponModel.findById(result.couponId);
      res.status(result.status === "duplicate" ? 200 : 201)
        .json({ kind: "auto", status: result.status, coupon: toAutoCouponDTO(doc!) });
      return;
    }
```

In the `catch` clause, add `InvalidAutoCouponError` to the 422 condition:

```ts
    if (err instanceof NoTextError || err instanceof UnsupportedFormatError
      || err instanceof NoTransactionsError || err instanceof InvalidCouponError
      || err instanceof InvalidAutoCouponError) {
      throw new HttpError(422, err.message);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/routes/import.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/http/routes/import.ts server/src/http/routes/import.test.ts
git commit -m "feat(api): dispatch auto coupons in unified import endpoint"
```

---

### Task 9: Backfill + seed (`seed:auto`, `seed:fx:auto`)

**Files:**
- Create: `server/src/import/backfillAutoRates.ts`
- Create: `server/src/import/seedAutoCoupons.ts`
- Modify: `package.json`
- Test: `server/src/import/backfillAutoRates.test.ts`
- Test: `server/src/import/seedAutoCoupons.test.ts`

**Interfaces:**
- Consumes: `AutoCouponModel`, `fetchOficialRate`, `importAutoCoupon`.
- Produces: `backfillAutoRates(): Promise<{ updated: number; skipped: number }>`; `seedAutoCoupons(dir: string): Promise<{ imported: number; duplicates: number }>`.

- [ ] **Step 1: Write the failing tests**

`server/src/import/backfillAutoRates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../fx/dollarRate.js";
import { backfillAutoRates } from "./backfillAutoRates.js";
import { AutoCouponModel } from "../db/models.js";

withDb();
const mockedFx = vi.mocked(fetchOficialRate);

const base = {
  grupo: "3684", orden: "97", plan: "K", fechaEmision: new Date("2024-10-18"),
  fechaVencimiento: new Date("2024-11-11"), comprobante: "c", modelo: "C3", valorMovil: 1,
  conceptos: [], totalAPagar: 1000, sourceFileName: "x.pdf",
};

beforeEach(async () => {
  await AutoCouponModel.insertMany([
    { ...base, cuotaNro: 1, sourceHash: "h1" },
    { ...base, cuotaNro: 2, sourceHash: "h2", tipoCambioUsd: 999, tipoCambioSource: "manual" },
  ]);
});

describe("backfillAutoRates", () => {
  it("completa solo los cupones sin TC", async () => {
    mockedFx.mockResolvedValue(1000);
    const r = await backfillAutoRates();
    expect(r.updated).toBe(1);
    const c1 = await AutoCouponModel.findOne({ cuotaNro: 1 });
    expect(c1?.tipoCambioUsd).toBe(1000);
    expect(c1?.tipoCambioSource).toBe("api");
    const c2 = await AutoCouponModel.findOne({ cuotaNro: 2 });
    expect(c2?.tipoCambioUsd).toBe(999);
  });

  it("cuenta como skipped si la API no devuelve dato", async () => {
    mockedFx.mockResolvedValue(null);
    const r = await backfillAutoRates();
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(1);
  });
});
```

`server/src/import/seedAutoCoupons.test.ts` (PDFs reales, parser real, dólar mockeado):

```ts
import { describe, it, expect, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn(async () => 1000) }));
import { seedAutoCoupons } from "./seedAutoCoupons.js";
import { AutoCouponModel } from "../db/models.js";

withDb();
const dir = fileURLToPath(new URL("../../../examples/auto/", import.meta.url));

describe("seedAutoCoupons", () => {
  it("importa los cupones reales y deduplica en la segunda pasada", async () => {
    const first = await seedAutoCoupons(dir);
    expect(first.imported).toBeGreaterThanOrEqual(1);
    expect(await AutoCouponModel.countDocuments()).toBe(first.imported);
    const second = await seedAutoCoupons(dir);
    expect(second.duplicates).toBeGreaterThanOrEqual(1);
    expect(second.imported).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run server/src/import/backfillAutoRates.test.ts server/src/import/seedAutoCoupons.test.ts`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 3: Implement**

`server/src/import/backfillAutoRates.ts`:

```ts
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { AutoCouponModel } from "../db/models.js";
import { fetchOficialRate } from "../fx/dollarRate.js";

export async function backfillAutoRates(): Promise<{ updated: number; skipped: number }> {
  const docs = await AutoCouponModel.find({ tipoCambioUsd: null });
  let updated = 0;
  let skipped = 0;
  for (const doc of docs) {
    const rate = await fetchOficialRate(doc.fechaVencimiento.toISOString().slice(0, 10)).catch(() => null);
    if (rate == null) {
      skipped += 1;
      continue;
    }
    doc.tipoCambioUsd = rate;
    doc.tipoCambioSource = "api";
    await doc.save();
    updated += 1;
  }
  return { updated, skipped };
}

if (process.argv[1]?.endsWith("backfillAutoRates.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillAutoRates();
  console.log(`TC auto backfill: ${r.updated} actualizados, ${r.skipped} sin dato`);
  await disconnectMongo();
}
```

`server/src/import/seedAutoCoupons.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { importAutoCoupon } from "./importAutoCoupon.js";

export async function seedAutoCoupons(dir: string): Promise<{ imported: number; duplicates: number }> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
  let imported = 0;
  let duplicates = 0;
  for (const file of files) {
    const data = new Uint8Array(readFileSync(`${dir}${file}`));
    const result = await importAutoCoupon({ data, fileName: file });
    if (result.status === "imported") imported += 1;
    else duplicates += 1;
  }
  return { imported, duplicates };
}

if (process.argv[1]?.endsWith("seedAutoCoupons.ts")) {
  const dir = fileURLToPath(new URL("../../../examples/auto/", import.meta.url));
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const result = await seedAutoCoupons(dir);
  console.log(`Cupones auto: ${result.imported} importados, ${result.duplicates} duplicados`);
  await disconnectMongo();
}
```

In `package.json`, in `scripts`, after `"seed:fx": ...`, add:

```json
    "seed:auto": "tsx server/src/import/seedAutoCoupons.ts",
    "seed:fx:auto": "tsx server/src/import/backfillAutoRates.ts",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run server/src/import/backfillAutoRates.test.ts server/src/import/seedAutoCoupons.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
bun run typecheck
git add server/src/import/backfillAutoRates.ts server/src/import/seedAutoCoupons.ts package.json server/src/import/backfillAutoRates.test.ts server/src/import/seedAutoCoupons.test.ts
git commit -m "feat(import): seed auto coupons and backfill USD rates (seed:auto, seed:fx:auto)"
```

---

### Task 10: Cliente — hooks + `AutoCouponsTable` (columnas de conceptos dinámicas)

**Files:**
- Modify: `client/src/api/hooks.ts`
- Create: `client/src/components/AutoCouponsTable.tsx`
- Test: `client/src/components/AutoCouponsTable.test.tsx`

**Interfaces:**
- Consumes: `AutoCouponDTO`, `AutoSummaryDTO` (Task 1).
- Produces: `useAutoCoupons()`, `useAutoSummary()`, `usePatchAutoRate()`; `AutoCouponsTable` con columnas = unión de conceptos + Total + Valor auto + TC editable + Pagado (USD).

- [ ] **Step 1: Write the failing test** — `client/src/components/AutoCouponsTable.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { AutoCouponsTable } from "./AutoCouponsTable.js";

const coupon = {
  id: "c1", grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
  fechaEmision: "2024-10-18", fechaVencimiento: "2024-11-11", comprobante: "000062757060",
  modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01,
  conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }, { label: "SEGURO DE VIDA (SV)", amount: 23389.67 }],
  totalAPagar: 268551.23, tipoCambioUsd: 1000, tipoCambioSource: "api", totalUsd: 268.55,
};
const patchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      patchSpy(url, init.body);
      return new Response(JSON.stringify({ ...coupon, tipoCambioUsd: 1100, tipoCambioSource: "manual", totalUsd: 244.14 }), { status: 200 });
    }
    return new Response(JSON.stringify([coupon]), { status: 200 });
  }));
});
afterEach(() => { vi.restoreAllMocks(); patchSpy.mockReset(); });

describe("AutoCouponsTable", () => {
  it("muestra columnas de conceptos y Pagado (USD)", async () => {
    renderWithProviders(<AutoCouponsTable />);
    await waitFor(() => expect(screen.getByText("Pagado (USD)")).toBeInTheDocument());
    expect(screen.getByText("ANTICIPO ALICUOTA (AL)")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /tc oficial/i })).toBeInTheDocument();
  });

  it("editar el TC dispara un PATCH a /auto/coupons", async () => {
    renderWithProviders(<AutoCouponsTable />);
    await waitFor(() => expect(screen.getByText("Pagado (USD)")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /editar tc cuota 2/i }));
    const input = screen.getByRole("spinbutton", { name: /tc cuota 2/i });
    await userEvent.clear(input);
    await userEvent.type(input, "1100{Enter}");
    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
    expect(patchSpy.mock.calls[0][0]).toContain("/auto/coupons/c1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/AutoCouponsTable.test.tsx`
Expected: FAIL — no existe `./AutoCouponsTable.js`.

- [ ] **Step 3: Implement**

In `client/src/api/hooks.ts`: add `AutoCouponDTO, AutoSummaryDTO` to the type import from `@ledgerly/shared`, then append after `usePatchCouponRate`:

```ts
export function useAutoCoupons() {
  return useQuery({ queryKey: ["auto-coupons"], queryFn: () => apiFetch<AutoCouponDTO[]>("/auto/coupons") });
}
export function useAutoSummary() {
  return useQuery({ queryKey: ["auto-summary"], queryFn: () => apiFetch<AutoSummaryDTO>("/auto/summary") });
}
export function usePatchAutoRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tipoCambioUsd }: { id: string; tipoCambioUsd: number }) =>
      apiFetch<AutoCouponDTO>(`/auto/coupons/${id}`, { method: "PATCH", body: JSON.stringify({ tipoCambioUsd }) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

`client/src/components/AutoCouponsTable.tsx`:

```tsx
import { useRef, useState } from "react";
import { Box, IconButton, Table, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import type { AutoCouponDTO } from "@ledgerly/shared";
import { useAutoCoupons, usePatchAutoRate } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

const RateCell = ({ coupon }: { coupon: AutoCouponDTO }) => {
  const patch = usePatchAutoRate();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(coupon.tipoCambioUsd ?? ""));
  const savingRef = useRef(false);

  const save = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setEditing(false);
    const parsed = Number(value);
    if (parsed > 0 && parsed !== coupon.tipoCambioUsd) patch.mutate({ id: coupon.id, tipoCambioUsd: parsed });
  };

  if (editing) {
    return (
      <TextField
        size="small"
        type="number"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        inputProps={{ "aria-label": `TC cuota ${coupon.cuotaNro}`, style: { textAlign: "right", width: 90 } }}
      />
    );
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
      {coupon.tipoCambioUsd != null ? formatMoney(coupon.tipoCambioUsd, "ARS") : "—"}
      <IconButton size="small" aria-label={`editar TC cuota ${coupon.cuotaNro}`} onClick={() => { savingRef.current = false; setValue(String(coupon.tipoCambioUsd ?? "")); setEditing(true); }}>
        <EditIcon fontSize="inherit" />
      </IconButton>
    </Box>
  );
};

export const AutoCouponsTable = () => {
  const { data } = useAutoCoupons();
  if (!data || data.length === 0) return null;

  const rows = [...data].sort((a, b) => a.cuotaNro - b.cuotaNro);
  const conceptLabels: string[] = [];
  for (const coupon of rows) {
    for (const concept of coupon.conceptos) {
      if (!conceptLabels.includes(concept.label)) conceptLabels.push(concept.label);
    }
  }
  const amountOf = (coupon: AutoCouponDTO, label: string): number | null =>
    coupon.conceptos.find((c) => c.label === label)?.amount ?? null;

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Cuota</TableCell>
            <TableCell>Vencimiento</TableCell>
            {conceptLabels.map((label) => (
              <TableCell key={label} align="right">{label}</TableCell>
            ))}
            <TableCell align="right">Total</TableCell>
            <TableCell align="right">Valor auto</TableCell>
            <TableCell align="right">TC oficial</TableCell>
            <TableCell align="right">Pagado (USD)</TableCell>
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows.map((c) => (
            <MotionTableRow key={c.id} variants={fadeUpItem}>
              <TableCell>{c.cuotaNro}</TableCell>
              <TableCell>{c.fechaVencimiento}</TableCell>
              {conceptLabels.map((label) => {
                const amount = amountOf(c, label);
                return (
                  <TableCell key={label} align="right">
                    {amount != null ? formatMoney(amount, "ARS") : <Typography component="span" color="text.disabled">—</Typography>}
                  </TableCell>
                );
              })}
              <TableCell align="right">{formatMoney(c.totalAPagar, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.valorMovil, "ARS")}</TableCell>
              <TableCell align="right"><RateCell coupon={c} /></TableCell>
              <TableCell align="right">
                {c.totalUsd != null ? formatMoney(c.totalUsd, "USD") : <Typography component="span" color="text.disabled">—</Typography>}
              </TableCell>
            </MotionTableRow>
          ))}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/components/AutoCouponsTable.test.tsx` → Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck
git add client/src/api/hooks.ts client/src/components/AutoCouponsTable.tsx client/src/components/AutoCouponsTable.test.tsx
git commit -m "feat(client): auto hooks and dynamic-column coupons table"
```

---

### Task 11: Cliente — `AutoKpiCards` + `AutoPage` (shell) + nav/ruta + Importar

**Files:**
- Create: `client/src/components/AutoKpiCards.tsx`
- Create: `client/src/pages/AutoPage.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Layout.tsx`
- Modify: `client/src/pages/ImportPage.tsx`
- Test: `client/src/pages/AutoPage.test.tsx`

**Interfaces:**
- Consumes: `useAutoSummary`, `useAutoCoupons` (Task 10); `AutoCouponsTable` (Task 10); `CountUp`, motion.
- Produces: `AutoKpiCards`; `AutoPage` (ruta `/auto`); nav "Auto"; branch `kind === "auto"` en Importar.

- [ ] **Step 1: Write the failing test** — `client/src/pages/AutoPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { AutoPage } from "./AutoPage.js";

function route(url: string) {
  if (url.includes("/auto/summary")) {
    return { grupo: "3684", orden: "97", plan: "K", modelo: "C3 AIRCROSS T200 FEEL PK MY24",
      cuotasPagadas: 4, cuotasTotales: 120, porcentajeAvance: 0.0333, totalPagado: 1428724.71,
      valorActualAuto: 41580000, totalPagadoUsd: 1200, ultimaCuota: 22, fechaUltimoVencimiento: "2026-07-10" };
  }
  if (url.includes("/auto/coupons")) {
    return [{ id: "1", grupo: "3684", orden: "97", cuotaNro: 2, plan: "K", fechaEmision: "2024-10-18",
      fechaVencimiento: "2024-11-11", comprobante: "000062757060", modelo: "C3 AIRCROSS T200 FEEL PK MY24",
      valorMovil: 28240000.01, conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }],
      totalAPagar: 268551.23, tipoCambioUsd: 1000, tipoCambioSource: "api", totalUsd: 268.55 }];
  }
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.restoreAllMocks());

describe("AutoPage", () => {
  it("muestra el título, KPIs y el detalle mes a mes", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto" });
    await waitFor(() => expect(screen.getByText("Total pagado")).toBeInTheDocument());
    expect(screen.getByText("Valor del auto")).toBeInTheDocument();
    expect(screen.getByText("Avance")).toBeInTheDocument();
    expect(screen.getByText("Detalle mes a mes")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/AutoPage.test.tsx`
Expected: FAIL — no existe `./AutoPage.js`.

- [ ] **Step 3: Implement**

`client/src/components/AutoKpiCards.tsx`:

```tsx
import type { ReactNode } from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import DonutLargeIcon from "@mui/icons-material/DonutLarge";
import { useAutoSummary } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { MotionBox } from "./motion/motion.js";
import { CountUp } from "./motion/CountUp.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

type KpiColor = "primary" | "secondary" | "success" | "warning";

interface KpiProps {
  label: string;
  value: number;
  format: (value: number) => string;
  sub?: string;
  icon: ReactNode;
  color: KpiColor;
}

const Kpi = ({ label, value, format, sub, icon, color }: KpiProps) => (
  <MotionBox variants={fadeUpItem}>
    <Card>
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, minHeight: 60 }}>
        <Box
          sx={{
            width: 46, height: 46, flexShrink: 0, borderRadius: 2.5, display: "grid", placeItems: "center",
            color: `${color}.main`, bgcolor: (theme) => `${theme.palette[color].main}1f`,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
            {label}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }} noWrap>
            <CountUp value={value} format={format} />
          </Typography>
          {sub && <Typography variant="caption" color="text.secondary" noWrap>{sub}</Typography>}
        </Box>
      </CardContent>
    </Card>
  </MotionBox>
);

export const AutoKpiCards = () => {
  const { data } = useAutoSummary();
  if (!data) return null;

  const money = (value: number) => formatMoney(value, "ARS");
  const usd = (value: number) => formatMoney(value, "USD");
  const percent = (value: number) => `${value.toFixed(1)}%`;
  const usdSub = data.totalPagadoUsd > 0 ? `en ${data.cuotasPagadas} cuotas` : undefined;

  return (
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}
    >
      <Kpi label="Total pagado" value={data.totalPagado} format={money} sub={`en ${data.cuotasPagadas} cuotas`} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Valor del auto" value={data.valorActualAuto} format={money} sub={data.modelo} icon={<DirectionsCarIcon />} color="secondary" />
      <Kpi label="Pagado en USD" value={data.totalPagadoUsd} format={usd} sub={usdSub} icon={<AttachMoneyIcon />} color="warning" />
      <Kpi label="Avance" value={data.porcentajeAvance * 100} format={percent} sub={`${data.cuotasPagadas}/${data.cuotasTotales} cuotas`} icon={<DonutLargeIcon />} color="success" />
    </MotionBox>
  );
};
```

`client/src/pages/AutoPage.tsx`:

```tsx
import { CircularProgress, Typography } from "@mui/material";
import { useAutoCoupons } from "../api/hooks.js";
import { AutoKpiCards } from "../components/AutoKpiCards.js";
import { AutoCouponsTable } from "../components/AutoCouponsTable.js";

export const AutoPage = () => {
  const { data, isLoading } = useAutoCoupons();
  const coupons = data ?? [];

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Auto</Typography>

      {isLoading && <CircularProgress />}
      {!isLoading && coupons.length === 0 && (
        <Typography color="text.secondary">
          Todavía no importaste cupones del plan de auto. Subilos desde la página Importar.
        </Typography>
      )}

      {!isLoading && coupons.length > 0 && (
        <>
          <AutoKpiCards />
          <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
          <AutoCouponsTable />
        </>
      )}
    </>
  );
};
```

In `client/src/App.tsx`: add the import with the other page imports:

```ts
import { AutoPage } from "./pages/AutoPage.js";
```

and add the route after the `/credits` route:

```tsx
        <Route path="/auto" element={<PageTransition><AutoPage /></PageTransition>} />
```

In `client/src/components/Layout.tsx`: add to the `NAV` array after the `Créditos` entry:

```ts
  { to: "/auto", label: "Auto" },
```

In `client/src/pages/ImportPage.tsx`: add this block after the `last.kind === "coupon"` block:

```tsx
      {last && last.kind === "auto" && (
        <Alert
          severity={last.status === "duplicate" ? "info" : "success"}
          sx={{ mb: 2 }}
          action={last.status === "duplicate" ? replaceAction : undefined}
        >
          {last.status === "duplicate"
            ? "Ese cupón del auto ya estaba importado"
            : `Importado: cuota ${last.coupon.cuotaNro} del plan de auto`}
        </Alert>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/AutoPage.test.tsx` → Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck
git add client/src/components/AutoKpiCards.tsx client/src/pages/AutoPage.tsx client/src/App.tsx client/src/components/Layout.tsx client/src/pages/ImportPage.tsx client/src/pages/AutoPage.test.tsx
git commit -m "feat(client): auto KPIs, page shell, nav and import feedback"
```

---

### Task 12: Cliente — 5 gráficos + wiring en `AutoPage`

**Files:**
- Create: `client/src/components/charts/AutoCompositionChart.tsx`
- Create: `client/src/components/charts/AutoTotalPaidByMonthChart.tsx`
- Create: `client/src/components/charts/CarValueChart.tsx`
- Create: `client/src/components/charts/AutoProgressDonutChart.tsx`
- Create: `client/src/components/charts/AutoCouponUsdChart.tsx`
- Modify: `client/src/pages/AutoPage.tsx`
- Modify: `client/src/pages/AutoPage.test.tsx`

**Interfaces:**
- Consumes: `useAutoCoupons`, `useAutoSummary`, `nivoTheme`, `seriesColor`, `formatMoney`/`formatMoneyCompact`.
- Produces: los 5 gráficos renderizados en `AutoPage` dentro de `ChartCard`.

- [ ] **Step 1: Update the failing test** — in `client/src/pages/AutoPage.test.tsx`, add these assertions to the existing test (after the `Detalle mes a mes` assertion):

```tsx
    expect(screen.getByText("Composición de la cuota por mes")).toBeInTheDocument();
    expect(screen.getByText("Total pagado por mes")).toBeInTheDocument();
    expect(screen.getByText("Evolución del valor del auto")).toBeInTheDocument();
    expect(screen.getByText("Avance del plan")).toBeInTheDocument();
    expect(screen.getByText("Valor de la cuota en USD")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/AutoPage.test.tsx`
Expected: FAIL — los títulos de los gráficos no están en la página.

- [ ] **Step 3: Implement**

`client/src/components/charts/AutoCompositionChart.tsx`:

```tsx
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const AutoCompositionChart = () => {
  const theme = useTheme();
  const { data } = useAutoCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = [...data].sort((a, b) => a.cuotaNro - b.cuotaNro);
  const labels: string[] = [];
  for (const coupon of rows) {
    for (const concept of coupon.conceptos) {
      if (!labels.includes(concept.label)) labels.push(concept.label);
    }
  }
  const chartData = rows.map((c) => {
    const row: Record<string, number | string> = { month: c.fechaVencimiento.slice(0, 7) };
    for (const label of labels) row[label] = c.conceptos.find((x) => x.label === label)?.amount ?? 0;
    return row;
  });
  const colors = labels.map((_, index) => seriesColor(theme.palette.mode, index));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={chartData}
        theme={nivoTheme(theme)}
        keys={labels}
        indexBy="month"
        colors={colors}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        padding={0.35}
        enableLabel={false}
        enableGridX={false}
        valueFormat={(value) => formatMoney(value, "ARS")}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        motionConfig="gentle"
      />
    </Box>
  );
};
```

`client/src/components/charts/AutoTotalPaidByMonthChart.tsx`:

```tsx
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const AutoTotalPaidByMonthChart = () => {
  const theme = useTheme();
  const { data } = useAutoCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = [...data]
    .sort((a, b) => a.cuotaNro - b.cuotaNro)
    .map((c) => ({ month: c.fechaVencimiento.slice(0, 7), total: c.totalAPagar }));
  const color = seriesColor(theme.palette.mode, 6);

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={["total"]}
        indexBy="month"
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        padding={0.35}
        borderRadius={6}
        enableLabel={false}
        enableGridX={false}
        valueFormat={(value) => formatMoney(value, "ARS")}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        motionConfig="gentle"
      />
    </Box>
  );
};
```

`client/src/components/charts/CarValueChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const CarValueChart = () => {
  const theme = useTheme();
  const { data } = useAutoCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const points = [...data]
    .sort((a, b) => a.cuotaNro - b.cuotaNro)
    .map((c) => ({ x: c.fechaVencimiento.slice(0, 7), y: c.valorMovil }));
  const color = seriesColor(theme.palette.mode, 4);
  const series = [{ id: "Valor del auto", data: points }];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme(theme)}
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: "auto", max: "auto" }}
        curve="monotoneX"
        lineWidth={3}
        pointSize={8}
        pointColor={theme.palette.background.paper}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea
        areaOpacity={1}
        defs={[linearGradientDef("carArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "carArea" }]}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        yFormat={(value) => formatMoney(Number(value), "ARS")}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
```

`client/src/components/charts/AutoProgressDonutChart.tsx`:

```tsx
import { ResponsivePie } from "@nivo/pie";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoSummary } from "../../api/hooks.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const AutoProgressDonutChart = () => {
  const theme = useTheme();
  const { data } = useAutoSummary();
  if (!data) return <Typography color="text.secondary">Sin datos</Typography>;

  const restantes = Math.max(0, data.cuotasTotales - data.cuotasPagadas);
  const chartData = [
    { id: "Pagadas", label: "Pagadas", value: data.cuotasPagadas },
    { id: "Restantes", label: "Restantes", value: restantes },
  ];
  const colors = [seriesColor(theme.palette.mode, 2), theme.palette.text.disabled];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsivePie
        data={chartData}
        theme={nivoTheme(theme)}
        colors={colors}
        margin={{ top: 16, right: 150, bottom: 16, left: 16 }}
        innerRadius={0.6}
        padAngle={1.2}
        cornerRadius={4}
        activeOuterRadiusOffset={8}
        borderWidth={1}
        borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        valueFormat={(value) => `${value} cuotas`}
        enableArcLabels={false}
        enableArcLinkLabels={false}
        motionConfig="gentle"
        legends={[{
          anchor: "right",
          direction: "column",
          translateX: 140,
          itemWidth: 132,
          itemHeight: 22,
          itemsSpacing: 2,
          symbolShape: "circle",
          symbolSize: 10,
          itemTextColor: theme.palette.text.secondary,
        }]}
      />
    </Box>
  );
};
```

`client/src/components/charts/AutoCouponUsdChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const AutoCouponUsdChart = () => {
  const theme = useTheme();
  const { data } = useAutoCoupons();
  const points = (data ?? [])
    .filter((c) => c.totalUsd != null)
    .sort((a, b) => a.cuotaNro - b.cuotaNro)
    .map((c) => ({ x: c.fechaVencimiento.slice(0, 7), y: c.totalUsd as number }));

  if (points.length === 0) return <Typography color="text.secondary">Sin datos de dólar</Typography>;

  const color = seriesColor(theme.palette.mode, 8);
  const series = [{ id: "Cuota en USD", data: points }];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme(theme)}
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: "auto", max: "auto" }}
        curve="monotoneX"
        lineWidth={3}
        pointSize={8}
        pointColor={theme.palette.background.paper}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea
        areaOpacity={1}
        defs={[linearGradientDef("autoUsdArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "autoUsdArea" }]}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "USD") }}
        yFormat={(value) => formatMoney(Number(value), "USD")}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
```

Replace `client/src/pages/AutoPage.tsx` with:

```tsx
import { CircularProgress, Typography } from "@mui/material";
import { useAutoCoupons } from "../api/hooks.js";
import { AutoKpiCards } from "../components/AutoKpiCards.js";
import { AutoCouponsTable } from "../components/AutoCouponsTable.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { AutoCompositionChart } from "../components/charts/AutoCompositionChart.js";
import { AutoTotalPaidByMonthChart } from "../components/charts/AutoTotalPaidByMonthChart.js";
import { CarValueChart } from "../components/charts/CarValueChart.js";
import { AutoProgressDonutChart } from "../components/charts/AutoProgressDonutChart.js";
import { AutoCouponUsdChart } from "../components/charts/AutoCouponUsdChart.js";

export const AutoPage = () => {
  const { data, isLoading } = useAutoCoupons();
  const coupons = data ?? [];

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Auto</Typography>

      {isLoading && <CircularProgress />}
      {!isLoading && coupons.length === 0 && (
        <Typography color="text.secondary">
          Todavía no importaste cupones del plan de auto. Subilos desde la página Importar.
        </Typography>
      )}

      {!isLoading && coupons.length > 0 && (
        <>
          <AutoKpiCards />
          <MotionBox
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
          >
            <ChartCard title="Composición de la cuota por mes"><AutoCompositionChart /></ChartCard>
            <ChartCard title="Total pagado por mes"><AutoTotalPaidByMonthChart /></ChartCard>
            <ChartCard title="Evolución del valor del auto"><CarValueChart /></ChartCard>
            <ChartCard title="Avance del plan"><AutoProgressDonutChart /></ChartCard>
            <ChartCard title="Valor de la cuota en USD"><AutoCouponUsdChart /></ChartCard>
          </MotionBox>

          <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
          <AutoCouponsTable />
        </>
      )}
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/AutoPage.test.tsx` → Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + commit**

```bash
bun run typecheck && bun run test
git add client/src/components/charts/AutoCompositionChart.tsx client/src/components/charts/AutoTotalPaidByMonthChart.tsx client/src/components/charts/CarValueChart.tsx client/src/components/charts/AutoProgressDonutChart.tsx client/src/components/charts/AutoCouponUsdChart.tsx client/src/pages/AutoPage.tsx client/src/pages/AutoPage.test.tsx
git commit -m "feat(client): auto charts (composition, car value, progress, USD) on Auto page"
```

---

## Self-Review

**Spec coverage:** parser + detección (Task 2-3); modelo con conceptos array + clave natural (Task 4); import resiliente con TC (Task 5); stats/avance 120 (Task 6); mapper + `/api/auto` GET/PATCH (Task 7); dispatch en `/api/import` (Task 8); backfill + seed (Task 9); DTOs/tipos (Task 1); hooks + tabla dinámica (Task 10); KPIs + página + nav + Importar (Task 11); 5 gráficos + wiring (Task 12). `totalUsd` derivado en el mapper (Task 7). Feature USD completa (import Task 5, override Task 7, backfill Task 9, columna/gráfico Task 10/12). Todo cubierto.

**Placeholder scan:** sin TBD/TODO; cada step tiene código y comando concretos.

**Type consistency:** `ParsedAutoCoupon`/`ParsedAutoConcept` (T1) consumidos en parser (T2), ingestión (T3), import (T5). `AutoCouponDTO`/`AutoConceptDTO`/`AutoSummaryDTO` (T1) idénticos en modelo (T4), mapper (T7), stats (T6), hooks/tabla (T10), KPIs (T11), gráficos (T12). `orden` normalizado (`String(Number(...))`) en parser (T2) coherente con clave natural en import (T5) y modelo (T4). `computeAutoProgress(AutoCouponInput[])` (T6) consumido en `/summary` (T7). `importAutoCoupon({data,fileName,replace})` (T5) usado en dispatch (T8) y seed (T9). `useAutoCoupons/useAutoSummary/usePatchAutoRate` (T10) consumidos en tabla (T10), KPIs (T11), gráficos (T12). `fetchOficialRate(fechaVencimiento)` en import (T5) y backfill (T9).

**Fuera de alcance (recordatorio):** generalizar Créditos; otros dólares; proyección de cuotas futuras; datos de adjudicación/sorteo; saldo pendiente en pesos; caché persistente de cotizaciones.

