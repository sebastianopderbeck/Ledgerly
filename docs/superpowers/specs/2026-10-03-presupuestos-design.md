# Presupuestos por categoría — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo). Ajustado a lo que ya trae `feat/base-nuevas-features`.

## Objetivo

Agregar una sección nueva, la página **Presupuestos** en la ruta `/presupuestos`, que responda **«¿cómo vengo este mes
contra lo que me propuse gastar en cada cosa?»**.

El usuario define un **tope mensual en pesos por categoría**, y cada tope puede ajustarse solo por inflación. Para el mes
elegido, la página muestra el gasto contra el tope de cada categoría, con una barra de progreso y un estado (**en rango**,
**cerca** o **pasado**). Abajo muestra el **histórico de cumplimiento** mes a mes.

En el spec original (`2026-07-13-ledgerly-expense-tracker-design.md`, no-goals: «Sin presupuestos / alertas / metas») los
presupuestos quedaban afuera. Este diseño levanta solo **presupuestos**. Alertas y metas siguen fuera.

## Lo que ya trae la base

`feat/base-nuevas-features` (`2026-10-03-base-nuevas-features-design.md`) dejó en su forma final todo lo compartido. Esta
feature **no toca** esos archivos:

| Pieza | Dónde |
|---|---|
| Ruta `/presupuestos` con el stub `BudgetsPage` (el `h4` «Presupuestos» tiene que verse también mientras carga, lo exige `App.test.tsx`) | `client/src/App.tsx` |
| Ítem «Presupuestos» (`TrackChangesOutlined`, en «Más», después de Flujo y antes de Movimientos) y sus tests | `client/src/components/layout/navItems.ts` |
| Router stub `budgetsRouter` montado en `/api/budgets` | `server/src/http/app.ts`, `server/src/http/routes/budgets.ts` |
| Modelo `BudgetModel` / `BudgetDoc` (`category` única, `ajustaInflacion` default `false`) | `server/src/db/models.ts` |
| Mapper `toBudgetDTO` | `server/src/http/mappers.ts` |
| DTOs `budgetDtoSchema`, `budgetInputSchema`, `budgetPatchSchema`, `categoryMonthStatSchema`, `budgetSpendingDtoSchema` y sus tipos | `shared/src/dtos.ts` |
| Hooks `useBudgets`, `useBudgetSpending(years)`, `useCreateBudget`, `useUpdateBudget`, `useDeleteBudget` (las mutaciones invalidan `["budgets"]`) | `client/src/api/hooks.ts` |
| `inflationFactor(inflation, from, to)` y `latestInflationPeriod(inflation)` | `client/src/inflationIndex.ts` |
| `parseMoneyInput` y `formatMoneyInput` (formato argentino; aceptan `0`) | `client/src/moneyInput.ts` |
| `transactionsLink({ category, month, currency })` | `client/src/filters/transactionsLink.ts` |
| `monthRange(month)` | `client/src/filters/globalFilters.ts` |
| `UNCATEGORIZED` y `categoryOptions(categories, rules)` | `client/src/categoryOptions.ts` |
| `ResponsiveSheet` (`BottomSheet` en mobile, `Dialog fullWidth maxWidth="xs"` con `DialogTitle` en compu, `actions` opcional) | `client/src/components/ResponsiveSheet.tsx` |
| `addMonths`, `lastDayOfMonth`, `monthOf` (server) | `server/src/stats/months.ts` |

## Decisiones tomadas

- **Imputación del gasto por fecha del movimiento**: el mes calendario de `transactions.date`, que es el mismo criterio de
  «Gasto por categoría», «Evolución mensual» y el filtro Mes del Dashboard. No se imputa por mes de resumen. El porqué está
  más abajo.
- **Qué cuenta como gasto**: solo `type: "purchase"` en `currency: "ARS"`, de todas las tarjetas. Es lo mismo que suma el
  Dashboard con Moneda ARS y Tarjeta «Todas». No cuentan pagos, impuestos, comisiones, reintegros ni ajustes, y los consumos
  en USD no suman al tope.
- **Un tope por categoría**, sin vigencia ni versiones. El histórico se calcula **con los topes actuales** y la UI lo aclara.
- **Ajuste por inflación opcional por tope**. Un tope ajustado está en **pesos constantes de `periodoBase`**: hacia adelante
  sube con el IPC publicado y hacia atrás se deflacta, así el histórico compara peras con peras. Cada vez que se guarda el
  tope, el server fija `periodoBase` en el último IPC publicado.
- **Estados**: `ok` («En rango») por debajo del 80 % del tope, `cerca` del 80 % al 100 % inclusive, `pasado` por encima del
  100 %.
- **Mes elegido = Mes global** (`from`/`to` en la URL, filtro de año global). Así viaja entre secciones: si elegís septiembre
  acá y vas al Dashboard, la torta muestra los mismos números. Sin Mes en la URL, el mes por defecto es el **último mes
  cerrado**.
