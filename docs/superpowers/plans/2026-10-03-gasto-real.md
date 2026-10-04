# Gasto ajustado por inflación — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llenar la tarjeta «Gasto real (pesos de hoy)» del Dashboard con el gasto mensual de tarjeta en pesos del último IPC, su línea nominal y dos lecturas (interanual y vs promedio de los 12 meses anteriores).

**Architecture:** Solo cliente. Tres módulos puros (`statementCoverage.ts`, `realSpending.ts` y el refactor de `realSalary.ts` sobre `buildDeflator`) calculan la vista; un hook compuesto (`useRealSpending.ts`) junta cuatro hooks existentes y memoiza la vista; `RealSpendingPanel` (reemplaza el stub de la base) resuelve los estados con retornos tempranos y compone `RealSpendingStats` (encabezado) y `RealSpendingChart` (nivo, dos líneas).

**Tech Stack:** React 18 + MUI 6 + @tanstack/react-query 5 + @nivo/line 0.99; Vitest + Testing Library (jsdom); Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-03-gasto-real-design.md`

## Prerrequisitos

- Rama `feat/gasto-real` creada desde `feat/base-nuevas-features` en el worktree propio, con `bun install` corrido.
- La base ya trae, y este plan **no toca**: el slot en `DashboardPage.tsx`, `buildDeflator`/`Deflator` en `client/src/inflationIndex.ts`, `addMonths`/`lastDayOfMonth`/`monthOf` en `client/src/isoDate.ts`, `formatSignedPercent` en `client/src/format.ts`, `latestStatementPerIssuer` en `client/src/cardCycle.ts` y los hooks de `client/src/api/hooks.ts`.
- **No** se crean `client/src/deflate.ts`, `client/src/months.ts` ni sus tests.

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc.
- Componentes funcionales `const X = ({ props }) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`.
- Filtros, mapeos y condicionales antes del `return`; estados de carga y error con retornos tempranos.
- Imports con extensión `.js` (ESM), como el resto del repo. El cliente importa solo **tipos** de `@ledgerly/shared`.
- Copy exacto: «Gasto real (pesos de hoy)», «El gasto real se calcula sobre los consumos en pesos.», «Sin datos de inflación», «Sin meses cerrados con IPC publicado en este período», «No se pudo calcular el gasto real», «En pesos de {mes} (último IPC publicado). Incluye las cuotas que faltan facturar.», «Interanual», «Vs promedio», «vs {mes}», «sin datos de {mes}», «de los {n} meses anteriores», «faltan meses anteriores», series «Real» y «Nominal».
- `MIN_MESES_PROMEDIO = 3`; ventana de 12 meses; alto del gráfico 260 px; color «Real» = `seriesColor(mode, 4)`, «Nominal» = `seriesColor(mode, 0)`.
- Variación que sube → `warning.main`; que baja → `success.main`; 0 o sin dato → `text.primary`.
- Tests de cliente con más de un render en el archivo llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado).
- Fixtures sintéticos; `examples/` nunca se commitea.
- Comandos: `bun run test <ruta>` (vitest run), `bun run typecheck`, `bun run build`.
- Commits con pathspec explícito, mensaje convencional en español y la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git add -A`, push ni PR.

## Review Focus

1. **Mes en curso o esperando el resumen de la otra tarjeta** (Visa cerró el 2/10, ICBC el 7/9): no se grafica septiembre aunque `/stats/monthly` lo traiga. → tests en Task 2 (dos emisores) y Task 3 (`realSpendingSeries` corta en `hasta`; `buildRealSpendingView` con mes abierto).
2. **Año elegido sin meses completos** (`?year=2027`, o el año actual en enero antes del primer cierre): la tarjeta dice «Sin meses cerrados…», no se rompe ni muestra un gráfico vacío. → test en Task 3 (`years: ["2027"]`).
3. **Meses posteriores al último IPC**: no se grafican con factor 1 (se verían más baratos que los anteriores). → test en Task 3 (`realSpendingSeries` corta en `pesosDe`).
4. **El mismo mes del año anterior con gasto 0**: la interanual queda en «—», no en `Infinity`. → test en Task 3.
5. **Moneda USD**: la tarjeta avisa y no pide `/inflation` ni el detalle de cuotas. → test en Task 5.

---

### Task 1: Sueldo real usa `buildDeflator`

**Files:**
- Modify: `client/src/realSalary.ts`
- Test (sin cambios): `client/src/realSalary.test.ts`

**Interfaces:**
- Consumes: `buildDeflator(inflation: InflationRateDTO[]): Deflator | null` de `client/src/inflationIndex.ts` (base).
- Produces: `deflateToLatest(payslips, inflation): RealSalaryPoint[]` con la misma firma y comportamiento.

- [ ] **Step 1: Confirmar los tests en verde antes del refactor**

Run: `bun run test client/src/realSalary.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 2: Refactor**

`client/src/realSalary.ts` completo:

```ts
import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";
import { buildDeflator } from "./inflationIndex.js";

export interface RealSalaryPoint {
  periodo: string;
  netoReal: number;
}

export function deflateToLatest(payslips: PayslipDTO[], inflation: InflationRateDTO[]): RealSalaryPoint[] {
  const deflator = buildDeflator(inflation);
  if (deflator === null || payslips.length === 0) return [];

  return [...payslips]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((p) => ({ periodo: p.periodo, netoReal: p.neto * deflator.factor(p.periodo) }));
}
```

- [ ] **Step 3: Verificar que siguen en verde**

Run: `bun run test client/src/realSalary.test.ts client/src/inflationIndex.test.ts`
Expected: PASS, sin tocar los tests.

- [ ] **Step 4: Commit**

```bash
git add client/src/realSalary.ts
git commit -m "refactor(client): sueldo real deflacta con buildDeflator" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cobertura de resúmenes

**Files:**
- Create: `client/src/statementCoverage.ts`
- Test: `client/src/statementCoverage.test.ts`

**Interfaces:**
- Consumes: `addMonths`, `lastDayOfMonth`, `monthOf` de `client/src/isoDate.ts`.
- Produces:
  - `interface MonthRange { desde: string; hasta: string }`
  - `completeMonthRange(statements: StatementDTO[]): MonthRange | null`

- [ ] **Step 1: Write the failing test**

