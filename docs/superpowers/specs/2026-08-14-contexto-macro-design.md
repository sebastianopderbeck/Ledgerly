# Contexto macro: dólar, inflación y UVA — diseño

Fecha: 2026-08-14
Estado: aprobado para plan

## Objetivo

Agregar una sección nueva —página **Contexto**, ruta `/contexto`— que responda una pregunta
recurrente: **¿qué conviene hacer con la plata este mes, comprar dólares, quedarse en pesos o
adelantar capital del crédito UVA?**

La sección es un **termómetro de señales**: tres indicadores con su número, su color y su lectura en
una línea, más una tarjeta de síntesis que ordena las tres opciones. No pide montos ni administra
una cartera: da contexto y un veredicto explicable, no un plan de inversión.

Todo se expresa en **retorno real anual** (poder adquisitivo). Es la única unidad en la que las tres
opciones son comparables: el dólar rinde devaluación, el peso rinde tasa, y adelantar capital rinde
la tasa real del crédito. Compararlas en nominal no significa nada.

## Decisiones tomadas

- **Formato:** termómetro de señales, no comparador con monto de excedente ni backtest histórico.
- **Dólar:** solo **oficial**, el mismo que ya usa toda la app para valuar cupones, sueldo y
  consumos. Sin MEP, blue ni brecha.
- **Señales:** las cuatro elegidas — dólar real, tasa real en pesos, crédito vs alternativas, y
  veredicto de síntesis.
- **Ventana temporal:** **de enero 2025 en adelante**. Ni los gráficos ni las señales miran nada
  anterior.
- **Reparto del cómputo:** el server persiste las series diarias y expone la **agregación mensual**;
  el cliente calcula señales y veredicto en un módulo puro. Mismo patrón que
  `realSalary.ts` / `inflationStats.ts`: el server sirve series, el cliente combina.

### Por qué la ventana arranca en 2025

Con 20 meses, la "mediana" del dólar real es un **promedio reciente, no un equilibrio de largo
plazo**, y adentro de la ventana hay un cambio de régimen (salida del cepo, abril 2025). La señal
sigue sirviendo para decidir a 6-12 meses, pero por eso:

- la tarjeta se rotula **"vs su promedio desde 2025"**, nunca "caro/barato históricamente";
- el gráfico histórico va al lado de la señal, para que el número se lea con el contexto a la vista;
- los umbrales viven como constantes arriba de `macroSignals.ts`, para ajustarlos al ver los datos
  reales;
- `MACRO_START` es una sola constante: si algún día se quiere más historia, se cambia ahí y el
  backfill trae el resto.

## Fuentes de datos

Los cuatro endpoints están verificados el 2026-08-14 contra `api.argentinadatos.com`, la misma API
que ya se usa para el dólar oficial y la inflación.

| Serie | Endpoint | Forma | Cobertura verificada |
|---|---|---|---|
| Dólar oficial | `/v1/cotizaciones/dolares/oficial` | `{casa, compra, venta, fecha}` diario | 2011-01-03 → 2026-08-13 |
| UVA | `/v1/finanzas/indices/uva` | `{fecha, valor}` diario | 2016-03-31 → 2026-08-14 (2075,56) |
| Tasa depósitos 30 días | `/v1/finanzas/tasas/depositos30Dias` | `{fecha, valor}` diario | 2000-01-03 → 2026-08-12 (20,04) |
| Inflación (IPC) | `/v1/finanzas/indices/inflacion` | ya en uso, colección `InflationRate` | — |

Notas de las fuentes:

- Del dólar se usa **`venta`**, igual que `fetchOficialRate`.
- La serie de tasas **cambia de unidad a lo largo del tiempo**: en 2000 guardaba `0.0815` (fracción)
  y hoy guarda `20.04` (porcentaje). De 2025 en adelante está toda en porcentaje, así que el corte
  de ventana elimina el problema. Aun así el fetcher normaliza con una función `toPercent` (`valor
  < 1 → valor * 100`) como borde defensivo: una TNA menor a 1 % anual no existe en este mercado.
- La **inflación interanual no se pide a la API**: se calcula componiendo los últimos 12 meses de la
  serie mensual que ya está en `InflationRate`. Una fuente menos.
- Las series se traen **completas en una request** y se filtran a `fecha >= MACRO_START` antes de
  persistir. La API no ofrece filtro por rango para la serie completa, y pedir día por día serían
  ~590 requests.

## Cálculos

Todo lo que sigue vive en `client/src/macroSignals.ts` como funciones puras.

