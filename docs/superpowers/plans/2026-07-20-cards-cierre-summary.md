# Resumen "A pagar al cierre" — Tarjetas de crédito (Dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En el Dashboard de tarjetas de crédito, mostrar cuánto hay que pagar al cierre combinando los dos bancos (`visa_signature` + `icbc`), tomando el **último corte de cada tarjeta** (no el mes calendario) — total combinado en ARS/USD, desglose por banco (saldo actual, corte, vencimiento, pago mínimo) y una barra apilada por banco.

**Architecture:** Derivación 100% en el cliente, **sin cambios en backend**. `GET /api/statements` ya devuelve los resúmenes ordenados por `closingDate` desc y existe `useStatements()`. La lógica ("último corte por banco + combinación") vive en un módulo puro testeable (`client/src/cardCycle.ts`), espejando `client/src/autoConcepts.ts`. La UI la consume: `CardCycleChart` (nivo bar apilado horizontal) dentro de `CardCycleSummary` (tarjeta contenedora), montada en `DashboardPage` por encima de `FiltersBar`.

**Tech Stack:** TypeScript (ESM), React 18 + MUI v6 (`sx`) + TanStack Query v5 + Nivo (`@nivo/bar`) + framer-motion. Tipos desde `@ledgerly/shared`. Vitest + RTL (jsdom). Runtime bun.

## Global Constraints

- **ESM:** todo import relativo con extensión `.js`; tipos desde `"@ledgerly/shared"`.
- **Sin `any`.** Interfaces para props y tipos de retorno. Destructuring en la firma del componente.
- **Componentes:** `export const` arrow, sin default exports. Estilos MUI v6 `sx`. Sin CSS Modules. Fragmentos `<>...</>`.
- **Sin comentarios en el código** (naming autoexplicativo).
- **Sin lodash directo** (sólo transitivo vía nivo) → TS plano, como `autoConcepts.ts`.
- **Moneda union `"ARS" | "USD"`.** USD vía `formatMoney(v, "USD")`; ARS vía `formatMoney(v, "ARS")` / `formatMoneyCompact`.
- **Copy en español.** Título visible: **"A pagar al cierre"**. Sin cambios de ruta ni de nav.
- **Importe = saldo actual** (`totals.saldoActual`), no consumos del período.
- **Asimetría USD real:** Visa Signature tiene `saldoActual.usd`; ICBC tiene `saldoActual.usd = 0` y `pagoMinimo.usd = 0` (ambos bancos). USD por tarjeta se muestra sólo si `> 0`.
- **Guard defensivo:** `buildCardCycleSummary` devuelve `null` si el input no es un array no vacío (los mocks de test laxos devuelven `{}` para rutas no matcheadas).
- **Test runner:** `bunx vitest run <path>` (un archivo); `bun run test` (todo). **Typecheck:** `bun run typecheck`.
- **Commits locales por tarea.** Mensaje termina con:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Módulo de derivación `cardCycle.ts` (lógica pura)

**Files:**
- Create: `client/src/cardCycle.ts`
- Test: `client/src/cardCycle.test.ts`

**Interfaces:**
- Consumes: `StatementDTO`, `Issuer` (de `@ledgerly/shared`).
- Produces:
  - `interface CardCycleEntry { issuer: Issuer; cardLabel: string; last4: string | null; saldoActualArs: number; saldoActualUsd: number; pagoMinimoArs: number; closingDate: string | null; dueDate: string | null }`
  - `interface CardCycleSummary { cards: CardCycleEntry[]; totalArs: number; totalUsd: number; totalPagoMinimoArs: number }`
  - `interface CardCycleBarData { keys: string[]; row: Record<string, string | number> }`
  - `latestStatementPerIssuer(statements: StatementDTO[]): StatementDTO[]`
  - `buildCardCycleSummary(statements: StatementDTO[]): CardCycleSummary | null`
  - `buildCardCycleBarData(cards: CardCycleEntry[]): CardCycleBarData`

