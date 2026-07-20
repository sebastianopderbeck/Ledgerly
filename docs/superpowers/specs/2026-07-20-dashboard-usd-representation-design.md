# Representación en USD en el Dashboard (pago de tarjeta, total gastado y gráfico mensual) — Design Spec

**Fecha:** 2026-07-20
**Estado:** Aprobado para escribir plan de implementación.

## Goal

Agregar en el Dashboard de tarjetas la equivalencia aproximada en dólares de:
1. **El pago de la tarjeta al cierre** (`CardCycleSummary`): "≈ U$S" del total en pesos.
2. **El "Total gastado"** (`KpiCards`): "≈ U$S" como dato secundario.
3. **Un gráfico nuevo** de gasto mensual en USD.

Las cifras puntuales (1 y 2) usan **un único dólar oficial actual**. El gráfico (3) usa el **oficial histórico de cada mes**, para reflejar el poder de compra real en dólares (curva distinta a la de pesos por la devaluación). El tipo de cambio es el **dólar oficial (venta)**, el mismo que ya usan Créditos y Auto vía `fetchOficialRate`.

## Architecture

**Híbrido liviano, sin cambios de modelo ni re-import.** No se persiste tipo de cambio por statement. Se agregan dos endpoints de lectura que consultan `server/src/fx/dollarRate.ts` (`fetchOficialRate`, dólar oficial venta con lookback de 7 días):
- Uno devuelve el oficial **actual** (para las cifras puntuales).
- Otro devuelve la serie **mensual** de gasto en USD (ARS por mes ÷ oficial del mes).

El cliente consume ambos vía hooks de TanStack Query con `staleTime` alto (el oficial no cambia seguido; evita recomputar en cada navegación).

**Alternativa descartada:** guardar `tipoCambioUsd` por `Statement` al importar (como los cupones de Créditos/Auto). Más consistente pero pesado (cambio de modelo + mapper + fetch en import + backfill + re-import de lo ya cargado) y de más para una vista "aproximada".

**Piezas reutilizadas tal cual:** `fetchOficialRate` (fx), `baseMatch`/agregaciones de `stats.ts`, `asyncHandler`, `formatMoney`/`formatMoneyCompact`, `seriesColor`/`nivoTheme`, `ChartCard`, motion (`MotionBox`, `fadeUpItem`), `apiFetch` (prefija `/api`), el patrón `sub` de `CreditKpiCards`.

**Tech stack:** TS/ESM (imports `.js`, tipos desde `@ledgerly/shared`, sin `any`), Express + Mongoose (server), React 18 + MUI v6 + TanStack Query v5 + Nivo + framer-motion (client), Zod (shared), Vitest + supertest + mongodb-memory-server + RTL. `globalThis.fetch` para el dólar.

## Data findings

- `fetchOficialRate(dateIso, maxLookbackDays = 7): Promise<number | null>` devuelve el `venta` del oficial, retrocediendo hasta 7 días (fines de semana/feriados), o `null` si la API falla. No devuelve la fecha efectiva del match.
- `/stats/monthly` ya agrega `{ month: "YYYY-MM", total, count }` de `type: "purchase"` filtrando por moneda (default ARS), con `from`/`to`/`cardLabel` opcionales (`baseMatch`).
- `/stats/summary` devuelve `totalPurchases` en la moneda seleccionada (ARS por defecto). El "≈ U$S" sólo aplica cuando `currency === "ARS"`.
- `CardCycleSummary` ya calcula `totalArs` (Σ `saldoActual.ars`) y `totalUsd` (Σ `saldoActual.usd`, en la práctica sólo Visa). El "≈ U$S" nuevo convierte `totalArs`; el `totalUsd` real (consumos en dólares de Visa) se mantiene pero como dato secundario, para no confundir equivalencia con saldo real.
- El servidor puede leer la fecha de hoy con `new Date().toISOString().slice(0,10)` (no aplica la restricción de scripts de workflow).

## Naming

- **Shared:** `oficialRateDtoSchema` → `OficialRateDTO`; `monthlyUsdStatSchema` → `MonthlyUsdStat`.
- **Server:** `server/src/http/routes/fx.ts` (`fxRouter`, montado en `/api/fx`); `server/src/stats/monthlyUsd.ts` (`representativeRateDate`); ruta `GET /api/stats/monthly-usd`.
- **Client:** hooks `useOficialRate`, `useMonthlyUsd`; componente `client/src/components/charts/MonthlyUsdChart.tsx`.

## Interfaces (contratos)

```ts
// shared/src/dtos.ts
export const oficialRateDtoSchema = z.object({
  date: z.string(),                 // YYYY-MM-DD consultada (hoy)
  rate: z.number().nullable(),      // venta oficial; null si la API falla
  source: z.literal("oficial"),
});
export const monthlyUsdStatSchema = z.object({
  month: z.string(),                // YYYY-MM
  totalArs: z.number(),
  rate: z.number().nullable(),      // oficial del mes; null si no hay dato
  totalUsd: z.number().nullable(),  // totalArs / rate; null si rate null
});
export type OficialRateDTO = z.infer<typeof oficialRateDtoSchema>;
export type MonthlyUsdStat = z.infer<typeof monthlyUsdStatSchema>;
```

