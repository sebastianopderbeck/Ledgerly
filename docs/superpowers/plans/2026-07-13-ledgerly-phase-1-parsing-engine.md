# Ledgerly — Fase 1: Motor de parseo de resúmenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dado el buffer de un PDF de resumen de tarjeta (Visa Signature o ICBC), extraer el texto, detectar el emisor, parsear los movimientos a un `ParsedStatement` tipado, y reconciliar los consumos contra los totales impresos.

**Architecture:** Librería pura en `server/src` (sin DB ni HTTP en esta fase). Pipeline: `extractPdfText` (unpdf) → `detectParser` (registry) → `parser.parse` (uno por emisor) → normalización compartida → `reconcile`. Los tipos y schemas viven en `shared/` (single source of truth, zod + tipos inferidos). Tests con Vitest contra **fixtures sintéticos** (datos ficticios, layout real) + una verificación end-to-end contra los PDFs reales que **se saltea si los archivos no están** (privacidad).

**Tech Stack:** TypeScript (ESM, strict), Node ≥ 20, npm workspaces, Vitest, tsx, unpdf (extracción PDF, wrapper de pdf.js), zod.

## Global Constraints

- **Node ≥ 20**, todo **ESM** (`"type": "module"` en cada `package.json`).
- **TypeScript strict**, prohibido `any`. Interfaces para todo dato público; tipos de retorno explícitos en funciones exportadas.
- **Monorepo npm workspaces**: paquetes `@ledgerly/shared` y `@ledgerly/server`. El server consume shared por symlink de workspace.
- **DRY / YAGNI / TDD**: test que falla → implementación mínima → test verde. Sin frontend, sin Express, sin Mongoose en esta fase.
- **Sin datos reales commiteados**: `examples/*.pdf` está gitignoreado. Los fixtures commiteados son **sintéticos**. Los tests contra PDFs reales usan `describe.skipIf` cuando faltan.
- **Commits diferidos (preferencia del usuario, CLAUDE.md)**: cada tarea termina con `git add` (staging). **No correr `git commit`**; el usuario commitea al revisar. Los mensajes sugeridos van como comentario.
- **Sin comentarios en el código** (CLAUDE.md): naming autoexplicativo. Los comentarios en este plan son guía, no van al código.
- **Números AR**: `.` y separadores irregulares como miles, `,` decimales, `-` final ⇒ crédito. ICBC usa grupos de miles no estándar (ej. `2705.742,75`): el parser de números tolera dots arbitrarios.
- **Año de 2 dígitos** `26` ⇒ `2026` (se asume `20xx`).

---

## File Structure

```
Ledgerly/
├─ package.json                         # workspaces + scripts raíz (test, typecheck)
├─ tsconfig.base.json                   # config TS compartida (strict, ESM)
├─ vitest.config.ts                     # corre **/*.test.ts en todo el repo
├─ .env.example                         # (placeholder para fases siguientes)
├─ docker-compose.yml                   # MongoDB local (se usa en Fase 2; se crea ya)
├─ shared/
│  ├─ package.json                      # @ledgerly/shared (ESM, main src/index.ts)
│  ├─ tsconfig.json
│  └─ src/
│     ├─ schemas.ts                     # zod schemas + tipos inferidos (datos)
│     ├─ types.ts                       # PdfMeta, ExtractedPdf, StatementParser
│     └─ index.ts                       # re-exports
└─ server/
   ├─ package.json                      # @ledgerly/server (deps: unpdf; dep interna shared)
   ├─ tsconfig.json
   ├─ scripts/
   │  └─ capture-fixtures.ts            # dev helper: PDF real → texto extraído (para inspección)
   └─ src/
      ├─ pdf/
      │  ├─ extract.ts                  # extractPdfText(data) → ExtractedPdf
      │  └─ extract.test.ts             # skipIf(no examples/) contra PDFs reales
      ├─ parsers/
      │  ├─ normalize.ts                # utils puras: números, fechas, cuotas, tipo, merchant
      │  ├─ normalize.test.ts
      │  ├─ visaSignature.ts            # visaSignatureParser: StatementParser
      │  ├─ visaSignature.test.ts
      │  ├─ icbc.ts                     # icbcParser: StatementParser
      │  ├─ icbc.test.ts
      │  ├─ registry.ts                 # parsers[], detectParser(text, meta)
      │  ├─ registry.test.ts
      │  ├─ reconcile.ts                # reconcile(statement, tolerance?) → ReconciliationResult
      │  ├─ reconcile.test.ts
      │  └─ __fixtures__/
      │     ├─ visa-signature.sample.txt   # sintético, layout Visa
      │     └─ icbc.sample.txt             # sintético, layout ICBC
      └─ ingestion/
         ├─ errors.ts                   # NoTextError, UnsupportedFormatError, NoTransactionsError
         ├─ parseStatement.ts           # orquestador puro (extract→detect→parse→reconcile)
         ├─ parseStatement.test.ts      # con extract stubbeado + e2e skipIf(no examples/)
```

---

### Task 1: Scaffold del monorepo

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.env.example`, `docker-compose.yml`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/smoke.test.ts` (se borra en Task 2)

**Interfaces:**
- Consumes: nada.
- Produces: workspaces `@ledgerly/shared` y `@ledgerly/server` resolubles; `npm test` y `npm run typecheck` ejecutables desde la raíz.

- [ ] **Step 1: Crear `package.json` raíz**

```json
{
  "name": "ledgerly",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Crear `tsconfig.base.json` y `tsconfig.json` (raíz)**

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`tsconfig.json` (raíz, lo usa `npm run typecheck`; el alias `paths` evita depender del symlink del workspace):
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@ledgerly/shared": ["shared/src/index.ts"] }
  },
  "include": ["shared/src", "server/src", "vitest.config.ts"]
}
```

- [ ] **Step 3: Crear `vitest.config.ts`, `.env.example`, `docker-compose.yml`, `.gitignore`**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/src/**/*.test.ts"],
    environment: "node",
  },
});
```

`.env.example`:
```bash
MONGO_URL=mongodb://localhost:27017/ledgerly
PORT=4000
```

`docker-compose.yml`:
```yaml
services:
  mongo:
    image: mongo:7
    container_name: ledgerly-mongo
    ports:
      - "27017:27017"
    volumes:
      - ledgerly-mongo-data:/data/db
volumes:
  ledgerly-mongo-data:
```

`.gitignore` (sobrescribir; incluye lo que ya estaba y agrega node_modules/.env; endurece `.pdf`→`*.pdf`):
```gitignore
node_modules/
dist/
.env
.idea/
.superpowers/
/examples
*.pdf
```

- [ ] **Step 4: Crear paquete `shared`**

`shared/package.json`:
```json
{
  "name": "@ledgerly/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.23.0" }
}
```

`shared/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src"]
}
```

`shared/src/index.ts`:
```ts
export const SHARED_PACKAGE = "@ledgerly/shared";
```

- [ ] **Step 5: Crear paquete `server` con un smoke test**

`server/package.json`:
```json
{
  "name": "@ledgerly/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@ledgerly/shared": "*",
    "unpdf": "^0.12.0"
  }
}
```

`server/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@ledgerly/shared": ["../shared/src/index.ts"] }
  },
  "include": ["src"]
}
```

`server/src/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SHARED_PACKAGE } from "@ledgerly/shared";

