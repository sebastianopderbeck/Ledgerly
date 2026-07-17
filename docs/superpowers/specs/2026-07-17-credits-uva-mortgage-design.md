# Ledgerly — Sección "Créditos" (crédito hipotecario UVA) — Diseño (SDD)

- **Fecha:** 2026-07-17
- **Estado:** Aprobado para planificar implementación
- **Autor:** Sebastián Opderbeck (con asistencia de Claude)

---

## 1. Objetivo

Nueva sección **Créditos** para seguir un **crédito hipotecario UVA** mes a mes: cuánto se paga, cuánto es **capital**, cuánto **interés**, cuánto **seguro**, y **cuánto se avanzó** en la amortización del préstamo. La fuente de datos son los **cupones mensuales de cobro del banco** (ICBC, "INFORME DE COBRO DE CUOTA PRESTAMO HIPOTECARIO") en PDF, que el usuario sube por la misma página **Importar** que los extractos de tarjeta.

## 2. Alcance

**Incluye**
- **Parser** del cupón hipotecario ICBC + **ingesta unificada** (la página Importar acepta cupones y extractos indistintamente; el servidor detecta el tipo).
- Persistencia de cada cupón como registro `MortgageCoupon` (una fila por cuota).
- **Detalle mes a mes** (tabla) de los cupones reales: capital / interés / seguro / total en **pesos**, más cuota en **UVAs** y cotización.
- **KPIs de avance** derivados del cuadro de amortización (capital amortizado, capital pendiente, % del crédito, cuotas pagadas/totales).
- **Gráficos** de lo pagado y del avance.
- Unidades **pesos + UVAs** (el peso es lo que debita el banco; la UVA es la unidad invariante del crédito).
- Precarga de los 11 cupones actuales (`examples/credito/*.pdf`) vía el flujo de importación.

**No-goals (YAGNI)**
- Sin renderizar el **cuadro completo de 240 cuotas** ni **proyección detallada de cuotas futuras** en pesos.
- Sin UI **multi-crédito** (el modelo lo soporta por `prestamoNro`, pero la UI muestra el único crédito existente).
- Sin edición manual de cupones (solo ingestión por PDF).
- Sin OCR (igual que el resto de la app: solo PDFs con capa de texto).
- Sin conversión ni supuestos de inflación futura para proyectar pesos.

## 3. Decisiones de arquitectura — slice vertical paralelo

El cupón hipotecario es un **documento de forma distinta** al extracto de tarjeta: un cupón = **un registro** (capital, interés, seguro, UVA), no una lista de transacciones con header + totales + reconciliación. Además, el `detect()` del parser de extractos ICBC es `text.includes("ICBC")`, y el cupón **también** contiene "ICBC" (`ICBC Hola!`, `www.icbc.com.ar`, "Industrial and Commercial Bank of China"). Forzar el cupón por el pipeline de extractos rompe todas las capas y colisiona en la detección.

**Decisión:** un **slice vertical paralelo** para cupones, reutilizando lo genérico (extracción de PDF, parseo de montos, patrón de dedupe, patrón de fns puras de stats, harness de tests) y agregando lo específico.

