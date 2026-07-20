# Representación en USD en el Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar la equivalencia aproximada en dólares del pago de la tarjeta al cierre (`CardCycleSummary`) y del "Total gastado" (`KpiCards`) usando el dólar oficial actual, y agregar un gráfico de gasto mensual en USD al oficial de cada mes.

**Architecture:** Híbrido liviano, sin cambios de modelo ni re-import. Dos endpoints de lectura que consultan `fetchOficialRate` (dólar oficial venta): `GET /api/fx/oficial` (oficial de hoy, para las cifras puntuales) y `GET /api/stats/monthly-usd` (serie mensual ARS÷oficial-del-mes, para el gráfico). El cliente los consume con hooks de TanStack Query con `staleTime` alto.

**Tech Stack:** TypeScript (ESM), Express + Mongoose (server), React 18 + MUI v6 + TanStack Query v5 + Nivo + framer-motion (client), Zod (shared), Vitest + supertest + mongodb-memory-server + RTL. Runtime bun. `globalThis.fetch` para el dólar.

## Global Constraints

- **ESM:** todo import relativo con extensión `.js`; tipos desde `"@ledgerly/shared"`.
- **Sin `any`.** Interfaces para props/retornos. Destructuring en la firma del componente.
- **Componentes:** `export const` arrow, sin default exports. Estilos MUI v6 `sx`. Fragmentos `<>...</>`.
- **Sin comentarios en el código** (naming autoexplicativo).
- **Moneda union `"ARS" | "USD"`.** USD vía `formatMoney(v, "USD")` / `formatMoneyCompact(v, "USD")`.
- **Tipo de cambio = dólar oficial venta** vía `fetchOficialRate` (ya existe; lookback 7 días; `null` si la API falla).
- **`rate` puede ser `null`** en todos lados → la UI no muestra el "≈"/el punto y el gráfico saltea el mes.
- **El "≈ USD" del Total gastado sólo cuando `currency === "ARS"`.**
- **`/stats/monthly-usd` fuerza moneda ARS** en el match (ignora `currency` del query, respeta `from`/`to`/`cardLabel`).
- **Fecha de hoy en server:** `new Date().toISOString().slice(0, 10)`.
- **Test runner:** `bunx vitest run <path>` (un archivo); `bun run test` (todo). **Typecheck:** `bun run typecheck`.
- **Commits locales por tarea.** Mensaje termina con:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Shared — DTOs de FX y gasto mensual en USD

**Files:**
- Modify: `shared/src/dtos.ts`
- Test: `shared/src/dtos.test.ts`

**Interfaces:**
- Produces: `oficialRateDtoSchema` → `OficialRateDTO` (`{ date: string; rate: number | null; source: "oficial" }`); `monthlyUsdStatSchema` → `MonthlyUsdStat` (`{ month: string; totalArs: number; rate: number | null; totalUsd: number | null }`).

- [ ] **Step 1: Write the failing test** — append to `shared/src/dtos.test.ts`:

```ts
import { oficialRateDtoSchema, monthlyUsdStatSchema } from "./dtos.js";

describe("oficialRateDtoSchema", () => {
  it("valida la cotización oficial y acepta rate null", () => {
    expect(oficialRateDtoSchema.parse({ date: "2026-07-20", rate: 1000, source: "oficial" }))
      .toEqual({ date: "2026-07-20", rate: 1000, source: "oficial" });
    expect(oficialRateDtoSchema.parse({ date: "2026-07-20", rate: null, source: "oficial" }).rate).toBeNull();
  });
});

describe("monthlyUsdStatSchema", () => {
  it("valida un punto mensual en USD y acepta rate/totalUsd null", () => {
    const dto = { month: "2026-05", totalArs: 2000, rate: 1000, totalUsd: 2 };
    expect(monthlyUsdStatSchema.parse(dto)).toEqual(dto);
    expect(monthlyUsdStatSchema.parse({ month: "2026-06", totalArs: 500, rate: null, totalUsd: null }).totalUsd).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: FAIL — `oficialRateDtoSchema` no está exportado.

- [ ] **Step 3: Implement** — append to `shared/src/dtos.ts` (después de `autoSummaryDtoSchema`, antes de la sección de `couponImportResultSchema` o al final de los schemas):

```ts
export const oficialRateDtoSchema = z.object({
  date: z.string(),
  rate: z.number().nullable(),
  source: z.literal("oficial"),
});