describe("scaffold", () => {
  it("resuelve el workspace shared", () => {
    expect(SHARED_PACKAGE).toBe("@ledgerly/shared");
  });
});
```

- [ ] **Step 6: Instalar y verificar**

Run:
```bash
npm install
npm run typecheck
npm test
```
Expected: `npm install` linkea los workspaces; `typecheck` sin errores; Vitest muestra `smoke.test.ts` con 1 test PASS.

- [ ] **Step 7: Stage**

```bash
git add package.json tsconfig.base.json tsconfig.json vitest.config.ts .env.example docker-compose.yml shared server package-lock.json
# commit sugerido (lo hace el usuario): "chore: scaffold monorepo (shared + server workspaces)"
```

---

### Task 2: Tipos y schemas compartidos

**Files:**
- Create: `shared/src/schemas.ts`, `shared/src/types.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/schemas.test.ts`
- Delete: `server/src/smoke.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (exportados desde `@ledgerly/shared`):
  - Tipos: `Issuer = 'visa_signature' | 'icbc'`, `Currency = 'ARS' | 'USD'`, `Direction = 'debit' | 'credit'`, `TxType = 'purchase' | 'payment' | 'tax' | 'fee' | 'refund' | 'adjustment'`
  - `ParsedRow`, `ParsedTotals`, `ParsedHeader`, `ParsedStatement`, `ReconciliationEntry`, `ReconciliationResult`
  - `PdfMeta`, `ExtractedPdf`, `StatementParser`
  - Schemas zod: `parsedStatementSchema`, `parsedRowSchema`

- [ ] **Step 1: Escribir el test que falla**

`shared/src/schemas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parsedStatementSchema, type ParsedStatement } from "./index.js";

const valid: ParsedStatement = {
  header: {
    issuer: "visa_signature",
    cardLabel: "Visa Signature ****1234",
    last4: "1234",
    closingDate: "2026-07-02",
    dueDate: "2026-07-13",
    totals: {
      totalConsumos: { ars: 3700, usd: 50 },
      saldoActual: { ars: 3910, usd: 50 },
      pagoMinimo: { ars: 500, usd: 0 },
      saldoAnterior: { ars: 1000, usd: 10 },
    },
  },
  rows: [
    {
      date: "2026-06-10",
      descriptionRaw: "COMERCIO UNO",
      merchant: "COMERCIO UNO",
      amount: 2500,
      currency: "ARS",
      direction: "debit",
      type: "purchase",
      isInstallment: false,
      installmentCurrent: null,
      installmentTotal: null,
      comprobante: "111111",
    },
  ],
};

describe("parsedStatementSchema", () => {
  it("acepta un statement válido", () => {
    expect(parsedStatementSchema.parse(valid)).toEqual(valid);
  });

  it("rechaza currency inválida", () => {
    const bad = structuredClone(valid);
    // @ts-expect-error probamos runtime
    bad.rows[0].currency = "EUR";
    expect(() => parsedStatementSchema.parse(bad)).toThrow();
  });

  it("rechaza amount negativo", () => {
    const bad = structuredClone(valid);
    bad.rows[0].amount = -1;
    expect(() => parsedStatementSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- schemas`
Expected: FAIL — `parsedStatementSchema` no existe / no se puede importar.

- [ ] **Step 3: Implementar schemas y tipos**

`shared/src/schemas.ts`:
```ts
import { z } from "zod";

export const issuerSchema = z.enum(["visa_signature", "icbc"]);
export const currencySchema = z.enum(["ARS", "USD"]);
export const directionSchema = z.enum(["debit", "credit"]);
export const txTypeSchema = z.enum([
  "purchase",
  "payment",
  "tax",
  "fee",
  "refund",
  "adjustment",
]);

const moneyPairSchema = z.object({ ars: z.number(), usd: z.number() });

export const parsedRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descriptionRaw: z.string(),
  merchant: z.string(),
  amount: z.number().nonnegative(),
  currency: currencySchema,
  direction: directionSchema,
  type: txTypeSchema,
  isInstallment: z.boolean(),
  installmentCurrent: z.number().int().positive().nullable(),
  installmentTotal: z.number().int().positive().nullable(),
  comprobante: z.string().nullable(),
});

export const parsedTotalsSchema = z.object({
  totalConsumos: moneyPairSchema,
  saldoActual: moneyPairSchema,
  pagoMinimo: moneyPairSchema,
  saldoAnterior: moneyPairSchema,
});

export const parsedHeaderSchema = z.object({
  issuer: issuerSchema,
  cardLabel: z.string(),
  last4: z.string().nullable(),
  closingDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  totals: parsedTotalsSchema,
});

export const parsedStatementSchema = z.object({
  header: parsedHeaderSchema,
  rows: z.array(parsedRowSchema),
});

export const reconciliationEntrySchema = z.object({
  currency: currencySchema,
  expected: z.number(),
  parsed: z.number(),
  diff: z.number(),
  ok: z.boolean(),
});

export const reconciliationResultSchema = z.object({
  ok: z.boolean(),
  entries: z.array(reconciliationEntrySchema),
});

export type Issuer = z.infer<typeof issuerSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type Direction = z.infer<typeof directionSchema>;
export type TxType = z.infer<typeof txTypeSchema>;
export type ParsedRow = z.infer<typeof parsedRowSchema>;
export type ParsedTotals = z.infer<typeof parsedTotalsSchema>;
export type ParsedHeader = z.infer<typeof parsedHeaderSchema>;
export type ParsedStatement = z.infer<typeof parsedStatementSchema>;
export type ReconciliationEntry = z.infer<typeof reconciliationEntrySchema>;
export type ReconciliationResult = z.infer<typeof reconciliationResultSchema>;
```

`shared/src/types.ts`:
```ts
import type { Issuer, ParsedStatement } from "./schemas.js";

export interface PdfMeta {
  producer: string | null;
  creator: string | null;
  pageCount: number;
  encrypted: boolean;
}

export interface ExtractedPdf {
  text: string;
  meta: PdfMeta;
}

export interface StatementParser {
  issuer: Issuer;
  detect(text: string, meta: PdfMeta): boolean;
  parse(text: string, meta: PdfMeta): ParsedStatement;
}
```

`shared/src/index.ts` (reemplazar contenido):
```ts
export * from "./schemas.js";
export * from "./types.js";
```

- [ ] **Step 4: Borrar el smoke test del scaffold**

Run: `rm server/src/smoke.test.ts`

- [ ] **Step 5: Correr los tests**

Run: `npm test -- schemas`
Expected: PASS (3 tests). Luego `npm run typecheck` sin errores.