- **El Año global aplica** a los meses que se pueden elegir y al histórico. **Moneda y Tarjeta no aplican**, porque los topes
  son en ARS y cubren todas las tarjetas.
- **El histórico solo incluye meses cerrados con consumos**. Un mes sin ningún consumo en ARS no aparece: es falta de datos,
  no gasto cero.
- **«Sin categoría» no admite tope**. Aparece en la lista «Sin tope» con un acceso a Reglas.
- **La categoría de un tope no se edita**. Para cambiarla se borra el tope y se crea otro.
- **Categorías elegibles para un tope nuevo**: las de `categoryOptions(categories, rules)` de la base (categorías de los
  movimientos más las de las reglas, sin «Sin categoría», sin repetir y en orden alfabético), menos las que ya tienen tope.
  Sumar las categorías de las reglas permite ponerle tope a una categoría que todavía no tiene consumos.
- **Montos tipeados con `parseMoneyInput`** de la base. Acepta `0`, así que el formulario exige `> 0` por su cuenta.
- **El editor se reinicia en cada apertura**. `useBudgetEditor` cuenta las aperturas y el editor usa ese número como `key`.
  Así «Nuevo tope» siempre arranca vacío, aunque antes se haya cancelado o guardado otro.
- **Meses dentro de una oración en minúscula** («Sin tope en septiembre de 2026», «IPC hasta agosto de 2026»). El selector de
  mes y el tooltip usan `formatMonthLabel` tal cual («Septiembre de 2026»).
- **Reparto del cómputo**, el mismo patrón que `realSalary.ts` y `macroSignals.ts`: el server guarda topes y sirve el gasto
  agregado por mes y categoría. El cliente calcula el tope de cada mes, los estados y el histórico en un módulo puro
  (`client/src/budgets.ts`), que además arma la vista entera de la página (`budgetsView`) para que el hook solo combine
  queries.

### Por qué por fecha del movimiento y no por resumen

Dentro de la app conviven dos meses:

- **Fecha del movimiento** (`$dateToString "%Y-%m"` sobre `date`). La usan «Gasto por categoría», «Evolución mensual»,
  «Top comercios», el filtro Mes y Movimientos.
- **Mes de consumo del resumen** (`consumptionMonth(closingDate)`). Lo usa solo «A pagar por mes en USD», y sobre
  `saldoActual`, que mezcla impuestos y pagos y no tiene categoría.

Un presupuesto es **por categoría**. El único criterio que da categoría y coincide con la torta del Dashboard es el de la
fecha del movimiento. Además, el botón «Ver movimientos» de cada fila lleva a Movimientos filtrado por esa categoría y ese
mes, y muestra exactamente las filas que suman.

**Consecuencia con las cuotas.** Cada cuota es una transacción propia (el `fingerprint` incluye `installmentCurrent`) y en
los resúmenes argentinos lleva la **fecha de compra original**. Por eso una compra en N cuotas va sumando cada cuota **en el
mes de compra** a medida que llegan los resúmenes, igual que en el Dashboard. La página lo explica en una línea debajo de
«Por categoría». Imputar cada cuota a su mes de pago queda fuera de alcance, porque rompería la coherencia con el Dashboard.

## Datos

### Colección `budgets` (modelo `Budget`, ya en la base)

| Campo | Tipo | Significado |
|---|---|---|
| `category` | string, único | Igual a `transactions.category` |
| `topeArs` | number > 0 | Tope mensual en pesos (en pesos de `periodoBase` si `ajustaInflacion`) |
| `ajustaInflacion` | boolean | Si el tope sigue al IPC |
| `periodoBase` | `"YYYY-MM"` | El server lo fija en cada alta o edición: el `periodo` más nuevo de `InflationRate`, o el mes calendario actual si no hay IPC cargado |

`periodoBase` es `string` y no `Date` por el mismo motivo que `InflationRate.periodo`: toda la matemática es de calendario y
por comparación lexicográfica. La colección arranca vacía, así que no hace falta migración ni seed.

### Lo que se lee (sin cambios de esquema)

- `transactions`: `type`, `currency`, `date`, `category`, `amount`.
- `statements`: `closingDate`, para el último mes cerrado.
- `inflationrates`: `periodo`, `variacionMensual`, vía el `GET /api/inflation` existente (hook `useInflation`).
- `GET /api/transactions/categories` (`useCategories`) y `GET /api/category-rules` (`useCategoryRules`), para las categorías
  elegibles.

## Cálculo

### Gasto del mes (server)

```
gasto(C, M) = Σ amount  de las transacciones con type = "purchase", currency = "ARS",
                         category = C y $dateToString("%Y-%m", date) = M   (UTC)
```

El filtro y el agrupamiento son los mismos que los de `baseMatch` + `/stats/by-category` con Moneda ARS y sin tarjeta. Las
fechas se guardan a medianoche UTC, igual que asume `/stats/monthly`.

