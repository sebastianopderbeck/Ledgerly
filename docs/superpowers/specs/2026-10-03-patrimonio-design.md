# Patrimonio neto — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo). Ajustado a lo que ya trae `feat/base-nuevas-features`.

## Objetivo

Agregar una sección nueva, la página **Patrimonio** en la ruta `/patrimonio`, que responda dos preguntas:
**¿cuánto tengo hoy, neto de lo que debo?** y **¿cómo viene evolucionando eso mes a mes?**

- **Activos**: el auto (valor móvil del último cupón del plan) más activos que cargás a mano: cuenta,
  ahorros, plazo fijo, inversiones o un inmueble, cada uno con su moneda y su fecha de valuación.
- **Pasivos**: lo que queda de la hipoteca UVA en pesos de hoy, la deuda en cuotas que queda de la
  tarjeta y lo que queda por pagar del plan del auto.
- Todo se muestra **en pesos y en dólares al oficial**.
- Los activos manuales se crean, editan y borran desde la misma página, con una UI pensada para el
  celular.

La foto se arma casi toda con datos que ya están en la base (cupones, resúmenes, series macro). Lo
único nuevo que se guarda son los activos manuales.

## Qué ya trae la base y qué agrega esta feature

La rama `feat/base-nuevas-features` dejó en su forma final todo lo compartido. Esta feature **no los
toca**:

| Pieza | Dónde | Estado |
|---|---|---|
| DTOs `isoDateSchema`, `manualAssetTypeSchema`, `MANUAL_ASSET_TYPE_LABELS`, `assetValuationSchema`, `manualAssetDtoSchema`, `manualAssetCreateSchema`, `manualAssetUpdateSchema` (`.strict()`), `netWorthItemDtoSchema`, `netWorthTotalsSchema`, `netWorthMonthDtoSchema`, `netWorthDtoSchema` y sus tipos, con tests | `shared/src/dtos.ts` | listo |
| Modelo `ManualAssetModel` / `ManualAssetDoc` | `server/src/db/models.ts` | listo |
| Mapper `toManualAssetDTO` | `server/src/http/mappers.ts` | listo |
| Router `netWorthRouter` montado en `/api/net-worth` | `server/src/http/app.ts` | stub sin handlers |
| `monthRange(desde, hasta)` (lista inclusiva de meses) | `server/src/stats/months.ts` | listo |
| `pointOnDate(fecha, points)` (último punto con `fecha <= fecha`) | `server/src/stats/rateOnDate.ts` | listo |
| Hooks `useNetWorth`, `useCreateManualAsset`, `useUpdateManualAsset`, `useDeleteManualAsset`, `useDeleteAssetValuation` | `client/src/api/hooks.ts` | listo |
| `parseMoneyInput` / `formatMoneyInput` | `client/src/moneyInput.ts` | listo |
| `ResponsiveSheet` (`{ open, onClose, title, children, actions? }`) | `client/src/components/ResponsiveSheet.tsx` | listo |
| Ruta `/patrimonio` y menú «Patrimonio» (`AccountBalanceWalletOutlined`, en «Más», después de Auto) | `App.tsx`, `navItems.ts` y sus tests | listo |
| Página `NetWorthPage` | `client/src/pages/NetWorthPage.tsx` | stub: solo el `h4` «Patrimonio» |

Archivos que crea o reemplaza esta feature:

- Server: `server/src/stats/netWorth.ts` (+ test) y `server/src/http/routes/netWorth.ts` (reemplaza el
  stub, + test).
- Cliente: `client/src/netWorth.ts` (+ test), `client/src/pages/NetWorthPage.tsx` (reemplaza el
  stub, + test), `client/src/components/NetWorthKpiCards.tsx`, `NetWorthItemsCard.tsx`,
  `NetWorthEvolutionCard.tsx` (+ test), `charts/NetWorthChart.tsx`, `ManualAssetEditor.tsx`
  (+ test), `useManualAssetForm.ts` y `useManualAssetEditor.ts`.

## Decisiones tomadas

- **El server calcula, el cliente presenta.** Una función pura `buildNetWorth` en
  `server/src/stats/netWorth.ts` arma la foto y la evolución. Es el mismo patrón que
  `computeCreditProgress` / `computeAutoProgress`. El cliente no combina cinco queries: hace una sola
  (`GET /api/net-worth`).
- **Se reutiliza sin modificar** `computeCreditProgress` (amortization.ts), `computeAutoProgress`
  (autoProgress.ts), `latestStatementIdsPerIssuer` (lastStatement.ts), `remainingInstallmentDebt`
  (futureInstallments.ts), `representativeRateDate` (monthlyUsd.ts), `MACRO_START` / `SeriePoint`
  (macroSources.ts), y los helpers de la base `monthRange` / `monthOf` (months.ts) y `pointOnDate`
  (rateOnDate.ts). Ninguno de esos archivos cambia. `monthRange` reemplaza al `monthsBetween` que
  proponía este spec (en `months.ts`, `monthsBetween` devuelve un número) y `pointOnDate(fecha,
  points)` reemplaza a `valueAtOrBefore(points, fecha)` (ojo: los argumentos van al revés).
- **Dólar: oficial venta**, el mismo de toda la app, sacado de la serie `usd_oficial` de
  `MacroSeries`. Para "hoy" se toma el último punto con `fecha <= hoy`. Solo si no hay ninguno se
  pide `fetchOficialRate(hoy)`. Si tampoco hay, `503`.
- **Hipoteca en pesos de hoy** = `capitalPendienteUva` (el mismo número de la página Créditos) × la
  **UVA más reciente** disponible al corte: la de la serie `uva` de `MacroSeries` o la
  `cotizacionUva` del último cupón, **la que tenga fecha más nueva**. Así una serie UVA que dejó de
  actualizarse no valúa la deuda por debajo de lo que ya dice el último cupón. Por eso puede diferir
  del "≈ $" del KPI de Créditos, que valúa a la UVA del último cupón: es a propósito.