| Capa | Reutiliza | Nuevo |
|---|---|---|
| Extracción PDF | `pdf/extract.ts` (sin cambios) | — |
| Parseo de montos AR | `parseArAmount` de `parsers/normalize.ts` | helper de fecha `DD/MM/YYYY` |
| Contrato de parser | patrón de `StatementParser` | `MortgageCouponParser` (parse → `ParsedCoupon`) |
| Parser | — | `parsers/icbcMortgage.ts` |
| Orquestador ingesta | patrón de `ingestion/parseStatement.ts` + clases de error | `ingestion/parseCoupon.ts` (reutiliza `NoTextError`/`UnsupportedFormatError`) |
| Dispatch de subida | — | `ingestion/detectDocumentKind.ts` |
| Import + dedupe | idiom `sourceHash` de `import/importStatement.ts` | `import/importCoupon.ts` (+ clave natural `prestamoNro|cuotaNro`) |
| Persistencia | idiom Mongoose (`mongoose.models.X ?? …`) | `MortgageCouponModel` en `db/models.ts` |
| Stats (fns puras) | patrón de `stats/futureInstallments.ts` + `addMonths` | `stats/amortization.ts` |
| DTO + schema | patrón de `shared/dtos.ts` + `schemas.ts` | `mortgageCouponDtoSchema`, `creditSummaryDtoSchema` |
| Mapper | patrón de `http/mappers.ts` | `toMortgageCouponDTO`, `toCreditSummaryDTO` |
| Router | patrón de `http/routes/stats.ts` | `http/routes/credits.ts` + `POST /api/import` |
| UI | patrón de `pages/InstallmentsPage.tsx`, `KpiCards`, `ChartCard`, `charts/*` | `pages/CreditsPage.tsx`, `components/CreditKpiCards.tsx`, `components/charts/Credit*Chart.tsx`, `components/MortgageCouponsTable.tsx` |
| Formato | `format.ts` (`formatMoney`) | `formatUva` |

**Convenciones obligatorias** (del repo): ESM con sufijo `.js` en imports de TS; guard `mongoose.models.X ?? mongoose.model(...)`; tipos derivados con `InferSchemaType` / `z.infer`; nada de `any`; errores esperados como `HttpError(status, "mensaje en español")`.

## 4. Modelo de datos — `MortgageCoupon`

Colección nueva `mortgagecoupons`. Documento (Mongoose, `InferSchemaType`):

| Campo | Tipo | Origen | Ejemplo (cuota 11) |
|---|---|---|---|
| `prestamoNro` | string | cupón | `"0405727408"` |
| `cuotaNro` | number | cupón | `11` |
| `fechaDebito` | Date | cupón `DD/MM/YYYY` | `2026-06-17` |
| `capital` | number (ARS) | cupón | `255576.38` |
| `intereses` | number (ARS) | cupón | `1142768.75` |
| `seguroIncendio` | number (ARS) | cupón | `11858.60` |
| `totalDebitado` | number (ARS) | cupón | `1410203.73` |
| `cuotaPuraUva` | number (UVA) | cupón | `699.60` |
| `cotizacionUva` | number (ARS/UVA) | cupón | `1998.77` |
| `tea` `tna` `cft` | number (%) | cupón | `9.27` `8.90` `0.00` |
| `sourceFileName` | string | archivo | `06-2026-opderbeck.pdf` |
| `sourceHash` | string | sha256 bytes | — |

- **Índice único** `{ prestamoNro, cuotaNro }` → re-subir la misma cuota (aunque el PDF cambie de bytes) devuelve `duplicate`.
- Índice en `cuotaNro` (orden) y `prestamoNro` (filtro).
- Timestamps aliaseados `{ createdAt: "uploadedAt", updatedAt: false }` (igual que `Statement`).
- **Derivados al mapear** (no se guardan): `capitalUva = capital / cotizacionUva`, `interesUva = intereses / cotizacionUva`. Verificación de integridad: `capitalUva + interesUva ≈ cuotaPuraUva`.

## 5. Ingesta

### 5.1 Parser `parsers/icbcMortgage.ts`

Estructura espejo del parser ICBC: regexes nombradas a nivel módulo + `detect` + `parse`. El texto de `unpdf` viene "plantilla primero, valores al final", pero en el bloque de valores cada etiqueta queda **pegada** a su valor, así que **regex ancladas a la etiqueta** funcionan bien. Aplanar primero: `text.replace(/\n+/g, " ")`.

- **`detect(text)`** → `text.includes("INFORME DE COBRO DE CUOTA PRESTAMO")` (marcador único, no colisiona con extractos).
- **`parse(text)`** → `ParsedCoupon` con:

| Campo | Ancla / regex | Parseo |
|---|---|---|
| `capital` | `/CAPITAL\s+\$\s*([\d.]+,\d{2})/` | `parseArAmount` |
| `intereses` | `/INTERESES\s+\$\s*([\d.]+,\d{2})/` | `parseArAmount` |
| `seguroIncendio` | `/SEGURO INCENDIO\s+\$\s*([\d.]+,\d{2})/` | `parseArAmount` |
| `totalDebitado` | `/TOTAL DEBITADO\s+\$\s*([\d.]+,\d{2})/` | `parseArAmount` |
| `cuotaPuraUva` | `/CUOTA PURA EN UVAS\s+\$\s*([\d.]+,\d{2})/` | `parseArAmount` |
| `cotizacionUva` | `/Cotizac\.\s*UVAS al \d{2}-\d{2}-\d{4}\s*:\s*\$\s*([\d.]+,\d{2})/` | `parseArAmount` |
| `cuotaNro` + `prestamoNro` | `/(\d{3})\s+HIPOTECARIO\s+(\d{6,})/` | `Number` / `string` |
| `fechaDebito` | `/(\d{2}\/\d{2}\/\d{4})\s+\d{3}\s+HIPOTECARIO/` | nuevo helper `parseSlashDate` |
| `tna` | `/([\d]{1,2},\d{2})\s+Cotizac\.\s*UVAS/` (el nº inmediatamente previo a "Cotizac." es la TNA) | `parseArAmount` |
| `tea` `cft` | bloque de 3 nºs previo a "Cotizac." (orden extraído: CFT, TEA, TNA) | best-effort |

Nuevo helper en `normalize.ts`: `parseSlashDate("17/06/2026") → "2026-06-17"`. Si falta un campo obligatorio (capital, intereses, cuotaNro, cotizacionUva), lanzar error de dominio (`UnsupportedFormatError` o uno nuevo `InvalidCouponError`).

> **Nota sobre la tasa:** la TNA se extrae best-effort por posición. Para el cálculo de amortización (§6) **no dependemos** de ese parseo: `computeCreditProgress` deriva la tasa mensual del **crecimiento del capital** entre cupones (robusto con ≥2 cupones) y usa la TNA parseada solo como fallback para 1 solo cupón.

### 5.2 Registry de cupones

Registry propio y separado del de extractos:
```
parsers/mortgageRegistry.ts → export const mortgageParsers = [icbcMortgageParser];
```
No se toca `parsers/registry.ts`. Como salvaguarda, se agrega un test de regresión que verifica que un cupón **no** es detectado por `detectParser` (extractos) — y si lo fuera, se endurece `icbcParser.detect` exigiendo un marcador de extracto (`SALDO ANTERIOR` / `TOTAL CONSUMOS`).

### 5.3 Dispatch unificado (misma página Importar)

`ingestion/detectDocumentKind.ts`:
```
detectDocumentKind(text): "coupon" | "statement" | "unknown"
  coupon      si icbcMortgageParser.detect(text)
  statement   si detectParser(text) != null
  unknown     en otro caso
```

`ingestion/parseCoupon.ts` (espejo de `parseStatement.ts`):
```
parseCoupon(data): extractPdfText → NoTextError si vacío → icbcMortgageParser.parse → ParsedCoupon
```

### 5.4 Import + dedupe `import/importCoupon.ts`

Espejo de `importStatement.ts`:
- `sourceHash = sha256(bytes)`; además clave natural `{prestamoNro, cuotaNro}` (índice único).
- Duplicado: si ya existe la cuota (por clave natural o hash) y `!replace` → `{ status: "duplicate" }`.
- `replace=true` → `deleteOne` + `create`.
- Retorna `{ status, couponId }`.

## 6. Cálculo de avance — `stats/amortization.ts`