### Último mes cerrado (server) — `server/src/stats/closedMonth.ts`

```ts
export function lastClosedMonth(closingDates: Array<Date | null>): string | null
```

- Ignora los `null`. Sin fechas devuelve `null`.
- Toma el `closingDate` más reciente (ISO UTC). Si es el último día de su mes, devuelve ese mes. Si no, devuelve el mes
  anterior, que es el último que el resumen cubre completo.
- Ejemplos: `2026-10-02 → "2026-09"`, `2026-09-30 → "2026-09"`, `2026-09-25 → "2026-08"`, `2026-01-02 → "2025-12"`.
- Con varias tarjetas manda el cierre más reciente. No se exige que todas estén importadas, para que una tarjeta dada de baja
  no congele el valor.

### Índice de inflación (cliente, ya en la base) — `client/src/inflationIndex.ts`

```
F(a → b) = Π_{a < m ≤ b, m con IPC} (1 + variacionMensual(m) / 100)   si a < b
F(a → b) = 1 / F(b → a)                                               si a > b
F(a → a) = 1
```

Los meses sin IPC publicado cuentan como 0 %. `variacionMensual(m)` es la inflación **de** `m`.

### Tope del mes y estado (cliente) — `client/src/budgets.ts`

```
tope(B, M)  = topeArs                           si !ajustaInflacion
            = topeArs × F(periodoBase → M)      si ajustaInflacion
ratio       = gasto / tope
estado      = ratio < 0,8 → "ok" · ratio ≤ 1 → "cerca" · si no → "pasado"
restante    = tope − gasto          (negativo si te pasaste)
```

- **Prellenado del editor**: `currentLimit(budget, inflation) = limitForMonth(budget, latestInflationPeriod(inflation) ??
  budget.periodoBase, inflation)`, redondeado a entero. El formulario siempre está en «pesos de hoy». Al guardar, el server
  rebasea `periodoBase` al último IPC, de modo que guardar sin tocar nada deja el tope efectivo igual.
- **Totales del mes**: `tope = Σ tope`, `gastado = Σ gasto` (solo las categorías con tope), `estado = budgetStatus(gastado,
  tope)`, `cumplidos` = cantidad con estado distinto de `pasado`, `cerca` = cantidad en `cerca`, `total` = cantidad de topes.

### Meses: elegibles, por defecto, parcial e histórico

- **Elegibles**: los meses distintos de `gastos` (que ya vienen filtrados por el Año global en el server), más el mes elegido
  si no figura, en orden ascendente.
- **Mes elegido**: `from.slice(0, 7)` si la URL trae Mes. Si no, `defaultBudgetMonth(meses, ultimoMesCerrado, hoy)`, que es
  el último mes elegible `≤ ultimoMesCerrado`. Si no hay ninguno, el último elegible. Si no hay ninguno, el mes calendario
  actual (hora local). El mes por defecto **no se escribe** en la URL.
- **Parcial**: `ultimoMesCerrado !== null && mes > ultimoMesCerrado`.
- **Histórico**: los meses de `gastos` que cumplen `≤ ultimoMesCerrado` (todos si es `null`). Para cada mes se arma la lista
  de categorías en cada estado.

### Funciones de `client/src/budgets.ts`

```ts
export type BudgetStatus = "ok" | "cerca" | "pasado";
export const CERCA_DESDE = 0.8;
export const BUDGET_STATUSES: BudgetStatus[] = ["ok", "cerca", "pasado"];
export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = { ok: "En rango", cerca: "Cerca", pasado: "Pasado" };
export const BUDGET_STATUS_COLOR: Record<BudgetStatus, "success" | "warning" | "error"> = { ok: "success", cerca: "warning", pasado: "error" };

export interface BudgetLine { budget: BudgetDTO; category: string; tope: number; gastado: number; restante: number; ratio: number; estado: BudgetStatus; }
export interface BudgetTotals { tope: number; gastado: number; restante: number; ratio: number; estado: BudgetStatus; cumplidos: number; cerca: number; total: number; }
export interface UnbudgetedCategory { category: string; total: number; }
export interface BudgetMonthSummary { month: string; ok: string[]; cerca: string[]; pasado: string[]; }
export interface BudgetsViewInput { budgets: BudgetDTO[]; spending: BudgetSpendingDTO; inflation: InflationRateDTO[]; selectedMonth: string | null; today: Date; }
export interface BudgetsView { months: string[]; month: string; partial: boolean; lines: BudgetLine[]; totals: BudgetTotals | null; unbudgeted: UnbudgetedCategory[]; history: BudgetMonthSummary[]; latestIpc: string | null; hasSpending: boolean; }

budgetStatus(gastado: number, tope: number): BudgetStatus
limitForMonth(budget: BudgetDTO, month: string, inflation: InflationRateDTO[]): number
currentLimit(budget: BudgetDTO, inflation: InflationRateDTO[]): number
budgetLines(budgets: BudgetDTO[], gastos: CategoryMonthStat[], month: string, inflation: InflationRateDTO[]): BudgetLine[]
budgetTotals(lines: BudgetLine[]): BudgetTotals | null
unbudgetedCategories(budgets: BudgetDTO[], gastos: CategoryMonthStat[], month: string): UnbudgetedCategory[]
budgetCategoryOptions(categories: string[], rules: Pick<CategoryRuleDTO, "category">[], budgets: BudgetDTO[]): string[]
selectableMonths(gastos: CategoryMonthStat[], selected: string | null): string[]
defaultBudgetMonth(months: string[], ultimoMesCerrado: string | null, today: Date): string
isPartialMonth(month: string, ultimoMesCerrado: string | null): boolean
closedMonths(gastos: CategoryMonthStat[], ultimoMesCerrado: string | null): string[]
budgetHistory(budgets: BudgetDTO[], gastos: CategoryMonthStat[], months: string[], inflation: InflationRateDTO[]): BudgetMonthSummary[]
budgetsView(input: BudgetsViewInput): BudgetsView
monthInText(month: string): string
formatPesos(value: number): string
budgetBalanceText(restante: number): string
budgetInflationNote(budget: BudgetDTO, month: string, latestIpc: string | null): string
```