- [ ] **Step 1: Write the failing test** — create `client/src/cardCycle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { StatementDTO } from "@ledgerly/shared";
import { buildCardCycleBarData, buildCardCycleSummary, latestStatementPerIssuer } from "./cardCycle.js";

const makeStatement = (
  issuer: StatementDTO["issuer"],
  cardLabel: string,
  closingDate: string | null,
  saldoActual: { ars: number; usd: number },
  pagoMinimoArs = 0,
  dueDate: string | null = null,
): StatementDTO => ({
  id: `${issuer}-${closingDate}`,
  issuer,
  cardLabel,
  last4: "1234",
  closingDate,
  dueDate,
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual,
    pagoMinimo: { ars: pagoMinimoArs, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "x.pdf",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt: "2026-07-01T00:00:00.000Z",
});

describe("buildCardCycleSummary", () => {
  it("combina el último corte de cada banco y suma ARS, USD y pago mínimo", () => {
    const statements = [
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 534567, usd: 456.78 }, 90000, "2026-07-25"),
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }, 120000, "2026-07-20"),
    ];
    const summary = buildCardCycleSummary(statements);
    expect(summary?.totalArs).toBe(1234567);
    expect(summary?.totalUsd).toBeCloseTo(456.78);
    expect(summary?.totalPagoMinimoArs).toBe(210000);
    expect(summary?.cards).toHaveLength(2);
  });

  it("ordena las tarjetas por corte más reciente primero", () => {
    const statements = [
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 534567, usd: 456.78 }),
    ];
    expect(buildCardCycleSummary(statements)?.cards.map((c) => c.cardLabel)).toEqual(["Visa Signature", "ICBC"]);
  });

  it("elige el corte más reciente cuando un banco tiene varios resúmenes", () => {
    const statements = [
      makeStatement("icbc", "ICBC", "2026-06-07", { ars: 500000, usd: 0 }),
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
    ];
    const summary = buildCardCycleSummary(statements);
    expect(summary?.cards).toHaveLength(1);
    expect(summary?.totalArs).toBe(700000);
  });

  it("el total USD proviene sólo de Visa (ICBC aporta 0)", () => {
    const statements = [
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 534567, usd: 456.78 }),
    ];
    expect(buildCardCycleSummary(statements)?.totalUsd).toBeCloseTo(456.78);
  });

  it("ordena los cortes null al final sin romperse", () => {
    const statements = [
      makeStatement("visa_signature", "Visa Signature", null, { ars: 534567, usd: 456.78 }),
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
    ];
    expect(buildCardCycleSummary(statements)?.cards.map((c) => c.cardLabel)).toEqual(["ICBC", "Visa Signature"]);
  });

  it("devuelve null sin resúmenes", () => {
    expect(buildCardCycleSummary([])).toBeNull();
  });
});

describe("latestStatementPerIssuer", () => {
  it("devuelve un resumen por banco", () => {
    const statements = [
      makeStatement("icbc", "ICBC", "2026-06-07", { ars: 1, usd: 0 }),
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 2, usd: 0 }),
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 3, usd: 0 }),
    ];
    expect(latestStatementPerIssuer(statements)).toHaveLength(2);
  });
});

describe("buildCardCycleBarData", () => {
  it("arma una fila con una key por tarjeta = saldo actual ARS", () => {
    const summary = buildCardCycleSummary([
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 534567, usd: 456.78 }),
    ]);
    const { keys, row } = buildCardCycleBarData(summary!.cards);
    expect(keys).toEqual(["Visa Signature", "ICBC"]);
    expect(row["ICBC"]).toBe(700000);
    expect(row["Visa Signature"]).toBe(534567);
    expect(row.label).toBe("A pagar");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/cardCycle.test.ts`
Expected: FAIL — `Failed to resolve import "./cardCycle.js"` / funciones no exportadas.

- [ ] **Step 3: Write minimal implementation** — create `client/src/cardCycle.ts`:

```ts
import type { Issuer, StatementDTO } from "@ledgerly/shared";

export interface CardCycleEntry {
  issuer: Issuer;
  cardLabel: string;
  last4: string | null;
  saldoActualArs: number;
  saldoActualUsd: number;
  pagoMinimoArs: number;
  closingDate: string | null;
  dueDate: string | null;
}

export interface CardCycleSummary {
  cards: CardCycleEntry[];
  totalArs: number;
  totalUsd: number;
  totalPagoMinimoArs: number;
}

export interface CardCycleBarData {
  keys: string[];
  row: Record<string, string | number>;
}

const byClosingDateDesc = (a: StatementDTO, b: StatementDTO): number =>
  (b.closingDate ?? "").localeCompare(a.closingDate ?? "");

export function latestStatementPerIssuer(statements: StatementDTO[]): StatementDTO[] {
  const groups = new Map<Issuer, StatementDTO[]>();
  for (const statement of statements) {
    const list = groups.get(statement.issuer) ?? [];
    list.push(statement);
    groups.set(statement.issuer, list);
  }
  const latest: StatementDTO[] = [];
  for (const list of groups.values()) {
    latest.push([...list].sort(byClosingDateDesc)[0]);
  }
  return latest.sort(byClosingDateDesc);
}

export function buildCardCycleSummary(statements: StatementDTO[]): CardCycleSummary | null {
  if (!Array.isArray(statements) || statements.length === 0) return null;
  const cards: CardCycleEntry[] = latestStatementPerIssuer(statements).map((statement) => ({
    issuer: statement.issuer,
    cardLabel: statement.cardLabel,
    last4: statement.last4,
    saldoActualArs: statement.totals.saldoActual.ars,
    saldoActualUsd: statement.totals.saldoActual.usd,
    pagoMinimoArs: statement.totals.pagoMinimo.ars,
    closingDate: statement.closingDate,
    dueDate: statement.dueDate,
  }));
  return {
    cards,
    totalArs: cards.reduce((total, card) => total + card.saldoActualArs, 0),
    totalUsd: cards.reduce((total, card) => total + card.saldoActualUsd, 0),
    totalPagoMinimoArs: cards.reduce((total, card) => total + card.pagoMinimoArs, 0),
  };
}

export function buildCardCycleBarData(cards: CardCycleEntry[]): CardCycleBarData {
  const keys = cards.map((card) => card.cardLabel);
  const row: Record<string, string | number> = { label: "A pagar" };
  for (const card of cards) row[card.cardLabel] = card.saldoActualArs;
  return { keys, row };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/cardCycle.test.ts`
Expected: PASS (todos los `describe`).

- [ ] **Step 5: Commit**

```bash
git add client/src/cardCycle.ts client/src/cardCycle.test.ts
git commit -m "$(cat <<'EOF'
feat(client): derive latest-cycle card summary across both banks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `CardCycleChart` + `CardCycleSummary` (UI + RTL)

**Files:**
- Create: `client/src/components/charts/CardCycleChart.tsx`
- Create: `client/src/components/CardCycleSummary.tsx`
- Test: `client/src/components/CardCycleSummary.test.tsx`

**Interfaces:**
- Consumes: `buildCardCycleSummary`, `buildCardCycleBarData`, `CardCycleEntry` (Task 1); `useStatements` (`../api/hooks.js`); `formatMoney`, `formatMoneyCompact` (`../format.js` / `../../format.js`); `seriesColor` (`./palette.js`), `nivoTheme` (`./nivoTheme.js`); `MotionBox`, `fadeUpItem`.
- Produces: `CardCycleChart` (props `{ cards: CardCycleEntry[] }`), `CardCycleSummary` (sin props).

- [ ] **Step 1: Write the failing test** — create `client/src/components/CardCycleSummary.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { CardCycleSummary } from "./CardCycleSummary.js";

const statements = [
  {
    id: "v1", issuer: "visa_signature", cardLabel: "Visa Signature", last4: "5678",
    closingDate: "2026-07-12", dueDate: "2026-07-25",
    totals: {
      totalConsumos: { ars: 0, usd: 0 },
      saldoActual: { ars: 534567, usd: 456.78 },
      pagoMinimo: { ars: 90000, usd: 0 },
      saldoAnterior: { ars: 0, usd: 0 },
    },
    sourceFileName: "v.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
    transactionCount: 0, uploadedAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "i1", issuer: "icbc", cardLabel: "ICBC", last4: "1234",
    closingDate: "2026-07-07", dueDate: "2026-07-20",
    totals: {
      totalConsumos: { ars: 0, usd: 0 },
      saldoActual: { ars: 700000, usd: 0 },
      pagoMinimo: { ars: 120000, usd: 0 },
      saldoAnterior: { ars: 0, usd: 0 },
    },
    sourceFileName: "i.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
    transactionCount: 0, uploadedAt: "2026-07-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(url.includes("/statements") ? statements : {}), {
      status: 200, headers: { "Content-Type": "application/json" },
    })));
});
afterEach(() => vi.restoreAllMocks());