**Qué significa el color.** Cada señal representa una de las tres opciones, y su color dice qué tan
favorable está **esa** opción: 🟢 favorable, 🟡 neutra, 🔴 desfavorable. Verde en ① es "buen momento
para comprar dólares", no "el dólar está subiendo".

### Índice de precios de la ventana

La serie de inflación da variación mensual, no nivel. El índice se compone **solo dentro de la
ventana** (base = primer mes), así no se arrastra el compounding de la serie histórica completa:

```
ipc(p₁) = 1
ipc(pₖ) = ipc(pₖ₋₁) × (1 + variacionMensual(pₖ) / 100)
```

Convención: `variacionMensual(m)` es la inflación **de** ese mes, así que `ipc(m)` representa el
nivel de precios **a fin de** `m`. El valor mensual del dólar y de la UVA es el **último dato del
mes**, también fin de mes. Ambas puntas usan la misma convención.

### ① Dólar real — ¿está barato o caro vs su promedio desde 2025?

```
dolarReal(m) = usdOficial(m) / ipc(m)
mediana      = mediana de dolarReal sobre los meses CERRADOS de la ventana
indice(m)    = dolarReal(m) / mediana × 100
```

El mes en curso queda fuera de la mediana: es un mes parcial y ensuciaría la referencia contra la
cual se mide todo lo demás.

Estado, con `DOLAR_REAL_BANDA = 10`:

| Índice | Color | Lectura |
|---|---|---|
| `< 90` | 🟢 | está barato respecto de su promedio → comprar dólares es favorable |
| `90 – 110` | 🟡 | está en su promedio |
| `> 110` | 🔴 | está caro |

El **punto de hoy** —el que muestra la tarjeta y el que alimenta el veredicto— usa el dólar spot
contra el último IPC publicado, porque el IPC del mes en curso todavía no salió:

```
indiceHoy = (hoy.usdOficial / ipc(últimoMesConIPC)) / mediana × 100
```

Eso subestima la inflación transcurrida desde ese mes, así que la lectura aclara "con IPC hasta
\<mes\>". La serie del gráfico, en cambio, usa solo meses cerrados.

### ② Tasa real en pesos — ¿el peso paga por esperar?

```
tna      = tasa30(hoy) / 100
TEA      = (1 + tna / 12)¹² − 1
tasaReal = (1 + TEA) / (1 + π) − 1
```

donde `π` es la inflación anual esperada (supuesto editable, ver abajo). Estado con
`TASA_REAL_BANDA = 2` (puntos porcentuales): `> +2 %` 🟢, `−2 % a +2 %` 🟡, `< −2 %` 🔴.

Para el gráfico mes a mes se usa la versión realizada:

```
tasaRealMensual(m) = (1 + tasa30(m) / 100 / 12) / (1 + inflacion(m) / 100) − 1
```

Es la aproximación estándar: compara una tasa a 30 días —que mira hacia adelante— contra la
inflación efectivamente realizada de ese mes.

### ③ Adelantar capital vs las alternativas

Como el capital del crédito ya se ajusta por UVA, adelantar **rinde exactamente la tasa real del
crédito**, y es el único de los tres retornos que es **cierto**:

```
rendimientoRealAdelantar = (1 + i)¹² − 1
```

`i` es la tasa real mensual que `computeCreditProgress` ya deriva del crecimiento real del capital
—más precisa que `tna / 12`— pero que hoy no devuelve. Se expone como `tasaRealMensual` en
`CreditSummaryDTO`.

El **estado** de esta señal es su posición en el ranking del veredicto: 1º 🟢, 2º 🟡, 3º 🔴. A
diferencia de ① y ②, este número no tiene una banda propia: solo significa algo comparado con las
alternativas.

La **lectura** es la carrera UVA vs dólar a 12 meses:

```
uvaVar12 = uva(hoy) / uva(hace 12 meses) − 1
usdVar12 = usd(hoy) / usd(hace 12 meses) − 1
deuda    = (1 + uvaVar12) / (1 + usdVar12) − 1
```

> "En 12 meses la UVA subió 31 % y el dólar 22 %: tu deuda se encareció 7 % medida en dólares."

Si la ventana todavía no tiene 12 meses de datos, se usa el tramo más largo disponible y la lectura
dice el plazo real.

### ④ Veredicto

Retorno real anual esperado de cada opción, a 12 meses:

```
adelantar : rA = (1 + i)¹² − 1                    certeza alta
pesos     : rP = (1 + TEA) / (1 + π) − 1          certeza media  (depende de π)
dólar     : rD = (100 / indiceHoy)^(12/H) − 1     certeza baja   (depende de la reversión)
```