- **Auto como activo** = `valorMovil` del último cupón, haya sido adjudicado o no.
- **Saldo del plan del auto** = `valorMovil × (120 − ultimaCuota) / 120`: las alícuotas que quedan,
  al valor móvil de hoy. Gastos administrativos, seguro, IVA y derecho de inscripción futuros **no**
  cuentan como deuda: son costos del plan, no capital adeudado. Con esa definición, el neto del auto
  (activo − pasivo) es lo que ya pagaste de alícuotas valuado a precio de hoy.
- Para el plan se usa `ultimaCuota` (la `cuotaNro` máxima) y no `cuotasPagadas` (cantidad de
  cupones importados): que falte un cupón importado no quiere decir que esa cuota no se pagó.
- La **fecha de corte del auto es `fechaEmision`** (el `valorMovil` es "a fecha de emisión"). Un
  cupón importado cuenta desde que se emite, aunque venza unos días después.
- **Tarjeta**: solo las **cuotas que quedan del último resumen de cada emisor**. Es la cuenta del KPI
  «Deuda en cuotas» del Dashboard con "Todos" los años. Las cuotas en USD van en un ítem aparte y se
  convierten al oficial. El saldo del resumen a pagar (`saldoActual`) **no** se cuenta (ver Fuera de
  alcance).
- **Activos manuales con historial de valuaciones**: la colección `ManualAsset` (ya en la base),
  donde cada activo tiene un array de valuaciones `{ fecha, monto }`. Así la evolución sale de los
  datos, sin snapshots mensuales ni jobs.
- **Tipos de activo**: `cuenta`, `ahorro`, `plazo_fijo`, `inversion`, `inmueble` y `otro`.
  "Inmueble" no estaba en el pedido, pero sin él la hipoteca deja el patrimonio muy negativo y el
  número engaña. Si hay hipoteca y ningún inmueble, la página muestra un aviso.
- **Etiquetas de tipo**: el server usa `MANUAL_ASSET_TYPE_LABELS` de `@ledgerly/shared`. El cliente
  importa solo **tipos** de shared (un valor arrastra zod al bundle), así que `client/src/netWorth.ts`
  arma su propio `ASSET_TYPE_LABELS: Record<ManualAssetType, string>`, con los mismos textos.
- **La moneda de un activo no se cambia después de crearlo**, porque reinterpretaría todo su
  historial. Si te equivocaste, lo borrás y lo creás de nuevo. `.strict()` en el schema de update
  hace que un `moneda` en el body devuelva 400.
- **Montos ≥ 0, sin pasivos manuales.** Fecha de valuación válida y no futura.
- **Evolución mensual desde `2025-01`** (`MACRO_START`, igual que Contexto) o desde el primer mes
  con datos, si es posterior, hasta el mes actual. Los meses sin cotización del dólar se omiten. El
  punto del mes en curso usa el corte "hoy" y el dólar de hoy, así que coincide exactamente con la
  foto.
- **Valuaciones manuales**: se arrastran hacia adelante y valen 0 antes de la primera. Para tener
  historia, cargás valuaciones con fecha pasada.
- **El filtro de año global aplica solo al gráfico de evolución.** KPIs y foto describen el estado
  actual y no se filtran (regla del spec del filtro de año).
- **El gráfico arranca en USD**, con un toggle a pesos: en pesos nominales la evolución es casi
  toda inflación. Tiene tres series: Activos, Pasivos y Patrimonio neto.
- **Colores del gráfico validados**: Activos slot 2 (verde), Pasivos slot 5 (naranja) y Patrimonio
  neto slot 1 (índigo) de `palette.ts`. La combinación que proponía la primera versión (2, 7, 0)
  fallaba el validador de la skill dataviz: verde y cian quedaban demasiado parecidos para cualquier
  lector (ΔE 11,8 < 15). La nueva pasa separación CVD (ΔE ≥ 10) y piso normal (ΔE ≥ 28) en claro;
  en oscuro pasa ambas, y el aviso de banda de luminosidad es de toda la paleta oscura del repo, no
  de este gráfico.
- **Tooltip por mes en compu y en mobile**: `enableSlices="x"` con `LineSliceTooltip`, que muestra
  las tres series del mes juntas. Con tres series comparables, el tooltip por punto de `useMesh` es
  menos útil.
- **Leyenda con valores**: `ChartLegend` debajo del gráfico, en compu y en mobile, con el valor del
  último mes visible de cada serie en la moneda elegida. Así cada línea se identifica sin depender
  solo del color.
- **Línea de cero** punteada cuando alguna serie del rango visible es negativa (patrimonio neto
  negativo).
- **El editor es el mismo formulario** dentro de un `BottomSheet` en mobile y de un `Dialog` en la
  compu, vía el `ResponsiveSheet` de la base.
- **Al editar un activo**, el valor viene con el monto de la última valuación y la fecha con
  **hoy**. Solo se guarda una valuación si cambió el valor o la fecha. Con la misma fecha que una
  existente, la corrige (upsert por fecha).
- Borrar un activo borra todo su historial, previa confirmación. Una valuación suelta se borra
  desde el historial del editor, salvo que sea la única.
- **Ids inválidos**: `PATCH` y `DELETE …/valuations/:fecha` con un id que no es un ObjectId
  responden 404 (no 500). `DELETE /assets/:id` es idempotente: 204 aunque no exista.
- **"Hoy"**: en el server, `new Date().toISOString().slice(0, 10)`, como en `routes/fx.ts`; en el
  cliente, `todayIso()` de `client/src/isoDate.ts` (fecha local). En Argentina el server nunca va
  atrasado respecto del cliente, así que una fecha que el cliente acepta, el server también.
- La API va en inglés como el resto (`/api/net-worth`) y los campos de dominio en castellano, como
  en cupones y recibos.
- Sin paquetes nuevos.

## Datos

### Colecciones que se leen (sin cambios)

Todas en `server/src/db/models.ts`.

