# Sueldo real vs inflación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a la página Sueldo un gráfico de poder adquisitivo que muestra el neto de cada recibo deflactado por inflación y expresado en pesos de hoy, para ver en qué momentos los aumentos le ganaron a la inflación.

**Architecture:** El server trae la serie mensual de IPC de argentinadatos.com (mismo patrón que el dólar oficial), la persiste en una colección `InflationRate` y la expone en `GET /api/inflation`. El cliente combina esa serie con los recibos mediante una función pura testeable (`deflateToLatest`) y la dibuja con un chart nivo nuevo integrado en la grilla existente.

**Tech Stack:** TypeScript, Express + Mongoose (server), React + `@nivo/line` 0.99 + React Query (client), Zod DTOs en `shared`, Vitest, bun.

## Global Constraints

- **Fuente inflación:** `GET https://api.argentinadatos.com/v1/finanzas/indices/inflacion` → `{ fecha: "YYYY-MM-DD", valor: number }[]`, `valor` = variación mensual en % (ej. `1.9` = 1,9 %). Período = `fecha.slice(0,7)`.
- **Dólar:** oficial, sin cambios (el `netoUsd` existente ya cubre "sueldo vs dólar").
- **Deflación:** `netoReal(P) = neto(P) · ∏(1 + variacionMensual(m)/100)` para meses `P < m <= L`, donde `L` = último período con IPC; `factor = 1` si `P >= L`.
- **Sin comentarios en el código** (regla global del usuario): nombres autoexplicativos, nada de `//`/JSDoc salvo pedido explícito.
- **Componentes React:** funcionales, destructuring en la firma, fragments cortos, `clsx` si hubiera CSS Modules (no aplica acá; se usa MUI `sx`). Tipos explícitos, nada de `any`.
- **Commits:** el usuario maneja git. Cada tarea termina con verificación (tests/typecheck en verde) y `git add` para dejar el cambio staged; **no** correr `git commit` salvo que el usuario lo pida en el momento.
- **Correr tests:** `bunx vitest run <archivo>`; typecheck: `bun run typecheck`.

---

### Task 1: DTO `InflationRateDTO` en shared

**Files:**
- Modify: `shared/src/dtos.ts` (agregar schema + tipo)
- Test: `shared/src/dtos.test.ts`

**Interfaces:**
- Produces: `inflationRateDtoSchema` (zod) y `type InflationRateDTO = { periodo: string; variacionMensual: number }`. Consumido por el mapper (Task 4), el hook y el chart (Task 6).

- [ ] **Step 1: Write the failing test**

En `shared/src/dtos.test.ts`, agregar el import y el bloque:

```typescript
import { mortgageCouponDtoSchema, creditSummaryDtoSchema, importResultUnionSchema, inflationRateDtoSchema } from "./dtos.js";
```

```typescript
describe("inflationRateDtoSchema", () => {
  it("valida un punto de inflación mensual", () => {
    const dto = { periodo: "2025-01", variacionMensual: 2.2 };
    expect(inflationRateDtoSchema.parse(dto)).toEqual(dto);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: FAIL — `inflationRateDtoSchema` no existe (import undefined).

- [ ] **Step 3: Write minimal implementation**

En `shared/src/dtos.ts`, después del bloque `oficialRateDtoSchema` (cerca del final, junto a los otros schemas), agregar:

```typescript
export const inflationRateDtoSchema = z.object({
  periodo: z.string(),
  variacionMensual: z.number(),
});
```

Y en la zona de `export type ... = z.infer<...>` (junto a `PayslipSummaryDTO`), agregar:

```typescript
export type InflationRateDTO = z.infer<typeof inflationRateDtoSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add shared/src/dtos.ts shared/src/dtos.test.ts`

---

### Task 2: Fetcher `fetchInflationSeries` en server

**Files:**
- Create: `server/src/fx/inflationRate.ts`
- Test: `server/src/fx/inflationRate.test.ts`

**Interfaces:**
- Produces: `interface InflationSeriesEntry { periodo: string; variacionMensual: number }` y `fetchInflationSeries(): Promise<InflationSeriesEntry[]>` (devuelve `[]` ante error de red o respuesta inválida). Consumido por el backfill (Task 3).

- [ ] **Step 1: Write the failing test**

Crear `server/src/fx/inflationRate.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchInflationSeries } from "./inflationRate.js";

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 404, headers: { "Content-Type": "application/json" } });
}
afterEach(() => vi.restoreAllMocks());