Sistema **francés a tasa fija denominado en UVAs** (validado con los 11 cupones): cuota pura fija `P = 699.60 UVA`, `i ≈ 0.74166 %/mes` (TNA 8,90 %), `240` cuotas, capital original `B₀ ≈ 78.316,73 UVA`. Con 11 cuotas pagadas: **1,73 %** de capital amortizado.

Función pura (sin DB; recibe arrays, igual que `futureInstallments`):
```
interface CouponInput { cuotaNro, capital, intereses, seguroIncendio, totalDebitado,
                        cuotaPuraUva, cotizacionUva, tna }
computeCreditProgress(coupons: CouponInput[]): CreditProgress | null
```
Algoritmo (cupones ordenados por `cuotaNro`; `null` si vacío):
1. Por cupón: `capitalUva = capital/cotizacionUva`, `interesUva = intereses/cotizacionUva`.
2. Tasa mensual `i`: si hay ≥2 cupones, `i = (capUva_últ / capUva_prim)^(1/(n_últ − n_prim)) − 1` (crecimiento geométrico del capital); si hay 1, `i = tna/12/100`.
3. Saldo pendiente (del último cupón, auto-consistente): `capitalPendienteUva = interesUva_últ / i − capitalUva_últ`.
4. `capitalAmortizadoUva = Σ capitalUva` (asume cupones contiguos desde la cuota 1; documentado).
5. `capitalOriginalUva = capitalPendienteUva + capitalAmortizadoUva`.
6. `porcentajeAvanceCapital = capitalAmortizadoUva / capitalOriginalUva`.
7. `cuotasPagadas = max(cuotaNro)`; `cuotasTotales = round( −ln(1 − B₀·i/P) / ln(1+i) )` con `B₀ = capitalOriginalUva`, `P = cuotaPuraUva` del último cupón.
8. Sumas en pesos: `totalPagado`, `capitalPagado`, `interesPagado`, `seguroPagado`.
9. `cotizacionUvaActual = cotizacionUva_últ`; `capitalPendientePesos = capitalPendienteUva · cotizacionUvaActual`.

Guards: `i <= 0` → usar fallback TNA; división por cero evitada; redondeos solo en presentación.

## 7. API

Router `http/routes/credits.ts` (montado en `app.ts` con `app.use("/api/credits", creditsRouter)` antes del catch-all 404) + endpoint de subida unificado.

| Método | Ruta | Descripción | Respuesta |
|---|---|---|---|
| `POST` | `/api/import` | Subida unificada (multer `file`). Extrae texto, `detectDocumentKind`, despacha a `importCoupon` o `importStatement`. | `{ kind: "coupon", status, coupon } \| { kind: "statement", status, statement, transactionCount }`; 422 si `unknown`/error de dominio |
| `GET` | `/api/credits/coupons` | Cupones ordenados por `cuotaNro` (filtro opcional `prestamoNro`). | `MortgageCouponDTO[]` |
| `GET` | `/api/credits/summary` | KPIs de avance. | `CreditSummaryDTO` (o `null`/204 si no hay cupones) |

`POST /api/statements` se mantiene sin cambios (compatibilidad + sus tests). El cliente pasa a usar `/api/import`.

**DTOs nuevos en `shared/src/dtos.ts`:**
- `MortgageCouponDTO`: `{ id, prestamoNro, cuotaNro, fechaDebito, capital, intereses, seguroIncendio, totalDebitado, cuotaPuraUva, cotizacionUva, capitalUva, interesUva, tea, tna, cft }`.
- `CreditSummaryDTO`: `{ prestamoNro, cuotasPagadas, cuotasTotales, totalPagado, capitalPagado, interesPagado, seguroPagado, capitalOriginalUva, capitalAmortizadoUva, capitalPendienteUva, capitalPendientePesos, porcentajeAvanceCapital, cotizacionUvaActual, cuotaPuraUva, tna }`.
- `ImportResultUnionDTO` discriminada por `kind` (para `/api/import`).

Fechas cruzan como `YYYY-MM-DD` (helper `isoDate` del mapper).

