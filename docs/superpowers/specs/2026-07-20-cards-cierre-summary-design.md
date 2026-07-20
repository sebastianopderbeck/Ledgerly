# Resumen "A pagar al cierre" — Tarjetas de crédito (Dashboard) — Design Spec

**Fecha:** 2026-07-20
**Estado:** Aprobado para escribir plan de implementación.

## Goal

En el **Dashboard de tarjetas de crédito** (`DashboardPage`), mostrar un resumen de **cuánto hay que pagar al cierre**, combinando los dos bancos (`visa_signature` e `icbc`). El punto clave: **no** se alinea al mes calendario, sino que toma el **último corte de cada tarjeta** (el resumen con `closingDate` más reciente por banco) y **suma** ambos. Responde a la pregunta "¿cuánto debería pagar de tarjeta de crédito al momento del cierre?".

El importe principal es el **saldo actual** (`totals.saldoActual`) de cada tarjeta — la deuda total del resumen (incluye arrastre del saldo anterior), no sólo los consumos del período. Se muestra:
- **Total combinado** en ARS y USD.
- **Desglose por banco** (monto de cada tarjeta por separado): saldo actual (ARS + USD), fecha de corte, fecha de vencimiento y pago mínimo.
- **Gráfico de barras por banco**: una barra apilada horizontal donde cada segmento es el aporte de una tarjeta al total en ARS.

## Architecture

**Derivación 100% en el cliente, sin cambios en el backend.** `GET /api/statements` ya devuelve todos los resúmenes ordenados por `closingDate` desc y ya existe el hook `useStatements()`. La lógica de "último corte por banco + combinación" vive en un **módulo puro y testeable** (`client/src/cardCycle.ts`), espejando el patrón ya usado por `client/src/autoConcepts.ts` (función pura + `.test.ts`, sin red). La UI (chart + tarjeta contenedora) sólo consume ese módulo.

**Alternativas descartadas:**
- **Endpoint dedicado** `GET /api/statements/current-cycle` (DTO + schema Zod + router + mapper + tests): sobredimensionado para una agregación mínima cuyos datos ya están en el cliente.
- **Extender `/api/stats/summary`**: ese endpoint es agregación de **transacciones** por moneda y filtrada por rango/tarjeta; encaje semántico malo (el resumen de cierre es por **statement**, siempre el último corte, sin filtros).

**Tech stack (igual que el resto del cliente):** React 18 + MUI v6 (`sx`) + TanStack Query v5 + Nivo (`@nivo/bar`) + framer-motion. TS/ESM (imports relativos con `.js`, tipos desde `@ledgerly/shared`, sin `any`). Vitest + RTL. Sin lodash directo (sólo transitivo vía nivo) → TS plano, como `autoConcepts.ts`.

## Data findings (modelo real)

`StatementDoc` / `StatementDTO` (ver `server/src/db/models.ts`, `shared/src/dtos.ts`):
- `issuer`: `"visa_signature" | "icbc"` — los **dos bancos**.
- `cardLabel: string`, `last4: string | null`.
- `closingDate: string | null` (corte, `YYYY-MM-DD`), `dueDate: string | null` (vencimiento).
- `totals`: `{ totalConsumos, saldoActual, pagoMinimo, saldoAnterior }`, cada uno `{ ars: number, usd: number }`.

**Hallazgos que condicionan el diseño (de los parsers `visaSignature.ts` / `icbc.ts`):**

