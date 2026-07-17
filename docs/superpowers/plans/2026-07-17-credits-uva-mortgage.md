# Créditos (crédito hipotecario UVA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Créditos" section that ingests ICBC mortgage-coupon PDFs, stores each monthly coupon, and shows what's paid month-to-month (capital / interés / seguro) plus derived amortization progress, in pesos + UVAs.

**Architecture:** A parallel vertical slice for mortgage coupons that mirrors the existing credit-card pipeline file-for-file (parser → ingestion → import → model → stats → route → UI), reusing the generic pieces (`extractPdfText`, `parseArAmount`, the dedupe idiom, the pure-stats-function pattern, the test harness). A unified `POST /api/import` endpoint extracts the PDF text once and dispatches to the coupon or statement importer, so the existing Importar page accepts both. The full loan is derivable from the coupons, so amortization progress is computed, not stored.

**Tech Stack:** TypeScript (ESM), Express 4 + Mongoose 8 + Multer + unpdf (server), React 18 + MUI v6 + TanStack Query v5 + Nivo + framer-motion (client), Zod (shared), Vitest + supertest + mongodb-memory-server + React Testing Library (tests). Runtime: bun.

## Global Constraints

- **ESM imports:** every relative import uses an explicit `.js` extension (e.g. `import { x } from "./normalize.js";`); shared types import from `"@ledgerly/shared"`.
- **No `any`.** Define interfaces for props and return types. Destructure props in the component signature.
- **Components:** named `export const` arrow functions, no default exports. Chart/KPI components take their props object directly.
- **Styling:** MUI v6 `sx` prop only. This project has NO CSS Modules — do not introduce them here.
- **Currency union stays `"ARS" | "USD"`.** UVA is a plain `number` rendered via `formatUva`; do NOT add "UVA" to `currencySchema`/`StatFilters`/`formatMoney`.
- **UI copy in Spanish.** Routes are English-ish (`/credits`); nav labels Spanish (`Créditos`).
- **Mongoose model guard:** `export const XModel = mongoose.models.X ?? mongoose.model("X", schema);`. Types via `InferSchemaType`.
- **Amortization constants (validated against the 11 real coupons):** pure payment `P = 699.60 UVA`; monthly rate `i ≈ 0.0074166` (TNA 8.90%); term `240` cuotas; original principal `B₀ ≈ 78.316,73 UVA`.
- **Test runner:** `bunx vitest run <path>` for one file; `bun run test` for all. **Typecheck:** `bun run typecheck`.
- **Commits:** local only (the user handles push/PR/merge). Every commit message ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Shared contracts (parser interface + DTOs)

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `shared/src/dtos.ts`
- Test: `shared/src/dtos.test.ts` (create)

**Interfaces:**
- Produces: `ParsedCoupon`, `MortgageCouponParser` (types.ts); `MortgageCouponDTO`, `CreditSummaryDTO`, `ImportResultUnionDTO` + `mortgageCouponDtoSchema`, `creditSummaryDtoSchema`, `importResultUnionSchema` (dtos.ts).

- [ ] **Step 1: Write the failing test** — create `shared/src/dtos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mortgageCouponDtoSchema, creditSummaryDtoSchema, importResultUnionSchema } from "./dtos.js";

describe("mortgageCouponDtoSchema", () => {
  it("valida un cupón", () => {
    const dto = {
      id: "x", prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18",
      capital: 184689.39, intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93,
      cuotaPuraUva: 699.6, cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84,
      tea: 9.27, tna: 8.9, cft: 0,
    };
    expect(mortgageCouponDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("creditSummaryDtoSchema", () => {
  it("valida el resumen de avance", () => {
    const dto = {
      prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240,
      totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
      capitalOriginalUva: 1, capitalAmortizadoUva: 1, capitalPendienteUva: 1, capitalPendientePesos: 1,
      porcentajeAvanceCapital: 0.017, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9,
    };
    expect(creditSummaryDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("importResultUnionSchema", () => {
  it("discrimina por kind", () => {
    const coupon = { kind: "coupon", status: "imported", coupon: {
      id: "x", prestamoNro: "1", cuotaNro: 1, fechaDebito: "2025-08-18", capital: 1, intereses: 1,
      seguroIncendio: 1, totalDebitado: 1, cuotaPuraUva: 1, cotizacionUva: 1, capitalUva: 1, interesUva: 1,
      tea: 1, tna: 1, cft: 0 } };
    expect(importResultUnionSchema.parse(coupon).kind).toBe("coupon");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: FAIL — `mortgageCouponDtoSchema` is not exported.

- [ ] **Step 3: Implement** — append to `shared/src/types.ts`:

```ts
export interface ParsedCoupon {
  prestamoNro: string;
  cuotaNro: number;
  fechaDebito: string;
  capital: number;
  intereses: number;
  seguroIncendio: number;
  totalDebitado: number;
  cuotaPuraUva: number;
  cotizacionUva: number;
  tea: number;
  tna: number;
  cft: number;
}

export interface MortgageCouponParser {
  detect(text: string, meta: PdfMeta): boolean;
  parse(text: string, meta: PdfMeta): ParsedCoupon;
}
```

Then append to `shared/src/dtos.ts` (before the `export type` block at the bottom):

```ts
export const mortgageCouponDtoSchema = z.object({
  id: z.string(),
  prestamoNro: z.string(),
  cuotaNro: z.number().int().positive(),
  fechaDebito: z.string(),
  capital: z.number(),
  intereses: z.number(),
  seguroIncendio: z.number(),
  totalDebitado: z.number(),
  cuotaPuraUva: z.number(),
  cotizacionUva: z.number(),
  capitalUva: z.number(),
  interesUva: z.number(),
  tea: z.number(),
  tna: z.number(),
  cft: z.number(),
});

export const creditSummaryDtoSchema = z.object({
  prestamoNro: z.string(),
  cuotasPagadas: z.number().int(),
  cuotasTotales: z.number().int(),
  totalPagado: z.number(),
  capitalPagado: z.number(),
  interesPagado: z.number(),
  seguroPagado: z.number(),
  capitalOriginalUva: z.number(),
  capitalAmortizadoUva: z.number(),
  capitalPendienteUva: z.number(),
  capitalPendientePesos: z.number(),
  porcentajeAvanceCapital: z.number(),
  cotizacionUvaActual: z.number(),
  cuotaPuraUva: z.number(),
  tna: z.number(),
});

