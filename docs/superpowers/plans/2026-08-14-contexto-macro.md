# Contexto macro (dólar, inflación y UVA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la página **Contexto** (`/contexto`): un termómetro de tres señales macro —dólar real, tasa real en pesos y rendimiento de adelantar capital del crédito UVA— más una tarjeta de veredicto que ordena las tres opciones por retorno real esperado.

**Architecture:** El server trae de argentinadatos tres series diarias (dólar oficial, UVA, tasa de depósitos a 30 días), las persiste en una única colección `MacroSeries` con discriminador `serie`, y expone la **agregación mensual** en `GET /api/macro/series`. El cliente calcula señales y veredicto en `macroSignals.ts`, un módulo puro sin React ni red, y los componentes solo pintan estructuras ya resueltas. Ventana fija: enero 2025 en adelante.

**Tech Stack:** TypeScript, Express + Mongoose (server), React 18 + MUI + `@nivo/line` / `@nivo/bar` + React Query (client), Zod DTOs en `shared`, Vitest + supertest + `mongodb-memory-server`, bun.

**Spec:** `docs/superpowers/specs/2026-08-14-contexto-macro-design.md`

## Global Constraints

- **Ventana:** `MACRO_START = "2025-01-01"`. Ni las señales ni los gráficos miran nada anterior. Es la única constante a tocar si se quiere más historia.
- **Fuentes verificadas (2026-08-14):**
  - dólar oficial `GET https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial` → `{casa, compra, venta, fecha}[]`, se usa **`venta`**;
  - UVA `GET https://api.argentinadatos.com/v1/finanzas/indices/uva` → `{fecha, valor}[]`;
  - tasa 30 días `GET https://api.argentinadatos.com/v1/finanzas/tasas/depositos30Dias` → `{fecha, valor}[]`, `valor` en **porcentaje anual** desde 2025 (en años viejos venía como fracción: normalizar con `valor < 1 → valor * 100`);
  - inflación: ya persistida en `InflationRate`, no se toca.
- **Umbrales:** `DOLAR_REAL_BANDA = 10` (índice, base 100), `TASA_REAL_BANDA = 2` (puntos porcentuales). Constantes exportadas arriba de `macroSignals.ts`.
- **Convención de mes:** el valor mensual de cada serie es el **último dato del mes**; `ipc(m)` es el nivel de precios a fin de `m` y arranca en `1` en el primer mes de la ventana.
- **Sin comentarios en el código** (regla global del usuario): nombres autoexplicativos, nada de `//`/JSDoc salvo pedido explícito.
- **Componentes React:** funcionales, destructuring en la firma, fragments cortos, early returns para loading/vacío, `key` con id único (nunca índice), `useMemo` para los cálculos. Tipos explícitos, `any` prohibido.
- **Commits:** el usuario maneja git. Cada tarea termina con verificación (tests/typecheck en verde) y `git add` para dejar el cambio staged; **no** correr `git commit` salvo que el usuario lo pida en el momento.
- **Correr tests:** `bunx vitest run <archivo>`; typecheck: `bun run typecheck`.

---

### Task 1: DTOs macro en shared

**Files:**
- Modify: `shared/src/dtos.ts`
- Test: `shared/src/dtos.test.ts`

**Interfaces:**
- Produces: `macroMonthSchema`, `macroSpotSchema`, `macroSeriesDtoSchema` y los tipos `MacroMonth = { periodo: string; usdOficial: number | null; uva: number | null; tasa30: number | null; inflacion: number | null }`, `MacroSpot = { fecha: string; usdOficial: number | null; uva: number | null; tasa30: number | null }`, `MacroSeriesDTO = { desde: string; meses: MacroMonth[]; hoy: MacroSpot }`. Consumidos por la agregación (Task 5), el hook y todo el cliente (Tasks 6-10). Se re-exportan solos vía `shared/src/index.ts`, que ya hace `export * from "./dtos.js"`.

- [ ] **Step 1: Write the failing test**

En `shared/src/dtos.test.ts`, al final del archivo, agregar:

```typescript
import { macroSeriesDtoSchema } from "./dtos.js";

describe("macroSeriesDtoSchema", () => {
  it("valida la serie macro mensual", () => {
    const dto = {
      desde: "2025-01",
      meses: [{ periodo: "2025-01", usdOficial: 1035.5, uva: 1250.3, tasa30: 29.1, inflacion: 2.2 }],
      hoy: { fecha: "2026-08-14", usdOficial: 1515, uva: 2075.56, tasa30: 20.04 },
    };
    expect(macroSeriesDtoSchema.parse(dto)).toEqual(dto);
  });

  it("acepta huecos como null en cualquier serie", () => {
    const dto = {
      desde: "2025-01",
      meses: [{ periodo: "2025-01", usdOficial: null, uva: null, tasa30: null, inflacion: null }],
      hoy: { fecha: "2026-08-14", usdOficial: null, uva: null, tasa30: null },
    };
    expect(macroSeriesDtoSchema.parse(dto).meses[0].usdOficial).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: FAIL — `macroSeriesDtoSchema` no existe (import undefined).

- [ ] **Step 3: Write minimal implementation**

En `shared/src/dtos.ts`, después de `monthlyUsdStatSchema` (antes del bloque de `couponImportResultSchema`), agregar:

```typescript
export const macroMonthSchema = z.object({
  periodo: z.string(),
  usdOficial: z.number().nullable(),
  uva: z.number().nullable(),
  tasa30: z.number().nullable(),
  inflacion: z.number().nullable(),
});

export const macroSpotSchema = z.object({
  fecha: z.string(),
  usdOficial: z.number().nullable(),
  uva: z.number().nullable(),
  tasa30: z.number().nullable(),
});

export const macroSeriesDtoSchema = z.object({
  desde: z.string(),
  meses: z.array(macroMonthSchema),
  hoy: macroSpotSchema,
});
```

Y en la zona de `export type ... = z.infer<...>` del final, junto a `MonthlyUsdStat`:

```typescript
export type MacroMonth = z.infer<typeof macroMonthSchema>;
export type MacroSpot = z.infer<typeof macroSpotSchema>;
export type MacroSeriesDTO = z.infer<typeof macroSeriesDtoSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add shared/src/dtos.ts shared/src/dtos.test.ts`

---

### Task 2: Exponer `tasaRealMensual` en el resumen del crédito

`computeCreditProgress` ya deriva la tasa real mensual `i` del crecimiento del capital en UVA, pero se la guarda. El veredicto la necesita: es el rendimiento de adelantar capital.

**Files:**
- Modify: `shared/src/dtos.ts` (campo en `creditSummaryDtoSchema`)
- Modify: `shared/src/dtos.test.ts` (el fixture existente de `creditSummaryDtoSchema` queda incompleto sin el campo nuevo y falla)
- Modify: `server/src/stats/amortization.ts:47-63` (objeto de retorno)
- Test: `server/src/stats/amortization.test.ts`

**Interfaces:**
- Produces: `CreditSummaryDTO.tasaRealMensual: number` — tasa **real mensual** en fracción (ej. `0.0042` = 0,42 % mensual), no en porcentaje. Consumida por `retornoAdelantar` (Task 7).

> Los tres archivos van juntos en una sola tarea: agregar el campo al schema sin devolverlo desde `computeCreditProgress` rompe el typecheck, porque esa función declara `CreditSummaryDTO` como tipo de retorno.

- [ ] **Step 1: Write the failing test**

En `server/src/stats/amortization.test.ts`, agregar dentro de `describe("computeCreditProgress", ...)`:

```typescript
it("expone la tasa real mensual (fallback TNA con un solo cupón)", () => {
  const r = computeCreditProgress([inputs[0]])!;
  expect(r.tasaRealMensual).toBeCloseTo(inputs[0].tna / 12 / 100, 12);
});

it("expone una tasa real mensual plausible con los cupones reales", () => {
  const r = computeCreditProgress(inputs)!;
  expect(r.tasaRealMensual).toBeGreaterThan(0);
  expect(r.tasaRealMensual).toBeLessThan(0.05);
});
```

Y en `shared/src/dtos.test.ts`, en el fixture de `describe("creditSummaryDtoSchema", ...)`, agregar el campo a la última línea del objeto:

```typescript
      porcentajeAvanceCapital: 0.017, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9,
      tasaRealMensual: 0.0074,
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/stats/amortization.test.ts shared/src/dtos.test.ts`
Expected: FAIL — `tasaRealMensual` es `undefined` en el resultado de `computeCreditProgress`, y el schema rechaza la clave desconocida/faltante.

- [ ] **Step 3a: Agregar el campo al schema**

En `shared/src/dtos.ts`, dentro de `creditSummaryDtoSchema`, después de `tna: z.number(),`:

```typescript
  tasaRealMensual: z.number(),
```

- [ ] **Step 3b: Devolverlo desde `computeCreditProgress`**

En `server/src/stats/amortization.ts`, en el objeto de retorno, después de `tna: last.tna,`:

```typescript
    tasaRealMensual: i,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run server/src/stats/amortization.test.ts shared/src/dtos.test.ts`
Expected: PASS.

Run: `bunx vitest run server/src/http/routes/credits.test.ts`
Expected: PASS — ese test lee campos sueltos (`res.body.cuotasTotales`), así que el campo nuevo no lo rompe.

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add shared/src/dtos.ts shared/src/dtos.test.ts server/src/stats/amortization.ts server/src/stats/amortization.test.ts`

---

### Task 3: Fetchers de las tres series macro

**Files:**
- Create: `server/src/fx/macroSources.ts`
- Test: `server/src/fx/macroSources.test.ts`

**Interfaces:**
- Produces: `MACRO_START = "2025-01-01"`, `interface SeriePoint { fecha: string; valor: number }`, y `fetchOficialSeries()`, `fetchUvaSeries()`, `fetchTasa30Series()`, todas `Promise<SeriePoint[]>` filtradas a `fecha >= MACRO_START` y devolviendo `[]` ante error de red o respuesta inválida. Consumidos por el backfill (Task 4) y `MACRO_START` también por la ruta (Task 5).

- [ ] **Step 1: Write the failing test**