- `budgetLines` ordena por `ratio` descendente (lo más comprometido arriba) y, si empatan, por categoría. Un tope sin
  consumos en el mes da `gastado = 0`, estado `ok`.
- `budgetTotals` devuelve `null` si no hay líneas. `ratio = gastado / tope` alimenta el «{pct}% usado» del KPI.
- `unbudgetedCategories` devuelve las categorías con gasto mayor a 0 en el mes y sin tope, de mayor a menor gasto.
  **Incluye** «Sin categoría» (`UNCATEGORIZED` de la base).
- `budgetCategoryOptions` es `categoryOptions(categories, rules)` sin las categorías que ya tienen tope.
- `monthInText` es `formatMonthLabel` en minúscula, para usar el mes dentro de una oración.
- `formatPesos` es `formatMoney` en ARS redondeado a pesos enteros (sin `-0`): los topes ajustados tienen centavos que no
  aportan nada en pantalla.
- `budgetBalanceText` arma «Te quedan {restante}» o «Te pasaste por {−restante}», y `budgetInflationNote` el agregado
  « · Ajustado por IPC», « (IPC hasta {mes})» o « (sin IPC cargado)» de cada fila.

### Casos borde

| Situación | Comportamiento |
|---|---|
| Sin topes | Texto de bienvenida y la lista «Sin tope en {mes}». Sin KPIs ni histórico |
| Tope de una categoría sin consumos en el mes | `gastado = 0`, «En rango» |
| Categoría renombrada por una regla (tope huérfano) | Sigue listado con 0. Se borra a mano |
| Mes elegido sin ningún consumo en ARS | Filas en 0 y la línea «Sin consumos en {mes}.». No entra al histórico |
| Mes parcial (posterior al último cerrado) | Chip «Parcial» y aclaración. Queda fuera del histórico |
| Ningún resumen con `closingDate` | `ultimoMesCerrado = null`: no hay meses parciales y el histórico usa todos los meses |
| IPC sin cargar | `F = 1`: los topes ajustados quedan nominales y el editor lo avisa |
| IPC del mes todavía no publicado | Se ajusta hasta el último IPC. La fila dice «(IPC hasta {mes})» |
| Año elegido sin consumos | Mes = mes calendario actual, filas en 0, gráfico «Sin datos» |
| Mes global sin consumos (p. ej. elegido en otra sección) | Se respeta y se suma a los elegibles |
| Moneda USD o una tarjeta elegidas en otra sección | Se ignoran acá. Los links del menú las conservan como siempre |
| Consumo en USD de una categoría con tope | No suma (fuera de alcance) |
| Reintegros (`type: "refund"`) | No restan, igual que en el Dashboard |
| Dos altas simultáneas de la misma categoría | La segunda choca con el índice único y también da `409` |

## API

### Endpoints — `server/src/http/routes/budgets.ts` (reemplaza el stub), montado en `/api/budgets`

| Método y ruta | Entrada | Respuesta |
|---|---|---|
| `GET /api/budgets` | — | `BudgetDTO[]`, ordenado por `category` |
| `GET /api/budgets/spending?year=2025&year=2026` | `year` repetible (`parseYears` de `yearFilter.ts`). Sin `year`, todo | `BudgetSpendingDTO` |
| `POST /api/budgets` | `budgetInputSchema` | `201 BudgetDTO`. `400` si es inválido. `409` si la categoría ya tiene tope |
| `PATCH /api/budgets/:id` | `budgetPatchSchema` (la categoría no se edita) | `BudgetDTO`. `400` si es inválido. `404` si no existe o el id es inválido (`isValidObjectId`) |
| `DELETE /api/budgets/:id` | — | `204`. `404` si no existe o el id es inválido |

