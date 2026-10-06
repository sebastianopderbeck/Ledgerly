# Aumento de sueldo por IPC en el flujo de caja

## Objetivo

Hoy la proyección del flujo de caja repite el último neto mensual en todos los meses futuros. El sueldo sube cada 4 meses por IPC, así que la proyección subestima el ingreso a partir del próximo aumento.

La proyección tiene que sumar esos aumentos: con el IPC publicado cuando existe y con la inflación esperada del REM del BCRA para los meses que todavía no se publicaron.

## Reglas del aumento

- Los meses en que se cobra con aumento son **enero, mayo y septiembre**.
- Cada aumento es el **IPC compuesto de los 4 meses anteriores** al mes del aumento:
  - enero: septiembre a diciembre
  - mayo: enero a abril
  - septiembre: mayo a agosto
- Los aumentos cuentan **después del mes del último recibo mensual**. Si el último recibo es del mes del aumento, ya lo trae y no se suma de nuevo. Si falta importar el recibo de un mes de aumento que ya pasó, ese mes también se proyecta con su aumento.
- Para cada mes de la ventana: si el IPC ya está publicado se usa el real; si no, la tasa mensual esperada (ver abajo), y el aumento queda marcado como estimado con REM.
- El porcentaje se aplica directo al neto. Es una aproximación: supone que descuentos y Ganancias escalan igual.
- El SAC estimado pasa a ser la mitad del sueldo estimado de ese mes.
- Los meses con recibo real no cambian.

## Inflación esperada (REM)

- **Fuente:** API de estadísticas del BCRA v4, variable 29: «Mediana de la variación interanual próximos 12 meses del índice de precios al consumidor del relevamiento de expectativas de mercado».
  - `GET https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/29?desde=<MACRO_START>`
  - Respuesta: `{ results: [{ idVariable: 29, detalle: [{ fecha: "YYYY-MM-DD", valor: <porcentaje anual> }] }] }`, con un punto por mes en la fecha de cierre.
- **Guardado:** como serie `rem_12m` en `MacroSeriesModel` (`serie`, `fecha`, `valor`), igual que el dólar, la UVA y la tasa.
- **Actualización:** dentro de `backfillMacro`, así entra en el botón de refrescar datos macro y en el script de backfill. No se agrega un cron.
- **Tasa mensual:** se toma el último valor guardado y se convierte con `(1 + anual / 100) ^ (1 / 12) − 1`.
- **Fallback:** si no hay ningún dato del REM, se usa el último IPC mensual publicado. Si tampoco hay IPC, la tasa esperada es 0 y la proyección queda plana como hoy.
- Se descartaron las tablas XLSX del REM, que traen el camino mes a mes: no hay una URL estable desde que cambió el sitio del BCRA y habría que parsear Excel.

## Diseño

### Server

- `server/src/fx/macroSources.ts`: `fetchRem12mSeries()` pide la variable 29 y devuelve `SeriePoint[]`. Devuelve `[]` si la respuesta falla o no tiene la forma esperada.
- `server/src/db/models.ts`: `"rem_12m"` en el enum de `MacroSeriesModel.serie`.
- `server/src/import/backfillMacro.ts`: `MacroSerieName` y `MacroBackfillResult` suman `rem_12m`.
- `server/src/import/refreshMacroData.ts`: `series.rem12m` en la respuesta.
- `server/src/stats/salaryRaise.ts` (nuevo, puro):
  - `MESES_AUMENTO`, `VENTANA_IPC`.
  - `expectedMonthlyInflation(rem12m: number | null, publicada: InflationPoint[]): number` devuelve la tasa mensual como fracción.
  - `raisesBetween(desde: string, hasta: string, inflacion: SalaryInflation): SalaryRaise[]` devuelve los aumentos con mes en `(desde, hasta]`, cada uno con `{ mes, porcentaje, conRem }`.
  - `raiseFactor(raises: SalaryRaise[]): number` es el producto de `(1 + porcentaje)`.
- `server/src/stats/cashFlow.ts`:
  - `CashFlowInput.inflacion?: SalaryInflation`, con `{ publicada: { periodo, variacion }[]; esperadaMensual: number }` (variación en fracción). Si falta, la proyección queda plana como hoy.
  - `FlowContext` suma el mes del último recibo mensual y la inflación.
  - En `projectedMonth`, si el sueldo es estimado: `sueldo = ultimoNeto × factor`, y si el SAC es estimado: `sac = sueldo estimado / 2`.
- `server/src/http/routes/cashFlow.ts`: lee `InflationRateModel` y la última `rem_12m`, y arma `inflacion`.

### Etiquetas

- Sin aumentos en el medio: «Sueldo (último neto)» y «SAC (½ del último neto)», como hoy.
- Con aumentos:
  - «Sueldo (último neto +6,6% por aumento de enero)»
  - «Sueldo (último neto +13,5% por aumentos de enero y mayo)»
  - Si alguno usó el REM se agrega « · IPC esperado del REM».
  - El SAC dice «SAC (½ del sueldo estimado)».

### Shared y cliente

- `shared/src/dtos.ts`: `macroRefreshDtoSchema.series.rem12m`.
- `client/src/macroRefreshSummary.ts`: la serie se muestra como «REM».
- `client/src/pages/CashFlowPage.tsx`: el caption de la proyección explica los aumentos de enero, mayo y septiembre por el IPC de los 4 meses anteriores, con el REM para los meses sin publicar.

## Tests

- `salaryRaise.test.ts`:
  - la ventana de 4 meses con IPC real
  - los meses sin publicar con la tasa esperada y `conRem`
  - dos aumentos compuestos
  - ningún aumento si el próximo cae fuera del rango
  - el aumento de un mes sin recibo importado
  - `expectedMonthlyInflation` con REM, con fallback al IPC y sin datos
- `macroSources.test.ts`: el parseo de la variable 29 y el `[]` ante error o forma inesperada.
- `cashFlow.test.ts` (stats): el ingreso proyectado con aumento, el SAC de diciembre sin el aumento de enero, las etiquetas, y que sin `inflacion` se proyecte plano.
- Ruta `/cash-flow`: la inflación publicada y el REM llegan a la proyección.
- `backfillMacro`, `refreshMacroData` y `macroRefreshSummary` con la serie nueva.

## Fuera de alcance

- Detectar el calendario de aumentos desde los recibos. Los meses son fijos.
- Proyectar el bruto y recalcular descuentos o Ganancias.
- El camino mes a mes del REM.
- Usar los aumentos en otras pantallas (Recibos, Vencimientos, Macro).
