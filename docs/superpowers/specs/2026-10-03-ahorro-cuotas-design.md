# Cuánto te ahorran las cuotas sin interés — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo)
Base: `feat/base-nuevas-features` (ver `2026-10-03-base-nuevas-features-design.md`)

## Objetivo

Responder en la página **Cuotas** una pregunta concreta: **¿cuánto me ahorré (o me voy a ahorrar)
por pagar en cuotas sin interés en vez de contado?**

Con inflación mensual de 2 %, una cuota de $10.000 que se paga seis meses después de la compra
equivale a unos $8.900 del mes de la compra. La sección suma esa diferencia para todas las compras
en cuotas: **valor real de las cuotas** (cada una descontada por el IPC desde el mes de la compra
hasta el mes en que se paga) contra el **precio de contado**. Muestra el ahorro total, cuánto viene
de cuotas ya pagadas (con inflación real) y cuánto de cuotas a vencer (con un supuesto rotulado), y
el ahorro por comercio.

Es una **estimación** y la UI lo dice: con un chip «Estimación», con el supuesto de inflación a la
vista y con una nota al pie que explica el cálculo.

## Decisiones tomadas

- **Precio de contado = suma nominal de las cuotas.** Es la definición de "sin interés", y los
  resúmenes no traen ningún dato que permita distinguir un plan con interés (Cuota Simple, etc.) de
  uno sin interés ni el precio de lista. Todas las compras en cuotas en pesos se tratan como sin
  interés y la nota al pie lo aclara.
- **Solo pesos.** Las cuotas en USD no se licúan con el IPC. El endpoint trae solo `currency: "ARS"`
  y la sección **no se renderiza** con Moneda = USD.
- **Descuento mensual con el IPC**, con la misma convención que `deflateToLatest` en
  `client/src/realSalary.ts`: se componen las variaciones de los meses `(mesCompra, mesPago]`. La
  cuenta ya existe en la base: `inflationFactorBetween` de `client/src/inflationIndex.ts`.