export const monthlyUsdStatSchema = z.object({
  month: z.string(),
  totalArs: z.number(),
  rate: z.number().nullable(),
  totalUsd: z.number().nullable(),
});
```

Y agregar los tipos junto a los demás `export type` al final del archivo:

```ts
export type OficialRateDTO = z.infer<typeof oficialRateDtoSchema>;
export type MonthlyUsdStat = z.infer<typeof monthlyUsdStatSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/dtos.ts shared/src/dtos.test.ts
git commit -m "$(cat <<'EOF'
feat(shared): add oficial-rate and monthly-USD DTOs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Server — endpoint `GET /api/fx/oficial`

**Files:**
- Create: `server/src/http/routes/fx.ts`
- Modify: `server/src/http/app.ts`
- Test: `server/src/http/routes/fx.test.ts`

**Interfaces:**
- Consumes: `fetchOficialRate` (`../../fx/dollarRate.js`), `asyncHandler` (`../errors.js`).
- Produces: `fxRouter` montado en `/api/fx`; `GET /oficial` → `{ date, rate, source: "oficial" }`.

- [ ] **Step 1: Write the failing test** — create `server/src/http/routes/fx.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import request from "supertest";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import { createApp } from "../app.js";

const app = createApp();
const mockedFx = vi.mocked(fetchOficialRate);

beforeEach(() => mockedFx.mockReset());

describe("GET /api/fx/oficial", () => {
  it("devuelve la cotización oficial de hoy", async () => {
    mockedFx.mockResolvedValue(1234.5);
    const res = await request(app).get("/api/fx/oficial");
    expect(res.status).toBe(200);
    expect(res.body.rate).toBe(1234.5);
    expect(res.body.source).toBe("oficial");
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("devuelve rate null si la API falla", async () => {
    mockedFx.mockResolvedValue(null);
    const res = await request(app).get("/api/fx/oficial");
    expect(res.status).toBe(200);
    expect(res.body.rate).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/http/routes/fx.test.ts`
Expected: FAIL — 404 (ruta no montada).

- [ ] **Step 3: Implement** — create `server/src/http/routes/fx.ts`:

```ts
import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";

export const fxRouter = Router();

fxRouter.get(
  "/oficial",
  asyncHandler(async (_req, res) => {
    const date = new Date().toISOString().slice(0, 10);
    const rate = await fetchOficialRate(date);
    res.json({ date, rate, source: "oficial" });
  }),
);
```

En `server/src/http/app.ts`, agregar el import junto a los otros routers y montarlo:

```ts
import { fxRouter } from "./routes/fx.js";
```

```ts
  app.use("/api/fx", fxRouter);
```

