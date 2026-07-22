# Torta por categoría + KPI de cuotas pendientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a category pie of pending installments and a total-pending KPI to the "Cuotas a vencer" page.

**Architecture:** A pure `pendingInstallmentsByCategory` aggregates the future-installments detail into `CategoryStat[]`; a new `PendingInstallmentsByCategoryChart` feeds it to the shared `CategoryPie` donut. The `Kpi` card is extracted from `KpiCards.tsx` and reused on `InstallmentsPage` for the total. All data comes from `useFutureInstallmentsDetail`, already loaded by the page.

**Tech Stack:** TypeScript, React + MUI + `@nivo/pie` (client), Vitest + Testing Library (tests).

## Global Constraints

- TypeScript everywhere; `any` is forbidden.
- No code comments (no `//`, block, or JSDoc) — self-explanatory names only.
- React components: functional, props destructured in the signature, `<>` fragments over wrapper divs.
- Reuse existing shared types (`CategoryStat`, `FutureInstallmentMonth`) and existing components (`CategoryPie`, `Kpi`, `ChartCard`).
- Data source: `useFutureInstallmentsDetail(filters)`; respects `currency` and `cardLabel`.
- Run a single test file with `npx vitest run <path>`; typecheck with `npm run typecheck`.
- Commit per task using the exact `git add` paths listed; do not push.

---

## File Structure

- Create `client/src/components/charts/pendingInstallmentsByCategory.ts` — pure aggregation.
- Create `client/src/components/charts/pendingInstallmentsByCategory.test.ts` — unit tests.
- Create `client/src/components/Kpi.tsx` — extracted presentational KPI card.
- Modify `client/src/components/KpiCards.tsx` — import `Kpi` from the new file.
- Create `client/src/components/charts/PendingInstallmentsByCategoryChart.tsx` — new chart.
- Modify `client/src/pages/InstallmentsPage.tsx` — add KPI + chart card.
- Create `client/src/pages/InstallmentsPage.test.tsx` — KPI + chart render.

---

## Task 1: Pure `pendingInstallmentsByCategory`

**Files:**
- Create: `client/src/components/charts/pendingInstallmentsByCategory.ts`
- Test: `client/src/components/charts/pendingInstallmentsByCategory.test.ts`

**Interfaces:**
- Consumes: `FutureInstallmentMonth`, `CategoryStat` from `@ledgerly/shared`.
- Produces: `pendingInstallmentsByCategory(months: FutureInstallmentMonth[]): CategoryStat[]` — sums `item.amount` and counts items per `item.category`, sorted by `total` desc.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/charts/pendingInstallmentsByCategory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pendingInstallmentsByCategory } from "./pendingInstallmentsByCategory.js";

const item = (category: string, amount: number) => ({
  merchant: "M", category, amount, installmentNumber: 2, installmentTotal: 4, purchaseDate: "2026-05-04",
});