export const couponImportResultSchema = z.object({
  kind: z.literal("coupon"),
  status: z.enum(["imported", "duplicate"]),
  coupon: mortgageCouponDtoSchema,
});
export const statementImportResultSchema = z.object({
  kind: z.literal("statement"),
  status: z.enum(["imported", "duplicate"]),
  statement: statementDtoSchema,
  transactionCount: z.number(),
});
export const importResultUnionSchema = z.discriminatedUnion("kind", [
  couponImportResultSchema,
  statementImportResultSchema,
]);
```

And add the inferred types to the `export type` block at the bottom of `dtos.ts`:

```ts
export type MortgageCouponDTO = z.infer<typeof mortgageCouponDtoSchema>;
export type CreditSummaryDTO = z.infer<typeof creditSummaryDtoSchema>;
export type ImportResultUnionDTO = z.infer<typeof importResultUnionSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run shared/src/dtos.test.ts` → Expected: PASS (3 passed).

- [ ] **Step 5: Typecheck + commit**

```bash
bun run typecheck
git add shared/src/types.ts shared/src/dtos.ts shared/src/dtos.test.ts
git commit -m "feat(shared): add mortgage coupon and credit summary contracts"
```

---

### Task 2: `parseSlashDate` helper

**Files:**
- Modify: `server/src/parsers/normalize.ts`
- Test: `server/src/parsers/normalize.test.ts:1-11` (add to import) + append describe block

**Interfaces:**
- Produces: `parseSlashDate(raw: string): string` — `"17/06/2026"` → `"2026-06-17"`.

- [ ] **Step 1: Write the failing test** — in `server/src/parsers/normalize.test.ts`, add `parseSlashDate` to the import list on lines 2-11 (add `  parseSlashDate,` alongside the others), then append:

```ts
describe("parseSlashDate", () => {
  it("DD/MM/YYYY → ISO", () => {
    expect(parseSlashDate("17/06/2026")).toBe("2026-06-17");
    expect(parseSlashDate("18/08/2025")).toBe("2025-08-18");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/parsers/normalize.test.ts`
Expected: FAIL — `parseSlashDate` is not exported.

- [ ] **Step 3: Implement** — in `server/src/parsers/normalize.ts`, add after `parseVisaDate` (line 18):

```ts
export function parseSlashDate(raw: string): string {
  const [dd, mm, yyyy] = raw.trim().split("/");
  return `${yyyy}-${mm}-${dd}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/parsers/normalize.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/parsers/normalize.ts server/src/parsers/normalize.test.ts
git commit -m "feat(parsers): add DD/MM/YYYY date helper"
```

---

### Task 3: ICBC mortgage-coupon parser

**Files:**
- Create: `server/src/parsers/icbcMortgage.ts`
- Create: `server/src/parsers/__fixtures__/icbc-mortgage.sample.txt`
- Test: `server/src/parsers/icbcMortgage.test.ts` (create)

**Interfaces:**
- Consumes: `parseArAmount`, `parseSlashDate` (Task 2); `MortgageCouponParser`, `ParsedCoupon` (Task 1).
- Produces: `icbcMortgageParser: MortgageCouponParser`.

- [ ] **Step 1: Create the fixture** — `server/src/parsers/__fixtures__/icbc-mortgage.sample.txt`:

```
INFORME DE COBRO DE CUOTA PRESTAMO
De nuestra consideración:
Le informamos que el día hemos debitado de su cuenta la
cuota Nro. de su préstamo Nro. según el siguiente detalle:
Tasa Efectiva Anual (T.E.A.): %
Tasa Nominal Anual (T.N.A.): %
Costo Financiero Total (C.F.T.): %
SEBASTIAN MICHEL ANTHONY OPDERBECK
PASAJE BUDAPEST 01465
1431 - CABA
BUENOS AIRES
0873/01000429/48
HIPOTECARIO
18/08/2025
001 HIPOTECARIO 0405727408
CAPITAL $ 184.689,39
INTERESES $ 903.304,93
SEGURO INCENDIO $ 9.693,61
TOTAL DEBITADO $ 1.097.687,93
CUOTA PURA EN UVAS $ 699,60
0,00
9,27
8,90
Cotizac. UVAS al 17-08-2025 : $ 1.555,16
Industrial and Commercial Bank of China (Argentina) S.A.U.
ICBC Hola! www.icbc.com.ar
```

- [ ] **Step 2: Write the failing test** — `server/src/parsers/icbcMortgage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { icbcMortgageParser } from "./icbcMortgage.js";
import type { PdfMeta } from "@ledgerly/shared";

const text = readFileSync(fileURLToPath(new URL("./__fixtures__/icbc-mortgage.sample.txt", import.meta.url)), "utf8");
const meta: PdfMeta = { producer: null, creator: null, pageCount: 1, encrypted: false };

describe("icbcMortgageParser.detect", () => {
  it("detecta por el marker del cupón", () => {
    expect(icbcMortgageParser.detect(text, meta)).toBe(true);
    expect(icbcMortgageParser.detect("EXCLUSIVE ICBC CLUB SALDO ANTERIOR", meta)).toBe(false);
  });
});

describe("icbcMortgageParser.parse", () => {
  const c = icbcMortgageParser.parse(text, meta);
  it("extrae identificadores y fecha", () => {
    expect(c.prestamoNro).toBe("0405727408");
    expect(c.cuotaNro).toBe(1);
    expect(c.fechaDebito).toBe("2025-08-18");
  });
  it("extrae montos en pesos", () => {
    expect(c.capital).toBe(184689.39);
    expect(c.intereses).toBe(903304.93);
    expect(c.seguroIncendio).toBe(9693.61);
    expect(c.totalDebitado).toBe(1097687.93);
  });
  it("extrae UVA y tasas", () => {
    expect(c.cuotaPuraUva).toBe(699.6);
    expect(c.cotizacionUva).toBe(1555.16);
    expect(c.tna).toBe(8.9);
    expect(c.tea).toBe(9.27);
    expect(c.cft).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run server/src/parsers/icbcMortgage.test.ts`
Expected: FAIL — cannot find module `./icbcMortgage.js`.

- [ ] **Step 4: Implement** — `server/src/parsers/icbcMortgage.ts`:

```ts
import type { MortgageCouponParser, ParsedCoupon } from "@ledgerly/shared";
import { parseArAmount, parseSlashDate } from "./normalize.js";

const MARKER = "INFORME DE COBRO DE CUOTA PRESTAMO";
const CAPITAL = /CAPITAL\s+\$\s*([\d.]+,\d{2})/;
const INTERESES = /INTERESES\s+\$\s*([\d.]+,\d{2})/;
const SEGURO = /SEGURO INCENDIO\s+\$\s*([\d.]+,\d{2})/;
const TOTAL = /TOTAL DEBITADO\s+\$\s*([\d.]+,\d{2})/;
const CUOTA_UVA = /CUOTA PURA EN UVAS\s+\$\s*([\d.]+,\d{2})/;
const COTIZ = /Cotizac\.\s*UVAS al \d{2}-\d{2}-\d{4}\s*:\s*\$\s*([\d.]+,\d{2})/;
const CUOTA_PRESTAMO = /(\d{3})\s+HIPOTECARIO\s+(\d{6,})/;
const FECHA = /(\d{2}\/\d{2}\/\d{4})\s+\d{3}\s+HIPOTECARIO/;
const RATES = /CUOTA PURA EN UVAS\s+\$\s*[\d.]+,\d{2}\s+(\d+,\d{2})\s+(\d+,\d{2})\s+(\d+,\d{2})\s+Cotizac/;

function required(flat: string, re: RegExp, field: string): string {
  const m = flat.match(re);
  if (!m) throw new Error(`Cupón inválido: falta ${field}`);
  return m[1];
}

export const icbcMortgageParser: MortgageCouponParser = {
  detect(text) {
    return text.includes(MARKER);
  },

  parse(text): ParsedCoupon {
    const flat = text.replace(/\n+/g, " ");
    const cp = flat.match(CUOTA_PRESTAMO);
    if (!cp) throw new Error("Cupón inválido: falta cuota/préstamo");
    const fecha = flat.match(FECHA);
    if (!fecha) throw new Error("Cupón inválido: falta fecha de débito");
    const rates = flat.match(RATES);

    return {
      prestamoNro: cp[2],
      cuotaNro: Number(cp[1]),
      fechaDebito: parseSlashDate(fecha[1]),
      capital: parseArAmount(required(flat, CAPITAL, "capital")).amount,
      intereses: parseArAmount(required(flat, INTERESES, "intereses")).amount,
      seguroIncendio: parseArAmount(required(flat, SEGURO, "seguro")).amount,
      totalDebitado: parseArAmount(required(flat, TOTAL, "total")).amount,
      cuotaPuraUva: parseArAmount(required(flat, CUOTA_UVA, "cuota UVA")).amount,
      cotizacionUva: parseArAmount(required(flat, COTIZ, "cotización UVA")).amount,
      cft: rates ? parseArAmount(rates[1]).amount : 0,
      tea: rates ? parseArAmount(rates[2]).amount : 0,
      tna: rates ? parseArAmount(rates[3]).amount : 0,
    };
  },
};
```

- [ ] **Step 5: Run test to verify it passes + commit**

Run: `bunx vitest run server/src/parsers/icbcMortgage.test.ts` → Expected: PASS.

```bash
git add server/src/parsers/icbcMortgage.ts server/src/parsers/__fixtures__/icbc-mortgage.sample.txt server/src/parsers/icbcMortgage.test.ts
git commit -m "feat(parsers): add ICBC mortgage coupon parser"
```

---

### Task 4: Ingestion — `parseCoupon` + `detectDocumentKind`

**Files:**
- Modify: `server/src/ingestion/errors.ts`
- Create: `server/src/ingestion/parseCoupon.ts`
- Create: `server/src/ingestion/detectDocumentKind.ts`
- Test: `server/src/ingestion/detectDocumentKind.test.ts` (create)
- Test: `server/src/ingestion/parseCoupon.test.ts` (create)

**Interfaces:**
- Consumes: `icbcMortgageParser` (Task 3); `detectParser` (`../parsers/registry.js`); `extractPdfText` (`../pdf/extract.js`).
- Produces: `InvalidCouponError`; `parseCoupon(data): Promise<{ coupon: ParsedCoupon; meta: PdfMeta }>`; `detectDocumentKind(text, meta): "coupon" | "statement" | "unknown"` and type `DocumentKind`.

> **Why coupon-first:** the existing `icbcParser.detect` is just `text.includes("ICBC")`, and a coupon contains "ICBC". `detectDocumentKind` therefore checks the coupon marker BEFORE the statement registry, so coupons never fall through to the statement parser. The existing statement parser is left untouched.

- [ ] **Step 1: Write the failing tests**

`server/src/ingestion/detectDocumentKind.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectDocumentKind } from "./detectDocumentKind.js";
import type { PdfMeta } from "@ledgerly/shared";

const meta: PdfMeta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const coupon = read("../parsers/__fixtures__/icbc-mortgage.sample.txt");
const statement = read("../parsers/__fixtures__/icbc.sample.txt");

describe("detectDocumentKind", () => {
  it("clasifica un cupón (aunque contenga 'ICBC')", () => {
    expect(detectDocumentKind(coupon, meta)).toBe("coupon");
  });
  it("clasifica un extracto de tarjeta", () => {
    expect(detectDocumentKind(statement, meta)).toBe("statement");
  });
  it("devuelve unknown para texto ajeno", () => {
    expect(detectDocumentKind("texto de un documento cualquiera", meta)).toBe("unknown");
  });
});
```

`server/src/ingestion/parseCoupon.test.ts` (real PDF, cuota 1 = `08-2025-opderbeck.pdf`):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCoupon } from "./parseCoupon.js";

const pdf = readFileSync(fileURLToPath(new URL("../../../examples/credito/08-2025-opderbeck.pdf", import.meta.url)));

describe("parseCoupon", () => {
  it("extrae y parsea un cupón real", async () => {
    const { coupon } = await parseCoupon(new Uint8Array(pdf));
    expect(coupon.cuotaNro).toBe(1);
    expect(coupon.prestamoNro).toBe("0405727408");
    expect(coupon.capital).toBe(184689.39);
    expect(coupon.cotizacionUva).toBe(1555.16);
    expect(coupon.fechaDebito).toBe("2025-08-18");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run server/src/ingestion/detectDocumentKind.test.ts server/src/ingestion/parseCoupon.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Append to `server/src/ingestion/errors.ts`:

```ts
export class InvalidCouponError extends Error {
  constructor() {
    super("El cupón tiene un formato inesperado");
    this.name = "InvalidCouponError";
  }
}
```

`server/src/ingestion/parseCoupon.ts`:

```ts
import type { ParsedCoupon, PdfMeta } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { icbcMortgageParser } from "../parsers/icbcMortgage.js";
import { InvalidCouponError, NoTextError, UnsupportedFormatError } from "./errors.js";

export async function parseCoupon(data: Uint8Array): Promise<{ coupon: ParsedCoupon; meta: PdfMeta }> {
  const { text, meta } = await extractPdfText(data);
  if (text.trim().length < 20) throw new NoTextError();
  if (!icbcMortgageParser.detect(text, meta)) throw new UnsupportedFormatError();
  try {
    return { coupon: icbcMortgageParser.parse(text, meta), meta };
  } catch {
    throw new InvalidCouponError();
  }
}
```

`server/src/ingestion/detectDocumentKind.ts`:

```ts
import type { PdfMeta } from "@ledgerly/shared";
import { icbcMortgageParser } from "../parsers/icbcMortgage.js";
import { detectParser } from "../parsers/registry.js";

export type DocumentKind = "coupon" | "statement" | "unknown";

export function detectDocumentKind(text: string, meta: PdfMeta): DocumentKind {
  if (icbcMortgageParser.detect(text, meta)) return "coupon";
  if (detectParser(text, meta)) return "statement";
  return "unknown";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run server/src/ingestion/detectDocumentKind.test.ts server/src/ingestion/parseCoupon.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ingestion/errors.ts server/src/ingestion/parseCoupon.ts server/src/ingestion/detectDocumentKind.ts server/src/ingestion/detectDocumentKind.test.ts server/src/ingestion/parseCoupon.test.ts
git commit -m "feat(ingestion): coupon parsing and document-kind dispatch"
```

---

### Task 5: `MortgageCouponModel`

**Files:**
- Modify: `server/src/db/models.ts`
- Test: `server/src/db/models.test.ts` (append)

**Interfaces:**
- Produces: `MortgageCouponModel`, type `MortgageCouponDoc`. Unique compound index `{ prestamoNro, cuotaNro }`.

- [ ] **Step 1: Write the failing test** — append to `server/src/db/models.test.ts` (add `MortgageCouponModel` to the import on line 3):

```ts
describe("MortgageCoupon", () => {
  const base = {
    prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: new Date("2025-08-18"),
    capital: 184689.39, intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93,
    cuotaPuraUva: 699.6, cotizacionUva: 1555.16, tea: 9.27, tna: 8.9, cft: 0,
    sourceFileName: "08-2025.pdf", sourceHash: "h1",
  };

  it("persiste un cupón", async () => {
    const c = await MortgageCouponModel.create(base);
    expect(c._id).toBeDefined();
  });

  it("rechaza (prestamoNro, cuotaNro) duplicado", async () => {
    await MortgageCouponModel.init();
    await MortgageCouponModel.create(base);
    await expect(MortgageCouponModel.create({ ...base, sourceHash: "h2" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/db/models.test.ts`
Expected: FAIL — `MortgageCouponModel` is not exported.

- [ ] **Step 3: Implement** — in `server/src/db/models.ts`, add the schema before the `export type` block (line 57), the type with the other types, and the model with the other models:

```ts
const mortgageCouponSchema = new Schema(
  {
    prestamoNro: { type: String, required: true, index: true },
    cuotaNro: { type: Number, required: true },
    fechaDebito: { type: Date, required: true },
    capital: { type: Number, required: true },
    intereses: { type: Number, required: true },
    seguroIncendio: { type: Number, required: true },
    totalDebitado: { type: Number, required: true },
    cuotaPuraUva: { type: Number, required: true },
    cotizacionUva: { type: Number, required: true },
    tea: { type: Number, required: true },
    tna: { type: Number, required: true },
    cft: { type: Number, required: true },
    sourceFileName: { type: String, required: true },
    sourceHash: { type: String, required: true },
  },
  { timestamps: { createdAt: "uploadedAt", updatedAt: false } },
);
mortgageCouponSchema.index({ prestamoNro: 1, cuotaNro: 1 }, { unique: true });
```

```ts
export type MortgageCouponDoc = InferSchemaType<typeof mortgageCouponSchema>;
```

```ts
export const MortgageCouponModel: Model<MortgageCouponDoc> =
  mongoose.models.MortgageCoupon ?? mongoose.model("MortgageCoupon", mortgageCouponSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/db/models.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/models.ts server/src/db/models.test.ts
git commit -m "feat(db): add MortgageCoupon model with unique natural key"
```

---

### Task 6: `importCoupon` (dedupe by natural key)

**Files:**
- Create: `server/src/import/importCoupon.ts`
- Test: `server/src/import/importCoupon.test.ts` (create)

**Interfaces:**
- Consumes: `parseCoupon` (Task 4), `MortgageCouponModel` (Task 5).
- Produces: `importCoupon(input: { data: Uint8Array; fileName: string; replace?: boolean }): Promise<{ status: "imported" | "duplicate"; couponId: string }>`.

- [ ] **Step 1: Write the failing test** — `server/src/import/importCoupon.test.ts` (mocks `parseCoupon`, mirroring `statements.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";
import type { ParsedCoupon } from "@ledgerly/shared";

vi.mock("../ingestion/parseCoupon.js", () => ({ parseCoupon: vi.fn() }));
import { parseCoupon } from "../ingestion/parseCoupon.js";
import { importCoupon } from "./importCoupon.js";
import { MortgageCouponModel } from "../db/models.js";

withDb();
const mocked = vi.mocked(parseCoupon);

const coupon: ParsedCoupon = {
  prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18",
  capital: 184689.39, intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93,
  cuotaPuraUva: 699.6, cotizacionUva: 1555.16, tea: 9.27, tna: 8.9, cft: 0,
};

beforeEach(() => {
  mocked.mockResolvedValue({ coupon, meta: { producer: null, creator: null, pageCount: 1, encrypted: false } });
});

describe("importCoupon", () => {
  it("importa un cupón nuevo", async () => {
    const r = await importCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    expect(r.status).toBe("imported");
    expect(await MortgageCouponModel.countDocuments()).toBe(1);
  });

  it("deduplica por (prestamoNro, cuotaNro) aunque cambien los bytes", async () => {
    await importCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const r = await importCoupon({ data: new Uint8Array([2, 3]), fileName: "b.pdf" });
    expect(r.status).toBe("duplicate");
    expect(await MortgageCouponModel.countDocuments()).toBe(1);
  });

  it("replace reemplaza el cupón existente", async () => {
    await importCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const r = await importCoupon({ data: new Uint8Array([2]), fileName: "b.pdf", replace: true });
    expect(r.status).toBe("imported");
    expect(await MortgageCouponModel.countDocuments()).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/import/importCoupon.test.ts`
Expected: FAIL — cannot find module `./importCoupon.js`.

- [ ] **Step 3: Implement** — `server/src/import/importCoupon.ts`:

```ts
import { createHash } from "node:crypto";
import { parseCoupon } from "../ingestion/parseCoupon.js";
import { MortgageCouponModel } from "../db/models.js";

export async function importCoupon(input: {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
}): Promise<{ status: "imported" | "duplicate"; couponId: string }> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");
  const { coupon } = await parseCoupon(input.data);

  const existing = await MortgageCouponModel.findOne({
    prestamoNro: coupon.prestamoNro,
    cuotaNro: coupon.cuotaNro,
  });
  if (existing && !input.replace) return { status: "duplicate", couponId: existing._id.toString() };
  if (existing && input.replace) await MortgageCouponModel.deleteOne({ _id: existing._id });

  const created = await MortgageCouponModel.create({
    prestamoNro: coupon.prestamoNro,
    cuotaNro: coupon.cuotaNro,
    fechaDebito: new Date(coupon.fechaDebito),
    capital: coupon.capital,
    intereses: coupon.intereses,
    seguroIncendio: coupon.seguroIncendio,
    totalDebitado: coupon.totalDebitado,
    cuotaPuraUva: coupon.cuotaPuraUva,
    cotizacionUva: coupon.cotizacionUva,
    tea: coupon.tea,
    tna: coupon.tna,
    cft: coupon.cft,
    sourceFileName: input.fileName,
    sourceHash,
  });
  return { status: "imported", couponId: created._id.toString() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/import/importCoupon.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/import/importCoupon.ts server/src/import/importCoupon.test.ts
git commit -m "feat(import): import mortgage coupons with natural-key dedupe"
```

---

### Task 7: Amortization progress + shared coupon fixture

**Files:**
- Create: `server/src/testing/couponFixtures.ts`
- Create: `server/src/stats/amortization.ts`
- Test: `server/src/stats/amortization.test.ts` (create)

**Interfaces:**
- Consumes: `CreditSummaryDTO` (Task 1).
- Produces: `RAW_COUPONS` (11 real coupons); `CouponInput` interface; `computeCreditProgress(coupons: CouponInput[]): CreditSummaryDTO | null`.

- [ ] **Step 1: Create the shared fixture** — `server/src/testing/couponFixtures.ts` (exact values extracted from the 11 real PDFs):

```ts
export interface RawCoupon {
  prestamoNro: string;
  cuotaNro: number;
  fechaDebito: string;
  capital: number;
  intereses: number;
  seguroIncendio: number;
  totalDebitado: number;
  cuotaPuraUva: number;
  cotizacionUva: number;
  tea: number;
  tna: number;
  cft: number;
}

export const RAW_COUPONS: RawCoupon[] = [
  { prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18", capital: 184689.39, intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93, cuotaPuraUva: 699.6, cotizacionUva: 1555.16, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 2, fechaDebito: "2025-09-18", capital: 189809.87, intereses: 920117.0, seguroIncendio: 9693.61, totalDebitado: 1119620.48, cuotaPuraUva: 699.6, cotizacionUva: 1586.51, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 3, fechaDebito: "2025-10-17", capital: 194859.95, intereses: 936208.92, seguroIncendio: 9693.61, totalDebitado: 1140762.48, cuotaPuraUva: 699.6, cotizacionUva: 1616.73, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 4, fechaDebito: "2025-11-17", capital: 200157.84, intereses: 953109.43, seguroIncendio: 10644.97, totalDebitado: 1163912.24, cuotaPuraUva: 699.6, cotizacionUva: 1648.46, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 5, fechaDebito: "2025-12-17", capital: 206584.13, intereses: 974947.1, seguroIncendio: 10644.97, totalDebitado: 1192176.2, cuotaPuraUva: 699.6, cotizacionUva: 1688.86, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 6, fechaDebito: "2026-01-19", capital: 213338.71, intereses: 997841.68, seguroIncendio: 10644.97, totalDebitado: 1221825.36, cuotaPuraUva: 699.6, cotizacionUva: 1731.24, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 7, fechaDebito: "2026-02-18", capital: 220348.49, intereses: 1021418.54, seguroIncendio: 10644.97, totalDebitado: 1252412.0, cuotaPuraUva: 699.6, cotizacionUva: 1774.96, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 8, fechaDebito: "2026-03-17", capital: 229038.81, intereses: 1052199.81, seguroIncendio: 10644.97, totalDebitado: 1291883.59, cuotaPuraUva: 699.6, cotizacionUva: 1831.38, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 9, fechaDebito: "2026-04-17", capital: 237475.5, intereses: 1081177.88, seguroIncendio: 11858.6, totalDebitado: 1330511.98, cuotaPuraUva: 699.6, cotizacionUva: 1884.86, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 10, fechaDebito: "2026-05-18", capital: 247094.71, intereses: 1114871.08, seguroIncendio: 11858.6, totalDebitado: 1373824.39, cuotaPuraUva: 699.6, cotizacionUva: 1946.77, tea: 9.27, tna: 8.9, cft: 0 },
  { prestamoNro: "0405727408", cuotaNro: 11, fechaDebito: "2026-06-17", capital: 255576.38, intereses: 1142768.75, seguroIncendio: 11858.6, totalDebitado: 1410203.73, cuotaPuraUva: 699.6, cotizacionUva: 1998.77, tea: 9.27, tna: 8.9, cft: 0 },
];
```

- [ ] **Step 2: Write the failing test** — `server/src/stats/amortization.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeCreditProgress } from "./amortization.js";
import { RAW_COUPONS } from "../testing/couponFixtures.js";

const inputs = RAW_COUPONS.map((c) => ({
  prestamoNro: c.prestamoNro, cuotaNro: c.cuotaNro, capital: c.capital, intereses: c.intereses,
  seguroIncendio: c.seguroIncendio, totalDebitado: c.totalDebitado, cuotaPuraUva: c.cuotaPuraUva,
  cotizacionUva: c.cotizacionUva, tna: c.tna,
}));

describe("computeCreditProgress", () => {
  it("devuelve null sin cupones", () => {
    expect(computeCreditProgress([])).toBeNull();
  });

  it("deriva el avance con los 11 cupones reales", () => {
    const r = computeCreditProgress(inputs)!;
    expect(r.cuotasPagadas).toBe(11);
    expect(r.cuotasTotales).toBe(240);
    expect(r.capitalOriginalUva).toBeCloseTo(78316.73, 0);
    expect(r.capitalPendienteUva).toBeCloseTo(76960.84, 0);
    expect(r.capitalAmortizadoUva).toBeCloseTo(1355.89, 0);
    expect(r.porcentajeAvanceCapital).toBeCloseTo(0.0173, 3);
    expect(r.totalPagado).toBeCloseTo(13594820.38, 1);
    expect(r.interesPagado).toBeCloseTo(11097965.12, 1);
    expect(r.seguroPagado).toBeCloseTo(117881.48, 1);
    expect(r.cotizacionUvaActual).toBe(1998.77);
  });

  it("usa la TNA como fallback con un solo cupón", () => {
    const r = computeCreditProgress([inputs[0]])!;
    expect(r.cuotasPagadas).toBe(1);
    expect(r.cuotasTotales).toBe(240);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bunx vitest run server/src/stats/amortization.test.ts`
Expected: FAIL — cannot find module `./amortization.js`.

- [ ] **Step 4: Implement** — `server/src/stats/amortization.ts`:

```ts
import type { CreditSummaryDTO } from "@ledgerly/shared";

export interface CouponInput {
  prestamoNro: string;
  cuotaNro: number;
  capital: number;
  intereses: number;
  seguroIncendio: number;
  totalDebitado: number;
  cuotaPuraUva: number;
  cotizacionUva: number;
  tna: number;
}

export function computeCreditProgress(coupons: CouponInput[]): CreditSummaryDTO | null {
  if (coupons.length === 0) return null;

  const sorted = [...coupons].sort((a, b) => a.cuotaNro - b.cuotaNro);
  const withUva = sorted.map((c) => ({
    ...c,
    capitalUva: c.capital / c.cotizacionUva,
    interesUva: c.intereses / c.cotizacionUva,
  }));
  const first = withUva[0];
  const last = withUva[withUva.length - 1];

  let i = last.tna / 12 / 100;
  if (withUva.length >= 2 && last.cuotaNro !== first.cuotaNro) {
    const growth = last.capitalUva / first.capitalUva;
    const derived = growth ** (1 / (last.cuotaNro - first.cuotaNro)) - 1;
    if (derived > 0) i = derived;
  }

  const capitalPendienteUva = last.interesUva / i - last.capitalUva;
  const capitalAmortizadoUva = withUva.reduce((sum, c) => sum + c.capitalUva, 0);
  const capitalOriginalUva = capitalPendienteUva + capitalAmortizadoUva;
  const porcentajeAvanceCapital = capitalOriginalUva > 0 ? capitalAmortizadoUva / capitalOriginalUva : 0;

  const P = last.cuotaPuraUva;
  const ratio = 1 - (capitalOriginalUva * i) / P;
  const cuotasTotales = ratio > 0 ? Math.round(Math.log(ratio) / Math.log(1 / (1 + i))) : last.cuotaNro;

  const sum = (pick: (c: CouponInput) => number) => sorted.reduce((acc, c) => acc + pick(c), 0);

  return {
    prestamoNro: last.prestamoNro,
    cuotasPagadas: last.cuotaNro,
    cuotasTotales,
    totalPagado: sum((c) => c.totalDebitado),
    capitalPagado: sum((c) => c.capital),
    interesPagado: sum((c) => c.intereses),
    seguroPagado: sum((c) => c.seguroIncendio),
    capitalOriginalUva,
    capitalAmortizadoUva,
    capitalPendienteUva,
    capitalPendientePesos: capitalPendienteUva * last.cotizacionUva,
    porcentajeAvanceCapital,
    cotizacionUvaActual: last.cotizacionUva,
    cuotaPuraUva: P,
    tna: last.tna,
  };
}
```

- [ ] **Step 5: Run test to verify it passes + commit**

Run: `bunx vitest run server/src/stats/amortization.test.ts` → Expected: PASS.

```bash
git add server/src/testing/couponFixtures.ts server/src/stats/amortization.ts server/src/stats/amortization.test.ts
git commit -m "feat(stats): derive UVA mortgage amortization progress"
```

---

### Task 8: Mapper + credits router (`GET /coupons`, `GET /summary`)

**Files:**
- Modify: `server/src/http/mappers.ts`
- Create: `server/src/http/routes/credits.ts`
- Modify: `server/src/http/app.ts`
- Test: `server/src/http/routes/credits.test.ts` (create)

**Interfaces:**
- Consumes: `MortgageCouponModel` (Task 5), `computeCreditProgress`+`CouponInput` (Task 7), `MortgageCouponDTO` (Task 1).
- Produces: `toMortgageCouponDTO(doc)`; `creditsRouter` mounted at `/api/credits`.

- [ ] **Step 1: Write the failing test** — `server/src/http/routes/credits.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { MortgageCouponModel } from "../../db/models.js";
import { RAW_COUPONS } from "../../testing/couponFixtures.js";

withDb();
const app = createApp();

beforeEach(async () => {
  await MortgageCouponModel.insertMany(
    RAW_COUPONS.map((c) => ({ ...c, fechaDebito: new Date(c.fechaDebito), sourceFileName: `${c.cuotaNro}.pdf`, sourceHash: `h${c.cuotaNro}` })),
  );
});

describe("GET /api/credits/coupons", () => {
  it("lista los cupones ordenados con UVA derivada", async () => {
    const res = await request(app).get("/api/credits/coupons");
    expect(res.body).toHaveLength(11);
    expect(res.body[0].cuotaNro).toBe(1);
    expect(res.body[0].capitalUva).toBeCloseTo(118.76, 1);
  });
});

describe("GET /api/credits/summary", () => {
  it("devuelve el avance derivado", async () => {
    const res = await request(app).get("/api/credits/summary");
    expect(res.body.cuotasPagadas).toBe(11);
    expect(res.body.cuotasTotales).toBe(240);
    expect(res.body.capitalPendienteUva).toBeCloseTo(76960.84, 0);
  });

  it("devuelve 204 sin cupones", async () => {
    await MortgageCouponModel.deleteMany({});
    const res = await request(app).get("/api/credits/summary");
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/credits.test.ts`
Expected: FAIL — cannot find module `./credits.js` (mounted route 404).

- [ ] **Step 3: Implement**

Append to `server/src/http/mappers.ts` (add `MortgageCouponDTO` to the shared import on line 1 and `MortgageCouponDoc` to the models import on line 2):

```ts
export function toMortgageCouponDTO(doc: HydratedDocument<MortgageCouponDoc>): MortgageCouponDTO {
  return {
    id: doc._id.toString(),
    prestamoNro: doc.prestamoNro,
    cuotaNro: doc.cuotaNro,
    fechaDebito: doc.fechaDebito.toISOString().slice(0, 10),
    capital: doc.capital,
    intereses: doc.intereses,
    seguroIncendio: doc.seguroIncendio,
    totalDebitado: doc.totalDebitado,
    cuotaPuraUva: doc.cuotaPuraUva,
    cotizacionUva: doc.cotizacionUva,
    capitalUva: doc.capital / doc.cotizacionUva,
    interesUva: doc.intereses / doc.cotizacionUva,
    tea: doc.tea,
    tna: doc.tna,
    cft: doc.cft,
  };
}
```

`server/src/http/routes/credits.ts`:

```ts
import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { MortgageCouponModel } from "../../db/models.js";
import { toMortgageCouponDTO } from "../mappers.js";
import { computeCreditProgress } from "../../stats/amortization.js";

export const creditsRouter = Router();

creditsRouter.get("/coupons", asyncHandler(async (_req, res) => {
  const docs = await MortgageCouponModel.find().sort({ cuotaNro: 1 });
  res.json(docs.map(toMortgageCouponDTO));
}));

creditsRouter.get("/summary", asyncHandler(async (_req, res) => {
  const docs = await MortgageCouponModel.find().sort({ cuotaNro: 1 }).lean();
  const progress = computeCreditProgress(
    docs.map((c) => ({
      prestamoNro: c.prestamoNro, cuotaNro: c.cuotaNro, capital: c.capital, intereses: c.intereses,
      seguroIncendio: c.seguroIncendio, totalDebitado: c.totalDebitado, cuotaPuraUva: c.cuotaPuraUva,
      cotizacionUva: c.cotizacionUva, tna: c.tna,
    })),
  );
  if (!progress) {
    res.status(204).end();
    return;
  }
  res.json(progress);
}));
```

In `server/src/http/app.ts`: add the import (with the other route imports, lines 4-7) and mount it (after the `/api/stats` line, line 20):

```ts
import { creditsRouter } from "./routes/credits.js";
```
```ts
  app.use("/api/credits", creditsRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/routes/credits.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/http/mappers.ts server/src/http/routes/credits.ts server/src/http/app.ts server/src/http/routes/credits.test.ts
git commit -m "feat(api): credits router with coupons list and amortization summary"
```

---

### Task 9: Unified import endpoint (`POST /api/import`)

**Files:**
- Create: `server/src/http/routes/import.ts`
- Modify: `server/src/http/app.ts`
- Test: `server/src/http/routes/import.test.ts` (create)

**Interfaces:**
- Consumes: `extractPdfText`, `detectDocumentKind` (Task 4), `importCoupon` (Task 6), `importStatement`, mappers, ingestion errors.
- Produces: `importRouter` mounted at `/api/import`; responses shaped as `ImportResultUnionDTO` (201 new / 200 duplicate; 400 no file; 422 unknown/parse error).

- [ ] **Step 1: Write the failing test** — `server/src/http/routes/import.test.ts` (mocks only `extractPdfText`; the rest of the pipeline — detect, both importers, mappers, DB — runs for real against `withDb`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";

vi.mock("../../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
import { extractPdfText } from "../../pdf/extract.js";
import { createApp } from "../app.js";

withDb();
const app = createApp();
const mocked = vi.mocked(extractPdfText);
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const couponText = read("../../parsers/__fixtures__/icbc-mortgage.sample.txt");
const statementText = read("../../parsers/__fixtures__/icbc.sample.txt");

describe("POST /api/import", () => {
  it("importa un cupón (kind coupon, 201)", async () => {
    mocked.mockResolvedValue({ text: couponText, meta });
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "c.pdf");
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("coupon");
    expect(res.body.coupon.cuotaNro).toBe(1);
  });

  it("reimportar el mismo cupón devuelve duplicate (200)", async () => {
    mocked.mockResolvedValue({ text: couponText, meta });
    await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "c.pdf");
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "c.pdf");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("duplicate");
  });

  it("importa un extracto (kind statement, 201)", async () => {
    mocked.mockResolvedValue({ text: statementText, meta });
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "s.pdf");
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("statement");
    expect(res.body.transactionCount).toBeGreaterThan(0);
  });

  it("documento no reconocido → 422", async () => {
    mocked.mockResolvedValue({ text: "documento cualquiera sin marcadores conocidos", meta });
    const res = await request(app).post("/api/import").attach("file", Buffer.from("pdf"), "x.pdf");
    expect(res.status).toBe(422);
  });

  it("sin archivo → 400", async () => {
    const res = await request(app).post("/api/import");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/import.test.ts`
Expected: FAIL — route not mounted (404s).

- [ ] **Step 3: Implement** — `server/src/http/routes/import.ts`:

```ts
import { Router } from "express";
import multer from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { extractPdfText } from "../../pdf/extract.js";
import { detectDocumentKind } from "../../ingestion/detectDocumentKind.js";
import { importCoupon } from "../../import/importCoupon.js";
import { importStatement } from "../../import/importStatement.js";
import { MortgageCouponModel, StatementModel } from "../../db/models.js";
import { toMortgageCouponDTO, toStatementDTO } from "../mappers.js";
import {
  InvalidCouponError, NoTextError, NoTransactionsError, UnsupportedFormatError,
} from "../../ingestion/errors.js";

const upload = multer({ storage: multer.memoryStorage() });
export const importRouter = Router();

importRouter.post("/", upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Falta el archivo (campo 'file')");
  const replace = req.query.replace === "true";
  try {
    const { text, meta } = await extractPdfText(req.file.buffer);
    if (text.trim().length < 20) throw new NoTextError();
    const kind = detectDocumentKind(text, meta);

    if (kind === "coupon") {
      const result = await importCoupon({ data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await MortgageCouponModel.findById(result.couponId);
      res.status(result.status === "duplicate" ? 200 : 201)
        .json({ kind: "coupon", status: result.status, coupon: toMortgageCouponDTO(doc!) });
      return;
    }
    if (kind === "statement") {
      const result = await importStatement({ data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await StatementModel.findById(result.statementId);
      res.status(result.status === "duplicate" ? 200 : 201).json({
        kind: "statement", status: result.status,
        statement: toStatementDTO(doc!, result.transactionCount), transactionCount: result.transactionCount,
      });
      return;
    }
    throw new UnsupportedFormatError();
  } catch (err) {
    if (err instanceof NoTextError || err instanceof UnsupportedFormatError
      || err instanceof NoTransactionsError || err instanceof InvalidCouponError) {
      throw new HttpError(422, err.message);
    }
    throw err;
  }
}));
```

In `server/src/http/app.ts`: add the import and mount at `/api/import`:

```ts
import { importRouter } from "./routes/import.js";
```
```ts
  app.use("/api/import", importRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/routes/import.test.ts` → Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/import.ts server/src/http/app.ts server/src/http/routes/import.test.ts
git commit -m "feat(api): unified import endpoint dispatching coupon vs statement"
```

---

### Task 10: Seed script (precarga de los 11 cupones)

**Files:**
- Create: `server/src/import/seedCoupons.ts`
- Modify: `package.json` (add `seed:coupons` script)
- Test: `server/src/import/seedCoupons.test.ts` (create)

**Interfaces:**
- Consumes: `importCoupon` (Task 6).
- Produces: `seedCoupons(dir: string): Promise<{ imported: number; duplicates: number }>`.

- [ ] **Step 1: Write the failing test** — `server/src/import/seedCoupons.test.ts` (real PDFs, real pipeline):

```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";
import { seedCoupons } from "./seedCoupons.js";
import { MortgageCouponModel } from "../db/models.js";

const dir = fileURLToPath(new URL("../../../examples/credito/", import.meta.url));

withDb();

describe("seedCoupons", () => {
  it("importa los 11 cupones de ejemplo", async () => {
    const r = await seedCoupons(dir);
    expect(r.imported).toBe(11);
    expect(await MortgageCouponModel.countDocuments()).toBe(11);
  }, 30000);

  it("es idempotente (segunda corrida = duplicados)", async () => {
    await seedCoupons(dir);
    const r = await seedCoupons(dir);
    expect(r.duplicates).toBe(11);
    expect(await MortgageCouponModel.countDocuments()).toBe(11);
  }, 30000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/import/seedCoupons.test.ts`
Expected: FAIL — cannot find module `./seedCoupons.js`.

- [ ] **Step 3: Implement** — `server/src/import/seedCoupons.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { importCoupon } from "./importCoupon.js";

export async function seedCoupons(dir: string): Promise<{ imported: number; duplicates: number }> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
  let imported = 0;
  let duplicates = 0;
  for (const file of files) {
    const data = new Uint8Array(readFileSync(`${dir}${file}`));
    const result = await importCoupon({ data, fileName: file });
    if (result.status === "imported") imported += 1;
    else duplicates += 1;
  }
  return { imported, duplicates };
}

if (import.meta.main) {
  const dir = fileURLToPath(new URL("../../../examples/credito/", import.meta.url));
  await mongoose.connect(process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly");
  const result = await seedCoupons(dir);
  console.log(`Cupones: ${result.imported} importados, ${result.duplicates} duplicados`);
  await mongoose.disconnect();
}
```

In `package.json`, add to `scripts` (after the `seed` line):

```json
    "seed:coupons": "tsx server/src/import/seedCoupons.ts",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/import/seedCoupons.test.ts` → Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add server/src/import/seedCoupons.ts server/src/import/seedCoupons.test.ts package.json
git commit -m "feat(import): seed script for example mortgage coupons"
```

---

### Task 11: `formatUva` helper (client)

**Files:**
- Modify: `client/src/format.ts`
- Test: `client/src/format.test.ts` (create)

**Interfaces:**
- Produces: `formatUva(value: number): string` — `76960.84` → `"76.960,84 UVA"`.

- [ ] **Step 1: Write the failing test** — `client/src/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatUva } from "./format.js";

describe("formatUva", () => {
  it("usa separadores es-AR y sufijo UVA", () => {
    expect(formatUva(76960.84)).toBe("76.960,84 UVA");
    expect(formatUva(699.6)).toBe("699,60 UVA");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/format.test.ts`
Expected: FAIL — `formatUva` is not exported.

- [ ] **Step 3: Implement** — append to `client/src/format.ts`:

```ts
export function formatUva(value: number): string {
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} UVA`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/format.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/format.ts client/src/format.test.ts
git commit -m "feat(client): add UVA number formatter"
```

---

### Task 12: Client data layer — credit hooks + unified upload

**Files:**
- Modify: `client/src/api/hooks.ts`
- Modify: `client/src/pages/ImportPage.tsx`
- Modify: `client/src/pages/ImportPage.test.tsx`

**Interfaces:**
- Consumes: `MortgageCouponDTO`, `CreditSummaryDTO`, `ImportResultUnionDTO` (Task 1).
- Produces: `useCreditCoupons()`, `useCreditSummary()`, `useImportFile()` (replaces `useUploadStatement`).

- [ ] **Step 1: Update the test first** — replace the body of `client/src/pages/ImportPage.test.tsx` `beforeEach` and the two upload tests so the POST goes to `/import` and returns the discriminated union. Replace lines 12-14 with:

```ts
beforeEach(() => {
  mockFetch((url) => (url.includes("/statements") ? [] : {}));
});
```

Replace the `"sube un archivo y muestra el resultado"` test's mock (lines 25-31) with:

```ts
    mockFetch((url, init) => {
      if (url.includes("/import") && init?.method === "POST") {
        return { kind: "statement", status: "imported", transactionCount: 3,
          statement: { reconciliation: { ok: true, entries: [] } } };
      }
      return [];
    });
```

Replace the `"permite reemplazar..."` test's mock (lines 40-49) with:

```ts
    mockFetch((url, init) => {
      if (url.includes("/import") && init?.method === "POST") {
        if (url.includes("replace=true")) {
          replaceCalled = true;
          return { kind: "statement", status: "imported", transactionCount: 5,
            statement: { reconciliation: { ok: true, entries: [] } } };
        }
        return { kind: "statement", status: "duplicate", transactionCount: 0,
          statement: { reconciliation: { ok: true, entries: [] } } };
      }
      return [];
    });
```

Add a new coupon test at the end of the `describe` block (before the closing `});`):

```ts
  it("muestra el resultado de un cupón de crédito", async () => {
    mockFetch((url, init) => {
      if (url.includes("/import") && init?.method === "POST") {
        return { kind: "coupon", status: "imported", coupon: { cuotaNro: 7 } };
      }
      return [];
    });
    renderWithProviders(<ImportPage />);
    const input = document.querySelector('input[type="file"]')!;
    await userEvent.upload(input as HTMLInputElement, new File(["x"], "c.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(screen.getByText(/cuota 7 del crédito/i)).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/ImportPage.test.tsx`
Expected: FAIL — `useImportFile`/coupon rendering not implemented (POST still hits `/statements`).

- [ ] **Step 3: Implement**

In `client/src/api/hooks.ts`: update the shared import (lines 2-5) to add `CreditSummaryDTO`, `MortgageCouponDTO`, `ImportResultUnionDTO` and remove `ImportResultDTO`. Replace `useUploadStatement` (lines 31-41) with:

```ts
export function useImportFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, replace }: { file: File; replace?: boolean }) => {
      const form = new FormData();
      form.append("file", file);
      return apiFetch<ImportResultUnionDTO>(`/import${replace ? "?replace=true" : ""}`, { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

Append the two query hooks at the end of `client/src/api/hooks.ts`:

```ts
export function useCreditCoupons() {
  return useQuery({ queryKey: ["credit-coupons"], queryFn: () => apiFetch<MortgageCouponDTO[]>("/credits/coupons") });
}
export function useCreditSummary() {
  return useQuery({ queryKey: ["credit-summary"], queryFn: () => apiFetch<CreditSummaryDTO>("/credits/summary") });
}
```

Replace `client/src/pages/ImportPage.tsx` entirely:

```tsx
import { useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import type { ImportResultUnionDTO } from "@ledgerly/shared";
import { useDeleteStatement, useStatements, useImportFile } from "../api/hooks.js";
import { FileDropzone } from "../components/FileDropzone.js";
import { ReconciliationBanner } from "../components/ReconciliationBanner.js";
import { StatementList } from "../components/StatementList.js";

export const ImportPage = () => {
  const upload = useImportFile();
  const del = useDeleteStatement();
  const statements = useStatements();
  const [last, setLast] = useState<ImportResultUnionDTO | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const handleFile = (file: File) => {
    setLastFile(file);
    upload.mutate({ file }, { onSuccess: setLast });
  };

  const handleReplace = () => {
    if (lastFile) upload.mutate({ file: lastFile, replace: true }, { onSuccess: setLast });
  };

  const replaceAction = (
    <Button color="inherit" size="small" onClick={handleReplace} disabled={upload.isPending}>
      Reemplazar
    </Button>
  );

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Importar resumen</Typography>
      <FileDropzone onFile={handleFile} disabled={upload.isPending} />

      {upload.isPending && <Box sx={{ display: "flex", gap: 1, mb: 2 }}><CircularProgress size={20} /> Procesando…</Box>}
      {upload.isError && <Alert severity="error" sx={{ mb: 2 }}>{upload.error.message}</Alert>}

      {last && last.kind === "statement" && (
        <>
          <Alert
            severity={last.status === "duplicate" ? "info" : "success"}
            sx={{ mb: 2 }}
            action={last.status === "duplicate" ? replaceAction : undefined}
          >
            {last.status === "duplicate" ? "Ya estaba importado" : `Importado: ${last.transactionCount} movimientos`}
          </Alert>
          <ReconciliationBanner reconciliation={last.statement.reconciliation} />
        </>
      )}

      {last && last.kind === "coupon" && (
        <Alert
          severity={last.status === "duplicate" ? "info" : "success"}
          sx={{ mb: 2 }}
          action={last.status === "duplicate" ? replaceAction : undefined}
        >
          {last.status === "duplicate"
            ? "Ese cupón ya estaba importado"
            : `Importado: cuota ${last.coupon.cuotaNro} del crédito`}
        </Alert>
      )}

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Resúmenes importados</Typography>
      {statements.data && <StatementList statements={statements.data} onDelete={(id) => del.mutate(id)} />}
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/ImportPage.test.tsx` → Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add client/src/api/hooks.ts client/src/pages/ImportPage.tsx client/src/pages/ImportPage.test.tsx
git commit -m "feat(client): credit hooks and unified file import"
```

---

### Task 13: Credit presentational components (KPIs, charts, table)

**Files:**
- Create: `client/src/components/CreditKpiCards.tsx`
- Create: `client/src/components/MortgageCouponsTable.tsx`
- Create: `client/src/components/charts/CapitalVsInterestChart.tsx`
- Create: `client/src/components/charts/TotalPaidByMonthChart.tsx`
- Create: `client/src/components/charts/UvaEvolutionChart.tsx`
- Create: `client/src/components/charts/AmortizationDonutChart.tsx`

**Interfaces:**
- Consumes: `useCreditCoupons`, `useCreditSummary` (Task 12); `formatMoney`, `formatMoneyCompact`, `formatUva` (Task 11); `nivoTheme`, `seriesColor`, `categoricalPalette`; `ChartCard`, `MotionBox`, `MotionTableBody`, `MotionTableRow`, `CountUp`, variants.
- Produces: `CreditKpiCards`, `MortgageCouponsTable`, `CapitalVsInterestChart`, `TotalPaidByMonthChart`, `UvaEvolutionChart`, `AmortizationDonutChart` (all rendered/verified by Task 14's page test).

> These components are exercised by the `CreditsPage.test.tsx` in Task 14; here we verify via typecheck. Follow every chart invariant from the existing charts: props object, `useTheme()`, empty guard returning a `text.secondary` `<Typography>`, `<Box sx={{ height: 260 }}>`, `theme={nivoTheme(theme)}`, `motionConfig="gentle"`.

- [ ] **Step 1: Implement `CreditKpiCards`** — `client/src/components/CreditKpiCards.tsx`:

```tsx
import type { ReactNode } from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import DonutLargeIcon from "@mui/icons-material/DonutLarge";
import { useCreditSummary } from "../api/hooks.js";
import { formatMoney, formatUva } from "../format.js";
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
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
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

export const CreditKpiCards = () => {
  const { data } = useCreditSummary();
  if (!data) return null;

  const money = (value: number) => formatMoney(value, "ARS");
  const percent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}
    >
      <Kpi label="Total pagado" value={data.totalPagado} format={money} sub={`en ${data.cuotasPagadas} cuotas`} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Capital pendiente" value={data.capitalPendienteUva} format={formatUva} sub={`≈ ${money(data.capitalPendientePesos)}`} icon={<AccountBalanceIcon />} color="secondary" />
      <Kpi label="Interés pagado" value={data.interesPagado} format={money} icon={<TrendingUpIcon />} color="warning" />
      <Kpi label="Avance" value={data.porcentajeAvanceCapital * 100} format={percent} sub={`${data.cuotasPagadas}/${data.cuotasTotales} cuotas`} icon={<DonutLargeIcon />} color="success" />
    </MotionBox>
  );
};
```

- [ ] **Step 2: Implement the four charts**

`client/src/components/charts/CapitalVsInterestChart.tsx`:

```tsx
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useCreditCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const CapitalVsInterestChart = () => {
  const theme = useTheme();
  const { data } = useCreditCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = [...data]
    .sort((a, b) => a.cuotaNro - b.cuotaNro)
    .map((c) => ({ month: c.fechaDebito.slice(0, 7), capital: c.capital, interes: c.intereses }));
  const colors = [seriesColor(theme.palette.mode, 2), seriesColor(theme.palette.mode, 5)];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={["capital", "interes"]}
        indexBy="month"
        colors={colors}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        padding={0.35}
        borderRadius={4}
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

`client/src/components/charts/TotalPaidByMonthChart.tsx`:

```tsx
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useCreditCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const TotalPaidByMonthChart = () => {
  const theme = useTheme();
  const { data } = useCreditCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = [...data]
    .sort((a, b) => a.cuotaNro - b.cuotaNro)
    .map((c) => ({ month: c.fechaDebito.slice(0, 7), total: c.totalDebitado }));
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

`client/src/components/charts/UvaEvolutionChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import { useCreditCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const UvaEvolutionChart = () => {
  const theme = useTheme();
  const { data } = useCreditCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const points = [...data]
    .sort((a, b) => a.cuotaNro - b.cuotaNro)
    .map((c) => ({ x: c.fechaDebito.slice(0, 7), y: c.cotizacionUva }));
  const color = seriesColor(theme.palette.mode, 4);
  const series = [{ id: "Cotización UVA", data: points }];

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
        defs={[linearGradientDef("uvaArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "uvaArea" }]}
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

`client/src/components/charts/AmortizationDonutChart.tsx`:

```tsx
import { ResponsivePie } from "@nivo/pie";
import { Box, Typography, useTheme } from "@mui/material";
import { useCreditSummary } from "../../api/hooks.js";
import { formatUva } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const AmortizationDonutChart = () => {
  const theme = useTheme();
  const { data } = useCreditSummary();
  if (!data) return <Typography color="text.secondary">Sin datos</Typography>;

  const chartData = [
    { id: "Amortizado", label: "Amortizado", value: data.capitalAmortizadoUva },
    { id: "Pendiente", label: "Pendiente", value: data.capitalPendienteUva },
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
        valueFormat={(value) => formatUva(value)}
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

- [ ] **Step 3: Implement `MortgageCouponsTable`** — `client/src/components/MortgageCouponsTable.tsx`:

```tsx
import { Table, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { useCreditCoupons } from "../api/hooks.js";
import { formatMoney, formatUva } from "../format.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

export const MortgageCouponsTable = () => {
  const { data } = useCreditCoupons();
  if (!data || data.length === 0) return null;

  const rows = [...data].sort((a, b) => a.cuotaNro - b.cuotaNro);

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Cuota</TableCell>
            <TableCell>Fecha</TableCell>
            <TableCell align="right">Capital</TableCell>
            <TableCell align="right">Interés</TableCell>
            <TableCell align="right">Seguro</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell align="right">Cuota (UVA)</TableCell>
            <TableCell align="right">Cotización</TableCell>
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows.map((c) => (
            <MotionTableRow key={c.id} variants={fadeUpItem}>
              <TableCell>{c.cuotaNro}</TableCell>
              <TableCell>{c.fechaDebito}</TableCell>
              <TableCell align="right">{formatMoney(c.capital, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.intereses, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.seguroIncendio, "ARS")}</TableCell>
              <TableCell align="right">{formatMoney(c.totalDebitado, "ARS")}</TableCell>
              <TableCell align="right">{formatUva(c.cuotaPuraUva)}</TableCell>
              <TableCell align="right">{formatMoney(c.cotizacionUva, "ARS")}</TableCell>
            </MotionTableRow>
          ))}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
```

- [ ] **Step 4: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CreditKpiCards.tsx client/src/components/MortgageCouponsTable.tsx client/src/components/charts/CapitalVsInterestChart.tsx client/src/components/charts/TotalPaidByMonthChart.tsx client/src/components/charts/UvaEvolutionChart.tsx client/src/components/charts/AmortizationDonutChart.tsx
git commit -m "feat(client): credit KPI cards, charts and coupons table"
```

---

### Task 14: `CreditsPage` + routing + navigation

**Files:**
- Create: `client/src/pages/CreditsPage.tsx`
- Create: `client/src/pages/CreditsPage.test.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Layout.tsx`
- Modify: `client/src/App.test.tsx`

**Interfaces:**
- Consumes: `useCreditCoupons` (Task 12), `CreditKpiCards`, charts, `MortgageCouponsTable` (Task 13).
- Produces: `CreditsPage`; route `/credits`; nav item "Créditos".

- [ ] **Step 1: Write the failing tests**

`client/src/pages/CreditsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { CreditsPage } from "./CreditsPage.js";

function route(url: string) {
  if (url.includes("/credits/summary")) {
    return { prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240, totalPagado: 13594820.38,
      capitalPagado: 2378973.78, interesPagado: 11097965.12, seguroPagado: 117881.48, capitalOriginalUva: 78316.73,
      capitalAmortizadoUva: 1355.89, capitalPendienteUva: 76960.84, capitalPendientePesos: 153827014.64,
      porcentajeAvanceCapital: 0.017313, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9 };
  }
  if (url.includes("/credits/coupons")) {
    return [{ id: "1", prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18", capital: 184689.39,
      intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93, cuotaPuraUva: 699.6,
      cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84, tea: 9.27, tna: 8.9, cft: 0 }];
  }
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.restoreAllMocks());

describe("CreditsPage", () => {
  it("muestra KPIs, gráficos y detalle mes a mes", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits" });
    await waitFor(() => expect(screen.getByText(/total pagado/i)).toBeInTheDocument());
    expect(screen.getByText(/capital vs interés por mes/i)).toBeInTheDocument();
    expect(screen.getByText(/detalle mes a mes/i)).toBeInTheDocument();
  });
});
```

In `client/src/App.test.tsx`, add `/créditos/i` to the nav label list (line 9):

```tsx
    for (const name of [/dashboard/i, /importar/i, /movimientos/i, /créditos/i, /reglas/i]) {
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run client/src/pages/CreditsPage.test.tsx client/src/App.test.tsx`
Expected: FAIL — `CreditsPage` module missing; nav link "créditos" not found.

- [ ] **Step 3: Implement**

`client/src/pages/CreditsPage.tsx`:

```tsx
import { CircularProgress, Typography } from "@mui/material";
import { useCreditCoupons } from "../api/hooks.js";
import { CreditKpiCards } from "../components/CreditKpiCards.js";
import { MortgageCouponsTable } from "../components/MortgageCouponsTable.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { CapitalVsInterestChart } from "../components/charts/CapitalVsInterestChart.js";
import { TotalPaidByMonthChart } from "../components/charts/TotalPaidByMonthChart.js";
import { UvaEvolutionChart } from "../components/charts/UvaEvolutionChart.js";
import { AmortizationDonutChart } from "../components/charts/AmortizationDonutChart.js";

export const CreditsPage = () => {
  const { data, isLoading } = useCreditCoupons();
  const coupons = data ?? [];

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Créditos</Typography>

      {isLoading && <CircularProgress />}
      {!isLoading && coupons.length === 0 && (
        <Typography color="text.secondary">
          Todavía no importaste cupones del crédito. Subilos desde la página Importar.
        </Typography>
      )}

      {!isLoading && coupons.length > 0 && (
        <>
          <CreditKpiCards />
          <MotionBox
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
          >
            <ChartCard title="Capital vs Interés por mes"><CapitalVsInterestChart /></ChartCard>
            <ChartCard title="Total pagado por mes"><TotalPaidByMonthChart /></ChartCard>
            <ChartCard title="Evolución de la UVA"><UvaEvolutionChart /></ChartCard>
            <ChartCard title="Amortizado vs pendiente"><AmortizationDonutChart /></ChartCard>
          </MotionBox>

          <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
          <MortgageCouponsTable />
        </>
      )}
    </>
  );
};
```

In `client/src/App.tsx`: add the import (with the other page imports, lines 8-12) and the route (with the other routes, inside `<Routes>`):

```tsx
import { CreditsPage } from "./pages/CreditsPage.js";
```
```tsx
        <Route path="/credits" element={<PageTransition><CreditsPage /></PageTransition>} />
```

In `client/src/components/Layout.tsx`, add the nav entry to `NAV` (lines 11-17), after "Cuotas":

```tsx
  { to: "/credits", label: "Créditos" },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run client/src/pages/CreditsPage.test.tsx client/src/App.test.tsx` → Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + commit**

```bash
bun run typecheck && bun run test
git add client/src/pages/CreditsPage.tsx client/src/pages/CreditsPage.test.tsx client/src/App.tsx client/src/components/Layout.tsx client/src/App.test.tsx
git commit -m "feat(client): Créditos page with route and navigation"
```

---

## Self-Review

**Spec coverage** (each spec section → task):
- §3 slice paralelo → Tasks 2-10. §4 modelo `MortgageCoupon` → Task 5 (+ derived UVA in mapper Task 8). §5.1 parser → Task 3. §5.2 registry separado + regresión → Task 4 (coupon-first `detectDocumentKind` + its test; existing `icbcParser` left untouched, verified by the statement classification test). §5.3 dispatch → Tasks 4 + 9. §5.4 importCoupon dedupe → Task 6. §6 amortización → Task 7. §7 API endpoints + DTOs → Tasks 1, 8, 9. §8.1 KPIs → Task 13. §8.2 gráficos → Task 13. §8.3 tabla → Task 13. §8.4 hooks → Task 12. §8.5 formatUva → Task 11. §8 page/nav → Task 14. Precarga 11 cupones → Task 10.
- **Gap intentionally closed vs spec:** the spec left "tighten `icbcParser.detect`" as an option; this plan does NOT modify `icbcParser` (lower risk) and relies on coupon-first ordering in `detectDocumentKind`, covered by Task 4's classification test. `toCreditSummaryDTO` from the spec is unnecessary — `computeCreditProgress` returns the `CreditSummaryDTO` directly (Task 8). Both are deliberate simplifications, noted here.

**Placeholder scan:** No TBD/TODO; every code and test step contains complete code; every run step states the exact command and expected result.

**Type consistency:** `MortgageCouponParser.parse → ParsedCoupon` (Task 1) consumed by Task 3; `parseCoupon → { coupon: ParsedCoupon; meta }` (Task 4) consumed by Task 6; `CouponInput`/`computeCreditProgress → CreditSummaryDTO` (Task 7) consumed by Task 8; `MortgageCouponDTO`/`CreditSummaryDTO`/`ImportResultUnionDTO` (Task 1) consumed by Tasks 8, 9, 12, 13. `useImportFile` (Task 12) replaces `useUploadStatement`; only `ImportPage` consumes it (updated in Task 12). Field names (`capitalPendienteUva`, `porcentajeAvanceCapital`, `cuotaPuraUva`, etc.) are identical across schema (Task 1), computation (Task 7), route (Task 8), and UI (Tasks 13-14).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-17-credits-uva-mortgage.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