(ubicá el `app.use("/api/fx", fxRouter);` junto a los demás `app.use("/api/...", ...)`, antes del catch-all `app.use("/api", ...)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/http/routes/fx.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/fx.ts server/src/http/app.ts server/src/http/routes/fx.test.ts
git commit -m "$(cat <<'EOF'
feat(api): expose current dolar oficial via GET /api/fx/oficial

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Server — `representativeRateDate` + `GET /api/stats/monthly-usd`

**Files:**
- Create: `server/src/stats/monthlyUsd.ts`
- Test: `server/src/stats/monthlyUsd.test.ts`
- Modify: `server/src/http/routes/stats.ts`
- Test: `server/src/http/routes/stats.test.ts`

**Interfaces:**
- Consumes: `TransactionModel`, `baseMatch` (ya en stats.ts), `fetchOficialRate` (`../../fx/dollarRate.js`), `MonthlyUsdStat` (`@ledgerly/shared`).
- Produces: `representativeRateDate(month: string, todayIso: string): string`; `GET /stats/monthly-usd` → `MonthlyUsdStat[]`.

- [ ] **Step 1: Write the failing test (pure fn)** — create `server/src/stats/monthlyUsd.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { representativeRateDate } from "./monthlyUsd.js";

describe("representativeRateDate", () => {
  it("usa el último día del mes para meses pasados", () => {
    expect(representativeRateDate("2026-05", "2026-07-20")).toBe("2026-05-31");
    expect(representativeRateDate("2026-02", "2026-07-20")).toBe("2026-02-28");
  });

  it("topea en hoy para el mes en curso", () => {
    expect(representativeRateDate("2026-07", "2026-07-20")).toBe("2026-07-20");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run server/src/stats/monthlyUsd.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implement the pure fn** — create `server/src/stats/monthlyUsd.ts`:

```ts
export function representativeRateDate(month: string, todayIso: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
  return monthEnd > todayIso ? todayIso : monthEnd;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run server/src/stats/monthlyUsd.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route test** — en `server/src/http/routes/stats.test.ts`:

Agregar al tope del archivo (primera línea, antes de los `import`), el mock del dólar:

```ts
import { vi } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
```

Agregar el import de la fn mockeada junto a los demás imports:

```ts
import { fetchOficialRate } from "../../fx/dollarRate.js";
```

Y agregar, dentro de `describe("stats", ...)`, estos casos:

```ts
  it("monthly-usd convierte el gasto ARS al oficial de cada mes", async () => {
    vi.mocked(fetchOficialRate).mockResolvedValue(1000);
    const res = await request(app).get("/api/stats/monthly-usd?currency=ARS");
    expect(res.body).toEqual([{ month: "2026-05", totalArs: 2000, rate: 1000, totalUsd: 2 }]);
  });

  it("monthly-usd deja totalUsd null si no hay cotización", async () => {
    vi.mocked(fetchOficialRate).mockResolvedValue(null);
    const res = await request(app).get("/api/stats/monthly-usd?currency=ARS");
    expect(res.body).toEqual([{ month: "2026-05", totalArs: 2000, rate: null, totalUsd: null }]);
  });
```

- [ ] **Step 6: Run route test to verify it fails**

Run: `bunx vitest run server/src/http/routes/stats.test.ts`
Expected: FAIL — `/api/stats/monthly-usd` responde `[]`/404 (ruta inexistente).

- [ ] **Step 7: Implement the route** — en `server/src/http/routes/stats.ts`:

Agregar imports (junto a los existentes):

```ts
import type { Currency, MonthlyUsdStat } from "@ledgerly/shared";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import { representativeRateDate } from "../../stats/monthlyUsd.js";
```

(El archivo ya importa `type { Currency }`; fusioná el import para no duplicarlo: `import type { Currency, MonthlyUsdStat } from "@ledgerly/shared";`.)

Agregar la ruta (por ejemplo después de `/monthly`):

```ts
statsRouter.get("/monthly-usd", asyncHandler(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const rows = (await TransactionModel.aggregate([
    { $match: baseMatch({ ...q, currency: "ARS" }) },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$date" } }, total: { $sum: "$amount" } } },
    { $project: { _id: 0, month: "$_id", total: 1 } },
    { $sort: { month: 1 } },
  ])) as { month: string; total: number }[];
  const today = new Date().toISOString().slice(0, 10);
  const result: MonthlyUsdStat[] = [];
  for (const row of rows) {
    const rate = await fetchOficialRate(representativeRateDate(row.month, today));
    result.push({ month: row.month, totalArs: row.total, rate, totalUsd: rate ? row.total / rate : null });
  }
  res.json(result);
}));
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bunx vitest run server/src/http/routes/stats.test.ts server/src/stats/monthlyUsd.test.ts`
Expected: PASS (incluye los casos previos de stats + los 2 nuevos + la fn pura).

- [ ] **Step 9: Commit**

```bash
git add server/src/stats/monthlyUsd.ts server/src/stats/monthlyUsd.test.ts server/src/http/routes/stats.ts server/src/http/routes/stats.test.ts
git commit -m "$(cat <<'EOF'
feat(stats): add GET /api/stats/monthly-usd priced at each month's oficial

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Client — hooks + "≈ USD" en `CardCycleSummary`

**Files:**
- Modify: `client/src/api/hooks.ts`
- Modify: `client/src/components/CardCycleSummary.tsx`
- Test: `client/src/components/CardCycleSummary.test.tsx`

**Interfaces:**
- Consumes: `OficialRateDTO`, `MonthlyUsdStat` (`@ledgerly/shared`); `apiFetch`, `qs`, `StatFilters` (ya en hooks.ts).
- Produces: `useOficialRate()` → `OficialRateDTO`; `useMonthlyUsd(f: StatFilters)` → `MonthlyUsdStat[]` (consumido en Task 5).

- [ ] **Step 1: Update the failing test** — en `client/src/components/CardCycleSummary.test.tsx`, reemplazar el `vi.stubGlobal("fetch", ...)` por uno que también responda `/fx/oficial`, y agregar la aserción del "≈":

Reemplazar el bloque `beforeEach`:

```tsx
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const data = url.includes("/fx/oficial")
      ? { date: "2026-07-20", rate: 1000, source: "oficial" }
      : url.includes("/statements") ? statements : {};
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
```

Y agregar, al final del `it(...)` existente:

```tsx
    expect(await screen.findByText((text) => text.includes("≈"))).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/CardCycleSummary.test.tsx`
Expected: FAIL — no existe ningún texto con "≈" (el hook aún no se usa).

- [ ] **Step 3: Add the hooks** — en `client/src/api/hooks.ts`:

Agregar `OficialRateDTO, MonthlyUsdStat` al import de tipos desde `@ledgerly/shared` (fusionar con el import existente):

```ts
  ImportResultUnionDTO, MerchantStat, MonthlyStat, MonthlyUsdStat, MortgageCouponDTO, OficialRateDTO, StatementDTO, SummaryStat, TransactionDTO,
```

Agregar los hooks (al final del archivo):

```ts
export function useOficialRate() {
  return useQuery({ queryKey: ["fx-oficial"], queryFn: () => apiFetch<OficialRateDTO>("/fx/oficial"), staleTime: 1000 * 60 * 60 });
}
export function useMonthlyUsd(f: StatFilters) {
  return useQuery({ queryKey: ["monthly-usd", f], queryFn: () => apiFetch<MonthlyUsdStat[]>(`/stats/monthly-usd${qs(f)}`), staleTime: 1000 * 60 * 60 });
}
```

- [ ] **Step 4: Use the rate in `CardCycleSummary`** — en `client/src/components/CardCycleSummary.tsx`:

Agregar el import del hook:

```tsx
import { buildCardCycleSummary } from "../cardCycle.js";
import { useStatements, useOficialRate } from "../api/hooks.js";
```

(reemplaza el import actual `import { useStatements } from "../api/hooks.js";`)

Dentro del componente, tras `const summary = buildCardCycleSummary(data ?? []);`:

```tsx
  const { data: fx } = useOficialRate();
  const rate = fx?.rate ?? null;
```

Reemplazar el bloque del total combinado:

```tsx
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, flexWrap: "wrap", mb: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{formatMoney(summary.totalArs, "ARS")}</Typography>
            {summary.totalUsd > 0 && (
              <Typography variant="h6" color="text.secondary">{formatMoney(summary.totalUsd, "USD")}</Typography>
            )}
          </Box>
```

por:

```tsx
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{formatMoney(summary.totalArs, "ARS")}</Typography>
            {rate && (
              <Typography variant="h6" color="text.secondary">≈ {formatMoney(summary.totalArs / rate, "USD")}</Typography>
            )}
          </Box>
          <Box sx={{ mb: 1 }}>
            {rate && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                al oficial {formatMoney(rate, "ARS")}
              </Typography>
            )}
            {summary.totalUsd > 0 && (
              <Typography variant="caption" color="text.secondary">
                + {formatMoney(summary.totalUsd, "USD")} en dólares
              </Typography>
            )}
          </Box>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run client/src/components/CardCycleSummary.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/api/hooks.ts client/src/components/CardCycleSummary.tsx client/src/components/CardCycleSummary.test.tsx
git commit -m "$(cat <<'EOF'
feat(client): show approx USD of card payment at oficial rate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Client — "≈ USD" en Total gastado + gráfico mensual en USD

**Files:**
- Modify: `client/src/components/KpiCards.tsx`
- Create: `client/src/components/charts/MonthlyUsdChart.tsx`
- Modify: `client/src/pages/DashboardPage.tsx`
- Test: `client/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useOficialRate`, `useMonthlyUsd`, `StatFilters` (Task 4); `formatMoney`, `formatMoneyCompact`; `seriesColor`, `nivoTheme`; `ChartCard`.
- Produces: `MonthlyUsdChart` (props `StatFilters`); `KpiCards` con `sub` en "Total gastado"; `DashboardPage` con el nuevo `ChartCard`.

- [ ] **Step 1: Update the failing test** — en `client/src/pages/DashboardPage.test.tsx`, agregar al `route(url)` las dos rutas nuevas **justo después del bloque `/statements`** (antes de `/stats/summary`; importante: `/stats/monthly-usd` debe ir antes que `/stats/monthly`):

```ts
  if (url.includes("/fx/oficial")) return { date: "2026-07-20", rate: 1000, source: "oficial" };
  if (url.includes("/stats/monthly-usd")) return [{ month: "2026-05", totalArs: 2000, rate: 1000, totalUsd: 2 }];
```

Y agregar al final del `it(...)`:

```ts
    expect(await screen.findByText("Gasto mensual en USD (al oficial de cada mes)")).toBeInTheDocument();
    expect(screen.getAllByText((text) => text.includes("≈")).length).toBeGreaterThan(0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/DashboardPage.test.tsx`
Expected: FAIL — no existe el título del gráfico nuevo.

- [ ] **Step 3: Add `sub` to `KpiCards`** — en `client/src/components/KpiCards.tsx`:

Agregar `sub?: string` a la interfaz `KpiProps`:

```tsx
interface KpiProps {
  label: string;
  value: number;
  format: (value: number) => string;
  sub?: string;
  icon: ReactNode;
  color: KpiColor;
}
```

Actualizar la firma y el render del `Kpi` para aceptar y mostrar `sub`:

```tsx
const Kpi = ({ label, value, format, sub, icon, color }: KpiProps) => (
```

Dentro del `<Box sx={{ minWidth: 0 }}>`, después del `<Typography variant="h5" ...>`:

```tsx
          {sub && <Typography variant="caption" color="text.secondary" noWrap>{sub}</Typography>}
```

Importar el hook y computar el sub. Cambiar el import:

```tsx
import { useSummary, useOficialRate, type StatFilters } from "../api/hooks.js";
```

Dentro de `KpiCards`, después de `const { data } = useSummary(filters);` y su guard:

```tsx
  const { data: fx } = useOficialRate();
  const rate = fx?.rate ?? null;
  const totalGastadoSub = filters.currency === "ARS" && rate
    ? `≈ ${formatMoney(data.totalPurchases / rate, "USD")}`
    : undefined;
```

Pasar el sub al Kpi de "Total gastado":

```tsx
      <Kpi label="Total gastado" value={data.totalPurchases} format={money} sub={totalGastadoSub} icon={<PaymentsIcon />} color="primary" />
```

- [ ] **Step 4: Create `MonthlyUsdChart`** — create `client/src/components/charts/MonthlyUsdChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import { useMonthlyUsd, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const MonthlyUsdChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useMonthlyUsd(filters);
  const points = (data ?? []).filter((d) => d.totalUsd != null);
  if (points.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const color = seriesColor(theme.palette.mode, 2);
  const series = [{ id: "USD", data: points.map((d) => ({ x: d.month, y: d.totalUsd as number })) }];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme(theme)}
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 40, left: 64 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: 0, max: "auto" }}
        curve="monotoneX"
        lineWidth={3}
        pointSize={8}
        pointColor={theme.palette.background.paper}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea
        areaOpacity={1}
        defs={[linearGradientDef("usdArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "usdArea" }]}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 10 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "USD") }}
        yFormat={(value) => formatMoney(Number(value), "USD")}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
```

- [ ] **Step 5: Mount the chart in `DashboardPage`** — en `client/src/pages/DashboardPage.tsx`:

Agregar el import:

```tsx
import { MonthlyUsdChart } from "../components/charts/MonthlyUsdChart.js";
```

Agregar un `ChartCard` dentro del grid de charts (después de "Top comercios"):

```tsx
        <ChartCard title="Gasto mensual en USD (al oficial de cada mes)"><MonthlyUsdChart {...filters} /></ChartCard>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/DashboardPage.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full typecheck + test suite**

Run: `bun run typecheck && bun run test`
Expected: PASS (suite completa verde).

- [ ] **Step 8: Commit**

```bash
git add client/src/components/KpiCards.tsx client/src/components/charts/MonthlyUsdChart.tsx client/src/pages/DashboardPage.tsx client/src/pages/DashboardPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(client): approx-USD on Total gastado KPI and monthly-USD chart

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- FX oficial actual (endpoint + hook) → Task 2, Task 4. ✓
- Serie mensual ARS÷oficial-del-mes (`representativeRateDate` + `/stats/monthly-usd`) → Task 3. ✓
- "≈ USD" del pago de tarjeta (total ARS ÷ oficial; USD real de Visa como caption) → Task 4. ✓
- "≈ USD" en Total gastado (sólo currency ARS) → Task 5 (`totalGastadoSub`). ✓
- Gráfico de gasto mensual en USD → Task 5 (`MonthlyUsdChart` + Dashboard). ✓
- DTOs shared → Task 1. ✓
- `rate: null` manejado en server (Task 3), CardCycleSummary/KpiCards (`rate &&`), y gráfico (`filter(totalUsd != null)`). ✓

**Placeholder scan:** sin TBD/TODO; todos los pasos con código o comando concreto. ✓

**Type consistency:** `OficialRateDTO`/`MonthlyUsdStat` idénticos entre Task 1 (definición), hooks (Task 4) y ruta (Task 3). `useOficialRate`/`useMonthlyUsd` definidos en Task 4 y consumidos en Task 4/5 con las mismas firmas. `representativeRateDate(month, todayIso)` idéntico entre Task 3 def y uso. Campo `sub` de `KpiProps` (Task 5) consistente con el patrón de `CreditKpiCards`. ✓
