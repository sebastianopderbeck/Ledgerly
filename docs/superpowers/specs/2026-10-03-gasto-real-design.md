# Gasto ajustado por inflación — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo)

## Objetivo

Hoy el Dashboard muestra el gasto mensual de tarjeta solo en **valores nominales** («Evolución
mensual»). Con 2-3 % de inflación por mes, esa línea sube aunque se consuma lo mismo, así que no
sirve para responder la pregunta que importa: **¿estoy consumiendo más de verdad, o es solo
inflación?**

Este diseño llena la tarjeta **«Gasto real (pesos de hoy)»** del Dashboard, que la base
(`feat/base-nuevas-features`) ya dejó ubicada al lado de «Evolución mensual» con el stub
`RealSpendingPanel`. La tarjeta:

1. grafica el mismo gasto mensual **deflactado a pesos del último mes con IPC publicado**, junto con
   la línea nominal, para ver la brecha que se come la inflación;
2. muestra dos lecturas del mes de referencia: **variación real interanual** (contra el mismo mes del
   año anterior) y **variación real contra el promedio de los 12 meses anteriores**;
3. respeta los filtros globales del Dashboard (Año, Moneda, Tarjeta, Mes).

Es una feature **solo de cliente**: todos los datos ya se exponen por la API.

## Qué trae la base y qué agrega esta feature

| Pieza | Dónde | Estado |
|---|---|---|
| Slot `<ChartCard title="Gasto real (pesos de hoy)"><RealSpendingPanel {...filters} /></ChartCard>` después de «Evolución mensual» | `client/src/pages/DashboardPage.tsx` | en la base, **no se toca** |
| Stub `RealSpendingPanel` / `RealSpendingPanelProps = StatFilters` | `client/src/components/RealSpendingPanel.tsx` | en la base; esta feature lo **reemplaza** |
| Deflactor `buildDeflator(inflation): Deflator \| null` e interfaz `Deflator { pesosDe; factor(periodo) }` | `client/src/inflationIndex.ts` (con tests) | en la base, **no se toca** |
| Aritmética de meses `addMonths(mes, n)`, `lastDayOfMonth(mes)`, `monthOf(fecha)` | `client/src/isoDate.ts` (con tests) | en la base, **no se toca** |
| `formatSignedPercent(value)` | `client/src/format.ts` (con tests) | en la base, **no se toca** |
| `latestStatementPerIssuer` | `client/src/cardCycle.ts` | existente, **no se toca** |
| Hooks `useMonthly`, `useFutureInstallmentsDetail`, `useStatements`, `useInflation` | `client/src/api/hooks.ts` | existentes, **no se tocan** |
| `deflateToLatest` pasa a usar `buildDeflator` | `client/src/realSalary.ts` | **esta feature** |
| Cobertura de resúmenes, motor, hook, gráfico, encabezado y contenedor | módulos nuevos (ver abajo) | **esta feature** |
| Mock de fetch y asserts del Dashboard | `client/src/pages/DashboardPage.test.tsx` | **esta feature** |

El borrador original proponía `client/src/deflate.ts` (`buildDeflator`) y `client/src/months.ts`
(`shiftMonth`). La base ya los resolvió en módulos compartidos, así que **no se crean**: se usan
`buildDeflator` de `inflationIndex.ts` y `addMonths` / `lastDayOfMonth` de `isoDate.ts`.

## Decisiones tomadas

- **Misma base que «Evolución mensual».** El gasto de un mes son las compras (`type: "purchase"`)
  agrupadas por mes de `transactions.date`, que es lo que devuelve `GET /api/stats/monthly`. Así las
  dos tarjetas, una al lado de la otra, hablan del mismo gasto.