1. **Asimetría de moneda.** Visa Signature captura `saldoActual` en **ARS y USD** (`SALDO ACTUAL $ ... U$S ...`). ICBC captura `saldoActual` **sólo en ARS** (`saldoActual.usd` queda hardcodeado en `0`). → El `totalUsd` combinado, en la práctica, proviene sólo de Visa. La UI muestra USD por tarjeta **sólo si `saldoActualUsd > 0`**, pero el total USD siempre se muestra si es > 0.
2. **`pagoMinimo.usd` es `0` en ambos parsers.** → El pago mínimo se muestra únicamente en ARS.
3. **`GET /api/statements` ya ordena por `closingDate: -1`.** La derivación **no** depende de ese orden (ordena internamente por robustez y testabilidad), pero es consistente.
4. **`closingDate` puede ser `null`.** Al elegir el último corte por banco, los `null` van al final; si el único statement de un banco tiene `closingDate` null, igual se usa (mejor mostrarlo que ocultarlo).
5. Un banco puede **no tener** resúmenes importados. La derivación incluye sólo los bancos con al menos un statement; si no hay ninguno, el resumen es `null` y el componente no renderiza nada.

## Naming

- **Módulo de lógica:** `client/src/cardCycle.ts` (+ `client/src/cardCycle.test.ts`).
- **Chart:** `client/src/components/charts/CardCycleChart.tsx`.
- **Contenedor:** `client/src/components/CardCycleSummary.tsx`.
- Título visible: **"A pagar al cierre"**.

## Interfaces (contratos)

```ts
// client/src/cardCycle.ts
import type { Issuer, StatementDTO } from "@ledgerly/shared";

export interface CardCycleEntry {
  issuer: Issuer;
  cardLabel: string;
  last4: string | null;
  saldoActualArs: number;
  saldoActualUsd: number;
  pagoMinimoArs: number;
  closingDate: string | null; // YYYY-MM-DD
  dueDate: string | null;     // YYYY-MM-DD
}

export interface CardCycleSummary {
  cards: CardCycleEntry[]; // un elemento por banco con statements, ordenado por closingDate desc (nulls al final)
  totalArs: number;        // Σ saldoActualArs
  totalUsd: number;        // Σ saldoActualUsd (en la práctica sólo Visa)
  totalPagoMinimoArs: number; // Σ pagoMinimoArs
}

// El último statement (closingDate máximo, nulls al final) de cada issuer.
export function latestStatementPerIssuer(statements: StatementDTO[]): StatementDTO[];

// null si no hay statements.
export function buildCardCycleSummary(statements: StatementDTO[]): CardCycleSummary | null;

// Datos para el ResponsiveBar apilado horizontal (una sola fila).
export interface CardCycleBarData {
  keys: string[];                        // una key por tarjeta = cardLabel
  row: Record<string, string | number>; // { label: "A pagar", [cardLabel]: saldoActualArs, ... }
}
export function buildCardCycleBarData(cards: CardCycleEntry[]): CardCycleBarData;
```

## Componentes (unidades)

### 1. `client/src/cardCycle.ts` (lógica pura)
- `latestStatementPerIssuer`: agrupa por `issuer`; dentro de cada grupo ordena por `closingDate` desc con **nulls al final** y toma el primero. Devuelve un array ordenado por `closingDate` desc entre bancos (el corte más reciente primero). Comparación de fechas por string ISO `YYYY-MM-DD` (orden lexicográfico == cronológico).
- `buildCardCycleSummary`: `null` si `statements` está vacío. Mapea cada último statement a `CardCycleEntry` (leyendo `totals.saldoActual.{ars,usd}` y `totals.pagoMinimo.ars`), y suma `totalArs`/`totalUsd`/`totalPagoMinimoArs`.
- `buildCardCycleBarData`: `keys = cards.map(c => c.cardLabel)`; `row = { label: "A pagar", ...Object.fromEntries(cards.map(c => [c.cardLabel, c.saldoActualArs])) }`. (Asume labels distintos entre bancos — se cumple: `visa_signature` vs `icbc`.)