- [ ] **Step 6: Stage**

```bash
git add shared server
# commit sugerido: "feat(shared): tipos y schemas zod del ParsedStatement"
```

---

### Task 3: Extracción de texto del PDF (spike de riesgo #1)

**Files:**
- Create: `server/src/pdf/extract.ts`
- Test: `server/src/pdf/extract.test.ts`
- Create: `server/scripts/capture-fixtures.ts` (helper de inspección)

**Interfaces:**
- Consumes: `PdfMeta`, `ExtractedPdf` de `@ledgerly/shared`.
- Produces: `export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdf>`.

> **Spike:** Esta tarea resuelve el riesgo #1 del spec (¿unpdf abre el PDF AES de ICBC con password vacía?). El test corre contra los PDFs reales en `examples/` y **se saltea si no están**. Si unpdf no extrae texto del PDF encriptado, el fallback es pasar `password: ""` vía `getDocumentProxy` (unpdf reenvía opciones a pdf.js); si aún falla, cambiar a `pdfjs-dist/legacy` con `getDocument({ data, password: "" })`. Dejar registrado en el commit cuál funcionó.

- [ ] **Step 1: Escribir el test que falla (skipIf sin PDFs reales)**

`server/src/pdf/extract.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractPdfText } from "./extract.js";

const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
const visaPath = examples + "UltimaLiquidacion.pdf";
const icbcPath = examples + "Resumen14jul2026.pdf";
const hasReal = existsSync(visaPath) && existsSync(icbcPath);

describe.skipIf(!hasReal)("extractPdfText (PDFs reales)", () => {
  it("extrae texto del PDF Visa (no encriptado)", async () => {
    const { text, meta } = await extractPdfText(readFileSync(visaPath));
    expect(text).toContain("VISA SIGNATURE");
    expect(meta.pageCount).toBeGreaterThan(0);
  });

  it("extrae texto del PDF ICBC (AES, password vacía)", async () => {
    const { text, meta } = await extractPdfText(readFileSync(icbcPath));
    expect(text).toContain("ICBC");
    expect(text.length).toBeGreaterThan(500);
    expect(meta.pageCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- extract`
Expected: FAIL — `extractPdfText` no existe (o los tests aparecen "skipped" si no están los PDFs; en ese caso, copiar los PDFs a `examples/` localmente para ejecutar el spike).

- [ ] **Step 3: Implementar la extracción con unpdf**

`server/src/pdf/extract.ts`:
```ts
import { extractText, getDocumentProxy, getMeta } from "unpdf";
import type { ExtractedPdf, PdfMeta } from "@ledgerly/shared";

export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdf> {
  const pdf = await getDocumentProxy(data, { password: "" });
  const { text } = await extractText(pdf, { mergePages: true });
  const { info } = await getMeta(pdf);

  const meta: PdfMeta = {
    producer: (info?.Producer as string) ?? null,
    creator: (info?.Creator as string) ?? null,
    pageCount: pdf.numPages,
    encrypted: Boolean((info as Record<string, unknown>)?.IsEncrypted ?? false),
  };

  return { text, meta };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- extract`
Expected: PASS (2 tests) si los PDFs reales están presentes. Si unpdf falla en el ICBC encriptado, aplicar el fallback descrito en el spike y volver a correr.

- [ ] **Step 5: Crear el helper de captura (para autoría de fixtures/inspección)**

`server/scripts/capture-fixtures.ts`:
```ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractPdfText } from "../src/pdf/extract.js";

const examples = fileURLToPath(new URL("../../examples/", import.meta.url));
const targets = [
  { pdf: "UltimaLiquidacion.pdf", out: "visa-real.txt" },
  { pdf: "Resumen14jul2026.pdf", out: "icbc-real.txt" },
];

for (const { pdf, out } of targets) {
  const path = examples + pdf;
  if (!existsSync(path)) {
    console.log(`skip ${pdf} (no está)`);
    continue;
  }
  const { text, meta } = await extractPdfText(readFileSync(path));
  writeFileSync(examples + out, text);
  console.log(`${pdf} → ${out} (${text.length} chars)`, meta);
}
```

Run (opcional, para inspeccionar el layout real y ajustar fixtures/regex):
```bash
npx tsx server/scripts/capture-fixtures.ts
```
Expected: escribe `examples/visa-real.txt` e `examples/icbc-real.txt` (ambos gitignoreados por `/examples`). Comparar su layout con los fixtures sintéticos de las Tasks 5–6 y ajustar regex si difiere.

- [ ] **Step 6: Stage**

```bash
git add server/src/pdf server/scripts
# commit sugerido: "feat(server): extracción de texto de PDF con unpdf (+ spike AES ICBC)"
```

---

### Task 4: Utilidades de normalización

**Files:**
- Create: `server/src/parsers/normalize.ts`
- Test: `server/src/parsers/normalize.test.ts`

**Interfaces:**
- Consumes: `Currency`, `Direction`, `TxType` de `@ledgerly/shared`.
- Produces:
  - `parseArAmount(raw: string): { amount: number; direction: Direction }`
  - `extractAmounts(line: string): string[]` (tokens numéricos AR en orden)
  - `parseVisaDate(raw: string): string` (`"05.06.26"` → `"2026-06-05"`)
  - `MONTHS_ES: Record<string, number>` (nombre completo y abreviatura → 1..12)
  - `parseSpanishDate(day: string, monthName: string, yy: string): string`
  - `parseInstallment(desc: string): { isInstallment: boolean; current: number | null; total: number | null }`
  - `classifyType(desc: string): TxType`
  - `normalizeMerchant(desc: string): string`

- [ ] **Step 1: Escribir el test que falla**