| Colección | Campos usados |
|---|---|
| `AutoCoupon` | `grupo`, `orden`, `plan`, `modelo`, `cuotaNro`, `fechaEmision`, `fechaVencimiento`, `valorMovil`, `totalAPagar`, `tipoCambioUsd` (los que pide `AutoCouponInput`, más `fechaEmision`) |
| `MortgageCoupon` | `prestamoNro`, `cuotaNro`, `fechaDebito`, `capital`, `intereses`, `seguroIncendio`, `totalDebitado`, `cuotaPuraUva`, `cotizacionUva`, `tna` (`CouponInput` más `fechaDebito`) |
| `Statement` | `_id`, `issuer`, `cardLabel`, `closingDate`, `uploadedAt`. Solo resúmenes con `closingDate` no nulo |
| `Transaction` | `statementId`, `amount`, `currency`, `isInstallment`, `installmentCurrent`, `installmentTotal`. Filtro `{ type: "purchase", isInstallment: true }` |
| `MacroSeries` | `serie ∈ {"usd_oficial", "uva"}`, `fecha` (`YYYY-MM-DD`), `valor`, ordenado por `fecha` |
| `ManualAsset` | `nombre`, `tipo`, `moneda`, `valuaciones[{ fecha, monto }]` (ya en la base) |

- `ManualAsset.valuaciones[].fecha` es `string` `YYYY-MM-DD`, como en `MacroSeries`: toda la cuenta es
  de calendario (comparación lexicográfica contra el corte).
- `valuaciones` siempre queda **ordenado por `fecha` ascendente y sin fechas repetidas**. Lo
  garantiza la ruta en cada escritura.

### DTOs (ya en `shared/src/dtos.ts`)

`ManualAssetType`, `AssetValuationDTO`, `ManualAssetDTO`, `ManualAssetCreateDTO`,
`ManualAssetUpdateDTO`, `NetWorthItemDTO`, `NetWorthTotals`, `NetWorthMonthDTO` y `NetWorthDTO`.

```ts
NetWorthItemDTO = {
  id: string; lado: "activo" | "pasivo"; fuente: "auto" | "plan_auto" | "hipoteca" | "tarjeta" | "manual";
  label: string; detalle: string; fecha: string; moneda: Currency;
  montoOriginal: number; ars: number; usd: number; assetId: string | null;
}
NetWorthTotals = { activosArs; pasivosArs; netoArs; activosUsd; pasivosUsd; netoUsd }   // todos number
NetWorthMonthDTO = NetWorthTotals & { periodo: string }
NetWorthDTO = {
  fecha: string; usdOficial: number; usdOficialFecha: string; uva: number | null; uvaFecha: string | null;
  totales: NetWorthTotals; items: NetWorthItemDTO[]; evolucion: NetWorthMonthDTO[]; activosManuales: ManualAssetDTO[];
}
```

`isoDateSchema` valida con `Date.parse` antes de `toISOString()` (la versión original tiraba con
fechas mal formadas).

## Cálculo

Todo vive en `server/src/stats/netWorth.ts` como funciones puras, sin Mongo ni red. Se testea
igual que `amortization.ts`.

### Entradas

```ts
export interface NetWorthAutoCoupon extends AutoCouponInput { fechaEmision: string }
export interface NetWorthMortgageCoupon extends CouponInput { fechaDebito: string }
export interface NetWorthStatement { id: string; issuer: string; cardLabel: string; closingDate: string; uploadedAt: Date }
export interface NetWorthInstallment {
  statementId: string; amount: number; currency: Currency;
  isInstallment: boolean; installmentCurrent: number | null; installmentTotal: number | null;
}

export interface NetWorthInputs {
  hoy: string;
  autoCoupons: NetWorthAutoCoupon[];
  mortgageCoupons: NetWorthMortgageCoupon[];
  statements: NetWorthStatement[];
  installments: NetWorthInstallment[];
  assets: ManualAssetDTO[];
  usdSerie: SeriePoint[];
  uvaSerie: SeriePoint[];
}

export interface NetWorthSnapshot { items: NetWorthItemDTO[]; totales: NetWorthTotals; uva: SeriePoint | null }

export const NET_WORTH_START = monthOf(MACRO_START);   // "2025-01"
```

### Funciones

```ts
export function firstDataMonth(inputs: NetWorthInputs): string | null
export function valuateAt(inputs: NetWorthInputs, corte: string, usd: number, uvaSpot: SeriePoint | null): NetWorthSnapshot
export function buildNetWorth(inputs: NetWorthInputs, usdHoy: SeriePoint): NetWorthDTO
```

- `firstDataMonth`: el mínimo `monthOf` entre `autoCoupons[].fechaEmision`,
  `mortgageCoupons[].fechaDebito`, `statements[].closingDate` y `assets[].valuaciones[].fecha`.
  Devuelve `null` si no hay nada; la ruta lo usa para responder 204.

### `valuateAt(inputs, corte, usd, uvaSpot)`: la foto a una fecha

Solo entra lo que tiene fecha `<= corte`.

1. **Auto** (`fuente: "auto"` y `"plan_auto"`). `computeAutoProgress(autoCoupons.filter(fechaEmision <= corte))`.
   Si da `null`, no hay ítems. Si no, con `s = summary`:
   - activo `id: "auto"`, `label: "Auto"`, `detalle: "${s.modelo} · valor móvil de la cuota ${s.ultimaCuota}"`,
     `fecha` = `fechaEmision` del cupón de `s.ultimaCuota`, `ars = s.valorActualAuto`.
   - pasivo `id: "plan-auto"`, `label: "Plan de ahorro del auto"`, con
     `restantes = max(0, s.cuotasTotales − s.ultimaCuota)`,
     `detalle: "${restantes} de ${s.cuotasTotales} cuotas por pagar"`, la misma `fecha`,
     `ars = s.valorActualAuto × restantes / s.cuotasTotales`. Si `restantes === 0`, el pasivo no se agrega.
