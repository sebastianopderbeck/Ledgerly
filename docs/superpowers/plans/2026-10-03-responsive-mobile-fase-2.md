# Responsive mobile — Fase 2 (KPIs y gráficos) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En pantallas de menos de 900px, los KPIs y los gráficos de Ledgerly se leen sin pisarse: menos etiquetas en el eje de los meses, margen izquierdo más angosto, leyendas como lista HTML debajo del gráfico, barras horizontales con nombres cortos, y tarjetas más compactas. La vista de compu no cambia.

**Architecture:** Un módulo `useChartLayout.ts` concentra las reglas mobile de los gráficos: `thinTicks` y `truncateLabel` son puras, y `useChartLayout()` (sobre `useIsMobile()` de la Fase 1) devuelve `{ isMobile, seriesMargin, bottomTicks }`. Cada gráfico de nivo pide ese layout y lo aplica a `margin`, `axisBottom.tickValues` y `legends`. `ChartLegend` reemplaza en mobile a las leyendas de nivo, y `LegendSwatch` reemplaza al cuadradito repetido en los tooltips. `Kpi.tsx` pasa a ser la única tarjeta KPI (las tres copias locales se borran). En los tests, nivo no dibuja en jsdom, así que un `NivoProbe` reemplaza a `ResponsiveLine`/`ResponsiveBar`/`ResponsivePie` con `vi.mock` y expone en atributos `data-*` las props que recibe.

**Tech Stack:** React 18 + MUI 6.5 + nivo 0.99 (cliente); Vitest + Testing Library en jsdom; Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-02-responsive-mobile-design.md` (sección "Fase 2 — KPIs y gráficos")

## Prerrequisitos

1. La base es la rama de la Fase 1 (`feat/responsive-mobile`, PR #9), que trae `useIsMobile()` y `client/src/testing/viewport.ts`. Verificarlo:

   ```bash
   test -f client/src/useIsMobile.ts && echo "useIsMobile OK"
   grep -n "export const emulateMobile" client/src/testing/viewport.ts
   ```

2. Trabajar en la rama `feat/responsive-mobile-fase-2`, creada desde `feat/responsive-mobile`, en su propio worktree.
3. `bun install` si el worktree es nuevo.

## Ajustes respecto del spec

Decisiones de detalle tomadas al planificar; no cambian lo acordado:

- `useChartLayout.ts` también exporta `truncateLabel(label, max)`, que usan las barras horizontales (hoy cada una tiene su propio `truncate` a 16 caracteres).
- Barras horizontales en mobile: además de `left: 96` y `axisBottom={null}`, el margen inferior baja de 32 a 8, porque ya no hay eje que lo ocupe. El tooltip por defecto de nivo ya muestra el nombre completo (`total - NOMBRE`), así que no se agrega uno propio.
- Gráficos con leyenda que también son series por mes (InstallmentsByCategory, MacroRace, PayslipGrossNet): en mobile, el margen que ocupaba la leyenda vuelve al de las demás series (`right: 24` en InstallmentsByCategory; `bottom: 64` en MacroRace y PayslipGrossNet).
- `Kpi` elige `h6`/`h5` con `useIsMobile()`: es un cambio de etiqueta, no solo de estilo, y así se puede testear. El ícono de 36px y el padding menor van por breakpoints en `sx`.
- El padding compacto de `CardContent` (Kpi y ChartCard) vive en una sola constante, `compactCardContentSx`.
- Los gráficos con datos por props se testean con `NivoProbe`. Los que piden datos a la API (hooks de React Query) se cubren con la revisión del diff y con la verificación visual del Task 9, salvo las barras horizontales, que se testean con un `fetch` stubeado.

## Global Constraints

- **Sin comentarios en el código** (CLAUDE.md global): nada de `//`, bloques ni JSDoc.
- **Commits**: un commit por task en `feat/responsive-mobile-fase-2`, con el mensaje exacto del task y pathspec explícito. Nunca `git add -A` ni `git add .`. Nunca push ni merge.
- Componentes funcionales `const X = ({ props }) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`. Hooks como `export function useX()`.
- Mapeos y condicionales complejos antes del `return`, no dentro del JSX. Nunca usar el índice del array como `key`.
- **Corte mobile: `< md` (900px)**. Toda decisión estructural pasa por `useIsMobile()` (en gráficos, a través de `useChartLayout()`); lo que es solo layout usa breakpoints `xs`/`md` en `sx`.
- **La vista de compu no cambia**: en ≥ 900px cada gráfico recibe exactamente las mismas props de nivo que hoy (márgenes, leyendas, ejes, rotación, sin `tickValues`), y KPIs y tarjetas mantienen tamaños y paddings.
- **Los hooks van antes de cualquier `return` temprano**: en los gráficos, `useChartLayout()` se llama justo después de `useTheme()`, antes del `if (...) return <Typography>Sin datos</Typography>`.
- Alto de los gráficos de series: 260 (ya lo es; no cambia).
- Tests de cliente con más de un render en el archivo llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado en este repo). Los que emulan viewport llaman `vi.unstubAllGlobals()` en `afterEach`.
- Imports con extensión `.js` (ESM), como el resto del repo.
- Comandos (desde la raíz del worktree): `bun run test <ruta>` (vitest run), `bun run typecheck`, `bun run build`.

## Review Focus

1. **Serie corta** (hasta 6 meses, p. ej. 3 cuotas): en mobile se ven todos los meses, sin raleo. → test en Task 1 (`thinTicks`) y en Task 4 (DolarReal con 3 meses).
2. **Serie larga** (Contexto desde 2025, crédito con muchas cuotas): en mobile, a lo sumo 6 etiquetas y siempre aparece el último mes, que es el que la persona quiere leer. → tests en Task 1 y Task 4.
3. **Pantalla que cruza los 900px con el gráfico montado** (iPad que rota): la leyenda pasa de nivo a `ChartLegend` y viceversa, sin quedar duplicada ni desaparecer. → test en Task 6.
4. **Nombres largos** (comercios, categorías) a 375px: las barras horizontales cortan a 11 caracteres con "…" y ninguna página de gráficos genera scroll horizontal. → test de `truncateLabel` en Task 1 y chequeo de `scrollWidth` en Task 9.
5. **Sin datos en mobile**: sigue apareciendo "Sin datos" y no se dibuja una leyenda vacía. → test en Task 6.

---

### Task 1: `useChartLayout` — reglas mobile de los gráficos

**Files:**
- Create: `client/src/components/charts/useChartLayout.ts`
- Test: `client/src/components/charts/useChartLayout.test.ts`

**Interfaces:**
- Consumes: `useIsMobile(): boolean` de `client/src/useIsMobile.ts`; `emulateMobile()`/`emulateDesktop()` de `client/src/testing/viewport.ts`.
- Produces:
  - `thinTicks<T>(values: T[], max: number): T[]`
  - `truncateLabel(label: string, max: number): string`
  - `interface ChartMargin { top: number; right: number; bottom: number; left: number }`
  - `interface ChartLayout { isMobile: boolean; seriesMargin: (desktop: ChartMargin) => ChartMargin; bottomTicks: <T>(values: T[]) => T[] | undefined }`
  - `useChartLayout(): ChartLayout` — en mobile, `seriesMargin` devuelve el margen con `left: 48` y `bottomTicks` devuelve `thinTicks(values, 6)`; en compu, el margen tal cual y `undefined`.