`client/src/statementCoverage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { StatementDTO } from "@ledgerly/shared";
import { completeMonthRange } from "./statementCoverage.js";

const makeStatement = (issuer: StatementDTO["issuer"], closingDate: string | null): StatementDTO => ({
  id: `${issuer}-${closingDate}`,
  issuer,
  cardLabel: issuer === "icbc" ? "ICBC" : "Visa Signature",
  last4: "1234",
  closingDate,
  dueDate: null,
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 0, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "x.pdf",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt: "2026-07-01T00:00:00.000Z",
});

describe("completeMonthRange", () => {
  it("con un emisor va del mes del primer cierre al mes anterior al último cierre", () => {
    const statements = [makeStatement("icbc", "2026-06-07"), makeStatement("icbc", "2026-07-07")];
    expect(completeMonthRange(statements)).toEqual({ desde: "2026-06", hasta: "2026-06" });
  });

  it("un cierre el último día del mes deja ese mes completo", () => {
    const statements = [makeStatement("icbc", "2026-08-31"), makeStatement("icbc", "2026-09-30")];
    expect(completeMonthRange(statements)).toEqual({ desde: "2026-08", hasta: "2026-09" });
  });

  it("con dos emisores termina donde termina el que cerró antes", () => {
    const statements = [
      makeStatement("visa_signature", "2026-07-02"),
      makeStatement("visa_signature", "2026-10-02"),
      makeStatement("icbc", "2026-07-07"),
      makeStatement("icbc", "2026-09-07"),
    ];
    expect(completeMonthRange(statements)).toEqual({ desde: "2026-07", hasta: "2026-08" });
  });

  it("arranca cuando todos los emisores tienen su primer resumen", () => {
    const statements = [
      makeStatement("visa_signature", "2025-03-02"),
      makeStatement("visa_signature", "2025-09-02"),
      makeStatement("icbc", "2025-06-07"),
      makeStatement("icbc", "2025-09-07"),
    ];
    expect(completeMonthRange(statements)).toEqual({ desde: "2025-06", hasta: "2025-08" });
  });

  it("con un solo resumen no hay meses completos", () => {
    expect(completeMonthRange([makeStatement("icbc", "2026-07-07")])).toBeNull();
  });

  it("ignora los resúmenes sin fecha de cierre", () => {
    const statements = [
      makeStatement("icbc", "2026-06-07"),
      makeStatement("icbc", "2026-07-07"),
      makeStatement("visa_signature", null),
    ];
    expect(completeMonthRange(statements)).toEqual({ desde: "2026-06", hasta: "2026-06" });
  });

  it("sin ningún cierre devuelve null", () => {
    expect(completeMonthRange([makeStatement("visa_signature", null), makeStatement("icbc", null)])).toBeNull();
    expect(completeMonthRange([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/statementCoverage.test.ts`
Expected: FAIL — `Failed to load url ./statementCoverage.js` (el módulo no existe).

- [ ] **Step 3: Implement**

`client/src/statementCoverage.ts`:

```ts
import type { Issuer, StatementDTO } from "@ledgerly/shared";
import { addMonths, lastDayOfMonth, monthOf } from "./isoDate.js";

export interface MonthRange {
  desde: string;
  hasta: string;
}

interface ClosingSpan {
  first: string;
  last: string;
}

const closingSpanPerIssuer = (statements: StatementDTO[]): ClosingSpan[] => {
  const spans = new Map<Issuer, ClosingSpan>();
  for (const { issuer, closingDate } of statements) {
    if (closingDate === null) continue;
    const fecha = closingDate.slice(0, 10);
    const span = spans.get(issuer);
    spans.set(issuer, {
      first: span === undefined || fecha < span.first ? fecha : span.first,
      last: span === undefined || fecha > span.last ? fecha : span.last,
    });
  }
  return [...spans.values()];
};

const lastCompleteMonth = (closingDate: string): string => {
  const month = monthOf(closingDate);
  return closingDate === lastDayOfMonth(month) ? month : addMonths(month, -1);
};

export function completeMonthRange(statements: StatementDTO[]): MonthRange | null {
  const spans = closingSpanPerIssuer(statements);
  if (spans.length === 0) return null;
  const desde = monthOf(spans.map(({ first }) => first).reduce((latest, fecha) => (fecha > latest ? fecha : latest)));
  const commonClosing = spans.map(({ last }) => last).reduce((earliest, fecha) => (fecha < earliest ? fecha : earliest));
  const hasta = lastCompleteMonth(commonClosing);
  return hasta < desde ? null : { desde, hasta };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/statementCoverage.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/statementCoverage.ts client/src/statementCoverage.test.ts
git commit -m "feat(client): meses completos según los resúmenes importados" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Motor del gasto real

**Files:**
- Create: `client/src/realSpending.ts`
- Test: `client/src/realSpending.test.ts`

**Interfaces:**
- Consumes: `buildDeflator`, `Deflator` (`client/src/inflationIndex.ts`); `addMonths`, `monthOf` (`client/src/isoDate.ts`); `completeMonthRange`, `MonthRange` (Task 2).
- Produces:
  - `MIN_MESES_PROMEDIO = 3`
  - `interface RealSpendingPoint { month: string; nominal: number; real: number }`
  - `interface RealSpendingSummary { month: string; real: number; interanual: number | null; vsPromedio: number | null; mesesPromedio: number }`
  - `interface RealSpendingInput { monthly: MonthlyStat[]; pendingDetail: FutureInstallmentMonth[]; statements: StatementDTO[]; inflation: InflationRateDTO[] }`
  - `interface RealSpendingScope { cardLabel?: string; years?: string[]; from?: string; to?: string }`
  - `interface RealSpendingView { pesosDe: string | null; points: RealSpendingPoint[]; summary: RealSpendingSummary | null }`
  - `pendingByPurchaseMonth(detail: FutureInstallmentMonth[]): Map<string, number>`
  - `realSpendingSeries(monthly: MonthlyStat[], pending: Map<string, number>, deflator: Deflator, range: MonthRange): RealSpendingPoint[]`
  - `summarizeRealSpending(series: RealSpendingPoint[], month: string): RealSpendingSummary | null`
  - `buildRealSpendingView(input: RealSpendingInput, scope: RealSpendingScope): RealSpendingView`

- [ ] **Step 1: Write the failing test**

`client/src/realSpending.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type {
  FutureInstallmentItem, FutureInstallmentMonth, InflationRateDTO, MonthlyStat, StatementDTO,
} from "@ledgerly/shared";
import { buildDeflator, type Deflator } from "./inflationIndex.js";
import { addMonths } from "./isoDate.js";
import {
  buildRealSpendingView,
  pendingByPurchaseMonth,
  realSpendingSeries,
  summarizeRealSpending,
  type RealSpendingInput,
  type RealSpendingPoint,
} from "./realSpending.js";

