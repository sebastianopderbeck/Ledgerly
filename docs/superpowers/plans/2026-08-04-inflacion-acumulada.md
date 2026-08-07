# Inflación acumulada por período — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a la página Sueldo un gráfico de inflación acumulada (YTD) atado al toggle de año existente.

**Architecture:** Cliente puro. Un util testeable `accumulatedInflation` compone la serie mensual de IPC (ya expuesta en `/api/inflation`) en una acumulada por scope (año seleccionado o todos), y un chart nivo la dibuja en la grilla de la página Sueldo.

**Tech Stack:** React + `@nivo/line` 0.99, React Query (`useInflation` ya existe), Vitest, bun.

## Global Constraints

- **Scope:** año seleccionado → meses de ese año; `null` (toggle "Todos") → meses cuyo año esté en `years`.
- **Acumulado:** `(∏(1 + variacionMensual/100) hasta el mes − 1) × 100`; el primer punto del scope = su propia variación mensual.
- **Sin comentarios en el código** (regla global del usuario); componentes funcionales con destructuring en la firma; sin `any`.
- **Sin cambios de server**: la serie ya se sirve en `/api/inflation`.
- **Commits:** el usuario maneja git; no correr `git commit` salvo pedido explícito.
- **Tests:** `bunx vitest run <archivo>`; typecheck: `bun run typecheck`.

---

### Task 1: `formatPercent` + util `accumulatedInflation`

**Files:**
- Modify: `client/src/format.ts` (agregar `formatPercent`)
- Create: `client/src/inflationStats.ts`
- Test: `client/src/inflationStats.test.ts`

**Interfaces:**
- Produces: `formatPercent(value: number): string`; `interface AccumulatedInflationPoint { periodo: string; acumulado: number }`; `accumulatedInflation(inflation: InflationRateDTO[], year: string | null, years: string[]): AccumulatedInflationPoint[]`. Consumido por el chart (Task 2).

- [ ] **Step 1: Write the failing test**

Crear `client/src/inflationStats.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { InflationRateDTO } from "@ledgerly/shared";
import { accumulatedInflation } from "./inflationStats.js";

const inflation = (rows: [string, number][]): InflationRateDTO[] =>
  rows.map(([periodo, variacionMensual]) => ({ periodo, variacionMensual }));

describe("accumulatedInflation", () => {
  it("acumula YTD del año seleccionado, primer punto = variación de enero", () => {
    const result = accumulatedInflation(
      inflation([["2024-12", 8], ["2025-01", 2], ["2025-02", 2], ["2025-03", 2]]),
      "2025",
      ["2024", "2025"],
    );
    expect(result.map((p) => p.periodo)).toEqual(["2025-01", "2025-02", "2025-03"]);
    expect(result[0].acumulado).toBeCloseTo(2, 6);
    expect(result[2].acumulado).toBeCloseTo(6.1208, 4);
  });

  it("en 'Todos' (year=null) acumula atravesando los años del toggle", () => {
    const result = accumulatedInflation(
      inflation([["2024-12", 10], ["2025-01", 2]]),
      null,
      ["2024", "2025"],
    );
    expect(result.map((p) => p.periodo)).toEqual(["2024-12", "2025-01"]);
    expect(result[0].acumulado).toBeCloseTo(10, 6);
    expect(result[1].acumulado).toBeCloseTo(12.2, 6);
  });

  it("ordena la salida por período aunque la entrada venga desordenada", () => {
    const result = accumulatedInflation(
      inflation([["2025-03", 1], ["2025-01", 1], ["2025-02", 1]]),
      "2025",
      ["2025"],
    );
    expect(result.map((p) => p.periodo)).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("devuelve [] con serie vacía", () => {
    expect(accumulatedInflation([], "2025", ["2025"])).toEqual([]);
  });

  it("devuelve [] si el año no tiene datos en la serie", () => {
    expect(accumulatedInflation(inflation([["2024-01", 5]]), "2025", ["2024", "2025"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/inflationStats.test.ts`
Expected: FAIL — módulo `./inflationStats.js` inexistente.

- [ ] **Step 3a: Implementar el util**

Crear `client/src/inflationStats.ts`:

```typescript
import type { InflationRateDTO } from "@ledgerly/shared";

export interface AccumulatedInflationPoint {
  periodo: string;
  acumulado: number;
}

export function accumulatedInflation(
  inflation: InflationRateDTO[],
  year: string | null,
  years: string[],
): AccumulatedInflationPoint[] {
  const inScope = (periodo: string): boolean =>
    year === null ? years.includes(periodo.slice(0, 4)) : periodo.slice(0, 4) === year;

  const months = inflation
    .filter((entry) => inScope(entry.periodo))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  let factor = 1;
  return months.map((entry) => {
    factor *= 1 + entry.variacionMensual / 100;
    return { periodo: entry.periodo, acumulado: (factor - 1) * 100 };
  });
}
```