2. **Hipoteca** (`fuente: "hipoteca"`). `p = computeCreditProgress(mortgageCoupons.filter(fechaDebito <= corte))`.
   Si da `null`, no hay ítem. Con el último cupón al corte (`cuotaNro` máxima),
   `delCupon = { fecha: últimoCupón.fechaDebito, valor: p.cotizacionUvaActual }` y la UVA usada es
   `uvaSpot` si existe y su fecha es `>= delCupon.fecha`; si no, `delCupon`.
   Pasivo `id: "hipoteca"`, `label: "Hipoteca UVA"`, `detalle: "${entero es-AR(p.capitalPendienteUva)} UVA pendientes"`,
   `fecha = uva.fecha`, `ars = p.capitalPendienteUva × uva.valor`.
   Con un prefijo de cupones, `computeCreditProgress` deriva la tasa con lo que había hasta ese
   mes: es lo que la app habría dicho en ese momento.
3. **Tarjeta** (`fuente: "tarjeta"`). Se arman los ids con
   `latestStatementIdsPerIssuer(statements.filter(closingDate <= corte))` (pasando `closingDate` a
   `Date`). Para cada uno de esos resúmenes, con sus cuotas (`installments` agrupadas por
   `statementId`):
   - `ars = remainingInstallmentDebt(cuotas, "ARS")`. Si es `> 0`, pasivo
     `id: "tarjeta:${issuer}:ARS"`, `label: "Cuotas ${cardLabel}"`.
   - `usdDebt = remainingInstallmentDebt(cuotas, "USD")`. Si es `> 0`, pasivo
     `id: "tarjeta:${issuer}:USD"`, `label: "Cuotas ${cardLabel} en dólares"`, `moneda: "USD"`,
     `montoOriginal = usdDebt`, `ars = usdDebt × usd`.
   - `detalle: "Último resumen: cierre ${closingDate}"`, `fecha = closingDate`.
4. **Manuales** (`fuente: "manual"`). Por activo, la última valuación con `fecha <= corte`; si no
   hay, el activo no aparece. Activo con `id = assetId = asset.id`, `label = nombre`,
   `detalle = MANUAL_ASSET_TYPE_LABELS[tipo]`, `fecha` de la valuación, `moneda`,
   `montoOriginal = monto`. Si es USD, `ars = monto × usd`; si es ARS, `ars = monto`. Los activos
   con monto 0 se listan igual, para poder editarlos.
5. En todos los ítems, `usd = ars / usd`, salvo los de moneda USD, donde `usd = montoOriginal`
   exacto. En los ARS, `montoOriginal = ars`.
6. **Orden**: activos primero y después pasivos. Dentro de cada lado, por `ars` descendente y, si
   empatan, por `label`.
7. **Totales**: `activosArs = Σ ars` de los activos, `pasivosArs = Σ ars` de los pasivos y
   `netoArs = activosArs − pasivosArs`. Lo mismo en USD sumando `usd`.
8. `uva` del resultado es la UVA que efectivamente se usó para la hipoteca, o `null` si no hay.

### `buildNetWorth(inputs, usdHoy)`: foto y evolución

```
foto      = valuateAt(inputs, hoy, usdHoy.valor, pointOnDate(hoy, uvaSerie))
primero   = firstDataMonth(inputs)
desde     = max(NET_WORTH_START, primero)
hasta     = monthOf(hoy)
evolucion = primero === null ? [] : para cada periodo en monthRange(desde, hasta):
  corte = representativeRateDate(periodo, hoy)      // fin de mes, u hoy en el mes en curso
  usd   = periodo === hasta ? usdHoy.valor : pointOnDate(corte, usdSerie)?.valor
  si usd no hay → el mes se omite
  { periodo, ...valuateAt(inputs, corte, usd, pointOnDate(corte, uvaSerie)).totales }
```

Devuelve
`{ fecha: hoy, usdOficial: usdHoy.valor, usdOficialFecha: usdHoy.fecha, uva: foto.uva?.valor ?? null, uvaFecha: foto.uva?.fecha ?? null, totales: foto.totales, items: foto.items, evolucion, activosManuales: inputs.assets }`.

### Casos borde

| Caso | Comportamiento |
|---|---|
| Nada importado ni cargado | `firstDataMonth` da `null` → la ruta responde **204** |
| Serie `usd_oficial` sin puntos `<= hoy` | La ruta pide `fetchOficialRate(hoy)` una vez (`usdOficialFecha = hoy`). Si da `null` → **503** |
| Meses anteriores al primer punto del dólar | Se omiten de `evolucion` (el mes en curso nunca, porque usa `usdHoy`) |
| Serie UVA vacía, anterior al primer punto o más vieja que el último cupón | Hipoteca valuada a la `cotizacionUva` del último cupón al corte |
| `computeCreditProgress` da `null` (tasa ≤ 0) | Sin ítem de hipoteca |
| Plan del auto con la cuota 120 importada | Activo auto sí, pasivo plan no |
| Resumen sin `closingDate` | Se ignora (la ruta ni lo trae) |
| Emisor con cuotas solo en USD | Solo el ítem "en dólares" |
| Activo manual sin valuaciones ≤ corte | No aparece en ese corte; en la evolución vale 0 hasta su primera valuación |
| Cupón o resumen con fecha futura | Queda fuera de la foto (corte = hoy) |
| `desde > hasta` | `evolucion: []` |

### Ejemplo (fixture sintético de los tests)

Hoy `2026-10-03`, dólar 1.000 y UVA 2.000.

- Auto: último cupón, cuota 30, `valorMovil` 12.000.000. Activo **12.000.000** y pasivo plan
  12.000.000 × 90/120 = **9.000.000**.
- Hipoteca: un cupón con `capital` 1.000, `intereses` 5.000, `cotizacionUva` 1.000, `tna` 12,
  `cuotaPuraUva` 6. Da `i = 0,01` y `capitalPendienteUva = 5/0,01 − 1 = 499`, así que el pasivo es
  **998.000**.
- Tarjeta: el último resumen ICBC tiene una compra de $10.000 en cuota 3/6 y otra de US$20 en
  cuota 1/3. Pasivos **30.000** y US$40 = **40.000**.
