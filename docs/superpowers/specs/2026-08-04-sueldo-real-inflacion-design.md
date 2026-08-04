# Sueldo real vs inflación — diseño

Fecha: 2026-08-04
Estado: aprobado para plan

## Objetivo

Agregar a la página **Sueldo** un gráfico que muestre el **poder adquisitivo** del sueldo:
el neto de cada recibo deflactado por inflación y expresado en **pesos de hoy**. Así se ve en qué
momentos los aumentos le ganaron a la inflación (la línea sube o se mantiene) y en cuáles la
perdieron (la línea baja).

El eje "sueldo vs dólar" **ya está cubierto** por el gráfico existente *"Evolución del neto en USD"*
(`netoUsd`, dólar oficial): cuando esa línea sube, el aumento le ganó al dólar. Este diseño **no**
agrega un gráfico de USD nuevo; solo suma el eje **vs inflación**, que hoy no existe en el repo.

## Decisiones tomadas

- **Enfoque principal:** poder adquisitivo (sueldo real), no índice base 100 ni barras mensuales.
- **Escala:** pesos de hoy (deflactado a pesos del último mes con IPC publicado).
- **Dólar:** oficial (el `netoUsd` ya calculado); no se toca.
- **Fuente de inflación:** argentinadatos.com, la misma API que ya se usa para el dólar oficial.

## Fuente de datos: inflación (IPC INDEC)

Endpoint verificado: `GET https://api.argentinadatos.com/v1/finanzas/indices/inflacion`

Respuesta: array de `{ fecha: "YYYY-MM-DD", valor: number }`, donde `valor` es la **variación
mensual en porcentaje** (ej. `1.9` = 1,9 %). `fecha` es fin de mes; el período se obtiene con
`fecha.slice(0, 7)` → `"2026-06"`. Cubre 1943 → último mes publicado (hoy `2026-06`). Los recibos
arrancan en 2023, así que están sobradamente cubiertos.

**Meses sin IPC publicado:** el IPC de un mes se publica ~mediados del mes siguiente, por lo que
los recibos más recientes pueden no tener inflación posterior disponible. Esos recibos se toman
como "ya en pesos de hoy" (factor de deflación = 1).

## Cálculo de deflación (pesos de hoy)

Para un recibo de período `P` y último período con IPC `L`:

```
netoReal(P) = neto(P) * factor(P → L)
factor(P → L) = ∏  (1 + variacionMensual(m) / 100)   para cada mes m tal que P < m <= L
factor(P → L) = 1                                      si P >= L
```

Es decir: se acumula la inflación **posterior** al mes del recibo, hasta el último mes con dato.
No se guarda un índice acumulado en la base: se calcula al vuelo sobre la ventana relevante
(decenas de meses), evitando el overflow de compounding de la serie histórica completa.

Convención de mes: `variacionMensual` con `fecha` fin de `m` = inflación **de** ese mes `m`. Un
recibo de período `P` está expresado en pesos de `P`; para llevarlo a pesos de `L` se multiplica por
la inflación de los meses estrictamente posteriores a `P` hasta `L` inclusive.

## Arquitectura

### Server (nuevo)

1. **Fetcher** `server/src/fx/inflationRate.ts` — analogía de `dollarRate.ts`.
   - `fetchInflationSeries(): Promise<{ periodo: string; variacionMensual: number }[]>`
   - Hace `fetch` al endpoint, mapea `{ fecha, valor }` → `{ periodo: fecha.slice(0,7), variacionMensual: valor }`.
   - Devuelve `[]` ante error de red (sin throw), igual que `fetchOficialRate` devuelve `null`.

2. **Colección `InflationRate`** en `server/src/db/models.ts`.
   - Schema: `{ periodo: string (index, unique), variacionMensual: number }`.
   - `InflationRateModel`, `InflationRateDoc`, siguiendo el patrón de los demás modelos.

3. **Backfill** `server/src/import/backfillInflation.ts` + bloque `if (process.argv[1]?.endsWith(...))`,
   igual que `backfillRates.ts`.
   - `backfillInflation(): Promise<{ upserted: number }>` — trae la serie y hace upsert por `periodo`.
   - Script npm `seed:inflation` en `package.json` raíz.

4. **Endpoint** `GET /api/inflation` → `InflationRateDTO[]`.
   - Nuevo `server/src/http/routes/inflation.ts` (router `inflationRouter`), registrado en `app.ts`.
   - Lee `InflationRateModel.find().sort({ periodo: 1 })`, mapea con `toInflationRateDTO`.

5. **Mapper** `toInflationRateDTO` en `server/src/http/mappers.ts`.

### Shared (nuevo)