- **Meses sin IPC publicado → último IPC mensual publicado**, rotulado con su mes ("2,1% mensual,
  último IPC publicado: julio de 2026"). No es editable: YAGNI, y el supuesto queda a la vista.
- **Pagada vs a vencer se decide por fecha de pago estimada contra hoy**, no por si la cuota ya
  apareció en un resumen: una cuota facturada en el último resumen cuyo vencimiento todavía no pasó
  es "a vencer". Una cuota que vence hoy cuenta como pagada.
- **Fecha de pago de una cuota = vencimiento del resumen en que se factura** (`dueDate`). Si el
  resumen no lo tiene (los de Visa Signature **no** lo traen: el parser no lo lee), se estima como
  `closingDate + 12 días`. Verificado contra la base local el 2026-10-03: los resúmenes ICBC traen
  vencimiento y casi siempre está a 12 días del cierre (alguno, a 13); los de Visa Signature no lo traen.
  La regla vive en la base: `statementDueDate` y `DIAS_CIERRE_A_VENCIMIENTO` de
  `server/src/stats/statementDueDate.ts`.
- **El cronograma se reconstruye** desde las apariciones reales de cada compra: las cuotas que se
  vieron en un resumen usan su fecha y su monto reales; las que no (anteriores al primer resumen
  importado, huecos, o futuras) se proyectan un mes por cuota desde la cuota más alta vista, con
  `addMonthsClamped` de `server/src/stats/months.ts` (recorta al último día del mes).
- **El server arma el cronograma, el cliente calcula el ahorro.** Mismo reparto que
  `realSalary.ts` / `inflationStats.ts` / `macroSignals.ts`: el server sirve datos, el cliente combina
  con el IPC que ya trae `useInflation()`.
- **Filtros**: Tarjeta aplica; **Año filtra por año de compra** (es una suma sobre compras, regla del
  filtro global). Las opciones del selector de año no cambian: "Todos" alcanza para ver compras de
  años sin cuotas pendientes.
- **Ahorro por comercio** (top 8, barras apiladas pagadas / a vencer). No hay detalle por compra.
- **Unidad**: el ahorro de cada compra queda en pesos de su mes de compra y los totales los suman
  sin re-expresar a pesos de hoy. Es la misma simplificación que sumar precios de contado de meses
  distintos; para una estimación alcanza.
- **Ubicación**: una sección propia entre la grilla de gráficos y el acordeón de meses, visible
  aunque no haya cuotas pendientes en los años elegidos.
- **Ahorro negativo** (IPC negativo): se muestra con su signo y el KPI dice «X% más que de contado»
  en lugar de «menos».
- **Error de red**: si falla el pedido de compras o el de inflación, la sección lo dice («No se pudo
  calcular el ahorro de las cuotas.») en vez de mostrar el vacío o la instrucción del IPC.
- **Cuotas con número fuera de rango** (`installmentCurrent < 1` o mayor que `installmentTotal`): se
  descartan al armar el cronograma; con un dato roto no se puede ubicar la cuota en el plan.

### Ajustes respecto del diseño original (lo que ya trae la base)

- `statementPaymentDate` y `addMonthsToDate` **no se crean**: se usan `statementDueDate` y
  `addMonthsClamped`, que ya tienen sus tests en la base (`statementDueDate.test.ts`,
  `months.test.ts`). `installmentPurchases.ts` no los re-exporta.
- `latestInflation`, `inflationRates`, `inflationFactorBetween`, `InflationAssumption` e
  `InflationFactor` **no se definen** en `installmentSavings.ts`: se importan de
  `client/src/inflationIndex.ts`, que ya los prueba (convención `(desde, hasta]`, supuesto en meses
  sin IPC, factor 1 con `hasta <= desde`).
- Los DTOs `installmentScheduleEntrySchema` / `installmentPurchaseDtoSchema` (con su test en
  `dtos.test.ts`) y el hook `useInstallmentPurchases` ya están en la base; esta feature no toca
  `shared/` ni `client/src/api/hooks.ts`.
- "Hoy" en el cliente sale de `todayIso()` de `client/src/isoDate.ts` (fecha local, igual que
  `formatLocalDate(new Date().toISOString())`), y el mes de una fecha, de `monthOf`.

## Datos

Todo sale de colecciones que ya existen; no hay modelos nuevos ni cambios en `server/src/db/models.ts`.

### `Statement` (`server/src/db/models.ts`, `statementSchema`)

- `_id`, `cardLabel`, `closingDate: Date | null`, `dueDate: Date | null`.

### `Transaction` (`server/src/db/models.ts`, `transactionSchema`)

Se leen las filas con `type: "purchase"`, `direction: "debit"`, `currency: "ARS"`,
`isInstallment: true`:

- `statementId`, `cardLabel`, `date` (fecha de **compra**: se repite igual en cada resumen),
  `merchant`, `category`, `amount` (monto de **la cuota**), `installmentCurrent`, `installmentTotal`,
  `comprobante`.

Cómo se ven en los datos reales (verificado contra la base local el 2026-10-03, sin copiar montos ni
comercios):

- La misma compra aparece una vez por resumen con `installmentCurrent` creciente y la misma `date`
  (en varios resúmenes seguidos).
- En bastantes compras el monto de alguna cuota difiere del resto (la cuota 1 con centavos de
  redondeo del banco): el monto no sirve como parte de la clave de compra.
- Hay alguna compra con **dos cuotas en el mismo resumen** y compras que se saltean un resumen: por eso
  se usa la fecha real de cada cuota vista, no solo un ancla.
- `comprobante` es `null` en algunas filas y no es único por sí solo. Agregarlo a la clave no parte
  ninguna compra (las claves son las mismas con y sin comprobante).

**Clave de compra**: `cardLabel | date | merchant | installmentTotal | comprobante ?? ""`. Con los
datos reales agrupa sin colisiones y sin partir compras.

### `InflationRate` (`server/src/db/models.ts`, `inflationRateSchema`)

- `periodo: "YYYY-MM"`, `variacionMensual` (porcentaje: `2.1` = 2,1 %). Llega al cliente por
  `GET /api/inflation` → `InflationRateDTO[]` con `useInflation()` (`client/src/api/hooks.ts`).

## Cálculo

### Server — cronograma de cada compra

Módulo puro nuevo `server/src/stats/installmentPurchases.ts`, testeable sin Mongo como
`futureInstallments.ts`:

```ts
export interface InstallmentOccurrence {
  cardLabel: string;
  merchant: string;
  category: string;
  date: string;
  amount: number;
  installmentCurrent: number;
  installmentTotal: number;
  comprobante: string | null;
  paymentDate: string;
}

export function purchaseKey(occurrence: InstallmentOccurrence): string;
export function buildInstallmentPurchases(occurrences: InstallmentOccurrence[]): InstallmentPurchaseDTO[];
```

- `buildInstallmentPurchases`:
  1. Descarta las apariciones con `installmentCurrent` fuera de `1..installmentTotal`.
  2. Agrupa por `purchaseKey`.
  3. Por grupo, arma `vistas: Map<numero, { amount, paymentDate }>`. Si una cuota aparece dos veces,
     gana la de `paymentDate` más temprana.
  4. **Ancla** = la cuota vista de número más alto (empate imposible por el paso 3).
  5. Para `numero` de 1 a `installmentTotal`: si está en `vistas`, usa su monto y fecha; si no,
     `amount = ancla.amount` y `paymentDate = addMonthsClamped(ancla.paymentDate, numero - ancla.numero)`
     (negativo hacia atrás, positivo hacia adelante).
  6. `category` sale de la aparición con `paymentDate` más reciente (las reglas pueden haberse
     reaplicado).
  7. Devuelve las compras ordenadas por `purchaseDate` y después `merchant`; las cuotas, por número.

### Cliente — ahorro real

Módulo puro nuevo `client/src/installmentSavings.ts`, sin React ni red. Importa de
`client/src/inflationIndex.ts` `inflationRates`, `latestInflation`, `inflationFactorBetween` y el
tipo `InflationAssumption`, y de `client/src/isoDate.ts` `monthOf`:

```ts
export interface InstallmentSaving {
  number: number;
  amount: number;
  paymentDate: string;
  paid: boolean;
  realValue: number;
  saving: number;
  estimated: boolean;
}

export interface PurchaseSaving {
  id: string;
  merchant: string;
  cardLabel: string;
  category: string;
  purchaseDate: string;
  installmentTotal: number;
  cashPrice: number;
  realValue: number;
  saving: number;
  savingPercent: number;
  paidSaving: number;
  futureSaving: number;
  installments: InstallmentSaving[];
}

export interface InstallmentSavingsSummary {
  purchases: PurchaseSaving[];
  cashPrice: number;
  realValue: number;
  saving: number;
  savingPercent: number;
  paidSaving: number;
  futureSaving: number;
  paidCount: number;
  futureCount: number;
  estimatedPaidCount: number;
  assumption: InflationAssumption;
}

export interface MerchantSaving {
  merchant: string;
  paidSaving: number;
  futureSaving: number;
  saving: number;
  purchaseCount: number;
}

export function computeInstallmentSavings(
  purchases: InstallmentPurchaseDTO[],
  inflation: InflationRateDTO[],
  today: string,
): InstallmentSavingsSummary | null;
export function savingsByMerchant(purchases: PurchaseSaving[], limit: number): MerchantSaving[];
```

**Factor de inflación** entre el mes de compra `c` y el mes de pago `p` (`YYYY-MM`), con
`inflationFactorBetween(rates, c, p, assumption)` de la base:

```
factor(c, p) = Π (1 + π_m / 100)   para m en (c, p]
π_m = variacionMensual(m) si está publicada; si no, assumption.variacionMensual  → estimated = true
```

Convención: la inflación del mes de compra no cuenta (el precio de contado ya es de ese mes) y la del
mes de pago cuenta entera aunque el pago sea alrededor del día 10. Las dos aproximaciones van en
sentidos opuestos y se compensan a grandes rasgos. Si `p <= c`, `factor = 1` y `estimated = false`.

**Por cuota**:

```
realValue = amount / factor(mes(purchaseDate), mes(paymentDate))
saving    = amount − realValue
paid      = paymentDate <= today
```

**Por compra**: `cashPrice = Σ amount`, `realValue = Σ realValue`, `saving = cashPrice − realValue`,
`savingPercent = saving / cashPrice × 100` (0 si `cashPrice` es 0, en unidades de porcentaje para
`formatPercent`), `paidSaving` / `futureSaving` = suma de `saving` de las cuotas pagadas / a vencer.

**Resumen**: las mismas sumas sobre todas las compras, más `paidCount`, `futureCount`,
`estimatedPaidCount` (cuotas pagadas con al menos un mes estimado: típicamente las pagadas en el mes
en curso o el anterior, cuyo IPC todavía no salió) y `assumption = latestInflation(inflation)`.

`savingsByMerchant` agrupa por `merchant`, suma `paidSaving`, `futureSaving`, `saving` y cuenta
compras, ordena por `saving` descendente y corta en `limit`.

**Ejemplo (va como test)**. Compra 2026-01-15, 3 cuotas de $1.000 con pago 2026-02-10, 2026-03-10
y 2026-04-10. IPC: 2026-02 = 2, 2026-03 = 2 (último publicado). Hoy 2026-03-20.

| Cuota | Factor | Valor real | Estado | Estimada |
|---|---|---|---|---|
| 1 | 1,02 | 980,39 | pagada | no |
| 2 | 1,0404 | 961,17 | pagada | no |
| 3 | 1,061208 (abril con supuesto 2 %) | 942,32 | a vencer | sí |

Contado $3.000, valor real $2.883,88, ahorro $116,12 (3,9 %): $58,44 en pagadas y $57,68 a vencer.

### Casos borde

| Caso | Comportamiento |
|---|---|
| Sin IPC en la base | `latestInflation` → `null`, `computeInstallmentSavings` → `null`; la sección muestra cómo traerlo |
| Mes sin IPC anterior al último publicado (hueco en la serie) | usa el supuesto y marca `estimated` |
| Mes de pago anterior o igual al de compra | factor 1, ahorro 0 en esa cuota |
| IPC negativo | se aplica igual; el ahorro puede dar negativo y se muestra así («más que de contado») |
| Resumen sin `dueDate` ni `closingDate` | sus filas se descartan en la ruta (no hay fecha de pago) |
| Fila sin `installmentCurrent` / `installmentTotal` | se descarta en la ruta |
| `installmentCurrent` fuera de `1..installmentTotal` | se descarta al armar el cronograma |
| Compra que deja de aparecer antes de la última cuota | sus cuotas restantes se proyectan desde el ancla; si la fecha ya pasó, cuentan como pagadas |
| Cuotas en USD o con `direction: "credit"` | fuera, por el filtro de la ruta |
| Sin compras en los años elegidos | lista vacía; la sección lo dice con esos años |
| Falla el pedido de compras o de inflación | «No se pudo calcular el ahorro de las cuotas.» |

## API

### `GET /api/stats/installment-purchases`

En `server/src/http/routes/stats.ts`, al final del router (no hace falta tocar `app.ts`). No cambia
`baseMatch` ni las rutas existentes.

Query: `cardLabel?`, `year?` (repetible, con `parseYears` de `server/src/http/yearFilter.ts`).
`currency` se ignora: siempre ARS.

1. `StatementModel.find(cardLabel ? { cardLabel } : {}).lean()` → `Map<string, string | null>` de
   `statementId → statementDueDate({ dueDate, closingDate })` (fechas pasadas a `YYYY-MM-DD`).
2. `TransactionModel.find({ type: "purchase", direction: "debit", currency: "ARS", isInstallment: true,
   statementId: { $in: ids } }).lean()`.
3. Descarta filas sin fecha de pago o sin `installmentCurrent` / `installmentTotal`, mapea a
   `InstallmentOccurrence` y llama a `buildInstallmentPurchases`.
4. Filtra `monthInYears(purchase.purchaseDate.slice(0, 7), years)` y responde el array.

### DTOs en `shared/src/dtos.ts` (ya en la base)

```ts
export const installmentScheduleEntrySchema = z.object({
  number: z.number().int().positive(),
  amount: z.number(),
  paymentDate: z.string(),
});

export const installmentPurchaseDtoSchema = z.object({
  id: z.string(),
  cardLabel: z.string(),
  merchant: z.string(),
  category: z.string(),
  purchaseDate: z.string(),
  installmentTotal: z.number().int().positive(),
  installments: z.array(installmentScheduleEntrySchema),
});

export type InstallmentScheduleEntry = z.infer<typeof installmentScheduleEntrySchema>;
export type InstallmentPurchaseDTO = z.infer<typeof installmentPurchaseDtoSchema>;
```

`id` es la clave de compra.

Ejemplo de respuesta:

```json
[
  {
    "id": "ICBC|2026-05-04|MERCADOLIBRE|4|1",
    "cardLabel": "ICBC",
    "merchant": "MERCADOLIBRE",
    "category": "Compras",
    "purchaseDate": "2026-05-04",
    "installmentTotal": 4,
    "installments": [
      { "number": 1, "amount": 1500, "paymentDate": "2026-06-14" },
      { "number": 2, "amount": 1500, "paymentDate": "2026-07-14" },
      { "number": 3, "amount": 1500, "paymentDate": "2026-08-14" },
      { "number": 4, "amount": 1500, "paymentDate": "2026-09-14" }
    ]
  }
]
```

### Hook en `client/src/api/hooks.ts` (ya en la base)

```ts
export function useInstallmentPurchases(f: Pick<StatFilters, "cardLabel" | "year">) {
  return useQuery({
    queryKey: ["installment-purchases", f],
    queryFn: () => apiFetch<InstallmentPurchaseDTO[]>(`/stats/installment-purchases${qs(f)}`),
  });
}
```

## UI

### Datos de la sección

Hook nuevo `client/src/useInstallmentSavings.ts`:

```ts
interface UseInstallmentSavingsParams { cardLabel?: string; years?: string[] }
export interface InstallmentSavingsState {
  summary: InstallmentSavingsSummary | null;
  merchants: MerchantSaving[];
  isLoading: boolean;
  isError: boolean;
}
export const useInstallmentSavings = ({ cardLabel, years }: UseInstallmentSavingsParams): InstallmentSavingsState
```

Compone `useInstallmentPurchases({ cardLabel, year: years })` y `useInflation()`; con `useMemo` llama a
`computeInstallmentSavings(purchases, inflation, todayIso())` y `savingsByMerchant(summary.purchases, 8)`.
Ambas respuestas pasan por `Array.isArray` antes de usarse (los mocks de tests existentes devuelven
`{}` para URLs desconocidas). `isError` es el `isError` de cualquiera de las dos queries. No hace
falta un `hasInflation` aparte: `computeInstallmentSavings` devuelve `null` solo cuando no hay IPC,
así que `summary === null` (sin cargar ni error) es "falta la inflación".

### Componente `client/src/components/InstallmentSavingsSection.tsx`

```ts
interface InstallmentSavingsSectionProps { cardLabel?: string; years?: string[] }
```

`<Box component="section" aria-labelledby="ahorro-cuotas-titulo" sx={{ mb: 3 }}>` con, de arriba a
abajo:

1. **Encabezado**: `Stack` en fila con `flexWrap`: `Typography variant="h5" component="h2"
   id="ahorro-cuotas-titulo"` «Cuánto te ahorran las cuotas» + `Chip size="small" variant="outlined"
   label="Estimación"`.
2. **Bajada** (`body2`, `text.secondary`): «Compras en cuotas en pesos hechas en {yearsLabel(years)}»
   o, con "Todos", «Todas tus compras en cuotas en pesos».
3. Early returns (el encabezado y la bajada se ven siempre):
   - cargando → `CircularProgress size={24}`;
   - error → «No se pudo calcular el ahorro de las cuotas.»;
   - `summary === null` (sin IPC) → «Para estimar el ahorro hace falta la inflación. Usá el botón de actualizar de
     la barra superior para traerla.»;
   - sin compras → «No hay compras en cuotas en pesos hechas en {yearsLabel(years)}» / «No hay
     compras en cuotas en pesos».
4. **KPIs** con `KpiGrid cardCount={3}` y el `Kpi` compartido:

   | Label | Valor | `sub` | Ícono | Color |
   |---|---|---|---|---|
   | Ahorro real | `saving` | «{savingPercent}% menos que de contado» (con ahorro negativo, «{abs}% más que de contado») | `SavingsOutlinedIcon` | `primary` |
   | En cuotas pagadas | `paidSaving` | «{n} cuotas · con IPC publicado», o «{n} cuotas · {k} con IPC estimado» si `estimatedPaidCount > 0`; «Sin cuotas pagadas» con `n = 0` | `TaskAltOutlinedIcon` | `success` |
   | En cuotas a vencer | `futureSaving` | «{n} cuotas · supone {variacionMensual}% mensual» (`subMultiline`); «Sin cuotas a vencer» con `n = 0` | `EventOutlinedIcon` | `warning` |

   Montos con `formatMoney(value, "ARS")`, porcentajes con `formatPercent`, plural "cuota/cuotas"
   como en `InstallmentsPage`.
5. **`ChartCard` «Ahorro real por comercio»** a todo el ancho, con
   `InstallmentSavingsByMerchantChart` y debajo un `ChartLegend` con «Pagadas» y «A vencer».
6. **Nota al pie** (`caption`, `text.secondary`, bloque): «Estimación: cada cuota se lleva a pesos del
   mes de la compra con el IPC y se compara con pagar todo de contado. Supone que las cuotas son sin
   interés (precio de contado = suma de las cuotas) y que pagás cada resumen al vencimiento. Para los
   meses sin IPC publicado (después de {mes del último IPC en minúscula}) usa el último dato:
   {variacionMensual}% mensual.» El mes sale de `formatMonthLabel(periodo).toLowerCase()`
   («julio de 2026»).

Todo el cálculo y los textos derivados (plural, sub de cada KPI, bajada) se resuelven antes del
`return`.

### Gráfico `client/src/components/charts/InstallmentSavingsByMerchantChart.tsx`

Presentacional, recibe los puntos ya calculados:

```ts
interface InstallmentSavingsByMerchantChartProps { merchants: MerchantSaving[] }
```

- `ResponsiveBar` horizontal (`layout="horizontal"`), `indexBy="merchant"`, `keys={["Pagadas", "A vencer"]}`
  apiladas; filas `{ merchant, Pagadas: paidSaving, "A vencer": futureSaving }` en orden ascendente
  (nivo dibuja de abajo hacia arriba), como `InstallmentsByMerchantChart`.
- Colores `seriesColor(mode, 2)` (pagadas) y `seriesColor(mode, 3)` (a vencer), los mismos que usa
  el `ChartLegend` de la sección: el archivo del gráfico exporta `savingsLegendItems(mode)` y de ahí
  salen tanto los colores de las barras como los ítems de la leyenda. El validador de paleta del skill de dataviz da para este par, en
  claro, una separación CVD de 7,9 (banda 6–8: legal solo con codificación secundaria), así que la
  identidad no queda solo en el color: leyenda, tooltip con el nombre de la serie y `innerPadding={2}`
  (2px de superficie entre los dos tramos). La paleta del repo es compartida y no se toca.
- `enableLabel={false}`, `valueFormat` con `formatMoney(…, "ARS")`, `borderRadius={4}`, alto 260,
  `nivoTheme`, `motionConfig="gentle"`.
- Sin datos → «Sin ahorro para mostrar».

### Compu

En `client/src/pages/InstallmentsPage.tsx`:

- `hasMonths = !isLoading && months.length > 0` antes del `return`.
- Orden: título, `FiltersBar`, spinner, vacío de cuotas, **[KPI «Cuotas pendientes» + grilla de 5
  gráficos]** si `hasMonths`, **`{currency === "ARS" && <InstallmentSavingsSection cardLabel={cardLabel}
  years={years} />}`**, **[texto resumen + acordeón]** si `hasMonths`.
- La sección no depende de `hasMonths`: si todas las cuotas ya se pagaron, el ahorro se sigue viendo.

### Mobile (`< md`)

- Sin controles nuevos: no hay objetivos táctiles que dimensionar con `tapTarget.ts`.
- `KpiGrid` ya pasa a una columna; `Kpi` ya achica ícono y valor. El tercer KPI usa `subMultiline`
  para que el supuesto no se corte.
- El gráfico sigue la regla de **barras horizontales** del spec responsive: margen
  `{ top: 8, right: 24, bottom: 8, left: 96 }`, nombres truncados a 11 caracteres con
  `truncateLabel`, `axisBottom={null}` y `tooltip = compactBarTooltip({ showKey: true })` (apilado:
  hace falta saber si es «Pagadas» o «A vencer»). En compu: margen
  `{ top: 8, right: 24, bottom: 32, left: 136 }`, truncado a 16, eje inferior con
  `formatMoneyCompact`.
- El encabezado envuelve el chip debajo del título si no entra; la nota al pie fluye en varias líneas.

## Tests

Con TDD, cada pieza arranca en rojo. Fixtures sintéticos.

- **`server/src/stats/installmentPurchases.test.ts`**:
  - agrupa la misma compra vista en dos resúmenes (1/3 y 2/3) en una sola, con la cuota 3 proyectada
    un mes después de la 2;
  - reconstruye hacia atrás las cuotas anteriores al primer resumen (vista solo la 3/4);
  - dos cuotas en el mismo resumen conservan la fecha real de cada una;
  - una cuota repetida se queda con la fecha más temprana;
  - la cuota 1 con centavos distintos no parte la compra y su monto real entra al contado;
  - distinto `comprobante` o `merchant` → compras distintas; `comprobante` null entra a la clave como "";
  - la categoría sale de la aparición más reciente;
  - descarta cuotas con número fuera de rango;
  - proyección que cae en un mes más corto recorta el día;
  - orden de compras y de cuotas.
  (`statementDueDate` y `addMonthsClamped` ya tienen sus tests en la base.)
- **`server/src/http/routes/stats.test.ts`** (bloque nuevo `installment-purchases`): con el fixture
  existente (resumen ICBC con cierre `2026-07-02`, sin `dueDate`; MERCADOLIBRE 2/4 de $1.500 comprada
  `2026-05-04`) devuelve el cronograma del ejemplo de la sección API; usa el `dueDate` del resumen
  cuando lo trae; excluye no-cuotas, USD y `direction: "credit"`; descarta resúmenes sin fechas;
  `year=2025` → `[]` y `year=2026` lo trae; `cardLabel` de otra tarjeta → `[]`; `currency=USD` no
  cambia la respuesta.
- **`client/src/installmentSavings.test.ts`**:
  - el ejemplo completo de la sección Cálculo (valores con `toBeCloseTo`);
  - pagada vs a vencer en el borde `paymentDate === today`;
  - `estimatedPaidCount` cuenta una cuota pagada en un mes sin IPC;
  - pago en el mismo mes de la compra → ahorro 0;
  - IPC negativo → ahorro negativo;
  - sin inflación → `null`; sin compras → resumen en cero con `purchases: []`;
  - `savingsByMerchant` agrupa, cuenta compras, ordena y corta en `limit`.
  (`inflationFactorBetween` y `latestInflation` ya tienen sus tests en `inflationIndex.test.ts`.)
- **`client/src/components/charts/InstallmentSavingsByMerchantChart.test.tsx`** (con `NivoProbe` como
  `merchantCharts.test.tsx`): en mobile margen izquierdo 96, `axisBottom: "none"`,
  `customTooltip: "yes"`; en compu margen izquierdo 136 y eje visible; colores de las ranuras 2 y 3;
  sin datos → «Sin ahorro para mostrar».
- **`client/src/components/InstallmentSavingsSection.test.tsx`**: con compras e IPC muestra los tres
  KPIs, el chip «Estimación» y la nota con el mes del último IPC; sin IPC muestra la instrucción; sin
  compras con `years={["2025"]}` dice «…hechas en 2025»; con "Todos" dice «Todas tus compras…»;
  error de red → mensaje de error; ahorro negativo → «más que de contado»; el fetch lleva `year` y
  `cardLabel` y no lleva `currency`. Fecha fijada con `vi.useFakeTimers({ toFake: ["Date"] })`.
- **`client/src/pages/InstallmentsPage.test.tsx`**: el mock de `fetch` suma ramas para
  `/stats/installment-purchases` e `/inflation`; casos nuevos: la sección aparece en ARS, no aparece
  con `?currency=USD`, y aparece aunque no haya cuotas pendientes en los años elegidos.
- Archivos con varios renders llevan `afterEach(cleanup)` (en este repo el auto-cleanup de RTL está
  apagado).

**Verificación final**: `bun run test`, `bun run typecheck` y `bun run build` en verde. La prueba
manual en Cuotas (con "Todos", con una tarjeta, con USD —la sección desaparece— y en el ancho de un
celular) queda para el usuario: esta rama no levanta la app.

## Orden de implementación

1. **Server**: `installmentPurchases.ts` con sus tests, ruta y test de ruta.
2. **Motor**: `installmentSavings.ts` con su batería de tests (no depende de UI).
3. **UI**: gráfico, `useInstallmentSavings`, sección e integración en `InstallmentsPage`.

## Fuera de alcance (YAGNI)

- Distinguir cuotas con interés de cuotas sin interés, o marcar compras a mano para excluirlas.
- Descuento por pago contado (precio de contado menor a la suma de las cuotas).
- Hacer editable el supuesto de inflación futura o usar inflación esperada de mercado (REM).
- Costo de oportunidad (tasa en pesos) además de la inflación.
- Re-expresar el ahorro a pesos de hoy.
- Detalle por compra (tabla o tarjetas) y ahorro por mes.
- Cuotas en USD.
- Sumar los años de compra a las opciones del selector de año de Cuotas.
- Corregir el parser de Visa Signature para que lea el vencimiento: se cubre con la estimación de
  cierre + 12 días.