Crear `server/src/fx/macroSources.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOficialSeries, fetchUvaSeries, fetchTasa30Series, MACRO_START } from "./macroSources.js";

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 404, headers: { "Content-Type": "application/json" } });
}
afterEach(() => vi.restoreAllMocks());

describe("MACRO_START", () => {
  it("recorta la ventana en enero 2025", () => {
    expect(MACRO_START).toBe("2025-01-01");
  });
});

describe("fetchOficialSeries", () => {
  it("mapea venta y descarta lo anterior a la ventana", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([
      { casa: "oficial", compra: 3.97, venta: 3.98, fecha: "2011-01-03" },
      { casa: "oficial", compra: 1000, venta: 1010, fecha: "2025-01-02" },
      { casa: "oficial", compra: 1465, venta: 1515, fecha: "2026-08-13" },
    ])));
    expect(await fetchOficialSeries()).toEqual([
      { fecha: "2025-01-02", valor: 1010 },
      { fecha: "2026-08-13", valor: 1515 },
    ]);
  });

  it("devuelve [] si fetch lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await fetchOficialSeries()).toEqual([]);
  });

  it("devuelve [] si la respuesta no es ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, false)));
    expect(await fetchOficialSeries()).toEqual([]);
  });
});

describe("fetchUvaSeries", () => {
  it("mapea valor y filtra por ventana", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([
      { fecha: "2016-03-31", valor: 14.05 },
      { fecha: "2025-01-02", valor: 1250.3 },
    ])));
    expect(await fetchUvaSeries()).toEqual([{ fecha: "2025-01-02", valor: 1250.3 }]);
  });
});

describe("fetchTasa30Series", () => {
  it("deja el porcentaje como viene", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{ fecha: "2026-08-12", valor: 20.04 }])));
    expect(await fetchTasa30Series()).toEqual([{ fecha: "2026-08-12", valor: 20.04 }]);
  });

  it("normaliza a porcentaje los valores que vienen como fracción", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{ fecha: "2025-01-02", valor: 0.29 }])));
    expect(await fetchTasa30Series()).toEqual([{ fecha: "2025-01-02", valor: 29 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/fx/macroSources.test.ts`
Expected: FAIL — módulo `./macroSources.js` inexistente.

- [ ] **Step 3: Write minimal implementation**

Crear `server/src/fx/macroSources.ts`:

```typescript
export const MACRO_START = "2025-01-01";

const DOLAR_URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial";
const UVA_URL = "https://api.argentinadatos.com/v1/finanzas/indices/uva";
const TASA_URL = "https://api.argentinadatos.com/v1/finanzas/tasas/depositos30Dias";

interface DolarRow {
  fecha: string;
  venta: number;
}

interface ValorRow {
  fecha: string;
  valor: number;
}

export interface SeriePoint {
  fecha: string;
  valor: number;
}

async function fetchRows<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const body = (await res.json()) as T[] | null;
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

const inWindow = (fecha: unknown): boolean => typeof fecha === "string" && fecha >= MACRO_START;

const toPercent = (valor: number): number => (valor < 1 ? valor * 100 : valor);

export async function fetchOficialSeries(): Promise<SeriePoint[]> {
  const rows = await fetchRows<DolarRow>(DOLAR_URL);
  return rows
    .filter((row) => inWindow(row?.fecha) && typeof row?.venta === "number")
    .map((row) => ({ fecha: row.fecha, valor: row.venta }));
}

export async function fetchUvaSeries(): Promise<SeriePoint[]> {
  const rows = await fetchRows<ValorRow>(UVA_URL);
  return rows
    .filter((row) => inWindow(row?.fecha) && typeof row?.valor === "number")
    .map((row) => ({ fecha: row.fecha, valor: row.valor }));
}

export async function fetchTasa30Series(): Promise<SeriePoint[]> {
  const rows = await fetchRows<ValorRow>(TASA_URL);
  return rows
    .filter((row) => inWindow(row?.fecha) && typeof row?.valor === "number")
    .map((row) => ({ fecha: row.fecha, valor: toPercent(row.valor) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/fx/macroSources.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add server/src/fx/macroSources.ts server/src/fx/macroSources.test.ts`

---

### Task 4: Colección `MacroSeries` + backfill `seed:macro`

**Files:**
- Modify: `server/src/db/models.ts` (schema + índice + tipo + modelo)
- Create: `server/src/import/backfillMacro.ts`
- Modify: `package.json` (script `seed:macro`)
- Test: `server/src/import/backfillMacro.test.ts`

**Interfaces:**
- Consumes: `fetchOficialSeries` / `fetchUvaSeries` / `fetchTasa30Series` / `SeriePoint` (Task 3), `backfillInflation` (existente).
- Produces: `MacroSeriesModel` + `type MacroSeriesDoc = { serie: string; fecha: string; valor: number }` (consumidos por la ruta en Task 5); `backfillMacro(): Promise<{ usd_oficial: number; uva: number; tasa30: number; inflacion: number }>`.

- [ ] **Step 1: Write the failing test**

Crear `server/src/import/backfillMacro.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/macroSources.js", () => ({
  MACRO_START: "2025-01-01",
  fetchOficialSeries: vi.fn(),
  fetchUvaSeries: vi.fn(),
  fetchTasa30Series: vi.fn(),
}));
vi.mock("./backfillInflation.js", () => ({ backfillInflation: vi.fn() }));

import { fetchOficialSeries, fetchUvaSeries, fetchTasa30Series } from "../fx/macroSources.js";
import { backfillInflation } from "./backfillInflation.js";
import { backfillMacro } from "./backfillMacro.js";
import { MacroSeriesModel } from "../db/models.js";

withDb();

const mockedUsd = vi.mocked(fetchOficialSeries);
const mockedUva = vi.mocked(fetchUvaSeries);
const mockedTasa = vi.mocked(fetchTasa30Series);
const mockedInflacion = vi.mocked(backfillInflation);

describe("backfillMacro", () => {
  it("persiste las tres series con su discriminador", async () => {
    mockedUsd.mockResolvedValue([{ fecha: "2025-01-02", valor: 1010 }, { fecha: "2025-01-03", valor: 1015 }]);
    mockedUva.mockResolvedValue([{ fecha: "2025-01-02", valor: 1250.3 }]);
    mockedTasa.mockResolvedValue([{ fecha: "2025-01-02", valor: 29.1 }]);
    mockedInflacion.mockResolvedValue({ upserted: 7 });

    const r = await backfillMacro();
    expect(r).toEqual({ usd_oficial: 2, uva: 1, tasa30: 1, inflacion: 7 });

    const docs = await MacroSeriesModel.find().sort({ serie: 1, fecha: 1 }).lean();
    expect(docs).toHaveLength(4);
    expect(docs.map((d) => `${d.serie}:${d.fecha}`)).toEqual([
      "tasa30:2025-01-02", "usd_oficial:2025-01-02", "usd_oficial:2025-01-03", "uva:2025-01-02",
    ]);
  });

  it("es idempotente y actualiza el valor por (serie, fecha)", async () => {
    mockedUsd.mockResolvedValue([{ fecha: "2025-01-02", valor: 1010 }]);
    mockedUva.mockResolvedValue([]);
    mockedTasa.mockResolvedValue([]);
    mockedInflacion.mockResolvedValue({ upserted: 0 });
    await backfillMacro();

    mockedUsd.mockResolvedValue([{ fecha: "2025-01-02", valor: 1099 }]);
    await backfillMacro();

    const docs = await MacroSeriesModel.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].valor).toBe(1099);
  });

  it("no rompe si una serie viene vacía", async () => {
    mockedUsd.mockResolvedValue([]);
    mockedUva.mockResolvedValue([]);
    mockedTasa.mockResolvedValue([]);
    mockedInflacion.mockResolvedValue({ upserted: 0 });
    expect(await backfillMacro()).toEqual({ usd_oficial: 0, uva: 0, tasa30: 0, inflacion: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/import/backfillMacro.test.ts`
Expected: FAIL — `MacroSeriesModel` y `backfillMacro` inexistentes.

- [ ] **Step 3a: Agregar el modelo**

En `server/src/db/models.ts`, después de `inflationRateSchema` (línea ~141) y antes del bloque de `export type ... = InferSchemaType<...>`:

```typescript
const macroSeriesSchema = new Schema({
  serie: { type: String, required: true, enum: ["usd_oficial", "uva", "tasa30"] },
  fecha: { type: String, required: true },
  valor: { type: Number, required: true },
});
macroSeriesSchema.index({ serie: 1, fecha: 1 }, { unique: true });
```

En el bloque de type exports, junto a `InflationRateDoc`:

```typescript
export type MacroSeriesDoc = InferSchemaType<typeof macroSeriesSchema>;
```

Y al final, después de `InflationRateModel`:

```typescript
export const MacroSeriesModel: Model<MacroSeriesDoc> =
  mongoose.models.MacroSeries ?? mongoose.model("MacroSeries", macroSeriesSchema);
```

- [ ] **Step 3b: Escribir el backfill**

Crear `server/src/import/backfillMacro.ts`:

```typescript
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { MacroSeriesModel } from "../db/models.js";
import { fetchOficialSeries, fetchTasa30Series, fetchUvaSeries, type SeriePoint } from "../fx/macroSources.js";
import { backfillInflation } from "./backfillInflation.js";

export type MacroSerieName = "usd_oficial" | "uva" | "tasa30";

export interface MacroBackfillResult {
  usd_oficial: number;
  uva: number;
  tasa30: number;
  inflacion: number;
}

async function upsertSerie(serie: MacroSerieName, points: SeriePoint[]): Promise<number> {
  if (points.length === 0) return 0;
  await MacroSeriesModel.bulkWrite(
    points.map(({ fecha, valor }) => ({
      updateOne: { filter: { serie, fecha }, update: { $set: { serie, fecha, valor } }, upsert: true },
    })),
  );
  return points.length;
}

export async function backfillMacro(): Promise<MacroBackfillResult> {
  const [usd, uva, tasa30] = await Promise.all([fetchOficialSeries(), fetchUvaSeries(), fetchTasa30Series()]);
  const inflacion = await backfillInflation();
  return {
    usd_oficial: await upsertSerie("usd_oficial", usd),
    uva: await upsertSerie("uva", uva),
    tasa30: await upsertSerie("tasa30", tasa30),
    inflacion: inflacion.upserted,
  };
}

if (process.argv[1]?.endsWith("backfillMacro.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillMacro();
  console.log(`Macro backfill: dólar ${r.usd_oficial}, UVA ${r.uva}, tasa ${r.tasa30}, inflación ${r.inflacion}`);
  await disconnectMongo();
}
```

- [ ] **Step 3c: Agregar el script npm**

En `package.json` (raíz), dentro de `scripts`, junto a los otros `seed:*`:

```json
"seed:macro": "tsx server/src/import/backfillMacro.ts",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/import/backfillMacro.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add server/src/db/models.ts server/src/import/backfillMacro.ts server/src/import/backfillMacro.test.ts package.json`

---

### Task 5: Agregación mensual + `GET /api/macro/series`

**Files:**
- Create: `server/src/stats/macroSeries.ts`
- Create: `server/src/http/routes/macro.ts`
- Modify: `server/src/http/app.ts` (import + `app.use`)
- Test: `server/src/stats/macroSeries.test.ts`
- Test: `server/src/http/routes/macro.test.ts`

**Interfaces:**
- Consumes: `MacroSeriesModel` (Task 4), `InflationRateModel` (existente), `MACRO_START` (Task 3), `MacroSeriesDTO`/`MacroMonth`/`MacroSpot` (Task 1).
- Produces: `interface MacroSeriesPoint { serie: string; fecha: string; valor: number }`, `interface InflationPoint { periodo: string; variacionMensual: number }`, `buildMonthlySeries(points, inflation, desde): MacroSeriesDTO`, y la ruta `GET /api/macro/series`. Consumida por el hook (Task 8).

- [ ] **Step 1: Write the failing test**

