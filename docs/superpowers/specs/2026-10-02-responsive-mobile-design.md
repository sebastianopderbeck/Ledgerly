# Ledgerly responsive y usable desde el celular — diseño

Fecha: 2026-10-02
Estado: en revisión

## Objetivo

Usar Ledgerly desde el iPhone con **paridad completa** con la compu: consultar dashboards, KPIs y
gráficos, y también operar (editar categorías, reglas y TC, borrar movimientos, importar PDFs), con
una UX táctil pensada para cada caso. Además, que se pueda **instalar** desde Safari ("Agregar a
pantalla de inicio") y abra a pantalla completa.

La vista de compu no cambia: todo lo de este diseño aplica solo por debajo de `md` (900px).

## Depende de

- **Rediseño de la navegación lateral** — PR #4, ya mergeado a `main` (navegación lateral,
  tema persistido, `KpiGrid`). Este diseño asume `client/src/components/layout/` y `KpiGrid.tsx`
  tal como quedaron ahí.
- **Filtro de año global** — `docs/superpowers/specs/2026-10-02-filtro-anio-global-design.md`.
  Solo la fase 4 (filtros) depende de él: asume la nueva API `FiltersBar({ fields, yearOptions })`
  y `globalSearch(params)`.

La rama de trabajo `feat/responsive-mobile` sale de `main` (que ya incluye el PR #4) una vez que
esté el filtro de año.

## Decisiones tomadas

- **Navegación mobile: barra inferior + «Más»**. Fijas abajo: Inicio (Dashboard), Cuotas,
  Movimientos, Importar y Más. «Más» abre una hoja con Créditos, Auto, Sueldo, Contexto y Reglas.
  Reemplaza al menú hamburguesa (`MobileSidebar`) del PR #4.
- **Tablas mobile: tarjetas + hoja de edición**. Cada registro es una tarjeta con lo importante;
  tocarla abre una hoja desde abajo para editar o borrar. Aplica a Movimientos, cupones de Crédito y
  Auto, Sueldo y Reglas.
- **Instalable** (manifest + íconos + metas de iOS), **sin service worker**: sin Tailscale y la Mac
  prendida no hay datos que mostrar, así que el modo offline no aporta.
- **Enfoque técnico híbrido**: lo que es solo layout (grillas, espaciados, tipografía, márgenes de
  gráficos) se resuelve con breakpoints de `sx` / container queries; lo estructural (navegación,
  tabla ↔ tarjetas, filtros en línea ↔ hoja) con un hook `useIsMobile()` y **un componente distinto
  por vista**. Los componentes de compu no se tocan.
- **Corte mobile: `< md` (900px)**, el mismo que ya usa `Layout`. El iPad vertical usa la vista
  mobile; el horizontal, la de compu.

### Enfoques descartados

- **Solo CSS (montar ambas vistas y ocultar una con `display`)**: monta la DataGrid y la lista a la
  vez, duplica animaciones, y rompe los tests existentes (cada texto aparece dos veces).
- **Rutas mobile aparte (`/m/...`)**: duplica 9 páginas y su cableado de datos; desproporcionado
  para una app de un usuario.
- **Menú hamburguesa (drawer lateral)**: cambiar de sección lleva siempre 2 toques y el botón queda
  lejos del pulgar.
- **Pestañas deslizables**: con 9 secciones obliga a deslizar para encontrar la mitad.
- **Tabla compacta con primera columna fija**: lo importante (Total, USD, TC) queda fuera de la
  pantalla y el scroll horizontal con el dedo es incómodo.

## Arquitectura

```
useIsMobile()  ──►  Layout ──► DesktopSidebar (compu, sin cambios)
                          └──► MobileBottomNav + MoreSheet (mobile)
               ──►  páginas con tabla ──► XxxTable (compu, sin cambios)
                                     └──► XxxCards / TransactionsList (mobile)
               ──►  FiltersBar ──► FilterFields en línea (compu)
                              └──► botón «Filtros» + resumen ──► BottomSheet con FilterFields (mobile)
               ──►  gráficos ──► useChartLayout() (márgenes, ticks, leyenda)

BottomSheet  ◄── MoreSheet, FiltersSheet, TransactionSheet, RateSheet, RuleSheet
```

## Fase 1 — Base: navegación, layout e instalable

### `client/src/useIsMobile.ts`

```ts
export function useIsMobile(): boolean
```

`!useMediaQuery((theme) => theme.breakpoints.up("md"), { noSsr: true, defaultMatches: true })`.
Sin `matchMedia` (jsdom) devuelve `false`, así los tests existentes siguen viendo la vista de compu.
`Layout` reemplaza su `useMediaQuery` propio por este hook.

### `client/src/components/BottomSheet.tsx`

`SwipeableDrawer` con `anchor="bottom"`, manija, título opcional, contenido y zona de acciones.
Bordes superiores redondeados, `maxHeight: 90vh` con scroll interno, y padding inferior
`calc(16px + env(safe-area-inset-bottom))`. Props: `open`, `onClose`, `title?`, `children`,
`actions?`. En iOS: `disableDiscovery` y `disableBackdropTransition={false}` (recomendación de MUI
para Safari).

### Navegación

- `navItems.ts`: `NavItem` suma `placement: "bar" | "more"` y `shortLabel?: string`.
  Dashboard → `shortLabel: "Inicio"`. En la barra: Dashboard, Cuotas, Movimientos, Importar. En
  «Más»: Créditos, Auto, Sueldo, Contexto, Reglas. Helpers puros `barItems()` y `moreItems()`.
- **`MobileBottomNav`** (`components/layout/`): barra fija abajo, 5 botones de 56px de alto (ícono
  + etiqueta corta), fondo con el mismo vidrio que la sidebar (`glassBg` + blur), borde superior y
  `padding-bottom: env(safe-area-inset-bottom)`. `role="navigation"` con `aria-label="principal"`.
  El link activo usa `aria-current="page"`. «Más» se marca activo cuando la ruta actual es una de
  `moreItems()`.
- **`MoreSheet`**: `BottomSheet` con una grilla de 3 columnas (ícono + etiqueta) de `moreItems()`.
  Se cierra al navegar.
- **Destino de los links**: helper `navTarget(to, params)` → `{ pathname: to, search:
  globalSearch(params) }`, compartido con `SidebarNav`, para que Año, Moneda, Tarjeta y Mes viajen
  al cambiar de sección. Si la fase 1 se implementa antes que el filtro de año, `navTarget`
  devuelve solo el `pathname` y el filtro de año lo completa.
- `Layout` en mobile: renderiza `MobileBottomNav` en lugar de `MobileSidebar`. Se borran
  `MobileSidebar.tsx` y el botón de menú de `TopActionsPill` (prop `showMenuButton` y su ícono).

### Layout mobile

- `Container`: `pt` menor en mobile y `pb: calc(64px + env(safe-area-inset-bottom) + 16px)` para que
  la barra no tape el final de la página.
- `TopActionsPill`: `top: calc(16px + env(safe-area-inset-top))`.
- Tema: `h4` y `h5` con un `fontSize` menor por debajo de `md` (override explícito en `typography`
  con `theme.breakpoints.down("md")`). No se usa `responsiveFontSizes` porque también achica los
  títulos entre 900 y 1200px, y la vista de compu no debe cambiar.
- Tema: el `&:hover` de `MuiCard` (lift con `translateY`) pasa a `@media (hover: hover)`, así no
  queda "pegado" al tocar.

### Instalable

- `client/public/manifest.webmanifest`: `name: "Ledgerly"`, `short_name: "Ledgerly"`,
  `display: "standalone"`, `start_url: "/"`, `scope: "/"`, `background_color` y `theme_color`
  `#0b0f19`, íconos `icon-192.png`, `icon-512.png` y `icon-maskable-512.png` (`purpose: "maskable"`).
- Los PNG se generan una sola vez desde `client/public/favicon.svg` (el logo del PR #3) y se
  commitean; la versión maskable lleva el logo sobre fondo `#0b0f19` con margen de zona segura.
- `client/index.html`: `viewport` con `viewport-fit=cover`, `<link rel="manifest">`,
  `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="mobile-web-app-capable"
  content="yes">` y `<meta name="apple-mobile-web-app-status-bar-style"
  content="black-translucent">`.
- Al cambiar de tema se actualiza `<meta name="theme-color">` con `palette.background.default`
  (efecto en `App`, sobre el modo del `ColorModeProvider`).

## Fase 2 — KPIs y gráficos

### KPIs

- `KpiGrid` (PR #4) ya pone una columna con contenedor < 620px; no cambia.
- `Kpi.tsx` en mobile: ícono de 36px (hoy 46), padding de `CardContent` menor y valor en `h6`.
- **Mejora de paso**: `CreditKpiCards`, `AutoKpiCards` y `PayslipKpiCards` tienen su propia copia
  local de `Kpi` (mismas props, subconjunto de las de `Kpi.tsx`); pasan a usar el `Kpi.tsx`
  compartido para que el ajuste viva en un solo lugar. En compu se ven igual.

### `client/src/components/charts/useChartLayout.ts`

- `thinTicks<T>(values: T[], max: number): T[]` — pura. Si `values.length <= max` devuelve todo;
  si no, toma valores equiespaciados que **siempre incluyen el último** y nunca superan `max`.
- `useChartLayout()` → `{ isMobile, seriesMargin(desktop), bottomTicks(values) }`:
  - `seriesMargin` devuelve el margen de compu tal cual, o en mobile el mismo con `left: 48`.
  - `bottomTicks` devuelve `undefined` en compu (nivo decide como hoy) o `thinTicks(values, 6)`
    en mobile, para pasar a `axisBottom.tickValues`.

### Reglas por grupo de gráfico

| Grupo | Gráficos | Mobile |
|---|---|---|
| Series por mes | MonthlyTrend, MonthlyUsd, FutureInstallments, TotalPaidByMonth, AutoTotalPaidByMonth, CapitalVsInterest, UvaEvolution, CouponUsd, AutoCouponUsd, CarValue, AutoComposition, RemainingDebt, PayslipComposition, PayslipGrossNet, PayslipNetoArs, PayslipNetoUsd, PayslipRealArs, InflationAccumulated, DolarReal, TasaReal, MacroRace, InstallmentsByCategory | `seriesMargin` + `bottomTicks`; alto 260 |
| Con leyenda de nivo | CategoryPie (la usan CategoryBreakdown, LastStatementCategory y PendingInstallmentsByCategory), AmortizationDonut, AutoProgressDonut (leyenda a la derecha); InstallmentsByCategory (derecha); MacroRace, PayslipGrossNet (abajo) | sin `legends` de nivo, márgenes simétricos (las donas recuperan los 150px de la derecha), y `ChartLegend` debajo |
| Barras horizontales | TopMerchants, InstallmentsByMerchant | `left: 96`, nombres truncados a 11 caracteres, `axisBottom={null}`; nombre completo en el tooltip |
| Ciclo de tarjeta | CardCycleChart | sin cambios |

Un gráfico puede estar en dos grupos (p. ej. MacroRace: serie por mes con leyenda).

### `client/src/components/charts/ChartLegend.tsx`

```ts
interface ChartLegendItem { id: string; label: string; color: string; value?: string; }
interface ChartLegendProps { items: ChartLegendItem[]; }
```

Lista HTML que se acomoda en varias líneas: punto de color, etiqueta y valor opcional. Reemplaza
el `<span style={{ width: 12, height: 12, … }}>` repetido en los tooltips de PayslipComposition,
AutoComposition y CardCycle (se extrae como `LegendSwatch`).

### Interacción táctil (verificación manual)

Tocar un punto o barra muestra el tooltip; el scroll vertical no se bloquea cuando el dedo arranca
sobre un gráfico; los tooltips no se cortan contra el borde derecho. Si alguno falla en el iPhone, se
ajusta en el gráfico afectado (p. ej. `enableTouchCrosshair` en líneas, o ancho máximo del tooltip).

### Otros

- `ChartCard`: padding de `CardContent` menor en mobile.
- Acordeón de `InstallmentsPage`: en mobile el chip "cuota N/M" baja debajo del comercio.
- `MacroAssumptionsBar`: en mobile los `TextField` van `fullWidth` y el `ToggleButtonGroup` con
  `orientation="vertical"` y `fullWidth`.

## Fase 3 — Tablas

### Movimientos: `TransactionsList` + `TransactionSheet`

`TransactionsPage` renderiza `TransactionsTable` en compu y `TransactionsList` en mobile, con las
mismas props (`rows`, `onCategoryChange`, `onDelete`).

- **Fila**: comercio (una línea, con ellipsis) y monto a la derecha; debajo fecha · chip de
  categoría · chip "N/M" si es cuota.
- **Paginado**: 50 filas y botón «Ver más» que suma 50.
- **Tocar una fila** abre `TransactionSheet`: fecha, tipo, monto y cuota; **Categoría** con
  `Autocomplete` `freeSolo` sobre `useCategories()` (permite una categoría nueva, como la celda
  editable de hoy); acciones **Guardar** (llama `onCategoryChange` si cambió) y **Borrar** (abre el
  `ConfirmDialog` existente).
- **«Seleccionar»** (al lado del título de la lista): activa un checkbox por fila y una barra fija
  sobre la navegación con «Borrar (n)» y «Cancelar». Borrar pasa por `ConfirmDialog`.

### Cupones y recibos: `RecordCard` + `RateSheet`

```ts
interface RecordField { label: string; value: ReactNode; }
interface RecordCardProps {
  title: string;
  meta?: string;
  highlights: RecordField[];
  details: RecordField[];
}
```

Tarjeta con título y meta, dos datos destacados y "Ver detalle" que despliega `details` en grilla
de 2 columnas (`Collapse`).

| Componente mobile | Título / meta | Destacados | Detalle |
|---|---|---|---|
| `MortgageCouponCards` | "Cuota N" / `fechaDebito` | Total (`totalDebitado`), Pagado USD | Capital, Interés, Seguro, Cuota UVA, Cotización UVA, TC oficial ✎ |
| `AutoCouponCards` | "Cuota N" / vence `fechaVencimiento` | Total (`totalAPagar`), Pagado USD | un campo por concepto, Valor auto, TC oficial ✎ |
| `PayslipCards` | `periodo` (+ chip de tipo como hoy) | Neto, Neto USD | Bruto, un campo por concepto, Descuentos, TC oficial ✎ |

El ✎ del TC abre **`RateSheet`**: un input con `inputMode="decimal"`, valor actual precargado y
«Guardar», que llama a `usePatchCouponRate` / `usePatchAutoRate` / `usePatchPayslipRate` con la
misma regla que la celda de compu (solo si es > 0 y distinto al actual). Cada página elige tabla o
tarjetas con `useIsMobile()`.

### Reglas

- En mobile, `RulesPage` muestra una lista de tarjetas: patrón (monoespaciado), chip de categoría,
  "tipo · prioridad N" y un `Switch` de activa.
- Tocar la tarjeta abre `RuleSheet` con Prioridad, Tipo, Patrón y Categoría; acciones Guardar y
  Borrar.
- **«Nueva regla»** abre `RuleSheet` vacío con Patrón, Tipo y Categoría (prioridad 100, como el
  formulario de compu); reemplaza a `CategoryRuleForm` en mobile.
- «Reaplicar a todo» pasa a ancho completo debajo del título.

### Importar

`FileDropzone` en mobile: sin el texto "Arrastrá el PDF…", botón «Elegir PDF» y menos padding.
`StatementList` no cambia.

## Fase 4 — Filtros

Requiere el filtro de año global implementado.

- Los campos de `FiltersBar` se extraen a **`FilterFields`** (`fields`, `yearOptions`), que en
  compu se renderiza en línea como hoy.
- En mobile, `FiltersBar` muestra una fila: botón **«Filtros»** con `Badge` de cuántos filtros
  difieren del default (año actual, ARS, todas las tarjetas, todos los meses, y sin categorías,
  cuotas ni búsqueda), y un resumen de texto con los valores elegidos (p. ej. "2026 · ARS · Visa").
  Tocar el botón abre **`FiltersSheet`** (`BottomSheet` con `FilterFields` apilados a ancho
  completo). Los cambios se aplican al momento (siguen escribiendo en la URL); «Listo» cierra.
- Funciones puras `activeFilterCount(params, fields)` y `filtersSummary(params, fields)`.
- **Movimientos**: «Buscar comercio» queda visible fuera de la hoja, debajo del botón.

## Tests

Con TDD: cada pieza arranca con un test en rojo. Archivos con varios renders llevan
`afterEach(cleanup)` (el auto-cleanup de RTL está apagado en este repo).

**Infraestructura**: `emulateViewport` sale de `Layout.test.tsx` a
`client/src/testing/viewport.ts` como `emulateMobile()` / `emulateDesktop()`; los tests que lo usan
llaman `vi.unstubAllGlobals()` en `afterEach`. Los tests existentes no cambian: sin `matchMedia`
siguen en vista de compu.

**Unitarios**:
- `thinTicks`: menos que `max` devuelve todo; más que `max` devuelve ≤ `max`, incluye el último y
  queda equiespaciado.
- `barItems()` / `moreItems()`: particionan `NAV_ITEMS` sin repetir ni perder secciones.
- `useIsMobile`: `false` sin `matchMedia`; `true` con `emulateMobile()`.
- `activeFilterCount` y `filtersSummary`.

**Componentes (con `emulateMobile()`)**:
- `Layout`: la navegación muestra 4 secciones + «Más»; «Más» abre las otras 5 y se cierra al
  navegar; en `/credits` «Más» está activo; los links conservan los filtros globales; no hay botón
  "abrir menú". El test actual de la hamburguesa se reemplaza por estos.
- `TransactionsList`: renderiza filas y no `grid`; tocar abre la hoja; cambiar categoría llama
  `onCategoryChange`; Borrar pasa por confirmación; «Seleccionar» + «Borrar (2)» llama `onDelete`
  con 2 ids; «Ver más» suma filas.
- `RecordCard`: "Ver detalle" muestra los campos de detalle.
- `RateSheet` desde cada página de cupones: guardar llama al PATCH correspondiente (fetch mockeado);
  valor ≤ 0 o igual no llama.
- Reglas mobile: crear, editar y activar/desactivar desde las hojas.
- `FiltersBar` mobile: contador y resumen; la hoja muestra los campos de la sección; en Movimientos
  el buscador está fuera de la hoja.
- `ChartLegend`: un ítem por serie con etiqueta y valor.
- Una prueba básica mobile por página con tabla (Movimientos, Créditos, Auto, Sueldo, Reglas): se
  ven tarjetas y no `table`/`grid`.

**Verificación final**: `bun run test` y `bun run typecheck` en verde. Revisión visual en el navegador
a 375px y 393px en las 9 secciones. Prueba en el iPhone real por Tailscale después de
`bun run deploy`: agregar a inicio y abrir a pantalla completa; notch y barra de inicio; tooltips al
tocar sin bloquear el scroll; teclado numérico en TC; elegir un PDF desde Archivos e importarlo.

## Orden de implementación

Cada fase deja la app andando.

0. Prerrequisito: PR #4 mergeado (hecho) y, para los links con filtros, el filtro de año global.
1. Base: `useIsMobile`, helper de tests, `BottomSheet`, barra inferior + «Más», espacios y zonas
   seguras, tipografía responsive, hover solo con mouse, manifest, íconos y `theme-color`.
2. KPIs y gráficos.
3. Tablas: Movimientos, cupones y recibos con `RateSheet`, Reglas, Importar.
4. Filtros (después del filtro de año global).
5. Verificación en el iPhone real.

## Fuera de alcance

- Modo offline / service worker.
- Gestos de deslizar para borrar.
- Layouts específicos para horizontal o tablet.
- Notificaciones push.
- Cambios en la vista de compu (salvo la unificación de `Kpi` y la extracción de `FilterFields`, que
  no cambian lo que se ve).
