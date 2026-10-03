# Filtro de año y barra de filtros global — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un filtro de Año multi-selección (default: año actual) a una única barra de filtros que usan todas las secciones con datos, y que la selección persista al navegar.

**Architecture:** La URL es la única fuente de verdad. Un módulo cliente `client/src/filters/` parsea y escribe los params globales (`year`, `currency`, `cardLabel`, `from`, `to`); `FiltersBar` se compone de un subcomponente por campo; `SidebarNav` arrastra los params globales al navegar. El server acepta `year` repetible en `/stats/*` y `/transactions`; Créditos, Auto, Sueldo y Contexto filtran en el cliente porque ya traen todos sus datos.

**Tech Stack:** React 18 + MUI 6 + react-router 6 + @tanstack/react-query 5 (cliente); Express + Mongoose (server); Vitest + Testing Library + supertest + mongodb-memory-server (tests); Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-02-filtro-anio-global-design.md`

## Prerrequisitos

- El working tree de Ledgerly es compartido por varias sesiones. Antes de empezar:
  1. El rediseño del sidebar y las grillas de KPIs ya están commiteados en `feat/sidebar-layout` (PR #4 contra `main`). Este plan modifica `client/src/components/layout/SidebarNav.tsx` y `Layout.test.tsx`, que vienen de esa rama, así que hay que arrancar desde ella (o desde `main` si el PR #4 ya se mergeó; confirmarlo con el usuario).
  2. Crear una rama propia: `git switch -c feat/filtro-anio-global`. Preferible en un worktree aislado (superpowers:using-git-worktrees) para no pisar a las otras sesiones. La rama de otra sesión no se toca ni se commitea encima.
  3. El spec y este plan están sin trackear en el árbol compartido; copiarlos al worktree.
- Correr `bun install` si el worktree es nuevo.

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc.
- **Commits solo con pedido explícito del usuario** (CLAUDE.md global). Cada task termina con un paso "Commit" que muestra el comando exacto con pathspec explícito; ejecutarlo **solo** si el usuario pidió commits para esta ejecución. Si no, dejar los cambios en el árbol. Nunca `git add -A` ni `git add .`: hay archivos de otras sesiones. Nunca push ni merge.
- Componentes funcionales `const X = ({ props }) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`.
- Filtros, mapeos y condicionales complejos antes del `return`, no dentro del JSX.
- Copy de UI en español: label `"Año"`, opción `"Todos"`.
- Param de URL: `year` repetible; centinela `year=all`. Keys globales exactas: `year`, `currency`, `cardLabel`, `from`, `to`.
- Default de año: el año actual (`String(new Date().getFullYear())`).
- Tests de cliente con más de un render en el archivo llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado en este repo).
- Para fijar el año en tests de cliente: `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(new Date("2026-10-02T12:00:00"))`, y `vi.useRealTimers()` en `afterEach`. Solo `Date`, para no colgar `findBy`/`waitFor`/`userEvent`.
- Comandos: `bun run test <ruta>` (vitest run), `bun run typecheck`.
- Imports con extensión `.js` (ESM), como el resto del repo.

## Review Focus

1. **Año sin datos en la sección** (`/credits?year=2019`): la página no se rompe, los KPIs siguen, los gráficos muestran "Sin datos", la tabla desaparece y el select de Año sigue mostrando 2019 como elegido. → test en Task 9.
2. **Borde de año en el server** (consumo del 31/12/2025 vs 1/1/2026): cae en el año correcto con `$year` en UTC. → test en Task 2.
3. **Valores basura en `year`** (`?year=abc&year=2025`, `?year=26`): el cliente los ignora y vuelve al año actual si no queda ninguno; el server los ignora y no filtra si no queda ninguno. → tests en Task 1 y Task 4.
4. **Salir de Movimientos con filtros propios** (`category`, `search`): el link del sidebar conserva año/moneda y descarta esos. → test en Task 8.
5. **Mes elegido y cambio de Año desde otra sección** (Créditos no muestra Mes): si el Mes queda fuera de los años nuevos se limpia, para no volver al Dashboard con un mes invisible. → test en Task 5 (`setYears`) y Task 6 (`FiltersBar`).

---

### Task 1: Helper de años en el server

**Files:**
- Create: `server/src/http/yearFilter.ts`
- Test: `server/src/http/yearFilter.test.ts`

**Interfaces:**
- Produces:
  - `parseYears(raw: unknown): number[] | null`
  - `monthInYears(month: string, years: number[] | null): boolean`
  - `yearExpr(field: string, years: number[]): YearExpr` con `interface YearExpr { $in: [{ $year: string }, number[]] }`

- [ ] **Step 1: Write the failing test**

`server/src/http/yearFilter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { monthInYears, parseYears, yearExpr } from "./yearFilter.js";

describe("parseYears", () => {
  it("acepta un año suelto", () => {
    expect(parseYears("2025")).toEqual([2025]);
  });

  it("acepta años repetidos, los ordena y no los duplica", () => {
    expect(parseYears(["2026", "2025", "2026"])).toEqual([2025, 2026]);
  });

  it("descarta lo que no es un año de 4 dígitos", () => {
    expect(parseYears(["2025", "all", "26", "abcd", "20255"])).toEqual([2025]);
  });

  it("sin años válidos devuelve null", () => {
    expect(parseYears(undefined)).toBeNull();
    expect(parseYears("all")).toBeNull();
    expect(parseYears([])).toBeNull();
  });
});

describe("monthInYears", () => {
  it("compara el año de un mes YYYY-MM", () => {
    expect(monthInYears("2026-03", [2026])).toBe(true);
    expect(monthInYears("2027-01", [2025, 2026])).toBe(false);
  });

  it("con null deja pasar todo", () => {
    expect(monthInYears("1999-12", null)).toBe(true);
  });
});