Crear `server/src/stats/macroSeries.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildMonthlySeries, type MacroSeriesPoint } from "./macroSeries.js";

const point = (serie: string, fecha: string, valor: number): MacroSeriesPoint => ({ serie, fecha, valor });

describe("buildMonthlySeries", () => {
  it("toma el último valor de cada mes por serie", () => {
    const result = buildMonthlySeries(
      [
        point("usd_oficial", "2025-01-02", 1000),
        point("usd_oficial", "2025-01-31", 1050),
        point("usd_oficial", "2025-02-28", 1100),
        point("uva", "2025-01-31", 1250),
      ],
      [{ periodo: "2025-01", variacionMensual: 2.2 }],
      "2025-01",
    );
    expect(result.meses).toEqual([
      { periodo: "2025-01", usdOficial: 1050, uva: 1250, tasa30: null, inflacion: 2.2 },
      { periodo: "2025-02", usdOficial: 1100, uva: null, tasa30: null, inflacion: null },
    ]);
  });

  it("deja el mes en curso parcial y lo refleja en hoy", () => {
    const result = buildMonthlySeries(
      [point("usd_oficial", "2026-08-01", 1500), point("usd_oficial", "2026-08-13", 1515)],
      [],
      "2025-01",
    );
    expect(result.meses).toEqual([{ periodo: "2026-08", usdOficial: 1515, uva: null, tasa30: null, inflacion: null }]);
    expect(result.hoy).toEqual({ fecha: "2026-08-13", usdOficial: 1515, uva: null, tasa30: null });
  });

  it("hoy usa la fecha más reciente entre las tres series", () => {
    const result = buildMonthlySeries(
      [
        point("usd_oficial", "2026-08-13", 1515),
        point("uva", "2026-08-14", 2075.56),
        point("tasa30", "2026-08-12", 20.04),
      ],
      [],
      "2025-01",
    );
    expect(result.hoy).toEqual({ fecha: "2026-08-14", usdOficial: 1515, uva: 2075.56, tasa30: 20.04 });
  });

  it("descarta períodos anteriores a desde", () => {
    const result = buildMonthlySeries(
      [point("usd_oficial", "2024-12-31", 900), point("usd_oficial", "2025-01-31", 1050)],
      [{ periodo: "2024-11", variacionMensual: 2.4 }],
      "2025-01",
    );
    expect(result.meses.map((mes) => mes.periodo)).toEqual(["2025-01"]);
  });

  it("sin datos devuelve meses vacío y hoy en null", () => {
    const result = buildMonthlySeries([], [], "2025-01");
    expect(result).toEqual({
      desde: "2025-01",
      meses: [],
      hoy: { fecha: "2025-01", usdOficial: null, uva: null, tasa30: null },
    });
  });
});
```

Crear `server/src/http/routes/macro.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { InflationRateModel, MacroSeriesModel } from "../../db/models.js";
import { createApp } from "../app.js";

withDb();
const app = createApp();

describe("GET /api/macro/series", () => {
  it("devuelve la serie mensual y el spot", async () => {
    await MacroSeriesModel.create([
      { serie: "usd_oficial", fecha: "2025-01-31", valor: 1050 },
      { serie: "uva", fecha: "2025-01-31", valor: 1250.3 },
      { serie: "tasa30", fecha: "2025-01-31", valor: 29.1 },
    ]);
    await InflationRateModel.create({ periodo: "2025-01", variacionMensual: 2.2 });

    const res = await request(app).get("/api/macro/series");
    expect(res.status).toBe(200);
    expect(res.body.desde).toBe("2025-01");
    expect(res.body.meses).toEqual([
      { periodo: "2025-01", usdOficial: 1050, uva: 1250.3, tasa30: 29.1, inflacion: 2.2 },
    ]);
    expect(res.body.hoy.usdOficial).toBe(1050);
  });

  it("sin series cargadas devuelve meses vacío", async () => {
    const res = await request(app).get("/api/macro/series");
    expect(res.status).toBe(200);
    expect(res.body.meses).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run server/src/stats/macroSeries.test.ts server/src/http/routes/macro.test.ts`
Expected: FAIL — módulo `./macroSeries.js` inexistente y `/api/macro/series` responde 404.

- [ ] **Step 3a: Escribir la agregación**

Crear `server/src/stats/macroSeries.ts`:

```typescript
import type { MacroMonth, MacroSeriesDTO, MacroSpot } from "@ledgerly/shared";

export interface MacroSeriesPoint {
  serie: string;
  fecha: string;
  valor: number;
}

export interface InflationPoint {
  periodo: string;
  variacionMensual: number;
}

type SerieName = "usd_oficial" | "uva" | "tasa30";

function lastByMonth(points: MacroSeriesPoint[], serie: SerieName): Map<string, MacroSeriesPoint> {
  const byMonth = new Map<string, MacroSeriesPoint>();
  for (const point of points) {
    if (point.serie !== serie) continue;
    const periodo = point.fecha.slice(0, 7);
    const current = byMonth.get(periodo);
    if (!current || point.fecha > current.fecha) byMonth.set(periodo, point);
  }
  return byMonth;
}

function latest(byMonth: Map<string, MacroSeriesPoint>): MacroSeriesPoint | null {
  let found: MacroSeriesPoint | null = null;
  for (const point of byMonth.values()) {
    if (!found || point.fecha > found.fecha) found = point;
  }
  return found;
}

export function buildMonthlySeries(
  points: MacroSeriesPoint[],
  inflation: InflationPoint[],
  desde: string,
): MacroSeriesDTO {
  const usd = lastByMonth(points, "usd_oficial");
  const uva = lastByMonth(points, "uva");
  const tasa30 = lastByMonth(points, "tasa30");
  const ipc = new Map(inflation.map((row) => [row.periodo, row.variacionMensual]));

  const periodos = [...new Set([...usd.keys(), ...uva.keys(), ...tasa30.keys(), ...ipc.keys()])]
    .filter((periodo) => periodo >= desde)
    .sort();

  const meses: MacroMonth[] = periodos.map((periodo) => ({
    periodo,
    usdOficial: usd.get(periodo)?.valor ?? null,
    uva: uva.get(periodo)?.valor ?? null,
    tasa30: tasa30.get(periodo)?.valor ?? null,
    inflacion: ipc.get(periodo) ?? null,
  }));

  const spots = [latest(usd), latest(uva), latest(tasa30)];
  const fechas = spots.filter((spot): spot is MacroSeriesPoint => spot !== null).map((spot) => spot.fecha).sort();

  const hoy: MacroSpot = {
    fecha: fechas[fechas.length - 1] ?? desde,
    usdOficial: spots[0]?.valor ?? null,
    uva: spots[1]?.valor ?? null,
    tasa30: spots[2]?.valor ?? null,
  };

  return { desde, meses, hoy };
}
```

- [ ] **Step 3b: Escribir la ruta**

Crear `server/src/http/routes/macro.ts`:

```typescript
import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { InflationRateModel, MacroSeriesModel } from "../../db/models.js";
import { buildMonthlySeries } from "../../stats/macroSeries.js";
import { MACRO_START } from "../../fx/macroSources.js";

export const macroRouter = Router();

const DESDE = MACRO_START.slice(0, 7);

macroRouter.get("/series", asyncHandler(async (_req, res) => {
  const [points, inflation] = await Promise.all([
    MacroSeriesModel.find({ fecha: { $gte: MACRO_START } }).sort({ fecha: 1 }).lean(),
    InflationRateModel.find({ periodo: { $gte: DESDE } }).sort({ periodo: 1 }).lean(),
  ]);
  res.json(buildMonthlySeries(
    points.map((point) => ({ serie: point.serie, fecha: point.fecha, valor: point.valor })),
    inflation.map((row) => ({ periodo: row.periodo, variacionMensual: row.variacionMensual })),
    DESDE,
  ));
}));
```

- [ ] **Step 3c: Registrar la ruta**

En `server/src/http/app.ts`, agregar el import junto a los otros routers:

```typescript
import { macroRouter } from "./routes/macro.js";
```

Y la línea de uso junto a `app.use("/api/inflation", inflationRouter);`:

```typescript
  app.use("/api/macro", macroRouter);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run server/src/stats/macroSeries.test.ts server/src/http/routes/macro.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add server/src/stats/macroSeries.ts server/src/stats/macroSeries.test.ts server/src/http/routes/macro.ts server/src/http/routes/macro.test.ts server/src/http/app.ts`

---

### Task 6: Motor de señales, parte 1 — series derivadas

Las cuatro funciones de cálculo puro sobre las que se apoyan señales y veredicto.

**Files:**
- Create: `client/src/macroSignals.ts`
- Test: `client/src/macroSignals.test.ts`

**Interfaces:**
- Consumes: `MacroSeriesDTO`, `MacroMonth` (Task 1).
- Produces:
  - `DOLAR_REAL_BANDA = 10`, `TASA_REAL_BANDA = 2`
  - `interface DolarRealPoint { periodo: string; indice: number }`
  - `interface DolarReal { serie: DolarRealPoint[]; mediana: number; indiceHoy: number | null; ultimoPeriodoConIpc: string | null }`
  - `dolarRealSeries(series: MacroSeriesDTO): DolarReal`
  - `interface TasaRealPoint { periodo: string; tasaReal: number }` (`tasaReal` en % mensual) y `tasaRealSeries(series): TasaRealPoint[]`
  - `inflacionInteranual(series): number` (% anual)
  - `interface Variacion12m { meses: number; uva: number; usd: number; deuda: number }` (fracciones) y `variacion12m(series): Variacion12m | null`
  - `interface RaceSerie { id: string; data: { x: string; y: number }[] }` y `raceSeries(series): RaceSerie[]`

  Consumidos por Task 7 (señales/veredicto), Task 9 (gráficos) y Task 10 (página).

- [ ] **Step 1: Write the failing test**