- Manuales: «Ahorros» de US$5.000 (**5.000.000**) y «Cuenta» de $500.000.
- Activos **17.500.000**, pasivos **10.068.000** y neto **7.432.000**, o sea US$**7.432**.

## API

Router en `server/src/http/routes/netWorth.ts` (`netWorthRouter`, ya montado en `/api/net-worth`).

### `GET /api/net-worth`

1. En paralelo:
   - `AutoCouponModel.find().sort({ cuotaNro: 1 }).lean()`
   - `MortgageCouponModel.find().sort({ cuotaNro: 1 }).lean()`
   - `StatementModel.find({ closingDate: { $ne: null } }).lean()`
   - `TransactionModel.find({ type: "purchase", isInstallment: true }).lean()`
   - `ManualAssetModel.find().sort({ nombre: 1 })` (mapeado con `toManualAssetDTO`)
   - `MacroSeriesModel.find({ serie: { $in: ["usd_oficial", "uva"] } }).sort({ fecha: 1 }).lean()`
2. Se mapea a `NetWorthInputs`. Las fechas `Date` pasan a ISO con `toISOString().slice(0, 10)`, y
   `totalUsd` del auto se arma como en `routes/auto.ts`.
3. Si `firstDataMonth(inputs) === null` → `204`.
4. `usdHoy = pointOnDate(hoy, usdSerie) ?? { fecha: hoy, valor: await fetchOficialRate(hoy) }`.
   Si `valor` es `null` → `HttpError(503, "No hay cotización del dólar oficial. Actualizá los datos con el botón de la barra superior.")`.
5. `res.json(buildNetWorth(inputs, usdHoy))`.

### `POST /api/net-worth/assets`

- Body `ManualAssetCreateDTO`. `manualAssetCreateSchema.safeParse`; si falla →
  `400 "Datos del activo inválidos"`.
- `valuacion.fecha > hoy` → `400 "La fecha de valuación no puede ser futura"`.
- Crea `{ nombre, tipo, moneda, valuaciones: [valuacion] }` y responde **201** con `ManualAssetDTO`.

### `PATCH /api/net-worth/assets/:id`

- Body `ManualAssetUpdateDTO` (estricto: `moneda` u otra clave → 400). Fecha futura → 400.
- `404 "Activo no encontrado"` si no existe o el id no es un ObjectId.
- `nombre` y `tipo` se pisan. `valuacion` hace upsert por `fecha`: se filtra la de misma fecha, se
  agrega y se ordena ascendente.
- Responde **200** con `ManualAssetDTO`. Body vacío → 200 sin cambios.

### `DELETE /api/net-worth/assets/:id`

`deleteOne` y **204**, igual que `DELETE /api/category-rules/:id`. Con un id que no es ObjectId,
204 sin tocar la base.

### `DELETE /api/net-worth/assets/:id/valuations/:fecha`

- `404 "Activo no encontrado"` / `404 "Valuación no encontrada"` si el activo o esa fecha no
  existen.
- `409 "No se puede borrar la única valuación: borrá el activo"` si es la única.
- Si no, responde **200** con `ManualAssetDTO`.

### Cliente (ya en `client/src/api/hooks.ts`)

`useNetWorth()` devuelve `NetWorthDTO | null`: `null` cuando el server responde 204 (React Query 5
marca como error una query que resuelve `undefined`). La página chequea `!data`. Las cuatro
mutaciones invalidan `["net-worth"]`. Importar, borrar importados, borrar movimientos y actualizar
macro ya hacen `invalidateQueries()` global, así que la página se refresca sola.

## UI

### Página `client/src/pages/NetWorthPage.tsx`

De arriba hacia abajo:

1. **Encabezado** (`NetWorthHeader`): un `Stack` como el de `RulesPage`
   (`direction={{ xs: "column", md: "row" }}`, `justifyContent: "space-between"`, `alignItems`
   `stretch` en mobile). A la izquierda «Patrimonio» (`h4`). A la derecha, un botón `contained` con
   `AddIcon` que dice «Agregar activo», a ancho completo en mobile y con `tapTargetSx`. El encabezado
   está **siempre**, incluso cargando, vacío o con error.
2. **`FiltersBar fields={["year"]}`** con
   `yearOptions = yearsOf(data.evolucion.map((mes) => mes.periodo))`. Solo se muestra si `evolucion`
   no está vacío.
3. **`NetWorthKpiCards`** (`KpiGrid cardCount={3}` con el `Kpi` compartido):
   - «Patrimonio neto»: `netoArs` con `sub` `≈ US$ …` (`netoUsd`), ícono
     `AccountBalanceWalletIcon`, color `primary`, o `error` si es negativo.
   - «Activos»: `activosArs`, `sub` `≈ US$ …`, `SavingsIcon`, `success`.
   - «Pasivos»: `pasivosArs`, `sub` `≈ US$ …`, `CreditCardIcon`, `warning`.
   - Abajo, un caption:
     «Valuado con dólar oficial {formatMoney(usdOficial, "ARS")} al {usdOficialFecha}» y, si hay
     `uva`, « · UVA {formatMoney(uva, "ARS")} al {uvaFecha}».
4. **Aviso** (`Alert severity="info"`) cuando `missingPropertyHint(data)`: «Tenés una hipoteca pero
   ningún inmueble entre tus activos. Agregá la casa como activo de tipo Inmueble para que el
   patrimonio no quede subestimado.»
5. **Foto**: una grilla `{ xs: "1fr", md: "1fr 1fr" }` con dos `NetWorthItemsCard`, «Activos» y
   «Pasivos». Cada una es `Card component="section" aria-label={title}`:
   - Una fila por ítem (`key = item.id`). A la izquierda, `label` (600) y debajo, en caption,
     `detalle · al {fecha}`. A la derecha, alineado a la derecha y `noWrap`, el monto en su moneda
     original (`formatMoney(montoOriginal, moneda)`, 600) y debajo, en caption, la otra moneda
     (`≈ US$ …` para ARS, `≈ $ …` para USD).
   - La fila es `flex` con `flexWrap: "wrap"`: en el celular el monto baja debajo del nombre si no
     entra.
   - Los ítems `fuente === "manual"` son `ListItemButton` con `aria-label={`editar ${label}`}`,
     `minHeight: 56` y un `ChevronRightIcon` al final como pista de que se tocan; abren el editor. El
     resto son `ListItem` fijos.
   - Al pie, un `Divider` y la fila «Total» con el total del lado (ARS en negrita y `≈ US$`).
   - Lado vacío: «Sin activos: agregá tus ahorros, plazos fijos o inversiones.» / «Sin deudas
     registradas.»