describe("yearExpr", () => {
  it("arma un $in sobre el $year del campo", () => {
    expect(yearExpr("date", [2025, 2026])).toEqual({ $in: [{ $year: "$date" }, [2025, 2026]] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/http/yearFilter.test.ts`
Expected: FAIL — `Failed to load url ./yearFilter.js` (el módulo no existe).

- [ ] **Step 3: Write minimal implementation**

`server/src/http/yearFilter.ts`:

```ts
const YEAR_PATTERN = /^\d{4}$/;

export interface YearExpr { $in: [{ $year: string }, number[]] }

export function parseYears(raw: unknown): number[] | null {
  const values = Array.isArray(raw) ? raw : [raw];
  const years = values
    .filter((value): value is string => typeof value === "string" && YEAR_PATTERN.test(value))
    .map(Number);
  const unique = [...new Set(years)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : null;
}

export function monthInYears(month: string, years: number[] | null): boolean {
  return years === null || years.includes(Number(month.slice(0, 4)));
}

export function yearExpr(field: string, years: number[]): YearExpr {
  return { $in: [{ $year: `$${field}` }, years] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/http/yearFilter.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit** (solo con pedido explícito, ver Global Constraints)

```bash
git add server/src/http/yearFilter.ts server/src/http/yearFilter.test.ts
git commit -m "feat(server): helper para filtrar por años" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `year` en las agregaciones de consumos y en `/transactions`

**Files:**
- Modify: `server/src/http/routes/stats.ts:10-20` (`baseMatch`)
- Modify: `server/src/http/routes/transactions.ts:7-25` (`buildFilter`)
- Test: `server/src/http/routes/stats.test.ts`, `server/src/http/routes/transactions.test.ts`

**Interfaces:**
- Consumes: `parseYears`, `yearExpr` de `server/src/http/yearFilter.ts` (Task 1).
- Produces: `/api/stats/by-category`, `/monthly`, `/top-merchants`, `/summary` (totales) y `/api/transactions` aceptan `?year=YYYY` repetible.

- [ ] **Step 1: Write the failing tests**

En `server/src/http/routes/stats.test.ts`, dentro de `describe("stats", ...)`, agregar al final:

```ts
  it("monthly y by-category con year dejan afuera los otros años", async () => {
    const s = await StatementModel.findOne({});
    await TransactionModel.create({
      statementId: s!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2024-03-01"), descriptionRaw: "C",
      merchant: "COTO", category: "Supermercado", categorySource: "rule", amount: 700, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: "9", fingerprint: "f-2024",
    });
    const monthly = await request(app).get("/api/stats/monthly?currency=ARS&year=2025&year=2026");
    expect(monthly.body).toEqual([{ month: "2026-05", total: 2000, count: 2 }]);
    const byCategory = await request(app).get("/api/stats/by-category?currency=ARS&year=2024");
    expect(byCategory.body).toEqual([{ category: "Supermercado", total: 700, count: 1 }]);
  });

  it("year respeta el borde de año (31/12 vs 1/1)", async () => {
    const s = await StatementModel.findOne({});
    await TransactionModel.insertMany([
      { statementId: s!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2025-12-31"), descriptionRaw: "D",
        merchant: "FIN DE AÑO", category: "Compras", categorySource: "rule", amount: 100, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
        comprobante: "10", fingerprint: "f-1231" },
      { statementId: s!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-01-01"), descriptionRaw: "E",
        merchant: "AÑO NUEVO", category: "Compras", categorySource: "rule", amount: 200, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
        comprobante: "11", fingerprint: "f-0101" },
    ]);
    const res = await request(app).get("/api/stats/monthly?currency=ARS&year=2025");
    expect(res.body).toEqual([{ month: "2025-12", total: 100, count: 1 }]);
  });

  it("year inválido no filtra", async () => {
    const res = await request(app).get("/api/stats/monthly?currency=ARS&year=abc");
    expect(res.body).toEqual([{ month: "2026-05", total: 2000, count: 2 }]);
  });
```

En `server/src/http/routes/transactions.test.ts`, dentro de `describe("GET /api/transactions", ...)`, agregar:

```ts
  it("filtra por años (repetido)", async () => {
    const base = await StatementModel.findOne({});
    await TransactionModel.create({
      statementId: base!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2025-12-20"),
      descriptionRaw: "DIA", merchant: "DIA", category: "Supermercado", categorySource: "rule", amount: 300, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: "4", fingerprint: "f-2025",
    });
    const only2025 = await request(app).get("/api/transactions?year=2025");
    expect(only2025.body.items.map((t: { merchant: string }) => t.merchant)).toEqual(["DIA"]);
    const both = await request(app).get("/api/transactions?year=2025&year=2026");
    expect(both.body.total).toBe(3);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test server/src/http/routes/stats.test.ts server/src/http/routes/transactions.test.ts`
Expected: FAIL en "monthly y by-category con year…", "year respeta el borde de año…" y "filtra por años (repetido)" (devuelven todos los años). "year inválido no filtra" ya pasa.

- [ ] **Step 3: Implement**

`server/src/http/routes/stats.ts` — import y `baseMatch`:

```ts
import { parseYears, yearExpr } from "../yearFilter.js";
```

```ts
function baseMatch(q: Record<string, unknown>): FilterQuery<TransactionDoc> {
  const currency = q.currency === "USD" ? "USD" : "ARS";
  const match: FilterQuery<TransactionDoc> = { type: "purchase", currency };
  if (typeof q.cardLabel === "string") match.cardLabel = q.cardLabel;
  if (typeof q.from === "string" || typeof q.to === "string") {
    match.date = {};
    if (typeof q.from === "string") match.date.$gte = new Date(q.from);
    if (typeof q.to === "string") match.date.$lte = new Date(q.to);
  }
  const years = parseYears(q.year);
  if (years) match.$expr = yearExpr("date", years);
  return match;
}
```

`server/src/http/routes/transactions.ts` — import y, al final de `buildFilter`, antes de `return filter;`:

```ts
import { parseYears, yearExpr } from "../yearFilter.js";
```

```ts
  const years = parseYears(q.year);
  if (years) filter.$expr = yearExpr("date", years);
  return filter;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test server/src/http/routes/stats.test.ts server/src/http/routes/transactions.test.ts`
Expected: PASS (todos, incluidos los preexistentes).

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add server/src/http/routes/stats.ts server/src/http/routes/transactions.ts server/src/http/routes/stats.test.ts server/src/http/routes/transactions.test.ts
git commit -m "feat(server): filtro year en estadísticas de consumos y movimientos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `year` en monthly-usd, cuotas a vencer y deuda en cuotas

**Files:**
- Modify: `server/src/http/routes/stats.ts` (handlers `/monthly-usd`, `/future-installments`, `/future-installments/detail`, `/summary`)
- Test: `server/src/http/routes/stats.test.ts`

**Interfaces:**
- Consumes: `parseYears`, `monthInYears` (Task 1); `computeFutureInstallments`, `remainingInstallmentDebt` (ya importados en `stats.ts`).
- Produces: `/monthly-usd` filtra por año del mes de consumo antes de pedir cotizaciones; `/future-installments` y `/detail` filtran por año de vencimiento; `/summary.futureInstallmentTotal` con `year` = suma de vencimientos en esos años, sin `year` = igual que hoy.

- [ ] **Step 1: Write the failing tests**

En `server/src/http/routes/stats.test.ts`, a nivel de módulo (antes de `describe("stats", ...)`):

```ts
async function addInstallmentCrossingYear() {
  const s = await StatementModel.findOne({});
  await TransactionModel.create({
    statementId: s!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-11-10"), descriptionRaw: "F",
    merchant: "FRAVEGA", category: "Hogar", categorySource: "rule", amount: 300, currency: "ARS",
    direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 1, installmentTotal: 4,
    comprobante: "12", fingerprint: "f-fravega",
  });
}
```

Dentro de `describe("stats", ...)`:

```ts
  it("future-installments y detail con year filtran por año de vencimiento", async () => {
    await addInstallmentCrossingYear();
    const res = await request(app).get("/api/stats/future-installments?currency=ARS&year=2027");
    expect(res.body).toEqual([{ month: "2027-01", total: 300 }, { month: "2027-02", total: 300 }]);
    const detail = await request(app).get("/api/stats/future-installments/detail?currency=ARS&year=2027");
    expect(detail.body.map((m: { month: string }) => m.month)).toEqual(["2027-01", "2027-02"]);
  });

  it("summary con year suma solo las cuotas que vencen en esos años", async () => {
    await addInstallmentCrossingYear();
    const withYear = await request(app).get("/api/stats/summary?currency=ARS&year=2027");
    expect(withYear.body.futureInstallmentTotal).toBe(600);
    expect(withYear.body.totalPurchases).toBe(0);
    const withoutYear = await request(app).get("/api/stats/summary?currency=ARS");
    expect(withoutYear.body.futureInstallmentTotal).toBe(3900);
  });

  it("monthly-usd con year excluye meses de otros años sin pedir cotización", async () => {
    vi.mocked(fetchOficialRate).mockClear();
    vi.mocked(fetchOficialRate).mockResolvedValue(1000);
    const res = await request(app).get("/api/stats/monthly-usd?currency=ARS&year=2025");
    expect(res.body).toEqual([]);
    expect(fetchOficialRate).not.toHaveBeenCalled();
  });
```

Cuentas: MERCADOLIBRE 2/4 de 1500 (2026-05-04) vence 2026-06 y 2026-07; FRAVEGA 1/4 de 300 (2026-11-10) vence 2026-12, 2027-01 y 2027-02. Sin año: 2×1500 + 3×300 = 3900. Con 2027: 600.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test server/src/http/routes/stats.test.ts`
Expected: FAIL en los 3 tests nuevos (devuelven todos los meses / 3900 / llaman a `fetchOficialRate`).

- [ ] **Step 3: Implement**

En `server/src/http/routes/stats.ts`, ampliar el import:

```ts
import { monthInYears, parseYears, yearExpr } from "../yearFilter.js";
```

`/monthly-usd` — reemplazar el `for` que recorre los meses por:

```ts
  const years = parseYears(q.year);
  const months = [...totalArsByMonth.keys()].filter((month) => monthInYears(month, years)).sort();
  const today = new Date().toISOString().slice(0, 10);
  const result: MonthlyUsdStat[] = [];
  for (const month of months) {
    const totalArs = totalArsByMonth.get(month)!;
    const rate = await fetchOficialRate(representativeRateDate(month, today));
    result.push({ month, totalArs, rate, totalUsd: rate ? totalArs / rate : null });
  }
  res.json(result);
```

`/future-installments` — reemplazar `res.json(computeFutureInstallments(mapped, currency));` por:

```ts
  const years = parseYears(req.query.year);
  res.json(computeFutureInstallments(mapped, currency).filter((row) => monthInYears(row.month, years)));
```

`/future-installments/detail` — reemplazar `res.json(computeFutureInstallmentsDetail(mapped, currency));` por:

```ts
  const years = parseYears(req.query.year);
  res.json(computeFutureInstallmentsDetail(mapped, currency).filter((row) => monthInYears(row.month, years)));
```

`/summary` — reemplazar desde `const installmentTxs = ...` hasta el final del handler por:

```ts
  const installmentTxs = await latestStatementInstallmentTxs(q);
  const installments = installmentTxs.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount, currency: t.currency as Currency,
    isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent ?? null, installmentTotal: t.installmentTotal ?? null,
  }));
  const years = parseYears(q.year);
  const futureInstallmentTotal = years === null
    ? remainingInstallmentDebt(installments, currency)
    : computeFutureInstallments(installments, currency)
      .filter((row) => monthInYears(row.month, years))
      .reduce((acc, row) => acc + row.total, 0);
  res.json({
    currency,
    totalPurchases: agg?.totalPurchases ?? 0,
    transactionCount: agg?.transactionCount ?? 0,
    statementCount: await StatementModel.countDocuments(typeof cardLabel === "string" ? { cardLabel } : {}),
    futureInstallmentTotal,
  });
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test server/src/http/routes/stats.test.ts`
Expected: PASS (todos; "summary" preexistente sigue en 3000).

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add server/src/http/routes/stats.ts server/src/http/routes/stats.test.ts
git commit -m "feat(server): filtro year en cuotas a vencer, deuda en cuotas y monthly-usd" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Helpers puros de filtros globales en el cliente

**Files:**
- Create: `client/src/filters/globalFilters.ts`
- Test: `client/src/filters/globalFilters.test.ts`

**Interfaces:**
- Produces (todas exportadas desde `client/src/filters/globalFilters.ts`):
  - `ALL_YEARS = "all"`
  - `GLOBAL_FILTER_KEYS = ["year", "currency", "cardLabel", "from", "to"] as const`
  - `type YearSelection = { kind: "all" } | { kind: "years"; years: string[] }`
  - `currentYear(): string`
  - `parseYears(values: string[]): YearSelection`
  - `matchesYears(value: string, selection: YearSelection): boolean`
  - `filterInYears<T>(items: T[] | undefined, dateOf: (item: T) => string, selection: YearSelection): T[] | undefined`
  - `yearsForApi(selection: YearSelection): string[] | undefined`
  - `resolveYearChange(previous: YearSelection, selected: string[]): YearSelection`
  - `yearOptionsWith(options: string[], selection: YearSelection): string[]` (desc)
  - `yearsOf(values: string[]): string[]` (asc, únicos)
  - `writeYears(params: URLSearchParams, selection: YearSelection): void`
  - `globalSearch(params: URLSearchParams): string` (`""` o `"?..."`)

- [ ] **Step 1: Write the failing test**

`client/src/filters/globalFilters.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ALL_YEARS, filterInYears, globalSearch, matchesYears, parseYears, resolveYearChange,
  writeYears, yearOptionsWith, yearsForApi, yearsOf, type YearSelection,
} from "./globalFilters.js";

const ALL: YearSelection = { kind: "all" };
const only = (...years: string[]): YearSelection => ({ kind: "years", years });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
});
afterEach(() => vi.useRealTimers());

describe("parseYears", () => {
  it("sin valores toma el año actual", () => {
    expect(parseYears([])).toEqual(only("2026"));
  });

  it("con all devuelve todos", () => {
    expect(parseYears([ALL_YEARS])).toEqual(ALL);
  });

  it("ordena y deduplica varios años", () => {
    expect(parseYears(["2026", "2024", "2026"])).toEqual(only("2024", "2026"));
  });

  it("ignora valores inválidos", () => {
    expect(parseYears(["abc", "2025", "25"])).toEqual(only("2025"));
  });

  it("si ninguno es válido vuelve al año actual", () => {
    expect(parseYears(["abc"])).toEqual(only("2026"));
  });
});

describe("matchesYears", () => {
  it("compara el año de fechas y de períodos", () => {
    expect(matchesYears("2025-08-18", only("2025"))).toBe(true);
    expect(matchesYears("2025-08", only("2026"))).toBe(false);
  });

  it("con todos deja pasar todo", () => {
    expect(matchesYears("1999-01", ALL)).toBe(true);
  });
});

describe("filterInYears", () => {
  it("filtra por la fecha que devuelve el selector", () => {
    const items = [{ fecha: "2025-01-10" }, { fecha: "2026-02-10" }];
    expect(filterInYears(items, (item) => item.fecha, only("2026"))).toEqual([{ fecha: "2026-02-10" }]);
  });

  it("sin datos devuelve undefined", () => {
    expect(filterInYears<{ fecha: string }>(undefined, (item) => item.fecha, ALL)).toBeUndefined();
  });
});

describe("yearsForApi", () => {
  it("con todos no manda años", () => {
    expect(yearsForApi(ALL)).toBeUndefined();
  });

  it("con años concretos los manda tal cual", () => {
    expect(yearsForApi(only("2025", "2026"))).toEqual(["2025", "2026"]);
  });
});

describe("resolveYearChange", () => {
  it("elegir Todos estando en años pasa a todos", () => {
    expect(resolveYearChange(only("2026"), ["2026", ALL_YEARS])).toEqual(ALL);
  });

  it("elegir un año estando en Todos deja solo ese año", () => {
    expect(resolveYearChange(ALL, [ALL_YEARS, "2025"])).toEqual(only("2025"));
  });

  it("agregar un año suma y ordena", () => {
    expect(resolveYearChange(only("2026"), ["2026", "2024"])).toEqual(only("2024", "2026"));
  });

  it("destildar el último año vuelve a todos", () => {
    expect(resolveYearChange(only("2026"), [])).toEqual(ALL);
  });
});

describe("yearOptionsWith", () => {
  it("suma el año actual y los elegidos, de más nuevo a más viejo", () => {
    expect(yearOptionsWith(["2024", "2025"], only("2019"))).toEqual(["2026", "2025", "2024", "2019"]);
  });
});

describe("yearsOf", () => {
  it("extrae los años únicos ordenados", () => {
    expect(yearsOf(["2026-01", "2025-12-31", "2026-03"])).toEqual(["2025", "2026"]);
  });
});

describe("writeYears", () => {
  it("escribe años repetidos o all, sin tocar el resto", () => {
    const params = new URLSearchParams("year=2020&currency=USD");
    writeYears(params, only("2025", "2026"));
    expect(params.toString()).toBe("currency=USD&year=2025&year=2026");
    writeYears(params, ALL);
    expect(params.getAll("year")).toEqual(["all"]);
  });
});

describe("globalSearch", () => {
  it("conserva los filtros globales y descarta los de Movimientos", () => {
    const params = new URLSearchParams(
      "year=2025&year=2026&currency=USD&cardLabel=ICBC&from=2026-02-01&to=2026-02-28&category=Compras&search=uber&installment=true",
    );
    expect(globalSearch(params)).toBe("?year=2025&year=2026&currency=USD&cardLabel=ICBC&from=2026-02-01&to=2026-02-28");
  });

  it("sin filtros globales devuelve vacío", () => {
    expect(globalSearch(new URLSearchParams("category=Compras"))).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/filters/globalFilters.test.ts`
Expected: FAIL — no existe `./globalFilters.js`.

- [ ] **Step 3: Write minimal implementation**

`client/src/filters/globalFilters.ts`:

```ts
export const ALL_YEARS = "all";
export const GLOBAL_FILTER_KEYS = ["year", "currency", "cardLabel", "from", "to"] as const;

export type YearSelection = { kind: "all" } | { kind: "years"; years: string[] };

const YEAR_PATTERN = /^\d{4}$/;
const ALL: YearSelection = { kind: "all" };

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();

export const currentYear = (): string => String(new Date().getFullYear());

export const parseYears = (values: string[]): YearSelection => {
  if (values.includes(ALL_YEARS)) return ALL;
  const years = uniqueSorted(values.filter((value) => YEAR_PATTERN.test(value)));
  return { kind: "years", years: years.length > 0 ? years : [currentYear()] };
};

export const matchesYears = (value: string, selection: YearSelection): boolean =>
  selection.kind === "all" || selection.years.includes(value.slice(0, 4));

export const filterInYears = <T>(
  items: T[] | undefined,
  dateOf: (item: T) => string,
  selection: YearSelection,
): T[] | undefined => items?.filter((item) => matchesYears(dateOf(item), selection));

export const yearsForApi = (selection: YearSelection): string[] | undefined =>
  selection.kind === "all" ? undefined : selection.years;

export const resolveYearChange = (previous: YearSelection, selected: string[]): YearSelection => {
  const years = uniqueSorted(selected.filter((value) => value !== ALL_YEARS));
  const pickedAll = selected.includes(ALL_YEARS) && previous.kind !== "all";
  if (pickedAll || years.length === 0) return ALL;
  return { kind: "years", years };
};

export const yearOptionsWith = (options: string[], selection: YearSelection): string[] => {
  const selected = selection.kind === "all" ? [] : selection.years;
  return uniqueSorted([...options, ...selected, currentYear()]).reverse();
};

export const yearsOf = (values: string[]): string[] => uniqueSorted(values.map((value) => value.slice(0, 4)));

export const writeYears = (params: URLSearchParams, selection: YearSelection): void => {
  params.delete("year");
  if (selection.kind === "all") {
    params.set("year", ALL_YEARS);
    return;
  }
  for (const year of selection.years) params.append("year", year);
};

export const globalSearch = (params: URLSearchParams): string => {
  const next = new URLSearchParams();
  for (const key of GLOBAL_FILTER_KEYS) {
    for (const value of params.getAll(key)) next.append(key, value);
  }
  const search = next.toString();
  return search ? `?${search}` : "";
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/filters/globalFilters.test.ts`
Expected: PASS (20 tests).

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/filters/globalFilters.ts client/src/filters/globalFilters.test.ts
git commit -m "feat(client): helpers puros de filtros globales y años" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hook `useGlobalFilters`, `StatFilters.year` y opciones de año

**Files:**
- Create: `client/src/filters/useGlobalFilters.ts`
- Create: `client/src/filters/useYearOptions.ts`
- Modify: `client/src/api/hooks.ts:9` (`StatFilters`)
- Test: `client/src/filters/useGlobalFilters.test.tsx`, `client/src/filters/useYearOptions.test.tsx`

**Interfaces:**
- Consumes: todo lo de Task 4.
- Produces:
  - `useGlobalFilters(): GlobalFilters` con
    ```ts
    interface GlobalFilters {
      yearSelection: YearSelection;
      years: string[] | undefined;
      currency: Currency;
      cardLabel: string | undefined;
      from: string | undefined;
      to: string | undefined;
      setYears: (selection: YearSelection) => void;
      setCurrency: (currency: Currency) => void;
      setCardLabel: (cardLabel: string) => void;
      setMonth: (month: string) => void;
    }
    ```
    (`Currency` es el tipo de `@ledgerly/shared`.) `yearSelection` es estable entre renders mientras no cambie `year` en la URL.
  - `StatFilters` gana `year?: string[]`.
  - `useTransactionYearOptions(currency: Currency, cardLabel: string | undefined): string[]` (años de `/stats/monthly` sin `year`).
  - `useInstallmentYearOptions(currency: Currency, cardLabel: string | undefined): string[]` (años de `/stats/future-installments` sin `year`).

- [ ] **Step 1: Write the failing tests**

`client/src/filters/useGlobalFilters.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useGlobalFilters } from "./useGlobalFilters.js";

const renderAt = (route: string) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  );
  return renderHook(() => ({ filters: useGlobalFilters(), location: useLocation() }), { wrapper });
};

const paramsOf = (search: string) => new URLSearchParams(search);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useGlobalFilters", () => {
  it("sin params usa el año actual, ARS y todas las tarjetas", () => {
    const { result } = renderAt("/");
    expect(result.current.filters.years).toEqual(["2026"]);
    expect(result.current.filters.currency).toBe("ARS");
    expect(result.current.filters.cardLabel).toBeUndefined();
  });

  it("con year=all no manda años a la API", () => {
    const { result } = renderAt("/?year=all");
    expect(result.current.filters.yearSelection).toEqual({ kind: "all" });
    expect(result.current.filters.years).toBeUndefined();
  });

  it("mantiene la misma selección de años entre renders", () => {
    const { result, rerender } = renderAt("/?year=2025");
    const first = result.current.filters.yearSelection;
    rerender();
    expect(result.current.filters.yearSelection).toBe(first);
  });

  it("setMonth escribe el rango completo del mes", () => {
    const { result } = renderAt("/?year=2026");
    act(() => result.current.filters.setMonth("2026-02"));
    const params = paramsOf(result.current.location.search);
    expect(params.get("from")).toBe("2026-02-01");
    expect(params.get("to")).toBe("2026-02-28");
  });

  it("setYears limpia el Mes si queda fuera de los años elegidos", () => {
    const { result } = renderAt("/?year=2025&year=2026&from=2025-11-01&to=2025-11-30");
    act(() => result.current.filters.setYears({ kind: "years", years: ["2026"] }));
    const params = paramsOf(result.current.location.search);
    expect(params.getAll("year")).toEqual(["2026"]);
    expect(params.get("from")).toBeNull();
    expect(params.get("to")).toBeNull();
  });

  it("setYears conserva el Mes si sigue dentro de los años elegidos", () => {
    const { result } = renderAt("/?year=2026&from=2026-02-01&to=2026-02-28");
    act(() => result.current.filters.setYears({ kind: "years", years: ["2025", "2026"] }));
    expect(paramsOf(result.current.location.search).get("from")).toBe("2026-02-01");
  });

  it("setCardLabel vacío vuelve a todas las tarjetas", () => {
    const { result } = renderAt("/?cardLabel=ICBC");
    act(() => result.current.filters.setCardLabel(""));
    expect(result.current.filters.cardLabel).toBeUndefined();
  });
});
```

`client/src/filters/useYearOptions.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInstallmentYearOptions, useTransactionYearOptions } from "./useYearOptions.js";

const renderWithClient = <T,>(hook: () => T) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/stats/future-installments") ? [{ month: "2026-12", total: 1 }, { month: "2027-01", total: 1 }]
      : url.includes("/stats/monthly") ? [{ month: "2024-03", total: 1, count: 1 }, { month: "2026-05", total: 1, count: 1 }]
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("opciones de año", () => {
  it("useTransactionYearOptions lista los años con consumos", async () => {
    const { result } = renderWithClient(() => useTransactionYearOptions("ARS", undefined));
    await waitFor(() => expect(result.current).toEqual(["2024", "2026"]));
  });

  it("useInstallmentYearOptions lista los años de vencimiento", async () => {
    const { result } = renderWithClient(() => useInstallmentYearOptions("ARS", undefined));
    await waitFor(() => expect(result.current).toEqual(["2026", "2027"]));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/filters/useGlobalFilters.test.tsx client/src/filters/useYearOptions.test.tsx`
Expected: FAIL — no existen los módulos.

- [ ] **Step 3: Implement**

`client/src/api/hooks.ts` línea 9:

```ts
export interface StatFilters { currency: "ARS" | "USD"; from?: string; to?: string; cardLabel?: string; year?: string[]; }
```

`client/src/filters/useGlobalFilters.ts`:

```ts
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Currency } from "@ledgerly/shared";
import { matchesYears, parseYears, writeYears, yearsForApi, type YearSelection } from "./globalFilters.js";

export interface GlobalFilters {
  yearSelection: YearSelection;
  years: string[] | undefined;
  currency: Currency;
  cardLabel: string | undefined;
  from: string | undefined;
  to: string | undefined;
  setYears: (selection: YearSelection) => void;
  setCurrency: (currency: Currency) => void;
  setCardLabel: (cardLabel: string) => void;
  setMonth: (month: string) => void;
}

const monthRange = (month: string): { from: string; to: string } => {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
};

export const useGlobalFilters = (): GlobalFilters => {
  const [params, setParams] = useSearchParams();
  const yearKey = params.getAll("year").join(",");
  const yearSelection = useMemo(() => parseYears(yearKey ? yearKey.split(",") : []), [yearKey]);

  const update = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace: true });
  };

  const setYears = (selection: YearSelection) => update((next) => {
    writeYears(next, selection);
    const from = next.get("from");
    if (from && !matchesYears(from, selection)) {
      next.delete("from");
      next.delete("to");
    }
  });

  const setCurrency = (currency: Currency) => update((next) => next.set("currency", currency));

  const setCardLabel = (cardLabel: string) => update((next) => {
    if (cardLabel) next.set("cardLabel", cardLabel);
    else next.delete("cardLabel");
  });

  const setMonth = (month: string) => update((next) => {
    if (!month) {
      next.delete("from");
      next.delete("to");
      return;
    }
    const range = monthRange(month);
    next.set("from", range.from);
    next.set("to", range.to);
  });

  return {
    yearSelection,
    years: yearsForApi(yearSelection),
    currency: params.get("currency") === "USD" ? "USD" : "ARS",
    cardLabel: params.get("cardLabel") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    setYears,
    setCurrency,
    setCardLabel,
    setMonth,
  };
};
```

`client/src/filters/useYearOptions.ts`:

```ts
import { useMemo } from "react";
import type { Currency } from "@ledgerly/shared";
import { useFutureInstallments, useMonthly } from "../api/hooks.js";
import { yearsOf } from "./globalFilters.js";

export const useTransactionYearOptions = (currency: Currency, cardLabel: string | undefined): string[] => {
  const { data } = useMonthly({ currency, cardLabel });
  return useMemo(() => yearsOf(Array.isArray(data) ? data.map((row) => row.month) : []), [data]);
};

export const useInstallmentYearOptions = (currency: Currency, cardLabel: string | undefined): string[] => {
  const { data } = useFutureInstallments({ currency, cardLabel });
  return useMemo(() => yearsOf(Array.isArray(data) ? data.map((row) => row.month) : []), [data]);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/filters/ && bun run typecheck`
Expected: PASS (todos los tests de `client/src/filters/`); typecheck sin errores.

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/filters/useGlobalFilters.ts client/src/filters/useGlobalFilters.test.tsx client/src/filters/useYearOptions.ts client/src/filters/useYearOptions.test.tsx client/src/api/hooks.ts
git commit -m "feat(client): hook de filtros globales y opciones de año" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `FiltersBar` por campos con Año multi-selección

**Files:**
- Create: `client/src/components/filters/YearFilter.tsx`
- Create: `client/src/components/filters/CurrencyFilter.tsx`
- Create: `client/src/components/filters/CardFilter.tsx`
- Create: `client/src/components/filters/MonthFilter.tsx`
- Create: `client/src/components/filters/TransactionFilters.tsx`
- Modify (reescribir): `client/src/components/FiltersBar.tsx`
- Modify (reescribir): `client/src/components/FiltersBar.test.tsx`
- Modify: `client/src/pages/DashboardPage.tsx`, `client/src/pages/InstallmentsPage.tsx`, `client/src/pages/TransactionsPage.tsx` (solo migrar a la API nueva de `FiltersBar`)

**Interfaces:**
- Consumes: `useGlobalFilters` (Task 5); `ALL_YEARS`, `matchesYears`, `resolveYearChange`, `yearOptionsWith` (Task 4); `useTransactionYearOptions`, `useInstallmentYearOptions` (Task 5).
- Produces:
  - `export type FilterField = "year" | "currency" | "card" | "month" | "transaction"` desde `client/src/components/FiltersBar.tsx`.
  - `FiltersBar({ fields, yearOptions }: { fields: FilterField[]; yearOptions: string[] })`.

- [ ] **Step 1: Write the failing test**

Reescribir `client/src/components/FiltersBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { FiltersBar, type FilterField } from "./FiltersBar.js";

const statements = [
  { id: "1", cardLabel: "ICBC" },
  { id: "2", cardLabel: "Visa Signature ****8883" },
];
const monthly = [
  { month: "2025-11", total: 1, count: 1 },
  { month: "2026-01", total: 1, count: 1 },
  { month: "2026-02", total: 1, count: 1 },
];

const LocationProbe = () => {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
};

const renderBar = (fields: FilterField[], route = "/", yearOptions = ["2025", "2026"]) =>
  renderWithProviders(
    <>
      <FiltersBar fields={fields} yearOptions={yearOptions} />
      <LocationProbe />
    </>,
    { route },
  );

const currentParams = () => new URLSearchParams(screen.getByTestId("search").textContent ?? "");

const openSelect = async (name: RegExp) => {
  await userEvent.click(await screen.findByRole("combobox", { name }));
  return screen.findByRole("listbox");
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00"));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/transactions/categories") ? ["Compras", "Transporte", "Sin categoría"]
      : url.includes("/statements") ? statements
      : url.includes("/stats/monthly") ? monthly
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FiltersBar", () => {
  it("muestra solo los campos pedidos", async () => {
    renderBar(["year"]);
    expect(await screen.findByRole("combobox", { name: /año/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /moneda/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /tarjeta/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /^mes/i })).not.toBeInTheDocument();
  });

  it("ofrece un filtro de tarjeta con las tarjetas importadas", async () => {
    renderBar(["currency", "card"]);
    const listbox = await openSelect(/tarjeta/i);
    expect(await within(listbox).findByText("ICBC")).toBeInTheDocument();
    expect(within(listbox).getByText("Visa Signature ****8883")).toBeInTheDocument();
  });

  it("permite filtrar por varias categorías", async () => {
    renderBar(["transaction"], "/transactions");
    const listbox = await openSelect(/categorías/i);
    await userEvent.click(await within(listbox).findByRole("option", { name: "Compras" }));
    await userEvent.click(within(listbox).getByRole("option", { name: "Transporte" }));
    expect(currentParams().getAll("category")).toEqual(["Compras", "Transporte"]);
  });

  it("ofrece un filtro de cuotas con opciones todas/solo/sin", async () => {
    renderBar(["transaction"], "/transactions");
    const listbox = await openSelect(/cuotas/i);
    expect(within(listbox).getByRole("option", { name: "Solo cuotas" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Sin cuotas" })).toBeInTheDocument();
  });

  it("elegir un segundo año escribe params repetidos", async () => {
    renderBar(["year"], "/?year=2026");
    const listbox = await openSelect(/año/i);
    await userEvent.click(within(listbox).getByRole("option", { name: "2025" }));
    expect(currentParams().getAll("year")).toEqual(["2025", "2026"]);
  });

  it("elegir Todos pone year=all", async () => {
    renderBar(["year"], "/?year=2026");
    const listbox = await openSelect(/año/i);
    await userEvent.click(within(listbox).getByRole("option", { name: "Todos" }));
    expect(currentParams().getAll("year")).toEqual(["all"]);
  });

  it("destildar el último año vuelve a Todos", async () => {
    renderBar(["year"], "/?year=2026");
    const listbox = await openSelect(/año/i);
    await userEvent.click(within(listbox).getByRole("option", { name: "2026" }));
    expect(currentParams().getAll("year")).toEqual(["all"]);
  });

  it("ofrece el año actual y los elegidos aunque no tengan datos", async () => {
    renderBar(["year"], "/?year=2019", ["2025"]);
    const listbox = await openSelect(/año/i);
    const names = within(listbox).getAllByRole("option").map((option) => option.textContent);
    expect(names).toEqual(["Todos", "2026", "2025", "2019"]);
  });

  it("el Mes lista solo meses de los años elegidos", async () => {
    renderBar(["year", "month"], "/?year=2026");
    const listbox = await openSelect(/^mes/i);
    expect(await within(listbox).findByRole("option", { name: /febrero/i })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: /enero/i })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: /noviembre/i })).not.toBeInTheDocument();
  });

  it("sacar el año del Mes elegido limpia el Mes", async () => {
    renderBar(["year", "month"], "/?year=2025&year=2026&from=2025-11-01&to=2025-11-30");
    const listbox = await openSelect(/año/i);
    await userEvent.click(within(listbox).getByRole("option", { name: "2025" }));
    expect(currentParams().getAll("year")).toEqual(["2026"]);
    expect(currentParams().get("from")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/FiltersBar.test.tsx`
Expected: FAIL — `FilterField` no se exporta y no hay combobox "Año".

- [ ] **Step 3: Implement the field components**

`client/src/components/filters/YearFilter.tsx`:

```tsx
import type { ReactNode } from "react";
import { Checkbox, ListItemText, MenuItem, TextField } from "@mui/material";
import { ALL_YEARS, resolveYearChange, yearOptionsWith } from "../../filters/globalFilters.js";
import { useGlobalFilters } from "../../filters/useGlobalFilters.js";

interface YearFilterProps { options: string[]; }

const ALL_LABEL = "Todos";

const renderSelected = (selected: unknown): ReactNode => {
  const values = selected as string[];
  return values.includes(ALL_YEARS) ? ALL_LABEL : values.join(", ");
};

export const YearFilter = ({ options }: YearFilterProps) => {
  const { yearSelection, setYears } = useGlobalFilters();
  const years = yearOptionsWith(options, yearSelection);
  const value = yearSelection.kind === "all" ? [ALL_YEARS] : yearSelection.years;
  const isChecked = (year: string) => yearSelection.kind === "years" && yearSelection.years.includes(year);

  return (
    <TextField
      select label="Año" size="small" sx={{ minWidth: 160 }}
      value={value}
      onChange={(event) => setYears(resolveYearChange(yearSelection, event.target.value as unknown as string[]))}
      SelectProps={{ multiple: true, renderValue: renderSelected }}
    >
      <MenuItem value={ALL_YEARS}>
        <Checkbox size="small" checked={yearSelection.kind === "all"} />
        <ListItemText primary={ALL_LABEL} />
      </MenuItem>
      {years.map((year) => (
        <MenuItem key={year} value={year}>
          <Checkbox size="small" checked={isChecked(year)} />
          <ListItemText primary={year} />
        </MenuItem>
      ))}
    </TextField>
  );
};
```

`client/src/components/filters/CurrencyFilter.tsx`:

```tsx
import { MenuItem, TextField } from "@mui/material";
import { useGlobalFilters } from "../../filters/useGlobalFilters.js";

export const CurrencyFilter = () => {
  const { currency, setCurrency } = useGlobalFilters();

  return (
    <TextField
      select label="Moneda" size="small" sx={{ minWidth: 120 }}
      value={currency} onChange={(event) => setCurrency(event.target.value === "USD" ? "USD" : "ARS")}
    >
      <MenuItem value="ARS">ARS</MenuItem>
      <MenuItem value="USD">USD</MenuItem>
    </TextField>
  );
};
```

`client/src/components/filters/CardFilter.tsx`:

```tsx
import { MenuItem, TextField } from "@mui/material";
import { useStatements } from "../../api/hooks.js";
import { useGlobalFilters } from "../../filters/useGlobalFilters.js";

export const CardFilter = () => {
  const { cardLabel, setCardLabel } = useGlobalFilters();
  const { data } = useStatements();
  const cards = Array.isArray(data) ? [...new Set(data.map((statement) => statement.cardLabel))] : [];

  return (
    <TextField
      select label="Tarjeta" size="small" sx={{ minWidth: 200 }}
      value={cardLabel ?? ""} onChange={(event) => setCardLabel(event.target.value)}
    >
      <MenuItem value="">Todas</MenuItem>
      {cards.map((card) => (
        <MenuItem key={card} value={card}>{card}</MenuItem>
      ))}
    </TextField>
  );
};
```

`client/src/components/filters/MonthFilter.tsx`:

```tsx
import { MenuItem, TextField } from "@mui/material";
import { useMonthly } from "../../api/hooks.js";
import { formatMonthLabel } from "../../format.js";
import { matchesYears } from "../../filters/globalFilters.js";
import { useGlobalFilters } from "../../filters/useGlobalFilters.js";

export const MonthFilter = () => {
  const { yearSelection, currency, cardLabel, from, setMonth } = useGlobalFilters();
  const { data } = useMonthly({ currency, cardLabel });
  const month = from?.slice(0, 7) ?? "";
  const availableMonths = Array.isArray(data) ? data.map((row) => row.month) : [];
  const monthsInYears = availableMonths.filter((value) => matchesYears(value, yearSelection));
  const options = [...new Set([...(month ? [month] : []), ...monthsInYears])].sort().reverse();

  return (
    <TextField
      select label="Mes" size="small" sx={{ minWidth: 180 }}
      value={month} onChange={(event) => setMonth(event.target.value)}
    >
      <MenuItem value="">Todos</MenuItem>
      {options.map((option) => (
        <MenuItem key={option} value={option}>{formatMonthLabel(option)}</MenuItem>
      ))}
    </TextField>
  );
};
```

`client/src/components/filters/TransactionFilters.tsx` (lo que antes era el bloque `showCategory` de `FiltersBar`, sin cambios de comportamiento):

```tsx
import { useSearchParams } from "react-router-dom";
import { MenuItem, TextField } from "@mui/material";
import { useCategories } from "../../api/hooks.js";

export const TransactionFilters = () => {
  const [params, setParams] = useSearchParams();
  const { data } = useCategories();
  const categories = Array.isArray(data) ? data : [];

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const setMulti = (key: string, values: string[]) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    for (const value of values) next.append(key, value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <TextField
        select label="Categorías" size="small" sx={{ minWidth: 220 }}
        value={params.getAll("category")}
        onChange={(event) => setMulti("category", event.target.value as unknown as string[])}
        SelectProps={{ multiple: true, renderValue: (selected) => (selected as string[]).join(", ") }}
      >
        {categories.map((category) => (
          <MenuItem key={category} value={category}>{category}</MenuItem>
        ))}
      </TextField>
      <TextField
        select label="Cuotas" size="small" sx={{ minWidth: 150 }}
        value={params.get("installment") ?? ""} onChange={(event) => set("installment", event.target.value)}
      >
        <MenuItem value="">Todas</MenuItem>
        <MenuItem value="true">Solo cuotas</MenuItem>
        <MenuItem value="false">Sin cuotas</MenuItem>
      </TextField>
      <TextField
        label="Buscar comercio" size="small"
        value={params.get("search") ?? ""} onChange={(event) => set("search", event.target.value)}
      />
    </>
  );
};
```

- [ ] **Step 4: Rewrite `FiltersBar`**

`client/src/components/FiltersBar.tsx`:

```tsx
import { Box } from "@mui/material";
import { YearFilter } from "./filters/YearFilter.js";
import { CurrencyFilter } from "./filters/CurrencyFilter.js";
import { CardFilter } from "./filters/CardFilter.js";
import { MonthFilter } from "./filters/MonthFilter.js";
import { TransactionFilters } from "./filters/TransactionFilters.js";

export type FilterField = "year" | "currency" | "card" | "month" | "transaction";

interface FiltersBarProps { fields: FilterField[]; yearOptions: string[]; }

export const FiltersBar = ({ fields, yearOptions }: FiltersBarProps) => {
  const shows = (field: FilterField) => fields.includes(field);

  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
      {shows("year") && <YearFilter options={yearOptions} />}
      {shows("currency") && <CurrencyFilter />}
      {shows("card") && <CardFilter />}
      {shows("month") && <MonthFilter />}
      {shows("transaction") && <TransactionFilters />}
    </Box>
  );
};
```

- [ ] **Step 5: Migrate the three call sites to the new API**

Solo cambia cómo se monta la barra; el envío de `year` a la API llega en Task 7.

`client/src/pages/DashboardPage.tsx`:
- Imports: `import { FiltersBar, type FilterField } from "../components/FiltersBar.js";` y `import { useTransactionYearOptions } from "../filters/useYearOptions.js";`
- A nivel de módulo: `const DASHBOARD_FIELDS: FilterField[] = ["year", "currency", "card", "month"];`
- Después de armar `filters`: `const yearOptions = useTransactionYearOptions(filters.currency, filters.cardLabel);`
- Reemplazar `<FiltersBar />` por `<FiltersBar fields={DASHBOARD_FIELDS} yearOptions={yearOptions} />`.

`client/src/pages/InstallmentsPage.tsx`:
- Imports: `import { FiltersBar, type FilterField } from "../components/FiltersBar.js";` y `import { useInstallmentYearOptions } from "../filters/useYearOptions.js";`
- Módulo: `const INSTALLMENT_FIELDS: FilterField[] = ["year", "currency", "card"];`
- Después de `filters`: `const yearOptions = useInstallmentYearOptions(filters.currency, filters.cardLabel);`
- Reemplazar `<FiltersBar showMonth={false} />` por `<FiltersBar fields={INSTALLMENT_FIELDS} yearOptions={yearOptions} />`.

`client/src/pages/TransactionsPage.tsx`:
- Imports: `import { FiltersBar, type FilterField } from "../components/FiltersBar.js";` y `import { useTransactionYearOptions } from "../filters/useYearOptions.js";`
- Módulo: `const TRANSACTION_FIELDS: FilterField[] = ["year", "currency", "card", "month", "transaction"];`
- Inmediatamente después de `const { data, isLoading, isError, error } = useTransactions(filters);` (antes de los early returns): `const yearOptions = useTransactionYearOptions(filters.currency ?? "ARS", filters.cardLabel);`
- Reemplazar `<FiltersBar showCategory />` por `<FiltersBar fields={TRANSACTION_FIELDS} yearOptions={yearOptions} />`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test client/src/components/FiltersBar.test.tsx client/src/pages/ && bun run typecheck`
Expected: PASS (10 tests de `FiltersBar` y todos los de páginas); typecheck sin errores.

- [ ] **Step 7: Commit** (solo con pedido explícito)

```bash
git add client/src/components/filters/ client/src/components/FiltersBar.tsx client/src/components/FiltersBar.test.tsx client/src/pages/DashboardPage.tsx client/src/pages/InstallmentsPage.tsx client/src/pages/TransactionsPage.tsx
git commit -m "feat(client): FiltersBar por campos con filtro de año multi-selección" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Dashboard, Cuotas y Movimientos mandan `year` a la API

**Files:**
- Modify: `client/src/pages/DashboardPage.tsx`, `client/src/pages/InstallmentsPage.tsx`, `client/src/pages/TransactionsPage.tsx`
- Test: `client/src/pages/DashboardPage.test.tsx`, `client/src/pages/InstallmentsPage.test.tsx`, `client/src/pages/TransactionsPage.test.tsx`

**Interfaces:**
- Consumes: `useGlobalFilters` (Task 5), `StatFilters.year` (Task 5), `FilterField` y `FiltersBar` (Task 6), `useTransactionYearOptions`/`useInstallmentYearOptions` (Task 5).
- Produces: las tres páginas leen los filtros solo de `useGlobalFilters` y propagan `year` a todos los hooks de estadísticas/movimientos.

- [ ] **Step 1: Write the failing tests**

`client/src/pages/DashboardPage.test.tsx`:
- Cambiar el import de testing-library a `import { cleanup, screen, waitFor } from "@testing-library/react";`
- Cambiar el `afterEach` a `afterEach(() => { cleanup(); vi.restoreAllMocks(); });`
- Agregar a nivel de módulo:

```ts
const urlOf = (path: string) => vi.mocked(fetch).mock.calls.map((call) => String(call[0])).find((url) => url.includes(path));
const thisYear = String(new Date().getFullYear());
```

- Agregar dentro de `describe("DashboardPage", ...)`:

```ts
  it("por defecto pide las estadísticas del año actual", async () => {
    renderWithProviders(<DashboardPage />, { route: "/" });
    await waitFor(() => expect(urlOf("/stats/summary")).toBeDefined());
    expect(urlOf("/stats/summary")).toContain(`year=${thisYear}`);
    expect(urlOf("/stats/by-category")).toContain(`year=${thisYear}`);
  });

  it("con year=all no manda year", async () => {
    renderWithProviders(<DashboardPage />, { route: "/?year=all" });
    await waitFor(() => expect(urlOf("/stats/summary")).toBeDefined());
    expect(urlOf("/stats/summary")).not.toContain("year=");
  });

  it("manda varios años como params repetidos", async () => {
    renderWithProviders(<DashboardPage />, { route: "/?year=2025&year=2026" });
    await waitFor(() => expect(urlOf("/stats/monthly-usd")).toBeDefined());
    expect(urlOf("/stats/monthly-usd")).toContain("year=2025&year=2026");
  });
```

`client/src/pages/InstallmentsPage.test.tsx`:
- Import `cleanup` y `waitFor`; `afterEach(() => { cleanup(); vi.restoreAllMocks(); });`
- Agregar:

```ts
const detailUrl = () => vi.mocked(fetch).mock.calls.map((call) => String(call[0])).find((url) => url.includes("/stats/future-installments/detail"));
```

```ts
  it("pide las cuotas que vencen en el año actual por defecto", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments" });
    await waitFor(() => expect(detailUrl()).toBeDefined());
    expect(detailUrl()).toContain(`year=${new Date().getFullYear()}`);
  });

  it("pide las cuotas de todos los años elegidos", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments?year=2026&year=2027" });
    await waitFor(() => expect(detailUrl()).toBeDefined());
    expect(detailUrl()).toContain("year=2026&year=2027");
  });
```

`client/src/pages/TransactionsPage.test.tsx` — agregar dentro del `describe`:

```ts
  it("manda el año actual al API por defecto y ninguno con year=all", async () => {
    const listUrl = () => vi.mocked(fetch).mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/transactions") && !u.includes("/categories"));
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    expect(listUrl()).toContain(`year=${new Date().getFullYear()}`);
    cleanup();
    vi.mocked(fetch).mockClear();
    renderWithProviders(<TransactionsPage />, { route: "/transactions?year=all" });
    await waitFor(() => expect(screen.getByText("MERCADOLIBRE")).toBeInTheDocument());
    expect(listUrl()).not.toContain("year=");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/pages/DashboardPage.test.tsx client/src/pages/InstallmentsPage.test.tsx client/src/pages/TransactionsPage.test.tsx`
Expected: FAIL en los tests nuevos (las URLs no llevan `year`). Los preexistentes siguen en verde.

- [ ] **Step 3: Implement**

`client/src/pages/DashboardPage.tsx` — reemplazar el import de `useSearchParams`, el parseo y el orden de barra/resumen del ciclo:

```tsx
import { Typography } from "@mui/material";
import { type StatFilters } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useTransactionYearOptions } from "../filters/useYearOptions.js";
```

(mantener el resto de imports de gráficos/KPIs como están; quitar `Box` si queda sin uso y `useSearchParams`)

```tsx
const DASHBOARD_FIELDS: FilterField[] = ["year", "currency", "card", "month"];

export const DashboardPage = () => {
  const { years, currency, cardLabel, from, to } = useGlobalFilters();
  const yearOptions = useTransactionYearOptions(currency, cardLabel);
  const filters: StatFilters = { currency, cardLabel, from, to, year: years };

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard</Typography>
      <FiltersBar fields={DASHBOARD_FIELDS} yearOptions={yearOptions} />
      <CardCycleSummary />
      <KpiCards {...filters} />
```

(el resto del JSX queda igual)

`client/src/pages/InstallmentsPage.tsx` — quitar `useSearchParams` y reemplazar el parseo:

```tsx
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
```

```tsx
const INSTALLMENT_FIELDS: FilterField[] = ["year", "currency", "card"];

export const InstallmentsPage = () => {
  const { years, currency, cardLabel } = useGlobalFilters();
  const yearOptions = useInstallmentYearOptions(currency, cardLabel);
  const filters: StatFilters = { currency, cardLabel, year: years };
  const { data, isLoading } = useFutureInstallmentsDetail(filters);
```

(el resto queda igual)

`client/src/pages/TransactionsPage.tsx` — conservar `useSearchParams` para los params propios y para "sin moneda = ambas monedas" (comportamiento actual):

```tsx
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
```

```tsx
const TRANSACTION_FIELDS: FilterField[] = ["year", "currency", "card", "month", "transaction"];

export const TransactionsPage = () => {
  const [params] = useSearchParams();
  const { years, currency, cardLabel, from, to } = useGlobalFilters();
  const patch = usePatchTransaction();
  const del = useDeleteTransactions();
  const filters: TxFilters = {
    currency: params.get("currency") === null ? undefined : currency,
    from,
    to,
    year: years,
    category: params.getAll("category"),
    search: params.get("search") ?? undefined,
    cardLabel,
    installment: params.get("installment") ?? undefined,
  };
  const { data, isLoading, isError, error } = useTransactions(filters);
  const yearOptions = useTransactionYearOptions(currency, cardLabel);
```

(el resto queda igual)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/pages/ && bun run typecheck`
Expected: PASS; typecheck sin errores.

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/pages/DashboardPage.tsx client/src/pages/InstallmentsPage.tsx client/src/pages/TransactionsPage.tsx client/src/pages/DashboardPage.test.tsx client/src/pages/InstallmentsPage.test.tsx client/src/pages/TransactionsPage.test.tsx
git commit -m "feat(client): Dashboard, Cuotas y Movimientos filtran por año" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: El sidebar conserva los filtros globales

**Files:**
- Modify: `client/src/components/layout/SidebarNav.tsx`
- Test: `client/src/components/layout/Layout.test.tsx`

**Interfaces:**
- Consumes: `globalSearch` (Task 4).
- Produces: cada link del sidebar (desktop y mobile) apunta a `pathname + globalSearch(params actuales)`.

- [ ] **Step 1: Write the failing test**

En `client/src/components/layout/Layout.test.tsx`, dentro de `describe("Layout", ...)`:

```ts
  it("los links conservan los filtros globales y descartan los de Movimientos", () => {
    renderLayout("/transactions?year=2025&currency=USD&category=Compras&search=uber");
    const link = within(mainNavigation()).getByRole("link", { name: /créditos/i });
    expect(link).toHaveAttribute("href", "/credits?year=2025&currency=USD");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/layout/Layout.test.tsx`
Expected: FAIL — `href` es `/credits`.

- [ ] **Step 3: Implement**

`client/src/components/layout/SidebarNav.tsx`:

```tsx
import { NavLink, useSearchParams } from "react-router-dom";
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import { globalSearch } from "../../filters/globalFilters.js";
import { NAV_ITEMS } from "./navItems.js";
import { sidebarItemSx } from "./sidebarItemSx.js";

interface SidebarNavProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export const SidebarNav = ({ collapsed = false, onNavigate }: SidebarNavProps) => {
  const [params] = useSearchParams();
  const search = globalSearch(params);

  return (
    <Box component="nav" aria-label="principal" sx={{ flexGrow: 1, overflowX: "hidden", overflowY: "auto", px: 1.5 }}>
      <List disablePadding>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <ListItem key={to} disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={collapsed ? label : ""} placement="right">
              <ListItemButton
                component={NavLink}
                to={{ pathname: to, search }}
                end={to === "/"}
                aria-label={label}
                onClick={onNavigate}
                sx={sidebarItemSx(collapsed)}
              >
                <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
                {!collapsed && <ListItemText primary={label} />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </Box>
  );
};
```

Si al momento de implementar `SidebarNav.tsx` cambió respecto de esta versión (lo mantiene otra sesión), aplicar solo los tres cambios sobre lo que haya: importar `useSearchParams` y `globalSearch`, calcular `search` en el cuerpo, y pasar `to={{ pathname: to, search }}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/layout/Layout.test.tsx`
Expected: PASS (incluido "marca como activa solo la sección de la ruta actual").

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/components/layout/SidebarNav.tsx client/src/components/layout/Layout.test.tsx
git commit -m "feat(client): el sidebar conserva los filtros globales al navegar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Créditos y Auto filtran por año

**Files:**
- Create: `client/src/filters/useInYears.ts`
- Modify (cambiar el hook de datos): `client/src/components/charts/CapitalVsInterestChart.tsx`, `client/src/components/charts/TotalPaidByMonthChart.tsx`, `client/src/components/charts/UvaEvolutionChart.tsx`, `client/src/components/charts/CouponUsdChart.tsx`, `client/src/components/MortgageCouponsTable.tsx`, `client/src/components/charts/AutoCompositionChart.tsx`, `client/src/components/charts/AutoTotalPaidByMonthChart.tsx`, `client/src/components/charts/CarValueChart.tsx`, `client/src/components/charts/AutoCouponUsdChart.tsx`, `client/src/components/AutoCouponsTable.tsx`
- Modify: `client/src/pages/CreditsPage.tsx`, `client/src/pages/AutoPage.tsx`
- Test: `client/src/pages/CreditsPage.test.tsx`, `client/src/pages/AutoPage.test.tsx`, `client/src/components/MortgageCouponsTable.test.tsx`, `client/src/components/AutoCouponsTable.test.tsx`

**Interfaces:**
- Consumes: `filterInYears`, `yearsOf` (Task 4); `useGlobalFilters` (Task 5); `FiltersBar`, `FilterField` (Task 6).
- Produces:
  - `useCreditCouponsInYears(): { data: MortgageCouponDTO[] | undefined; isLoading: boolean }` (por `fechaDebito`)
  - `useAutoCouponsInYears(): { data: AutoCouponDTO[] | undefined; isLoading: boolean }` (por `fechaVencimiento`)

- [ ] **Step 1: Write the failing tests**

`client/src/pages/CreditsPage.test.tsx` — reemplazar el archivo:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { CreditsPage } from "./CreditsPage.js";

const coupon = (id: string, cuotaNro: number, fechaDebito: string) => ({
  id, prestamoNro: "0405727408", cuotaNro, fechaDebito, capital: 184689.39,
  intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93, cuotaPuraUva: 699.6,
  cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84, tea: 9.27, tna: 8.9, cft: 0,
  tipoCambioUsd: 1350, tipoCambioSource: "api", totalUsd: 813.1,
});

function route(url: string) {
  if (url.includes("/credits/summary")) {
    return { prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240, totalPagado: 13594820.38,
      capitalPagado: 2378973.78, interesPagado: 11097965.12, seguroPagado: 117881.48, capitalOriginalUva: 78316.73,
      capitalAmortizadoUva: 1355.89, capitalPendienteUva: 76960.84, capitalPendientePesos: 153827014.64,
      porcentajeAvanceCapital: 0.017313, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9 };
  }
  if (url.includes("/credits/coupons")) return [coupon("1", 1, "2025-08-18"), coupon("2", 6, "2026-01-19")];
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CreditsPage", () => {
  it("muestra KPIs, gráficos y detalle mes a mes", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    await waitFor(() => expect(screen.getByText("Total pagado")).toBeInTheDocument());
    expect(screen.getByText(/capital vs interés por mes/i)).toBeInTheDocument();
    expect(screen.getByText(/detalle mes a mes/i)).toBeInTheDocument();
    expect(screen.getByText(/valor de la cuota en usd/i)).toBeInTheDocument();
  });

  it("por defecto el detalle muestra solo el año actual y los KPIs siguen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00"));
    renderWithProviders(<CreditsPage />, { route: "/credits" });
    const table = await screen.findByRole("table");
    expect(within(table).getByText("2026-01-19")).toBeInTheDocument();
    expect(within(table).queryByText("2025-08-18")).not.toBeInTheDocument();
    expect(screen.getByText("Total pagado")).toBeInTheDocument();
  });

  it("con un año sin datos mantiene los KPIs y muestra los gráficos vacíos", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=2019" });
    await waitFor(() => expect(screen.getByText("Total pagado")).toBeInTheDocument());
    expect(screen.getAllByText("Sin datos").length).toBeGreaterThan(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /año/i })).toHaveTextContent("2019");
  });

  it("ofrece en el filtro de Año los años de los cupones", async () => {
    renderWithProviders(<CreditsPage />, { route: "/credits?year=all" });
    await userEvent.click(await screen.findByRole("combobox", { name: /año/i }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "2025" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "2026" })).toBeInTheDocument();
  });
});
```

`client/src/pages/AutoPage.test.tsx` — reemplazar el archivo:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { AutoPage } from "./AutoPage.js";

const coupon = (id: string, cuotaNro: number, fechaVencimiento: string) => ({
  id, grupo: "3684", orden: "97", cuotaNro, plan: "K", fechaEmision: fechaVencimiento,
  fechaVencimiento, comprobante: `00006275706${cuotaNro}`, modelo: "C3 AIRCROSS T200 FEEL PK MY24",
  valorMovil: 28240000.01, conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }],
  totalAPagar: 268551.23, tipoCambioUsd: 1000, tipoCambioSource: "api", totalUsd: 268.55,
});

function route(url: string) {
  if (url.includes("/auto/summary")) {
    return { grupo: "3684", orden: "97", plan: "K", modelo: "C3 AIRCROSS T200 FEEL PK MY24",
      cuotasPagadas: 4, cuotasTotales: 120, porcentajeAvance: 0.0333, totalPagado: 1428724.71,
      valorActualAuto: 41580000, totalPagadoUsd: 1200, ultimaCuota: 22, fechaUltimoVencimiento: "2026-07-10" };
  }
  if (url.includes("/auto/coupons")) return [coupon("1", 2, "2024-11-11"), coupon("2", 17, "2026-02-10")];
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AutoPage", () => {
  it("muestra el título, KPIs y el detalle mes a mes", async () => {
    renderWithProviders(<AutoPage />, { route: "/auto?year=all" });
    await waitFor(() => expect(screen.getByText("Total pagado")).toBeInTheDocument());
    expect(screen.getByText("Valor del auto")).toBeInTheDocument();
    expect(screen.getByText("Avance")).toBeInTheDocument();
    expect(screen.getByText("Detalle mes a mes")).toBeInTheDocument();
    expect(screen.getByText("Composición de la cuota por mes")).toBeInTheDocument();
    expect(screen.getByText("Total pagado por mes")).toBeInTheDocument();
    expect(screen.getByText("Evolución del valor del auto")).toBeInTheDocument();
    expect(screen.getByText("Avance del plan")).toBeInTheDocument();
    expect(screen.getByText("Valor de la cuota en USD")).toBeInTheDocument();
  });

  it("por defecto el detalle muestra solo el año actual y los KPIs siguen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00"));
    renderWithProviders(<AutoPage />, { route: "/auto" });
    const table = await screen.findByRole("table");
    expect(within(table).getByText("2026-02-10")).toBeInTheDocument();
    expect(within(table).queryByText("2024-11-11")).not.toBeInTheDocument();
    expect(screen.getByText("Valor del auto")).toBeInTheDocument();
  });
});
```

`client/src/components/MortgageCouponsTable.test.tsx` y `client/src/components/AutoCouponsTable.test.tsx`: en los dos `renderWithProviders(...)` de cada archivo, agregar `{ route: "/?year=all" }` como segundo argumento (los fixtures son de 2025 y 2024).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/pages/CreditsPage.test.tsx client/src/pages/AutoPage.test.tsx`
Expected: FAIL — la tabla muestra ambos cupones y no hay combobox "Año".

- [ ] **Step 3: Implement the hooks**

`client/src/filters/useInYears.ts`:

```ts
import type { AutoCouponDTO, MortgageCouponDTO } from "@ledgerly/shared";
import { useAutoCoupons, useCreditCoupons } from "../api/hooks.js";
import { filterInYears } from "./globalFilters.js";
import { useGlobalFilters } from "./useGlobalFilters.js";

interface InYearsResult<T> { data: T[] | undefined; isLoading: boolean; }

const debitDate = (coupon: MortgageCouponDTO): string => coupon.fechaDebito;
const dueDate = (coupon: AutoCouponDTO): string => coupon.fechaVencimiento;

export const useCreditCouponsInYears = (): InYearsResult<MortgageCouponDTO> => {
  const { yearSelection } = useGlobalFilters();
  const { data, isLoading } = useCreditCoupons();
  return { data: filterInYears(data, debitDate, yearSelection), isLoading };
};

export const useAutoCouponsInYears = (): InYearsResult<AutoCouponDTO> => {
  const { yearSelection } = useGlobalFilters();
  const { data, isLoading } = useAutoCoupons();
  return { data: filterInYears(data, dueDate, yearSelection), isLoading };
};
```

- [ ] **Step 4: Swap the data hook in charts and tables**

En cada uno de estos archivos, reemplazar el import del hook y su llamada (el resto del componente no cambia):

| Archivo | Antes | Después |
|---|---|---|
| `charts/CapitalVsInterestChart.tsx` | `import { useCreditCoupons } from "../../api/hooks.js";` / `useCreditCoupons()` | `import { useCreditCouponsInYears } from "../../filters/useInYears.js";` / `useCreditCouponsInYears()` |
| `charts/TotalPaidByMonthChart.tsx` | ídem | ídem |
| `charts/UvaEvolutionChart.tsx` | ídem | ídem |
| `charts/CouponUsdChart.tsx` | ídem | ídem |
| `MortgageCouponsTable.tsx` | `useCreditCoupons` dentro de `import { useCreditCoupons, usePatchCouponRate } from "../api/hooks.js";` | dejar `import { usePatchCouponRate } from "../api/hooks.js";`, agregar `import { useCreditCouponsInYears } from "../filters/useInYears.js";` y llamar `useCreditCouponsInYears()` |
| `charts/AutoCompositionChart.tsx` | `import { useAutoCoupons } from "../../api/hooks.js";` / `useAutoCoupons()` | `import { useAutoCouponsInYears } from "../../filters/useInYears.js";` / `useAutoCouponsInYears()` |
| `charts/AutoTotalPaidByMonthChart.tsx` | ídem | ídem |
| `charts/CarValueChart.tsx` | ídem | ídem |
| `charts/AutoCouponUsdChart.tsx` | ídem | ídem |
| `AutoCouponsTable.tsx` | `useAutoCoupons` dentro del import con `usePatchAutoRate` | dejar `import { usePatchAutoRate } from "../api/hooks.js";`, agregar `import { useAutoCouponsInYears } from "../filters/useInYears.js";` y llamar `useAutoCouponsInYears()` |

Antes de editar, abrir cada archivo y confirmar la línea exacta del import (algunos importan más de un hook desde `../api/hooks.js`; conservar los demás). No tocar `CreditKpiCards`, `AutoKpiCards`, `AmortizationDonutChart` ni `AutoProgressDonutChart`.

- [ ] **Step 5: Add the bar to the pages**

`client/src/pages/CreditsPage.tsx`:

```tsx
import { useMemo } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { useCreditCoupons } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { yearsOf } from "../filters/globalFilters.js";
```

(mantener el resto de imports)

```tsx
const CREDIT_FIELDS: FilterField[] = ["year"];

export const CreditsPage = () => {
  const { data, isLoading } = useCreditCoupons();
  const coupons = data ?? [];
  const yearOptions = useMemo(() => yearsOf((data ?? []).map((coupon) => coupon.fechaDebito)), [data]);
```

y en el JSX, como primer hijo del fragmento de `coupons.length > 0`:

```tsx
      {!isLoading && coupons.length > 0 && (
        <>
          <FiltersBar fields={CREDIT_FIELDS} yearOptions={yearOptions} />
          <CreditKpiCards />
```

`client/src/pages/AutoPage.tsx` — mismo patrón:

```tsx
import { useMemo } from "react";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { yearsOf } from "../filters/globalFilters.js";
```

```tsx
const AUTO_FIELDS: FilterField[] = ["year"];

export const AutoPage = () => {
  const { data, isLoading } = useAutoCoupons();
  const coupons = data ?? [];
  const yearOptions = useMemo(() => yearsOf((data ?? []).map((coupon) => coupon.fechaVencimiento)), [data]);
```

```tsx
      {!isLoading && coupons.length > 0 && (
        <>
          <FiltersBar fields={AUTO_FIELDS} yearOptions={yearOptions} />
          <AutoKpiCards />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test client/src/pages/CreditsPage.test.tsx client/src/pages/AutoPage.test.tsx client/src/components/MortgageCouponsTable.test.tsx client/src/components/AutoCouponsTable.test.tsx && bun run typecheck`
Expected: PASS; typecheck sin errores.

- [ ] **Step 7: Commit** (solo con pedido explícito)

```bash
git add client/src/filters/useInYears.ts client/src/components/charts/CapitalVsInterestChart.tsx client/src/components/charts/TotalPaidByMonthChart.tsx client/src/components/charts/UvaEvolutionChart.tsx client/src/components/charts/CouponUsdChart.tsx client/src/components/MortgageCouponsTable.tsx client/src/components/charts/AutoCompositionChart.tsx client/src/components/charts/AutoTotalPaidByMonthChart.tsx client/src/components/charts/CarValueChart.tsx client/src/components/charts/AutoCouponUsdChart.tsx client/src/components/AutoCouponsTable.tsx client/src/pages/CreditsPage.tsx client/src/pages/AutoPage.tsx client/src/pages/CreditsPage.test.tsx client/src/pages/AutoPage.test.tsx client/src/components/MortgageCouponsTable.test.tsx client/src/components/AutoCouponsTable.test.tsx
git commit -m "feat(client): Créditos y Auto filtran gráficos y detalle por año" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Sueldo usa la barra global

**Files:**
- Modify: `client/src/inflationStats.ts`, `client/src/inflationStats.test.ts`
- Modify: `client/src/components/charts/InflationAccumulatedChart.tsx`
- Modify: `client/src/components/PayslipsTable.tsx`
- Modify: `client/src/pages/PayslipsPage.tsx`
- Create: `client/src/pages/PayslipsPage.test.tsx`

**Interfaces:**
- Consumes: `matchesYears` (Task 4), `useGlobalFilters` (Task 5), `FiltersBar`/`FilterField` (Task 6).
- Produces:
  - `accumulatedInflation(inflation: InflationRateDTO[], years: string[]): AccumulatedInflationPoint[]`
  - `InflationAccumulatedChart({ inflation, years, monthOnly }: { inflation: InflationRateDTO[]; years: string[]; monthOnly?: boolean })`
  - `PayslipsTable({ payslips }: { payslips: PayslipDTO[] })`

- [ ] **Step 1: Write the failing tests**

`client/src/inflationStats.test.ts` — reemplazar los `it` por:

```ts
describe("accumulatedInflation", () => {
  it("acumula YTD del año elegido, primer punto = variación de enero", () => {
    const result = accumulatedInflation(
      inflation([["2024-12", 8], ["2025-01", 2], ["2025-02", 2], ["2025-03", 2]]),
      ["2025"],
    );
    expect(result.map((p) => p.periodo)).toEqual(["2025-01", "2025-02", "2025-03"]);
    expect(result[0].acumulado).toBeCloseTo(2, 6);
    expect(result[2].acumulado).toBeCloseTo(6.1208, 4);
  });

  it("con varios años acumula atravesándolos", () => {
    const result = accumulatedInflation(inflation([["2024-12", 10], ["2025-01", 2]]), ["2024", "2025"]);
    expect(result.map((p) => p.periodo)).toEqual(["2024-12", "2025-01"]);
    expect(result[0].acumulado).toBeCloseTo(10, 6);
    expect(result[1].acumulado).toBeCloseTo(12.2, 6);
  });

  it("con años no contiguos acumula solo los elegidos", () => {
    const result = accumulatedInflation(
      inflation([["2024-12", 10], ["2025-01", 50], ["2026-01", 2]]),
      ["2024", "2026"],
    );
    expect(result.map((p) => p.periodo)).toEqual(["2024-12", "2026-01"]);
    expect(result[1].acumulado).toBeCloseTo(12.2, 6);
  });

  it("ordena la salida por período aunque la entrada venga desordenada", () => {
    const result = accumulatedInflation(inflation([["2025-03", 1], ["2025-01", 1], ["2025-02", 1]]), ["2025"]);
    expect(result.map((p) => p.periodo)).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("devuelve [] con serie vacía", () => {
    expect(accumulatedInflation([], ["2025"])).toEqual([]);
  });

  it("devuelve [] si el año no tiene datos en la serie", () => {
    expect(accumulatedInflation(inflation([["2024-01", 5]]), ["2025"])).toEqual([]);
  });
});
```

`client/src/pages/PayslipsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { PayslipsPage } from "./PayslipsPage.js";

const payslip = (id: string, periodo: string) => ({
  id, periodo, tipo: "mensual", fechaPago: `${periodo}-05`, cuil: "20-12345678-3",
  conceptos: [{ codigo: "1", label: "Sueldo básico", tipo: "remunerativo", monto: 1000 }],
  remunerativo: 1000, noRemunerativo: 0, descuentos: 170, brutoTotal: 1000, neto: 830,
  costoTotalEmpleador: null, tipoCambioUsd: 1000, tipoCambioSource: "api", netoUsd: 0.83,
});

const summary = {
  periodos: 2, ultimoPeriodo: "2026-03", ultimoNeto: 830, ultimoNetoUsd: 0.83, ultimoBruto: 1000,
  variacionNetoMensual: 0, porcentajeDescuentos: 0.17, netoAcumuladoAnio: 830, recibosAnio: 1,
};

function route(url: string) {
  if (url.includes("/payslips/summary")) return summary;
  if (url.includes("/payslips")) return [payslip("p1", "2025-11"), payslip("p2", "2026-03")];
  if (url.includes("/inflation")) return [];
  return {};
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(route(url)), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PayslipsPage", () => {
  it("por defecto el detalle muestra solo el año actual y los KPIs siguen", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00"));
    renderWithProviders(<PayslipsPage />, { route: "/sueldo" });
    const table = await screen.findByRole("table");
    expect(within(table).getByText("2026-03")).toBeInTheDocument();
    expect(within(table).queryByText("2025-11")).not.toBeInTheDocument();
    expect(await screen.findByText("Último neto")).toBeInTheDocument();
  });

  it("con year=all muestra todos los recibos y ofrece el filtro de Año", async () => {
    renderWithProviders(<PayslipsPage />, { route: "/sueldo?year=all" });
    const table = await screen.findByRole("table");
    expect(within(table).getByText("2025-11")).toBeInTheDocument();
    expect(within(table).getByText("2026-03")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /año/i })).toHaveTextContent("Todos");
    expect(screen.queryByRole("group", { name: /filtrar gráficos por año/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/inflationStats.test.ts client/src/pages/PayslipsPage.test.tsx`
Expected: FAIL — `accumulatedInflation` todavía recibe `(inflation, year, years)` y la página no tiene combobox "Año" (todavía usa el `ToggleButtonGroup`).

- [ ] **Step 3: Implement**

`client/src/inflationStats.ts`:

```ts
export function accumulatedInflation(
  inflation: InflationRateDTO[],
  years: string[],
): AccumulatedInflationPoint[] {
  const months = inflation
    .filter((entry) => years.includes(entry.periodo.slice(0, 4)))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  let factor = 1;
  return months.map((entry) => {
    factor *= 1 + entry.variacionMensual / 100;
    return { periodo: entry.periodo, acumulado: (factor - 1) * 100 };
  });
}
```

`client/src/components/charts/InflationAccumulatedChart.tsx` — props y llamada:

```tsx
interface InflationAccumulatedChartProps {
  inflation: InflationRateDTO[];
  years: string[];
  monthOnly?: boolean;
}

export const InflationAccumulatedChart = ({ inflation, years, monthOnly = false }: InflationAccumulatedChartProps) => {
  const theme = useTheme();
  const acc = accumulatedInflation(inflation, years);
```

(el resto del componente queda igual)

`client/src/components/PayslipsTable.tsx` — cambiar el import de hooks a `import { usePatchPayslipRate } from "../api/hooks.js";` y el componente exportado a:

```tsx
interface PayslipsTableProps { payslips: PayslipDTO[]; }

export const PayslipsTable = ({ payslips }: PayslipsTableProps) => {
  if (payslips.length === 0) return null;

  const rows = [...payslips].sort(byPeriodo);
```

(el resto queda igual)

`client/src/pages/PayslipsPage.tsx` — archivo completo:

```tsx
import { useMemo } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { usePayslips, useInflation } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { PayslipKpiCards } from "../components/PayslipKpiCards.js";
import { PayslipsTable } from "../components/PayslipsTable.js";
import { PayslipDescuentoKpis } from "../components/PayslipDescuentoKpis.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { PayslipNetoUsdChart } from "../components/charts/PayslipNetoUsdChart.js";
import { PayslipNetoArsChart } from "../components/charts/PayslipNetoArsChart.js";
import { PayslipRealArsChart } from "../components/charts/PayslipRealArsChart.js";
import { InflationAccumulatedChart } from "../components/charts/InflationAccumulatedChart.js";
import { PayslipCompositionChart } from "../components/charts/PayslipCompositionChart.js";
import { PayslipGrossNetChart } from "../components/charts/PayslipGrossNetChart.js";
import { payslipYears } from "../payslipConcepts.js";
import { matchesYears } from "../filters/globalFilters.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";

const CHART_EXCLUDED_PERIODS = ["2023-12"];
const PAYSLIP_FIELDS: FilterField[] = ["year"];

export const PayslipsPage = () => {
  const { data, isLoading } = usePayslips();
  const { data: inflationData } = useInflation();
  const { yearSelection } = useGlobalFilters();
  const inflation = inflationData ?? [];
  const payslips = useMemo(() => data ?? [], [data]);
  const years = useMemo(() => payslipYears(payslips), [payslips]);
  const inYears = useMemo(
    () => payslips.filter((payslip) => matchesYears(payslip.periodo, yearSelection)),
    [payslips, yearSelection],
  );
  const filtered = useMemo(
    () => inYears.filter((payslip) => payslip.tipo === "mensual" && !CHART_EXCLUDED_PERIODS.includes(payslip.periodo)),
    [inYears],
  );
  const scopeYears = yearSelection.kind === "all" ? years : yearSelection.years;
  const monthOnly = yearSelection.kind === "years" && yearSelection.years.length === 1;

  if (isLoading) {
    return (
      <>
        <Typography variant="h4" sx={{ mb: 3 }}>Sueldo</Typography>
        <CircularProgress />
      </>
    );
  }

  if (payslips.length === 0) {
    return (
      <>
        <Typography variant="h4" sx={{ mb: 3 }}>Sueldo</Typography>
        <Typography color="text.secondary">
          Todavía no importaste recibos de sueldo. Subilos desde la página Importar.
        </Typography>
      </>
    );
  }

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Sueldo</Typography>
      <FiltersBar fields={PAYSLIP_FIELDS} yearOptions={years} />

      <PayslipKpiCards />

      <MotionBox
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
      >
        <ChartCard title="Evolución del neto en USD"><PayslipNetoUsdChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Evolución del neto en pesos"><PayslipNetoArsChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Sueldo real (pesos de hoy)"><PayslipRealArsChart payslips={filtered} inflation={inflation} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Inflación acumulada"><InflationAccumulatedChart inflation={inflation} years={scopeYears} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Bruto vs neto por mes"><PayslipGrossNetChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Composición del recibo por mes"><PayslipCompositionChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
      </MotionBox>

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Descuentos acumulados</Typography>
      <PayslipDescuentoKpis payslips={payslips} />

      <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
      <PayslipsTable payslips={inYears} />
    </>
  );
};
```

Antes de pegar, comparar con la versión actual de `PayslipsPage.tsx`: si otra sesión cambió algo (por ejemplo los props de `PayslipKpiCards` o `PayslipDescuentoKpis`), conservar esos cambios y aplicar solo lo de este task (quitar `ToggleButtonGroup`/`selectedYear`/`ALL`, sumar `useGlobalFilters`, `inYears`, `scopeYears`, `monthOnly`, `FiltersBar`, y los props nuevos de `InflationAccumulatedChart` y `PayslipsTable`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/inflationStats.test.ts client/src/pages/PayslipsPage.test.tsx && bun run typecheck`
Expected: PASS; typecheck sin errores (no queda ningún uso de la firma vieja de `accumulatedInflation` ni de `PayslipsTable` sin props).

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/inflationStats.ts client/src/inflationStats.test.ts client/src/components/charts/InflationAccumulatedChart.tsx client/src/components/PayslipsTable.tsx client/src/pages/PayslipsPage.tsx client/src/pages/PayslipsPage.test.tsx
git commit -m "feat(client): Sueldo usa la barra de filtros global con años múltiples" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Contexto filtra sus gráficos por año

**Files:**
- Modify: `client/src/macroSignals.ts` (agregar `macroChartsInYears` y `MacroCharts`)
- Modify: `client/src/macroSignals.test.ts`
- Modify: `client/src/pages/MacroPage.tsx`
- Modify: `client/src/pages/MacroPage.test.tsx`

**Interfaces:**
- Consumes: `matchesYears`, `yearsOf`, `YearSelection` (Task 4); `useGlobalFilters` (Task 5); `FiltersBar`/`FilterField` (Task 6).
- Produces:
  - `interface MacroCharts { dolarReal: DolarReal; tasaReal: TasaRealPoint[]; race: RaceSerie[] }`
  - `macroChartsInYears(view: MacroView, race: RaceSerie[], selection: YearSelection): MacroCharts`

- [ ] **Step 1: Write the failing tests**

`client/src/macroSignals.test.ts` — sumar al import `macroChartsInYears, type MacroView, type RaceSerie` y agregar al final:

```ts
describe("macroChartsInYears", () => {
  const view: MacroView = {
    signals: [],
    verdict: { ranking: [], resumen: "" },
    dolarReal: {
      serie: [{ periodo: "2025-12", indice: 100 }, { periodo: "2026-01", indice: 105 }],
      mediana: 1, indiceHoy: 105, ultimoPeriodoConIpc: "2026-01",
    },
    tasaReal: [{ periodo: "2025-12", tasaReal: 1 }, { periodo: "2026-01", tasaReal: 2 }],
  };
  const race: RaceSerie[] = [
    { id: "UVA", data: [{ x: "2025-12", y: 100 }, { x: "2026-01", y: 102 }] },
    { id: "Dólar oficial", data: [{ x: "2025-12", y: 100 }] },
  ];

  it("recorta las tres series a los años elegidos sin re-basar", () => {
    const charts = macroChartsInYears(view, race, { kind: "years", years: ["2026"] });
    expect(charts.dolarReal.serie).toEqual([{ periodo: "2026-01", indice: 105 }]);
    expect(charts.dolarReal.mediana).toBe(1);
    expect(charts.tasaReal).toEqual([{ periodo: "2026-01", tasaReal: 2 }]);
    expect(charts.race).toEqual([{ id: "UVA", data: [{ x: "2026-01", y: 102 }] }]);
  });

  it("con todos devuelve las series completas", () => {
    const charts = macroChartsInYears(view, race, { kind: "all" });
    expect(charts.dolarReal.serie).toHaveLength(2);
    expect(charts.tasaReal).toHaveLength(2);
    expect(charts.race).toHaveLength(2);
  });
});
```

`client/src/pages/MacroPage.test.tsx`:
- En los dos tests existentes, cambiar `{ route: "/contexto" }` por `{ route: "/contexto?year=all" }`.
- Agregar `import userEvent from "@testing-library/user-event";` y `within` al import de testing-library, y el test:

```ts
  it("ofrece el filtro de Año con los años de las series", async () => {
    renderWithProviders(<MacroPage />, { route: "/contexto?year=all" });
    await userEvent.click(await screen.findByRole("combobox", { name: /año/i }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "2025" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "2026" })).toBeInTheDocument();
    expect(screen.getByText("Veredicto del mes")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/macroSignals.test.ts client/src/pages/MacroPage.test.tsx`
Expected: FAIL — `macroChartsInYears` no existe y no hay combobox "Año".

- [ ] **Step 3: Implement**

`client/src/macroSignals.ts` — agregar el import y, al final del archivo:

```ts
import { matchesYears, type YearSelection } from "./filters/globalFilters.js";
```

```ts
export interface MacroCharts {
  dolarReal: DolarReal;
  tasaReal: TasaRealPoint[];
  race: RaceSerie[];
}

export function macroChartsInYears(view: MacroView, race: RaceSerie[], selection: YearSelection): MacroCharts {
  const inYears = (periodo: string): boolean => matchesYears(periodo, selection);
  return {
    dolarReal: { ...view.dolarReal, serie: view.dolarReal.serie.filter((point) => inYears(point.periodo)) },
    tasaReal: view.tasaReal.filter((point) => inYears(point.periodo)),
    race: race
      .map((serie) => ({ ...serie, data: serie.data.filter((point) => inYears(point.x)) }))
      .filter((serie) => serie.data.length > 0),
  };
}
```

`client/src/pages/MacroPage.tsx`:
- Imports:

```tsx
import { buildMacroView, defaultAssumptions, macroChartsInYears, raceSeries, type MacroAssumptions } from "../macroSignals.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { yearsOf } from "../filters/globalFilters.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
```

- Módulo: `const MACRO_FIELDS: FilterField[] = ["year"];`
- En el componente, después de `const race = useMemo(...)` y **antes** de los early returns:

```tsx
  const { yearSelection } = useGlobalFilters();
  const yearOptions = useMemo(() => (series ? yearsOf(series.meses.map((mes) => mes.periodo)) : []), [series]);
  const charts = useMemo(
    () => (view ? macroChartsInYears(view, race, yearSelection) : null),
    [view, race, yearSelection],
  );
```

- Ampliar la guarda de "sin series": `if (!series || series.meses.length === 0 || !view || !assumptions || !charts) {`
- En el return final:

```tsx
  return (
    <>
      <Title />
      <FiltersBar fields={MACRO_FIELDS} yearOptions={yearOptions} />
      <VerdictCard verdict={view.verdict} />
      <MacroAssumptionsBar assumptions={assumptions} onChange={setOverride} />
      <MacroSignalCards signals={view.signals} />
      <MotionBox
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
      >
        <ChartCard title="Dólar real vs su promedio desde 2025"><DolarRealChart dolarReal={charts.dolarReal} /></ChartCard>
        <ChartCard title="Carrera: UVA vs dólar vs inflación"><MacroRaceChart series={charts.race} /></ChartCard>
        <ChartCard title="Tasa real en pesos, mes a mes"><TasaRealChart points={charts.tasaReal} /></ChartCard>
      </MotionBox>
    </>
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/macroSignals.test.ts client/src/pages/MacroPage.test.tsx && bun run typecheck`
Expected: PASS; typecheck sin errores.

- [ ] **Step 5: Commit** (solo con pedido explícito)

```bash
git add client/src/macroSignals.ts client/src/macroSignals.test.ts client/src/pages/MacroPage.tsx client/src/pages/MacroPage.test.tsx
git commit -m "feat(client): Contexto filtra sus gráficos por año" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verificación final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite completa y typecheck**

Run: `bun run test && bun run typecheck`
Expected: todos los tests en verde y typecheck sin errores. Si falla algo que no es de este plan (archivos de otras sesiones), reportarlo tal cual sin "arreglarlo".

- [ ] **Step 2: Buscar restos de la API vieja**

Run: `grep -rn "showMonth\|showCategory\|selectedYear\|ToggleButtonGroup" client/src --include=*.tsx`
Expected: sin resultados en `FiltersBar`, páginas ni `PayslipsPage`.

- [ ] **Step 3: Prueba manual en la app**

Levantar la app (skill `run`, o `bun run dev`) y recorrer:
1. Dashboard sin params → el Año muestra el año actual; Moneda ARS; Tarjeta Todas.
2. Elegir 2025 + 2026 y USD → los gráficos se actualizan; la URL tiene `year=2025&year=2026&currency=USD`.
3. Elegir un Mes de 2025.
4. Ir a Créditos por el sidebar → la barra muestra solo Año con 2025, 2026; gráficos y detalle filtrados; KPIs iguales que con "Todos".
5. En Créditos, sacar 2025 → volver al Dashboard → el Mes de 2025 ya no está elegido.
6. Ir a Sueldo, dejar un solo año → el eje de los gráficos muestra "Ene, Feb…".
7. Ir a Cuotas, elegir 2026 + 2027 → aparecen los vencimientos de ambos años; el KPI coincide con la suma del acordeón.
8. Ir a Movimientos, elegir una categoría, volver al Dashboard por el sidebar → conserva año/moneda, no arrastra la categoría.
9. F5 en cualquier sección → la selección se mantiene.
10. Ancho de celular (≈375px) → la barra hace wrap sin scroll horizontal.

- [ ] **Step 4: Reportar**

Resumir al usuario qué pasó en cada paso (con los fallos tal cual, si los hubo) y recordar que los cambios quedaron sin commitear salvo que haya pedido commits.