Crear `client/src/macroSignals.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { MacroSeriesDTO } from "@ledgerly/shared";
import { dolarRealSeries, tasaRealSeries, inflacionInteranual, variacion12m, raceSeries } from "./macroSignals.js";

interface MesInput {
  periodo: string;
  usdOficial?: number | null;
  uva?: number | null;
  tasa30?: number | null;
  inflacion?: number | null;
}

interface HoyInput {
  fecha: string;
  usdOficial?: number | null;
  uva?: number | null;
  tasa30?: number | null;
}

const macro = (meses: MesInput[], hoy: HoyInput): MacroSeriesDTO => ({
  desde: meses[0]?.periodo ?? "2025-01",
  meses: meses.map((mes) => ({
    periodo: mes.periodo,
    usdOficial: mes.usdOficial ?? null,
    uva: mes.uva ?? null,
    tasa30: mes.tasa30 ?? null,
    inflacion: mes.inflacion ?? null,
  })),
  hoy: { fecha: hoy.fecha, usdOficial: hoy.usdOficial ?? null, uva: hoy.uva ?? null, tasa30: hoy.tasa30 ?? null },
});

describe("dolarRealSeries", () => {
  it("deflacta el dólar por el IPC de la ventana y lo indexa contra su mediana", () => {
    const result = dolarRealSeries(macro(
      [
        { periodo: "2025-01", usdOficial: 100, inflacion: 0 },
        { periodo: "2025-02", usdOficial: 110, inflacion: 10 },
        { periodo: "2025-03", usdOficial: 100, inflacion: 0 },
      ],
      { fecha: "2025-04-10", usdOficial: 90 },
    ));
    expect(result.mediana).toBeCloseTo(100, 6);
    expect(result.serie.map((punto) => punto.indice)).toEqual([
      expect.closeTo(100, 6), expect.closeTo(100, 6), expect.closeTo(90.9091, 4),
    ]);
    expect(result.ultimoPeriodoConIpc).toBe("2025-03");
    expect(result.indiceHoy).toBeCloseTo(81.8182, 4);
  });

  it("excluye el mes en curso de la mediana y de la serie", () => {
    const result = dolarRealSeries(macro(
      [
        { periodo: "2025-01", usdOficial: 100, inflacion: 0 },
        { periodo: "2025-02", usdOficial: 120, inflacion: 0 },
        { periodo: "2025-03", usdOficial: 500, inflacion: 0 },
      ],
      { fecha: "2025-03-15", usdOficial: 500 },
    ));
    expect(result.serie.map((punto) => punto.periodo)).toEqual(["2025-01", "2025-02"]);
    expect(result.mediana).toBeCloseTo(110, 6);
  });

  it("sin datos devuelve la estructura vacía", () => {
    const result = dolarRealSeries(macro([], { fecha: "2025-01-01" }));
    expect(result).toEqual({ serie: [], mediana: 0, indiceHoy: null, ultimoPeriodoConIpc: null });
  });

  it("sin dólar spot deja indiceHoy en null pero mantiene la serie", () => {
    const result = dolarRealSeries(macro(
      [{ periodo: "2025-01", usdOficial: 100, inflacion: 0 }, { periodo: "2025-02", usdOficial: 100, inflacion: 0 }],
      { fecha: "2025-03-01" },
    ));
    expect(result.indiceHoy).toBeNull();
    expect(result.serie).toHaveLength(2);
  });
});

describe("tasaRealSeries", () => {
  it("compara la tasa mensualizada contra la inflación del mes", () => {
    const result = tasaRealSeries(macro([{ periodo: "2025-01", tasa30: 24, inflacion: 1 }], { fecha: "2025-02-01" }));
    expect(result).toHaveLength(1);
    expect(result[0].tasaReal).toBeCloseTo(0.9901, 4);
  });

  it("saltea los meses sin tasa o sin inflación", () => {
    const result = tasaRealSeries(macro(
      [{ periodo: "2025-01", tasa30: 24 }, { periodo: "2025-02", inflacion: 1 }, { periodo: "2025-03", tasa30: 24, inflacion: 1 }],
      { fecha: "2025-04-01" },
    ));
    expect(result.map((punto) => punto.periodo)).toEqual(["2025-03"]);
  });
});

describe("inflacionInteranual", () => {
  it("compone los últimos 12 meses", () => {
    const meses = Array.from({ length: 12 }, (_unused, position) => ({
      periodo: `2025-${String(position + 1).padStart(2, "0")}`,
      inflacion: 2,
    }));
    expect(inflacionInteranual(macro(meses, { fecha: "2026-01-01" }))).toBeCloseTo(26.8242, 4);
  });

  it("usa solo los últimos 12 cuando hay más historia", () => {
    const meses = [
      { periodo: "2024-12", inflacion: 90 },
      ...Array.from({ length: 12 }, (_unused, position) => ({
        periodo: `2025-${String(position + 1).padStart(2, "0")}`,
        inflacion: 2,
      })),
    ];
    expect(inflacionInteranual(macro(meses, { fecha: "2026-01-01" }))).toBeCloseTo(26.8242, 4);
  });

  it("sin serie devuelve 0", () => {
    expect(inflacionInteranual(macro([], { fecha: "2025-01-01" }))).toBe(0);
  });
});

describe("variacion12m", () => {
  it("mide la carrera UVA vs dólar y el efecto sobre la deuda", () => {
    const meses = Array.from({ length: 13 }, (_unused, position) => ({
      periodo: position < 12 ? `2025-${String(position + 1).padStart(2, "0")}` : "2026-01",
      uva: position === 0 ? 1000 : 1310,
      usdOficial: position === 0 ? 1000 : 1220,
    }));
    const result = variacion12m(macro(meses, { fecha: "2026-01-15" }))!;
    expect(result.meses).toBe(12);
    expect(result.uva).toBeCloseTo(0.31, 6);
    expect(result.usd).toBeCloseTo(0.22, 6);
    expect(result.deuda).toBeCloseTo(0.0738, 4);
  });

  it("devuelve null con menos de dos meses completos", () => {
    expect(variacion12m(macro([{ periodo: "2025-01", uva: 1000, usdOficial: 1000 }], { fecha: "2025-02-01" }))).toBeNull();
  });
});

describe("raceSeries", () => {
  it("indexa las tres series en base 100 al primer mes", () => {
    const result = raceSeries(macro(
      [
        { periodo: "2025-01", usdOficial: 1000, uva: 1000, inflacion: 5 },
        { periodo: "2025-02", usdOficial: 1100, uva: 1200, inflacion: 10 },
      ],
      { fecha: "2025-03-01" },
    ));
    expect(result.map((serie) => serie.id)).toEqual(["Dólar oficial", "UVA", "Inflación"]);
    expect(result[0].data).toEqual([{ x: "2025-01", y: 100 }, { x: "2025-02", y: expect.closeTo(110, 6) }]);
    expect(result[1].data[1].y).toBeCloseTo(120, 6);
    expect(result[2].data[1].y).toBeCloseTo(110, 6);
  });

  it("descarta las series sin ningún dato", () => {
    const result = raceSeries(macro([{ periodo: "2025-01", usdOficial: 1000, inflacion: 0 }], { fecha: "2025-02-01" }));
    expect(result.map((serie) => serie.id)).toEqual(["Dólar oficial", "Inflación"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/macroSignals.test.ts`
Expected: FAIL — módulo `./macroSignals.js` inexistente.

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/macroSignals.ts`:

```typescript
import type { MacroMonth, MacroSeriesDTO } from "@ledgerly/shared";

export const DOLAR_REAL_BANDA = 10;
export const TASA_REAL_BANDA = 2;

export interface DolarRealPoint {
  periodo: string;
  indice: number;
}

export interface DolarReal {
  serie: DolarRealPoint[];
  mediana: number;
  indiceHoy: number | null;
  ultimoPeriodoConIpc: string | null;
}

export interface TasaRealPoint {
  periodo: string;
  tasaReal: number;
}

export interface Variacion12m {
  meses: number;
  uva: number;
  usd: number;
  deuda: number;
}

export interface RaceSerie {
  id: string;
  data: { x: string; y: number }[];
}

const EMPTY_DOLAR_REAL: DolarReal = { serie: [], mediana: 0, indiceHoy: null, ultimoPeriodoConIpc: null };

const byPeriodo = (a: MacroMonth, b: MacroMonth): number => a.periodo.localeCompare(b.periodo);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function ipcIndex(meses: MacroMonth[]): Map<string, number> {
  const index = new Map<string, number>();
  let level = 1;
  meses.forEach((mes, position) => {
    if (position > 0) level *= 1 + (mes.inflacion ?? 0) / 100;
    index.set(mes.periodo, level);
  });
  return index;
}

const sortedMeses = (series: MacroSeriesDTO): MacroMonth[] => [...series.meses].sort(byPeriodo);

export function dolarRealSeries(series: MacroSeriesDTO): DolarReal {
  const meses = sortedMeses(series);
  if (meses.length === 0) return EMPTY_DOLAR_REAL;

  const ipc = ipcIndex(meses);
  const periodoActual = series.hoy.fecha.slice(0, 7);
  const cerrados = meses.filter((mes) => mes.periodo < periodoActual && mes.usdOficial !== null);
  if (cerrados.length === 0) return EMPTY_DOLAR_REAL;

  const reales = cerrados.map((mes) => ({ periodo: mes.periodo, real: mes.usdOficial! / ipc.get(mes.periodo)! }));
  const mediana = median(reales.map((punto) => punto.real));
  if (!(mediana > 0)) return EMPTY_DOLAR_REAL;

  const conIpc = meses.filter((mes) => mes.inflacion !== null);
  const ultimoPeriodoConIpc = conIpc.length > 0 ? conIpc[conIpc.length - 1].periodo : null;
  const ipcHoy = ultimoPeriodoConIpc === null ? null : ipc.get(ultimoPeriodoConIpc) ?? null;
  const spot = series.hoy.usdOficial;

  return {
    serie: reales.map(({ periodo, real }) => ({ periodo, indice: (real / mediana) * 100 })),
    mediana,
    indiceHoy: spot !== null && ipcHoy !== null ? (spot / ipcHoy / mediana) * 100 : null,
    ultimoPeriodoConIpc,
  };
}

export function tasaRealSeries(series: MacroSeriesDTO): TasaRealPoint[] {
  return sortedMeses(series)
    .filter((mes) => mes.tasa30 !== null && mes.inflacion !== null)
    .map((mes) => ({
      periodo: mes.periodo,
      tasaReal: ((1 + mes.tasa30! / 100 / 12) / (1 + mes.inflacion! / 100) - 1) * 100,
    }));
}

export function inflacionInteranual(series: MacroSeriesDTO): number {
  const ultimos = sortedMeses(series).filter((mes) => mes.inflacion !== null).slice(-12);
  if (ultimos.length === 0) return 0;
  const factor = ultimos.reduce((acc, mes) => acc * (1 + mes.inflacion! / 100), 1);
  return (factor - 1) * 100;
}

export function variacion12m(series: MacroSeriesDTO): Variacion12m | null {
  const conAmbos = sortedMeses(series).filter((mes) => mes.uva !== null && mes.usdOficial !== null);
  if (conAmbos.length < 2) return null;

  const inicioPosition = Math.max(0, conAmbos.length - 13);
  const inicio = conAmbos[inicioPosition];
  const ultimo = conAmbos[conAmbos.length - 1];
  const uva = ultimo.uva! / inicio.uva! - 1;
  const usd = ultimo.usdOficial! / inicio.usdOficial! - 1;

  return { meses: conAmbos.length - 1 - inicioPosition, uva, usd, deuda: (1 + uva) / (1 + usd) - 1 };
}