### 2. `client/src/components/charts/CardCycleChart.tsx`
- Presentacional puro: recibe `cards: CardCycleEntry[]` por props (no llama hooks). Si `cards` vacío → `null`.
- `ResponsiveBar` (`@nivo/bar`) **`layout="horizontal"`, apilado**, una sola fila: `data={[row]}`, `keys`, `indexBy="label"`.
- Estilo del patrón `AutoCompositionChart`: `colors = keys.map((_, i) => seriesColor(theme.palette.mode, i))`, `theme={nivoTheme(theme)}`, `motionConfig="gentle"`, `enableGridY={false}`, ejes sin ticks; eje inferior `format: v => formatMoneyCompact(Number(v), "ARS")`.
- Tooltip: `cardLabel` + `formatMoney(value, "ARS")` (mismo formato que `AutoCompositionChart`).
- Altura contenida (~`120px`, una sola barra).

### 3. `client/src/components/CardCycleSummary.tsx` (contenedor)
- Llama `useStatements()`, deriva con `buildCardCycleSummary`. Si `null` → `null` (igual que `KpiCards`).
- `Card`/`CardContent` envuelto en `MotionBox` (`fadeUpItem`), coherente con `ChartCard`. Layout:
  - Header **"A pagar al cierre"** + **total combinado**: ARS grande (`formatMoney(totalArs, "ARS")`); `U$S` secundario (`formatMoney(totalUsd, "USD")`) sólo si `totalUsd > 0`.
  - `<CardCycleChart cards={summary.cards} />`.
  - **Desglose por tarjeta** (grid `1fr` xs / `repeat(N,1fr)` sm+): por cada `card` → `cardLabel` + `•••• last4`; `saldoActualArs` (`formatMoney` ARS) y, si `saldoActualUsd > 0`, `· U$S ...`; línea `corte {closingDate} · vence {dueDate}` (fechas `—` si null); `mín. {formatMoney(pagoMinimoArs,"ARS")}`.

### 4. Integración — `DashboardPage.tsx`
- Renderizar `<CardCycleSummary />` **debajo del `<Typography h4>Dashboard</Typography>` y por encima de `<FiltersBar />`**, para separar "a pagar al cierre" (independiente de filtros) de los analytics filtrables de abajo.
- Sin cambios de ruta ni de nav (mismo Dashboard).

## Test strategy

- **`client/src/cardCycle.test.ts`** (Vitest, sin red), con fixtures mínimos de `StatementDTO`:
  1. Dos bancos → `cards` con 2 entradas, `totalArs`/`totalUsd`/`totalPagoMinimoArs` = sumas; orden por `closingDate` desc.
  2. Varios statements por banco → elige el de `closingDate` más reciente por banco.
  3. Un solo banco → 1 entrada.
  4. Sin statements → `null`.
  5. `closingDate` null → va al final del orden; no rompe.
  6. `totalUsd` sale sólo de Visa (ICBC aporta 0).
  7. `buildCardCycleBarData`: `keys` = labels, `row` tiene `saldoActualArs` por label.
- **`CardCycleChart`** es presentacional; su cobertura efectiva va vía el test de `CardCycleSummary` (opcional, RTL) verificando total combinado y una línea de desglose. Prioridad: el test del módulo puro.
- Cierre: `bun run typecheck` + `bun run test`.

## Fuera de alcance

- Cambios en backend, parsers o modelo (la asimetría USD de ICBC se documenta, no se corrige acá).
- Proyección de próximos cierres o histórico de cierres (esto es sólo el **último** corte por tarjeta).
- Conversión ARS↔USD (se muestran los saldos tal como vienen del resumen).
- Dependencia de los filtros del Dashboard (moneda/fecha/tarjeta) — el resumen es siempre el último corte, ambas monedas.
- Otros bancos/issuers más allá de los dos actuales (el diseño escala a N bancos sin cambios, pero no se agrega ninguno).

## Decisiones abiertas (menores, ajustables al implementar)

- **Labels dentro de la barra:** por defecto `enableLabel={false}` (como `AutoCompositionChart`); los montos van en el desglose y el tooltip. Se puede activar `label = formatMoneyCompact` por segmento si se prefiere.
- **Orden del desglose:** mismo orden que la barra (corte más reciente primero).