- **Se suman las cuotas que faltan facturar al mes de compra.** Una compra en cuotas guarda la fecha
  de compra en cada cuota, así que el mes de compra solo junta las cuotas ya facturadas. Sin
  corregirlo, los meses recientes salen siempre bajos y la variación interanual da una caída que no
  existe. Se suman las cuotas pendientes del último resumen de cada tarjeta
  (`GET /api/stats/future-installments/detail`) al mes de su `purchaseDate`. Con cuotas sin interés,
  facturadas más pendientes suman el precio de la compra: el gasto del mes pasa a ser **lo que se
  compró ese mes, a precio completo**.
- **Mismo método de deflación que Sueldo real.** Se usa el IPC mensual de `InflationRate` y se lleva
  todo a pesos del último mes con IPC publicado con `buildDeflator` (`client/src/inflationIndex.ts`),
  que reproduce la fórmula de `deflateToLatest`. Para no tener dos copias de la fórmula,
  `deflateToLatest` (`client/src/realSalary.ts`) pasa a usar `buildDeflator` sin cambiar su firma ni
  su comportamiento (`realSalary.test.ts` sin cambios).
- **Solo se grafican meses completos y con IPC.** Un mes entra si todos sus días ya están cubiertos
  por resúmenes importados de **todas** las tarjetas en alcance y si su IPC ya salió. Así quedan
  afuera el mes en curso (que tiene unos pocos días), el mes que todavía espera el resumen de la otra
  tarjeta y los meses anteriores al primer resumen (que solo juntan restos de cuotas viejas). El
  gráfico termina antes que «Evolución mensual», y el texto debajo del título dice hasta qué mes
  llegan los pesos.
- **El inicio de la cobertura también pide todas las tarjetas.** El borrador tomaba como primer mes
  el del cierre más viejo de cualquier tarjeta. Se cambia por el **más reciente de los primeros
  cierres de cada emisor**: es la misma regla que el final («cada emisor lo cubre») y evita graficar
  meses en los que una tarjeta todavía no tenía resúmenes importados y solo aportaba restos de
  cuotas. Si una tarjeta se sacó más tarde, la historia anterior se ve filtrando por Tarjeta.
- **Dos lecturas, no una.** «Interanual» compara contra el mismo mes del año anterior y no la afecta
  la estacionalidad (diciembre contra diciembre). «Vs promedio» compara contra el promedio de los 12
  meses anteriores (mínimo 3) y sirve aunque todavía no haya un año de historia.
- **Mes de referencia = último mes graficado dentro del filtro.** Con el año actual es el último mes
  completo; con 2025 es diciembre de 2025; con un Mes elegido es ese mes.
- **Las comparaciones miran la historia completa.** El filtro de año recorta lo que se **grafica**,
  pero la interanual de enero 2026 usa enero 2025 aunque 2025 no esté elegido.
- **Solo pesos.** Deflactar consumos en dólares con el IPC no tiene sentido. Con Moneda USD la
  tarjeta muestra un mensaje y no pide datos.
- **Sin KPI nuevo en la fila de arriba.** `KpiCards` tiene 4 tarjetas en una `KpiGrid` pensada para 3
  o 4 (`cardCount: 3 | 4`). Una quinta quedaría sola en una fila, y los KPIs de arriba son sumas del
  período, no variaciones. Las dos lecturas van como encabezado **dentro** de la tarjeta nueva.
- **Color de las variaciones:** si el gasto real sube, `warning.main`; si baja, `success.main`; si es
  0 o no hay dato, color de texto normal. Gastar menos en términos reales es lo favorable. El signo
  (`+` / `−`) siempre acompaña al color, así que la dirección no depende solo del color.
- **Gráfico de dos líneas en la misma escala desde 0:** «Real» (color de la serie 4, el mismo de
  «Sueldo real») y «Nominal» (color de la serie 0, el mismo de «Evolución mensual»). La brecha entre
  las dos es la inflación. Un solo eje (los dos son pesos), nunca doble eje.
- **Puntos de 8 px con relleno del fondo**, como `MonthlyTrendChart` (el borrador decía 6 px): es la
  convención del repo y el mínimo legible para un marcador.