describe("pendingInstallmentsByCategory", () => {
  it("agrega ítems por categoría (suma montos, cuenta ítems) ordenado desc", () => {
    const res = pendingInstallmentsByCategory([
      { month: "2026-06", total: 300, count: 2, items: [item("Compras", 100), item("Transporte", 200)] },
      { month: "2026-07", total: 250, count: 2, items: [item("Compras", 50), item("Transporte", 200)] },
    ]);
    expect(res).toEqual([
      { category: "Transporte", total: 400, count: 2 },
      { category: "Compras", total: 150, count: 2 },
    ]);
  });

  it("lista vacía ⇒ []", () => {
    expect(pendingInstallmentsByCategory([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/components/charts/pendingInstallmentsByCategory.test.ts`
Expected: FAIL — cannot resolve `./pendingInstallmentsByCategory.js`.

- [ ] **Step 3: Write the implementation**

Create `client/src/components/charts/pendingInstallmentsByCategory.ts`:

```ts
import type { CategoryStat, FutureInstallmentMonth } from "@ledgerly/shared";

export function pendingInstallmentsByCategory(months: FutureInstallmentMonth[]): CategoryStat[] {
  const totals = new Map<string, { total: number; count: number }>();
  for (const month of months) {
    for (const item of month.items) {
      const current = totals.get(item.category) ?? { total: 0, count: 0 };
      current.total += item.amount;
      current.count += 1;
      totals.set(item.category, current);
    }
  }
  return [...totals.entries()]
    .map(([category, { total, count }]) => ({ category, total, count }))
    .sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/components/charts/pendingInstallmentsByCategory.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/charts/pendingInstallmentsByCategory.ts client/src/components/charts/pendingInstallmentsByCategory.test.ts
git commit -m "feat(client): add pendingInstallmentsByCategory aggregation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Extract the `Kpi` presentational component

**Files:**
- Create: `client/src/components/Kpi.tsx`
- Modify: `client/src/components/KpiCards.tsx`

**Interfaces:**
- Produces: `Kpi` component and `KpiColor` type exported from `client/src/components/Kpi.tsx`. Props: `{ label: string; value: number; format: (value: number) => string; sub?: string; icon: ReactNode; color: KpiColor }`.
- Consumes: `KpiCards` imports `Kpi` from `./Kpi.js` (behavior unchanged).

- [ ] **Step 1: Create `Kpi.tsx`**

Create `client/src/components/Kpi.tsx`:

```tsx
import type { ReactNode } from "react";
import { Card, CardContent, Box, Typography } from "@mui/material";
import { MotionBox } from "./motion/motion.js";
import { CountUp } from "./motion/CountUp.js";
import { fadeUpItem } from "./motion/variants.js";

export type KpiColor = "primary" | "secondary" | "success" | "warning";

interface KpiProps {
  label: string;
  value: number;
  format: (value: number) => string;
  sub?: string;
  icon: ReactNode;
  color: KpiColor;
}

export const Kpi = ({ label, value, format, sub, icon, color }: KpiProps) => (
  <MotionBox variants={fadeUpItem}>
    <Card>
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box
          sx={{
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: 2.5,
            display: "grid",
            placeItems: "center",
            color: `${color}.main`,
            bgcolor: (theme) => `${theme.palette[color].main}1f`,
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
```

- [ ] **Step 2: Update `KpiCards.tsx` imports**

In `client/src/components/KpiCards.tsx`, replace the entire import block:

```tsx
import type { ReactNode } from "react";
import { Card, CardContent, Box, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import DescriptionIcon from "@mui/icons-material/Description";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { useSummary, useOficialRate, type StatFilters } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { MotionBox } from "./motion/motion.js";
import { CountUp } from "./motion/CountUp.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";
```

with:

```tsx
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import DescriptionIcon from "@mui/icons-material/Description";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { useSummary, useOficialRate, type StatFilters } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { MotionBox } from "./motion/motion.js";
import { staggerContainer } from "./motion/variants.js";
import { Kpi } from "./Kpi.js";
```

- [ ] **Step 3: Remove the inlined `Kpi` from `KpiCards.tsx`**

In `client/src/components/KpiCards.tsx`, delete the `KpiColor` type, the `KpiProps` interface, and the `Kpi` component definition (everything from `type KpiColor = ...` through the `Kpi` component's closing `);`, leaving `export const KpiCards = ...` intact):

```tsx
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
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: 2.5,
            display: "grid",
            placeItems: "center",
            color: `${color}.main`,
            bgcolor: (theme) => `${theme.palette[color].main}1f`,
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

```

- [ ] **Step 4: Verify the extraction is behavior-preserving**

Run: `npm run typecheck && npx vitest run client/src/pages/DashboardPage.test.tsx`
Expected: typecheck clean (no unused imports); DashboardPage test passes (KPIs still render).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Kpi.tsx client/src/components/KpiCards.tsx
git commit -m "refactor(client): extract Kpi presentational component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: New chart + KPI wired into InstallmentsPage

**Files:**
- Create: `client/src/components/charts/PendingInstallmentsByCategoryChart.tsx`
- Modify: `client/src/pages/InstallmentsPage.tsx`
- Test: `client/src/pages/InstallmentsPage.test.tsx`

**Interfaces:**
- Consumes: `pendingInstallmentsByCategory` (Task 1), `Kpi` (Task 2), `CategoryPie`, `useFutureInstallmentsDetail` (all existing).
- Produces: `PendingInstallmentsByCategoryChart` — `const PendingInstallmentsByCategoryChart = (filters: StatFilters) => ...`.

- [ ] **Step 1: Write the failing test**

Create `client/src/pages/InstallmentsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { InstallmentsPage } from "./InstallmentsPage.js";

const item = (n: number) => ({
  merchant: "MERCADOLIBRE", category: "Compras", amount: 1500,
  installmentNumber: n, installmentTotal: 4, purchaseDate: "2026-05-04",
});
const detail = [
  { month: "2026-06", total: 1500, count: 1, items: [item(3)] },
  { month: "2026-07", total: 1500, count: 1, items: [item(4)] },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/stats/future-installments/detail") ? detail
      : url.includes("/stats/future-installments") ? [{ month: "2026-06", total: 1500 }, { month: "2026-07", total: 1500 }]
      : url.includes("/transactions/categories") ? []
      : url.includes("/statements") ? []
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("InstallmentsPage", () => {
  it("muestra el KPI de cuotas pendientes y la torta por categoría", async () => {
    renderWithProviders(<InstallmentsPage />, { route: "/installments" });
    expect(await screen.findByText("Cuotas pendientes")).toBeInTheDocument();
    expect(screen.getByText("Cuotas pendientes por categoría")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/pages/InstallmentsPage.test.tsx`
Expected: FAIL — neither "Cuotas pendientes" (KPI) nor "Cuotas pendientes por categoría" (chart card) exists yet.

- [ ] **Step 3: Create the chart component**

Create `client/src/components/charts/PendingInstallmentsByCategoryChart.tsx`:

```tsx
import { useFutureInstallmentsDetail, type StatFilters } from "../../api/hooks.js";
import { CategoryPie } from "./CategoryPie.js";
import { pendingInstallmentsByCategory } from "./pendingInstallmentsByCategory.js";

export const PendingInstallmentsByCategoryChart = (filters: StatFilters) => {
  const { data } = useFutureInstallmentsDetail(filters);
  return <CategoryPie data={data ? pendingInstallmentsByCategory(data) : undefined} currency={filters.currency} />;
};
```

- [ ] **Step 4: Add the imports to `InstallmentsPage.tsx`**

In `client/src/pages/InstallmentsPage.tsx`, add after the existing chart imports:

```tsx
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { Kpi } from "../components/Kpi.js";
import { PendingInstallmentsByCategoryChart } from "../components/charts/PendingInstallmentsByCategoryChart.js";
```

- [ ] **Step 5: Add the `money` formatter**

In `client/src/pages/InstallmentsPage.tsx`, add this line right after the `const mesesLabel = ...` line:

```tsx
  const money = (value: number) => formatMoney(value, filters.currency);
```

- [ ] **Step 6: Add the KPI above the charts grid**

In `client/src/pages/InstallmentsPage.tsx`, replace the opening of the results block:

```tsx
      {!isLoading && months.length > 0 && (
        <>
          <MotionBox
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
          >
            <ChartCard title="Total por mes"><FutureInstallmentsChart {...filters} /></ChartCard>
```

with:

```tsx
      {!isLoading && months.length > 0 && (
        <>
          <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={{ mb: 3, maxWidth: { sm: 320 } }}>
            <Kpi label="Cuotas pendientes" value={totalFuturo} format={money} icon={<CreditCardIcon />} color="warning" />
          </MotionBox>
          <MotionBox
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
          >
            <ChartCard title="Total por mes"><FutureInstallmentsChart {...filters} /></ChartCard>
```

- [ ] **Step 7: Add the new chart card to the grid**

In `client/src/pages/InstallmentsPage.tsx`, replace:

```tsx
            <ChartCard title="Por comercio"><InstallmentsByMerchantChart {...filters} /></ChartCard>
          </MotionBox>
```

with:

```tsx
            <ChartCard title="Por comercio"><InstallmentsByMerchantChart {...filters} /></ChartCard>
            <ChartCard title="Cuotas pendientes por categoría"><PendingInstallmentsByCategoryChart {...filters} /></ChartCard>
          </MotionBox>
```

- [ ] **Step 8: Run the page test to verify it passes**

Run: `npx vitest run client/src/pages/InstallmentsPage.test.tsx`
Expected: PASS.

- [ ] **Step 9: Full verification**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; entire suite green.

- [ ] **Step 10: Commit**

```bash
git add client/src/components/charts/PendingInstallmentsByCategoryChart.tsx client/src/pages/InstallmentsPage.tsx client/src/pages/InstallmentsPage.test.tsx
git commit -m "feat(client): pending-installments category pie and total KPI on Cuotas page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Pure `pendingInstallmentsByCategory` (sum + count per category, sorted) → Task 1. ✓
- `PendingInstallmentsByCategoryChart` reusing `CategoryPie` → Task 3. ✓
- `Kpi` extracted and reused → Task 2 (extract) + Task 3 (use on page). ✓
- KPI "Cuotas pendientes" = `totalFuturo`, warning/CreditCard, in a stagger MotionBox → Task 3. ✓
- New chart card in the grid; text line kept → Task 3 (only additions). ✓
- Tests: unit aggregation + page render + Dashboard stays green → Tasks 1–3. ✓
- Out of scope (server endpoint, `InstallmentsByCategoryChart`, text line) → not touched. ✓

**Placeholder scan:** No TBD/TODO; every code and command step is concrete.

**Type consistency:** `pendingInstallmentsByCategory(months: FutureInstallmentMonth[]): CategoryStat[]` (Task 1) feeds `CategoryPie` (`data?: CategoryStat[]`, `currency: Currency`) in Task 3. `Kpi` props (`label`, `value: number`, `format`, `icon`, `color: KpiColor`) match the InstallmentsPage usage (`value={totalFuturo}`, `format={money}`, `color="warning"`). `useFutureInstallmentsDetail` returns `FutureInstallmentMonth[]`, matching the aggregation input. `formatMoney` is already imported in `InstallmentsPage.tsx`.