const monthsFrom = (desde: string, hasta: string): string[] => {
  const months: string[] = [];
  for (let month = desde; month <= hasta; month = addMonths(month, 1)) months.push(month);
  return months;
};

const ipc = (desde: string, hasta: string, variacionMensual: number): InflationRateDTO[] =>
  monthsFrom(desde, hasta).map((periodo) => ({ periodo, variacionMensual }));

const monthly = (pairs: [string, number][]): MonthlyStat[] => pairs.map(([month, total]) => ({ month, total, count: 1 }));

const item = (purchaseDate: string, amount: number): FutureInstallmentItem => ({
  merchant: "COMERCIO", category: "Compras", amount, installmentNumber: 2, installmentTotal: 3, purchaseDate,
});

const pendingMonth = (month: string, items: FutureInstallmentItem[]): FutureInstallmentMonth => ({
  month, total: items.reduce((sum, { amount }) => sum + amount, 0), count: items.length, items,
});

const point = (month: string, real: number): RealSpendingPoint => ({ month, nominal: real, real });

const makeStatement = (issuer: StatementDTO["issuer"], cardLabel: string, closingDate: string): StatementDTO => ({
  id: `${issuer}-${closingDate}`,
  issuer,
  cardLabel,
  last4: "1234",
  closingDate,
  dueDate: null,
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 0, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "x.pdf",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt: "2026-07-01T00:00:00.000Z",
});

const statementsEveryMonth = (
  issuer: StatementDTO["issuer"], cardLabel: string, desde: string, hasta: string, day: string,
): StatementDTO[] => monthsFrom(desde, hasta).map((month) => makeStatement(issuer, cardLabel, `${month}-${day}`));

describe("pendingByPurchaseMonth", () => {
  it("suma en el mes de compra las cuotas que vencen en meses distintos", () => {
    const detail = [
      pendingMonth("2026-09", [item("2026-07-15", 1000), item("2026-08-03", 500)]),
      pendingMonth("2026-10", [item("2026-07-15", 1000)]),
    ];
    expect(pendingByPurchaseMonth(detail)).toEqual(new Map([["2026-07", 2000], ["2026-08", 500]]));
  });

  it("sin cuotas pendientes devuelve un mapa vacío", () => {
    expect(pendingByPurchaseMonth([]).size).toBe(0);
  });
});

describe("realSpendingSeries", () => {
  const deflator = buildDeflator(ipc("2026-02", "2026-04", 10)) as Deflator;

  it("suma las cuotas pendientes al mes de compra y lleva a pesos del último IPC", () => {
    const series = realSpendingSeries(
      monthly([["2026-03", 1000], ["2026-04", 2000]]),
      new Map([["2026-03", 500]]),
      deflator,
      { desde: "2026-01", hasta: "2026-06" },
    );
    expect(series.map(({ month }) => month)).toEqual(["2026-03", "2026-04"]);
    expect(series[0].nominal).toBe(1500);
    expect(series[0].real).toBeCloseTo(1650);
    expect(series[1]).toEqual({ month: "2026-04", nominal: 2000, real: 2000 });
  });

  it("corta en el último mes completo aunque haya IPC posterior", () => {
    const series = realSpendingSeries(monthly([["2026-03", 1000], ["2026-04", 2000]]), new Map(), deflator, {
      desde: "2026-01", hasta: "2026-03",
    });
    expect(series.map(({ month }) => month)).toEqual(["2026-03"]);
  });

  it("corta en el último IPC aunque haya meses completos posteriores", () => {
    const series = realSpendingSeries(
      monthly([["2026-04", 1000], ["2026-05", 1000], ["2026-06", 1000]]),
      new Map(),
      deflator,
      { desde: "2026-01", hasta: "2026-06" },
    );
    expect(series.map(({ month }) => month)).toEqual(["2026-04"]);
  });

  it("deja afuera los meses anteriores a la cobertura", () => {
    const series = realSpendingSeries(monthly([["2026-02", 1000], ["2026-03", 1000]]), new Map(), deflator, {
      desde: "2026-03", hasta: "2026-04",
    });
    expect(series.map(({ month }) => month)).toEqual(["2026-03"]);
  });

  it("ignora las cuotas pendientes de meses sin compras facturadas", () => {
    const series = realSpendingSeries(monthly([["2026-04", 1000]]), new Map([["2026-03", 999]]), deflator, {
      desde: "2026-01", hasta: "2026-04",
    });
    expect(series).toEqual([{ month: "2026-04", nominal: 1000, real: 1000 }]);
  });

  it("ordena por mes aunque la entrada venga desordenada", () => {
    const series = realSpendingSeries(
      monthly([["2026-04", 1], ["2026-02", 1], ["2026-03", 1]]),
      new Map(),
      deflator,
      { desde: "2026-01", hasta: "2026-04" },
    );
    expect(series.map(({ month }) => month)).toEqual(["2026-02", "2026-03", "2026-04"]);
  });
});