- **Error de red = mensaje, no gráfico vacío.** Si alguna de las cuatro llamadas falla, la tarjeta
  dice «No se pudo calcular el gasto real» con un retorno temprano (CLAUDE.md: errores con retorno
  temprano). El borrador no lo contemplaba.
- **Meses sin consumos = sin dato, no cero.** `/stats/monthly` no devuelve meses vacíos, y un hueco
  casi siempre es un resumen sin importar, no un mes sin compras.
- **Cobertura con varias tarjetas:** un mes está cerrado cuando el último resumen de **cada** emisor
  lo cubre. Se asume, igual que `CardCycleSummary`, que todas las tarjetas con resúmenes siguen
  activas.
- **Paleta validada.** Con el validador del skill de dataviz, el par claro (`#db2777`, `#0891b2`)
  pasa todos los chequeos sobre `#ffffff`; el oscuro (`#f472b6`, `#22d3ee`) pasa separación para
  daltonismo (ΔE 8,5), visión normal (ΔE 29,8) y contraste sobre `#131a2a`, y queda más claro que la
  banda de luminosidad sugerida. Es la paleta oscura de todo el repo (`palette.ts`); cambiarla es
  ajeno a esta feature.
- **Sin cambios de server ni de shared.**

## Datos

Todo sale de colecciones y endpoints que ya existen. No hay modelos, DTOs ni rutas nuevas.

| Dato | Colección (`server/src/db/models.ts`) | Endpoint | Tipo (`shared/src/dtos.ts`) |
|---|---|---|---|
| Compras por mes de compra | `transactions` (`TransactionModel`: `date`, `amount`, `currency`, `type`, `cardLabel`) | `GET /api/stats/monthly?currency=ARS[&cardLabel]` (`statsRouter`, `server/src/http/routes/stats.ts`, `baseMatch` + `$dateToString "%Y-%m"` sobre `date`) | `MonthlyStat { month, total, count }` |
| Cuotas pendientes | `transactions` del último resumen por emisor (`isInstallment`, `installmentCurrent`, `installmentTotal`, `date`) | `GET /api/stats/future-installments/detail?currency=ARS[&cardLabel]` (`latestStatementInstallmentTxs` + `computeFutureInstallmentsDetail`, `server/src/stats/futureInstallments.ts`) | `FutureInstallmentMonth { month, total, count, items: FutureInstallmentItem[] }`, con `items[].purchaseDate` (= `tx.date`, `YYYY-MM-DD`) y `items[].amount` |
| Cobertura de resúmenes | `statements` (`StatementModel`: `issuer`, `cardLabel`, `closingDate`) | `GET /api/statements` | `StatementDTO` (`closingDate: "YYYY-MM-DD" \| null`) |
| IPC | `inflationrates` (`InflationRateModel`: `periodo`, `variacionMensual`) | `GET /api/inflation` | `InflationRateDTO { periodo, variacionMensual }` |

Notas:

- Las dos llamadas de stats van **sin `year` y sin `from`/`to`**: hace falta la historia completa para
  la interanual, y en `future-installments/detail` el `year` filtra por mes de **vencimiento**, no
  de compra. El recorte por Año y Mes se hace en el cliente.
- `useMonthly({ currency: "ARS", cardLabel })` tiene el mismo `queryKey` que la llamada de
  `useTransactionYearOptions` (`client/src/filters/useYearOptions.ts`) con Moneda ARS: no suma
  request. `useStatements()` ya lo pide `CardCycleSummary` en el mismo Dashboard. Las requests nuevas
  del Dashboard son `/inflation` (`staleTime` 1 h) y `/stats/future-installments/detail` sin `year`.
- Mes de compra de una cuota pendiente: `monthOf(item.purchaseDate)`. Hay una entrada por cada
  cuota futura, así que sumar `amount` por ese mes da el total pendiente de las compras de ese mes.

## Cálculo

Todo vive en módulos puros del cliente, sin React ni red, con el mismo patrón que `realSalary.ts` e
`inflationStats.ts`.