Detalles:

- **Validación** con `safeParse` de los schemas de shared, como `imports.ts`. Mensajes: `400 "Tope inválido: category no
  vacía y topeArs mayor a 0"` en el POST y `400 "Tope inválido: mandá topeArs mayor a 0 o ajustaInflacion"` en el PATCH. El
  `409` dice `"Ya hay un tope para «{category}»"` y sale de un chequeo con `BudgetModel.exists({ category })`. El índice
  único respalda el chequeo: si el `create` falla con el código `11000` de Mongo, la ruta responde el mismo `409`.
- **Orden de chequeos en PATCH y DELETE**: primero el id (`404`), después el body (`400`), después la búsqueda (`404`).
- **`periodoBase`**: helper `basePeriod()` en la ruta, que devuelve `(await InflationRateModel.findOne().sort({ periodo: -1
  }).lean())?.periodo ?? new Date().toISOString().slice(0, 7)`. Se aplica en **todo** POST y PATCH.
- **`/spending`**:

  ```ts
  const match: FilterQuery<TransactionDoc> = { type: "purchase", currency: "ARS" };
  if (years) match.$or = yearDateRanges(years);
  TransactionModel.aggregate<CategoryMonthStat>([
    { $match: match },
    { $group: { _id: { month: { $dateToString: { format: "%Y-%m", date: "$date" } }, category: "$category" },
                total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, month: "$_id.month", category: "$_id.category", total: 1, count: 1 } },
    { $sort: { month: 1, total: -1 } },
  ]);
  ```

  `ultimoMesCerrado = lastClosedMonth((await StatementModel.find({}, { closingDate: 1 }).lean()).map((s) => s.closingDate ??
  null))`.

Los hooks del cliente ya están en la base. Recategorizar, importar o reaplicar reglas invalida todo, así que el gasto se
refresca solo.

## UI

### Página — `client/src/pages/BudgetsPage.tsx` (reemplaza el stub)

De arriba hacia abajo:

1. **Encabezado**. En compu, un `Stack` en fila (mismo `headerSx` que `RulesPage`): `Typography h4` «Presupuestos» a la
   izquierda y el botón contenido «Nuevo tope» (`AddIcon`) a la derecha. En mobile, el título y abajo el botón a ancho
   completo, como «Nueva regla».
2. `Alert severity="error"` con el error de la última mutación, si hay.
3. `FiltersBar fields={["year"]} yearOptions={useTransactionYearOptions("ARS", undefined)}`.
4. **`BudgetMonthPicker`**: `‹  Septiembre de 2026  ›` y el chip «Parcial» cuando corresponde. Escribe el Mes global con
   `useGlobalFilters().setMonth`.
5. Sin topes: «Todavía no definiste topes. Creá uno con «Nuevo tope» o desde las categorías de abajo.»
6. **`BudgetKpiCards`** (`KpiGrid cardCount={3}`), solo si hay topes.
7. **«Por categoría»** (`BudgetProgressList`), solo si hay topes.
8. **«Sin tope en {mes}»** (`UnbudgetedCategories`), si hay categorías con gasto y sin tope.
9. **`ChartCard` «Cumplimiento mes a mes (topes actuales)»** con `BudgetComplianceChart`, solo si hay topes.
10. `BudgetEditor` y el `ConfirmDialog` de borrado.

Toda la lógica de datos vive en hooks propios, así la página solo compone:

- **`client/src/useBudgetsPage.ts`**: `useBudgetsPage(): BudgetsPageData`. Combina `useBudgets`, `useBudgetSpending(years)`,
  `useInflation`, `useCategories`, `useCategoryRules`, `useGlobalFilters` y `useTransactionYearOptions`, y calcula con
  `useMemo` la vista (`budgetsView`) y las categorías elegibles (`budgetCategoryOptions`). Expone `selectMonth(month)`
  (envuelve `setMonth`), `inflation`, `isLoading` (topes, gasto o IPC sin cargar) y `error` (de topes o gasto).
- **`client/src/useBudgetEditor.ts`**: `useBudgetEditor(): BudgetEditorState`. Usa el `useSheetTarget<BudgetEditorTarget>()`
  existente, con `BudgetEditorTarget = { budget: BudgetDTO | null; category: string | null }`, y las tres mutaciones.
  `BudgetEditorTarget` se define en `client/src/components/useBudgetForm.ts`, que lo usa primero. Expone `open`, `target`, `editorKey` (cuenta las aperturas), `openNew`, `openForCategory(category)`, `openEdit(budget)`,
  `close`, `save(draft: BudgetInput)` (con `target.budget`, PATCH con `{ topeArs, ajustaInflacion }`; si no, POST),
  `askDelete(budget)` (cierra el editor y deja `pendingDelete`), `confirmDelete`, `cancelDelete`, `pendingDelete` y `error`
  (el error de la última mutación disparada).