export function raceSeries(series: MacroSeriesDTO): RaceSerie[] {
  const meses = sortedMeses(series);
  if (meses.length === 0) return [];

  const ipc = ipcIndex(meses);
  const indexar = (pick: (mes: MacroMonth) => number | null): { x: string; y: number }[] => {
    const conDato = meses.filter((mes) => pick(mes) !== null);
    const base = conDato.length > 0 ? pick(conDato[0])! : 0;
    if (!(base > 0)) return [];
    return conDato.map((mes) => ({ x: mes.periodo, y: (pick(mes)! / base) * 100 }));
  };

  return [
    { id: "Dólar oficial", data: indexar((mes) => mes.usdOficial) },
    { id: "UVA", data: indexar((mes) => mes.uva) },
    { id: "Inflación", data: meses.map((mes) => ({ x: mes.periodo, y: ipc.get(mes.periodo)! * 100 })) },
  ].filter((serie) => serie.data.length > 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/macroSignals.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add client/src/macroSignals.ts client/src/macroSignals.test.ts`

---

### Task 7: Motor de señales, parte 2 — señales y veredicto

**Files:**
- Modify: `client/src/macroSignals.ts` (agrega tipos y funciones al final)
- Test: `client/src/macroSignals.test.ts` (agrega describes)

**Interfaces:**
- Consumes: todo lo de Task 6, más `CreditSummaryDTO` (Task 2) y `formatPercent` de `./format.js`.
- Produces:
  - `interface MacroAssumptions { inflacionEsperada: number; tasaAnualPesos: number; reversionMeses: 12 | 24 | null }` (porcentajes anuales)
  - `type SignalStatus = "good" | "neutral" | "bad"`
  - `interface MacroSignal { id: "dolar" | "pesos" | "adelantar"; label: string; value: number; format: "indice" | "porcentaje"; status: SignalStatus; reading: string }`
  - `interface VerdictOption { opcion: "dolar" | "pesos" | "adelantar"; label: string; retornoReal: number; certeza: "alta" | "media" | "baja" }`
  - `interface MacroVerdict { ranking: VerdictOption[]; resumen: string }`
  - `interface MacroView { signals: MacroSignal[]; verdict: MacroVerdict; dolarReal: DolarReal; tasaReal: TasaRealPoint[] }`
  - `defaultAssumptions(series): MacroAssumptions`, `buildVerdict(series, credit, assumptions): MacroVerdict`, `buildSignals(series, credit, assumptions): MacroSignal[]`, `buildMacroView(series, credit, assumptions): MacroView`

  `credit` es `CreditSummaryDTO | undefined` en las tres. Consumidos por Tasks 8 y 10.

- [ ] **Step 1: Write the failing test**

En `client/src/macroSignals.test.ts`, ampliar el import de la primera línea del módulo bajo prueba:

```typescript
import {
  dolarRealSeries, tasaRealSeries, inflacionInteranual, variacion12m, raceSeries,
  defaultAssumptions, buildVerdict, buildSignals, buildMacroView, type MacroAssumptions,
} from "./macroSignals.js";
import type { CreditSummaryDTO } from "@ledgerly/shared";
```

Y agregar al final del archivo:

```typescript
const credit = (tasaRealMensual: number): CreditSummaryDTO => ({
  prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240,
  totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
  capitalOriginalUva: 1, capitalAmortizadoUva: 1, capitalPendienteUva: 1, capitalPendientePesos: 1,
  porcentajeAvanceCapital: 0.017, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9,
  tasaRealMensual,
});

const indice80 = macro(
  [{ periodo: "2025-01", usdOficial: 100, inflacion: 0 }, { periodo: "2025-02", usdOficial: 100, inflacion: 0 }],
  { fecha: "2025-03-01", usdOficial: 80, tasa30: 24 },
);

const assumptions = (patch: Partial<MacroAssumptions> = {}): MacroAssumptions => ({
  inflacionEsperada: 20, tasaAnualPesos: 24, reversionMeses: 12, ...patch,
});

describe("defaultAssumptions", () => {
  it("deriva inflación esperada de la serie y tasa del spot", () => {
    const meses = Array.from({ length: 12 }, (_unused, position) => ({
      periodo: `2025-${String(position + 1).padStart(2, "0")}`,
      inflacion: 2,
    }));
    const result = defaultAssumptions(macro(meses, { fecha: "2026-01-05", tasa30: 20.04 }));
    expect(result.inflacionEsperada).toBe(26.8);
    expect(result.tasaAnualPesos).toBe(20.04);
    expect(result.reversionMeses).toBe(12);
  });
});

describe("buildVerdict", () => {
  it("valúa el dólar por reversión a la mediana a 12 meses", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions());
    expect(ranking.find((opcion) => opcion.opcion === "dolar")!.retornoReal).toBeCloseTo(25, 6);
  });

  it("anualiza la reversión cuando el horizonte es 24 meses", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions({ reversionMeses: 24 }));
    expect(ranking.find((opcion) => opcion.opcion === "dolar")!.retornoReal).toBeCloseTo(11.8034, 4);
  });

  it("sin reversión el dólar solo acompaña a la inflación", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions({ reversionMeses: null }));
    expect(ranking.find((opcion) => opcion.opcion === "dolar")!.retornoReal).toBe(0);
  });

  it("calcula la tasa real en pesos desde TNA e inflación esperada", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions());
    expect(ranking.find((opcion) => opcion.opcion === "pesos")!.retornoReal).toBeCloseTo(5.6868, 3);
  });

  it("valúa adelantar capital con la tasa real mensual del crédito", () => {
    const { ranking } = buildVerdict(indice80, credit(0.005), assumptions());
    const adelantar = ranking.find((opcion) => opcion.opcion === "adelantar")!;
    expect(adelantar.retornoReal).toBeCloseTo(6.1678, 3);
    expect(adelantar.certeza).toBe("alta");
  });

  it("ordena por retorno real descendente", () => {
    const { ranking } = buildVerdict(indice80, credit(0.005), assumptions());
    expect(ranking.map((opcion) => opcion.opcion)).toEqual(["dolar", "adelantar", "pesos"]);
  });

  it("sin crédito no ofrece adelantar", () => {
    const { ranking } = buildVerdict(indice80, undefined, assumptions());
    expect(ranking.map((opcion) => opcion.opcion)).toEqual(["dolar", "pesos"]);
  });

  it("sin datos devuelve ranking vacío", () => {
    const { ranking, resumen } = buildVerdict(macro([], { fecha: "2025-01-01" }), undefined, assumptions());
    expect(ranking).toEqual([]);
    expect(resumen).toContain("No hay datos");
  });
});

describe("buildSignals", () => {
  it("marca el dólar en verde cuando está por debajo de la banda", () => {
    const señales = buildSignals(indice80, undefined, assumptions());
    const dolar = señales.find((señal) => señal.id === "dolar")!;
    expect(dolar.value).toBeCloseTo(80, 6);
    expect(dolar.status).toBe("good");
    expect(dolar.format).toBe("indice");
    expect(dolar.reading).toContain("por debajo");
  });

  it("marca el dólar en rojo cuando está por encima de la banda", () => {
    const caro = macro(
      [{ periodo: "2025-01", usdOficial: 100, inflacion: 0 }, { periodo: "2025-02", usdOficial: 100, inflacion: 0 }],
      { fecha: "2025-03-01", usdOficial: 130, tasa30: 24 },
    );
    expect(buildSignals(caro, undefined, assumptions()).find((señal) => señal.id === "dolar")!.status).toBe("bad");
  });

  it("marca el dólar en amarillo dentro de la banda", () => {
    const neutro = macro(
      [{ periodo: "2025-01", usdOficial: 100, inflacion: 0 }, { periodo: "2025-02", usdOficial: 100, inflacion: 0 }],
      { fecha: "2025-03-01", usdOficial: 95, tasa30: 24 },
    );
    expect(buildSignals(neutro, undefined, assumptions()).find((señal) => señal.id === "dolar")!.status).toBe("neutral");
  });

  it("pinta la tasa real según su banda", () => {
    const verde = buildSignals(indice80, undefined, assumptions({ inflacionEsperada: 10 }));
    expect(verde.find((señal) => señal.id === "pesos")!.status).toBe("good");
    const rojo = buildSignals(indice80, undefined, assumptions({ inflacionEsperada: 40 }));
    expect(rojo.find((señal) => señal.id === "pesos")!.status).toBe("bad");
  });

  it("le da a adelantar el color de su posición en el ranking", () => {
    const segundo = buildSignals(indice80, credit(0.005), assumptions());
    expect(segundo.find((señal) => señal.id === "adelantar")!.status).toBe("neutral");
    const primero = buildSignals(indice80, credit(0.05), assumptions());
    expect(primero.find((señal) => señal.id === "adelantar")!.status).toBe("good");
  });

  it("sin crédito no emite la señal de adelantar", () => {
    expect(buildSignals(indice80, undefined, assumptions()).map((señal) => señal.id)).toEqual(["dolar", "pesos"]);
  });

  it("sin datos no emite ninguna señal", () => {
    expect(buildSignals(macro([], { fecha: "2025-01-01" }), undefined, assumptions())).toEqual([]);
  });
});