### `client/src/realSalary.ts` (refactor)

`deflateToLatest` arma el `Deflator` con `buildDeflator(inflation)` (de `./inflationIndex.js`) y
devuelve `netoReal = neto × factor(periodo)`, ordenado por `periodo`. Sin IPC o sin recibos → `[]`.
Firma y tests sin cambios.

### `client/src/statementCoverage.ts` (nuevo)

```ts
export interface MonthRange { desde: string; hasta: string }

export function completeMonthRange(statements: StatementDTO[]): MonthRange | null
```

1. Se descartan los resúmenes con `closingDate === null`. Si no queda ninguno → `null`.
2. Se agrupan por `issuer`. El primer cierre de cada emisor cubre desde el cierre anterior (~un mes
   antes) hasta su cierre, así que **su** mes de cierre queda cubierto desde el día 1; el mes
   anterior no. `desde` = el **mayor** de los meses del primer `closingDate` de cada emisor.
3. `cierreComún` = el **menor** de los últimos `closingDate` de cada emisor (mismo agrupamiento por
   `issuer` que `latestStatementPerIssuer` de `client/src/cardCycle.ts`; el primer y el último cierre
   de cada emisor salen de una sola pasada). Es la fecha hasta la que **todas** las tarjetas tienen
   resumen.
4. `hasta` = mes de `cierreComún` si `cierreComún === lastDayOfMonth(mes)`; si no, el mes anterior
   (`addMonths(mes, -1)`).
5. Si `hasta < desde` → `null`. Un solo resumen que no cierra a fin de mes no deja ningún mes
   completo.

Ejemplos: Visa con último cierre `2026-10-02` e ICBC con `2026-09-07` → `cierreComún = 2026-09-07`
→ `hasta = 2026-08`. Cuando se importa el ICBC de `2026-10-07` → `hasta = 2026-09`. Visa con
primer cierre `2025-03-02` e ICBC con primer cierre `2025-06-07` → `desde = 2025-06`.

### `client/src/realSpending.ts` (nuevo)

```ts
export const MIN_MESES_PROMEDIO = 3;

export interface RealSpendingPoint { month: string; nominal: number; real: number }

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

export interface RealSpendingScope { cardLabel?: string; years?: string[]; from?: string; to?: string }

export interface RealSpendingView {
  pesosDe: string | null;
  points: RealSpendingPoint[];
  summary: RealSpendingSummary | null;
}

export function pendingByPurchaseMonth(detail: FutureInstallmentMonth[]): Map<string, number>
export function realSpendingSeries(
  monthly: MonthlyStat[], pending: Map<string, number>, deflator: Deflator, range: MonthRange,
): RealSpendingPoint[]
export function summarizeRealSpending(series: RealSpendingPoint[], month: string): RealSpendingSummary | null
export function buildRealSpendingView(input: RealSpendingInput, scope: RealSpendingScope): RealSpendingView
```

**`pendingByPurchaseMonth`** — recorre `detail[].items[]` y suma `amount` en
`monthOf(purchaseDate)`.

**`realSpendingSeries`** — serie completa (sin recorte de filtros):

```
tope          = min(range.hasta, deflator.pesosDe)
nominal(m)    = monthly(m).total + pending(m)          (pending ausente = 0)
real(m)       = nominal(m) × deflator.factor(m)
```

Solo meses de `monthly` con `range.desde <= m <= tope`, ordenados por `month`. Un mes que tiene
pendientes pero no está en `monthly` no puede existir (toda cuota pendiente sale de una transacción
de ese mes), así que solo se recorre `monthly`.

**`summarizeRealSpending(series, M)`**:

```
interanual  = (real(M) / real(M − 12) − 1) × 100        si M − 12 está en la serie y real(M − 12) > 0; si no, null
ventana     = puntos de la serie con M − 12 <= m < M
promedio    = media de real sobre la ventana
vsPromedio  = (real(M) / promedio − 1) × 100            si ventana.length >= MIN_MESES_PROMEDIO y promedio > 0; si no, null
mesesPromedio = ventana.length
```