La devaluación esperada **sale de la señal ①**, no de un supuesto suelto: si el dólar real está 13 %
por debajo de su promedio y revierte en `H` meses, el retorno real del dólar es `mediana / actual −
1`, **independiente de `π`**. Con índice 87 y `H = 12`: `100/87 − 1 = +14,9 %`. Con `H = null` (sin
reversión) `rD = 0`: el dólar simplemente acompaña a la inflación.

El ranking ordena las tres por retorno real descendente. El resumen nombra al ganador, dice por
cuánto le saca al segundo, y **siempre aclara que solo `adelantar` es un retorno cierto** — los
otros dos dependen de supuestos.

### Supuestos editables

Tres controles en una barra plegable, todos precargados con valores derivados de los datos. Con
cero interacción la página ya funciona.

| Supuesto | Default | Uso |
|---|---|---|
| `inflacionEsperada` (% anual) | interanual actual, que el cliente compone con `inflacionInteranual(meses)` sobre los últimos 12 valores de `meses[].inflacion` | `π` en ② y ④ |
| `tasaAnualPesos` (TNA %) | `hoy.tasa30` | ② y ④; permite cargar la tasa real que consigas (FCI, cuenta remunerada) |
| `reversionMeses` | 12 · 24 · sin reversión | `H` en ④ |

Viven en `useState` de la página; no se persisten.

## Arquitectura

### Server

1. **Fetchers** `server/src/fx/macroSources.ts` (nuevo). Exporta `MACRO_START = "2025-01-01"`,
   `fetchOficialSeries`, `fetchUvaSeries` y `fetchTasa30Series`, las tres devolviendo
   `{ fecha: string; valor: number }[]` filtrado a `fecha >= MACRO_START`. Contrato de
   `fetchInflationSeries`: **devuelven `[]` ante error de red, sin throw**.

2. **Colección `MacroSeries`** en `server/src/db/models.ts`. Las tres series tienen la misma forma,
   el mismo origen y el mismo ciclo de vida, así que van en una sola colección con discriminador:

   ```ts
   const macroSeriesSchema = new Schema({
     serie: { type: String, required: true, enum: ["usd_oficial", "uva", "tasa30"] },
     fecha: { type: String, required: true },
     valor: { type: Number, required: true },
   });
   macroSeriesSchema.index({ serie: 1, fecha: 1 }, { unique: true });
   ```

   `fecha` es `string` `"YYYY-MM-DD"` y no `Date`: toda la matemática es de calendario
   (`slice(0, 7)`, comparación lexicográfica), igual que `periodo` en `InflationRate` y que los
   helpers ISO que ya existen en `dollarRate.ts` y `monthlyUsd.ts`.

   `InflationRate` **no se toca**: ya es mensual y ya funciona.

3. **Backfill** `server/src/import/backfillMacro.ts` (nuevo), con el bloque
   `if (process.argv[1]?.endsWith(...))` como `backfillInflation.ts`. Corre los tres fetchers más
   `backfillInflation`, hace upsert por `{ serie, fecha }` y devuelve
   `{ usd: n, uva: n, tasa30: n, inflacion: n }`. Script `seed:macro` en el `package.json` raíz: un
   solo comando mantiene la sección al día.

4. **Agregación** `server/src/stats/macroSeries.ts` (nuevo) — función pura
   `buildMonthlySeries(docs, inflation, desde)` que agrupa por `fecha.slice(0, 7)` y toma el
   **último valor de cada mes**. El mes en curso queda parcial, que es lo correcto. Testeable sin
   DB, igual que `amortization.ts` y `monthlyUsd.ts`.

5. **Endpoint** `GET /api/macro/series` en `server/src/http/routes/macro.ts` (nuevo), registrado en
   `app.ts`. Una request, ~20 filas:

   ```ts
   {
     desde: "2025-01",
     meses: [{ periodo: "2025-01", usdOficial: 1035.5, uva: 1250.3, tasa30: 29.1, inflacion: 2.2 }, ...],
     hoy: { fecha: "2026-08-14", usdOficial: 1515, uva: 2075.56, tasa30: 20.04 }
   }
   ```

   La ruta consulta y delega en `buildMonthlySeries`; devuelve su salida directamente, sin mapper
   (los docs no tienen `_id` ni `Date` que traducir).

6. **`server/src/stats/amortization.ts`** — agregar `tasaRealMensual: i` al objeto que devuelve
   `computeCreditProgress`. La variable ya existe; solo no se exponía.

### Shared

En `shared/src/dtos.ts`:

- `macroMonthSchema` — `{ periodo, usdOficial, uva, tasa30, inflacion }`, los cuatro valores
  `z.number().nullable()` salvo `periodo`, porque una serie puede tener huecos.
- `macroSpotSchema` — `{ fecha, usdOficial, uva, tasa30 }`, nullables por el mismo motivo.
- `macroSeriesDtoSchema` — `{ desde, meses, hoy }` + tipo `MacroSeriesDTO`.
- `tasaRealMensual: z.number()` en `creditSummaryDtoSchema`.

### Client

1. **Hook** `useMacroSeries()` en `client/src/api/hooks.ts`:
   `useQuery(["macro-series"], () => apiFetch<MacroSeriesDTO>("/macro/series"), { staleTime: 1h })`,
   igual que `useInflation` y `useMonthlyUsd`.

2. **Motor puro** `client/src/macroSignals.ts` (nuevo) — el corazón de la sección, sin React y sin
   red:

   ```ts
   export interface MacroAssumptions { inflacionEsperada: number; tasaAnualPesos: number; reversionMeses: 12 | 24 | null }
   export interface MacroSignal { id: string; label: string; value: number; status: "good" | "neutral" | "bad"; reading: string }
   export interface VerdictOption { opcion: "dolar" | "pesos" | "adelantar"; retornoReal: number; certeza: "alta" | "media" | "baja" }
   export interface MacroVerdict { ranking: VerdictOption[]; resumen: string }

   dolarRealSeries(meses): { serie: { periodo: string; indice: number }[]; mediana: number }
   tasaRealSeries(meses): { periodo: string; tasaReal: number }[]
   inflacionInteranual(meses): number
   buildSignals(series, credit, assumptions): MacroSignal[]
   buildVerdict(series, credit, assumptions): MacroVerdict
   ```

   `credit` es `CreditSummaryDTO | undefined`. **Sin crédito, la opción `adelantar` desaparece del
   ranking y la señal ③ no se renderiza**: la página tiene que servirle también a alguien sin
   hipoteca. `useCreditSummary` ya devuelve `undefined` en ese caso, porque `/credits/summary`
   responde 204 y `apiFetch` lo traduce a `undefined`.

3. **Página** `client/src/pages/MacroPage.tsx` (nuevo), ruta `/contexto` en `App.tsx` y entrada
   **"Contexto"** en el `NAV` de `Layout.tsx`. De arriba a abajo:

   - `VerdictCard` — el ranking y el porqué.
   - `MacroAssumptionsBar` — plegada por defecto.
   - `MacroSignalCards` — las tres señales.
   - Grilla de tres `ChartCard`, con el mismo `MotionBox` + `staggerContainer` que las demás páginas.

4. **Componentes** en `client/src/components/`:

   - `VerdictCard.tsx` — presentacional: recibe `MacroVerdict`, no calcula nada.
   - `MacroSignalCards.tsx` — usa el `Kpi` **compartido** de `components/Kpi.tsx`, mapeando
     `status → color` (`good→success`, `neutral→warning`, `bad→error`).
   - `MacroAssumptionsBar.tsx` — `Collapse` con dos `TextField` numéricos y un `ToggleButtonGroup`
     para el horizonte, siguiendo el patrón del filtro por año de `PayslipsPage`.

5. **`client/src/components/Kpi.tsx`** — agregar `"error"` al union `KpiColor`, necesario para
   pintar el 🔴. Una línea; `Kpi` ya indexa `theme.palette[color]`, que tiene `error`.

6. **Gráficos** en `client/src/components/charts/`, con la estética nivo existente
   (`ChartCard` / `nivoTheme` / `palette`):

   - `DolarRealChart.tsx` — línea del índice con línea de referencia punteada en 100.
   - `MacroRaceChart.tsx` — UVA vs dólar vs inflación, las tres en base 100 en ene-2025.
   - `TasaRealChart.tsx` — barras de tasa real mensual cruzando el cero.

## Interfaces y aislamiento

- **Fetch → persistencia → exposición** queda separado igual que en dólar e inflación:
  `macroSources.ts` (red pura) ← `backfillMacro.ts` (persistencia) ← `routes/macro.ts` (HTTP).
- **El server no opina.** `/api/macro/series` devuelve series agregadas; ninguna señal, umbral ni
  veredicto vive del lado del server. Cambiar un umbral o agregar un supuesto no toca la API.
- **`macroSignals.ts` es el único lugar con reglas de decisión.** Es puro, se testea sin red ni
  React, y es lo que hay que leer para entender qué recomienda la sección y por qué.