- [ ] **Step 1: Write the failing test**

`client/src/components/charts/useChartLayout.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { thinTicks, truncateLabel, useChartLayout } from "./useChartLayout.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const months = (count: number) => Array.from({ length: count }, (_unused, index) => `m${index + 1}`);

const margin = { top: 16, right: 24, bottom: 64, left: 64 };

describe("thinTicks", () => {
  it("con menos valores que el máximo devuelve todos", () => {
    expect(thinTicks(months(3), 6)).toEqual(["m1", "m2", "m3"]);
  });

  it("con tantos valores como el máximo devuelve todos", () => {
    expect(thinTicks(months(6), 6)).toEqual(months(6));
  });

  it("con muchos valores toma equiespaciados, nunca más que el máximo, y termina en el último", () => {
    expect(thinTicks(months(12), 6)).toEqual(["m2", "m4", "m6", "m8", "m10", "m12"]);
    expect(thinTicks(months(14), 6)).toEqual(["m2", "m5", "m8", "m11", "m14"]);
  });

  it("con muchísimos valores sigue respetando el máximo e incluye el último", () => {
    const ticks = thinTicks(months(240), 6);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.at(-1)).toBe("m240");
  });

  it("con un máximo de 1 deja solo el último", () => {
    expect(thinTicks(months(5), 1)).toEqual(["m5"]);
  });
});

describe("truncateLabel", () => {
  it("deja igual una etiqueta que entra", () => {
    expect(truncateLabel("MERCADOLIBRE", 16)).toBe("MERCADOLIBRE");
    expect(truncateLabel("ABCDEFGHIJK", 11)).toBe("ABCDEFGHIJK");
  });

  it("corta una etiqueta larga y agrega puntos suspensivos sin pasarse del máximo", () => {
    expect(truncateLabel("MERCADOLIBRE SUPERMERCADO", 11)).toBe("MERCADOLIB…");
    expect(truncateLabel("MERCADOLIBRE SUPERMERCADO", 16)).toBe("MERCADOLIBRE SU…");
  });
});

describe("useChartLayout", () => {
  it("sin matchMedia se comporta como compu", () => {
    const { result } = renderHook(() => useChartLayout());
    expect(result.current.isMobile).toBe(false);
  });

  it("en compu deja el margen tal cual y no fija ticks", () => {
    emulateDesktop();
    const { result } = renderHook(() => useChartLayout());
    expect(result.current.isMobile).toBe(false);
    expect(result.current.seriesMargin(margin)).toEqual(margin);
    expect(result.current.bottomTicks(months(24))).toBeUndefined();
  });

  it("en mobile angosta el margen izquierdo y ralea los ticks a 6", () => {
    emulateMobile();
    const { result } = renderHook(() => useChartLayout());
    expect(result.current.isMobile).toBe(true);
    expect(result.current.seriesMargin(margin)).toEqual({ top: 16, right: 24, bottom: 64, left: 48 });
    expect(result.current.bottomTicks(months(24))).toEqual(["m4", "m8", "m12", "m16", "m20", "m24"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/charts/useChartLayout.test.ts`
Expected: FAIL — no se resuelve `./useChartLayout.js`.

- [ ] **Step 3: Implement**

`client/src/components/charts/useChartLayout.ts`:

```ts
import { useMemo } from "react";
import { useIsMobile } from "../../useIsMobile.js";

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartLayout {
  isMobile: boolean;
  seriesMargin: (desktop: ChartMargin) => ChartMargin;
  bottomTicks: <T>(values: T[]) => T[] | undefined;
}

const MOBILE_SERIES_LEFT = 48;
const MOBILE_MAX_TICKS = 6;

export const thinTicks = <T,>(values: T[], max: number): T[] => {
  if (values.length <= max) return values;
  const step = Math.ceil(values.length / max);
  const picked: T[] = [];
  for (let index = values.length - 1; index >= 0; index -= step) picked.unshift(values[index]);
  return picked;
};

export const truncateLabel = (label: string, max: number): string =>
  label.length > max ? `${label.slice(0, max - 1)}…` : label;

export function useChartLayout(): ChartLayout {
  const isMobile = useIsMobile();
  return useMemo(
    () => ({
      isMobile,
      seriesMargin: (desktop: ChartMargin) => (isMobile ? { ...desktop, left: MOBILE_SERIES_LEFT } : desktop),
      bottomTicks: <T,>(values: T[]) => (isMobile ? thinTicks(values, MOBILE_MAX_TICKS) : undefined),
    }),
    [isMobile],
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/charts/useChartLayout.test.ts`
Expected: PASS (10 tests).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/charts/useChartLayout.ts client/src/components/charts/useChartLayout.test.ts
git commit -m "feat(client): reglas mobile compartidas para los gráficos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `ChartLegend` y `LegendSwatch`

**Files:**
- Create: `client/src/components/charts/ChartLegend.tsx`
- Test: `client/src/components/charts/ChartLegend.test.tsx`
- Modify: `client/src/components/charts/PayslipCompositionChart.tsx`, `client/src/components/charts/AutoCompositionChart.tsx`, `client/src/components/charts/CardCycleChart.tsx` (tooltips con `LegendSwatch`)

**Interfaces:**
- Produces:
  - `interface ChartLegendItem { id: string; label: string; color: string; value?: string }`
  - `ChartLegend({ items }: { items: ChartLegendItem[] })` — `<ul aria-label="referencias">` con un `<li>` por ítem: punto de color, etiqueta y valor opcional. Se acomoda en varias líneas.
  - `LegendSwatch({ color, variant = "square" }: { color: string; variant?: "square" | "dot" })` — `square`: 12×12 con radio 2 (el de los tooltips de hoy); `dot`: 10×10 redondo (el de las leyendas).

- [ ] **Step 1: Write the failing test**

`client/src/components/charts/ChartLegend.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ChartLegend, LegendSwatch } from "./ChartLegend.js";

afterEach(cleanup);

describe("ChartLegend", () => {
  it("lista cada referencia con su etiqueta y su valor", () => {
    render(
      <ChartLegend
        items={[
          { id: "Compras", label: "Compras", color: "#22d3ee", value: "$ 1.500" },
          { id: "Servicios", label: "Servicios", color: "#818cf8" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "referencias" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Compras");
    expect(items[0]).toHaveTextContent("$ 1.500");
    expect(items[1]).toHaveTextContent("Servicios");
  });

  it("pinta el punto de cada referencia con su color", () => {
    render(<ChartLegend items={[{ id: "Neto", label: "Neto", color: "#34d399" }]} />);
    const swatch = within(screen.getByRole("listitem")).getByTestId("legend-swatch");
    expect(swatch).toHaveStyle({ backgroundColor: "#34d399", borderRadius: "50%" });
  });
});

describe("LegendSwatch", () => {
  it("por defecto es el cuadradito de los tooltips", () => {
    render(<LegendSwatch color="#f472b6" />);
    expect(screen.getByTestId("legend-swatch")).toHaveStyle({ width: "12px", height: "12px", borderRadius: "2px", backgroundColor: "#f472b6" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/charts/ChartLegend.test.tsx`
Expected: FAIL — no se resuelve `./ChartLegend.js`.

- [ ] **Step 3: Implement**

`client/src/components/charts/ChartLegend.tsx`:

```tsx
import type { CSSProperties } from "react";
import { Box, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

export interface ChartLegendItem {
  id: string;
  label: string;
  color: string;
  value?: string;
}

interface ChartLegendProps {
  items: ChartLegendItem[];
}

type LegendSwatchVariant = "square" | "dot";

interface LegendSwatchProps {
  color: string;
  variant?: LegendSwatchVariant;
}

const SWATCH_SHAPES: Record<LegendSwatchVariant, CSSProperties> = {
  square: { width: 12, height: 12, borderRadius: 2 },
  dot: { width: 10, height: 10, borderRadius: "50%" },
};

const listSx: SxProps<Theme> = {
  listStyle: "none",
  m: 0,
  mt: 1.5,
  p: 0,
  display: "flex",
  flexWrap: "wrap",
  columnGap: 2,
  rowGap: 0.75,
};

const itemSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 0.75,
  minWidth: 0,
};

export const LegendSwatch = ({ color, variant = "square" }: LegendSwatchProps) => (
  <span
    data-testid="legend-swatch"
    style={{ ...SWATCH_SHAPES[variant], backgroundColor: color, display: "inline-block", flexShrink: 0 }}
  />
);

export const ChartLegend = ({ items }: ChartLegendProps) => (
  <Box component="ul" aria-label="referencias" sx={listSx}>
    {items.map(({ id, label, color, value }) => (
      <Box component="li" key={id} sx={itemSx}>
        <LegendSwatch color={color} variant="dot" />
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        {value && <Typography variant="caption" sx={{ fontWeight: 600 }}>{value}</Typography>}
      </Box>
    ))}
  </Box>
);
```

En los tres tooltips, reemplazar el `<span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: color, display: "inline-block" }} />` por `<LegendSwatch color={color} />` y agregar el import `import { LegendSwatch } from "./ChartLegend.js";`:

- `client/src/components/charts/PayslipCompositionChart.tsx`
- `client/src/components/charts/AutoCompositionChart.tsx`
- `client/src/components/charts/CardCycleChart.tsx`

Después del cambio, `grep -rn "width: 12, height: 12" client/src/components/charts` no debe devolver nada fuera de `ChartLegend.tsx`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/charts/ client/src/components/CardCycleSummary.test.tsx client/src/pages/PayslipsPage.test.tsx client/src/pages/AutoPage.test.tsx`
Expected: PASS (3 tests nuevos; los demás sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/charts/ChartLegend.tsx client/src/components/charts/ChartLegend.test.tsx client/src/components/charts/PayslipCompositionChart.tsx client/src/components/charts/AutoCompositionChart.tsx client/src/components/charts/CardCycleChart.tsx
git commit -m "feat(client): leyenda HTML para gráficos y muestra de color compartida" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: KPIs y tarjetas compactas en mobile; un solo `Kpi`

**Files:**
- Create: `client/src/components/compactCardContentSx.ts`
- Modify: `client/src/components/Kpi.tsx`
- Modify: `client/src/components/charts/ChartCard.tsx`
- Modify: `client/src/components/CreditKpiCards.tsx`, `client/src/components/AutoKpiCards.tsx`, `client/src/components/PayslipKpiCards.tsx` (usan el `Kpi` compartido)
- Test: `client/src/components/Kpi.test.tsx`

**Interfaces:**
- Consumes: `useIsMobile()`; `emulateMobile()`/`emulateDesktop()`.
- Produces: `compactCardContentSx` (objeto `as const` para esparcir en el `sx` de un `CardContent`: padding 12px por debajo de `md`, el de MUI (16px, 24px abajo) desde `md`). `Kpi` mantiene sus props (`label`, `value`, `format`, `sub?`, `icon`, `color: KpiColor`, `subMultiline?`).

- [ ] **Step 1: Write the failing test**

`client/src/components/Kpi.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { Kpi } from "./Kpi.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const format = (value: number) => `$ ${value}`;

const renderKpi = () =>
  renderWithProviders(<Kpi label="Total pagado" value={1500} format={format} sub="en 13 cuotas" icon={<span />} color="primary" />);