6. **Evolución**: `NetWorthEvolutionCard`, a todo el ancho, con un `ChartCard` titulado «Evolución
   del patrimonio».
   - Arriba, a la derecha, `ToggleButtonGroup` exclusivo con `aria-label="moneda del gráfico"`:
     «USD» (`value="USD"`, por defecto) y «Pesos» (`value="ARS"`). En mobile, `tapTargetSx` en
     cada botón.
   - `NetWorthChart` recibe los meses ya filtrados por año
     (`data.evolucion.filter((mes) => matchesYears(mes.periodo, yearSelection))`, con `useMemo`).
   - Debajo, un caption: «Los activos cargados a mano cuentan desde su primera valuación: si querés
     historia, cargalos con fecha pasada.»

**Estados**, con early returns dentro de un `NetWorthContent` (el encabezado, el editor y la
confirmación quedan afuera, así «Agregar activo» anda siempre):

- `isLoading` → `CircularProgress`.
- `error` → `Alert severity="error"` con `error.message`, por ejemplo el texto del 503.
- `!data` (204) → «Todavía no hay nada para valuar. Importá cupones del auto o de la hipoteca,
  resúmenes de tarjeta, o agregá un activo a mano.»

### Gráfico `client/src/components/charts/NetWorthChart.tsx`

- Props `{ months: NetWorthMonthDTO[]; currency: Currency }`.
- `ResponsiveLine` con `netWorthChartSeries(months, currency)` y tres series: «Activos» (slot 2),
  «Pasivos» (slot 5) y «Patrimonio neto» (slot 1). El color sigue a la serie por id, no por
  posición.
- Alto 260 y `seriesMargin({ top: 16, right: 24, bottom: 56, left: 72 })`.
- Líneas de 2px, puntos de 8px con anillo del color de la superficie.
- `axisBottom` con `tickRotation: -45` y `tickValues: bottomTicks(periodos)`.
- `axisLeft` con `formatMoneyCompact(value, currency)`, y `yFormat` con `formatMoney(value, currency)`.
- `enableSlices="x"` con `sliceTooltip={LineSliceTooltip}`.
- Marcador punteado en `y = 0` si algún valor visible es negativo.
- `ChartLegend` debajo, en compu y en mobile, con el valor del último mes visible de cada serie.
- Sin meses → «Sin datos».

### Editor de activos manuales

- **`client/src/components/useManualAssetForm.ts`**:
  `useManualAssetForm(asset: ManualAssetDTO | null, today: string)` →
  `{ draft, setNombre, setTipo, setMoneda, setMonto, setFecha, request }`.
  - Estado inicial de `assetDraftFrom(asset, today)`: nuevo es
    `{ nombre: "", tipo: "cuenta", moneda: "ARS", monto: "", fecha: today }`. Editando, nombre,
    tipo y moneda del activo, `monto` = la última valuación con `formatMoneyInput` y `fecha: today`.
  - `request = assetRequest(draft, asset, today)`, con `useMemo`.
- **`client/src/components/ManualAssetEditor.tsx`**:
  `({ open, asset, today, error, saving, onClose, onSave, onDelete, onDeleteValuation }: ManualAssetEditorProps)`.
  Adentro de `ResponsiveSheet`, con título «Nuevo activo» o «Editar activo», va
  `ManualAssetForm key={asset?.id ?? "nuevo"}`:
  - **Nombre**: `TextField`, `fullWidth`, `maxLength` 60.
  - **Tipo**: `TextField select` con las 6 opciones de `ASSET_TYPE_LABELS`.
  - **Moneda**: `ToggleButtonGroup` exclusivo `fullWidth` con «Pesos» (`ARS`) y «Dólares» (`USD`),
    con `aria-label="moneda"` y `tapTargetSx`. Al editar, `disabled`, con un caption «La moneda no
    se puede cambiar».
  - **Valor**: `TextField` con label «Valor en pesos» o «Valor en dólares», según la moneda, e
    `inputMode: "decimal"`. Se parsea con `parseMoneyInput`.
  - **Fecha de valuación**: `TextField type="date"` con `htmlInput.max = today` y el helper «Si
    cambiás el valor se guarda una valuación con esta fecha; con la fecha de una existente, la
    corrige.»
  - `error` del server en un `Alert severity="error"`.
  - Botones en fila, `fullWidth` con `tapTargetSx`: «Borrar» (`color="error"`, solo al editar,
    llama `onDelete`) y «Guardar» (`contained`, `disabled={!request || saving}`, llama
    `onSave(request)`).
  - **Valuaciones** (solo al editar y con más de una): una lista descendente de
    `fecha · formatMoney(monto, moneda)` con un `IconButton` `DeleteOutline`
    (`iconTapTargetSx`, `aria-label={`borrar valuación del ${fecha}`}`) que llama
    `onDeleteValuation(fecha)`.
- **`client/src/components/useManualAssetEditor.ts`**:
  `useManualAssetEditor(assets: ManualAssetDTO[])` →
  `{ open, asset, error, saving, pendingDelete, openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete, deleteValuation }`.
  - Guarda el **id** del activo (no el objeto) y deriva `asset` de `assets`, así después de borrar
    una valuación el historial se ve actualizado.
  - `close` solo cierra la hoja y no limpia el id, así el contenido no cambia durante la animación
    de cierre. `openNew` / `openEdit` limpian los errores de las mutaciones.
  - Usa los cuatro hooks de mutación. `save` llama `create` o `update` según `request.kind` y cierra
    en `onSuccess`. `askDelete` cierra la hoja y abre el `ConfirmDialog`.
  - Las callbacks van con `useCallback`.