`M − 12` es `addMonths(M, -12)`. `M` fuera de la serie → `null`. Los meses que faltan en la ventana
no cuentan como cero.

**`buildRealSpendingView(input, scope)`**:

1. `deflator = buildDeflator(input.inflation)`; si es `null` → `{ pesosDe: null, points: [], summary: null }`.
2. Statements en alcance: todos, o solo los de `scope.cardLabel` si viene.
   `range = completeMonthRange(statements)`; si es `null` → `{ pesosDe, points: [], summary: null }`.
3. `series = realSpendingSeries(monthly, pendingByPurchaseMonth(pendingDetail), deflator, range)`.
4. `points` = `series` filtrada al alcance de los filtros: año de `month` en `scope.years`
   (`undefined` = todos) y, si hay `scope.from`, `monthOf(from) <= month <= monthOf(to ?? from)`.
5. `summary = summarizeRealSpending(series, points.at(-1).month)` sobre la **serie completa**, o
   `null` sin puntos.

### Ejemplo

IPC 2 % mensual de 2025-09 a 2026-08 (`pesosDe = 2026-08`). Agosto 2025: $100.000 facturados, sin
pendientes → `real = 100.000 × 1,02¹² = $126.824`. Agosto 2026: $150.000 facturados + $30.000 de
cuotas por facturar → `nominal = 180.000`, `real = 180.000` (factor 1). Interanual real =
`180.000 / 126.824 − 1 = +41,9 %`. En nominal (sin pendientes) se habría leído +50 %, y sin sumar
las cuotas pendientes, +18,3 %.

### Casos borde

| Situación | Resultado |
|---|---|
| Sin IPC cargado | `pesosDe: null` → «Sin datos de inflación» |
| Un solo resumen, o resúmenes sin `closingDate` | `range = null` → sin puntos |
| Año elegido sin meses completos (p. ej. el año que viene) | sin puntos |
| Mes elegido todavía abierto o sin IPC | sin puntos |
| Primer año de historia | `interanual: null` («sin datos de …») |
| Menos de 3 meses previos | `vsPromedio: null` («faltan meses anteriores») |
| `real(M − 12)` en 0 | `interanual: null` (no se divide por cero) |
| Meses posteriores al último IPC | quedan afuera por `tope`; no se usa el factor 1 de `deflateToLatest` |
| Hueco en `monthly` dentro del rango | no se grafica ni entra en el promedio |
| Cuotas pendientes de un mes que no está en `monthly` | se ignoran |
| Alguna llamada falla | «No se pudo calcular el gasto real» |

## API

Sin endpoints nuevos ni cambios de forma. Hooks existentes de `client/src/api/hooks.ts`:

| Hook | Llamada |
|---|---|
| `useMonthly({ currency: "ARS", cardLabel })` | `GET /api/stats/monthly?currency=ARS[&cardLabel=…]` |
| `useFutureInstallmentsDetail({ currency: "ARS", cardLabel })` | `GET /api/stats/future-installments/detail?currency=ARS[&cardLabel=…]` |
| `useStatements()` | `GET /api/statements` |
| `useInflation()` | `GET /api/inflation` |

Contrato del que depende esta feature (si otra feature toca `stats.ts` tiene que mantenerlo):
`/stats/monthly` agrupa por mes de `date`, y `/stats/future-installments/detail` devuelve
`items[].purchaseDate` y `items[].amount` por cada cuota futura del último resumen de cada emisor.

### Hook compuesto `client/src/useRealSpending.ts` (nuevo)

```ts
export interface RealSpendingState { isLoading: boolean; isError: boolean; view: RealSpendingView }

export const useRealSpending = ({ cardLabel, years, from, to }: RealSpendingScope): RealSpendingState
```