describe("Kpi", () => {
  it("en compu muestra el valor como h5", () => {
    emulateDesktop();
    renderKpi();
    expect(screen.getByRole("heading", { level: 5 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 6 })).not.toBeInTheDocument();
  });

  it("en mobile muestra el valor como h6", () => {
    emulateMobile();
    renderKpi();
    expect(screen.getByRole("heading", { level: 6 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 5 })).not.toBeInTheDocument();
  });

  it("muestra la etiqueta y el subtítulo", () => {
    renderKpi();
    expect(screen.getByText("Total pagado")).toBeInTheDocument();
    expect(screen.getByText("en 13 cuotas")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/Kpi.test.tsx`
Expected: FAIL en "en mobile muestra el valor como h6" (hoy siempre es h5).

- [ ] **Step 3: Implement**

`client/src/components/compactCardContentSx.ts`:

```ts
export const compactCardContentSx = {
  p: { xs: 1.5, md: 2 },
  "&:last-child": { pb: { xs: 1.5, md: 3 } },
} as const;
```

`client/src/components/Kpi.tsx` (reemplazar el archivo entero):

```tsx
import type { ReactNode } from "react";
import { Card, CardContent, Box, Typography } from "@mui/material";
import { MotionBox } from "./motion/motion.js";
import { CountUp } from "./motion/CountUp.js";
import { fadeUpItem } from "./motion/variants.js";
import { useIsMobile } from "../useIsMobile.js";
import { compactCardContentSx } from "./compactCardContentSx.js";

export type KpiColor = "primary" | "secondary" | "success" | "warning" | "error";

interface KpiProps {
  label: string;
  value: number;
  format: (value: number) => string;
  sub?: string;
  icon: ReactNode;
  color: KpiColor;
  subMultiline?: boolean;
}

const ICON_SIZE = { xs: 36, md: 46 };

export const Kpi = ({ label, value, format, sub, icon, color, subMultiline = false }: KpiProps) => {
  const isMobile = useIsMobile();
  const valueVariant = isMobile ? "h6" : "h5";

  return (
    <MotionBox variants={fadeUpItem}>
      <Card>
        <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, ...compactCardContentSx }}>
          <Box
            sx={{
              width: ICON_SIZE,
              height: ICON_SIZE,
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
            <Typography variant={valueVariant} sx={{ fontWeight: 700 }} noWrap>
              <CountUp value={value} format={format} />
            </Typography>
            {sub && (
              <Typography variant="caption" color="text.secondary" noWrap={!subMultiline} sx={{ display: "block" }}>
                {sub}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    </MotionBox>
  );
};
```

`client/src/components/charts/ChartCard.tsx`: agregar `import { compactCardContentSx } from "../compactCardContentSx.js";` y cambiar `<Card><CardContent>` por `<Card><CardContent sx={compactCardContentSx}>`.

En `CreditKpiCards.tsx`, `AutoKpiCards.tsx` y `PayslipKpiCards.tsx`:
- Borrar `type KpiColor`, `interface KpiProps` y el `const Kpi` locales.
- Borrar los imports que solo usaba esa copia: `import type { ReactNode } from "react";`, la línea `import { Box, Card, CardContent, Typography } from "@mui/material";`, `MotionBox`, `CountUp` y `fadeUpItem`.
- Agregar `import { Kpi } from "./Kpi.js";`.
- El resto (íconos, hooks, `KpiGrid`, el JSX con `<Kpi .../>`) queda igual.

Confirmar: `grep -n "const Kpi\b" client/src/components/*.tsx` devuelve solo `Kpi.tsx`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/Kpi.test.tsx client/src/pages/`
Expected: PASS (3 tests nuevos; las páginas sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/compactCardContentSx.ts client/src/components/Kpi.tsx client/src/components/Kpi.test.tsx client/src/components/charts/ChartCard.tsx client/src/components/CreditKpiCards.tsx client/src/components/AutoKpiCards.tsx client/src/components/PayslipKpiCards.tsx
git commit -m "feat(client): KPIs y tarjetas de gráficos compactos en mobile con un solo Kpi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `NivoProbe` y series por mes con datos por props

**Files:**
- Create: `client/src/testing/nivoProbe.tsx`
- Modify: `client/src/components/charts/PayslipCompositionChart.tsx`, `PayslipNetoArsChart.tsx`, `PayslipNetoUsdChart.tsx`, `PayslipRealArsChart.tsx`, `InflationAccumulatedChart.tsx`, `DolarRealChart.tsx`, `TasaRealChart.tsx` (todos en `client/src/components/charts/`)
- Test: `client/src/components/charts/seriesCharts.test.tsx`

**Interfaces:**
- Consumes: `useChartLayout()` (Task 1).
- Produces:
  - `NivoProbe(props)` — reemplazo de `ResponsiveLine`/`ResponsiveBar`/`ResponsivePie` para `vi.mock`. Dibuja `<div data-testid="nivo-chart">` con `data-margin` (JSON), `data-axis-bottom` (`"none"` si `axisBottom === null`, si no `"shown"`), `data-tick-values` (JSON de `axisBottom.tickValues`, o `null`) y `data-legends` (cantidad).
  - `probeOf(element: HTMLElement): { margin: ProbeMargin | null; axisBottom: string | undefined; tickValues: unknown[] | null; legends: number }`

**Patrón a aplicar en cada gráfico de serie** (este task y el Task 5):

1. Import: `import { useChartLayout } from "./useChartLayout.js";`
2. Justo después de `const theme = useTheme();` (antes de cualquier `return` temprano): `const { seriesMargin, bottomTicks } = useChartLayout();`
3. `margin={{ ... }}` pasa a `margin={seriesMargin({ ... })}` con los mismos números de hoy.
4. En `axisBottom`, agregar `tickValues: bottomTicks(<valores del eje x>)` como última propiedad; el resto de `axisBottom` queda igual.

| Archivo | Valores del eje x |
|---|---|
| `PayslipCompositionChart.tsx` | `rows.map((row) => row.month)` |
| `PayslipNetoArsChart.tsx` | `points.map((point) => point.x)` |
| `PayslipNetoUsdChart.tsx` | `points.map((point) => point.x)` |
| `PayslipRealArsChart.tsx` | `points.map((point) => point.x)` |
| `InflationAccumulatedChart.tsx` | `points.map((point) => point.x)` |
| `DolarRealChart.tsx` | `points.map((point) => point.x)` |
| `TasaRealChart.tsx` | `rows.map((row) => row.month)` |

Ejemplo completo, `DolarRealChart.tsx` después del cambio (las líneas que no se muestran quedan igual):

```tsx
import { useChartLayout } from "./useChartLayout.js";

export const DolarRealChart = ({ dolarReal }: DolarRealChartProps) => {
  const theme = useTheme();
  const { seriesMargin, bottomTicks } = useChartLayout();

  if (dolarReal.serie.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const points = dolarReal.serie.map((punto) => ({ x: punto.periodo, y: punto.indice }));
  const color = seriesColor(theme.palette.mode, 0);

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        margin={seriesMargin({ top: 16, right: 24, bottom: 64, left: 56 })}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(points.map((point) => point.x)) }}
      />
    </Box>
  );
};
```

En los gráficos con `monthOnly`, `axisBottom` queda así (ejemplo de `PayslipNetoArsChart.tsx`):

```tsx
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickRotation: monthOnly ? 0 : -45,
          format: monthOnly ? (value) => monthLabel(String(value)) : undefined,
          tickValues: bottomTicks(points.map((point) => point.x)),
        }}
```

- [ ] **Step 1: Write the failing test**

`client/src/testing/nivoProbe.tsx`:

```tsx
interface ProbeMargin {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

interface ProbeAxis {
  tickValues?: unknown;
}

interface NivoProbeProps {
  margin?: ProbeMargin;
  axisBottom?: ProbeAxis | null;
  legends?: readonly unknown[];
}

export interface ProbeReading {
  margin: ProbeMargin | null;
  axisBottom: string | undefined;
  tickValues: unknown[] | null;
  legends: number;
}

export const NivoProbe = ({ margin, axisBottom, legends }: NivoProbeProps) => (
  <div
    data-testid="nivo-chart"
    data-margin={JSON.stringify(margin ?? null)}
    data-axis-bottom={axisBottom === null ? "none" : "shown"}
    data-tick-values={JSON.stringify(axisBottom?.tickValues ?? null)}
    data-legends={String(legends?.length ?? 0)}
  />
);

export const probeOf = (element: HTMLElement): ProbeReading => ({
  margin: JSON.parse(element.dataset.margin ?? "null") as ProbeMargin | null,
  axisBottom: element.dataset.axisBottom,
  tickValues: JSON.parse(element.dataset.tickValues ?? "null") as unknown[] | null,
  legends: Number(element.dataset.legends),
});
```

`client/src/components/charts/seriesCharts.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import type { DolarReal, TasaRealPoint } from "../../macroSignals.js";
import { DolarRealChart } from "./DolarRealChart.js";
import { TasaRealChart } from "./TasaRealChart.js";

vi.mock("@nivo/line", async () => ({ ResponsiveLine: (await import("../../testing/nivoProbe.js")).NivoProbe }));
vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const dolarReal = (meses: number): DolarReal => ({
  serie: Array.from({ length: meses }, (_unused, index) => ({ periodo: periodo(index), indice: 100 + index })),
  mediana: 100,
  indiceHoy: null,
  ultimoPeriodoConIpc: null,
});

const tasaReal = (meses: number): TasaRealPoint[] =>
  Array.from({ length: meses }, (_unused, index) => ({ periodo: periodo(index), tasaReal: index % 2 === 0 ? 1.5 : -0.5 }));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

describe("series por mes en mobile", () => {
  it("con muchos meses muestra a lo sumo 6 etiquetas y siempre el último mes", () => {
    emulateMobile();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(14)} />);
    const { tickValues } = chart();
    expect(tickValues).not.toBeNull();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
  });

  it("con pocos meses muestra todos", () => {
    emulateMobile();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(3)} />);
    expect(chart().tickValues).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("angosta solo el margen izquierdo", () => {
    emulateMobile();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(14)} />);
    expect(chart().margin).toEqual({ top: 16, right: 24, bottom: 64, left: 48 });
  });

  it("también ralea las barras", () => {
    emulateMobile();
    renderWithProviders(<TasaRealChart points={tasaReal(14)} />);
    const { tickValues, margin } = chart();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
    expect(margin).toEqual({ top: 16, right: 24, bottom: 64, left: 48 });
  });
});

describe("series por mes en compu", () => {
  it("deja que nivo elija las etiquetas y mantiene el margen de siempre", () => {
    emulateDesktop();
    renderWithProviders(<DolarRealChart dolarReal={dolarReal(14)} />);
    expect(chart()).toMatchObject({ tickValues: null, margin: { top: 16, right: 24, bottom: 64, left: 56 } });
  });

  it("las barras también quedan como siempre", () => {
    emulateDesktop();
    renderWithProviders(<TasaRealChart points={tasaReal(14)} />);
    expect(chart()).toMatchObject({ tickValues: null, margin: { top: 16, right: 24, bottom: 64, left: 56 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/charts/seriesCharts.test.tsx`
Expected: FAIL en el bloque mobile (`tickValues` es `null` y `left` sigue en 56).

- [ ] **Step 3: Implement**

Aplicar el patrón de arriba a los 7 archivos de la tabla.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/charts/ client/src/pages/PayslipsPage.test.tsx client/src/pages/MacroPage.test.tsx`
Expected: PASS (6 tests nuevos; los demás sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/testing/nivoProbe.tsx client/src/components/charts/seriesCharts.test.tsx client/src/components/charts/PayslipCompositionChart.tsx client/src/components/charts/PayslipNetoArsChart.tsx client/src/components/charts/PayslipNetoUsdChart.tsx client/src/components/charts/PayslipRealArsChart.tsx client/src/components/charts/InflationAccumulatedChart.tsx client/src/components/charts/DolarRealChart.tsx client/src/components/charts/TasaRealChart.tsx
git commit -m "feat(client): series de sueldo y contexto con menos etiquetas en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Series por mes con datos de la API

**Files:**
- Modify (todos en `client/src/components/charts/`): `MonthlyTrendChart.tsx`, `MonthlyUsdChart.tsx`, `FutureInstallmentsChart.tsx`, `TotalPaidByMonthChart.tsx`, `AutoTotalPaidByMonthChart.tsx`, `CapitalVsInterestChart.tsx`, `UvaEvolutionChart.tsx`, `CouponUsdChart.tsx`, `AutoCouponUsdChart.tsx`, `CarValueChart.tsx`, `AutoCompositionChart.tsx`, `RemainingDebtChart.tsx`

**Interfaces:**
- Consumes: `useChartLayout()` (Task 1). El patrón es el mismo del Task 4: import; `const { seriesMargin, bottomTicks } = useChartLayout();` justo después de `const theme = useTheme();` y **antes** del `useX()`/`useMemo` de datos y de cualquier `return` temprano; `margin={seriesMargin({ ...mismos números... })}`; `tickValues: bottomTicks(...)` como última propiedad de `axisBottom`.

| Archivo | Valores del eje x |
|---|---|
| `MonthlyTrendChart.tsx` | `data.map((d) => d.month)` |
| `MonthlyUsdChart.tsx` | `points.map((d) => d.month)` |
| `FutureInstallmentsChart.tsx` | `chartData.map((d) => d.month)` |
| `TotalPaidByMonthChart.tsx` | `rows.map((row) => row.month)` |
| `AutoTotalPaidByMonthChart.tsx` | `rows.map((row) => row.month)` |
| `CapitalVsInterestChart.tsx` | `rows.map((row) => row.month)` |
| `UvaEvolutionChart.tsx` | `points.map((point) => point.x)` |
| `CouponUsdChart.tsx` | `points.map((point) => point.x)` |
| `AutoCouponUsdChart.tsx` | `points.map((point) => point.x)` |
| `CarValueChart.tsx` | `points.map((point) => point.x)` |
| `AutoCompositionChart.tsx` | `rows.map((row) => row.month)` |
| `RemainingDebtChart.tsx` | `points.map((point) => point.x)` |

Ejemplo completo, `MonthlyTrendChart.tsx` después del cambio (lo que no se muestra queda igual):

```tsx
import { useChartLayout } from "./useChartLayout.js";

export const MonthlyTrendChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { seriesMargin, bottomTicks } = useChartLayout();
  const { data } = useMonthly(filters);
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        margin={seriesMargin({ top: 16, right: 24, bottom: 40, left: 64 })}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickValues: bottomTicks(data.map((d) => d.month)) }}
      />
    </Box>
  );
};
```

En `RemainingDebtChart.tsx`, `useChartLayout()` va después de `useTheme()` y antes de `useFutureInstallmentsDetail(filters)`.

- [ ] **Step 1: Write the failing check**

Estos gráficos piden datos a la API y nivo no dibuja en jsdom, así que no llevan test propio: el contrato ya lo fijan `useChartLayout.test.ts` y `seriesCharts.test.tsx`. Antes de tocar nada, contar cuántos aplican el patrón:

```bash
grep -L "useChartLayout" client/src/components/charts/{MonthlyTrend,MonthlyUsd,FutureInstallments,TotalPaidByMonth,AutoTotalPaidByMonth,CapitalVsInterest,UvaEvolution,CouponUsd,AutoCouponUsd,CarValue,AutoComposition,RemainingDebt}Chart.tsx | wc -l
```

Expected: `12`.

- [ ] **Step 2: Implement**

Aplicar el patrón a los 12 archivos de la tabla.

- [ ] **Step 3: Verify the pattern landed everywhere**

```bash
grep -L "useChartLayout" client/src/components/charts/{MonthlyTrend,MonthlyUsd,FutureInstallments,TotalPaidByMonth,AutoTotalPaidByMonth,CapitalVsInterest,UvaEvolution,CouponUsd,AutoCouponUsd,CarValue,AutoComposition,RemainingDebt}Chart.tsx | wc -l
grep -c "tickValues: bottomTicks(" client/src/components/charts/{MonthlyTrend,MonthlyUsd,FutureInstallments,TotalPaidByMonth,AutoTotalPaidByMonth,CapitalVsInterest,UvaEvolution,CouponUsd,AutoCouponUsd,CarValue,AutoComposition,RemainingDebt}Chart.tsx
grep -c "margin={seriesMargin(" client/src/components/charts/{MonthlyTrend,MonthlyUsd,FutureInstallments,TotalPaidByMonth,AutoTotalPaidByMonth,CapitalVsInterest,UvaEvolution,CouponUsd,AutoCouponUsd,CarValue,AutoComposition,RemainingDebt}Chart.tsx
```

Expected: `0`, y luego `:1` en cada archivo de las dos listas.

- [ ] **Step 4: Run tests**

Run: `bun run test client/src/components/charts/ client/src/pages/`
Expected: PASS (sin cambios de comportamiento en jsdom).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/charts/MonthlyTrendChart.tsx client/src/components/charts/MonthlyUsdChart.tsx client/src/components/charts/FutureInstallmentsChart.tsx client/src/components/charts/TotalPaidByMonthChart.tsx client/src/components/charts/AutoTotalPaidByMonthChart.tsx client/src/components/charts/CapitalVsInterestChart.tsx client/src/components/charts/UvaEvolutionChart.tsx client/src/components/charts/CouponUsdChart.tsx client/src/components/charts/AutoCouponUsdChart.tsx client/src/components/charts/CarValueChart.tsx client/src/components/charts/AutoCompositionChart.tsx client/src/components/charts/RemainingDebtChart.tsx
git commit -m "feat(client): series de gastos, crédito y auto con menos etiquetas en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Gráficos con leyenda

**Files:**
- Modify (en `client/src/components/charts/`): `CategoryPie.tsx`, `AmortizationDonutChart.tsx`, `AutoProgressDonutChart.tsx`, `InstallmentsByCategoryChart.tsx`, `MacroRaceChart.tsx`, `PayslipGrossNetChart.tsx`
- Test: `client/src/components/charts/legendCharts.test.tsx`

**Interfaces:**
- Consumes: `useChartLayout()` (Task 1); `ChartLegend`, `ChartLegendItem` (Task 2); `NivoProbe`, `probeOf` (Task 4).
- Produces: en mobile, cada uno de estos gráficos pasa `legends={[]}` a nivo y dibuja `<ChartLegend items={...} />` debajo del `Box` de 260px (el componente devuelve un fragmento `<>…</>`). En compu, `legends` es el array de hoy y no hay `ChartLegend`.

**Reglas por archivo** (los `legends` de compu son los de hoy, sin tocar, escritos inline en el ternario para que nivo tipe el literal):

`CategoryPie.tsx`:

```tsx
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { useChartLayout } from "./useChartLayout.js";

const DESKTOP_MARGIN = { top: 16, right: 150, bottom: 16, left: 16 };
const MOBILE_MARGIN = { top: 16, right: 16, bottom: 16, left: 16 };

export const CategoryPie = ({ data, currency }: CategoryPieProps) => {
  const theme = useTheme();
  const { isMobile } = useChartLayout();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const palette = categoricalPalette(theme.palette.mode);
  const chartData = data.map((d) => ({ id: d.category, label: d.category, value: d.total }));
  const legendItems: ChartLegendItem[] = chartData.map((slice, index) => ({
    id: slice.id,
    label: slice.label,
    color: palette[index % palette.length],
    value: formatMoney(slice.value, currency),
  }));

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsivePie
          data={chartData}
          theme={nivoTheme(theme)}
          colors={palette}
          margin={isMobile ? MOBILE_MARGIN : DESKTOP_MARGIN}
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
          legends={isMobile ? [] : [{
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
      {isMobile && <ChartLegend items={legendItems} />}
    </>
  );
};
```

`AmortizationDonutChart.tsx` y `AutoProgressDonutChart.tsx`: mismo esquema que `CategoryPie` (mismas constantes `DESKTOP_MARGIN`/`MOBILE_MARGIN`, `useChartLayout()` después de `useTheme()` y antes del hook de datos, `legends` condicional, fragmento con `ChartLegend`). Ítems de la leyenda:

```tsx
  const legendItems: ChartLegendItem[] = chartData.map((slice, index) => ({
    id: slice.id,
    label: slice.label,
    color: colors[index],
    value: formatUva(slice.value),
  }));
```

En `AutoProgressDonutChart.tsx`, `value: \`${slice.value} cuotas\``.

`InstallmentsByCategoryChart.tsx`:
- `const { isMobile, seriesMargin, bottomTicks } = useChartLayout();` después de `useTheme()`.
- `margin={seriesMargin({ top: 8, right: isMobile ? 24 : 128, bottom: 56, left: 64 })}`
- `axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(rows.map((row) => row.month)) }}`
- `legends={isMobile ? [] : [ ...el de hoy... ]}`
- Antes del `return`: `const legendItems: ChartLegendItem[] = keys.map((key, index) => ({ id: key, label: key, color: colors[index] }));`
- Devolver `<>` con el `Box` y `{isMobile && <ChartLegend items={legendItems} />}`.

`MacroRaceChart.tsx`:
- `const { isMobile, seriesMargin, bottomTicks } = useChartLayout();` después de `useTheme()`.
- `margin={seriesMargin({ top: 16, right: 24, bottom: isMobile ? 64 : 84, left: 56 })}`
- `axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(series[0].data.map((point) => point.x)) }}`
- `legends={isMobile ? [] : [ ...el de hoy... ]}`
- `const legendItems: ChartLegendItem[] = series.map((serie, slot) => ({ id: serie.id, label: serie.id, color: colors[slot] }));`
- Fragmento con `ChartLegend` en mobile.

`PayslipGrossNetChart.tsx`:
- `const { isMobile, seriesMargin, bottomTicks } = useChartLayout();` después de `useTheme()`.
- `margin={seriesMargin({ top: 16, right: 24, bottom: isMobile ? 64 : 76, left: 64 })}`
- En `axisBottom`, agregar `tickValues: bottomTicks(rows.map((row) => row.month))` como última propiedad.
- `legends={isMobile ? [] : [ ...el de hoy... ]}`
- `const legendItems: ChartLegendItem[] = KEYS.map((key, index) => ({ id: key, label: key, color: colors[index] }));`
- Fragmento con `ChartLegend` en mobile.

- [ ] **Step 1: Write the failing test**

`client/src/components/charts/legendCharts.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import { formatMoney } from "../../format.js";
import type { RaceSerie } from "../../macroSignals.js";
import { CategoryPie } from "./CategoryPie.js";
import { MacroRaceChart } from "./MacroRaceChart.js";

vi.mock("@nivo/pie", async () => ({ ResponsivePie: (await import("../../testing/nivoProbe.js")).NivoProbe }));
vi.mock("@nivo/line", async () => ({ ResponsiveLine: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const categories = [
  { category: "Compras", total: 1500, count: 3 },
  { category: "Servicios", total: 800, count: 2 },
];

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const race: RaceSerie[] = ["Dólar", "UVA", "Plazo fijo"].map((id, slot) => ({
  id,
  data: Array.from({ length: 14 }, (_unused, index) => ({ x: periodo(index), y: 100 + index * (slot + 1) })),
}));

const legendList = () => screen.queryByRole("list", { name: "referencias" });

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

describe("torta de categorías", () => {
  it("en mobile lista las categorías con su monto debajo y no usa la leyenda de nivo", () => {
    emulateMobile();
    renderWithProviders(<CategoryPie data={categories} currency="ARS" />);
    const items = within(legendList()!).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Compras");
    expect(items[0]).toHaveTextContent(formatMoney(1500, "ARS"));
    expect(chart()).toMatchObject({ legends: 0, margin: { top: 16, right: 16, bottom: 16, left: 16 } });
  });

  it("en compu deja la leyenda de nivo a la derecha", () => {
    emulateDesktop();
    renderWithProviders(<CategoryPie data={categories} currency="ARS" />);
    expect(legendList()).not.toBeInTheDocument();
    expect(chart()).toMatchObject({ legends: 1, margin: { top: 16, right: 150, bottom: 16, left: 16 } });
  });

  it("sin datos en mobile dice Sin datos y no dibuja una leyenda vacía", () => {
    emulateMobile();
    renderWithProviders(<CategoryPie data={[]} currency="ARS" />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(legendList()).not.toBeInTheDocument();
  });

  it("si la pantalla pasa a tamaño compu, la leyenda vuelve a nivo sin duplicarse", () => {
    emulateMobile();
    renderWithProviders(<CategoryPie data={categories} currency="ARS" />);
    expect(legendList()).toBeInTheDocument();
    emulateDesktop();
    expect(legendList()).not.toBeInTheDocument();
    expect(chart().legends).toBe(1);
  });
});

describe("carrera de indicadores", () => {
  it("en mobile lista las series debajo, ralea los meses y recupera el margen de la leyenda", () => {
    emulateMobile();
    renderWithProviders(<MacroRaceChart series={race} />);
    const items = within(legendList()!).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["Dólar", "UVA", "Plazo fijo"]);
    const { legends, margin, tickValues } = chart();
    expect(legends).toBe(0);
    expect(margin).toEqual({ top: 16, right: 24, bottom: 64, left: 48 });
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
  });

  it("en compu queda como siempre", () => {
    emulateDesktop();
    renderWithProviders(<MacroRaceChart series={race} />);
    expect(legendList()).not.toBeInTheDocument();
    expect(chart()).toMatchObject({ legends: 1, tickValues: null, margin: { top: 16, right: 24, bottom: 84, left: 56 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/charts/legendCharts.test.tsx`
Expected: FAIL en los tests de mobile y en el de rotación (no hay `ChartLegend` y `legends` sigue en 1).

- [ ] **Step 3: Implement**

Aplicar las reglas por archivo de arriba a los 6 gráficos.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/charts/ client/src/pages/`
Expected: PASS (6 tests nuevos; `CategoryPie.test.tsx` y las páginas sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/charts/CategoryPie.tsx client/src/components/charts/AmortizationDonutChart.tsx client/src/components/charts/AutoProgressDonutChart.tsx client/src/components/charts/InstallmentsByCategoryChart.tsx client/src/components/charts/MacroRaceChart.tsx client/src/components/charts/PayslipGrossNetChart.tsx client/src/components/charts/legendCharts.test.tsx
git commit -m "feat(client): leyendas debajo del gráfico en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Barras horizontales de comercios

**Files:**
- Modify: `client/src/components/charts/TopMerchantsChart.tsx`, `client/src/components/charts/InstallmentsByMerchantChart.tsx`
- Test: `client/src/components/charts/merchantCharts.test.tsx`

**Interfaces:**
- Consumes: `useChartLayout()`, `truncateLabel()` (Task 1); `NivoProbe`, `probeOf` (Task 4).

En los dos archivos:

```tsx
import { truncateLabel, useChartLayout } from "./useChartLayout.js";

const DESKTOP_MARGIN = { top: 8, right: 24, bottom: 32, left: 136 };
const MOBILE_MARGIN = { top: 8, right: 24, bottom: 8, left: 96 };
const DESKTOP_LABEL_MAX = 16;
const MOBILE_LABEL_MAX = 11;
```

- Borrar la `const truncate` local.
- `const { isMobile } = useChartLayout();` justo después de `useTheme()`, antes del hook de datos.
- Antes del `return`: `const labelMax = isMobile ? MOBILE_LABEL_MAX : DESKTOP_LABEL_MAX;`
- `margin={isMobile ? MOBILE_MARGIN : DESKTOP_MARGIN}`
- `axisBottom={isMobile ? null : { tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), filters.currency) }}` (el objeto de compu es el de hoy; va inline para que nivo tipe `value`)
- `axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => truncateLabel(String(value), labelMax) }}`

El tooltip por defecto de nivo sigue mostrando el nombre completo.

- [ ] **Step 1: Write the failing test**

`client/src/components/charts/merchantCharts.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import { TopMerchantsChart } from "./TopMerchantsChart.js";
import { InstallmentsByMerchantChart } from "./InstallmentsByMerchantChart.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

const merchants = [
  { merchant: "MERCADOLIBRE SUPERMERCADO", total: 1500, count: 3 },
  { merchant: "UBER", total: 800, count: 2 },
];

const detail = [
  {
    month: "2026-06",
    total: 1500,
    count: 1,
    items: [{ merchant: "MERCADOLIBRE SUPERMERCADO", category: "Compras", amount: 1500, installmentNumber: 3, installmentTotal: 4, purchaseDate: "2026-05-04" }],
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.includes("/stats/top-merchants") ? merchants
      : url.includes("/stats/future-installments/detail") ? detail
      : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const chart = async () => probeOf(await screen.findByTestId("nivo-chart"));

describe("barras horizontales de comercios", () => {
  it("en mobile el top de comercios saca el eje de montos y angosta la columna de nombres", async () => {
    emulateMobile();
    renderWithProviders(<TopMerchantsChart currency="ARS" />);
    expect(await chart()).toMatchObject({ axisBottom: "none", margin: { top: 8, right: 24, bottom: 8, left: 96 } });
  });

  it("en compu el top de comercios queda como siempre", async () => {
    emulateDesktop();
    renderWithProviders(<TopMerchantsChart currency="ARS" />);
    expect(await chart()).toMatchObject({ axisBottom: "shown", margin: { top: 8, right: 24, bottom: 32, left: 136 } });
  });

  it("en mobile las cuotas por comercio siguen la misma regla", async () => {
    emulateMobile();
    renderWithProviders(<InstallmentsByMerchantChart currency="ARS" />);
    expect(await chart()).toMatchObject({ axisBottom: "none", margin: { top: 8, right: 24, bottom: 8, left: 96 } });
  });

  it("en compu las cuotas por comercio quedan como siempre", async () => {
    emulateDesktop();
    renderWithProviders(<InstallmentsByMerchantChart currency="ARS" />);
    expect(await chart()).toMatchObject({ axisBottom: "shown", margin: { top: 8, right: 24, bottom: 32, left: 136 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/charts/merchantCharts.test.tsx`
Expected: FAIL en los dos tests de mobile (`axisBottom` sigue en `"shown"` y `left` en 136).

- [ ] **Step 3: Implement**

Aplicar los cambios de arriba a los dos archivos.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/components/charts/ client/src/pages/DashboardPage.test.tsx client/src/pages/InstallmentsPage.test.tsx`
Expected: PASS (4 tests nuevos).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/charts/TopMerchantsChart.tsx client/src/components/charts/InstallmentsByMerchantChart.tsx client/src/components/charts/merchantCharts.test.tsx
git commit -m "feat(client): barras de comercios con nombres cortos y sin eje de montos en mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Acordeón de cuotas y supuestos de Contexto

**Files:**
- Modify: `client/src/pages/InstallmentsPage.tsx`
- Modify: `client/src/pages/InstallmentsPage.test.tsx`
- Modify: `client/src/components/MacroAssumptionsBar.tsx`
- Test: `client/src/components/MacroAssumptionsBar.test.tsx`

**Interfaces:**
- Consumes: `useIsMobile()`; `emulateMobile()`/`emulateDesktop()`.

`client/src/pages/InstallmentsPage.tsx`:
- Import: `import { useIsMobile } from "../useIsMobile.js";`
- En el cuerpo del componente, junto a los demás hooks (antes de cualquier `return`): `const isMobile = useIsMobile();`
- Dentro del `m.items.map(...)` de `AccordionDetails`, el `Chip` se arma una vez y se ubica según el viewport: en mobile va dentro del `Box` del comercio, debajo de la línea de categoría; en compu queda a la izquierda del monto, como hoy. El bloque del ítem queda así:

```tsx
                    {m.items.map((item, index) => {
                      const chip = <Chip size="small" variant="outlined" label={`cuota ${item.installmentNumber}/${item.installmentTotal}`} />;
                      return (
                        <Stack
                          key={`${item.merchant}-${item.purchaseDate}-${item.installmentNumber}`}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ py: 1, borderTop: index === 0 ? "none" : "1px solid", borderColor: "divider", gap: 2 }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography noWrap>{item.merchant}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.category} · compra {item.purchaseDate}
                            </Typography>
                            {isMobile && <Box sx={{ mt: 0.5 }}>{chip}</Box>}
                          </Box>
                          <Stack direction="row" alignItems="center" gap={1.5} sx={{ flexShrink: 0 }}>
                            {!isMobile && chip}
                            <Typography sx={{ fontWeight: 600 }}>{formatMoney(item.amount, filters.currency)}</Typography>
                          </Stack>
                        </Stack>
                      );
                    })}
```

`client/src/components/MacroAssumptionsBar.tsx`:
- Import: `import { useIsMobile } from "../useIsMobile.js";`
- En el cuerpo, después de `useState`: `const isMobile = useIsMobile();` y, antes del `return`, `const toggleOrientation = isMobile ? "vertical" : "horizontal";`
- Los dos `TextField` reciben `fullWidth={isMobile}`.
- El `ToggleButtonGroup` recibe `orientation={toggleOrientation}` y `fullWidth={isMobile}`.

- [ ] **Step 1: Write the failing tests**

En `client/src/pages/InstallmentsPage.test.tsx`:
- Imports: agregar `import { emulateDesktop, emulateMobile } from "../testing/viewport.js";`.
- Cambiar el `afterEach` a `afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });`
- Agregar, dentro del `describe("InstallmentsPage", ...)`:

```tsx
  it("en mobile el chip de la cuota va debajo del comercio", async () => {
    emulateMobile();
    renderWithProviders(<InstallmentsPage />, { route: "/installments" });
    const chip = (await screen.findByText("cuota 3/4")).closest(".MuiChip-root")!;
    expect(chip.parentElement!.parentElement).toHaveTextContent("MERCADOLIBRE");
  });

  it("en compu el chip de la cuota queda al lado del monto", async () => {
    emulateDesktop();
    renderWithProviders(<InstallmentsPage />, { route: "/installments" });
    const chip = (await screen.findByText("cuota 3/4")).closest(".MuiChip-root")!;
    expect(chip.parentElement).not.toHaveTextContent("MERCADOLIBRE");
    expect(chip.parentElement).toHaveTextContent(/1\.500/);
  });
```

En compu, el padre del `Chip` es el `Stack` del monto (`$ 1.500,00`). En mobile, el padre es el `Box` con `mt: 0.5`, y el padre de ese es el `Box` del comercio.

`client/src/components/MacroAssumptionsBar.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { MacroAssumptionsBar } from "./MacroAssumptionsBar.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const assumptions = { inflacionEsperada: 30, tasaAnualPesos: 35, reversionMeses: 12 as const };

const noop = () => undefined;

const reversionGroup = () => screen.getByRole("group", { name: "Horizonte de reversión del dólar" });

const inflationField = () => screen.getByLabelText("Inflación esperada (% anual)").closest(".MuiFormControl-root");

describe("MacroAssumptionsBar", () => {
  it("en mobile apila las opciones de reversión y ocupa todo el ancho", () => {
    emulateMobile();
    renderWithProviders(<MacroAssumptionsBar assumptions={assumptions} onChange={noop} />);
    expect(reversionGroup()).toHaveClass("MuiToggleButtonGroup-vertical");
    expect(reversionGroup()).toHaveClass("MuiToggleButtonGroup-fullWidth");
    expect(inflationField()).toHaveClass("MuiFormControl-fullWidth");
  });

  it("en compu deja las opciones en fila y los campos con su ancho", () => {
    emulateDesktop();
    renderWithProviders(<MacroAssumptionsBar assumptions={assumptions} onChange={noop} />);
    expect(reversionGroup()).toHaveClass("MuiToggleButtonGroup-horizontal");
    expect(reversionGroup()).not.toHaveClass("MuiToggleButtonGroup-fullWidth");
    expect(inflationField()).not.toHaveClass("MuiFormControl-fullWidth");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test client/src/pages/InstallmentsPage.test.tsx client/src/components/MacroAssumptionsBar.test.tsx`
Expected: FAIL en "en mobile el chip de la cuota va debajo del comercio" y en el test mobile de `MacroAssumptionsBar`.

- [ ] **Step 3: Implement**

Aplicar los cambios de arriba a `InstallmentsPage.tsx` y `MacroAssumptionsBar.tsx`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test client/src/pages/InstallmentsPage.test.tsx client/src/components/MacroAssumptionsBar.test.tsx client/src/pages/MacroPage.test.tsx`
Expected: PASS (4 tests nuevos; los demás sin cambios).

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/InstallmentsPage.tsx client/src/pages/InstallmentsPage.test.tsx client/src/components/MacroAssumptionsBar.tsx client/src/components/MacroAssumptionsBar.test.tsx
git commit -m "feat(client): cuotas y supuestos de Contexto acomodados para mobile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación final

**Files:** ninguno (solo verificación; si algo falla, se corrige en el task que corresponde).

- [ ] **Step 1: Suite, tipos y build**

```bash
bun run test
bun run typecheck
bun run build
```

Expected: todo en verde.

- [ ] **Step 2: Servidor propio sin pisar otros**

Otras sesiones y el servicio instalado usan 4000, 4100 y 5173. Con `client/dist` ya construido, levantar el server de este worktree en un puerto libre (por ejemplo 4300; confirmarlo antes con `lsof -nP -iTCP:4300 -sTCP:LISTEN`), con el `.env` del checkout principal copiado al worktree (está ignorado por git):

```bash
PORT=4300 node --env-file=.env --import tsx server/src/index.ts
```

El server sirve el cliente construido y la API en `http://localhost:4300`. Guardar el PID y, al terminar, matar solo ese PID; borrar el `.env` copiado.

- [ ] **Step 3: Revisión visual**

Si la ventana de Chrome no se puede achicar (pantalla completa), emular con iframes del mismo origen de 375×667 y 393×720. Checklist en mobile:

- Dashboard, Cuotas, Créditos, Auto, Sueldo y Contexto: ninguna página tiene scroll horizontal (`document.documentElement.scrollWidth <= clientWidth`) y ningún gráfico de series muestra más de 6 etiquetas de mes, que no se pisan.
- Las tortas y donas ocupan el ancho de la tarjeta y la leyenda está debajo, en varias líneas si hace falta.
- Top de comercios y cuotas por comercio: nombres cortos con "…", sin eje de montos.
- KPIs: ícono más chico y valor más chico que en compu; los cuatro KPIs de Créditos, Auto y Sueldo se ven igual que los del Dashboard.
- Cuotas: el chip "cuota N/M" aparece debajo del comercio.
- Contexto → "Ver supuestos": campos a todo el ancho y las tres opciones de reversión apiladas.
- En 1280px: los gráficos, leyendas, KPIs y tarjetas se ven igual que en `feat/responsive-mobile`.

- [ ] **Step 4: Prueba táctil en el iPhone (la hace el usuario)**

- Tocar un punto o una barra muestra el tooltip.
- Arrancar el scroll con el dedo sobre un gráfico no lo bloquea.
- Los tooltips no se cortan contra el borde derecho.

Si alguno falla, se ajusta en el gráfico afectado (por ejemplo `enableTouchCrosshair` en las líneas, o un ancho máximo para el tooltip).

Reportar al usuario el resultado de los Steps 1–3 con capturas y dejarle el checklist del Step 4.