`server/src/parsers/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  parseArAmount,
  extractAmounts,
  parseVisaDate,
  parseSpanishDate,
  parseInstallment,
  classifyType,
  normalizeMerchant,
} from "./normalize.js";

describe("parseArAmount", () => {
  it("parsea miles y decimales", () => {
    expect(parseArAmount("1.990.883,84")).toEqual({ amount: 1990883.84, direction: "debit" });
  });
  it("trata el guión final como crédito", () => {
    expect(parseArAmount("1.000,00-")).toEqual({ amount: 1000, direction: "credit" });
  });
  it("tolera el formato irregular de ICBC", () => {
    expect(parseArAmount("2705.742,75")).toEqual({ amount: 2705742.75, direction: "debit" });
  });
});

describe("extractAmounts", () => {
  it("extrae todos los importes en orden (el consumidor toma el último)", () => {
    expect(extractAmounts("DEV.IMP. RG 5617  30%(   16879,37)      5.063,81-")).toEqual(["16879,37", "5.063,81-"]);
  });
  it("extrae dos columnas", () => {
    expect(extractAmounts("SALDO ANTERIOR   1.000,00   10,00")).toEqual(["1.000,00", "10,00"]);
  });
});

describe("parseVisaDate", () => {
  it("DD.MM.YY → ISO", () => {
    expect(parseVisaDate("05.06.26")).toBe("2026-06-05");
  });
});

describe("parseSpanishDate", () => {
  it("día + mes en español + YY → ISO", () => {
    expect(parseSpanishDate("04", "Mayo", "26")).toBe("2026-05-04");
    expect(parseSpanishDate("02", "Jul", "26")).toBe("2026-07-02");
  });
});

describe("parseInstallment", () => {
  it("formato Visa 'Cuota NN/MM'", () => {
    expect(parseInstallment("MERPAGO*X Cuota  03/06")).toEqual({ isInstallment: true, current: 3, total: 6 });
  });
  it("formato ICBC 'C.NN/MM'", () => {
    expect(parseInstallment("VISUAR C.11/12")).toEqual({ isInstallment: true, current: 11, total: 12 });
  });
  it("sin cuotas", () => {
    expect(parseInstallment("BICHO CAFE")).toEqual({ isInstallment: false, current: null, total: null });
  });
});

describe("classifyType", () => {
  it("pago", () => expect(classifyType("SU PAGO EN PESOS")).toBe("payment"));
  it("impuesto IVA", () => expect(classifyType("IVA RG 4240 21%( 1000,00)")).toBe("tax"));
  it("impuesto IIBB", () => expect(classifyType("IIBB PERCEP-CABA 2,00%")).toBe("tax"));
  it("bonificación", () => expect(classifyType("BONIF. CONSUMO OV")).toBe("refund"));
  it("compra por defecto", () => expect(classifyType("MERPAGO*MERCADOLIBRE")).toBe("purchase"));
});

describe("normalizeMerchant", () => {
  it("quita prefijos de pasarela y tokens de cuota/USD", () => {
    expect(normalizeMerchant("MERPAGO*MERCADOLIBRE Cuota  03/06")).toBe("MERCADOLIBRE");
    expect(normalizeMerchant("PAYU*AR*UBER")).toBe("UBER");
    expect(normalizeMerchant("SERVICIO USD   50,00")).toBe("SERVICIO");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- normalize`
Expected: FAIL — módulo `normalize.js` inexistente.

- [ ] **Step 3: Implementar las utilidades**

`server/src/parsers/normalize.ts`:
```ts
import type { Direction, TxType } from "@ledgerly/shared";

const AR_NUMBER = /(?<![\d.])\d[\d.]*,\d{2}-?/g;

export function extractAmounts(line: string): string[] {
  return line.match(AR_NUMBER) ?? [];
}

export function parseArAmount(raw: string): { amount: number; direction: Direction } {
  const direction: Direction = raw.trim().endsWith("-") ? "credit" : "debit";
  const normalized = raw.replace(/-/g, "").replace(/\./g, "").replace(",", ".").trim();
  return { amount: Number.parseFloat(normalized), direction };
}

export function parseVisaDate(raw: string): string {
  const [dd, mm, yy] = raw.trim().split(".");
  return `20${yy}-${mm}-${dd}`;
}

export const MONTHS_ES: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, set: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

export function parseSpanishDate(day: string, monthName: string, yy: string): string {
  const month = MONTHS_ES[monthName.toLowerCase()];
  if (!month) throw new Error(`Mes desconocido: ${monthName}`);
  return `20${yy}-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseInstallment(desc: string): {
  isInstallment: boolean;
  current: number | null;
  total: number | null;
} {
  const m = desc.match(/(?:Cuota\s+|C\.)(\d{1,2})\/(\d{1,2})/);
  if (!m) return { isInstallment: false, current: null, total: null };
  return { isInstallment: true, current: Number(m[1]), total: Number(m[2]) };
}

export function classifyType(desc: string): TxType {
  const d = desc.toUpperCase();
  if (/SU\s+PAGO|PAGO\s+TIC/.test(d)) return "payment";
  if (/\b(IVA|IIBB|PERCEP|DB\.RG|DEV\.IMP|RG\s*\d)/.test(d)) return "tax";
  if (/BONIF/.test(d)) return "refund";
  return "purchase";
}

