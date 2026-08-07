# Inflación acumulada por período — diseño

Fecha: 2026-08-04
Estado: aprobado para plan

## Objetivo

Agregar a la página **Sueldo** un gráfico de **inflación acumulada (YTD)** atado al toggle de año
existente, para ver cuánta inflación se acumuló en el año seleccionado (2025, 2026, etc.) mes a mes.

## Decisiones

- **Tipo:** línea de inflación acumulada (no barras mensuales).
- **Scope por toggle:** año seleccionado → acumula desde enero de ese año; "Todos" → acumula a lo
  largo de todos los años del toggle (curva de inflación acumulada de todo el período).
- **Punto de enero:** muestra la inflación del mes (no arranca en 0 fijo); el último punto del año
  es el acumulado anual completo.
- **Solo cliente:** usa `/api/inflation` + `useInflation` ya existentes. Sin cambios de server.

## Cálculo

`acumulado(mes) = (∏(1 + variacionMensual/100) desde el primer mes del scope hasta ese mes − 1) × 100`

- Scope = meses de `inflation` cuyo año está dentro del alcance del toggle, ordenados por período.
- El productorio arranca en el primer mes del scope; el primer punto = variación de ese mes.
- "Todos" queda acotado naturalmente por los datos disponibles (la serie llega hasta el último IPC
  publicado).

## Arquitectura (client)

1. **Util puro** `client/src/inflationStats.ts`:
   - `accumulatedInflation(inflation: InflationRateDTO[], year: string, years: string[]): AccumulatedInflationPoint[]`
   - `interface AccumulatedInflationPoint { periodo: string; acumulado: number }` (`acumulado` en %).
   - `year === "Todos"` → filtra meses cuyo `periodo.slice(0,4)` esté en `years`; si no, filtra al año
     exacto. Ordena por período y acumula. Serie/entrada vacía → `[]`.

2. **Formatter** `formatPercent(value: number): string` en `client/src/format.ts` (`"24,3%"`, 1 decimal, locale es-AR).

3. **Componente** `client/src/components/charts/InflationAccumulatedChart.tsx`:
   - Props: `{ inflation: InflationRateDTO[]; year: string; years: string[]; monthOnly?: boolean }`.
   - Línea nivo, mismo estilo que `PayslipNetoArsChart` (color de `palette`, `nivoTheme`, área con
     gradiente). Eje Y con `formatPercent`; `yFormat` con `formatPercent`.
   - Etiquetas X: `monthLabel` cuando `monthOnly` (año seleccionado), `periodo` rotado -45 en "Todos".
   - Estado vacío `Typography` "Sin datos de inflación" si no hay puntos.

4. **Integración** en `client/src/pages/PayslipsPage.tsx`:
   - Nueva `ChartCard title="Inflación acumulada"` en la grilla, pasando `inflation`, `year={activeYear}`,
     `years={years}` y `monthOnly`.

## Tests

`client/src/inflationStats.test.ts`:
- YTD de un año: primer punto = inflación de enero; último = acumulado anual compuesto.
- "Todos" atraviesa varios años acumulando en orden.
- Serie vacía → `[]`.
- Orden por período en la salida.
- Año sin datos en la serie → `[]`.

## Fuera de alcance

- Barras mensuales y KPI de acumulado (se descartaron a favor de la línea).
- Inflación interanual.
- Cambios de server (la serie ya está expuesta).