describe("summarizeRealSpending", () => {
  it("con cuotas pendientes la interanual real del ejemplo da +41,9 %", () => {
    const deflator = buildDeflator(ipc("2025-09", "2026-08", 2)) as Deflator;
    const series = realSpendingSeries(
      monthly([["2025-08", 100000], ["2026-08", 150000]]),
      new Map([["2026-08", 30000]]),
      deflator,
      { desde: "2025-01", hasta: "2026-08" },
    );
    const summary = summarizeRealSpending(series, "2026-08");
    expect(series[0].real).toBeCloseTo(126824.18, 1);
    expect(summary?.real).toBe(180000);
    expect(summary?.interanual).toBeCloseTo(41.93, 1);
    expect(summary?.vsPromedio).toBeNull();
    expect(summary?.mesesPromedio).toBe(1);
  });

  it("sin el mismo mes del año anterior la interanual es null", () => {
    const series = monthsFrom("2026-01", "2026-08").map((month) => point(month, 100));
    expect(summarizeRealSpending(series, "2026-08")?.interanual).toBeNull();
  });

  it("con el mismo mes del año anterior en 0 la interanual es null", () => {
    const series = [point("2025-08", 0), point("2026-08", 100)];
    expect(summarizeRealSpending(series, "2026-08")?.interanual).toBeNull();
  });

  it("promedia los 12 meses anteriores y nada más", () => {
    const series = [
      point("2025-07", 1000),
      ...monthsFrom("2025-08", "2026-07").map((month) => point(month, 100)),
      point("2026-08", 150),
    ];
    const summary = summarizeRealSpending(series, "2026-08");
    expect(summary?.vsPromedio).toBeCloseTo(50);
    expect(summary?.mesesPromedio).toBe(12);
    expect(summary?.interanual).toBeCloseTo(50);
  });

  it("con 3 meses anteriores ya calcula el promedio", () => {
    const series = [point("2026-05", 100), point("2026-06", 100), point("2026-07", 100), point("2026-08", 90)];
    const summary = summarizeRealSpending(series, "2026-08");
    expect(summary?.vsPromedio).toBeCloseTo(-10);
    expect(summary?.mesesPromedio).toBe(3);
  });

  it("con 2 meses anteriores no alcanza para el promedio", () => {
    const series = [point("2026-06", 100), point("2026-07", 100), point("2026-08", 90)];
    const summary = summarizeRealSpending(series, "2026-08");
    expect(summary?.vsPromedio).toBeNull();
    expect(summary?.mesesPromedio).toBe(2);
  });

  it("los meses que faltan no cuentan como cero", () => {
    const series = [point("2026-03", 100), point("2026-05", 100), point("2026-07", 100), point("2026-08", 200)];
    const summary = summarizeRealSpending(series, "2026-08");
    expect(summary?.vsPromedio).toBeCloseTo(100);
    expect(summary?.mesesPromedio).toBe(3);
  });

  it("un mes fuera de la serie no tiene resumen", () => {
    expect(summarizeRealSpending([point("2026-08", 100)], "2026-09")).toBeNull();
  });
});