- `inflationRateDtoSchema` en `shared/src/dtos.ts`:
  `z.object({ periodo: z.string(), variacionMensual: z.number() })`, exportando el tipo
  `InflationRateDTO`. Ya se re-exporta vía `shared/src/index.ts`.

### Client (nuevo)

1. **Hook** `useInflation()` en `client/src/api/hooks.ts`:
   `useQuery(["inflation"], () => apiFetch<InflationRateDTO[]>("/inflation"), { staleTime: 1h })`,
   igual que `useOficialRate`/`useMonthlyUsd`.

2. **Util puro** `client/src/realSalary.ts` (patrón de `payslipConcepts.ts`/`cardCycle.ts`):
   - `deflateToLatest(payslips: PayslipDTO[], inflation: InflationRateDTO[]): { periodo: string; netoReal: number }[]`
   - Ordena por período; arma un map `periodo → variacionMensual`; toma `L = max(periodo)` de la serie.
   - Para cada recibo calcula `netoReal` con la fórmula de arriba. Si falta la serie (`inflation`
     vacío) devuelve `[]` (el gráfico muestra estado vacío).
   - Huecos en la serie: el productorio recorre solo los meses presentes en el map; un mes ausente
     no aporta factor (se asume 0 % para ese hueco). En la práctica la serie de argentinadatos es
     mensual completa, así que es un borde defensivo.

3. **Componente** `client/src/components/charts/PayslipRealArsChart.tsx`:
   - Props: `{ payslips: PayslipDTO[]; inflation: InflationRateDTO[]; monthOnly?: boolean }`.
   - Usa `deflateToLatest` para los puntos; misma estética nivo/`ChartCard`/`nivoTheme`/`palette`
     que `PayslipNetoArsChart` (línea ARS, `formatMoney`/`formatMoneyCompact` en ARS).
   - **Línea de referencia** punteada al `netoReal` del **primer recibo mostrado**
     ("poder de compra inicial"): por encima, el sueldo compra más que al inicio; por debajo, menos.
     Se implementa como una segunda serie plana o vía marker de nivo (a definir en el plan).
   - Estado vacío (`Typography color="text.secondary"`) si no hay puntos o no hay serie de inflación,
     igual que `PayslipNetoUsdChart` con "Sin datos de dólar".

4. **Integración** en `client/src/pages/PayslipsPage.tsx`:
   - `const { data: inflation } = useInflation();`
   - Nueva `ChartCard title="Sueldo real (pesos de hoy)"` dentro de la grilla existente,
     pasando `filtered` (ya filtrado por año y sin `CHART_EXCLUDED_PERIODS`) e `inflation`.
   - La deflación siempre usa la serie completa y el último IPC global, aunque los recibos estén
     filtrados por año; la referencia usa el primer recibo del set mostrado.

## Interfaces y aislamiento

- `inflationRate.ts` (fetch puro) ← `backfillInflation.ts` (persistencia) ← `routes/inflation.ts`
  (exposición). Misma separación que dólar (`dollarRate.ts` / `backfillRates.ts` / `routes/fx.ts`).
- `/api/inflation` expone la serie cruda; el cliente combina con payslips vía `deflateToLatest`,
  función pura sin dependencias de red ni de React, testeable de forma aislada.
- `PayslipRealArsChart` solo consume los puntos ya calculados; no contiene lógica de inflación.

## Tests

- `client/src/realSalary.test.ts`:
  - factor de deflación correcto con serie conocida (ej. dos meses al 10 % → factor 1,21);
  - recibo del último período o posterior → `netoReal === neto` (factor 1);
  - serie de inflación vacía → `[]`;
  - hueco en la serie → no rompe (mes ausente aporta factor 1);
  - orden de salida por período.
- `server/src/fx/inflationRate.test.ts`: mapeo `{ fecha, valor }` → `{ periodo, variacionMensual }`;
  error de red → `[]` (con `fetch` mockeado, como `dollarRate.test.ts`).
- `server/src/import/backfillInflation.test.ts`: upsert por período e idempotencia (con `withDb`).
- `server/src/http/mappers.test.ts`: caso `toInflationRateDTO`.
- Ajuste de `server/src/http/app.test.ts` para `/api/inflation` si corresponde al patrón existente.

## Fuera de alcance (YAGNI)

- Dólar blue/MEP para este gráfico (se usa oficial, ya calculado).
- Índice base 100 y gráfico de barras mes a mes (se descartaron a favor de poder adquisitivo).
- Job automático de actualización de inflación: se corre `seed:inflation` manualmente, igual que
  `seed:fx`.
- KPI numéricos de inflación (se puede evaluar después; este spec cubre solo el gráfico).

## Operación

Tras implementar: correr `bun run seed:inflation` una vez (y periódicamente, como `seed:fx`) para
poblar/actualizar la serie de IPC.