describe("buildMacroView", () => {
  it("arma señales, veredicto y series en una sola pasada", () => {
    const view = buildMacroView(indice80, credit(0.005), assumptions());
    expect(view.signals).toHaveLength(3);
    expect(view.verdict.ranking).toHaveLength(3);
    expect(view.dolarReal.indiceHoy).toBeCloseTo(80, 6);
    expect(view.tasaReal).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/macroSignals.test.ts`
Expected: FAIL — `defaultAssumptions`, `buildVerdict`, `buildSignals` y `buildMacroView` no existen.

- [ ] **Step 3: Write minimal implementation**

En `client/src/macroSignals.ts`, ampliar el import de tipos de la primera línea y agregar el de formato:

```typescript
import type { CreditSummaryDTO, MacroMonth, MacroSeriesDTO } from "@ledgerly/shared";
import { formatMonthLabel, formatPercent } from "./format.js";
```

Y agregar al final del archivo:

```typescript
export interface MacroAssumptions {
  inflacionEsperada: number;
  tasaAnualPesos: number;
  reversionMeses: 12 | 24 | null;
}

export type SignalStatus = "good" | "neutral" | "bad";

export type MacroOption = "dolar" | "pesos" | "adelantar";

export interface MacroSignal {
  id: MacroOption;
  label: string;
  value: number;
  format: "indice" | "porcentaje";
  status: SignalStatus;
  reading: string;
}

export interface VerdictOption {
  opcion: MacroOption;
  label: string;
  retornoReal: number;
  certeza: "alta" | "media" | "baja";
}

export interface MacroVerdict {
  ranking: VerdictOption[];
  resumen: string;
}

export interface MacroView {
  signals: MacroSignal[];
  verdict: MacroVerdict;
  dolarReal: DolarReal;
  tasaReal: TasaRealPoint[];
}

const OPCION_LABEL: Record<MacroOption, string> = {
  dolar: "Comprar dólares",
  pesos: "Quedarse en pesos",
  adelantar: "Adelantar capital del crédito",
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

const signed = (value: number): string => `${value >= 0 ? "+" : "−"}${formatPercent(Math.abs(value))}`;

export function defaultAssumptions(series: MacroSeriesDTO): MacroAssumptions {
  return {
    inflacionEsperada: round1(inflacionInteranual(series)),
    tasaAnualPesos: series.hoy.tasa30 ?? 0,
    reversionMeses: 12,
  };
}

function retornoDolar(dolarReal: DolarReal, reversionMeses: MacroAssumptions["reversionMeses"]): number | null {
  if (dolarReal.indiceHoy === null || !(dolarReal.indiceHoy > 0)) return null;
  if (reversionMeses === null) return 0;
  return ((100 / dolarReal.indiceHoy) ** (12 / reversionMeses) - 1) * 100;
}

function retornoPesos({ tasaAnualPesos, inflacionEsperada }: MacroAssumptions): number {
  const tea = (1 + tasaAnualPesos / 100 / 12) ** 12 - 1;
  return ((1 + tea) / (1 + inflacionEsperada / 100) - 1) * 100;
}

function retornoAdelantar(credit: CreditSummaryDTO | undefined): number | null {
  if (!credit) return null;
  return ((1 + credit.tasaRealMensual) ** 12 - 1) * 100;
}

function resumir(ranking: VerdictOption[]): string {
  if (ranking.length === 0) return "No hay datos suficientes para comparar las opciones.";

  const [primero, segundo] = ranking;
  const ventaja = segundo
    ? ` Le saca ${formatPercent(primero.retornoReal - segundo.retornoReal)} a ${segundo.label.toLowerCase()}.`
    : "";
  const cierto = ranking.find((opcion) => opcion.certeza === "alta");
  const aclaracion = cierto
    ? ` El único retorno cierto es el de ${cierto.label.toLowerCase()}; los demás dependen de los supuestos.`
    : " Ninguno de estos retornos es cierto: todos dependen de los supuestos.";

  return `Hoy conviene ${primero.label.toLowerCase()}, con ${signed(primero.retornoReal)} real anual.${ventaja}${aclaracion}`;
}

export function buildVerdict(
  series: MacroSeriesDTO,
  credit: CreditSummaryDTO | undefined,
  assumptions: MacroAssumptions,
): MacroVerdict {
  if (series.meses.length === 0) return { ranking: [], resumen: resumir([]) };

  const dolarReal = dolarRealSeries(series);
  const candidatos: VerdictOption[] = [];

  const dolar = retornoDolar(dolarReal, assumptions.reversionMeses);
  if (dolar !== null) candidatos.push({ opcion: "dolar", label: OPCION_LABEL.dolar, retornoReal: dolar, certeza: "baja" });

  candidatos.push({ opcion: "pesos", label: OPCION_LABEL.pesos, retornoReal: retornoPesos(assumptions), certeza: "media" });

  const adelantar = retornoAdelantar(credit);
  if (adelantar !== null) {
    candidatos.push({ opcion: "adelantar", label: OPCION_LABEL.adelantar, retornoReal: adelantar, certeza: "alta" });
  }

  const ranking = [...candidatos].sort((a, b) => b.retornoReal - a.retornoReal);
  return { ranking, resumen: resumir(ranking) };
}

function lecturaDolar(dolarReal: DolarReal, desde: string): string {
  const indice = dolarReal.indiceHoy ?? 100;
  const distancia = formatPercent(Math.abs(indice - 100));
  const lado = indice < 100 ? "por debajo de" : "por encima de";
  const ipc = dolarReal.ultimoPeriodoConIpc ? `, con IPC hasta ${formatMonthLabel(dolarReal.ultimoPeriodoConIpc)}` : "";
  return `El dólar está ${distancia} ${lado} su promedio desde ${formatMonthLabel(desde)}${ipc}.`;
}

function lecturaAdelantar(series: MacroSeriesDTO, retorno: number): string {
  const carrera = variacion12m(series);
  if (!carrera) return `Adelantar capital rinde ${signed(retorno)} real anual, y es el único retorno cierto.`;

  const verbo = carrera.deuda >= 0 ? "encareció" : "licuó";
  return `En ${carrera.meses} meses la UVA subió ${formatPercent(carrera.uva * 100)} y el dólar ${formatPercent(carrera.usd * 100)}: tu deuda se ${verbo} ${formatPercent(Math.abs(carrera.deuda) * 100)} medida en dólares.`;
}

export function buildSignals(
  series: MacroSeriesDTO,
  credit: CreditSummaryDTO | undefined,
  assumptions: MacroAssumptions,
): MacroSignal[] {
  if (series.meses.length === 0) return [];

  const dolarReal = dolarRealSeries(series);
  const { ranking } = buildVerdict(series, credit, assumptions);
  const signals: MacroSignal[] = [];

  if (dolarReal.indiceHoy !== null) {
    const indice = dolarReal.indiceHoy;
    signals.push({
      id: "dolar",
      label: "Dólar vs su promedio desde 2025",
      value: indice,
      format: "indice",
      status: indice < 100 - DOLAR_REAL_BANDA ? "good" : indice > 100 + DOLAR_REAL_BANDA ? "bad" : "neutral",
      reading: lecturaDolar(dolarReal, series.desde),
    });
  }

  const tasaReal = retornoPesos(assumptions);
  signals.push({
    id: "pesos",
    label: "Tasa real en pesos",
    value: tasaReal,
    format: "porcentaje",
    status: tasaReal > TASA_REAL_BANDA ? "good" : tasaReal < -TASA_REAL_BANDA ? "bad" : "neutral",
    reading: `Un plazo fijo a TNA ${formatPercent(assumptions.tasaAnualPesos)} deja ${signed(tasaReal)} real anual si la inflación se mantiene en ${formatPercent(assumptions.inflacionEsperada)}.`,
  });

  const adelantar = retornoAdelantar(credit);
  if (adelantar !== null) {
    const posicion = ranking.findIndex((opcion) => opcion.opcion === "adelantar");
    signals.push({
      id: "adelantar",
      label: "Adelantar capital",
      value: adelantar,
      format: "porcentaje",
      status: posicion === 0 ? "good" : posicion === ranking.length - 1 ? "bad" : "neutral",
      reading: lecturaAdelantar(series, adelantar),
    });
  }

  return signals;
}

export function buildMacroView(
  series: MacroSeriesDTO,
  credit: CreditSummaryDTO | undefined,
  assumptions: MacroAssumptions,
): MacroView {
  return {
    signals: buildSignals(series, credit, assumptions),
    verdict: buildVerdict(series, credit, assumptions),
    dolarReal: dolarRealSeries(series),
    tasaReal: tasaRealSeries(series),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/macroSignals.test.ts`
Expected: PASS (31 tests entre Task 6 y Task 7).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add client/src/macroSignals.ts client/src/macroSignals.test.ts`

---

### Task 8: Hook `useMacroSeries` + `Kpi` con color de error y sub multilínea

`Kpi` hoy solo acepta cuatro colores y trunca el `sub` con `noWrap`. Las señales necesitan rojo y una lectura de dos o tres líneas. Ambos cambios son retrocompatibles: `subMultiline` es opcional y por defecto mantiene el `noWrap` actual, así que ningún consumidor existente cambia.

**Files:**
- Modify: `client/src/api/hooks.ts` (tipo importado + hook)
- Modify: `client/src/components/Kpi.tsx`

**Interfaces:**
- Consumes: `MacroSeriesDTO` (Task 1), `GET /api/macro/series` (Task 5).
- Produces: `useMacroSeries()` (React Query, `staleTime` 1 h); `KpiColor` ahora incluye `"error"`; `KpiProps.subMultiline?: boolean`.

- [ ] **Step 1: Agregar el hook**

En `client/src/api/hooks.ts`, sumar `MacroSeriesDTO` a la lista de tipos importados de `@ledgerly/shared` (bloque `import type { ... }`, en orden alfabético junto a `InflationRateDTO`/`MerchantStat`), y agregar junto a `useInflation`:

```typescript
export function useMacroSeries() {
  return useQuery({ queryKey: ["macro-series"], queryFn: () => apiFetch<MacroSeriesDTO>("/macro/series"), staleTime: 1000 * 60 * 60 });
}
```

- [ ] **Step 2: Extender `Kpi`**

En `client/src/components/Kpi.tsx`, cambiar el tipo de color:

```typescript
export type KpiColor = "primary" | "secondary" | "success" | "warning" | "error";
```

Agregar la prop a la interfaz, después de `color: KpiColor;`:

```typescript
  subMultiline?: boolean;
```

Cambiar la firma para destructurar con default:

```typescript
export const Kpi = ({ label, value, format, sub, icon, color, subMultiline = false }: KpiProps) => (
```

Y reemplazar la línea del `sub` por:

```tsx
          {sub && (
            <Typography variant="caption" color="text.secondary" noWrap={!subMultiline} sx={{ display: "block" }}>
              {sub}
            </Typography>
          )}
```

- [ ] **Step 3: Verificar que no rompe a los consumidores actuales**

Run: `bunx vitest run client/src`
Expected: PASS — `Kpi` se usa hoy en `KpiCards`, `AutoKpiCards` y `PayslipKpiCards` sin la prop nueva, y el comportamiento por defecto es idéntico.

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 4: Stage**

Run: `git add client/src/api/hooks.ts client/src/components/Kpi.tsx`

---

### Task 9: Componentes de presentación — `VerdictCard`, `MacroSignalCards`, `MacroAssumptionsBar`

**Files:**
- Create: `client/src/components/VerdictCard.tsx`
- Create: `client/src/components/MacroSignalCards.tsx`
- Create: `client/src/components/MacroAssumptionsBar.tsx`
- Test: `client/src/components/MacroSignalCards.test.tsx`

**Interfaces:**
- Consumes: `MacroSignal`, `SignalStatus`, `MacroVerdict`, `MacroAssumptions` (Task 7); `Kpi`/`KpiColor` (Task 8).
- Produces: `VerdictCard({ verdict })`, `MacroSignalCards({ signals })`, `MacroAssumptionsBar({ assumptions, onChange })`. Consumidos por la página (Task 10).

- [ ] **Step 1: Write the failing test**

Crear `client/src/components/MacroSignalCards.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { MacroSignalCards } from "./MacroSignalCards.js";
import type { MacroSignal } from "../macroSignals.js";

afterEach(cleanup);

const signals: MacroSignal[] = [
  { id: "dolar", label: "Dólar vs su promedio desde 2025", value: 87, format: "indice", status: "good", reading: "El dólar está 13,0% por debajo de su promedio desde Enero 2025." },
  { id: "pesos", label: "Tasa real en pesos", value: -3.2, format: "porcentaje", status: "bad", reading: "Un plazo fijo a TNA 20,0% deja −3,2% real anual." },
];

describe("MacroSignalCards", () => {
  it("muestra una tarjeta por señal con su lectura", () => {
    renderWithProviders(<MacroSignalCards signals={signals} />);
    expect(screen.getByText("Dólar vs su promedio desde 2025")).toBeInTheDocument();
    expect(screen.getByText("Tasa real en pesos")).toBeInTheDocument();
    expect(screen.getByText(/13,0% por debajo/)).toBeInTheDocument();
  });

  it("no renderiza nada sin señales", () => {
    const { container } = renderWithProviders(<MacroSignalCards signals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/MacroSignalCards.test.tsx`
Expected: FAIL — módulo `./MacroSignalCards.js` inexistente.

- [ ] **Step 3a: Crear `MacroSignalCards`**

Crear `client/src/components/MacroSignalCards.tsx`:

```tsx
import type { ReactNode } from "react";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import SavingsIcon from "@mui/icons-material/Savings";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import type { MacroOption, MacroSignal, SignalStatus } from "../macroSignals.js";
import { formatPercent } from "../format.js";
import { Kpi, type KpiColor } from "./Kpi.js";
import { MotionBox } from "./motion/motion.js";
import { staggerContainer } from "./motion/variants.js";

const STATUS_COLOR: Record<SignalStatus, KpiColor> = { good: "success", neutral: "warning", bad: "error" };

const SIGNAL_ICON: Record<MacroOption, ReactNode> = {
  dolar: <TrendingUpIcon />,
  pesos: <SavingsIcon />,
  adelantar: <AccountBalanceIcon />,
};

const FORMATTERS: Record<MacroSignal["format"], (value: number) => string> = {
  indice: (value) => value.toFixed(0),
  porcentaje: (value) => formatPercent(value),
};

interface MacroSignalCardsProps {
  signals: MacroSignal[];
}

export const MacroSignalCards = ({ signals }: MacroSignalCardsProps) => {
  if (signals.length === 0) return null;

  return (
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: `repeat(${signals.length}, 1fr)` }, gap: 2, mb: 3 }}
    >
      {signals.map((signal) => (
        <Kpi
          key={signal.id}
          label={signal.label}
          value={signal.value}
          format={FORMATTERS[signal.format]}
          sub={signal.reading}
          subMultiline
          icon={SIGNAL_ICON[signal.id]}
          color={STATUS_COLOR[signal.status]}
        />
      ))}
    </MotionBox>
  );
};
```

- [ ] **Step 3b: Crear `VerdictCard`**

Crear `client/src/components/VerdictCard.tsx`:

```tsx
import { Box, Card, CardContent, Chip, Typography } from "@mui/material";
import type { MacroVerdict, VerdictOption } from "../macroSignals.js";
import { formatPercent } from "../format.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";

const CERTEZA_LABEL: Record<VerdictOption["certeza"], string> = {
  alta: "retorno cierto",
  media: "depende de la inflación",
  baja: "depende de la reversión",
};

interface VerdictCardProps {
  verdict: MacroVerdict;
}

export const VerdictCard = ({ verdict }: VerdictCardProps) => (
  <MotionBox variants={fadeUpItem} initial="hidden" animate="visible">
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary" sx={{ display: "block" }}>
          Veredicto del mes
        </Typography>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>{verdict.resumen}</Typography>
        <Box sx={{ display: "grid", gap: 1 }}>
          {verdict.ranking.map((opcion, position) => (
            <Box key={opcion.opcion} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography variant="h6" color="text.secondary" sx={{ width: 24 }}>{position + 1}</Typography>
              <Typography sx={{ flexGrow: 1 }}>{opcion.label}</Typography>
              <Chip size="small" variant="outlined" label={CERTEZA_LABEL[opcion.certeza]} />
              <Typography sx={{ fontWeight: 700, minWidth: 88, textAlign: "right" }}>
                {formatPercent(opcion.retornoReal)}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  </MotionBox>
);
```

- [ ] **Step 3c: Crear `MacroAssumptionsBar`**

Crear `client/src/components/MacroAssumptionsBar.tsx`:

```tsx
import { useState, type ChangeEvent, type MouseEvent } from "react";
import { Box, Button, Collapse, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { MacroAssumptions } from "../macroSignals.js";

const REVERSION_OPTIONS = [
  { value: "12", label: "Revierte en 12 meses" },
  { value: "24", label: "Revierte en 24 meses" },
  { value: "none", label: "Sin reversión" },
];

interface MacroAssumptionsBarProps {
  assumptions: MacroAssumptions;
  onChange: (assumptions: MacroAssumptions) => void;
}

export const MacroAssumptionsBar = ({ assumptions, onChange }: MacroAssumptionsBarProps) => {
  const [open, setOpen] = useState(false);

  const handleNumber = (field: "inflacionEsperada" | "tasaAnualPesos") => (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value);
    if (Number.isFinite(parsed)) onChange({ ...assumptions, [field]: parsed });
  };

  const handleReversion = (_event: MouseEvent<HTMLElement>, value: string | null) => {
    if (value === null) return;
    onChange({ ...assumptions, reversionMeses: value === "none" ? null : (Number(value) as 12 | 24) });
  };

  const reversionValue = assumptions.reversionMeses === null ? "none" : String(assumptions.reversionMeses);

  return (
    <Box sx={{ mb: 3 }}>
      <Button size="small" onClick={() => setOpen(!open)}>
        {open ? "Ocultar supuestos" : "Ver supuestos"}
      </Button>
      <Collapse in={open}>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", mt: 1 }}>
          <TextField
            size="small"
            type="number"
            label="Inflación esperada (% anual)"
            value={assumptions.inflacionEsperada}
            onChange={handleNumber("inflacionEsperada")}
          />
          <TextField
            size="small"
            type="number"
            label="Tasa en pesos (TNA %)"
            value={assumptions.tasaAnualPesos}
            onChange={handleNumber("tasaAnualPesos")}
          />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={reversionValue}
            onChange={handleReversion}
            aria-label="Horizonte de reversión del dólar"
          >
            {REVERSION_OPTIONS.map((option) => (
              <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Los supuestos no se guardan: al recargar vuelven a los valores derivados de los datos.
        </Typography>
      </Collapse>
    </Box>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/components/MacroSignalCards.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add client/src/components/MacroSignalCards.tsx client/src/components/MacroSignalCards.test.tsx client/src/components/VerdictCard.tsx client/src/components/MacroAssumptionsBar.tsx`

---

### Task 10: Los tres gráficos

**Files:**
- Create: `client/src/components/charts/DolarRealChart.tsx`
- Create: `client/src/components/charts/MacroRaceChart.tsx`
- Create: `client/src/components/charts/TasaRealChart.tsx`

**Interfaces:**
- Consumes: `DolarReal`, `RaceSerie`, `TasaRealPoint` (Task 6); `nivoTheme`, `seriesColor`, `formatPercent`, `formatMonthLabel`.
- Produces: `DolarRealChart({ dolarReal })`, `MacroRaceChart({ series })`, `TasaRealChart({ points })`. Consumidos por la página (Task 11).

- [ ] **Step 1: Crear `DolarRealChart`**

Crear `client/src/components/charts/DolarRealChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import type { DolarReal } from "../../macroSignals.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

interface DolarRealChartProps {
  dolarReal: DolarReal;
}

export const DolarRealChart = ({ dolarReal }: DolarRealChartProps) => {
  const theme = useTheme();

  if (dolarReal.serie.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const points = dolarReal.serie.map((punto) => ({ x: punto.periodo, y: punto.indice }));
  const color = seriesColor(theme.palette.mode, 0);

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={[{ id: "Dólar real", data: points }]}
        theme={nivoTheme(theme)}
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 56 }}
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
        defs={[linearGradientDef("dolarRealArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "dolarRealArea" }]}
        enableGridX={false}
        markers={[{
          axis: "y",
          value: 100,
          legend: "Promedio desde 2025",
          legendPosition: "top-left",
          lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1, strokeDasharray: "4 4" },
          textStyle: { fill: theme.palette.text.secondary, fontSize: 10 },
        }]}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8 }}
        yFormat={(value) => Number(value).toFixed(0)}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
```

- [ ] **Step 2: Crear `MacroRaceChart`**

Crear `client/src/components/charts/MacroRaceChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { Box, Typography, useTheme } from "@mui/material";
import type { RaceSerie } from "../../macroSignals.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

interface MacroRaceChartProps {
  series: RaceSerie[];
}

export const MacroRaceChart = ({ series }: MacroRaceChartProps) => {
  const theme = useTheme();

  if (series.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const colors = series.map((_serie, slot) => seriesColor(theme.palette.mode, slot));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme(theme)}
        colors={colors}
        margin={{ top: 16, right: 24, bottom: 84, left: 56 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: "auto", max: "auto" }}
        curve="monotoneX"
        lineWidth={3}
        pointSize={0}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8 }}
        yFormat={(value) => Number(value).toFixed(0)}
        legends={[{
          anchor: "bottom",
          direction: "row",
          translateY: 72,
          itemWidth: 110,
          itemHeight: 18,
          symbolSize: 10,
          symbolShape: "circle",
        }]}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
```

- [ ] **Step 3: Crear `TasaRealChart`**

Crear `client/src/components/charts/TasaRealChart.tsx`:

```tsx
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import type { TasaRealPoint } from "../../macroSignals.js";
import { formatPercent } from "../../format.js";
import { nivoTheme } from "./nivoTheme.js";

interface TasaRealChartProps {
  points: TasaRealPoint[];
}

export const TasaRealChart = ({ points }: TasaRealChartProps) => {
  const theme = useTheme();

  if (points.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = points.map((punto) => ({ month: punto.periodo, tasaReal: punto.tasaReal }));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={["tasaReal"]}
        indexBy="month"
        colors={({ data }) => (data.tasaReal >= 0 ? theme.palette.success.main : theme.palette.error.main)}
        margin={{ top: 16, right: 24, bottom: 64, left: 56 }}
        padding={0.35}
        borderRadius={4}
        enableLabel={false}
        enableGridX={false}
        valueFormat={(value) => formatPercent(value)}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatPercent(Number(value)) }}
        markers={[{
          axis: "y",
          value: 0,
          lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1 },
        }]}
        motionConfig="gentle"
      />
    </Box>
  );
};
```

- [ ] **Step 4: Verificar tipos**

Run: `bun run typecheck`
Expected: sin errores. Confirma que `markers`, `colors` como función y `legends` compilan contra las versiones de `@nivo/line` y `@nivo/bar` del repo. Si `markers` no existiera en `@nivo/bar`, reemplazarlo por `gridYValues={[0]}` y quitar el bloque de markers de `TasaRealChart` (el cero queda marcado por la grilla).

- [ ] **Step 5: Stage**

Run: `git add client/src/components/charts/DolarRealChart.tsx client/src/components/charts/MacroRaceChart.tsx client/src/components/charts/TasaRealChart.tsx`

---

### Task 11: Página `Contexto`, ruta y navegación

**Files:**
- Create: `client/src/pages/MacroPage.tsx`
- Modify: `client/src/App.tsx` (import + `Route`)
- Modify: `client/src/components/Layout.tsx` (entrada en `NAV`)
- Test: `client/src/pages/MacroPage.test.tsx`

**Interfaces:**
- Consumes: `useMacroSeries` (Task 8), `useCreditSummary` (existente), `buildMacroView` / `defaultAssumptions` / `raceSeries` / `MacroAssumptions` (Tasks 6-7), `VerdictCard` / `MacroSignalCards` / `MacroAssumptionsBar` (Task 9), los tres gráficos (Task 10).
- Produces: `MacroPage`, ruta `/contexto`, ítem "Contexto" en la navegación.

- [ ] **Step 1: Write the failing test**

Crear `client/src/pages/MacroPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { MacroPage } from "./MacroPage.js";

const meses = Array.from({ length: 14 }, (_unused, position) => {
  const mes = position < 12 ? `2025-${String(position + 1).padStart(2, "0")}` : `2026-${String(position - 11).padStart(2, "0")}`;
  return { periodo: mes, usdOficial: 1000 + position * 10, uva: 1000 + position * 20, tasa30: 24, inflacion: 2 };
});

const series = { desde: "2025-01", meses, hoy: { fecha: "2026-02-14", usdOficial: 1100, uva: 1260, tasa30: 24 } };

const summary = {
  prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240,
  totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
  capitalOriginalUva: 1, capitalAmortizadoUva: 1, capitalPendienteUva: 1, capitalPendientePesos: 1,
  porcentajeAvanceCapital: 0.017, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9,
  tasaRealMensual: 0.005,
};

function stubFetch(macroBody: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/macro/series") ? macroBody : url.includes("/credits/summary") ? summary : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

beforeEach(() => stubFetch(series));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MacroPage", () => {
  it("muestra veredicto, señales y gráficos", async () => {
    renderWithProviders(<MacroPage />, { route: "/contexto" });
    await waitFor(() => expect(screen.getByText("Veredicto del mes")).toBeInTheDocument());
    expect(screen.getByText("Dólar vs su promedio desde 2025")).toBeInTheDocument();
    expect(screen.getByText("Tasa real en pesos")).toBeInTheDocument();
    expect(screen.getByText("Adelantar capital")).toBeInTheDocument();
    expect(screen.getByText("Adelantar capital del crédito")).toBeInTheDocument();
    expect(screen.getByText("Dólar real vs su promedio desde 2025")).toBeInTheDocument();
    expect(screen.getByText("Carrera: UVA vs dólar vs inflación")).toBeInTheDocument();
    expect(screen.getByText("Tasa real en pesos, mes a mes")).toBeInTheDocument();
  });

  it("sin series cargadas explica cómo poblarlas", async () => {
    stubFetch({ desde: "2025-01", meses: [], hoy: { fecha: "2025-01", usdOficial: null, uva: null, tasa30: null } });
    renderWithProviders(<MacroPage />, { route: "/contexto" });
    await waitFor(() => expect(screen.getByText(/seed:macro/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/MacroPage.test.tsx`
Expected: FAIL — módulo `./MacroPage.js` inexistente.

- [ ] **Step 3a: Crear la página**

Crear `client/src/pages/MacroPage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { useCreditSummary, useMacroSeries } from "../api/hooks.js";
import { buildMacroView, defaultAssumptions, raceSeries, type MacroAssumptions } from "../macroSignals.js";
import { VerdictCard } from "../components/VerdictCard.js";
import { MacroSignalCards } from "../components/MacroSignalCards.js";
import { MacroAssumptionsBar } from "../components/MacroAssumptionsBar.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { DolarRealChart } from "../components/charts/DolarRealChart.js";
import { MacroRaceChart } from "../components/charts/MacroRaceChart.js";
import { TasaRealChart } from "../components/charts/TasaRealChart.js";

const Title = () => <Typography variant="h4" sx={{ mb: 3 }}>Contexto</Typography>;

export const MacroPage = () => {
  const { data: series, isLoading } = useMacroSeries();
  const { data: credit } = useCreditSummary();
  const [override, setOverride] = useState<MacroAssumptions | null>(null);

  const assumptions = useMemo(
    () => override ?? (series ? defaultAssumptions(series) : null),
    [override, series],
  );

  const view = useMemo(
    () => (series && assumptions ? buildMacroView(series, credit, assumptions) : null),
    [series, credit, assumptions],
  );

  const race = useMemo(() => (series ? raceSeries(series) : []), [series]);

  if (isLoading) {
    return (
      <>
        <Title />
        <CircularProgress />
      </>
    );
  }

  if (!series || series.meses.length === 0 || !view || !assumptions) {
    return (
      <>
        <Title />
        <Typography color="text.secondary">
          Todavía no cargaste las series macro. Corré <code>bun run seed:macro</code> para traer dólar, UVA, tasa e inflación.
        </Typography>
      </>
    );
  }

  return (
    <>
      <Title />
      <VerdictCard verdict={view.verdict} />
      <MacroAssumptionsBar assumptions={assumptions} onChange={setOverride} />
      <MacroSignalCards signals={view.signals} />
      <MotionBox
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
      >
        <ChartCard title="Dólar real vs su promedio desde 2025"><DolarRealChart dolarReal={view.dolarReal} /></ChartCard>
        <ChartCard title="Carrera: UVA vs dólar vs inflación"><MacroRaceChart series={race} /></ChartCard>
        <ChartCard title="Tasa real en pesos, mes a mes"><TasaRealChart points={view.tasaReal} /></ChartCard>
      </MotionBox>
    </>
  );
};
```

- [ ] **Step 3b: Registrar la ruta**

En `client/src/App.tsx`, agregar el import junto a los otros de páginas:

```tsx
import { MacroPage } from "./pages/MacroPage.js";
```

Y la ruta dentro de `<Routes>`, después de la de `/sueldo`:

```tsx
        <Route path="/contexto" element={<PageTransition><MacroPage /></PageTransition>} />
```

- [ ] **Step 3c: Agregar la entrada de navegación**

En `client/src/components/Layout.tsx`, en el array `NAV`, después de `{ to: "/sueldo", label: "Sueldo" }`:

```tsx
  { to: "/contexto", label: "Contexto" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/MacroPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Verificar la suite completa**

Run: `bunx vitest run`
Expected: toda la suite en verde (client/server/shared, nada roto).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 6: Verificación manual en la app**

```bash
bun run seed:macro
bun run dev
```

El seed debe imprimir algo como `Macro backfill: dólar 590, UVA 590, tasa 400, inflación 990`. Después, abrir `http://localhost:5173/contexto` y confirmar:

- La tarjeta **Veredicto del mes** ordena las tres opciones y el resumen nombra al ganador.
- Las tres tarjetas de señal muestran número, color y lectura completa (la lectura **no** debe verse cortada con puntos suspensivos: eso significaría que `subMultiline` no llegó).
- **Ver supuestos** despliega los dos campos y el toggle; cambiar "Inflación esperada" reordena el ranking al instante, sin request nueva (verificable en la pestaña Network).
- Los tres gráficos dibujan: el de dólar real con la línea punteada en 100, la carrera con tres series desde base 100, y el de tasa real con barras que cruzan el cero.
- La entrada **Contexto** aparece en la barra de navegación y queda activa al entrar.
- Con la colección `macroseries` vacía (`db.macroseries.drop()` en mongosh), la página muestra el mensaje con `bun run seed:macro` en vez de romper.

- [ ] **Step 7: Stage**

Run: `git add client/src/pages/MacroPage.tsx client/src/pages/MacroPage.test.tsx client/src/App.tsx client/src/components/Layout.tsx`

---

## Self-Review

**Spec coverage:**

| Requisito del spec | Tarea |
|---|---|
| Ventana 2025+ con `MACRO_START` como única constante | Task 3 (definición), Task 5 (ruta la usa) ✓ |
| Fetchers de dólar / UVA / tasa, `[]` ante error, `toPercent` defensivo | Task 3 ✓ |
| Colección única `MacroSeries` con índice `{serie, fecha}` único | Task 4 ✓ |
| Backfill + `seed:macro` que también corre inflación | Task 4 ✓ |
| `buildMonthlySeries` puro, último valor del mes, mes en curso parcial | Task 5 ✓ |
| `GET /api/macro/series` sin mapper, registrado en `app.ts` | Task 5 ✓ |
| `tasaRealMensual` en `CreditSummaryDTO` desde `computeCreditProgress` | Task 2 ✓ |
| DTOs macro nullables en shared | Task 1 ✓ |
| Índice IPC compuesto solo dentro de la ventana, base 1 | Task 6 (`ipcIndex`) ✓ |
| ① dólar real: mediana de meses cerrados, `indiceHoy` con último IPC, bandas ±10 | Tasks 6 y 7 ✓ |
| ② tasa real: TEA desde TNA, banda ±2 pp, serie mensual realizada | Tasks 6 y 7 ✓ |
| ③ adelantar: `(1+i)¹²−1`, color por posición en el ranking, lectura de carrera UVA vs dólar | Task 7 ✓ |
| ④ veredicto: `rD = (100/indiceHoy)^(12/H) − 1`, H=null → 0, orden descendente, aclaración de certeza | Task 7 ✓ |
| Supuestos editables con defaults derivados, sin persistencia, sin refetch | Tasks 7 (`defaultAssumptions`) y 9 (`MacroAssumptionsBar`) ✓ |
| Hook `useMacroSeries` con `staleTime` 1 h | Task 8 ✓ |
| `Kpi` compartido con color de error | Task 8 ✓ |
| `VerdictCard`, `MacroSignalCards`, `MacroAssumptionsBar` presentacionales | Task 9 ✓ |
| Tres gráficos nivo con la estética existente | Task 10 ✓ |
| Página `/contexto` + nav "Contexto" | Task 11 ✓ |
| Estados vacíos: sin series, sin crédito, sin IPC del mes, huecos | Tasks 6, 7 (tests), 11 (empty state) ✓ |
| Batería de tests del spec | Tasks 1-11, todas con test propio ✓ |

**Desvío del spec, deliberado:** el spec decía reusar `Kpi` tal cual. Su `sub` usa `noWrap` y truncaría la lectura de la señal, que es una oración entera. Task 8 agrega `subMultiline?: boolean` con default `false`, así que el comportamiento de los tres consumidores actuales (`KpiCards`, `AutoKpiCards`, `PayslipKpiCards`) queda idéntico. Sigue siendo reuso, no una copia nueva.

**Placeholder scan:** sin TBD/TODO. Todos los pasos de código llevan el bloque completo; todos los comandos llevan su salida esperada. El único condicional es el fallback de `markers` en `TasaRealChart` (Task 10, Step 4), y está escrito con la alternativa exacta.

**Type consistency:**
- `SeriePoint { fecha, valor }` — definido en Task 3, usado igual en el mock y en `upsertSerie` de Task 4.
- `MacroSeriesPoint { serie, fecha, valor }` (Task 5) es el shape que la ruta arma mapeando los docs; no se confunde con `SeriePoint`, que no lleva `serie`.
- `MacroMonth` / `MacroSpot` / `MacroSeriesDTO` (Task 1) se usan con los mismos nombres de campo en Tasks 5, 6, 7 y 11.
- `tasaRealMensual` es **fracción mensual** en todos lados (Task 2 la produce, Task 7 la eleva a la 12); `inflacionEsperada`, `tasaAnualPesos`, `retornoReal`, `tasaReal` y `value` de las señales son **porcentajes**; `variacion12m` devuelve **fracciones**, y Task 7 las multiplica por 100 solo al formatear la lectura.
- `MacroOption` es un solo tipo compartido entre `MacroSignal["id"]` y `VerdictOption["opcion"]` (Task 7), y `MacroSignalCards` (Task 9) indexa `SIGNAL_ICON` con él.
- `buildMacroView` / `buildSignals` / `buildVerdict` toman `(series, credit, assumptions)` en ese orden en Tasks 7, 9 y 11.

**Colisión de textos evitada:** el label de la señal ③ es `"Adelantar capital"`, distinto del `OPCION_LABEL.adelantar = "Adelantar capital del crédito"` que usa el veredicto. Si fueran iguales, el `getByText` de Task 11 encontraría dos nodos y fallaría. Los demás textos de la página son mutuamente distintos con match exacto: `"Tasa real en pesos"` (señal) vs `"Tasa real en pesos, mes a mes"` (título de gráfico), y `"Dólar vs su promedio desde 2025"` (señal) vs `"Dólar real vs su promedio desde 2025"` (título de gráfico).