## 8. UI — `CreditsPage`

Ruta `/credits`, item de nav **"Créditos"** (en `Layout.tsx` `NAV` y `App.tsx` `<Route>` envuelto en `PageTransition`; agregar el label a la lista de `App.test.tsx`). Clona el patrón de `InstallmentsPage`: título `h4`, hooks TanStack Query, estados `isLoading` / vacío / con datos, grid `MotionBox` con stagger.

### 8.1 KPIs — `components/CreditKpiCards.tsx` (patrón `KpiCards`)

Fila responsive (2 mobile / 4 desktop) de tarjetas `MotionBox → Card` con chip de icono tintado (`${color}.main` + `1f`) y `CountUp`:

1. **Total pagado** — `totalPagado` (ARS). Sub: "en {cuotasPagadas} cuotas".
2. **Capital pendiente** — `capitalPendienteUva` UVA. Sub: "≈ {capitalPendientePesos} a hoy".
3. **Interés pagado** — `interesPagado` (ARS).
4. **Avance** — "{cuotasPagadas}/{cuotasTotales}". Sub: "{porcentajeAvanceCapital} de capital".

(Opcionales si se quiere fila de 6: **Capital pagado** ARS, **Cotización UVA** actual + variación.)

### 8.2 Gráficos — `components/charts/` (patrón `ChartCard` + `nivoTheme` + `palette`)

Grid 2 col de `ChartCard`, cada chart con props `= filtros`, `useTheme()`, guard de vacío (`Typography color="text.secondary"`), `<Box sx={{ height: 260 }}>`, `theme={nivoTheme(theme)}`, `motionConfig="gentle"`, `valueFormat`/ejes con `formatMoney`/`formatMoneyCompact`, colores de `seriesColor(mode, slot)` en slots libres (2, 4, 5, 6):

1. **Capital vs Interés por mes** — `ResponsiveBar` **apilada** (`keys=["capital","interes"]`, `indexBy="mes"`), pesos.
2. **Total pagado por mes** — `ResponsiveBar` simple, pesos.
3. **Evolución cotización UVA** — `ResponsiveLine` + área (`linearGradientDef`), ARS/UVA.
4. **Amortizado vs pendiente** — `ResponsivePie` (donut, `innerRadius`), en UVAs (`capitalAmortizadoUva` vs `capitalPendienteUva`), lectura instantánea del avance.

### 8.3 Tabla mes a mes — `components/MortgageCouponsTable.tsx`

Tabla MUI (`Table`/`TableBody`, con `MotionTableRow` para stagger) con columnas: **Cuota · Fecha · Capital $ · Interés $ · Seguro $ · Total $ · Cuota (UVA) · Cotización UVA**. Ordenada por `cuotaNro`. Montos en pesos con `formatMoney`, UVAs con `formatUva`. Es la vista literal de "lo que pagamos mes a mes".

### 8.4 Hooks — `client/src/api/hooks.ts`

Al final del archivo, importando DTOs de `@ledgerly/shared`:
```
useCreditCoupons()  → useQuery(["credit-coupons"],  () => apiFetch<MortgageCouponDTO[]>("/credits/coupons"))
useCreditSummary()  → useQuery(["credit-summary"],  () => apiFetch<CreditSummaryDTO>("/credits/summary"))
```
El hook de subida existente (Importar) pasa a `POST /api/import` y maneja la respuesta discriminada; invalida `["credit-coupons"]`, `["credit-summary"]` y las keys de statements/stats en `onSuccess`.

### 8.5 Formato — `client/src/format.ts`

`formatUva(value: number): string` con `Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })` + sufijo `" UVA"`. Pesos siguen con `formatMoney(v, "ARS")`. La sección no usa toggle de moneda.

## 9. Estructura de archivos