export function normalizeMerchant(detail: string): string {
  return detail
    .replace(/(?:Cuota\s+|C\.)\d{1,2}\/\d{1,2}/g, " ")
    .replace(/USD\s+[\d.]*,\d{2}/g, " ")
    .replace(/(?<![\d.])\d[\d.]*,\d{2}-?/g, " ")
    .replace(/^\s*(?:MERPAGO\*|PEDIDOSYA\*|DLO\*|PAYU\*AR\*|INI\*)/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- normalize`
Expected: PASS (todos). Ajustar regex si algún caso falla y volver a correr.

- [ ] **Step 5: Stage**

```bash
git add server/src/parsers/normalize.ts server/src/parsers/normalize.test.ts
# commit sugerido: "feat(parsers): utilidades de normalización (números AR, fechas, cuotas, tipo, merchant)"
```

---

### Task 5: Parser Visa Signature

**Files:**
- Create: `server/src/parsers/visaSignature.ts`
- Create: `server/src/parsers/__fixtures__/visa-signature.sample.txt`
- Test: `server/src/parsers/visaSignature.test.ts`

**Interfaces:**
- Consumes: `normalize.ts`, tipos + `PdfMeta`, `StatementParser`, `ParsedStatement` de shared.
- Produces: `export const visaSignatureParser: StatementParser` (issuer `"visa_signature"`).

- [ ] **Step 1: Crear el fixture sintético (layout Visa, datos ficticios)**

`server/src/parsers/__fixtures__/visa-signature.sample.txt` (los espacios importan; replican columnas):
```
VISA SIGNATURE
CIERRE ACTUAL: 02 Jul 26
VENCIMIENTO 13 Jul 26
           FECHA   COMPROBANTE          DETALLE DE TRANSACCION                          PESOS                  DOLARES
                               SALDO ANTERIOR                              1.000,00             10,00
       05.06.26                SU PAGO EN PESOS                            1.000,00-
       10.06.26     111111*    COMERCIO UNO                                 2.500,00
       11.06.26     222222*    MERPAGO*COMERCIO DOS         Cuota  03/06     1.200,00
       12.06.26     333333F    SERVICIO EXTERIOR        USD       50,00                          50,00
       13.06.26     444444K    IVA RG 4240 21%(   1000,00)                    210,00
       Tarjeta 1234 Total Consumos de TITULAR EJEMPLO                        3.700,00             50,00 _
                                                 SALDO ACTUAL       $      3.910,00  U$S        50,00
                                                 PAGO MINIMO        $        500,00
```

- [ ] **Step 2: Escribir el test que falla**

`server/src/parsers/visaSignature.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { visaSignatureParser } from "./visaSignature.js";
import type { PdfMeta } from "@ledgerly/shared";

const text = readFileSync(
  fileURLToPath(new URL("./__fixtures__/visa-signature.sample.txt", import.meta.url)),
  "utf8",
);
const meta: PdfMeta = { producer: "Adobe LiveCycle", creator: null, pageCount: 2, encrypted: false };

describe("visaSignatureParser.detect", () => {
  it("detecta por el marker VISA SIGNATURE", () => {
    expect(visaSignatureParser.detect(text, meta)).toBe(true);
    expect(visaSignatureParser.detect("banco cualquiera", meta)).toBe(false);
  });
});

describe("visaSignatureParser.parse", () => {
  const result = visaSignatureParser.parse(text, meta);

  it("extrae el header", () => {
    expect(result.header.issuer).toBe("visa_signature");
    expect(result.header.last4).toBe("1234");
    expect(result.header.closingDate).toBe("2026-07-02");
    expect(result.header.totals.totalConsumos).toEqual({ ars: 3700, usd: 50 });
    expect(result.header.totals.saldoActual).toEqual({ ars: 3910, usd: 50 });
    expect(result.header.totals.saldoAnterior).toEqual({ ars: 1000, usd: 10 });
  });

  it("parsea 5 movimientos (excluye SALDO ANTERIOR y líneas de totales)", () => {
    expect(result.rows).toHaveLength(5);
  });

  it("clasifica el pago", () => {
    const pago = result.rows.find((r) => r.type === "payment");
    expect(pago).toMatchObject({ amount: 1000, currency: "ARS", direction: "credit" });
  });

  it("parsea una compra ARS", () => {
    expect(result.rows.find((r) => r.comprobante === "111111")).toMatchObject({
      date: "2026-06-10", merchant: "COMERCIO UNO", amount: 2500,
      currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
    });
  });

  it("parsea una compra en cuotas", () => {
    expect(result.rows.find((r) => r.comprobante === "222222")).toMatchObject({
      merchant: "COMERCIO DOS", amount: 1200, isInstallment: true,
      installmentCurrent: 3, installmentTotal: 6,
    });
  });

  it("parsea una compra USD", () => {
    expect(result.rows.find((r) => r.comprobante === "333333")).toMatchObject({
      amount: 50, currency: "USD", type: "purchase", merchant: "SERVICIO EXTERIOR",
    });
  });

  it("clasifica el impuesto", () => {
    expect(result.rows.find((r) => r.comprobante === "444444")).toMatchObject({ amount: 210, type: "tax" });
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- visaSignature`
Expected: FAIL — `visaSignatureParser` inexistente.

- [ ] **Step 4: Implementar el parser**

`server/src/parsers/visaSignature.ts`:
```ts
import type { PdfMeta, ParsedRow, ParsedStatement, StatementParser } from "@ledgerly/shared";
import {
  classifyType, extractAmounts, normalizeMerchant, parseArAmount,
  parseInstallment, parseSpanishDate, parseVisaDate,
} from "./normalize.js";

const ROW = /^\s*(\d{2}\.\d{2}\.\d{2})\s+(?:(\d{4,6}[*FK]?)\s+)?(.*)$/;

function money(line: string | undefined, re: RegExp): number {
  if (!line) return 0;
  const m = line.match(re);
  return m ? parseArAmount(m[1]).amount : 0;
}

function shortDate(text: string, label: string): string | null {
  const m = text.match(new RegExp(`${label}\\s+(\\d{2})\\s+([A-Za-z]{3})\\s+(\\d{2})`));
  return m ? parseSpanishDate(m[1], m[2], m[3]) : null;
}

export const visaSignatureParser: StatementParser = {
  issuer: "visa_signature",

  detect(text) {
    return text.includes("VISA SIGNATURE");
  },

  parse(text, _meta: PdfMeta): ParsedStatement {
    const lines = text.split("\n");
    const rows: ParsedRow[] = [];

    for (const line of lines) {
      const m = line.match(ROW);
      if (!m) continue;
      const [, rawDate, comprobante, rest] = m;
      if (/SALDO ANTERIOR|Total Consumos|SALDO ACTUAL|PAGO MINIMO/.test(rest)) continue;

      const amounts = extractAmounts(rest);
      if (amounts.length === 0) continue;
      const { amount, direction } = parseArAmount(amounts[amounts.length - 1]);
      const currency = /\bUSD\b|U\$S/.test(rest) ? "USD" : "ARS";
      const type = classifyType(rest);
      const installment = parseInstallment(rest);
      const description = rest.replace(/\s+/g, " ").trim();

      rows.push({
        date: parseVisaDate(rawDate),
        descriptionRaw: description,
        merchant: normalizeMerchant(rest),
        amount, currency, direction, type,
        isInstallment: installment.isInstallment,
        installmentCurrent: installment.current,
        installmentTotal: installment.total,
        comprobante: comprobante?.replace(/[*FK]$/, "") ?? null,
      });
    }

    const totalConsumos = text.match(/Total Consumos[^\n]*?([\d.]+,\d{2})\s+([\d.]+,\d{2})/);
    const saldoActual = text.match(/SALDO ACTUAL\s+\$\s+([\d.]+,\d{2})\s+U\$S\s+([\d.]+,\d{2})/);
    const saldoAnterior = text.match(/SALDO ANTERIOR\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/);
    const last4 = text.match(/Tarjeta\s+(\d{4})/);

    return {
      header: {
        issuer: "visa_signature",
        cardLabel: last4 ? `Visa Signature ****${last4[1]}` : "Visa Signature",
        last4: last4?.[1] ?? null,
        closingDate: shortDate(text, "CIERRE ACTUAL:"),
        dueDate: shortDate(text, "VENCIMIENTO"),
        totals: {
          totalConsumos: {
            ars: totalConsumos ? parseArAmount(totalConsumos[1]).amount : 0,
            usd: totalConsumos ? parseArAmount(totalConsumos[2]).amount : 0,
          },
          saldoActual: {
            ars: saldoActual ? parseArAmount(saldoActual[1]).amount : 0,
            usd: saldoActual ? parseArAmount(saldoActual[2]).amount : 0,
          },
          pagoMinimo: { ars: money(text.match(/PAGO MINIMO[^\n]*/)?.[0], /\$\s+([\d.]+,\d{2})/), usd: 0 },
          saldoAnterior: {
            ars: saldoAnterior ? parseArAmount(saldoAnterior[1]).amount : 0,
            usd: saldoAnterior ? parseArAmount(saldoAnterior[2]).amount : 0,
          },
        },
      },
      rows,
    };
  },
};
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- visaSignature`
Expected: PASS. Si el layout real (capturado en Task 3) difiere del fixture, ajustar fixture + regex hasta verde, y confirmar contra el real en Task 9.

- [ ] **Step 6: Stage**

```bash
git add server/src/parsers/visaSignature.ts server/src/parsers/visaSignature.test.ts server/src/parsers/__fixtures__/visa-signature.sample.txt
# commit sugerido: "feat(parsers): parser Visa Signature + fixture sintético"
```

---

### Task 6: Parser ICBC

**Files:**
- Create: `server/src/parsers/icbc.ts`
- Create: `server/src/parsers/__fixtures__/icbc.sample.txt`
- Test: `server/src/parsers/icbc.test.ts`

**Interfaces:**
- Consumes: `normalize.ts`, tipos + `PdfMeta`, `StatementParser` de shared.
- Produces: `export const icbcParser: StatementParser` (issuer `"icbc"`). Maneja **fecha agrupada con arrastre** (`AA Mes DD` seguido de filas con solo `DD`).

- [ ] **Step 1: Crear el fixture sintético (layout ICBC, fechas agrupadas)**

`server/src/parsers/__fixtures__/icbc.sample.txt`:
```
EXCLUSIVE ICBC CLUB
CIERRE  02 Jul 26       VENCIMIENTO 14 Jul 26
LIMITES:     COMPRA   $  17.100.000,00
                        SALDO ANTERIOR                              5.000,00               0,00
26 Junio   08           SU PAGO EN PESOS                            5.000,00-
26 Mayo    04 001001 *  COMERCIO TRES               C.02/06           1.500,00
           07 001002 K  PAYU*AR*COMERCIO CUATRO                        900,00
           10 001003    BONIF. ALGO                                    100,00-
                        TOTAL CONSUMOS                                2.400,00
                        SALDO ACTUAL       $                          2.400,00
                        PAGO MINIMO        $                            240,00
```

- [ ] **Step 2: Escribir el test que falla**

`server/src/parsers/icbc.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { icbcParser } from "./icbc.js";
import type { PdfMeta } from "@ledgerly/shared";

const text = readFileSync(
  fileURLToPath(new URL("./__fixtures__/icbc.sample.txt", import.meta.url)),
  "utf8",
);
const meta: PdfMeta = { producer: "iText 5.0.6", creator: null, pageCount: 10, encrypted: true };

describe("icbcParser.detect", () => {
  it("detecta por el marker ICBC", () => {
    expect(icbcParser.detect(text, meta)).toBe(true);
    expect(icbcParser.detect("otro banco", meta)).toBe(false);
  });
});

describe("icbcParser.parse", () => {
  const result = icbcParser.parse(text, meta);

  it("header con totales", () => {
    expect(result.header.issuer).toBe("icbc");
    expect(result.header.closingDate).toBe("2026-07-02");
    expect(result.header.totals.totalConsumos.ars).toBe(2400);
    expect(result.header.totals.saldoAnterior).toEqual({ ars: 5000, usd: 0 });
  });

  it("parsea 4 movimientos", () => {
    expect(result.rows).toHaveLength(4);
  });

  it("arrastra año+mes en filas de solo-día", () => {
    expect(result.rows.find((r) => r.comprobante === "001001")?.date).toBe("2026-05-04");
    expect(result.rows.find((r) => r.comprobante === "001002")?.date).toBe("2026-05-07");
    expect(result.rows.find((r) => r.comprobante === "001003")?.date).toBe("2026-05-10");
  });

  it("fecha completa para el pago", () => {
    const pago = result.rows.find((r) => r.type === "payment");
    expect(pago).toMatchObject({ date: "2026-06-08", amount: 5000, direction: "credit" });
  });

  it("compra en cuotas con merchant y comprobante", () => {
    expect(result.rows.find((r) => r.comprobante === "001001")).toMatchObject({
      merchant: "COMERCIO TRES", amount: 1500, type: "purchase",
      isInstallment: true, installmentCurrent: 2, installmentTotal: 6,
    });
  });

  it("bonificación como refund/credit", () => {
    expect(result.rows.find((r) => r.comprobante === "001003")).toMatchObject({
      amount: 100, type: "refund", direction: "credit",
    });
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- icbc`
Expected: FAIL — `icbcParser` inexistente.

- [ ] **Step 4: Implementar el parser**

`server/src/parsers/icbc.ts`:
```ts
import type { PdfMeta, ParsedRow, ParsedStatement, StatementParser } from "@ledgerly/shared";
import {
  MONTHS_ES, classifyType, extractAmounts, normalizeMerchant,
  parseArAmount, parseInstallment, parseSpanishDate,
} from "./normalize.js";

const FULL_DATE = /^\s*(\d{2})\s+([A-Za-zÁÉÍÓÚñáéíóú]+)\s+(\d{2})\s+(.*)$/;
const DAY_ONLY = /^\s*(\d{2})\s+(.*)$/;
const COMPROBANTE = /^(?:(\d{4,6})\s*([*K]?)\s+)?(.*)$/;

function shortDate(text: string, label: string): string | null {
  const m = text.match(new RegExp(`${label}\\s+(\\d{2})\\s+([A-Za-z]{3})\\s+(\\d{2})`));
  return m ? parseSpanishDate(m[1], m[2], m[3]) : null;
}

export const icbcParser: StatementParser = {
  issuer: "icbc",

  detect(text) {
    return text.includes("ICBC");
  },

  parse(text, _meta: PdfMeta): ParsedStatement {
    const lines = text.split("\n");
    const rows: ParsedRow[] = [];
    let year = "26";
    let month = "01";

    for (const line of lines) {
      let day: string;
      let rest: string;

      const full = line.match(FULL_DATE);
      if (full && MONTHS_ES[full[2].toLowerCase()]) {
        year = full[1];
        month = String(MONTHS_ES[full[2].toLowerCase()]).padStart(2, "0");
        day = full[3];
        rest = full[4];
      } else {
        const dayOnly = line.match(DAY_ONLY);
        if (!dayOnly) continue;
        day = dayOnly[1];
        rest = dayOnly[2];
      }

      if (/SALDO ANTERIOR|TOTAL CONSUMOS|SALDO ACTUAL|PAGO MINIMO|LIMITES/.test(rest)) continue;
      const amounts = extractAmounts(rest);
      if (amounts.length === 0) continue;

      const cm = rest.match(COMPROBANTE)!;
      const [, comprobante, , afterComprobante] = cm;
      const description = afterComprobante.replace(/\s+/g, " ").trim();
      const { amount, direction } = parseArAmount(amounts[amounts.length - 1]);
      const installment = parseInstallment(rest);

      rows.push({
        date: `20${year}-${month}-${day.padStart(2, "0")}`,
        descriptionRaw: description,
        merchant: normalizeMerchant(afterComprobante),
        amount,
        currency: /\bUSD\b|U\$S/.test(rest) ? "USD" : "ARS",
        direction,
        type: classifyType(rest),
        isInstallment: installment.isInstallment,
        installmentCurrent: installment.current,
        installmentTotal: installment.total,
        comprobante: comprobante ?? null,
      });
    }

    const totalConsumos = text.match(/TOTAL CONSUMOS\s+([\d.]+,\d{2})/i);
    const saldoAnterior = text.match(/SALDO ANTERIOR\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/);
    const saldoActual = text.match(/SALDO ACTUAL\s+\$\s+([\d.]+,\d{2})/);
    const pagoMinimo = text.match(/PAGO MINIMO\s+\$\s+([\d.]+,\d{2})/);

    return {
      header: {
        issuer: "icbc",
        cardLabel: "ICBC",
        last4: null,
        closingDate: shortDate(text, "CIERRE"),
        dueDate: shortDate(text, "VENCIMIENTO"),
        totals: {
          totalConsumos: { ars: totalConsumos ? parseArAmount(totalConsumos[1]).amount : 0, usd: 0 },
          saldoActual: { ars: saldoActual ? parseArAmount(saldoActual[1]).amount : 0, usd: 0 },
          pagoMinimo: { ars: pagoMinimo ? parseArAmount(pagoMinimo[1]).amount : 0, usd: 0 },
          saldoAnterior: {
            ars: saldoAnterior ? parseArAmount(saldoAnterior[1]).amount : 0,
            usd: saldoAnterior ? parseArAmount(saldoAnterior[2]).amount : 0,
          },
        },
      },
      rows,
    };
  },
};
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- icbc`
Expected: PASS. Ajustar fixture/regex contra el layout real (Task 3) si difiere; confirmar en Task 9.

- [ ] **Step 6: Stage**

```bash
git add server/src/parsers/icbc.ts server/src/parsers/icbc.test.ts server/src/parsers/__fixtures__/icbc.sample.txt
# commit sugerido: "feat(parsers): parser ICBC con fecha agrupada + fixture"
```

---

### Task 7: Registry y detección de formato

**Files:**
- Create: `server/src/parsers/registry.ts`
- Test: `server/src/parsers/registry.test.ts`

**Interfaces:**
- Consumes: `visaSignatureParser`, `icbcParser`, `StatementParser`, `PdfMeta`.
- Produces:
  - `export const parsers: StatementParser[]`
  - `export function detectParser(text: string, meta: PdfMeta): StatementParser | null`

- [ ] **Step 1: Escribir el test que falla**

`server/src/parsers/registry.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectParser } from "./registry.js";
import type { PdfMeta } from "@ledgerly/shared";

const read = (f: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${f}`, import.meta.url)), "utf8");
const meta: PdfMeta = { producer: null, creator: null, pageCount: 1, encrypted: false };

describe("detectParser", () => {
  it("elige Visa", () => {
    expect(detectParser(read("visa-signature.sample.txt"), meta)?.issuer).toBe("visa_signature");
  });
  it("elige ICBC", () => {
    expect(detectParser(read("icbc.sample.txt"), meta)?.issuer).toBe("icbc");
  });
  it("devuelve null si no reconoce", () => {
    expect(detectParser("texto de un banco desconocido", meta)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- registry`
Expected: FAIL — `detectParser` inexistente.

- [ ] **Step 3: Implementar el registry**

`server/src/parsers/registry.ts`:
```ts
import type { PdfMeta, StatementParser } from "@ledgerly/shared";
import { visaSignatureParser } from "./visaSignature.js";
import { icbcParser } from "./icbc.js";

export const parsers: StatementParser[] = [visaSignatureParser, icbcParser];

export function detectParser(text: string, meta: PdfMeta): StatementParser | null {
  return parsers.find((p) => p.detect(text, meta)) ?? null;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- registry`
Expected: PASS (3 tests).

- [ ] **Step 5: Stage**

```bash
git add server/src/parsers/registry.ts server/src/parsers/registry.test.ts
# commit sugerido: "feat(parsers): registry + detección de formato"
```

---

### Task 8: Reconciliación

**Files:**
- Create: `server/src/parsers/reconcile.ts`
- Test: `server/src/parsers/reconcile.test.ts`

**Interfaces:**
- Consumes: `ParsedStatement`, `ReconciliationResult`, `Currency`.
- Produces: `export function reconcile(statement: ParsedStatement, tolerance?: { ars: number; usd: number }): ReconciliationResult`. Compara `Σ(rows con type==='purchase')` por moneda contra `header.totals.totalConsumos`. Default tolerance `{ ars: 1, usd: 0.01 }`.

- [ ] **Step 1: Escribir el test que falla**

`server/src/parsers/reconcile.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile.js";
import type { ParsedStatement } from "@ledgerly/shared";

function make(purchaseArs: number, totalArs: number): ParsedStatement {
  return {
    header: {
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
      totals: {
        totalConsumos: { ars: totalArs, usd: 0 },
        saldoActual: { ars: 0, usd: 0 }, pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 },
      },
    },
    rows: [
      { date: "2026-05-04", descriptionRaw: "A", merchant: "A", amount: purchaseArs, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null,
        installmentTotal: null, comprobante: "1" },
      { date: "2026-06-08", descriptionRaw: "PAGO", merchant: "PAGO", amount: 9999, currency: "ARS",
        direction: "credit", type: "payment", isInstallment: false, installmentCurrent: null,
        installmentTotal: null, comprobante: null },
    ],
  };
}

describe("reconcile", () => {
  it("ok cuando la suma de compras coincide con Total Consumos (ignora pagos)", () => {
    const r = reconcile(make(2400, 2400));
    expect(r.ok).toBe(true);
    expect(r.entries.find((e) => e.currency === "ARS")).toMatchObject({ expected: 2400, parsed: 2400, ok: true });
  });

  it("no-ok cuando difiere más que la tolerancia", () => {
    const r = reconcile(make(2400, 2500));
    expect(r.ok).toBe(false);
    expect(r.entries.find((e) => e.currency === "ARS")).toMatchObject({ diff: 100, ok: false });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- reconcile`
Expected: FAIL — `reconcile` inexistente.

- [ ] **Step 3: Implementar la reconciliación**

`server/src/parsers/reconcile.ts`:
```ts
import type { Currency, ParsedStatement, ReconciliationEntry, ReconciliationResult } from "@ledgerly/shared";

const DEFAULT_TOLERANCE = { ars: 1, usd: 0.01 };

export function reconcile(
  statement: ParsedStatement,
  tolerance: { ars: number; usd: number } = DEFAULT_TOLERANCE,
): ReconciliationResult {
  const sum = (currency: Currency) =>
    statement.rows
      .filter((r) => r.type === "purchase" && r.currency === currency)
      .reduce((acc, r) => acc + r.amount, 0);

  const build = (currency: Currency, expected: number, tol: number): ReconciliationEntry => {
    const parsed = Math.round(sum(currency) * 100) / 100;
    const diff = Math.round((parsed - expected) * 100) / 100;
    return { currency, expected, parsed, diff, ok: Math.abs(diff) <= tol };
  };

  const entries: ReconciliationEntry[] = [
    build("ARS", statement.header.totals.totalConsumos.ars, tolerance.ars),
    build("USD", statement.header.totals.totalConsumos.usd, tolerance.usd),
  ];

  return { ok: entries.every((e) => e.ok), entries };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- reconcile`
Expected: PASS (2 tests).

- [ ] **Step 5: Stage**

```bash
git add server/src/parsers/reconcile.ts server/src/parsers/reconcile.test.ts
# commit sugerido: "feat(parsers): reconciliación de consumos vs totales impresos"
```

---

### Task 9: Orquestador de ingesta (motor completo)

**Files:**
- Create: `server/src/ingestion/errors.ts`
- Create: `server/src/ingestion/parseStatement.ts`
- Test: `server/src/ingestion/parseStatement.test.ts`

**Interfaces:**
- Consumes: `extractPdfText`, `detectParser`, `reconcile`, tipos de shared.
- Produces:
  - Errores: `class NoTextError`, `class UnsupportedFormatError`, `class NoTransactionsError` (todos extienden `Error`).
  - `export async function parseStatement(data: Uint8Array): Promise<{ statement: ParsedStatement; reconciliation: ReconciliationResult; meta: PdfMeta }>` — punto de entrada del motor, consumido por la Fase 2 (HTTP).

- [ ] **Step 1: Escribir el test que falla (stub de extract + e2e skipIf real)**

`server/src/ingestion/parseStatement.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const readFixture = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../parsers/__fixtures__/${f}`, import.meta.url)), "utf8");

vi.mock("../pdf/extract.js", () => ({
  extractPdfText: vi.fn(),
}));
import { extractPdfText } from "../pdf/extract.js";
import { parseStatement } from "./parseStatement.js";
import { NoTextError, UnsupportedFormatError } from "./errors.js";

const mocked = vi.mocked(extractPdfText);
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };

describe("parseStatement (motor)", () => {
  it("parsea y reconcilia un statement Visa sintético", async () => {
    mocked.mockResolvedValue({ text: readFixture("visa-signature.sample.txt"), meta });
    const { statement, reconciliation } = await parseStatement(new Uint8Array());
    expect(statement.header.issuer).toBe("visa_signature");
    expect(statement.rows.length).toBeGreaterThan(0);
    expect(reconciliation.ok).toBe(true);
  });

  it("lanza NoTextError si no hay texto", async () => {
    mocked.mockResolvedValue({ text: "   ", meta });
    await expect(parseStatement(new Uint8Array())).rejects.toBeInstanceOf(NoTextError);
  });

  it("lanza UnsupportedFormatError si ningún parser detecta", async () => {
    mocked.mockResolvedValue({ text: "banco totalmente desconocido con mucho texto".repeat(20), meta });
    await expect(parseStatement(new Uint8Array())).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});

const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
const visaReal = examples + "UltimaLiquidacion.pdf";
const icbcReal = examples + "Resumen14jul2026.pdf";

describe.skipIf(!(existsSync(visaReal) && existsSync(icbcReal)))("parseStatement (PDFs reales, e2e)", () => {
  it("Visa real: reconcilia y trae movimientos", async () => {
    const real = await vi.importActual<typeof import("../pdf/extract.js")>("../pdf/extract.js");
    mocked.mockImplementation(real.extractPdfText);
    const { statement, reconciliation } = await parseStatement(readFileSync(visaReal));
    expect(statement.header.issuer).toBe("visa_signature");
    expect(statement.rows.filter((r) => r.type === "purchase").length).toBeGreaterThan(5);
    expect(reconciliation.ok).toBe(true);
  });

  it("ICBC real: reconcilia y trae movimientos", async () => {
    const real = await vi.importActual<typeof import("../pdf/extract.js")>("../pdf/extract.js");
    mocked.mockImplementation(real.extractPdfText);
    const { statement, reconciliation } = await parseStatement(readFileSync(icbcReal));
    expect(statement.header.issuer).toBe("icbc");
    expect(statement.rows.filter((r) => r.type === "purchase").length).toBeGreaterThan(3);
    expect(reconciliation.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- parseStatement`
Expected: FAIL — `parseStatement` / `errors` inexistentes.

- [ ] **Step 3: Implementar errores y orquestador**

`server/src/ingestion/errors.ts`:
```ts
export class NoTextError extends Error {
  constructor() {
    super("No se pudo extraer texto del PDF (¿escaneado o corrupto?)");
    this.name = "NoTextError";
  }
}

export class UnsupportedFormatError extends Error {
  constructor() {
    super("Formato de resumen no reconocido");
    this.name = "UnsupportedFormatError";
  }
}

export class NoTransactionsError extends Error {
  constructor() {
    super("No se encontraron movimientos en el resumen");
    this.name = "NoTransactionsError";
  }
}
```

`server/src/ingestion/parseStatement.ts`:
```ts
import type { ParsedStatement, PdfMeta, ReconciliationResult } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { detectParser } from "../parsers/registry.js";
import { reconcile } from "../parsers/reconcile.js";
import { NoTextError, NoTransactionsError, UnsupportedFormatError } from "./errors.js";

export async function parseStatement(data: Uint8Array): Promise<{
  statement: ParsedStatement;
  reconciliation: ReconciliationResult;
  meta: PdfMeta;
}> {
  const { text, meta } = await extractPdfText(data);
  if (text.trim().length < 20) throw new NoTextError();

  const parser = detectParser(text, meta);
  if (!parser) throw new UnsupportedFormatError();

  const statement = parser.parse(text, meta);
  if (statement.rows.length === 0) throw new NoTransactionsError();

  return { statement, reconciliation: reconcile(statement), meta };
}
```

- [ ] **Step 4: Correr los tests (unit + e2e si están los PDFs)**

Run: `npm test -- parseStatement`
Expected: 3 tests unit PASS. Los 2 e2e PASS si `examples/*.pdf` están presentes; si no, aparecen skipped.

> **Punto crítico del spike:** si los tests e2e FALLAN (reconciliación no cuadra o issuer mal), es porque el layout real extraído por unpdf difiere de los fixtures sintéticos. Correr `npx tsx server/scripts/capture-fixtures.ts`, comparar `examples/*-real.txt` con los `.sample.txt`, y ajustar las regex de `visaSignature.ts` / `icbc.ts` (y los fixtures) hasta que ambos e2e queden verdes. Este es el objetivo del milestone 0.

- [ ] **Step 5: Correr toda la suite y typecheck**

Run:
```bash
npm test
npm run typecheck
```
Expected: toda la suite verde; typecheck sin errores.

- [ ] **Step 6: Stage**

```bash
git add server/src/ingestion
# commit sugerido: "feat(ingestion): orquestador parseStatement (extract→detect→parse→reconcile)"
```

---

## Definition of Done (Fase 1)

- `npm test` verde: normalización, ambos parsers, registry, reconciliación, orquestador.
- `parseStatement(buffer)` devuelve `ParsedStatement` + `ReconciliationResult` para Visa e ICBC.
- Los tests e2e contra los PDFs reales reconcilian OK (spike de extracción resuelto y documentado).
- `npm run typecheck` sin errores; sin `any`.
- Nada de datos financieros reales commiteados (fixtures sintéticos; `examples/` gitignoreado).

**Entregable para la Fase 2:** el módulo `@ledgerly/server` expone `parseStatement`, los errores tipados y los tipos de `@ledgerly/shared` que la capa HTTP/persistencia consumirá.