Llama a los cuatro hooks con `currency: "ARS"`, normaliza cada `data` con
`Array.isArray(data) ? data : []` (mismo resguardo que `useYearOptions.ts`) **dentro** del `useMemo`
que arma la vista con `buildRealSpendingView(...)`, para que las dependencias sean las referencias
estables de React Query. Los años entran a las dependencias como `years?.join(",")`. `isLoading` es
el OR de los cuatro `isLoading`, e `isError` el OR de los cuatro `isError`.

## UI

### Ubicación (compu)

La base ya dejó la tarjeta en `client/src/pages/DashboardPage.tsx`, dentro de la grilla de
`ChartCard` y justo **después** de «Evolución mensual»:

```tsx
<ChartCard title="Evolución mensual"><MonthlyTrendChart {...filters} /></ChartCard>
<ChartCard title="Gasto real (pesos de hoy)"><RealSpendingPanel {...filters} /></ChartCard>
<ChartCard title="Cuotas a vencer"><FutureInstallmentsChart {...filters} /></ChartCard>
```

En compu (grilla `md: "1fr 1fr"`) «Evolución mensual» y «Gasto real» quedan en la misma fila. La
grilla pasa de 6 a 7 tarjetas y «A pagar por mes en USD (al oficial)» queda sola en la última fila;
se acepta.

### `client/src/components/RealSpendingPanel.tsx` (reemplaza el stub)

Contenedor. Props: `RealSpendingPanelProps = StatFilters` desestructurados
(`{ currency, cardLabel, year, from, to }`).

- `currency === "USD"` → retorno temprano con `Typography color="text.secondary"`:
  «El gasto real se calcula sobre los consumos en pesos.» No monta el hijo, así que no se piden datos.
- Si no, renderiza un componente interno `RealSpendingBody` que llama a
  `useRealSpending({ cardLabel, years: year, from, to })` y resuelve con retornos tempranos:
  - `isLoading` → `Box` de 260 px de alto con `CircularProgress size={28}` centrado;
  - `isError` → «No se pudo calcular el gasto real»;
  - `view.pesosDe === null` → «Sin datos de inflación» (mismo texto que `PayslipRealArsChart`);
  - `view.points.length === 0` → «Sin meses cerrados con IPC publicado en este período»;
  - con datos:
    1. `Typography variant="caption" color="text.secondary"`:
       «En pesos de {formatMonthLabel(pesosDe) en minúscula} (último IPC publicado). Incluye las cuotas
       que faltan facturar.»
    2. `RealSpendingStats` si `view.summary` no es `null`;
    3. `RealSpendingChart` con `view.points`.

### `client/src/components/RealSpendingStats.tsx` (nuevo)

Presentacional, no calcula. Props: `{ summary: RealSpendingSummary }`.

- Línea `body2`: «{formatMonthLabel(month)}: {formatMoney(real, "ARS")}».
- Grilla de dos celdas (`display: "grid"`, `gridTemplateColumns: "1fr 1fr"`, `gap: 2`, también en
  mobile: entran en 360 px). Cada celda tiene `overline` + valor `h6` bold + `caption`:

| Celda | Valor | Caption con dato | Sin dato |
|---|---|---|---|
| «Interanual» | `formatSignedPercent(interanual)` | «vs {mes M−12 en minúscula}», p. ej. «vs agosto de 2025» | «—» y «sin datos de agosto de 2025» |
| «Vs promedio» | `formatSignedPercent(vsPromedio)` | «de los {mesesPromedio} meses anteriores» | «—» y «faltan meses anteriores» |

- Color del valor, resuelto antes del `return` con un helper local `trendColor(value: number | null)`:
  `> 0 → "warning.main"`, `< 0 → "success.main"`, otro caso `"text.primary"`.

### `client/src/components/charts/RealSpendingChart.tsx` (nuevo)

Presentacional, misma estética nivo que `MacroRaceChart` / `MonthlyTrendChart`. Props:
`{ points: RealSpendingPoint[] }`.

- `ResponsiveLine` de alto 260, dos series: `{ id: "Real", data: points → (month, real) }` y
  `{ id: "Nominal", data: points → (month, nominal) }`. Colores `seriesColor(mode, 4)` y
  `seriesColor(mode, 0)`.
