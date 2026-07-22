# Gasto por categoría del último resumen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second pie chart to the Dashboard, "Gasto por categoría (último resumen)", that aggregates spending by category using only the most recent statement of each card.

**Architecture:** A new server endpoint `GET /api/stats/last-statement/by-category` picks the latest statement per issuer (pure, testable helper) and runs the same category aggregation as `/by-category` restricted to those statements. The frontend extracts the existing nivo pie markup into a shared presentational `CategoryPie`, then adds a `LastStatementCategoryChart` that feeds it from a new `useByCategoryLastStatement` hook.

**Tech Stack:** TypeScript, Node/Express + Mongoose (server), React + MUI + `@nivo/pie` + TanStack Query (client), Vitest + Supertest + Testing Library (tests).

## Global Constraints

- TypeScript everywhere; `any` is forbidden — type all props, params, and returns.
- No code comments (no `//`, block, or JSDoc) — self-explanatory names only.
- React components: functional, props destructured in the signature, `<>` fragments over wrapper divs.
- Reuse existing shared types (`CategoryStat`, `Currency`, `StatFilters`) — do not redefine.
- Currency defaults to `"ARS"` when absent (matches every other stats endpoint/hook).
- Endpoint path is `/api/stats/last-statement/by-category` (router mounted at `/api/stats`).
- Run a single test file with `npx vitest run <path>`; typecheck with `npm run typecheck`.
- Do not create git commits unless the user asks in the moment; the commit steps below are the standard TDD cadence to follow at execution time per the user's preference.

---

## File Structure

- Create `server/src/stats/lastStatement.ts` — pure helper `latestStatementIdsPerIssuer`.
- Create `server/src/stats/lastStatement.test.ts` — unit tests for the helper.
- Modify `server/src/http/routes/stats.ts` — add the `/last-statement/by-category` route.
- Modify `server/src/http/routes/stats.test.ts` — integration tests for the route.
- Create `client/src/components/charts/CategoryPie.tsx` — presentational pie (shared).
- Create `client/src/components/charts/CategoryPie.test.tsx` — empty/non-empty rendering.
- Modify `client/src/components/charts/CategoryBreakdownChart.tsx` — use `CategoryPie`.
- Modify `client/src/api/hooks.ts` — add `useByCategoryLastStatement`.
- Create `client/src/components/charts/LastStatementCategoryChart.tsx` — new chart.
- Modify `client/src/pages/DashboardPage.tsx` — add the new `ChartCard`.
- Modify `client/src/pages/DashboardPage.test.tsx` — route stub + title assertions.

---

## Task 1: Pure helper `latestStatementIdsPerIssuer`

**Files:**
- Create: `server/src/stats/lastStatement.ts`
- Test: `server/src/stats/lastStatement.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `latestStatementIdsPerIssuer<Id>(statements: StatementRecency<Id>[]): Id[]` and `interface StatementRecency<Id> { id: Id; issuer: string; closingDate: Date | null; uploadedAt: Date; }`. Picks one id per issuer: max `closingDate` (a real date beats `null`), tie broken by max `uploadedAt`.

- [ ] **Step 1: Write the failing test**

Create `server/src/stats/lastStatement.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { latestStatementIdsPerIssuer } from "./lastStatement.js";

const d = (s: string) => new Date(s);