Estados de carga, con early returns: mientras carga, el título y un `CircularProgress`, como `MacroPage`. Si hay error de
query, el título y un `Alert severity="error"` con `error.message`.

### Componentes — `client/src/components/`

- **`BudgetMonthPicker.tsx`**: props `{ month, months, partial, onChange }`. Dos `IconButton` (`ChevronLeft` /
  `ChevronRight`, `aria-label` «mes anterior» / «mes siguiente», `sx={iconTapTargetSx}`), deshabilitados en los extremos de
  `months`. En el centro, `Typography h6` con `formatMonthLabel(month)` (`aria-live="polite"`) y, si es parcial, `Chip
  size="small" variant="outlined" label="Parcial"` y debajo el caption «Mes parcial: faltan consumos que llegan con el
  próximo resumen.»
- **`BudgetKpiCards.tsx`**: props `{ totals: BudgetTotals }`, con el `Kpi` compartido:
  - «Gastado con tope»: `totals.gastado`, sub «de {tope total}», `primary`, `ShoppingCartOutlined`.
  - «Disponible» o «Excedido» según el signo de `restante`: `|restante|`, sub «{pct} usado» (`formatPercent(ratio × 100)`),
    color `BUDGET_STATUS_COLOR[totals.estado]`, `AccountBalanceWalletOutlined`.
  - «Topes cumplidos»: `cumplidos` con formato «{n} de {total}», sub «{k} cerca del tope» si `cerca > 0`, `secondary`,
    `TaskAltOutlined`.
- **`BudgetProgressList.tsx`**: props `{ lines, month, latestIpc, hasSpending, onEdit }`. Es un `Card` con una lista
  (`ul`/`li`, cada `li` con `aria-label` igual a la categoría, `key={line.budget.id}`) y sirve igual para compu y mobile:
  - Fila 1: categoría (`subtitle1`, ellipsis), `Chip` con `BUDGET_STATUS_LABEL` y `BUDGET_STATUS_COLOR`, y `IconButton`
    `EditOutlined` (`aria-label` «editar tope de {categoría}», `iconTapTargetSx`).
  - Fila 2: `LinearProgress variant="determinate"`, `value = min(ratio, 1) × 100`, `color = BUDGET_STATUS_COLOR[estado]`,
    alto 8 y bordes redondeados, `aria-label` «avance de {categoría}».
  - Fila 3: «{gastado} de {tope}» a la izquierda y `formatPercent(ratio × 100)` a la derecha.
  - Fila 4 (caption, con `flexWrap`): «Te quedan {restante}» o «Te pasaste por {−restante}». Si ajusta: « · Ajustado por
    IPC», más « (IPC hasta {mes})» cuando `month > latestIpc`, o « (sin IPC cargado)» si no hay IPC. Al final, el botón «Ver
    movimientos» (`component={RouterLink}`, `to={transactionsLink({ category, month, currency: "ARS" })}`,
    `sx={tapTargetSx}`).
  - Arriba de la lista: título `h6` «Por categoría» y el caption «Mismo criterio que el Dashboard: consumos en pesos por
    fecha de compra, todas las tarjetas. Las compras en cuotas suman cada cuota a medida que llegan los resúmenes.» Si
    `!hasSpending`, otra línea: «Sin consumos en {mes}.»
- **`UnbudgetedCategories.tsx`**: props `{ month, categories, onAdd }`. `Card` con el título «Sin tope en {mes}». Cada fila
  (`key={category}`) muestra la categoría, el monto y el botón «Poner tope» (`aria-label` «Poner tope a {categoría}»,
  `onAdd(category)`, `tapTargetSx`). La fila «Sin categoría» no tiene ese botón y lleva en su lugar `Button
  component={RouterLink} to="/rules"` «Categorizar».
- **`BudgetEditor.tsx`**: props `{ open, target, editorKey, categoryOptions, initialTope, latestIpc, onClose, onSave,
  onDelete }`. Monta `BudgetEditorSheet` con `key={editorKey}`, que usa `ResponsiveSheet` de la base: `BottomSheet` en
  mobile y `Dialog` en compu. El título es «Tope de {categoría}» al editar y «Nuevo tope» si no. El estado del formulario
  vive en `useBudgetForm` (`client/src/components/useBudgetForm.ts`), porque las acciones van en el `actions` de
  `ResponsiveSheet` y necesitan saber si el formulario es válido:
  - **Categoría**: `TextField select` con `categoryOptions`. Al editar o al venir de «Poner tope» es un `TextField`
    deshabilitado con la categoría (no un select, para no tener un valor fuera de las opciones).
  - **Tope mensual (ARS)**: `TextField` con `inputMode="decimal"`, prellenado con `formatMoneyInput(initialTope)` al editar.
    El helper muestra «= {formatMoney} por mes» si el valor es válido, o «Ingresá un monto mayor a cero» (en rojo solo si ya
    se escribió algo).
  - **Ajustar por inflación**: `Switch` con `FormControlLabel`. El helper dice «Queda en pesos de {mes del último IPC}: sube
    cada mes con el IPC publicado y, para el histórico, se deflacta hacia atrás.», o si no hay IPC: «Todavía no hay IPC
    cargado: el tope queda fijo hasta que actualices los datos desde la barra superior.»
  - **Acciones**, todas con alto mínimo de 44 px: «Borrar» (`color="error"`, solo al editar, llama a `onDelete(budget)`),
    «Cancelar» y «Guardar» (contenido, deshabilitado si es inválido). Guardar llama a `onSave({ category, topeArs,
    ajustaInflacion })` y cierra.
