# Sección "Auto" — Plan de ahorro (cupones Círculo de Inversores / Citroën Plan) — Design Spec

**Fecha:** 2026-07-18
**Estado:** Aprobado para escribir plan de implementación.

## Goal

Agregar una sección **"Auto"** que replique la funcionalidad y la vista de **Créditos**, pero sobre las cuotas de un **plan de ahorro de un auto** (cupones de Círculo de Inversores S.A.U. — Citroën Plan, `examples/auto`). Ingesta de PDFs mensuales, un cupón por mes, y la vista mes a mes con KPIs, gráficos y tabla — incluyendo el valor en USD de cada cuota al dólar oficial (feature ya existente en el crédito).

Reutiliza las features de Créditos:
- Plan hipoteca UVA: `docs/superpowers/plans/2026-07-17-credits-uva-mortgage.md`
- Plan USD por cuota: `docs/superpowers/plans/2026-07-17-credits-usd-value.md`

## Architecture

**Slice vertical paralelo** que espeja Créditos archivo por archivo (parser → ingestión → modelo → import → stats → ruta → UI), reutilizando las piezas genéricas ya probadas. Es la misma filosofía validada en el plan del crédito. **No** se generaliza ni se toca el código del crédito (hipoteca amortizable y plan de ahorro con conceptos variables son dominios demasiado distintos para una abstracción común hoy).

**Piezas genéricas reutilizadas tal cual (sin modificar):**
- `server/src/pdf/extract.ts` — `extractPdfText`
- `server/src/parsers/normalize.ts` — `parseArAmount`, `parseSlashDate`
- `server/src/fx/dollarRate.ts` — `fetchOficialRate` (dólar oficial `venta`, con fallback de fin de semana)
- `client/src/format.ts` — `formatMoney`, `formatMoneyCompact`
- `client/src/components/charts/` — `ChartCard`, `nivoTheme`, `palette` (`seriesColor`)
- `client/src/components/motion/` — `MotionBox`, `MotionTableBody`, `MotionTableRow`, `CountUp`, variantes
- El endpoint unificado `POST /api/import` (se extiende el dispatch, no se reescribe)

**Tech stack:** igual que Créditos — TS/ESM (imports relativos con `.js`, tipos desde `@ledgerly/shared`, sin `any`), Express + Mongoose + unpdf (server), React 18 + MUI v6 (`sx`) + TanStack Query v5 + Nivo + framer-motion (client), Zod (shared), Vitest + supertest + mongodb-memory-server + RTL. Runtime bun. `globalThis.fetch` para el dólar.

## Data findings (cupones reales de `examples/auto`)

PDFs de 3 páginas emitidos por **Círculo de Inversores S.A.U. de Ahorro para Fines Determinados** (Citroën Plan). Texto vía `extractPdfText` (mergePages). Estructura del frente (cuota 2, `11-2024.pdf`):

```
GRUPO 3684 ORDEN 097 CUOTA 002 PLAN K
Fecha de Emisión 18/10/2024
VENCIMIENTO 11/11/2024
Comprobante Nro.: 000062757060
ANTICIPO ALICUOTA (AL)         $ 235356,87
PORCION DE ALICUOTA DIFERIDA   $ - 11767,85
IVA SOBRE CONCEPTOS GRAVADOS   $ 5067,90
RECUP IMP BANCARIOS LEY 25413  $ 2157,79
DER. INSCRIP.PRORR. HIST (DIP) $ 34274,38
GASTOS ADMINISTRATIVOS         $ 22358,90
SEGURO DE VIDA (SV)            $ 23389,67
DIFERIMIENTO COMERCIAL         $ - 70607,06
ACTUALIZACIÓN VALOR HIST.DIP   $ 1029,89
GASTOS DE SELLADO PRORR (GSP)  $ 26546,60
ACTUALIZACIÓN VALOR HIST.GSP   $ 744,03
Clave de Acceso para pago redes Link y Banelco: 036840975
TOTAL A PAGAR                  $ 268551,23
... A fecha emisión de esta cuota $ 28240000,01 $ 0,00 ...
Modelo de ahorro a fecha de emisión C3 AIRCROSS T200 FEEL PK MY24.
```

Progresión (muestra parcial, no todos los meses):

| archivo | cuota | vencimiento | TOTAL A PAGAR | valor auto |
|---|---|---|---|---|
| 11-2024.pdf | 2 | 11/11/2024 | 268.551,23 | 28.240.000,01 |
| 07-2025-2.pdf | 10 | 10/07/2025 | 314.132,21 | 31.170.000,00 |
| 07-2025.pdf | 11 | 11/08/2025 | 323.378,16 | 32.110.000,00 |
| 01-2026.pdf | 17 | 10/02/2026 | 394.224,89 | 40.110.000,00 |
| 06-2026.pdf | 22 | 10/07/2026 | 442.570,43 | 41.580.000,00 |

