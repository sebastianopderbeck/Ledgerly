# Filtro de año y barra de filtros global — diseño

Fecha: 2026-10-02
Estado: en revisión

## Objetivo

Dos cambios que van juntos:

1. Agregar un filtro de **Año** a la barra de filtros del Dashboard (hoy: Moneda, Tarjeta, Mes).
2. Que **todas las secciones con datos usen la misma barra de filtros**, y que la selección
   **persista al navegar** entre secciones.

Hoy `FiltersBar` vive solo en Dashboard, Cuotas (sin Mes) y Movimientos; Sueldo tiene su propio
`ToggleButtonGroup` de año con estado local; Créditos, Auto y Contexto no tienen filtros. Y como los
`NavLink` del menú no llevan query string, cualquier filtro se pierde al cambiar de sección.

**Depende de** el rediseño del menú lateral (`client/src/components/layout/`), commiteado en
`feat/sidebar-layout` (PR #4). Este diseño asume esa estructura.

## Decisiones tomadas

- **Barra global persistente**: una sola selección (año, moneda, tarjeta, mes) que viaja entre
  secciones. Cada sección muestra solo los campos que le aplican.
- **Año multi-selección**: se pueden elegir varios años a la vez (p. ej. 2026 + 2027), incluso no
  contiguos (2024 + 2026). Existe la opción "Todos".
- **Año por defecto: el año actual** (no "Todos", no "último año con datos").
- **El Año aplica en todas las secciones con datos**, incluidas Cuotas y Contexto.
- **La URL es la única fuente de verdad** (enfoque A). Descartados: Context + localStorage (dos
  fuentes de verdad, la URL deja de reflejar los filtros, todos los tests de páginas necesitan
  provider) y Context sincronizado a URL (el doble de piezas para una app de un usuario).
- **Regla de qué se filtra**: lo que es una serie por mes o una suma sobre un período se filtra
  por año; lo que describe el **estado actual** no. Es la convención que ya sigue Sueldo con sus KPIs.

## Contrato de URL

| Param | Valores | Alcance |
|---|---|---|
| `year` | repetible: `?year=2025&year=2026`; ausente → `[añoActual]`; `year=all` → todos | global |
| `currency` | `ARS` (default) / `USD` | global |
| `cardLabel` | etiqueta de tarjeta; ausente → todas | global |
| `from` / `to` | primer y último día del Mes elegido; ausentes → todos | global |
| `category`, `search`, `installment` | como hoy | solo Movimientos |

Con `year=all` el cliente **no** manda `year` al server. Con años concretos los manda como params
repetidos.

## Cliente

### Módulo `client/src/filters/`

- `globalFilters.ts` — helpers puros:
  - `parseYears(values: string[]): YearSelection` (recibe `params.getAll("year")`) donde
    `type YearSelection = { kind: "all" } | { kind: "years"; years: string[] }`. Vacío → año actual;
    `all` → `{ kind: "all" }`; valores que no son un año de 4 dígitos se ignoran; si no queda ninguno
    válido → año actual.
  - `matchesYears(value: string, selection: YearSelection): boolean` — `value` puede ser
    `YYYY-MM-DD` o `YYYY-MM`; compara los primeros 4 caracteres.
  - `globalSearch(params: URLSearchParams): string` — devuelve el search string con solo
    `year`, `currency`, `cardLabel`, `from`, `to`.
  - `GLOBAL_FILTER_KEYS` — la lista anterior.
- `useGlobalFilters.ts` — hook sobre `useSearchParams` que devuelve
  `{ yearSelection, years, currency, cardLabel, from, to }` (`years: string[] | undefined`, listo para
  mandar a la API; `undefined` con "Todos") y los setters `setYears`, `setCurrency`, `setCardLabel`,
  `setMonth`. Reemplaza el parseo de params duplicado en `DashboardPage`, `InstallmentsPage` y
  `TransactionsPage`.
- `useInYears.ts` — `useCreditCouponsInYears()` y `useAutoCouponsInYears()`: componen el hook de datos
  existente con `useGlobalFilters` y `matchesYears` (por `fechaDebito` y `fechaVencimiento`
  respectivamente) y devuelven `{ data, isLoading }` con la misma forma que `useQuery`.

### `FiltersBar`

Nueva API (reemplaza `showMonth` / `showCategory`):

```ts
type FilterField = "year" | "currency" | "card" | "month" | "transaction";
interface FiltersBarProps { fields: FilterField[]; yearOptions: string[]; }
```

- **Año**: `TextField select` con `SelectProps.multiple`, un `Checkbox` + `ListItemText` por opción,
  y la opción "Todos" arriba. Las opciones son `yearOptions` ∪ año actual ∪ años seleccionados,
  ordenadas de más nuevo a más viejo. `renderValue`: "Todos" o los años unidos por ", ".
  - Elegir "Todos" → `year=all`.
  - Elegir un año estando en "Todos" → sale de "Todos" y queda solo ese año.
  - Destildar el último año → `year=all`.
- **Mes**: las opciones salen de `/stats/monthly` (sin `year`, con `currency` y `cardLabel`, como hoy)
  filtradas a los años elegidos. Si se cambian los años y el Mes elegido queda afuera, se borran
  `from`/`to` en la misma actualización de params.
- **Moneda** y **Tarjeta**: igual que hoy.
- **`transaction`**: Categorías, Cuotas y Buscar comercio, igual que hoy.
- Todas las escrituras siguen siendo `setParams(next, { replace: true })`.
- Cada campo es un subcomponente propio en `client/src/components/filters/` (`YearFilter`,
  `CurrencyFilter`, `CardFilter`, `MonthFilter`, `TransactionFilters`) con sus propios hooks de datos:
  una sección que solo muestra Año no pide resúmenes, categorías ni meses.

### Menú (`SidebarNav`)

La navegación vive en `client/src/components/layout/SidebarNav.tsx` (la usan tanto `DesktopSidebar`
como `MobileSidebar`, así que el cambio cubre ambas). Cada `ListItemButton component={NavLink}` pasa a
`to={{ pathname: to, search: globalSearch(params) }}`. Al cambiar de sección viajan Año, Moneda,
Tarjeta y Mes; se descartan los filtros propios de Movimientos. El estado `active` del `NavLink` sigue
funcionando porque compara solo el pathname. `NAV_ITEMS` no cambia.

### Ubicación

La barra va inmediatamente debajo del título de la página en todas las secciones con datos. No va en
Reglas ni en Importar. En el Dashboard, `CardCycleSummary` queda debajo de la barra (y no se filtra).

### Por sección

| Sección | `fields` | `yearOptions` | Filtrado por año | Sin filtrar |
|---|---|---|---|---|
| Dashboard | year, currency, card, month | años con consumos (`/stats/monthly` sin `year`) | KPIs Total gastado, Movimientos, Deuda en cuotas; gráficos Por categoría, Evolución mensual, Cuotas a vencer, Top comercios, USD por mes | `CardCycleSummary`, "Por categoría (último resumen)", KPI Resúmenes |
| Cuotas | year, currency, card | años de vencimiento de cuotas pendientes (`/stats/future-installments` sin `year`) | todo: KPI, 5 gráficos, acordeón — por mes de vencimiento | — |
| Movimientos | year, currency, card, month, transaction | años con consumos | la tabla | — |
| Créditos | year | años de `fechaDebito` de los cupones | Capital vs interés, Total pagado, UVA, Cuota USD, tabla | KPIs, dona Amortizado vs pendiente |
| Auto | year | años de `fechaVencimiento` de los cupones | Composición, Total pagado, Valor del auto, Cuota USD, tabla | KPIs, dona Avance del plan |
| Sueldo | year | `payslipYears(payslips)` | los 6 gráficos y la tabla, por `periodo` | KPIs, "Descuentos acumulados" |
| Contexto | year | años de `series.meses[].periodo` | Dólar real, Carrera, Tasa real, por `periodo` | veredicto, señales, supuestos |

Notas:

- **Deuda en cuotas** (Dashboard) pasa a ser la suma de las cuotas que vencen en los años elegidos.
  Con "Todos" da lo mismo que hoy. Así coincide con el KPI de la página Cuotas.
- **Créditos / Auto**: los gráficos con eje mensual y las tablas cambian `useCreditCoupons()` /
  `useAutoCoupons()` por `useCreditCouponsInYears()` / `useAutoCouponsInYears()`. Los KPIs y las
  donas siguen con los hooks sin filtrar.
- **Sueldo**:
  - Se elimina el `ToggleButtonGroup` y el estado local `selectedYear`.
  - `monthOnly` es `true` cuando hay **exactamente un** año elegido.
  - `accumulatedInflation(inflation, year, years)` pasa a `accumulatedInflation(inflation, years)`,
    donde `years` son los años en alcance: los elegidos, o todos los años con recibos si está en
    "Todos". `InflationAccumulatedChart` cambia sus props a `{ inflation, years, monthOnly }`.
  - `PayslipsTable` recibe por prop los recibos de los años elegidos (todos los tipos, como hoy) en vez de llamar a `usePayslips()`.
- **Contexto**: un helper puro `macroChartsInYears(view, race, selection)` en `macroSignals.ts`
  filtra `view.dolarReal.serie`, `view.tasaReal` y cada serie de `race` (descartando las que quedan
  vacías); la página lo usa con `useMemo` antes de pasar los datos a los gráficos. La carrera **no** se re-basa: muestra el recorte de
  la serie acumulada original.
- **Sin datos en el año elegido**: cada gráfico ya muestra "Sin datos" con un array vacío; las
  tablas ya devuelven `null` sin filas. No se agrega estado nuevo.

### API del cliente

- `StatFilters` suma `year?: string[]`. `qs()` ya serializa arrays como params repetidos.
- Como `year` entra en el `queryKey` (que ya incluye el objeto de filtros), react-query cachea cada
  selección por separado.
- `useByCategoryLastStatement` no recibe `year` (es "último resumen").

## Server

### Helper `server/src/http/yearFilter.ts`

- `parseYears(raw: unknown): number[] | null` — acepta `string` o `string[]`, descarta lo que no sea un
  año de 4 dígitos, devuelve `null` si no queda ninguno (= no filtrar).
- `yearMatch(field: string, years: number[])` →
  `{ $expr: { $in: [{ $year: \`$${field}\` }, years] } }`.
- `monthInYears(month: string, years: number[] | null): boolean` — para lo que se calcula en memoria
  (`YYYY-MM`); con `null` devuelve `true`.

Las fechas de transacciones se guardan como `new Date("YYYY-MM-DD")` (medianoche UTC), así que `$year`
en UTC da el año correcto; es el mismo supuesto que ya hace `/stats/monthly` con `$dateToString`.

### Endpoints

| Endpoint | Cambio |
|---|---|
| `baseMatch` en `stats.ts` (`/by-category`, `/monthly`, `/top-merchants`, totales de `/summary`) | suma `yearMatch("date", years)` si viene `year` |
| `buildFilter` en `transactions.ts` | ídem |
| `/stats/monthly-usd` | filtra los meses de consumo con `monthInYears` **antes** de pedir cotizaciones |
| `/stats/future-installments` y `/detail` | filtran los meses de vencimiento calculados con `monthInYears` |
| `/stats/summary` → `futureInstallmentTotal` | con años: suma de `computeFutureInstallments` en esos años; sin años: `remainingInstallmentDebt` como hoy |
| `/last-statement/by-category`, `/statements`, credits, auto, payslips, macro, inflation | sin cambios |

`year` y `from`/`to` se combinan con AND. No cambia nada en `shared/`: las respuestas mantienen su forma.

## Tests

Con TDD: cada pieza arranca con un test en rojo.

**Cliente — unitarios** (`client/src/filters/globalFilters.test.ts`):
- `parseYears`: ausente → año actual (fecha fijada con `vi.useFakeTimers({ toFake: ["Date"] })`),
  `all`, múltiples, inválidos ignorados, todos inválidos → año actual.
- `matchesYears` con `YYYY-MM-DD`, `YYYY-MM` y "Todos".
- `globalSearch` conserva las 5 keys globales y descarta `category`/`search`/`installment`.

**Server**:
- `yearFilter.test.ts`: `parseYears` (string, array, basura) y `monthInYears`.
- `stats.test.ts`: `/monthly` con `year=2025&year=2026` excluye 2024; `/future-installments` y
  `/detail` filtran por año de vencimiento; `/summary.futureInstallmentTotal` cambia con años e igual
  sin ellos; `/monthly-usd` no llama `fetchOficialRate` para meses excluidos.
- `transactions.test.ts`: `year` filtra la lista.

**Componentes**:
- `FiltersBar.test.tsx`: migrar los 3 tests existentes a `fields`; nuevos: renderiza solo los campos
  pedidos; elegir dos años escribe params repetidos; "Todos" → `year=all`; destildar el último →
  `year=all`; Mes lista solo meses de los años elegidos; Mes se limpia al sacar su año.
- `components/layout/Layout.test.tsx` (existente): caso nuevo — con la ruta
  `/?year=2025&currency=USD&category=Compras`, el `href` de cada link de la navegación principal
  conserva `year` y `currency` y no lleva `category`.

**Páginas**:
- Los fixtures existentes son de 2024/2025. Los tests actuales de Créditos, Auto, Sueldo y Contexto
  pasan a `route: "/<ruta>?year=all"` para mantener su intención sin depender del reloj.
- Por sección, un caso con la fecha fijada en 2026: por defecto solo se ve 2026 en gráficos/tabla y
  los KPIs no cambian.
- Dashboard, Cuotas, Movimientos: la URL del fetch lleva `year=<actual>` por defecto y no lleva `year`
  con `?year=all`.
- Archivos con varios renders llevan `afterEach(cleanup)` (en este repo el auto-cleanup de RTL está
  apagado).

**Verificación final**: `bun run test` y `bun run typecheck` en verde, y prueba manual con la app
levantada: Dashboard → elegir 2025 + 2026 y USD → Créditos mantiene los años → Sueldo con un solo año
muestra eje "Ene, Feb…" → volver al Dashboard con Mes y Moneda intactos → F5 conserva todo.

## Fuera de alcance

- Persistir la selección entre sesiones (localStorage).
- Filtros de Moneda/Tarjeta/Mes en Créditos, Auto, Sueldo o Contexto.
- Re-basar la Carrera de Contexto al inicio del recorte.
- Filtrar por año los KPIs de estado actual.