- `yScale: { type: "linear", min: 0, max: "auto" }`, `curve="monotoneX"`, `lineWidth={3}`,
  `pointSize={8}` con `pointColor` del fondo y borde del color de la serie, sin área (con dos líneas
  se ensucia).
- `axisLeft.format` = `formatMoneyCompact(value, "ARS")`; `yFormat` = `formatMoney(value, "ARS")`.
- `axisBottom`: `tickRotation: -45` y `tickValues: bottomTicks(months)`.
- `margin = seriesMargin({ top: 16, right: 24, bottom: isMobile ? 64 : 84, left: 64 })`.
- Tooltip por columna en compu **y** en mobile (`{...mobileLineTouch}`: `enableSlices="x"`,
  `sliceTooltip={LineSliceTooltip}`): con dos series, el tooltip muestra Real y Nominal del mes.
- Leyenda: en compu, `legends` de nivo abajo (como `MacroRaceChart`: `anchor: "bottom"`,
  `direction: "row"`, `translateY: 72`, `itemWidth: 110`, `symbolShape: "circle"`); en mobile,
  `legends={[]}` y `ChartLegend` debajo del gráfico con los mismos colores.

### Mobile

- La tarjeta ocupa el ancho completo (`xs: "1fr"`) y queda inmediatamente debajo de «Evolución
  mensual».
- Serie por mes según `useChartLayout`: `seriesMargin` (izquierda 56) y `bottomTicks` (hasta 6
  etiquetas, siempre la última).
- Leyenda HTML (`ChartLegend`), sin leyenda de nivo, como el grupo «Con leyenda de nivo» del spec
  responsive.
- No hay controles: no hacen falta objetivos táctiles nuevos.
- Los filtros llegan por la barra global existente (`MobileFiltersBar` / `FiltersSheet`); no cambia.

## Tests

En todos los archivos de componentes, `afterEach(cleanup)`, porque el auto-cleanup de RTL está
apagado. Los fixtures son sintéticos.

- `client/src/realSalary.test.ts`: sin cambios; tiene que seguir en verde después del refactor. Los
  tests de `buildDeflator` y `addMonths` ya están en la base (`inflationIndex.test.ts`,
  `isoDate.test.ts`), igual que los de `formatSignedPercent` (`format.test.ts`).
- `client/src/statementCoverage.test.ts` (resúmenes con un `makeStatement` como el de
  `cardCycle.test.ts`):
  - un emisor con cierres `2026-06-07` y `2026-07-07` → `{ desde: "2026-06", hasta: "2026-06" }`;
  - cierre el último día del mes (`2026-09-30`) → ese mes cuenta como cerrado;
  - dos emisores (Visa `2026-10-02`, ICBC `2026-09-07`) → `hasta: "2026-08"`;
  - dos emisores con primeros cierres distintos → `desde` es el más reciente de los primeros;
  - un solo resumen → `null`;
  - resúmenes sin `closingDate` se ignoran; todos sin cierre → `null`.
- `client/src/realSpending.test.ts`:
  - `pendingByPurchaseMonth` suma las cuotas de una compra repartidas en varios meses de
    vencimiento en su mes de compra;
  - `realSpendingSeries` suma pendientes, deflacta, corta en `min(hasta, pesosDe)`, excluye meses
    anteriores a `desde`, ignora pendientes de meses ausentes y ordena por mes;
  - `summarizeRealSpending`: el ejemplo de +41,9 % interanual; `interanual: null` sin el mes −12 o
    con `real` 0; `vsPromedio` con ventana de 12 meses y con 3; con 2 meses → `null`; los huecos no
    cuentan como cero; mes fuera de la serie → `null`;
  - `buildRealSpendingView`: con `years: ["2026"]` grafica solo 2026 pero la interanual de enero usa
    enero de 2025; con `from`/`to` de un mes queda un punto y es el de referencia; año sin meses
    completos → sin puntos; con `cardLabel` la cobertura usa solo los resúmenes de esa tarjeta; sin
    IPC → `pesosDe: null`; sin cobertura → `pesosDe` con `points: []`.
