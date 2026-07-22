# Torta por categoría + KPI de cuotas pendientes en "Cuotas a vencer" — Diseño

## Objetivo

En la sección "Cuotas a vencer" (`InstallmentsPage`) agregar:
1. Una **torta** de cuotas pendientes agrupadas por categoría.
2. Un **KPI** con el monto total de cuotas pendientes.

## Estado actual

- `InstallmentsPage` ya usa `useFutureInstallmentsDetail(filters)` (respeta moneda
  y tarjeta y, tras el último fix, proyecta desde el último resumen por tarjeta).
- Ya calcula `totalFuturo = Σ months.total` (el total pendiente) y lo muestra en
  una línea de texto.
- El chart "Por categoría" existente (`InstallmentsByCategoryChart`) es una **barra
  apilada por mes**, no una torta de totales por categoría.
- El componente `Kpi` (card con label/valor/ícono/color y `CountUp`) vive privado
  dentro de `KpiCards.tsx`.

## Diseño (solo cliente)

### 1. Torta "Cuotas pendientes por categoría"

- Función pura `pendingInstallmentsByCategory(months: FutureInstallmentMonth[]): CategoryStat[]`
  en `client/src/components/charts/pendingInstallmentsByCategory.ts`: agrega los
  `items` de todos los meses por categoría (`total = Σ amount`, `count = nº ítems`),
  ordenado por `total` desc.
- Nuevo `PendingInstallmentsByCategoryChart` (`.../charts/PendingInstallmentsByCategoryChart.tsx`):
  `useFutureInstallmentsDetail(filters)` → `pendingInstallmentsByCategory(data)` →
  `<CategoryPie data={...} currency={filters.currency} />` (mismo donut del Dashboard).
- Se agrega como una `ChartCard` "Cuotas pendientes por categoría" en el grid de la
  página.

### 2. KPI "Cuotas pendientes"

- Extraer el componente presentacional `Kpi` (y el tipo `KpiColor`) de `KpiCards.tsx`
  a `client/src/components/Kpi.tsx`. `KpiCards` lo importa desde ahí (sin cambio de
  comportamiento).
- En `InstallmentsPage`, arriba del grid de charts, renderizar un `Kpi`:
  label "Cuotas pendientes", value = `totalFuturo`, `format` money, ícono
  `CreditCardIcon`, color `warning`. Va dentro de un `MotionBox` (staggerContainer)
  para conservar la animación.

### Datos y filtros

Ambos derivan de `useFutureInstallmentsDetail(filters)` que la página ya carga;
respetan moneda y tarjeta. El KPI reusa `totalFuturo` ya calculado.

La línea de texto actual ("X cuotas por $Y en Z meses") se mantiene.

## Tests

- Unit `pendingInstallmentsByCategory`:
  - Agrega ítems de varios meses por categoría (suma montos, cuenta ítems), ordenado
    por total desc.
  - Lista vacía ⇒ `[]`.
- `InstallmentsPage.test.tsx` (nuevo): con `/stats/future-installments/detail`
  mockeado, la página muestra el KPI "Cuotas pendientes" con el total formateado y
  la card "Cuotas pendientes por categoría".
- `DashboardPage` / `KpiCards` siguen verdes tras extraer `Kpi`.

## Fuera de alcance

- Endpoint server de "installments por categoría" (se agrega en el cliente, como el
  resto de los charts de la página).
- Cambios en `InstallmentsByCategoryChart` (barra apilada) o en la línea de texto.