- **`charts/BudgetComplianceChart.tsx`**: props `{ history: BudgetMonthSummary[] }`. Es un `ResponsiveBar` apilado con filas
  `{ month, ok, cerca, pasado, okLista, cercaLista, pasadoLista }` (cantidades y nombres unidos por «, »), `keys ["ok",
  "cerca", "pasado"]` y colores `theme.palette[BUDGET_STATUS_COLOR[id]].main`. Usa `seriesMargin({ top: 16, right: 24,
  bottom: 64, left: 40 })`, `axisBottom` con `tickRotation: -45` y `tickValues: bottomTicks(months)`, `axisLeft` y
  `gridYValues` solo con enteros (`countTicks`) y alto 260. El `tooltip` personalizado (`BudgetComplianceTooltip`, exportado)
  usa `ChartTooltip`: el título es `formatMonthLabel(month)` y la fila dice «{Estado}: {categorías}». Debajo va `ChartLegend`
  con «En rango», «Cerca» y «Pasado», en compu y en mobile. Con `history` vacío muestra «Sin datos».

### Mobile

- Hay **un solo componente por vista**. El contenedor del editor lo resuelve `ResponsiveSheet`. La lista de progreso ya es
  una lista de tarjetas y no hay tabla que convertir.
- `FiltersBar(["year"])` en mobile muestra el botón «Filtros» con el resumen del año. El selector de mes queda **siempre
  visible** y centrado a ancho completo, porque es el control principal de la página.
- Los botones ‹ ›, el lápiz, «Ver movimientos», «Poner tope», «Categorizar», «Nuevo tope» y las acciones del editor tienen
  44 px vía `tapTarget.ts`.
- KPIs en una columna, por el `KpiGrid` existente. El gráfico usa `useChartLayout`, con a lo sumo 6 etiquetas en el eje y
  siempre la última, más la leyenda HTML debajo.
- El monto usa teclado decimal (`inputMode="decimal"`).

### Estados vacíos

| Situación | Qué se ve |
|---|---|
| Sin topes | Encabezado, filtros y selector de mes, el texto de bienvenida y «Sin tope en {mes}» |
| Sin topes y sin consumos | Lo mismo, sin la lista |
| Con topes y sin meses cerrados | El gráfico muestra «Sin datos» |
| Error al guardar o borrar | `Alert severity="error"` con el mensaje del server (p. ej. el 409) |

Borrar pide confirmación con el `ConfirmDialog` existente: título «Borrar tope», mensaje «¿Borrar el tope de «{categoría}»?
El histórico deja de contarla.» y botón «Borrar».

## Tests

TDD: cada pieza arranca con un test en rojo. Los archivos con varios renders llevan `afterEach(cleanup)`, porque el
auto-cleanup de RTL está apagado. Los fixtures son sintéticos.

**Server**

- `server/src/stats/closedMonth.test.ts`: los ejemplos de arriba, `null` y vacío dan `null`, toma el máximo e ignora los
  `null`, y cambio de año.
- `server/src/http/routes/budgets.test.ts` (`withDb` + supertest):
  - CRUD: el POST crea (201) con `periodoBase` igual al último `InflationRate` sembrado; GET lista ordenado; PATCH cambia
    `topeArs` y rebasea `periodoBase` tras sembrar un IPC más nuevo; DELETE da 204; PATCH y DELETE con id inexistente o
    inválido dan 404.
  - Sin IPC: `periodoBase` es el mes actual (`vi.useFakeTimers({ toFake: ["Date"] })`).
  - Validación: el POST da 400 sin categoría, con categoría en blanco o con `topeArs <= 0`; el PATCH da 400 con body vacío o
    `topeArs: -1`; el POST con categoría repetida da 409; el índice único rechaza duplicados (`BudgetModel.init()`).
  - `/spending`: agrupa por mes y categoría solo `purchase` en ARS (excluye USD, `payment`, `tax` y `refund`); `year=2026`
    excluye 2025; `ultimoMesCerrado` sale del cierre más reciente; sin resúmenes es `null`.
  - **Coherencia con el Dashboard**: para un mes dado, `{ category, total }` de `/api/budgets/spending` coincide con
    `/api/stats/by-category?currency=ARS&from=M-01&to=M-último`, incluso con movimientos el primer y el último día del mes y
    en el mes siguiente.