- `client/src/components/charts/RealSpendingChart.test.tsx` (con `NivoProbe` y
  `emulateMobile`/`emulateDesktop`, como `seriesCharts.test.tsx`):
  - en mobile: a lo sumo 6 ticks e incluye el último mes, margen izquierdo 56, sin leyenda de nivo y
    con `ChartLegend` («Real», «Nominal»);
  - en compu: leyenda de nivo, margen inferior 84, tooltip por columna (`enableSlices: "x"`,
    `customTooltip: "yes"`) y colores de las series 4 y 0.
- `client/src/components/RealSpendingPanel.test.tsx` (con `fetch` mockeado por URL, como
  `DashboardPage.test.tsx`):
  - con datos: muestra el texto «En pesos de …», «Interanual» con su valor con signo y «Vs promedio»;
  - `currency="USD"`: muestra el mensaje y no llama a `/inflation` ni a
    `/stats/future-installments/detail`;
  - `/inflation` vacío → «Sin datos de inflación»;
  - un solo resumen → «Sin meses cerrados con IPC publicado en este período»;
  - `/inflation` con error → «No se pudo calcular el gasto real»;
  - las llamadas de stats no llevan `year` ni `from`;
  - `RealSpendingStats` sin datos muestra «—», «sin datos de …» y «faltan meses anteriores».
- `client/src/pages/DashboardPage.test.tsx`:
  - agregar al `route()` `/inflation` y `/stats/future-installments/detail` → `[]`, este **antes** de
    la rama `/stats/future-installments` (si no, lo captura esa rama);
  - el test de KPIs también comprueba el título «Gasto real (pesos de hoy)»;
  - nuevo: con `?year=2025&year=2026`, la llamada a `/stats/future-installments/detail` no lleva
    `year=`.

`bun run test`, `bun run typecheck` y `bun run build` en verde.

## Orden de implementación

1. **Refactor de Sueldo real:** `realSalary.ts` usa `buildDeflator` (sus tests siguen en verde sin
   tocarlos).
2. **Cobertura:** `statementCoverage.ts` con sus tests.
3. **Motor:** `realSpending.ts` con su batería de tests. No depende de la UI.
4. **Gráfico:** `RealSpendingChart` con sus tests de compu y mobile.
5. **Contenedor y Dashboard:** `useRealSpending`, `RealSpendingStats`, `RealSpendingPanel`
   (reemplaza el stub) y `DashboardPage.test.tsx` (mock, título y detalle de cuotas sin `year`).
6. **Verificación final.**

## Fuera de alcance (YAGNI)

- Consumos en USD (pasarlos a pesos al oficial y deflactarlos).
- Gasto real por categoría o por comercio.
- Valor presente de las cuotas (descontar con inflación futura): es la feature #5, «ahorro-cuotas».
- Cambiar «Evolución mensual»: sigue nominal y sin cuotas pendientes.
- Un KPI nuevo en la fila de `KpiCards`.
- Proyectar el mes en curso o estimar el IPC que todavía no salió.
- Detectar tarjetas dadas de baja en la cobertura. Si pasa, se filtra por Tarjeta.
- Detectar un resumen intermedio sin importar (el mes queda bajo pero dentro de la cobertura).
- Etiquetas directas al final de cada línea: la leyenda y el tooltip por columna ya identifican las
  dos series.
- Cambios de server, shared o persistencia de índices.
- Unificar `signed` de `macroSignals.ts` con `formatSignedPercent`: es una limpieza real, pero ajena
  a este objetivo.

## Operación

Ninguna nueva. La tarjeta usa la serie de IPC que ya mantienen `bun run seed:inflation` /
`seed:macro`. Si nunca se corrió, muestra «Sin datos de inflación».