```ts
// server/src/stats/monthlyUsd.ts
export function representativeRateDate(month: string, todayIso: string): string;
// month "YYYY-MM" → último día del mes en ISO, tope hoy (para meses en curso).
```

## Componentes (unidades)

### 1. Shared — contratos
Agregar `oficialRateDtoSchema` y `monthlyUsdStatSchema` (+ tipos) a `dtos.ts`. Test en `dtos.test.ts` (valida un DTO de cada uno, incluyendo `rate: null`).

### 2. Server — FX endpoint (`routes/fx.ts`)
`GET /oficial`: `date = hoy`; `rate = await fetchOficialRate(date)`; responde `{ date, rate, source: "oficial" }`. Registrar `app.use("/api/fx", fxRouter)` en `app.ts`. Test con supertest + `fetch` mockeado: caso OK (rate numérico) y caso API caída (`rate: null`).

### 3. Server — `representativeRateDate` (puro) + `GET /stats/monthly-usd`
- `representativeRateDate(month, todayIso)`: último día del mes (`new Date(Date.UTC(y, m, 0)).getUTCDate()`), y si supera `todayIso` devuelve `todayIso`. Unit test: mes pasado → fin de mes; mes en curso → hoy.
- Ruta: agrega gasto **ARS** (`type: "purchase"`, moneda ARS forzada) por mes con `$dateToString %Y-%m`, ordenado; para cada mes `rate = await fetchOficialRate(representativeRateDate(month, hoy))`; arma `{ month, totalArs, rate, totalUsd: rate ? totalArs/rate : null }`. Respeta `from`/`to`/`cardLabel`. Test con supertest + `withDb` + `fetch` mockeado (rate constante → totalUsd = totalArs/rate; y un mes con `rate: null` → `totalUsd: null`).

### 4. Client — hooks
`useOficialRate()` → `/fx/oficial`; `useMonthlyUsd(f: StatFilters)` → `/stats/monthly-usd${qs(f)}`. Ambos con `staleTime: 1000 * 60 * 60`.

### 5. Client — `CardCycleSummary`
Consume `useOficialRate()`. Si `rate`: bajo el total ARS, `≈ ${formatMoney(totalArs / rate, "USD")}` (variant `h6`, `color text.secondary`) + caption `al oficial ${formatMoney(rate, "ARS")}`. El `totalUsd` real (si `> 0`) pasa a caption chico `+ ${formatMoney(totalUsd, "USD")} en dólares`. Si no hay `rate`, no se muestra el "≈".

### 6. Client — `KpiCards`
Agregar `sub?: string` al `Kpi` interno (espejo de `CreditKpiCards`, con `<Typography variant="caption">`). Consumir `useOficialRate()`. En "Total gastado", `sub = filters.currency === "ARS" && rate ? \`≈ ${formatMoney(totalPurchases / rate, "USD")}\` : undefined`.

### 7. Client — `MonthlyUsdChart` + Dashboard
`MonthlyUsdChart` (patrón `MonthlyTrendChart`, recibe `StatFilters`): `useMonthlyUsd(filters)`; serie con los puntos donde `totalUsd != null` (`x: month`, `y: totalUsd`); ejes/tooltip en `"USD"`. Empty state "Sin datos". En `DashboardPage`, nuevo `ChartCard` **"Gasto mensual en USD (al oficial de cada mes)"** en la grilla, pasándole `filters`.

## Test strategy

Vitest, sin red real (mock de `fetch`/`fetchOficialRate` según capa).
- **Unit:** `representativeRateDate` (mes pasado y mes en curso).
- **Server:** `routes/fx.test.ts` (OK + `rate: null`); `stats.test.ts` gana casos de `/monthly-usd` (conversión con rate constante y mes con `rate: null`).
- **Client:** `dtos.test.ts` (schemas nuevos); `CardCycleSummary.test.tsx` (aparece "≈ U$S" cuando `/fx/oficial` da rate); `DashboardPage.test.tsx` (título "Gasto mensual en USD (al oficial de cada mes)" y `sub` "≈ U$S" en Total gastado, agregando las rutas `/fx/oficial` y `/stats/monthly-usd` al mock).
- Cierre: `bun run typecheck` + `bun run test`.

## Fuera de alcance
- Persistir tipo de cambio por `Statement`; re-import.
- Otros dólares (MEP/blue/tarjeta).
- Devolver la fecha efectiva del oficial (se consulta "hoy"/fin de mes; el lookback resuelve fines de semana pero no se reporta la fecha exacta del match).
- Caché de cotizaciones en el servidor (se apoya en el `staleTime` de TanStack Query en el cliente).

## Decisiones abiertas (menores)
- **Fecha representativa del mes:** último día del mes (tope hoy). Alternativa: mediados de mes.
- **Tipo de gráfico USD:** línea/área como `MonthlyTrendChart`. Alternativa: barras.