**Hallazgos que condicionan el diseño:**

1. **Los conceptos varían por cupón** (8 a 11 conceptos): aparecen/desaparecen (`PORCION DE ALICUOTA DIFERIDA`, `GASTOS DE SELLADO PRORR (GSP)`, `ACTUALIZACIÓN VALOR HIST.GSP`), y **cambian de orden** entre cupones. → **Los conceptos se almacenan como array `{label, amount}[]`**, no como campos fijos. La tabla y el chart derivan sus columnas de la **unión** de labels vistos.
2. **La etiqueta muta:** `DIFERIMIENTO COMERCIAL` aparece como `DIFERIMIENTO COMERCIAL 2` (cuota 17) y `DIFERIMIENTO COMERCIAL 3` (cuota 22). → El parser **normaliza** el sufijo numérico final para agrupar la serie (`DIFERIMIENTO COMERCIAL 2` → `DIFERIMIENTO COMERCIAL`).
3. **Montos sin separador de miles** (`235356,87`, `28240000,01`) y **negativos con signo adelante** (`$ - 70607,06`). `parseArAmount` normaliza bien la parte numérica (quita puntos, coma→punto), pero su lógica de signo mira un `-` **al final**; acá el `-` va **adelante**. → El parser de auto captura el signo con la regex y niega el monto (los negativos son reales: `porción diferida`, `diferimiento comercial`; el desglose suma al total dentro del redondeo).
4. `ORDEN`/`CUOTA` con padding variable (`097`/`97`, `002`/`010`/`17`/`22`). → `Number("002") === 2`.
5. **Clave natural `(grupo, orden, cuotaNro)`** deduplica: `07-2025.pdf` (cuota 11) y `07-2025-2.pdf` (cuota 10) son cupones distintos aunque el nombre de archivo confunda.
6. **`fechaVencimiento`** es la fecha de pago → es la que se usa para el dólar oficial (análogo a `fechaDebito` del crédito).
7. **`valorMovil`** = "A fecha emisión de esta cuota" (primer monto, columna *Modelo de Ahorro*; el segundo, *Modelo Financiado*, es `$ 0,00` y se ignora). Es el análogo de la cotización UVA.
8. **Detección:** el texto contiene `"Ahorro para Fines Determinados"` y **no** contiene `"ICBC"` ni el marker hipotecario, así que no colisiona.

## Naming

Dominio interno y rutas alineados a "auto":
- **Shared:** `autoCouponDtoSchema` → `AutoCouponDTO`, `autoConceptSchema` → `AutoConceptDTO`, `autoSummaryDtoSchema` → `AutoSummaryDTO`, y la variante `auto` en `importResultUnionSchema`. Tipo server `ParsedAutoCoupon` / `AutoCouponParser`.
- **Server:** `server/src/parsers/autoPlan.ts` (`autoPlanParser`), `server/src/ingestion/parseAutoCoupon.ts`, `server/src/db/models.ts` (`AutoCouponModel`, `AutoCouponDoc`), `server/src/import/importAutoCoupon.ts`, `server/src/stats/autoProgress.ts` (`computeAutoProgress`), `server/src/http/routes/auto.ts` (`/api/auto`), `server/src/import/backfillAutoRates.ts`, `server/src/import/seedAutoCoupons.ts`.
- **Client:** ruta `/auto`, nav **"Auto"**, `client/src/pages/AutoPage.tsx`, `AutoKpiCards.tsx`, `AutoCouponsTable.tsx`, charts en `charts/`, hooks `useAutoCoupons`/`useAutoSummary`/`usePatchAutoRate`.

## Interfaces (contratos)