describe("buildRealSpendingView", () => {
  const totals: [string, number][] = monthsFrom("2025-01", "2026-09").map((month) => {
    if (month === "2025-01") return [month, 80];
    if (month === "2026-01") return [month, 120];
    if (month === "2026-09") return [month, 50];
    return [month, 100];
  });

  const input: RealSpendingInput = {
    monthly: monthly(totals),
    pendingDetail: [],
    statements: statementsEveryMonth("icbc", "ICBC", "2025-01", "2026-09", "07"),
    inflation: ipc("2025-01", "2026-08", 0),
  };

  it("con un año elegido grafica solo ese año y termina en el último mes completo", () => {
    const view = buildRealSpendingView(input, { years: ["2026"] });
    expect(view.pesosDe).toBe("2026-08");
    expect(view.points.map(({ month }) => month)).toEqual(monthsFrom("2026-01", "2026-08"));
    expect(view.summary?.month).toBe("2026-08");
  });

  it("la interanual de enero usa enero del año anterior aunque no esté elegido", () => {
    const view = buildRealSpendingView(input, { years: ["2026"], from: "2026-01-01", to: "2026-01-31" });
    expect(view.points.map(({ month }) => month)).toEqual(["2026-01"]);
    expect(view.summary?.month).toBe("2026-01");
    expect(view.summary?.interanual).toBeCloseTo(50);
  });

  it("sin años elegidos grafica toda la cobertura", () => {
    const view = buildRealSpendingView(input, {});
    expect(view.points[0].month).toBe("2025-01");
    expect(view.points.at(-1)?.month).toBe("2026-08");
  });

  it("un año sin meses completos no grafica nada", () => {
    expect(buildRealSpendingView(input, { years: ["2027"] })).toEqual({ pesosDe: "2026-08", points: [], summary: null });
  });

  it("un mes elegido todavía abierto no grafica nada", () => {
    const view = buildRealSpendingView(input, { years: ["2026"], from: "2026-09-01", to: "2026-09-30" });
    expect(view.points).toEqual([]);
    expect(view.summary).toBeNull();
  });

  it("con una tarjeta elegida la cobertura usa solo sus resúmenes", () => {
    const withVisa: RealSpendingInput = {
      ...input,
      statements: [...input.statements, ...statementsEveryMonth("visa_signature", "Visa Signature", "2025-01", "2026-06", "02")],
    };
    expect(buildRealSpendingView(withVisa, {}).points.at(-1)?.month).toBe("2026-05");
    expect(buildRealSpendingView(withVisa, { cardLabel: "ICBC" }).points.at(-1)?.month).toBe("2026-08");
  });

  it("sin IPC no hay pesos de referencia", () => {
    expect(buildRealSpendingView({ ...input, inflation: [] }, {})).toEqual({ pesosDe: null, points: [], summary: null });
  });

  it("sin meses completos informa los pesos pero no grafica", () => {
    const view = buildRealSpendingView({ ...input, statements: [makeStatement("icbc", "ICBC", "2026-09-07")] }, {});
    expect(view).toEqual({ pesosDe: "2026-08", points: [], summary: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/realSpending.test.ts`
Expected: FAIL — `Failed to load url ./realSpending.js` (el módulo no existe).

- [ ] **Step 3: Implement**

`client/src/realSpending.ts`:

```ts
import type { FutureInstallmentMonth, InflationRateDTO, MonthlyStat, StatementDTO } from "@ledgerly/shared";
import { buildDeflator, type Deflator } from "./inflationIndex.js";
import { addMonths, monthOf } from "./isoDate.js";
import { completeMonthRange, type MonthRange } from "./statementCoverage.js";

export const MIN_MESES_PROMEDIO = 3;
const MESES_VENTANA = 12;

export interface RealSpendingPoint {
  month: string;
  nominal: number;
  real: number;
}

export interface RealSpendingSummary {
  month: string;
  real: number;
  interanual: number | null;
  vsPromedio: number | null;
  mesesPromedio: number;
}

export interface RealSpendingInput {
  monthly: MonthlyStat[];
  pendingDetail: FutureInstallmentMonth[];
  statements: StatementDTO[];
  inflation: InflationRateDTO[];
}

export interface RealSpendingScope {
  cardLabel?: string;
  years?: string[];
  from?: string;
  to?: string;
}

export interface RealSpendingView {
  pesosDe: string | null;
  points: RealSpendingPoint[];
  summary: RealSpendingSummary | null;
}

const variation = (value: number, base: number): number => (value / base - 1) * 100;

export function pendingByPurchaseMonth(detail: FutureInstallmentMonth[]): Map<string, number> {
  const pending = new Map<string, number>();
  for (const { items } of detail) {
    for (const { purchaseDate, amount } of items) {
      const month = monthOf(purchaseDate);
      pending.set(month, (pending.get(month) ?? 0) + amount);
    }
  }
  return pending;
}

export function realSpendingSeries(
  monthly: MonthlyStat[],
  pending: Map<string, number>,
  deflator: Deflator,
  range: MonthRange,
): RealSpendingPoint[] {
  const tope = range.hasta < deflator.pesosDe ? range.hasta : deflator.pesosDe;
  return monthly
    .filter(({ month }) => month >= range.desde && month <= tope)
    .map(({ month, total }) => {
      const nominal = total + (pending.get(month) ?? 0);
      return { month, nominal, real: nominal * deflator.factor(month) };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function summarizeRealSpending(series: RealSpendingPoint[], month: string): RealSpendingSummary | null {
  const current = series.find((point) => point.month === month);
  if (!current) return null;

  const inicioVentana = addMonths(month, -MESES_VENTANA);
  const previousYear = series.find((point) => point.month === inicioVentana);
  const ventana = series.filter((point) => point.month >= inicioVentana && point.month < month);
  const promedio = ventana.reduce((sum, point) => sum + point.real, 0) / Math.max(ventana.length, 1);

  return {
    month,
    real: current.real,
    interanual: previousYear && previousYear.real > 0 ? variation(current.real, previousYear.real) : null,
    vsPromedio: ventana.length >= MIN_MESES_PROMEDIO && promedio > 0 ? variation(current.real, promedio) : null,
    mesesPromedio: ventana.length,
  };
}

const inScope = ({ years, from, to }: RealSpendingScope) => ({ month }: RealSpendingPoint): boolean => {
  if (years !== undefined && !years.includes(month.slice(0, 4))) return false;
  if (from === undefined) return true;
  return month >= monthOf(from) && month <= monthOf(to ?? from);
};

export function buildRealSpendingView(input: RealSpendingInput, scope: RealSpendingScope): RealSpendingView {
  const deflator = buildDeflator(input.inflation);
  if (deflator === null) return { pesosDe: null, points: [], summary: null };

  const statements = scope.cardLabel
    ? input.statements.filter(({ cardLabel }) => cardLabel === scope.cardLabel)
    : input.statements;
  const range = completeMonthRange(statements);
  if (range === null) return { pesosDe: deflator.pesosDe, points: [], summary: null };

  const series = realSpendingSeries(input.monthly, pendingByPurchaseMonth(input.pendingDetail), deflator, range);
  const points = series.filter(inScope(scope));
  const reference = points.at(-1);

  return {
    pesosDe: deflator.pesosDe,
    points,
    summary: reference ? summarizeRealSpending(series, reference.month) : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/realSpending.test.ts`
Expected: PASS (24 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/realSpending.ts client/src/realSpending.test.ts
git commit -m "feat(client): motor del gasto real en pesos del último IPC" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gráfico `RealSpendingChart`

**Files:**
- Create: `client/src/components/charts/RealSpendingChart.tsx`
- Test: `client/src/components/charts/RealSpendingChart.test.tsx`

**Interfaces:**
- Consumes: `RealSpendingPoint` (Task 3); `seriesColor` (`palette.ts`), `nivoTheme`, `ChartLegend`/`ChartLegendItem`, `useChartLayout`, `mobileLineTouch` (`ChartTooltip.tsx`); `formatMoney`, `formatMoneyCompact` (`format.ts`).
- Produces: `RealSpendingChart` con props `{ points: RealSpendingPoint[] }`.

- [ ] **Step 1: Write the failing test**

`client/src/components/charts/RealSpendingChart.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import type { RealSpendingPoint } from "../../realSpending.js";
import { seriesColor } from "./palette.js";
import { RealSpendingChart } from "./RealSpendingChart.js";

vi.mock("@nivo/line", async () => ({ ResponsiveLine: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const month = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const points = (count: number): RealSpendingPoint[] =>
  Array.from({ length: count }, (_unused, index) => ({
    month: month(index),
    nominal: 100000 + index * 5000,
    real: 150000 - index * 1000,
  }));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

const legendList = () => screen.queryByRole("list", { name: "referencias" });

describe("RealSpendingChart en mobile", () => {
  it("muestra a lo sumo 6 meses en el eje y siempre el último", () => {
    emulateMobile();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    const { tickValues } = chart();
    expect(tickValues).not.toBeNull();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
  });

  it("angosta solo el margen izquierdo", () => {
    emulateMobile();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart().margin).toEqual({ top: 16, right: 24, bottom: 64, left: 56 });
  });

  it("cambia la leyenda de nivo por la lista de Real y Nominal", () => {
    emulateMobile();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart().legends).toBe(0);
    const items = within(legendList()!).getAllByRole("listitem");
    expect(items.map((itemElement) => itemElement.textContent)).toEqual(["Real", "Nominal"]);
  });

  it("muestra Real y Nominal del mes en un tooltip por columna", () => {
    emulateMobile();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart()).toMatchObject({ enableSlices: "x", customTooltip: "yes" });
  });
});

describe("RealSpendingChart en compu", () => {
  it("usa la leyenda de nivo abajo y deja que nivo elija las etiquetas", () => {
    emulateDesktop();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart()).toMatchObject({ legends: 1, tickValues: null, margin: { top: 16, right: 24, bottom: 84, left: 64 } });
    expect(legendList()).not.toBeInTheDocument();
  });

  it("también muestra el tooltip por columna", () => {
    emulateDesktop();
    renderWithProviders(<RealSpendingChart points={points(14)} />);
    expect(chart()).toMatchObject({ enableSlices: "x", customTooltip: "yes" });
  });

  it("pinta Real con la serie 4 y Nominal con la serie 0", () => {
    emulateDesktop();
    renderWithProviders(<RealSpendingChart points={points(3)} />);
    expect(chart().colors).toEqual([seriesColor("dark", 4), seriesColor("dark", 0)]);
  });
});
```

(El tema por defecto de `renderWithProviders` es oscuro: `useColorModeState` arranca en `"dark"`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/charts/RealSpendingChart.test.tsx`
Expected: FAIL — `Failed to load url ./RealSpendingChart.js`.

- [ ] **Step 3: Implement**

`client/src/components/charts/RealSpendingChart.tsx`:

```tsx
import { ResponsiveLine } from "@nivo/line";
import { Box, useTheme } from "@mui/material";
import type { RealSpendingPoint } from "../../realSpending.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { useChartLayout } from "./useChartLayout.js";
import { mobileLineTouch } from "./ChartTooltip.js";

interface RealSpendingChartProps {
  points: RealSpendingPoint[];
}

const REAL_SLOT = 4;
const NOMINAL_SLOT = 0;

export const RealSpendingChart = ({ points }: RealSpendingChartProps) => {
  const theme = useTheme();
  const { isMobile, seriesMargin, bottomTicks } = useChartLayout();

  const realColor = seriesColor(theme.palette.mode, REAL_SLOT);
  const nominalColor = seriesColor(theme.palette.mode, NOMINAL_SLOT);
  const series = [
    { id: "Real", data: points.map(({ month, real }) => ({ x: month, y: real })) },
    { id: "Nominal", data: points.map(({ month, nominal }) => ({ x: month, y: nominal })) },
  ];
  const legendItems: ChartLegendItem[] = [
    { id: "Real", label: "Real", color: realColor },
    { id: "Nominal", label: "Nominal", color: nominalColor },
  ];
  const months = points.map(({ month }) => month);

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsiveLine
          data={series}
          theme={nivoTheme(theme)}
          colors={[realColor, nominalColor]}
          margin={seriesMargin({ top: 16, right: 24, bottom: isMobile ? 64 : 84, left: 64 })}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: 0, max: "auto" }}
          curve="monotoneX"
          lineWidth={3}
          pointSize={8}
          pointColor={theme.palette.background.paper}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          enableGridX={false}
          axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(months) }}
          axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
          yFormat={(value) => formatMoney(Number(value), "ARS")}
          legends={isMobile ? [] : [{
            anchor: "bottom",
            direction: "row",
            translateY: 72,
            itemWidth: 110,
            itemHeight: 18,
            symbolSize: 10,
            symbolShape: "circle",
          }]}
          {...mobileLineTouch}
          motionConfig="gentle"
        />
      </Box>
      {isMobile && <ChartLegend items={legendItems} />}
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/charts/RealSpendingChart.test.tsx`
Expected: PASS (7 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/charts/RealSpendingChart.tsx client/src/components/charts/RealSpendingChart.test.tsx
git commit -m "feat(client): gráfico de gasto real y nominal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hook, encabezado y panel en el Dashboard

**Files:**
- Create: `client/src/useRealSpending.ts`
- Create: `client/src/components/RealSpendingStats.tsx`
- Modify (reemplaza el stub): `client/src/components/RealSpendingPanel.tsx`
- Test: `client/src/components/RealSpendingPanel.test.tsx`
- Modify: `client/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `buildRealSpendingView`, `RealSpendingScope`, `RealSpendingView`, `RealSpendingSummary` (Task 3); `RealSpendingChart` (Task 4); `useMonthly`, `useFutureInstallmentsDetail`, `useStatements`, `useInflation`, `StatFilters` (`api/hooks.ts`); `formatMoney`, `formatMonthLabel`, `formatSignedPercent` (`format.ts`); `addMonths` (`isoDate.ts`).
- Produces:
  - `interface RealSpendingState { isLoading: boolean; isError: boolean; view: RealSpendingView }`
  - `useRealSpending({ cardLabel, years, from, to }: RealSpendingScope): RealSpendingState`
  - `RealSpendingStats` con props `{ summary: RealSpendingSummary }`
  - `RealSpendingPanel` con props `RealSpendingPanelProps = StatFilters` (export del stub, sin cambios de nombre)

- [ ] **Step 1: Write the failing tests**

`client/src/components/RealSpendingPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { FutureInstallmentMonth, InflationRateDTO, MonthlyStat, StatementDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { flushAsync } from "../testing/flushAsync.js";
import { cssFor } from "../testing/cssFor.js";
import { addMonths } from "../isoDate.js";
import { RealSpendingPanel } from "./RealSpendingPanel.js";
import { RealSpendingStats } from "./RealSpendingStats.js";

const monthsFrom = (desde: string, hasta: string): string[] => {
  const months: string[] = [];
  for (let month = desde; month <= hasta; month = addMonths(month, 1)) months.push(month);
  return months;
};

const statement = (closingDate: string): StatementDTO => ({
  id: `icbc-${closingDate}`, issuer: "icbc", cardLabel: "ICBC", last4: "1234",
  closingDate, dueDate: null,
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 0, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "i.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
  transactionCount: 0, uploadedAt: "2026-07-01T00:00:00.000Z",
});

const totalOf = (month: string): number => {
  if (month === "2025-07") return 100000;
  if (month === "2026-07") return 150000;
  return 120000;
};

const MONTHLY: MonthlyStat[] = monthsFrom("2025-01", "2026-08").map((month) => ({ month, total: totalOf(month), count: 3 }));
const STATEMENTS: StatementDTO[] = monthsFrom("2025-01", "2026-08").map((month) => statement(`${month}-07`));
const INFLATION: InflationRateDTO[] = monthsFrom("2025-01", "2026-07").map((periodo) => ({ periodo, variacionMensual: 0 }));
const PENDING: FutureInstallmentMonth[] = [{
  month: "2026-09", total: 30000, count: 1,
  items: [{ merchant: "COMERCIO", category: "Compras", amount: 30000, installmentNumber: 2, installmentTotal: 3, purchaseDate: "2026-07-15" }],
}];

interface Fixture {
  statements: StatementDTO[];
  inflation: InflationRateDTO[] | null;
}

let fixture: Fixture = { statements: STATEMENTS, inflation: INFLATION };

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const route = (url: string): Response => {
  if (url.includes("/inflation")) return fixture.inflation === null ? respond({ error: "caído" }, 500) : respond(fixture.inflation);
  if (url.includes("/statements")) return respond(fixture.statements);
  if (url.includes("/stats/future-installments/detail")) return respond(PENDING);
  if (url.includes("/stats/monthly")) return respond(MONTHLY);
  return respond({});
};

beforeEach(() => {
  fixture = { statements: STATEMENTS, inflation: INFLATION };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => route(url)));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const calledUrls = () => vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
const urlOf = (path: string) => calledUrls().find((url) => url.includes(path));

describe("RealSpendingPanel", () => {
  it("con datos muestra los pesos de referencia y las dos lecturas con signo", async () => {
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} />);
    expect(await screen.findByText(
      "En pesos de julio de 2026 (último IPC publicado). Incluye las cuotas que faltan facturar.",
    )).toBeInTheDocument();
    expect(screen.getByText("Interanual")).toBeInTheDocument();
    expect(screen.getByText("+80,0%")).toBeInTheDocument();
    expect(screen.getByText("vs julio de 2025")).toBeInTheDocument();
    expect(screen.getByText("Vs promedio")).toBeInTheDocument();
    expect(screen.getByText("+52,1%")).toBeInTheDocument();
    expect(screen.getByText("de los 12 meses anteriores")).toBeInTheDocument();
  });

  it("pide la historia completa en pesos, sin año ni mes", async () => {
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} from="2026-07-01" to="2026-07-31" />);
    await waitFor(() => expect(urlOf("/stats/future-installments/detail")).toBeDefined());
    await waitFor(() => expect(urlOf("/stats/monthly")).toBeDefined());
    for (const url of [urlOf("/stats/future-installments/detail")!, urlOf("/stats/monthly")!]) {
      expect(url).toContain("currency=ARS");
      expect(url).not.toContain("year=");
      expect(url).not.toContain("from=");
    }
  });

  it("en dólares avisa y no pide datos", async () => {
    renderWithProviders(<RealSpendingPanel currency="USD" year={["2026"]} />);
    expect(screen.getByText("El gasto real se calcula sobre los consumos en pesos.")).toBeInTheDocument();
    await flushAsync();
    expect(urlOf("/inflation")).toBeUndefined();
    expect(urlOf("/stats/future-installments/detail")).toBeUndefined();
  });

  it("sin IPC cargado dice que no hay datos de inflación", async () => {
    fixture = { ...fixture, inflation: [] };
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} />);
    expect(await screen.findByText("Sin datos de inflación")).toBeInTheDocument();
  });

  it("con un solo resumen no hay meses cerrados", async () => {
    fixture = { ...fixture, statements: [statement("2026-08-07")] };
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} />);
    expect(await screen.findByText("Sin meses cerrados con IPC publicado en este período")).toBeInTheDocument();
  });

  it("si falla una llamada avisa en vez de mostrar un gráfico vacío", async () => {
    fixture = { ...fixture, inflation: null };
    renderWithProviders(<RealSpendingPanel currency="ARS" year={["2026"]} />);
    expect(await screen.findByText("No se pudo calcular el gasto real")).toBeInTheDocument();
  });
});

describe("RealSpendingStats", () => {
  it("muestra el gasto real del mes de referencia", () => {
    renderWithProviders(
      <RealSpendingStats summary={{ month: "2026-07", real: 150000, interanual: 4.2, vsPromedio: -3.1, mesesPromedio: 12 }} />,
    );
    expect(screen.getByText((text) => text.startsWith("Julio de 2026:") && text.includes("150.000"))).toBeInTheDocument();
  });

  it("pinta la suba como advertencia y la baja como favorable", () => {
    renderWithProviders(
      <RealSpendingStats summary={{ month: "2026-07", real: 150000, interanual: 4.2, vsPromedio: -3.1, mesesPromedio: 12 }} />,
    );
    expect(cssFor(screen.getByText("+4,2%"))).toContain("#fbbf24");
    expect(cssFor(screen.getByText("−3,1%"))).toContain("#22c55e");
  });

  it("sin datos muestra guiones y explica qué falta", () => {
    renderWithProviders(
      <RealSpendingStats summary={{ month: "2026-07", real: 150000, interanual: null, vsPromedio: null, mesesPromedio: 2 }} />,
    );
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("sin datos de julio de 2025")).toBeInTheDocument();
    expect(screen.getByText("faltan meses anteriores")).toBeInTheDocument();
  });
});
```

Cuentas del primer test: julio 2026 = 150.000 facturados + 30.000 pendientes = 180.000 (IPC 0 %, factor 1); julio 2025 = 100.000 → +80,0 %. Ventana 2025-07…2026-06 = (100.000 + 11 × 120.000) / 12 = 118.333,33 → 180.000 / 118.333,33 − 1 = +52,1 %. Agosto 2026 queda afuera (cobertura hasta 2026-07 y último IPC 2026-07).

`#fbbf24` y `#22c55e` son `warning` y `success` del tema oscuro, que es el de `renderWithProviders`.

En `client/src/pages/DashboardPage.test.tsx`:

1. En `route()`, antes de la línea de `/statements`, agregar:

```ts
  if (url.includes("/inflation")) return [];
```

2. En `route()`, justo **antes** de la línea `if (url.includes("/stats/future-installments")) ...`, agregar:

```ts
  if (url.includes("/stats/future-installments/detail")) return [];
```

3. En el test «muestra KPIs con el total gastado», después de `expect(screen.getByText("Gasto por categoría (último resumen)")).toBeInTheDocument();`, agregar:

```ts
    expect(screen.getByText("Gasto real (pesos de hoy)")).toBeInTheDocument();
```

4. Al final del `describe`, agregar:

```ts
  it("el gasto real pide el detalle de cuotas sin year", async () => {
    renderWithProviders(<DashboardPage />, { route: "/?year=2025&year=2026" });
    await waitFor(() => expect(urlOf("/stats/future-installments/detail")).toBeDefined());
    expect(urlOf("/stats/future-installments/detail")).not.toContain("year=");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/components/RealSpendingPanel.test.tsx client/src/pages/DashboardPage.test.tsx`
Expected: FAIL — `Failed to load url ./RealSpendingStats.js` en el panel; en el Dashboard, «el gasto real pide el detalle de cuotas sin year» falla por timeout de `waitFor` (el stub no pide nada).

- [ ] **Step 3: Implement**

`client/src/useRealSpending.ts`:

```ts
import { useMemo } from "react";
import { useFutureInstallmentsDetail, useInflation, useMonthly, useStatements } from "./api/hooks.js";
import { buildRealSpendingView, type RealSpendingScope, type RealSpendingView } from "./realSpending.js";

export interface RealSpendingState {
  isLoading: boolean;
  isError: boolean;
  view: RealSpendingView;
}

function listOf<T>(data: T[] | undefined): T[] {
  return Array.isArray(data) ? data : [];
}

export const useRealSpending = ({ cardLabel, years, from, to }: RealSpendingScope): RealSpendingState => {
  const monthly = useMonthly({ currency: "ARS", cardLabel });
  const pending = useFutureInstallmentsDetail({ currency: "ARS", cardLabel });
  const statements = useStatements();
  const inflation = useInflation();
  const yearsKey = years?.join(",");

  const view = useMemo(
    () => buildRealSpendingView(
      {
        monthly: listOf(monthly.data),
        pendingDetail: listOf(pending.data),
        statements: listOf(statements.data),
        inflation: listOf(inflation.data),
      },
      { cardLabel, years, from, to },
    ),
    [monthly.data, pending.data, statements.data, inflation.data, cardLabel, yearsKey, from, to],
  );

  const queries = [monthly, pending, statements, inflation];
  return {
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
    view,
  };
};
```

`client/src/components/RealSpendingStats.tsx`:

```tsx
import { Box, Typography } from "@mui/material";
import type { RealSpendingSummary } from "../realSpending.js";
import { formatMoney, formatMonthLabel, formatSignedPercent } from "../format.js";
import { addMonths } from "../isoDate.js";

interface RealSpendingStatsProps {
  summary: RealSpendingSummary;
}

interface StatCell {
  label: string;
  value: number | null;
  caption: string;
}

const trendColor = (value: number | null): string => {
  if (value === null || value === 0) return "text.primary";
  return value > 0 ? "warning.main" : "success.main";
};

const monthInText = (month: string): string => formatMonthLabel(month).toLowerCase();

export const RealSpendingStats = ({ summary }: RealSpendingStatsProps) => {
  const { month, real, interanual, vsPromedio, mesesPromedio } = summary;
  const previousYear = monthInText(addMonths(month, -12));
  const headline = `${formatMonthLabel(month)}: ${formatMoney(real, "ARS")}`;
  const cells: StatCell[] = [
    {
      label: "Interanual",
      value: interanual,
      caption: interanual === null ? `sin datos de ${previousYear}` : `vs ${previousYear}`,
    },
    {
      label: "Vs promedio",
      value: vsPromedio,
      caption: vsPromedio === null ? "faltan meses anteriores" : `de los ${mesesPromedio} meses anteriores`,
    },
  ];
  const rendered = cells.map(({ label, value, caption }) => ({
    label,
    caption,
    text: value === null ? "—" : formatSignedPercent(value),
    color: trendColor(value),
  }));

  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="body2">{headline}</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mt: 1 }}>
        {rendered.map(({ label, caption, text, color }) => (
          <Box key={label} sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
              {label}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color }}>{text}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{caption}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
```

`client/src/components/RealSpendingPanel.tsx` completo:

```tsx
import { Box, CircularProgress, Typography } from "@mui/material";
import type { StatFilters } from "../api/hooks.js";
import { formatMonthLabel } from "../format.js";
import type { RealSpendingScope } from "../realSpending.js";
import { useRealSpending } from "../useRealSpending.js";
import { RealSpendingStats } from "./RealSpendingStats.js";
import { RealSpendingChart } from "./charts/RealSpendingChart.js";

export type RealSpendingPanelProps = StatFilters;

const RealSpendingBody = ({ cardLabel, years, from, to }: RealSpendingScope) => {
  const { isLoading, isError, view } = useRealSpending({ cardLabel, years, from, to });

  if (isLoading) {
    return (
      <Box sx={{ height: 260, display: "grid", placeItems: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (isError) return <Typography color="text.secondary">No se pudo calcular el gasto real</Typography>;
  if (view.pesosDe === null) return <Typography color="text.secondary">Sin datos de inflación</Typography>;
  if (view.points.length === 0) {
    return <Typography color="text.secondary">Sin meses cerrados con IPC publicado en este período</Typography>;
  }

  const note = `En pesos de ${formatMonthLabel(view.pesosDe).toLowerCase()} (último IPC publicado). Incluye las cuotas que faltan facturar.`;

  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{note}</Typography>
      {view.summary && <RealSpendingStats summary={view.summary} />}
      <RealSpendingChart points={view.points} />
    </>
  );
};

export const RealSpendingPanel = ({ currency, cardLabel, year, from, to }: RealSpendingPanelProps) => {
  if (currency === "USD") {
    return <Typography color="text.secondary">El gasto real se calcula sobre los consumos en pesos.</Typography>;
  }
  return <RealSpendingBody cardLabel={cardLabel} years={year} from={from} to={to} />;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/RealSpendingPanel.test.tsx client/src/pages/DashboardPage.test.tsx`
Expected: PASS (9 + 6 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/useRealSpending.ts client/src/components/RealSpendingStats.tsx client/src/components/RealSpendingPanel.tsx client/src/components/RealSpendingPanel.test.tsx client/src/pages/DashboardPage.test.tsx
git commit -m "feat(client): tarjeta de gasto real en el Dashboard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verificación final

**Files:** ninguno (solo verificación; si algo falla, se corrige en el task que corresponde).

- [ ] **Step 1: Suite, tipos y build**

```bash
bun run test
bun run typecheck
bun run build
```

Expected: todo en verde. Si un test ajeno falla, correrlo solo para ver si es flaky por carga (p. ej. `AutoPage.test.tsx` con `waitFor`) y anotarlo.

- [ ] **Step 2: Revisar el diff contra la base**

```bash
git diff --stat feat/base-nuevas-features...HEAD
```

Expected: solo los archivos de este plan (spec, plan, `realSalary.ts`, `statementCoverage.*`, `realSpending.*`, `useRealSpending.ts`, `RealSpendingStats.tsx`, `RealSpendingPanel.*`, `charts/RealSpendingChart.*`, `DashboardPage.test.tsx`). Nada en `examples/`, `server/`, `shared/` ni en los archivos compartidos de la base.