- **Los componentes no calculan.** `VerdictCard` y `MacroSignalCards` reciben estructuras ya
  resueltas; los gráficos reciben puntos.
- Cambiar los supuestos **no dispara refetch**: todo se recalcula en el cliente sobre las mismas
  ~20 filas.

## Estados vacíos y degradación

| Situación | Comportamiento |
|---|---|
| Series sin cargar (`seed:macro` nunca corrido) | Mensaje "Todavía no cargaste las series macro. Corré `bun run seed:macro`.", patrón de los estados vacíos existentes |
| Sin cupones de crédito | Señal ③ oculta; el ranking queda con dólar y pesos |
| IPC del mes en curso no publicado | El punto de hoy usa el último IPC disponible y la lectura lo aclara |
| Hueco en alguna serie mensual | El mes se saltea en esa serie; el resto de las señales sigue |
| Falla la red durante el backfill | El fetcher devuelve `[]` y el backfill deja lo que ya había |

## Tests

- `client/src/macroSignals.test.ts` — el grueso:
  - índice de dólar real contra una serie conocida, y mediana correcta con cantidad par e impar;
  - los tres umbrales de color de ① y ②;
  - `rD = 100 / indice − 1` con `H = 12`, raíz con `H = 24`, y `rD = 0` sin reversión;
  - el ranking ordena por retorno real descendente y marca la certeza;
  - sin `credit`: `adelantar` no aparece y la señal ③ tampoco;
  - `inflacionInteranual` compone 12 meses (ej. doce meses al 2 % → 26,8 %);
  - series vacías → señales vacías, sin excepción.
- `server/src/stats/macroSeries.test.ts` — último valor de cada mes, mes en curso parcial, huecos,
  filtro por `desde`.
- `server/src/fx/macroSources.test.ts` — mapeo de las tres respuestas, filtro `>= MACRO_START`,
  `toPercent` con fracción y con porcentaje, error de red → `[]`, con `fetch` mockeado como
  `dollarRate.test.ts`.
- `server/src/import/backfillMacro.test.ts` — upsert por `{ serie, fecha }` e idempotencia, con
  `withDb`.
- `server/src/http/routes/macro.test.ts` — shape del payload y caso sin datos.
- `server/src/stats/amortization.test.ts` — `tasaRealMensual` presente y coherente con `i`.
- `client/src/pages/MacroPage.test.tsx` — render con datos, estado vacío, y que cambiar un supuesto
  reordena el ranking. Con `afterEach(cleanup)`: en este repo el auto-cleanup de RTL está apagado.

## Orden de implementación

Cuatro tramos, cada uno verificable solo:

1. **Datos** — fetchers, colección `MacroSeries`, backfill, `seed:macro`. Se valida corriendo el
   seed y mirando Mongo.
2. **API** — `buildMonthlySeries`, `GET /api/macro/series`, DTOs en shared, `tasaRealMensual` en
   `computeCreditProgress`. Se valida con los tests de ruta y un `curl`.
3. **Motor** — `macroSignals.ts` completo con su batería de tests. Es el tramo con más lógica y no
   depende de ninguna UI: se puede escribir y testear entero antes de pintar nada.
4. **UI** — página, componentes, gráficos, ruta y nav.

## Fuera de alcance (YAGNI)

- MEP, blue, CCL y brecha cambiaria.
- Comparador con monto de excedente ("¿qué hago con $500.000?") — se descartó a favor del termómetro.
- Backtest histórico ("si hubieras hecho X en enero, hoy tendrías Y").
- Persistir los supuestos entre sesiones.
- Job automático de actualización: `seed:macro` se corre a mano, igual que `seed:fx` y
  `seed:inflation`.
- Alertas cuando una señal cambia de color.
- Unificar la copia privada de `Kpi` que vive dentro de `CreditKpiCards.tsx` con la compartida de
  `components/Kpi.tsx`. Es una limpieza real pero ajena a este objetivo; la sección nueva usa la
  compartida y no toca la otra.
- Datos anteriores a 2025.

## Operación

Después de implementar, correr `bun run seed:macro` una vez, y periódicamente para mantener las
series al día. Sin ese paso la página muestra el estado vacío con la instrucción.

## Descargo

La sección combina datos públicos con los cupones del propio crédito bajo supuestos que el usuario
controla y ve. No es asesoramiento financiero: dos de los tres retornos del ranking son
proyecciones, y la página lo dice en cada lectura. El único retorno cierto es el de adelantar
capital — y aun ese ignora el costo de perder liquidez, que ninguna fórmula acá contempla.