- **Confirmación**: el `ConfirmDialog` existente, con título «Borrar activo», mensaje «¿Borrar
  «{nombre}» y todas sus valuaciones? Esta acción no se puede deshacer.» y confirmación «Borrar».

### Lógica pura del cliente

**`client/src/netWorth.ts`**:

```ts
export const ASSET_TYPES: ManualAssetType[]
export const ASSET_TYPE_LABELS: Record<ManualAssetType, string>
export const ASSET_NAME_MAX_LENGTH = 60

export interface AssetDraft { nombre: string; tipo: ManualAssetType; moneda: Currency; monto: string; fecha: string }
export type AssetRequest =
  | { kind: "create"; body: ManualAssetCreateDTO }
  | { kind: "update"; id: string; body: ManualAssetUpdateDTO };
export type NetWorthSerieId = "Activos" | "Pasivos" | "Patrimonio neto";
export interface NetWorthChartSerie { id: NetWorthSerieId; data: { x: string; y: number }[] }

export function isAssetType(value: string): value is ManualAssetType
export function isCurrency(value: unknown): value is Currency
export function itemsBySide(items: NetWorthItemDTO[]): { activos: NetWorthItemDTO[]; pasivos: NetWorthItemDTO[] }
export function latestValuation(asset: ManualAssetDTO): AssetValuationDTO | null
export function valuationsNewestFirst(asset: ManualAssetDTO): AssetValuationDTO[]
export function assetDraftFrom(asset: ManualAssetDTO | null, today: string): AssetDraft
export function assetRequest(draft: AssetDraft, asset: ManualAssetDTO | null, today: string): AssetRequest | null
export function netWorthChartSeries(months: NetWorthMonthDTO[], currency: Currency): NetWorthChartSerie[]
export function missingPropertyHint(data: NetWorthDTO): boolean
```

`assetRequest` devuelve `null` en cualquiera de estos casos:

- el nombre, recortado, está vacío o pasa de 60 caracteres;
- `parseMoneyInput(monto)` da `null`;
- la fecha falta, no es `YYYY-MM-DD` o es mayor que `today`;
- se está editando y no cambió nada.

Al editar arma solo los campos que cambiaron. `valuacion` va solo si el monto difiere de la última
valuación o la fecha difiere de `today`.

### Mobile

- Todo apila en una columna. `KpiGrid` con 3 tarjetas ya pasa a una columna en contenedores
  angostos.
- «Agregar activo» va a ancho completo debajo del título, como «Reaplicar a todo» en Reglas.
- Las listas de Activos y Pasivos ya son tarjetas, sin tablas ni scroll horizontal. Las filas
  editables miden ≥ 56px, y los montos bajan de línea si no entran.
- El editor es una hoja desde abajo (`BottomSheet`), con `inputMode="decimal"` para el valor y el
  date picker nativo del celular para la fecha. Todos los botones, toggles e íconos tienen ≥ 44px
  (`tapTarget.ts`).
- Gráfico con las reglas de "series por mes" de `useChartLayout`: margen izquierdo de 56, a lo
  sumo 6 ticks y tooltip por mes.

### Convenciones

Componentes funcionales con props destructuradas en la firma, defaults en la firma, `interface`
para cada `Props`, sin `any`, sin comentarios en el código, keys por `id`, filtros y mapeos antes
del `return`, early returns para carga y error, `useMemo` para la serie del gráfico, los ítems por
lado y los meses filtrados, y `useCallback` para las callbacks que bajan a la lista y al editor.

## Tests

TDD: cada pieza arranca con su test en rojo. Fixtures **sintéticos** con números redondos (el
ejemplo de arriba), nunca valores de `examples/`. Los tests de componentes y páginas van con
`afterEach(cleanup)`. Los DTOs, `moneyInput`, `ResponsiveSheet`, el menú y la ruta ya tienen sus
tests en la base.

### Server

**`server/src/stats/netWorth.test.ts`** (puro):

- El ejemplo completo da los totales esperados en ARS y USD.
- Auto: activo = `valorMovil` del último cupón por `fechaEmision`. Pasivo plan =
  `valorMovil × (120 − ultimaCuota)/120`, usando `ultimaCuota` aunque falten cupones intermedios.
  Con la cuota 120, sin pasivo.
- Hipoteca: `capitalPendienteUva` coincide con `computeCreditProgress`, valuado a la UVA de la
  serie. Sin serie, usa la `cotizacionUva` del último cupón y `uvaFecha` = su `fechaDebito`. Con la
  serie más vieja que el último cupón, también usa la del cupón. Sin hipoteca, `uva` es `null`.
- Tarjeta: con la misma compra en un resumen viejo (1/4) y en el último (2/4), solo cuenta el
  último. ARS y USD salen en ítems separados y el USD se multiplica por el dólar. Un emisor sin
  cuotas pendientes no genera ítem; uno con cuotas solo en USD genera solo el ítem en dólares. Un
  resumen con cierre posterior al corte no cuenta.
- Manuales: los USD se pasan a ARS y los ARS a USD; se toma la última valuación ≤ corte; un activo
  sin valuación ≤ corte no aparece; uno con monto 0 aparece.
- Orden de ítems: activos antes que pasivos y, dentro de cada lado, por `ars` descendente.
- Evolución:
  - meses continuos desde `max("2025-01", primer dato)` hasta el actual;
  - con datos de 2024, arranca en `2025-01`;
  - un mes sin dólar se omite;
  - el último punto es igual a `totales`, aunque la serie del dólar no tenga punto en el mes en
    curso;
  - una valuación de agosto se arrastra a septiembre;
  - antes de la primera valuación, el activo no suma.
- `firstDataMonth` sin datos → `null`; con datos, el mes más viejo de cualquier fuente.

**`server/src/http/routes/netWorth.test.ts`** (`withDb`, con
`vi.mock("../../fx/dollarRate.js")` como en `stats.test.ts`, y `Date` fijada con
`vi.useFakeTimers({ toFake: ["Date"] })`):