describe("fetchInflationSeries", () => {
  it("mapea fecha->periodo y valor->variacionMensual", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([
      { fecha: "2025-01-31", valor: 2.2 },
      { fecha: "2025-02-28", valor: 2.4 },
    ])));
    expect(await fetchInflationSeries()).toEqual([
      { periodo: "2025-01", variacionMensual: 2.2 },
      { periodo: "2025-02", variacionMensual: 2.4 },
    ]);
  });

  it("devuelve [] si fetch lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await fetchInflationSeries()).toEqual([]);
  });

  it("devuelve [] si la respuesta no es ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, false)));
    expect(await fetchInflationSeries()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/fx/inflationRate.test.ts`
Expected: FAIL — módulo `./inflationRate.js` inexistente.

- [ ] **Step 3: Write minimal implementation**

Crear `server/src/fx/inflationRate.ts`:

```typescript
const URL = "https://api.argentinadatos.com/v1/finanzas/indices/inflacion";

interface InflacionRow {
  fecha: string;
  valor: number;
}

export interface InflationSeriesEntry {
  periodo: string;
  variacionMensual: number;
}

export async function fetchInflationSeries(): Promise<InflationSeriesEntry[]> {
  try {
    const res = await fetch(URL);
    if (!res.ok) return [];
    const body = (await res.json()) as InflacionRow[] | null;
    if (!Array.isArray(body)) return [];
    return body
      .filter((row) => typeof row?.valor === "number" && typeof row?.fecha === "string")
      .map((row) => ({ periodo: row.fecha.slice(0, 7), variacionMensual: row.valor }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/fx/inflationRate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add server/src/fx/inflationRate.ts server/src/fx/inflationRate.test.ts`

---

### Task 3: Modelo `InflationRate` + backfill `seed:inflation`

**Files:**
- Modify: `server/src/db/models.ts` (schema + tipo + modelo)
- Create: `server/src/import/backfillInflation.ts`
- Modify: `package.json` (script `seed:inflation`)
- Test: `server/src/import/backfillInflation.test.ts`

**Interfaces:**
- Consumes: `fetchInflationSeries` (Task 2).
- Produces: `InflationRateModel` + `type InflationRateDoc` (consumidos por el mapper/route en Task 4); `backfillInflation(): Promise<{ upserted: number }>`.

- [ ] **Step 1: Write the failing test**

Crear `server/src/import/backfillInflation.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/inflationRate.js", () => ({ fetchInflationSeries: vi.fn() }));
import { fetchInflationSeries } from "../fx/inflationRate.js";
import { backfillInflation } from "./backfillInflation.js";
import { InflationRateModel } from "../db/models.js";

withDb();
const mocked = vi.mocked(fetchInflationSeries);

describe("backfillInflation", () => {
  it("hace upsert de la serie ordenada", async () => {
    mocked.mockResolvedValue([
      { periodo: "2025-01", variacionMensual: 2.2 },
      { periodo: "2025-02", variacionMensual: 2.4 },
    ]);
    const r = await backfillInflation();
    expect(r.upserted).toBe(2);
    const docs = await InflationRateModel.find().sort({ periodo: 1 }).lean();
    expect(docs.map((d) => d.periodo)).toEqual(["2025-01", "2025-02"]);
    expect(docs[0].variacionMensual).toBe(2.2);
  });

  it("es idempotente y actualiza el valor por período", async () => {
    mocked.mockResolvedValue([{ periodo: "2025-01", variacionMensual: 2.2 }]);
    await backfillInflation();
    mocked.mockResolvedValue([{ periodo: "2025-01", variacionMensual: 3.0 }]);
    await backfillInflation();
    const docs = await InflationRateModel.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].variacionMensual).toBe(3.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/import/backfillInflation.test.ts`
Expected: FAIL — `InflationRateModel` y `backfillInflation` inexistentes.

- [ ] **Step 3a: Agregar el modelo**

En `server/src/db/models.ts`, después de `payslipSchema.index(...)` (línea ~136) y antes del bloque de `export type ... = InferSchemaType<...>`, agregar el schema:

```typescript
const inflationRateSchema = new Schema({
  periodo: { type: String, required: true, unique: true, index: true },
  variacionMensual: { type: Number, required: true },
});
```

En el bloque de type exports (junto a `export type PayslipDoc = ...`), agregar:

```typescript
export type InflationRateDoc = InferSchemaType<typeof inflationRateSchema>;
```

Y al final, después de `PayslipModel`, agregar:

```typescript
export const InflationRateModel: Model<InflationRateDoc> =
  mongoose.models.InflationRate ?? mongoose.model("InflationRate", inflationRateSchema);
```

- [ ] **Step 3b: Escribir el backfill**

Crear `server/src/import/backfillInflation.ts`:

```typescript
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { InflationRateModel } from "../db/models.js";
import { fetchInflationSeries } from "../fx/inflationRate.js";

export async function backfillInflation(): Promise<{ upserted: number }> {
  const series = await fetchInflationSeries();
  let upserted = 0;
  for (const { periodo, variacionMensual } of series) {
    await InflationRateModel.updateOne(
      { periodo },
      { $set: { periodo, variacionMensual } },
      { upsert: true },
    );
    upserted += 1;
  }
  return { upserted };
}

if (process.argv[1]?.endsWith("backfillInflation.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillInflation();
  console.log(`Inflación backfill: ${r.upserted} períodos`);
  await disconnectMongo();
}
```

- [ ] **Step 3c: Agregar el script npm**

En `package.json` (raíz), dentro de `scripts`, agregar junto a los otros `seed:*`:

```json
"seed:inflation": "tsx server/src/import/backfillInflation.ts",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/import/backfillInflation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add server/src/db/models.ts server/src/import/backfillInflation.ts server/src/import/backfillInflation.test.ts package.json`

---

### Task 4: Endpoint `GET /api/inflation` + mapper

**Files:**
- Modify: `server/src/http/mappers.ts` (imports + `toInflationRateDTO`)
- Create: `server/src/http/routes/inflation.ts`
- Modify: `server/src/http/app.ts` (import + `app.use`)
- Test: `server/src/http/mappers.test.ts`

**Interfaces:**
- Consumes: `InflationRateModel`/`InflationRateDoc` (Task 3), `InflationRateDTO`/`inflationRateDtoSchema` (Task 1).
- Produces: `toInflationRateDTO(doc)`, ruta `GET /api/inflation` → `InflationRateDTO[]`. Consumido por el hook (Task 6).

- [ ] **Step 1: Write the failing test**

En `server/src/http/mappers.test.ts`, ampliar imports:

```typescript
import { StatementModel, TransactionModel, InflationRateModel } from "../db/models.js";
import { toStatementDTO, toTransactionDTO, toInflationRateDTO } from "./mappers.js";
import { statementDtoSchema, transactionDtoSchema, inflationRateDtoSchema } from "@ledgerly/shared";
```

Y agregar dentro de `describe("mappers", ...)`:

```typescript
it("toInflationRateDTO cumple el schema", async () => {
  const doc = await InflationRateModel.create({ periodo: "2025-01", variacionMensual: 2.2 });
  const dto = toInflationRateDTO(doc);
  expect(inflationRateDtoSchema.parse(dto)).toEqual({ periodo: "2025-01", variacionMensual: 2.2 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/mappers.test.ts`
Expected: FAIL — `toInflationRateDTO` no existe.

- [ ] **Step 3a: Escribir el mapper**

En `server/src/http/mappers.ts`, ampliar las dos líneas de import de tipos:

```typescript
import type { AutoCouponDTO, CategoryRuleDTO, InflationRateDTO, MortgageCouponDTO, PayslipDTO, StatementDTO, TransactionDTO } from "@ledgerly/shared";
import type { AutoCouponDoc, CategoryRuleDoc, InflationRateDoc, MortgageCouponDoc, PayslipDoc, StatementDoc, TransactionDoc } from "../db/models.js";
```

Y al final del archivo agregar:

```typescript
export function toInflationRateDTO(doc: HydratedDocument<InflationRateDoc>): InflationRateDTO {
  return { periodo: doc.periodo, variacionMensual: doc.variacionMensual };
}
```

- [ ] **Step 3b: Escribir la ruta**

Crear `server/src/http/routes/inflation.ts`:

```typescript
import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { InflationRateModel } from "../../db/models.js";
import { toInflationRateDTO } from "../mappers.js";

export const inflationRouter = Router();

inflationRouter.get("/", asyncHandler(async (_req, res) => {
  const docs = await InflationRateModel.find().sort({ periodo: 1 });
  res.json(docs.map(toInflationRateDTO));
}));
```

- [ ] **Step 3c: Registrar la ruta**

En `server/src/http/app.ts`, agregar el import junto a los otros routers:

```typescript
import { inflationRouter } from "./routes/inflation.js";
```

Y la línea de uso junto a `app.use("/api/payslips", ...)`:

```typescript
app.use("/api/inflation", inflationRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/mappers.test.ts`
Expected: PASS (incluye el nuevo caso).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add server/src/http/mappers.ts server/src/http/mappers.test.ts server/src/http/routes/inflation.ts server/src/http/app.ts`

---

### Task 5: Util puro `deflateToLatest` en el cliente

**Files:**
- Create: `client/src/realSalary.ts`
- Test: `client/src/realSalary.test.ts`

**Interfaces:**
- Consumes: `PayslipDTO`, `InflationRateDTO` (Task 1).
- Produces: `interface RealSalaryPoint { periodo: string; netoReal: number }` y `deflateToLatest(payslips: PayslipDTO[], inflation: InflationRateDTO[]): RealSalaryPoint[]` (ordenado por período; `[]` si falta serie o recibos). Consumido por el chart (Task 6).

- [ ] **Step 1: Write the failing test**

Crear `client/src/realSalary.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";
import { deflateToLatest } from "./realSalary.js";

const payslip = (periodo: string, neto: number): PayslipDTO => ({
  id: periodo, periodo, fechaPago: `${periodo}-05`, cuil: "20-1-3", conceptos: [],
  remunerativo: neto, noRemunerativo: 0, descuentos: 0, brutoTotal: neto, neto,
  costoTotalEmpleador: null, tipoCambioUsd: null, tipoCambioSource: null, netoUsd: null,
});

const inflation = (rows: [string, number][]): InflationRateDTO[] =>
  rows.map(([periodo, variacionMensual]) => ({ periodo, variacionMensual }));

describe("deflateToLatest", () => {
  it("deflacta acumulando la inflación posterior al recibo", () => {
    const result = deflateToLatest(
      [payslip("2025-01", 1000)],
      inflation([["2025-01", 5], ["2025-02", 10], ["2025-03", 10]]),
    );
    expect(result).toEqual([{ periodo: "2025-01", netoReal: 1210 }]);
  });

  it("no toca el recibo del último período (factor 1)", () => {
    const result = deflateToLatest(
      [payslip("2025-03", 1000)],
      inflation([["2025-01", 5], ["2025-02", 10], ["2025-03", 10]]),
    );
    expect(result).toEqual([{ periodo: "2025-03", netoReal: 1000 }]);
  });

  it("usa factor 1 para recibos posteriores al último IPC", () => {
    const result = deflateToLatest(
      [payslip("2025-05", 1000)],
      inflation([["2025-01", 5], ["2025-02", 10]]),
    );
    expect(result).toEqual([{ periodo: "2025-05", netoReal: 1000 }]);
  });

  it("ignora meses ausentes en la serie (hueco = 0%)", () => {
    const result = deflateToLatest(
      [payslip("2025-01", 1000)],
      inflation([["2025-01", 5], ["2025-03", 10]]),
    );
    expect(result).toEqual([{ periodo: "2025-01", netoReal: 1100 }]);
  });

  it("devuelve [] sin serie de inflación", () => {
    expect(deflateToLatest([payslip("2025-01", 1000)], [])).toEqual([]);
  });

  it("ordena la salida por período", () => {
    const result = deflateToLatest(
      [payslip("2025-02", 2000), payslip("2025-01", 1000)],
      inflation([["2025-01", 0], ["2025-02", 0]]),
    );
    expect(result.map((p) => p.periodo)).toEqual(["2025-01", "2025-02"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/realSalary.test.ts`
Expected: FAIL — módulo `./realSalary.js` inexistente.

- [ ] **Step 3: Write minimal implementation**

Crear `client/src/realSalary.ts`:

```typescript
import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";

export interface RealSalaryPoint {
  periodo: string;
  netoReal: number;
}

export function deflateToLatest(payslips: PayslipDTO[], inflation: InflationRateDTO[]): RealSalaryPoint[] {
  if (inflation.length === 0 || payslips.length === 0) return [];

  const sortedInflation = [...inflation].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const latest = sortedInflation[sortedInflation.length - 1].periodo;

  const factorTo = (periodo: string): number => {
    if (periodo >= latest) return 1;
    let factor = 1;
    for (const { periodo: mes, variacionMensual } of sortedInflation) {
      if (mes > periodo && mes <= latest) factor *= 1 + variacionMensual / 100;
    }
    return factor;
  };

  return [...payslips]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((p) => ({ periodo: p.periodo, netoReal: p.neto * factorTo(p.periodo) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/realSalary.test.ts`
Expected: PASS (6 tests).

Nota: en el test de "deflacta acumulando", `1000 · 1,10 · 1,10 = 1210` exacto en float. Si algún caso futuro tuviera error de redondeo, usar `toBeCloseTo`; los casos actuales dan exacto.

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add client/src/realSalary.ts client/src/realSalary.test.ts`

---

### Task 6: Hook `useInflation`, chart `PayslipRealArsChart` e integración en la página

**Files:**
- Modify: `client/src/api/hooks.ts` (import de tipo + `useInflation`)
- Create: `client/src/components/charts/PayslipRealArsChart.tsx`
- Modify: `client/src/pages/PayslipsPage.tsx` (import hook + chart, y nueva `ChartCard`)

**Interfaces:**
- Consumes: `deflateToLatest` (Task 5), `InflationRateDTO` (Task 1), `GET /api/inflation` (Task 4). Patrón de chart nivo de `PayslipNetoArsChart`.
- Produces: `useInflation()` (React Query), `PayslipRealArsChart` (componente).

- [ ] **Step 1: Agregar el hook**

En `client/src/api/hooks.ts`, sumar `InflationRateDTO` a la lista de tipos importados de `@ledgerly/shared` (bloque `import type { ... }`), y agregar junto a `useOficialRate`/`useMonthlyUsd`:

```typescript
export function useInflation() {
  return useQuery({ queryKey: ["inflation"], queryFn: () => apiFetch<InflationRateDTO[]>("/inflation"), staleTime: 1000 * 60 * 60 });
}
```

- [ ] **Step 2: Crear el chart**

Crear `client/src/components/charts/PayslipRealArsChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { monthLabel } from "../../payslipConcepts.js";
import { deflateToLatest } from "../../realSalary.js";

interface PayslipRealArsChartProps {
  payslips: PayslipDTO[];
  inflation: InflationRateDTO[];
  monthOnly?: boolean;
}

export const PayslipRealArsChart = ({ payslips, inflation, monthOnly = false }: PayslipRealArsChartProps) => {
  const theme = useTheme();
  const real = deflateToLatest(payslips, inflation);

  if (real.length === 0) return <Typography color="text.secondary">Sin datos de inflación</Typography>;

  const points = real.map((p) => ({ x: p.periodo, y: p.netoReal }));
  const baseline = points[0].y;
  const color = seriesColor(theme.palette.mode, 4);
  const series = [{ id: "Sueldo real", data: points }];

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
        defs={[linearGradientDef("payslipRealArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "payslipRealArea" }]}
        enableGridX={false}
        markers={[{
          axis: "y",
          value: baseline,
          legend: "Poder de compra inicial",
          legendPosition: "top-left",
          lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1, strokeDasharray: "4 4" },
          textStyle: { fill: theme.palette.text.secondary, fontSize: 10 },
        }]}
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickRotation: monthOnly ? 0 : -45,
          format: monthOnly ? (value) => monthLabel(String(value)) : undefined,
        }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        yFormat={(value) => formatMoney(Number(value), "ARS")}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
```

- [ ] **Step 3: Integrar en la página**

En `client/src/pages/PayslipsPage.tsx`:

Ampliar imports:

```tsx
import { usePayslips, useInflation } from "../api/hooks.js";
import { PayslipRealArsChart } from "../components/charts/PayslipRealArsChart.js";
```

Dentro del componente, junto a `const { data, isLoading } = usePayslips();`:

```tsx
const { data: inflationData } = useInflation();
const inflation = inflationData ?? [];
```

Y en la grilla `MotionBox`, agregar una `ChartCard` (después de la de "Evolución del neto en pesos"):

```tsx
<ChartCard title="Sueldo real (pesos de hoy)"><PayslipRealArsChart payslips={filtered} inflation={inflation} monthOnly={monthOnly} /></ChartCard>
```

- [ ] **Step 4: Verificar tipos**

Run: `bun run typecheck`
Expected: sin errores (confirma que el prop `markers` y el resto compilan contra `@nivo/line` 0.99).

- [ ] **Step 5: Verificar la suite completa**

Run: `bunx vitest run`
Expected: toda la suite en verde (nada roto en client/server/shared).

- [ ] **Step 6: Verificación manual en la app**

Poblar la serie y levantar la app:

```bash
bun run seed:inflation
bun run dev
```

Abrir la página **Sueldo** y confirmar:
- Aparece la card "Sueldo real (pesos de hoy)" con una línea y la referencia punteada "Poder de compra inicial".
- El toggle de año filtra el chart igual que los demás.
- Con la colección de inflación vacía, la card muestra "Sin datos de inflación" (estado vacío) en vez de romper.

- [ ] **Step 7: Stage**

Run: `git add client/src/api/hooks.ts client/src/components/charts/PayslipRealArsChart.tsx client/src/pages/PayslipsPage.tsx`

---

## Self-Review

**Spec coverage:**
- Fuente inflación argentinadatos → Task 2 (fetcher) + Task 3 (backfill). ✓
- Colección `InflationRate` → Task 3. ✓
- Script `seed:inflation` → Task 3. ✓
- Endpoint `GET /api/inflation` + DTO + mapper → Task 1 (DTO) + Task 4 (mapper/route). ✓
- Cálculo deflación pesos de hoy (factor posterior, factor 1 si `P >= L`) → Task 5. ✓
- Hook `useInflation` → Task 6. ✓
- Chart `PayslipRealArsChart` con línea de referencia del primer recibo → Task 6. ✓
- Integración en PayslipsPage respetando toggle de año → Task 6. ✓
- No agrega chart USD, usa dólar oficial, escala pesos de hoy → cubierto por omisión y por Task 6. ✓
- Tests: `realSalary.test`, `inflationRate.test`, `backfillInflation.test`, mapper test, DTO test → Tasks 1-5. ✓
- Borde meses sin IPC (factor 1) y huecos (0%) → tests en Task 5. ✓

**Placeholder scan:** sin TBD/TODO; todo el código está completo y los comandos con salida esperada.

**Type consistency:** `InflationRateDTO { periodo, variacionMensual }` consistente entre shared, model doc, mapper, fetcher (`InflationSeriesEntry` con los mismos campos), util y chart. `deflateToLatest` y `RealSalaryPoint` usados con la misma firma en Task 5 y Task 6. `fetchInflationSeries` firma consistente entre Task 2 (def) y Task 3 (mock/uso).