describe("latestStatementIdsPerIssuer", () => {
  it("elige el resumen con closingDate más reciente por issuer", () => {
    const ids = latestStatementIdsPerIssuer([
      { id: "a", issuer: "icbc", closingDate: d("2026-05-02"), uploadedAt: d("2026-05-03") },
      { id: "b", issuer: "icbc", closingDate: d("2026-07-02"), uploadedAt: d("2026-07-03") },
      { id: "c", issuer: "visa_signature", closingDate: d("2026-06-02"), uploadedAt: d("2026-06-03") },
    ]);
    expect([...ids].sort()).toEqual(["b", "c"]);
  });

  it("desempata por uploadedAt cuando closingDate es nulo", () => {
    const ids = latestStatementIdsPerIssuer([
      { id: "old", issuer: "icbc", closingDate: null, uploadedAt: d("2026-05-01") },
      { id: "new", issuer: "icbc", closingDate: null, uploadedAt: d("2026-07-01") },
    ]);
    expect(ids).toEqual(["new"]);
  });

  it("prefiere un resumen con closingDate sobre uno sin fecha", () => {
    const ids = latestStatementIdsPerIssuer([
      { id: "dated", issuer: "icbc", closingDate: d("2026-01-01"), uploadedAt: d("2026-01-02") },
      { id: "undated", issuer: "icbc", closingDate: null, uploadedAt: d("2026-09-01") },
    ]);
    expect(ids).toEqual(["dated"]);
  });

  it("devuelve lista vacía sin resúmenes", () => {
    expect(latestStatementIdsPerIssuer([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/src/stats/lastStatement.test.ts`
Expected: FAIL — cannot resolve `./lastStatement.js` / `latestStatementIdsPerIssuer` is not defined.

- [ ] **Step 3: Write minimal implementation**

Create `server/src/stats/lastStatement.ts`:

```ts
export interface StatementRecency<Id> {
  id: Id;
  issuer: string;
  closingDate: Date | null;
  uploadedAt: Date;
}

const closingTime = (closingDate: Date | null): number =>
  closingDate ? closingDate.getTime() : Number.NEGATIVE_INFINITY;

const isMoreRecent = <Id>(candidate: StatementRecency<Id>, current: StatementRecency<Id>): boolean => {
  const candidateClosing = closingTime(candidate.closingDate);
  const currentClosing = closingTime(current.closingDate);
  if (candidateClosing !== currentClosing) return candidateClosing > currentClosing;
  return candidate.uploadedAt.getTime() > current.uploadedAt.getTime();
};

export const latestStatementIdsPerIssuer = <Id>(statements: StatementRecency<Id>[]): Id[] => {
  const latestByIssuer = new Map<string, StatementRecency<Id>>();
  for (const statement of statements) {
    const current = latestByIssuer.get(statement.issuer);
    if (!current || isMoreRecent(statement, current)) latestByIssuer.set(statement.issuer, statement);
  }
  return [...latestByIssuer.values()].map((statement) => statement.id);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/src/stats/lastStatement.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/lastStatement.ts server/src/stats/lastStatement.test.ts
git commit -m "feat(server): add latestStatementIdsPerIssuer helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Endpoint `GET /api/stats/last-statement/by-category`

**Files:**
- Modify: `server/src/http/routes/stats.ts`
- Test: `server/src/http/routes/stats.test.ts`

**Interfaces:**
- Consumes: `latestStatementIdsPerIssuer` from Task 1; `StatementModel`, `TransactionModel`, `StatementDoc` from `../../db/models.js`.
- Produces: route responding with `CategoryStat[]` (`{ category, total, count }`), sorted by `total` desc. Filters statements by `cardLabel` (if present), aggregates `type: "purchase"` transactions of the latest statement per issuer matching `currency` (default `"ARS"`). Ignores `from`/`to`. Returns `[]` when there are no statements.

- [ ] **Step 1: Write the failing tests**

In `server/src/http/routes/stats.test.ts`, add these two tests inside the `describe("stats", ...)` block (after the existing `by-category filtra por cardLabel` test):

```ts
  it("last-statement/by-category agrega solo el último resumen de cada issuer", async () => {
    const oldIcbc = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-05-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "old.pdf", sourceHash: "hold", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: oldIcbc._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-04-04"),
      descriptionRaw: "OLD", merchant: "OLD", category: "Viejo", categorySource: "rule", amount: 777, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: "10", fingerprint: "f10",
    });
    const res = await request(app).get("/api/stats/last-statement/by-category?currency=ARS");
    expect(res.body.some((c: { category: string }) => c.category === "Viejo")).toBe(false);
    const compras = res.body.find((c: { category: string }) => c.category === "Compras");
    expect(compras.total).toBe(1500);
  });

  it("last-statement/by-category respeta cardLabel y currency", async () => {
    const visa = await StatementModel.create({
      issuer: "visa_signature", cardLabel: "VISA1", last4: null, closingDate: new Date("2026-07-05"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "v.pdf", sourceHash: "hv", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.insertMany([
      { statementId: visa._id, issuer: "visa_signature", cardLabel: "VISA1", date: new Date("2026-06-04"),
        descriptionRaw: "V", merchant: "V", category: "VisaCat", categorySource: "rule", amount: 300, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: "20", fingerprint: "f20" },
      { statementId: visa._id, issuer: "visa_signature", cardLabel: "VISA1", date: new Date("2026-06-05"),
        descriptionRaw: "U", merchant: "U", category: "Dolar", categorySource: "rule", amount: 40, currency: "USD",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: "21", fingerprint: "f21" },
    ]);
    const arsAll = await request(app).get("/api/stats/last-statement/by-category?currency=ARS");
    expect(arsAll.body.map((c: { category: string }) => c.category).sort()).toEqual(["Compras", "Transporte", "VisaCat"]);

    const onlyVisa = await request(app).get("/api/stats/last-statement/by-category?currency=ARS&cardLabel=VISA1");
    expect(onlyVisa.body).toEqual([{ category: "VisaCat", total: 300, count: 1 }]);

    const usd = await request(app).get("/api/stats/last-statement/by-category?currency=USD");
    expect(usd.body).toEqual([{ category: "Dolar", total: 40, count: 1 }]);
  });
```

Context for the numbers: the file's `beforeEach` already creates an ICBC statement (closing `2026-07-02`) with purchases `Compras` 1500 and `Transporte` 500 (ARS) plus one excluded `payment`. The older ICBC statement above must be excluded; the Visa statement (closing `2026-07-05`) adds `VisaCat` 300 (ARS) and `Dolar` 40 (USD).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/http/routes/stats.test.ts`
Expected: FAIL — the two new tests get `{}`/404-style empty body (route not defined), e.g. `res.body.some is not a function` or `compras` undefined.

- [ ] **Step 3: Add the import**

In `server/src/http/routes/stats.ts`, add after the existing imports (near line 8):

```ts
import { latestStatementIdsPerIssuer } from "../../stats/lastStatement.js";
```

- [ ] **Step 4: Add the route**

In `server/src/http/routes/stats.ts`, add this route immediately after the existing `statsRouter.get("/by-category", ...)` handler:

```ts
statsRouter.get("/last-statement/by-category", asyncHandler(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const currency = q.currency === "USD" ? "USD" : "ARS";
  const filter: FilterQuery<StatementDoc> = {};
  if (typeof q.cardLabel === "string") filter.cardLabel = q.cardLabel;
  const statements = await StatementModel.find(filter).lean();
  const ids = latestStatementIdsPerIssuer(
    statements.map((s) => ({
      id: s._id,
      issuer: s.issuer,
      closingDate: s.closingDate ?? null,
      uploadedAt: (s as unknown as { uploadedAt: Date }).uploadedAt,
    })),
  );
  if (ids.length === 0) {
    res.json([]);
    return;
  }
  const rows = await TransactionModel.aggregate([
    { $match: { type: "purchase", currency, statementId: { $in: ids } } },
    { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, category: "$_id", total: 1, count: 1 } },
    { $sort: { total: -1 } },
  ]);
  res.json(rows);
}));
```

Note: `uploadedAt` is a Mongoose timestamp not present on `StatementDoc` (`InferSchemaType`), so it is cast exactly as `server/src/http/mappers.ts` already does. `s._id` is a real `ObjectId`, so `$in: ids` matches `statementId` without manual casting.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/src/http/routes/stats.test.ts`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 6: Commit**

```bash
git add server/src/http/routes/stats.ts server/src/http/routes/stats.test.ts
git commit -m "feat(server): add last-statement by-category stats endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Extract shared `CategoryPie` and refactor `CategoryBreakdownChart`

**Files:**
- Create: `client/src/components/charts/CategoryPie.tsx`
- Test: `client/src/components/charts/CategoryPie.test.tsx`
- Modify: `client/src/components/charts/CategoryBreakdownChart.tsx`

**Interfaces:**
- Consumes: `CategoryStat`, `Currency` from `@ledgerly/shared`; `formatMoney`, `categoricalPalette`, `nivoTheme`.
- Produces: `CategoryPie` — `const CategoryPie = ({ data, currency }: { data: CategoryStat[] | undefined; currency: Currency }) => ...`. Renders `<Typography>Sin datos</Typography>` when `data` is empty/undefined, otherwise the nivo donut. Task 4 also consumes it.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/charts/CategoryPie.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { CategoryPie } from "./CategoryPie.js";

describe("CategoryPie", () => {
  it("muestra 'Sin datos' cuando no hay categorías", () => {
    renderWithProviders(<CategoryPie data={[]} currency="ARS" />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
  });

  it("no muestra 'Sin datos' cuando hay categorías", () => {
    renderWithProviders(<CategoryPie data={[{ category: "Compras", total: 1500, count: 1 }]} currency="ARS" />);
    expect(screen.queryByText("Sin datos")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/components/charts/CategoryPie.test.tsx`
Expected: FAIL — cannot resolve `./CategoryPie.js`.

- [ ] **Step 3: Create `CategoryPie`**

Create `client/src/components/charts/CategoryPie.tsx`:

```tsx
import { ResponsivePie } from "@nivo/pie";
import { Box, Typography, useTheme } from "@mui/material";
import type { CategoryStat, Currency } from "@ledgerly/shared";
import { formatMoney } from "../../format.js";
import { categoricalPalette } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

interface CategoryPieProps {
  data: CategoryStat[] | undefined;
  currency: Currency;
}

export const CategoryPie = ({ data, currency }: CategoryPieProps) => {
  const theme = useTheme();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const chartData = data.map((d) => ({ id: d.category, label: d.category, value: d.total }));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsivePie
        data={chartData}
        theme={nivoTheme(theme)}
        colors={categoricalPalette(theme.palette.mode)}
        margin={{ top: 16, right: 150, bottom: 16, left: 16 }}
        innerRadius={0.6}
        padAngle={1.2}
        cornerRadius={4}
        activeOuterRadiusOffset={8}
        borderWidth={1}
        borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        valueFormat={(value) => formatMoney(value, currency)}
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

- [ ] **Step 4: Refactor `CategoryBreakdownChart` to use it**

Replace the entire contents of `client/src/components/charts/CategoryBreakdownChart.tsx` with:

```tsx
import { useByCategory, type StatFilters } from "../../api/hooks.js";
import { CategoryPie } from "./CategoryPie.js";

export const CategoryBreakdownChart = (filters: StatFilters) => {
  const { data } = useByCategory(filters);
  return <CategoryPie data={data} currency={filters.currency} />;
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run client/src/components/charts/CategoryPie.test.tsx client/src/pages/DashboardPage.test.tsx`
Expected: PASS — `CategoryPie` tests pass and the existing `DashboardPage` test still passes (behavior of `CategoryBreakdownChart` is unchanged).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/charts/CategoryPie.tsx client/src/components/charts/CategoryPie.test.tsx client/src/components/charts/CategoryBreakdownChart.tsx
git commit -m "refactor(client): extract CategoryPie presentational component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `useByCategoryLastStatement` hook, `LastStatementCategoryChart`, and Dashboard wiring

**Files:**
- Modify: `client/src/api/hooks.ts`
- Create: `client/src/components/charts/LastStatementCategoryChart.tsx`
- Modify: `client/src/pages/DashboardPage.tsx`
- Modify: `client/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `CategoryPie` (Task 3); `apiFetch`, `qs`, `StatFilters` (existing in `hooks.ts`); `CategoryStat` from `@ledgerly/shared`; `ChartCard` (existing).
- Produces: `useByCategoryLastStatement(f: StatFilters)` → React Query hook returning `CategoryStat[]`, calling `/stats/last-statement/by-category` with only `currency` and `cardLabel`. `LastStatementCategoryChart` — `const LastStatementCategoryChart = (filters: StatFilters) => ...`.

- [ ] **Step 1: Write the failing test**

In `client/src/pages/DashboardPage.test.tsx`, make two edits.

First, add a route stub inside `route()` immediately above the existing `if (url.includes("/stats/by-category"))` line:

```ts
  if (url.includes("/stats/last-statement/by-category")) return [{ category: "Restaurantes", total: 900, count: 2 }];
```

Second, in the `"muestra KPIs con el total gastado"` test, replace this line:

```ts
    expect(screen.getByText(/gasto por categoría/i)).toBeInTheDocument();
```

with:

```ts
    expect(screen.getByText("Gasto por categoría")).toBeInTheDocument();
    expect(screen.getByText("Gasto por categoría (último resumen)")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/pages/DashboardPage.test.tsx`
Expected: FAIL — `getByText("Gasto por categoría (último resumen)")` finds no element (the card does not exist yet).

- [ ] **Step 3: Add the hook**

In `client/src/api/hooks.ts`, add immediately after the `useByCategory` function:

```ts
export function useByCategoryLastStatement(f: StatFilters) {
  return useQuery({
    queryKey: ["by-category-last-statement", f.currency, f.cardLabel],
    queryFn: () => apiFetch<CategoryStat[]>(`/stats/last-statement/by-category${qs({ currency: f.currency, cardLabel: f.cardLabel })}`),
  });
}
```

- [ ] **Step 4: Create the chart**

Create `client/src/components/charts/LastStatementCategoryChart.tsx`:

```tsx
import { useByCategoryLastStatement, type StatFilters } from "../../api/hooks.js";
import { CategoryPie } from "./CategoryPie.js";

export const LastStatementCategoryChart = (filters: StatFilters) => {
  const { data } = useByCategoryLastStatement(filters);
  return <CategoryPie data={data} currency={filters.currency} />;
};
```

- [ ] **Step 5: Wire it into the Dashboard**

In `client/src/pages/DashboardPage.tsx`, add the import alongside the other chart imports:

```tsx
import { LastStatementCategoryChart } from "../components/charts/LastStatementCategoryChart.js";
```

Then add the new `ChartCard` immediately after the existing "Gasto por categoría" card:

```tsx
        <ChartCard title="Gasto por categoría"><CategoryBreakdownChart {...filters} /></ChartCard>
        <ChartCard title="Gasto por categoría (último resumen)"><LastStatementCategoryChart {...filters} /></ChartCard>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run client/src/pages/DashboardPage.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full verification**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; entire suite green.

- [ ] **Step 8: Commit**

```bash
git add client/src/api/hooks.ts client/src/components/charts/LastStatementCategoryChart.tsx client/src/pages/DashboardPage.tsx client/src/pages/DashboardPage.test.tsx
git commit -m "feat(client): add último-resumen category pie to dashboard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- "Alcance: último resumen por issuer" → Task 1 (helper) + Task 2 (route wiring). ✓
- "Respeta currency y cardLabel; ignora from/to" → Task 2 route (only reads `currency`/`cardLabel`) + Task 4 hook (only sends `currency`/`cardLabel`). ✓
- "Sin datos" → `CategoryPie` empty branch (Task 3), covered by test. ✓
- Backend helper puro + endpoint → Tasks 1–2. ✓
- Refactor `CategoryPie` + `CategoryBreakdownChart` → Task 3. ✓
- `LastStatementCategoryChart` + hook + DashboardPage card → Task 4. ✓
- Tests: helper unit, endpoint integration, client empty/non-empty + regression → Tasks 1–4. ✓
- Out of scope (caption con fechas, elegir resumen puntual) → not implemented, correct. ✓

**Placeholder scan:** No TBD/TODO; every code and command step is concrete.

**Type consistency:** `latestStatementIdsPerIssuer<Id>` / `StatementRecency<Id>` used identically in Task 1 and Task 2. `CategoryPie` props (`data: CategoryStat[] | undefined`, `currency: Currency`) match usage in Tasks 3 and 4. Endpoint path `/stats/last-statement/by-category` identical in route, server tests, hook, and Dashboard test stub. Hook name `useByCategoryLastStatement` consistent between Task 4 hook and chart.