- [ ] **Step 3b: Agregar `formatPercent`**

En `client/src/format.ts`, agregar al final:

```typescript
export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/inflationStats.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verificar tipos y stage**

Run: `bun run typecheck` → sin errores.
Run: `git add client/src/inflationStats.ts client/src/inflationStats.test.ts client/src/format.ts`

---

### Task 2: Componente `InflationAccumulatedChart`

**Files:**
- Create: `client/src/components/charts/InflationAccumulatedChart.tsx`

**Interfaces:**
- Consumes: `accumulatedInflation`, `formatPercent` (Task 1); patrón de `PayslipNetoArsChart`.
- Produces: `InflationAccumulatedChart` con props `{ inflation: InflationRateDTO[]; year: string | null; years: string[]; monthOnly?: boolean }`.

- [ ] **Step 1: Crear el componente**

Crear `client/src/components/charts/InflationAccumulatedChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import type { InflationRateDTO } from "@ledgerly/shared";
import { formatPercent } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { monthLabel } from "../../payslipConcepts.js";
import { accumulatedInflation } from "../../inflationStats.js";

interface InflationAccumulatedChartProps {
  inflation: InflationRateDTO[];
  year: string | null;
  years: string[];
  monthOnly?: boolean;
}

export const InflationAccumulatedChart = ({ inflation, year, years, monthOnly = false }: InflationAccumulatedChartProps) => {
  const theme = useTheme();
  const acc = accumulatedInflation(inflation, year, years);

  if (acc.length === 0) return <Typography color="text.secondary">Sin datos de inflación</Typography>;

  const points = acc.map((p) => ({ x: p.periodo, y: p.acumulado }));
  const color = seriesColor(theme.palette.mode, 6);
  const series = [{ id: "Inflación acumulada", data: points }];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme(theme)}
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
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
        defs={[linearGradientDef("inflationAccArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "inflationAccArea" }]}
        enableGridX={false}
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickRotation: monthOnly ? 0 : -45,
          format: monthOnly ? (value) => monthLabel(String(value)) : undefined,
        }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatPercent(Number(value)) }}
        yFormat={(value) => formatPercent(Number(value))}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
```

- [ ] **Step 2: Verificar tipos**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Stage**

Run: `git add client/src/components/charts/InflationAccumulatedChart.tsx`

---

### Task 3: Integrar en la página Sueldo

**Files:**
- Modify: `client/src/pages/PayslipsPage.tsx`

**Interfaces:**
- Consumes: `InflationAccumulatedChart` (Task 2); `inflation`, `activeYear`, `years`, `monthOnly`, `ALL` ya presentes en la página.

- [ ] **Step 1: Agregar import y ChartCard**

En `client/src/pages/PayslipsPage.tsx`, ampliar imports:

```tsx
import { InflationAccumulatedChart } from "../components/charts/InflationAccumulatedChart.js";
```

Y en la grilla `MotionBox`, agregar después de la card "Sueldo real (pesos de hoy)":

```tsx
<ChartCard title="Inflación acumulada"><InflationAccumulatedChart inflation={inflation} year={activeYear === ALL ? null : activeYear} years={years} monthOnly={monthOnly} /></ChartCard>
```

- [ ] **Step 2: Verificar tipos**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Correr la suite completa**

Run: `bunx vitest run`
Expected: toda la suite en verde.

- [ ] **Step 4: Verificación manual**

`bun run dev`, abrir la página **Sueldo**:
- Aparece la card "Inflación acumulada" con la línea en %.
- Cambiar el toggle a 2025 / 2026 / Todos actualiza el scope (mes a mes por año; acumulado total en "Todos").

- [ ] **Step 5: Stage**

Run: `git add client/src/pages/PayslipsPage.tsx`

---

## Self-Review

**Spec coverage:** util `accumulatedInflation` (Task 1) ✓, `formatPercent` (Task 1) ✓, chart con scope por toggle y estado vacío (Task 2) ✓, integración en la página (Task 3) ✓, tests YTD/Todos/empty/orden/año-sin-datos (Task 1) ✓, sin cambios de server ✓.

**Placeholder scan:** sin TBD/TODO; código y comandos completos.

**Type consistency:** `AccumulatedInflationPoint { periodo, acumulado }` y la firma `accumulatedInflation(inflation, year: string | null, years)` usadas igual en Task 1 (def), Task 2 (uso) y Task 3 (`year={activeYear === ALL ? null : activeYear}`). `formatPercent(number): string` consistente entre format.ts y el chart.