- `GET` sin nada → 204, sin llamar a `fetchOficialRate`.
- `GET` con cupones de auto, un resumen con cuotas, un activo y `MacroSeries` sintéticas → 200
  que cumple `netWorthDtoSchema`, con `items`, `totales`, `evolucion` y `activosManuales`.
- `GET` sin puntos `usd_oficial`: llama `fetchOficialRate(hoy)`; con valor usa `usdOficialFecha =
  hoy`, y si devuelve `null` → 503 con el mensaje.
- `POST` válido → 201 con una valuación.
- `POST` inválido → 400 en cada uno de estos casos: nombre en blanco, tipo inválido, monto
  negativo, fecha inválida y fecha futura.
- `PATCH` cambia nombre y tipo. Una valuación con fecha nueva se agrega ordenada; con la misma
  fecha, se reemplaza. Body vacío → 200 sin cambios. Con `moneda` → 400. Un id inexistente o mal
  formado → 404.
- `DELETE` del activo → 204, y deja de aparecer en `GET`.
- `DELETE` de una valuación → 200 sin ella. La única → 409. Una fecha inexistente → 404.

### Cliente

- **`client/src/netWorth.test.ts`**:
  - `itemsBySide`;
  - `latestValuation` y `valuationsNewestFirst`;
  - `assetDraftFrom` nuevo y editando (monto con `formatMoneyInput`);
  - `assetRequest` crea con el body completo (nombre recortado);
  - al editar manda solo lo que cambió;
  - sin cambios → `null` (incluido el monto precargado con puntos de miles);
  - cambiar solo el monto manda la valuación con `today`;
  - una fecha futura o vacía → `null`; nombre vacío o de más de 60 → `null`; monto inválido → `null`;
  - `netWorthChartSeries` usa `*Ars` o `*Usd` según la moneda;
  - `missingPropertyHint` es verdadero con hipoteca y sin inmueble, y falso con un activo tipo
    `inmueble` o sin hipoteca.
- **`client/src/components/ManualAssetEditor.test.tsx`**:
  - «Guardar» está deshabilitado hasta que hay nombre y valor válidos, y después manda el pedido;
  - al editar, la moneda está deshabilitada y el valor precargado;
  - el historial va del más nuevo al más viejo y borra una valuación con `onDeleteValuation(fecha)`;
  - con una sola valuación no hay historial;
  - muestra el error del server; «Borrar» solo al editar;
  - en mobile (`emulateMobile`), es un `dialog` llamado «Nuevo activo» dentro de la hoja.
- **`client/src/components/NetWorthEvolutionCard.test.tsx`** (nivo con `NivoProbe`):
  - USD está seleccionado por defecto (`aria-pressed`), la leyenda muestra los valores en USD y se
    cambia a «Pesos»;
  - en mobile, a lo sumo 6 ticks, con el último mes incluido, y tooltip por mes;
  - sin meses → «Sin datos».
- **`client/src/pages/NetWorthPage.test.tsx`** (stub de `fetch` por URL y método, como en
  `AutoPage.test.tsx`; el gráfico se reemplaza por una lista de meses para ver qué recibe):
  - con datos y `?year=all`, muestra los tres KPIs y los ítems dentro de las regiones «Activos» y
    «Pasivos»;
  - con 204, muestra el estado vacío y el botón «Agregar activo» sigue andando;
  - con 503, muestra el mensaje del server;
  - «Agregar activo» → completar y «Guardar» hace un POST con
    `{ nombre, tipo, moneda: "USD", valuacion: { fecha: hoy, monto: 10000 } }` a partir de
    `"10.000"`;
  - tocar «editar Ahorros» → cambiar el valor hace un PATCH solo con `valuacion`;
  - «Borrar» → confirmar hace el DELETE;
  - aparece el aviso de inmueble;
  - por defecto el filtro de año muestra solo el año actual en el gráfico, sin tocar los KPIs;
  - en mobile, «Agregar activo» abre la hoja desde abajo.

Al cierre: `bun run typecheck`, `bun run test` y `bun run build`.

## Orden de implementación

1. **Cálculo**: `server/src/stats/netWorth.ts` completo con su batería de tests. No depende de Mongo
   ni de UI.
2. **API**: `routes/netWorth.ts` (reemplaza el stub), validado con los tests de ruta.
3. **Cliente, lógica pura**: `client/src/netWorth.ts`.
4. **Editor**: `useManualAssetForm` y `ManualAssetEditor`.
5. **Gráfico**: `NetWorthChart` y `NetWorthEvolutionCard`.
6. **Página**: `NetWorthKpiCards`, `NetWorthItemsCard`, `useManualAssetEditor` y `NetWorthPage`.

## Fuera de alcance (YAGNI)

- **El saldo del resumen de tarjeta a pagar** (`saldoActual` sin vencer) y los pagos. No hay forma
  de saber si ya se pagó, y la plata para pagarlo suele estar en la cuenta que cargás a mano.
- Pasivos manuales (préstamos personales, deudas con terceros) y montos negativos.
- Gastos futuros del plan del auto (gastos administrativos, seguro, IVA, derecho de inscripción)
  como deuda.
- El precio de mercado del auto usado: se usa el `valorMovil` del plan.
- Cotización automática de inversiones (acciones, FCI, cripto): el valor lo cargás vos.
- MEP, blue, CCL: solo oficial.
- Snapshots mensuales persistidos o un job de cierre de mes: la evolución se recalcula de los
  datos.
- Proyección futura del patrimonio y metas.
- Avisos de valuaciones desactualizadas.
- Patrimonio deflactado por inflación (la vista en USD cumple ese rol).
- Varias hipotecas o varios planes de auto: se asume uno de cada uno, como en Créditos y Auto.
- Links desde cada ítem a su sección (Auto, Créditos, Cuotas).
- Evolución anterior a 2025.
- Mostrar en la página el error de borrar un activo (la hoja ya está cerrada; uso personal y server
  local).