**Cliente, unitarios** — `client/src/budgets.test.ts`:

- `budgetStatus` en 0,79, 0,8, 1 y 1,01.
- `limitForMonth` sin ajuste (constante), con ajuste hacia adelante y hacia atrás, y con un mes posterior al último IPC.
- `currentLimit`, con y sin IPC.
- `budgetLines`: orden, tope sin consumo en 0, ignora otros meses y categorías sin tope.
- `budgetTotals`: con y sin líneas.
- `unbudgetedCategories`: incluye «Sin categoría» y excluye las categorías con tope y las que tienen 0.
- `budgetCategoryOptions`: suma las de las reglas, saca las que tienen tope y «Sin categoría».
- `selectableMonths` agrega el mes elegido.
- `defaultBudgetMonth`: prefiere el cerrado y cae al último o al actual.
- `isPartialMonth`, `closedMonths` y `budgetHistory` (listas por estado).
- `budgetsView`: mes de la URL, mes por defecto, parcial, `hasSpending` y el histórico sin el mes parcial.

**Cliente, componentes y página**

- `client/src/components/charts/BudgetComplianceChart.test.tsx` (nivo mockeado con `NivoProbe`): «Sin datos» con historial
  vacío; tooltip personalizado (y su contenido, renderizando `BudgetComplianceTooltip`); leyenda con los tres estados; en
  mobile, a lo sumo 6 etiquetas y siempre la última.
- `client/src/pages/BudgetsPage.test.tsx`, con `fetch` stubeado por URL y método como `MacroPage.test.tsx` y ruta con
  `?year=2026` para no depender del reloj:
  - Con topes y gastos: el mes por defecto es `ultimoMesCerrado` («Septiembre de 2026»); muestra los chips «Pasado», «Cerca»
    y «En rango», los KPIs y «Te pasaste por …».
  - `?year=2026&from=2026-08-01&to=2026-08-31` muestra agosto.
  - «mes anterior» cambia el mes mostrado.
  - Un mes posterior al cerrado muestra «Parcial».
  - Sin topes: texto de bienvenida y «Poner tope».
  - Crear: «Nuevo tope», elegir categoría, escribir «300.000» y «Guardar» hacen un POST a `/api/budgets` con `{ category,
    topeArs: 300000, ajustaInflacion: false }`.
  - «Poner tope» abre el editor con la categoría fija.
  - Editar: «editar tope de Comida» precarga el monto y «Guardar» hace un PATCH.
  - Borrar: pasa por confirmación y hace un DELETE.
  - Un 409 del server se muestra en un `Alert`.
  - El `href` de «Ver movimientos» es `/transactions?category=Comida&currency=ARS&from=2026-09-01&to=2026-09-30`.
  - Mobile (`emulateMobile()` + `vi.unstubAllGlobals()`): «Nuevo tope» abre la hoja (`dialog` «Nuevo tope») y los botones ‹
    › tienen `min-width:44px` (`cssFor`).

La navegación (`navItems.test.ts`, `MoreSheet.test.tsx`, `Layout.test.tsx`) y la ruta (`App.test.tsx`) ya están probadas en
la base.

**Verificación final**: `bun run test`, `bun run typecheck` y `bun run build` en verde. Además, una prueba manual con la app
levantada (la hace el usuario):

1. Crear dos topes, uno de ellos ajustado.
2. Comparar septiembre con la torta del Dashboard en Mes septiembre y ARS.
3. Revisar «Ver movimientos».
4. Revisar el mes parcial.
5. Revisar la vista a 390 px.

## Orden de implementación

1. **Datos y API**: `lastClosedMonth` y el router `budgets` con sus tests (incluida la coherencia con el Dashboard).
2. **Motor**: `budgets.ts` con sus tests. No depende de la UI.
3. **UI**: `useBudgetsPage`, `useBudgetEditor`, `useBudgetForm`, componentes, gráfico y página.

## Fuera de alcance

- Topes en USD, o convertir los consumos en USD al oficial para sumarlos.
- Topes por tarjeta.
- Versionar topes o darles vigencia desde y hasta (el histórico usa los topes actuales).
- Imputar cada cuota a su mes de pago, o imputar por mes de resumen.
- Alertas, notificaciones o avisos push al acercarse al tope.
- Arrastre (lo que sobra pasa al mes siguiente).
- Presupuesto global sin categoría.
- Sugerir topes automáticamente (promedios).
- Gastos fuera de las tarjetas: hipoteca, auto, efectivo.
- Renombrar la categoría de un tope o migrarlo cuando una regla cambia de nombre.
- Mostrar topes en el Dashboard o en Movimientos.
- Unificar `deflateToLatest` (`realSalary.ts`) con `inflationFactor`: es una limpieza real pero ajena a este objetivo.