```ts
// shared
export interface AutoConceptDTO { label: string; amount: number }

export const autoCouponDtoSchema = z.object({
  id: z.string(),
  grupo: z.string(),
  orden: z.string(),
  cuotaNro: z.number().int().positive(),
  plan: z.string(),
  fechaEmision: z.string(),        // YYYY-MM-DD
  fechaVencimiento: z.string(),    // YYYY-MM-DD
  comprobante: z.string(),
  modelo: z.string(),
  valorMovil: z.number(),
  conceptos: z.array(z.object({ label: z.string(), amount: z.number() })),
  totalAPagar: z.number(),
  tipoCambioUsd: z.number().nullable(),
  tipoCambioSource: z.enum(["api", "manual"]).nullable(),
  totalUsd: z.number().nullable(),  // derivado = totalAPagar / tipoCambioUsd
});

export const autoSummaryDtoSchema = z.object({
  grupo: z.string(),
  orden: z.string(),
  plan: z.string(),
  modelo: z.string(),
  cuotasPagadas: z.number().int(),      // distintas importadas
  cuotasTotales: z.number().int(),      // 120
  porcentajeAvance: z.number(),         // cuotasPagadas / cuotasTotales
  totalPagado: z.number(),
  valorActualAuto: z.number(),          // valorMovil de la última cuota
  totalPagadoUsd: z.number(),           // suma de totalUsd disponibles
  ultimaCuota: z.number().int(),        // max cuotaNro importada
  fechaUltimoVencimiento: z.string(),
});
```

```ts
// server parser
export interface ParsedAutoCoupon {
  grupo: string; orden: string; cuotaNro: number; plan: string;
  fechaEmision: string; fechaVencimiento: string; comprobante: string;
  modelo: string; valorMovil: number;
  conceptos: { label: string; amount: number }[];
  totalAPagar: number;
}
export interface AutoCouponParser {
  detect(text: string, meta: PdfMeta): boolean;
  parse(text: string, meta: PdfMeta): ParsedAutoCoupon;
}
```

```ts
// stats
export const AUTO_CUOTAS_TOTALES = 120;
export function computeAutoProgress(coupons: AutoCouponInput[]): AutoSummaryDTO | null;
```

## Componentes (unidades)

### 1. Parser + ingestión — `autoPlanParser` / `parseAutoCoupon`
- `detect`: `text.includes("Ahorro para Fines Determinados")`.
- `parse`:
  - Header: `/GRUPO\s+(\d+)\s+ORDEN\s+(\d+)\s+CUOTA\s+(\d+)\s+PLAN\s+(\w+)/`.
  - Fechas: `Fecha de Emisión (DD/MM/YYYY)` y `VENCIMIENTO (DD/MM/YYYY)` (primera ocurrencia) vía `parseSlashDate`.
  - `Comprobante Nro\.:\s*(\d+)`.
  - `valorMovil`: `A fecha emisión de esta cuota\s+\$\s*([\d.]*,\d{2})` (primer monto).
  - `modelo`: `Modelo de ahorro a fecha de emisión\s+(.+?)\.`.
  - `totalAPagar`: `TOTAL A PAGAR\s+\$\s*([\d.]*,\d{2})` (primera ocurrencia).
  - **Conceptos:** sobre el bloque entre `Comprobante Nro.: <n>` y `Clave de Acceso`, regex global `/([A-ZÁÉÍÓÚ][^$]*?)\s+\$\s*(-\s*)?([\d.]*,\d{2})/g`: `label` = grupo 1 trim + normalización de sufijo numérico final; `amount` = `parseArAmount(g3).amount` negado si `g2` presente.
- `parseAutoCoupon(data)`: `extractPdfText` → guard de texto vacío → `detect` → `parse`, envuelto en `InvalidAutoCouponError` (nuevo, en `ingestion/errors.ts`).
- `detectDocumentKind` gana `"auto"`; orden: cupón hipotecario → **auto** → statement → unknown.

### 2. Modelo + import
- `AutoCouponModel`: escalares + `conceptos: [{ label, amount }]` + `tipoCambioUsd`/`tipoCambioSource` + `sourceFileName`/`sourceHash`, `timestamps: { createdAt: "uploadedAt" }`. Índice único `{ grupo, orden, cuotaNro }`.
- `importAutoCoupon({ data, fileName, replace? })`: hash sha256, dedupe por clave natural (duplicate / replace), consulta `fetchOficialRate(fechaVencimiento)` (resiliente → `null`, `tipoCambioSource: "api" | null`).

### 3. Stats — `computeAutoProgress`
`null` si no hay cupones. Ordena por `cuotaNro`. `cuotasPagadas` = cantidad de cupones distintos; `cuotasTotales` = 120; `porcentajeAvance` = pagadas/120; `totalPagado` = Σ `totalAPagar`; `valorActualAuto` = `valorMovil` de la última; `totalPagadoUsd` = Σ `totalUsd` presentes; `ultimaCuota` = max `cuotaNro`; `fechaUltimoVencimiento` = de la última.

### 4. API — `/api/auto`
- `GET /coupons`: orden por `cuotaNro`, mapea a DTO (`totalUsd` derivado en el mapper).
- `GET /summary`: `computeAutoProgress`; `204` si vacío.
- `PATCH /coupons/:id { tipoCambioUsd }`: `400` si no es número positivo, setea `tipoCambioSource: "manual"`, `404` si no existe, devuelve el DTO.
- `POST /api/import`: dispatch agrega `auto` (importAutoCoupon + mapper), `ImportResultUnion` gana la variante `{ kind: "auto", status, coupon }`.