**Nuevos**
```
server/src/parsers/icbcMortgage.ts
server/src/parsers/mortgageRegistry.ts
server/src/ingestion/parseCoupon.ts
server/src/ingestion/detectDocumentKind.ts
server/src/import/importCoupon.ts
server/src/stats/amortization.ts
server/src/http/routes/credits.ts
server/src/parsers/__fixtures__/icbc-mortgage.sample.txt   (fixture real vía capture-fixtures)
client/src/pages/CreditsPage.tsx
client/src/components/CreditKpiCards.tsx
client/src/components/MortgageCouponsTable.tsx
client/src/components/charts/CapitalVsInterestChart.tsx
client/src/components/charts/TotalPaidByMonthChart.tsx
client/src/components/charts/UvaEvolutionChart.tsx
client/src/components/charts/AmortizationDonutChart.tsx
+ *.test.ts(x) hermanos de cada módulo con lógica
```
**Modificados**
```
shared/src/dtos.ts / schemas.ts   (DTOs nuevos)
server/src/parsers/normalize.ts   (parseSlashDate)
server/src/db/models.ts           (MortgageCouponModel)
server/src/http/mappers.ts        (toMortgageCouponDTO, toCreditSummaryDTO)
server/src/http/app.ts            (montar creditsRouter + POST /api/import)
server/scripts/capture-fixtures.ts (agregar un cupón a targets)
client/src/api/hooks.ts           (hooks de crédito + repuntar subida a /api/import)
client/src/format.ts              (formatUva)
client/src/App.tsx                (ruta /credits)
client/src/components/Layout.tsx  (nav "Créditos")
client/src/pages/ImportPage.tsx   (manejar resultado discriminado kind)
client/src/App.test.tsx           (label de nav)
```

## 10. Tests (vitest + mongodb-memory-server + supertest + RTL)

- **Parser** `icbcMortgage.test.ts`: sobre fixture real, asserts de todos los campos (montos, cuotaNro, prestamoNro, fecha, cotización).
- **Regresión**: `detectParser` (extractos) **no** agarra un cupón; `detectDocumentKind` clasifica cupón vs extracto vs unknown.
- **Amortización** `amortization.test.ts`: con los 11 cupones → `capitalPendienteUva≈76.960,87`, `porcentajeAvanceCapital≈0,0173`, `cuotasTotales=240`, `cuotasPagadas=11`; casos borde (1 cupón usa TNA, vacío → null).
- **Import** `importCoupon.test.ts`: nuevo / duplicado por clave natural / replace (mock del parser, patrón de `statements.test.ts`).
- **Endpoints** `credits.test.ts`: `/api/import` cupón (201) y extracto (201), `unknown`→422, `GET /coupons`, `GET /summary` (seed real + supertest).
- **Cliente** `CreditsPage.test.tsx`: `renderWithProviders` + `vi.stubGlobal("fetch", …)` ruteando `/credits/summary` y `/credits/coupons`; asserts de KPI y tabla. Extender `App.test.tsx` con "Créditos".

## 11. Riesgos / decisiones abiertas

1. **Orden de tasas en el PDF** (TEA/TNA/CFT por posición): mitigado porque la tasa efectiva se **deriva** del capital; la TNA parseada es solo fallback.
2. **Cupones no contiguos** (falta la cuota 1 o hay huecos): `capitalAmortizadoUva` como Σ deja de ser exacto vs `B₀−pendiente`. Con los datos actuales (cuotas 1–11 completas) es exacto; se documenta el supuesto y el pendiente siempre se toma del último cupón (auto-consistente).
3. **Doble extracción de PDF** en el dispatch (una para detectar, otra dentro del importer): aceptable por volumen bajo de subidas; opción futura: pasar `text`/`meta` ya extraídos a los importers.
4. **`ImportPage`** debe manejar dos formas de resultado; se resuelve con unión discriminada por `kind`.

## 12. Fuera de alcance (recordatorio)

Cuadro de 240 cuotas renderizado, proyección de cuotas futuras en pesos, UI multi-crédito, edición manual, OCR, supuestos de inflación.