describe("CardCycleSummary", () => {
  it("muestra el título, el total combinado y el desglose por banco", async () => {
    renderWithProviders(<CardCycleSummary />, { route: "/" });
    await waitFor(() => expect(screen.getByText("A pagar al cierre")).toBeInTheDocument());
    expect(screen.getByText((text) => text.includes("1.234.567"))).toBeInTheDocument();
    expect(screen.getByText(/Visa Signature/)).toBeInTheDocument();
    expect(screen.getByText(/ICBC/)).toBeInTheDocument();
    expect(screen.getByText(/corte 2026-07-07 · vence 2026-07-20/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/components/CardCycleSummary.test.tsx`
Expected: FAIL — `Failed to resolve import "./CardCycleSummary.js"`.

- [ ] **Step 3: Write the chart** — create `client/src/components/charts/CardCycleChart.tsx`:

```tsx
import { ResponsiveBar } from "@nivo/bar";
import { Box, useTheme } from "@mui/material";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { buildCardCycleBarData, type CardCycleEntry } from "../../cardCycle.js";

interface CardCycleChartProps {
  cards: CardCycleEntry[];
}

export const CardCycleChart = ({ cards }: CardCycleChartProps) => {
  const theme = useTheme();
  if (cards.length === 0) return null;

  const { keys, row } = buildCardCycleBarData(cards);
  const colors = keys.map((_, index) => seriesColor(theme.palette.mode, index));
  const chartTheme = nivoTheme(theme);

  return (
    <Box sx={{ height: 120 }}>
      <ResponsiveBar
        data={[row]}
        theme={chartTheme}
        keys={keys}
        indexBy="label"
        layout="horizontal"
        colors={colors}
        margin={{ top: 8, right: 16, bottom: 40, left: 16 }}
        padding={0.3}
        enableLabel={false}
        enableGridY={false}
        axisLeft={null}
        axisBottom={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        tooltip={({ id, color, value }) => (
          <div style={{ ...chartTheme.tooltip?.container, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: color, display: "inline-block" }} />
            <span>
              {id}: <strong>{formatMoney(Number(value), "ARS")}</strong>
            </span>
          </div>
        )}
        motionConfig="gentle"
      />
    </Box>
  );
};
```

- [ ] **Step 4: Write the container** — create `client/src/components/CardCycleSummary.tsx`:

```tsx
import { Box, Card, CardContent, Typography } from "@mui/material";
import { useStatements } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { buildCardCycleSummary } from "../cardCycle.js";
import { CardCycleChart } from "./charts/CardCycleChart.js";
import { MotionBox } from "./motion/motion.js";
import { fadeUpItem } from "./motion/variants.js";

export const CardCycleSummary = () => {
  const { data } = useStatements();
  const summary = buildCardCycleSummary(data ?? []);
  if (!summary) return null;

  return (
    <MotionBox variants={fadeUpItem} initial="hidden" animate="visible" sx={{ mb: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 0.5 }}>A pagar al cierre</Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 2, flexWrap: "wrap", mb: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{formatMoney(summary.totalArs, "ARS")}</Typography>
            {summary.totalUsd > 0 && (
              <Typography variant="h6" color="text.secondary">{formatMoney(summary.totalUsd, "USD")}</Typography>
            )}
          </Box>
          <CardCycleChart cards={summary.cards} />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: `repeat(${summary.cards.length}, 1fr)` },
              gap: 2,
              mt: 1,
            }}
          >
            {summary.cards.map((card) => (
              <Box key={card.issuer}>
                <Typography variant="subtitle2" noWrap>
                  {card.cardLabel}{card.last4 ? ` ···· ${card.last4}` : ""}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {formatMoney(card.saldoActualArs, "ARS")}
                  {card.saldoActualUsd > 0 ? ` · ${formatMoney(card.saldoActualUsd, "USD")}` : ""}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  corte {card.closingDate ?? "—"} · vence {card.dueDate ?? "—"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  mín. {formatMoney(card.pagoMinimoArs, "ARS")}
                </Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </MotionBox>
  );
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run client/src/components/CardCycleSummary.test.tsx`
Expected: PASS. (Nivo puede loguear un warning de tamaño 0 en jsdom; no rompe el test.)

- [ ] **Step 6: Commit**

```bash
git add client/src/components/charts/CardCycleChart.tsx client/src/components/CardCycleSummary.tsx client/src/components/CardCycleSummary.test.tsx
git commit -m "$(cat <<'EOF'
feat(client): card-cierre summary panel with per-bank stacked bar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Montar en `DashboardPage` + cobertura de integración

**Files:**
- Modify: `client/src/pages/DashboardPage.tsx`
- Modify: `client/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `CardCycleSummary` (Task 2).

- [ ] **Step 1: Update the failing test** — en `client/src/pages/DashboardPage.test.tsx`, agregar la ruta `/statements` al helper `route` y una aserción del nuevo panel.

Reemplazar el cuerpo de `function route(url)` para que su primer `if` sea:

```ts
  if (url.includes("/statements")) return [
    {
      id: "i1", issuer: "icbc", cardLabel: "ICBC", last4: "1234",
      closingDate: "2026-07-07", dueDate: "2026-07-20",
      totals: {
        totalConsumos: { ars: 0, usd: 0 },
        saldoActual: { ars: 700000, usd: 0 },
        pagoMinimo: { ars: 120000, usd: 0 },
        saldoAnterior: { ars: 0, usd: 0 },
      },
      sourceFileName: "i.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
      transactionCount: 0, uploadedAt: "2026-07-01T00:00:00.000Z",
    },
  ];
```

Y dentro del `it(...)` existente, agregar al final:

```ts
    expect(await screen.findByText("A pagar al cierre")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run client/src/pages/DashboardPage.test.tsx`
Expected: FAIL — no existe el texto "A pagar al cierre" (aún no montado).

- [ ] **Step 3: Mount the component** — en `client/src/pages/DashboardPage.tsx`:

Agregar el import junto a los demás de `../components`:

```tsx
import { CardCycleSummary } from "../components/CardCycleSummary.js";
```

Y renderizarlo entre el título y `FiltersBar`:

```tsx
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard</Typography>
      <CardCycleSummary />
      <FiltersBar />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run client/src/pages/DashboardPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full typecheck + test suite**

Run: `bun run typecheck && bun run test`
Expected: PASS (sin errores de tipos; suite completa verde).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/DashboardPage.tsx client/src/pages/DashboardPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(client): mount card-cierre summary atop the Dashboard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Derivación en cliente (`cardCycle.ts`), sin backend → Task 1. ✓
- Último corte por banco + combinación (ARS/USD/pago mínimo) → Task 1 (`buildCardCycleSummary`). ✓
- Gráfico de barras por banco (apilado horizontal) → Task 2 (`CardCycleChart`). ✓
- Total combinado + desglose por tarjeta (saldo ARS+USD, corte, vencimiento, pago mínimo) → Task 2 (`CardCycleSummary`). ✓
- Asimetría USD (USD por tarjeta sólo si `> 0`) → Task 2 (condicional `saldoActualUsd > 0`) + Task 1 (`totalUsd` suma). ✓
- Ubicación arriba del Dashboard, sobre `FiltersBar`, sin depender de filtros → Task 3. ✓
- Tests del módulo puro (2 bancos, 1 banco, varios por banco, vacío, null, USD sólo Visa, bar data) → Task 1. ✓

**Placeholder scan:** sin TBD/TODO; todo paso con código o comando concreto. ✓

**Type consistency:** `CardCycleEntry`/`CardCycleSummary`/`CardCycleBarData` y las firmas `latestStatementPerIssuer`/`buildCardCycleSummary`/`buildCardCycleBarData` son idénticas entre Task 1 (definición), Task 2 (consumo) y los Interfaces de cada tarea. `row.label === "A pagar"` consistente entre `buildCardCycleBarData` (Task 1) e `indexBy="label"` del chart (Task 2). ✓