### 5. Vista — `AutoPage` (ruta `/auto`, nav "Auto")
Misma estructura que `CreditsPage`: título "Auto", empty state, luego:
- **`AutoKpiCards`** (4): **Total pagado** (`sub` "en N cuotas") · **Valor del auto** (`valorActualAuto`, `sub` modelo) · **Pagado en USD** (`totalPagadoUsd`) · **Avance** (`porcentajeAvance*100` %, `sub` "N/120 cuotas").
- **Grid de 5 charts** (`ChartCard`). Todos son componentes **nuevos** en `client/src/components/charts/`, ligados a `useAutoCoupons`/`useAutoSummary` (no se reutilizan los del crédito, que están atados a `useCreditCoupons`):
  1. **Composición de la cuota por mes** (`AutoCompositionChart.tsx`) — barra apilada; keys = unión de labels normalizados; `indexBy` = mes de vencimiento (`YYYY-MM`); color por concepto (palette cycling). *(Reemplaza "Capital vs Interés".)*
  2. **Total pagado por mes** (`AutoTotalPaidByMonthChart.tsx`) — línea/área de `totalAPagar`.
  3. **Evolución del valor del auto** (`CarValueChart.tsx`) — línea de `valorMovil` por mes. *(Reemplaza "Evolución de la UVA".)*
  4. **Avance del plan** (`AutoProgressDonutChart.tsx`) — donut `cuotasPagadas` vs `120 - cuotasPagadas`. *(Reemplaza "Amortizado vs pendiente".)*
  5. **Valor de la cuota en USD** (`AutoCouponUsdChart.tsx`) — línea de `totalUsd` (patrón `CouponUsdChart`).
- **Tabla "Detalle mes a mes"** (`AutoCouponsTable`): columnas dinámicas = unión de conceptos (orden canónico = primera aparición; concepto ausente en un cupón → `—`/0), + Cuota + Vencimiento + Total + Valor auto + **TC oficial (editable)** + **Pagado (USD)**. Ancha, scroll horizontal (`overflowX: auto`), como la del crédito. Celda editable `RateCell` = misma UX que la del crédito (guard Enter+blur).
- `Layout.tsx`: nav `{ to: "/auto", label: "Auto" }` (después de "Créditos"). `App.tsx`: ruta `/auto`.

### 6. USD (reutiliza la feature)
- TC oficial de `fechaVencimiento` al importar (Componente 2).
- Mapper deriva `totalUsd = tipoCambioUsd ? totalAPagar / tipoCambioUsd : null`.
- `PATCH` de override (Componente 4).
- `backfillAutoRates()` + script `seed:fx:auto` (patrón de `backfillRates.ts`), completa TCs `null`.
- Columna TC editable + Pagado (USD) + chart USD (Componente 5).

### 7. Seed
`seedAutoCoupons(dir)` + script `seed:auto` (patrón de `seedCoupons.ts`): importa `examples/auto/*.pdf` vía `importAutoCoupon`, devuelve `{ imported, duplicates }`.

## Test strategy
Espeja Créditos: Vitest por módulo, sin red real (mock `fetch`/`fetchOficialRate`/`parseAutoCoupon` según capa). Parser + ingestión con **fixture de texto** (`__fixtures__/auto-plan.sample.txt`) y **PDF real** (`examples/auto/11-2024.pdf`). Rutas con supertest + `withDb` + fixture de cupones de auto (`server/src/testing/autoCouponFixtures.ts`, valores reales de la tabla de arriba). Componentes con RTL (columna "Pagado (USD)", header "TC oficial", PATCH al editar el TC). `bun run typecheck` + `bun run test` al cierre.

## Fuera de alcance
Generalizar/tocar Créditos; otros dólares (MEP/blue); proyección de cuotas futuras; datos de adjudicación/sorteo/licitación; "cuánto falta pagar" en pesos (el plan de ahorro no tiene saldo determinístico); caché persistente de cotizaciones.

## Decisiones abiertas (menores, ajustables al implementar)
- **Composición de la cuota (chart):** por pedido del usuario, se apilan **todos** los conceptos (~8–11 series). Legible pero cargado. Fallback si molesta: agrupar `ACTUALIZACIÓN *` en "Otros". La **tabla** siempre lleva detalle completo.
- **Orden canónico de columnas/series de conceptos:** primera aparición al recorrer los cupones ordenados por `cuotaNro` (determinístico).
