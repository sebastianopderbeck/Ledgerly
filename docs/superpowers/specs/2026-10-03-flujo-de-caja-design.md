# Flujo de caja: cuánto te queda por mes — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo). Se implementa sobre `feat/base-nuevas-features`
(ver `2026-10-03-base-nuevas-features-design.md`).

## Objetivo

Agregar una página nueva **Flujo**, en la ruta `/flujo`, que conteste una sola pregunta: **¿cuánto me
queda por mes después de pagar lo que sale sí o sí?**

Para cada mes:

```
ingreso    = neto de los recibos de sueldo del mes (SAC incluido)
egresos    = total a pagar de los resúmenes de tarjeta que vencen en el mes
           + cuota de la hipoteca UVA debitada en el mes
           + cupón del auto que vence en el mes
margen     = ingreso − egresos
tasaAhorro = margen / ingreso
```

La página muestra:

- los KPIs del **último mes cerrado completo**;
- un gráfico mensual de ingreso, egresos y margen;
- una **proyección de 6 meses** (el mes en curso y los 5 siguientes);
- el detalle mes a mes, con qué falta importar en cada mes y qué parte es estimada.

"Egresos" quiere decir **egresos conocidos por Ledgerly**. Lo que no pasa por la tarjeta (alquiler,
expensas, servicios por débito, efectivo) no está, y la página lo aclara. El margen es "lo que quedó
antes de esos gastos", no el ahorro real.

## Lo que ya trae la base

`feat/base-nuevas-features` dejó listos los archivos compartidos. Esta feature **no los toca**:

| Pieza | Dónde |
|---|---|
| Ruta `/flujo` → `CashFlowPage` | `client/src/App.tsx` (el stub muestra solo el `h4` «Flujo de caja»; `App.test.tsx` exige ese título también mientras carga) |
| Ítem de menú «Flujo» (`SavingsOutlined`, en «Más», después de Contexto) | `client/src/components/layout/navItems.ts`, con `navItems.test.ts`, `MoreSheet.test.tsx` y `Layout.test.tsx` ya actualizados |
| Router `cashFlowRouter` montado en `/api/cash-flow` | `server/src/http/routes/cashFlow.ts` (stub sin handlers) y `server/src/http/app.ts` |
| DTOs `cashFlowEstadoSchema`, `cashFlowMonthSchema`, `cashFlowDtoSchema` y tipos `CashFlowEstado`, `CashFlowMonthDTO`, `CashFlowDTO` | `shared/src/dtos.ts`, con tests en `dtos.test.ts` |
| Hook `useCashFlow()` (queryKey `["cash-flow"]`) | `client/src/api/hooks.ts` |
| Aritmética de meses: `monthOf`, `addMonths`, `monthsBetween` (número), `monthRange` (lista inclusiva), `addDays`, … | `server/src/stats/months.ts` y su test |
| Cotización a una fecha sin red: `RatePoint`, `rateOnDate(fecha, points)` | `server/src/stats/rateOnDate.ts` y su test |
| Vencimiento efectivo de un resumen: `statementDueDate({ dueDate, closingDate })` y `DIAS_CIERRE_A_VENCIMIENTO = 12` | `server/src/stats/statementDueDate.ts` y su test |

La feature reemplaza el stub de la página y el del router, y agrega sus módulos propios.

## Decisiones tomadas

- **Cada flujo va al mes en que se mueve la plata**:
  - recibos: por el mes de `fechaPago`;
  - resumen de tarjeta: por el mes de su vencimiento efectivo (`statementDueDate`);
  - hipoteca: por el mes de `fechaDebito`;
  - auto: por el mes de `fechaVencimiento`.
- **Vencimiento estimado = cierre + 12 días.** Lo fija la base (`DIAS_CIERRE_A_VENCIMIENTO = 12`,
  unificado con ahorro-cuotas). El spec original decía 10; con 12, un cierre el 25/9 vence el 7/10 y
  sigue cayendo en octubre. No se define un `cardDueDate` propio: se usa `statementDueDate`.
- **Tarjeta = `totals.saldoActual`**, el total del resumen, lo mismo que muestra "A pagar al cierre".
  Se asume que se paga el total y no el mínimo.
- **El saldo en USD del resumen se pasa a pesos al oficial** (venta) del día del vencimiento, o al de
  hoy si ese día todavía no llegó. La cotización sale de la serie `usd_oficial` de `MacroSeries`, que
  ya está en la base. No se hace un request a la API por cada resumen. Es el único dólar de la app.
  Un saldo en USD negativo (a favor) se ignora.
- **Sin resumen no hay flujo.** La historia empieza en el primer mes que tiene recibo y resumen de
  tarjeta a la vez: se toma el más tardío de los dos primeros meses. Si no hay recibos o no hay
  resúmenes, no hay flujo. Esto evita mostrar años de recibos sin egresos, que darían tasas de ahorro
  del 90 %.
- **Mes incompleto = no se inventa nada.** Un mes cerrado queda **incompleto** si le falta alguna de
  estas cosas:
  - el recibo mensual;
  - el recibo del SAC, si el mes es junio o diciembre;
  - el resumen de una tarjeta que ya estaba en uso;
  - la cuota de una hipoteca o el cupón de un plan de auto que ya habían empezado;
  - la cotización del dólar para pasar un saldo en USD.

  En un mes incompleto se listan los faltantes y **no se calculan ni el margen ni la tasa**. Los
  montos que sí se conocen se muestran igual.
- **Las obligaciones cuentan desde su primer mes.** Antes del primer resumen de una tarjeta, o del
  primer cupón de la hipoteca o del auto, ese flujo vale 0 y no se marca como faltante. La hipoteca y
  el auto dejan de esperarse después de su última cuota.
- **Los KPIs miran el último mes cerrado completo.** El mes en curso nunca entra en los KPIs, porque
  siempre está a medias.
- **La tasa de ahorro trae un promedio ponderado** de los últimos 12 meses cerrados que estén
  completos: `Σ margen / Σ ingreso`. Un promedio simple de tasas haría pesar demasiado los meses con
  SAC.
- **Proyección: 6 meses** contando el mes en curso, sin selector de horizonte. Cada parte de cada mes
  es **real si ya está importada** y **estimada si no**:
  - **sueldo**: el último neto mensual;
  - **SAC**: en junio y diciembre, la mitad del último neto mensual;
  - **hipoteca y auto**: la última cuota, en nominal y sin indexar;
  - **tarjeta**: primero los resúmenes ya emitidos; después, **solo las cuotas en pesos que quedan del
    último resumen**. Es un piso.
- **Una tarjeta que todavía no empezó no se proyecta.** Si el primer resumen de una tarjeta vence
  después de un mes proyectado, ese mes no lleva la nota «(solo cuotas)» de esa tarjeta: el piso
  sería 0 y la nota, ruido.
- **El margen proyectado se presenta como "lo que queda para consumos nuevos"**, porque la tarjeta
  proyectada es un piso: no incluye las compras que todavía no hiciste.
- **El filtro de año global filtra solo la historia**, es decir, el gráfico y el detalle de los meses
  cerrados. Los KPIs y la proyección describen el estado actual y no se filtran: es la regla del spec
  del filtro de año global.
- **Los meses se arman en el server y el cliente pinta.** El server imputa, convierte el USD y
  estima, porque necesita datos que el cliente no tiene: las cuotas del último resumen y la
  cotización de cada fecha. El cliente elige los KPIs, filtra por año y dibuja.
- **Endpoint y router propios**, `GET /api/cash-flow`, en lugar de extender
  `server/src/http/routes/stats.ts`. Así no se pisa con otras features que tocan las estadísticas.
- **La tasa de ahorro es una fracción** (`0.065`), igual que `porcentajeDescuentos`, y la UI la
  multiplica por 100. Puede ser negativa. No se redondea en el server.
- **"Flujo" va en «Más»**, después de Contexto, con el ícono `SavingsOutlined` (ya en la base).
- **El encabezado (título y bajada) se muestra en todos los estados**, también mientras carga, en
  error y vacío: así `App.test.tsx` encuentra el `h4` y la página no salta al cargar.
- **Colores del gráfico.** Ingreso y Egresos usan los slots 0 y 3 de la paleta categórica del repo;
  Margen usa `success`/`error` según el signo, como `TasaRealChart`. Se validó con el script del
  skill dataviz: en claro pasa todo; verde↔ámbar queda en la banda 6–8 de ΔE para protanopía, así
  que la identidad no depende solo del color: posición fija dentro del grupo (Ingreso, Egresos,
  Margen), 2 px de separación entre barras, leyenda siempre visible y tooltip con el nombre de la
  serie. En oscuro, la paleta categórica del repo queda fuera de la banda de luminosidad: es un tema
  compartido (`palette.ts`) que esta feature no toca.

## Datos

No hay colecciones ni campos nuevos. Todo sale de modelos que ya existen en
`server/src/db/models.ts`:

| Flujo | Modelo | Monto | Mes de imputación |
|---|---|---|---|
| Ingreso | `PayslipModel` | `neto`, de todos los `tipo` (`"mensual"` y `"sac"`) | `fechaPago.toISOString().slice(0, 7)` |
| Tarjeta | `StatementModel` | `totals.saldoActual.ars + totals.saldoActual.usd × oficial`, con mínimo 0 | mes de `statementDueDate` (`dueDate`, o `closingDate` + 12 días) |
| Hipoteca | `MortgageCouponModel` | `totalDebitado` (incluye el seguro) | mes de `fechaDebito` |
| Auto | `AutoCouponModel` | `totalAPagar` | mes de `fechaVencimiento` |
| Cuotas a vencer (solo proyección) | `TransactionModel` del último resumen de cada tarjeta, con `type: "purchase"`, `isInstallment: true` y `currency: "ARS"` | `amount`, con `restantes = installmentTotal − installmentCurrent` | mes de vencimiento del último resumen + k |
| Dólar oficial | `MacroSeriesModel` con `serie: "usd_oficial"` | `valor` | el último `fecha` ≤ la fecha buscada (`rateOnDate`) |
| Cuotas totales de la hipoteca | `computeCreditProgress` (`server/src/stats/amortization.ts`) | `cuotasTotales` | — |
| Cuotas totales del auto | `AUTO_CUOTAS_TOTALES = 120` (`server/src/stats/autoProgress.ts`) | — | — |

Notas sobre los datos reales:

- **`fechaPago` del recibo.** El parser (`server/src/parsers/payslip.ts`) la fija en el último día
  del `periodo` (en UTC), así que su mes coincide con el `periodo`. El SAC cae en `"YYYY-06"` o
  `"YYYY-12"` según el semestre. Se imputa por `fechaPago` y no por `periodo` para que, si algún día
  el parser lee la fecha real de depósito, la regla siga siendo "cuando entra la plata".
- **Saldo en USD.** ICBC guarda `saldoActual.usd = 0` (ver el spec de "A pagar al cierre"), así que
  en la práctica el USD viene solo de Visa.
- **Cuotas de tarjeta.** En Argentina son en pesos. Si apareciera alguna en USD, la proyección la
  ignora.
- **Elección del último resumen.** Se usa `latestStatementIdsPerIssuer`
  (`server/src/stats/lastStatement.ts`), que ya usa `/stats/future-installments`. La proyección
  **no** usa `computeFutureInstallments`, porque esa función ubica las cuotas por `date` (fecha de
  compra). Acá las cuotas se anclan al **mes de vencimiento** del último resumen, que es cuando de
  verdad se pagan.
- **Fechas.** Las fechas de Mongo son medianoche UTC. Se pasan a `YYYY-MM-DD` con
  `toISOString().slice(0, 10)`, como en `server/src/http/mappers.ts`.
- **Cobertura del dólar.** `MacroSeries` arranca en `MACRO_START = "2025-01-01"` y se mantiene al
  día con el botón de actualizar de la barra superior (`POST /api/macro/refresh`).
- **Mes actual.** Es `new Date().toISOString().slice(0, 7)` en el server, en UTC, igual que
  `/stats/monthly-usd`.

## Cálculo

### Módulo puro del server: `server/src/stats/cashFlow.ts`

Es el único lugar con reglas de imputación y de estimación. Usa `months.ts`, `rateOnDate.ts` y
`statementDueDate.ts` de la base.

```ts
import type { CashFlowDTO, PayslipTipo } from "@ledgerly/shared";
import type { RatePoint } from "./rateOnDate.js";

export const HORIZONTE_MESES = 6;

export const FALTA_RECIBO = "Recibo de sueldo";
export const FALTA_SAC = "Recibo del SAC";
export const FALTA_HIPOTECA = "Cuota de la hipoteca";
export const FALTA_AUTO = "Cupón del auto";
export const FALTA_COTIZACION = "Cotización del dólar";
export const faltaResumen = (cardLabel: string): string => `Resumen ${cardLabel}`;
export const ESTIMADO_SUELDO = "Sueldo (último neto)";
export const ESTIMADO_SAC = "SAC (½ del último neto)";
export const ESTIMADO_HIPOTECA = "Hipoteca (última cuota)";
export const ESTIMADO_AUTO = "Auto (último cupón)";
export const estimadoTarjeta = (cardLabel: string): string => `${cardLabel} (solo cuotas)`;

export interface CashFlowPayslip { fechaPago: string; tipo: PayslipTipo; neto: number }
export interface CashFlowStatement {
  issuer: string;
  cardLabel: string;
  closingDate: string | null;
  dueDate: string | null;
  saldoArs: number;
  saldoUsd: number;
  uploadedAt: string;
}
export interface PendingInstallment { amount: number; remaining: number }
export interface CashFlowCard { issuer: string; cardLabel: string; baseMonth: string; installments: PendingInstallment[] }
export interface CashFlowCoupon { fecha: string; cuotaNro: number; monto: number }
export interface CashFlowPlan { coupons: CashFlowCoupon[]; cuotasTotales: number | null }
export interface InstallmentTxInput { amount: number; installmentCurrent: number | null; installmentTotal: number | null }
export interface CashFlowInput {
  today: string;
  payslips: CashFlowPayslip[];
  statements: CashFlowStatement[];
  cards: CashFlowCard[];
  mortgage: CashFlowPlan;
  auto: CashFlowPlan;
  usdRates: RatePoint[];
  horizon?: number;
}

export function statementAmountArs(statement: Pick<CashFlowStatement, "saldoArs" | "saldoUsd">, rate: number | null): number
export function toCashFlowCard(statement: CashFlowStatement, txs: InstallmentTxInput[]): CashFlowCard | null
export function installmentFloor(card: CashFlowCard, month: string): number
export function projectPlanPayment(plan: CashFlowPlan, month: string): number
export function incomeByMonth(payslips: CashFlowPayslip[]): Map<string, CashFlowPayslip[]>
export function buildCashFlow(input: CashFlowInput): CashFlowDTO
```

Qué hace cada función:

- **`statementAmountArs`** calcula `Math.max(0, saldoArs + saldoUsd × (rate ?? 0))`.
- **`toCashFlowCard`** arma la tarjeta desde su último resumen:
  - `baseMonth = monthOf(statementDueDate(statement))`, o devuelve `null` si no hay fecha;
  - `installments` = las transacciones con `remaining = installmentTotal − installmentCurrent > 0`
    (una transacción sin `installmentTotal` o sin `installmentCurrent` no cuenta).
- **`installmentFloor`** calcula el piso de cuotas de un mes:
  - `k = monthsBetween(card.baseMonth, month)`;
  - si `k < 1`, devuelve 0;
  - si no, devuelve `Σ amount` de las cuotas con `remaining >= k`.
- **`projectPlanPayment`** estima la cuota de la hipoteca o del auto:
  - toma `last` = el cupón con mayor `cuotaNro`;
  - `k = monthsBetween(monthOf(last.fecha), month)`;
  - devuelve 0 si no hay cupones, si `k < 1`, o si `cuotasTotales !== null && last.cuotaNro + k > cuotasTotales`;
  - si no, devuelve `last.monto`.
- **`incomeByMonth`** agrupa los recibos por el mes de `fechaPago`.

### Preparación de `buildCashFlow`

1. `mesActual = monthOf(today)` y `horizon = input.horizon ?? HORIZONTE_MESES`.
2. **Deduplicación de resúmenes.** Si hay dos resúmenes con el mismo `issuer` y el mismo
   `closingDate`, se queda el de `uploadedAt` más nuevo. Es el mismo criterio de desempate que
   `latestStatementIdsPerIssuer`, y evita contar dos veces el mismo resumen subido desde dos PDFs
   distintos. Los resúmenes sin `closingDate` no se deduplican. Después se descartan los resúmenes
   sin vencimiento efectivo (`statementDueDate` en `null`).
3. Si no hay recibos, o no queda ningún resumen, devuelve `{ mesActual, meses: [] }`.
4. `desde = max(primer mes de fechaPago, primer mes de vencimiento de resumen)`.
5. `historia = monthRange(desde, addMonths(mesActual, -1))`. Puede quedar vacía.
6. `proyeccion = monthRange(mesActual, addMonths(mesActual, horizon - 1))`.
7. Tarjetas: se agrupan los resúmenes por `issuer`. La etiqueta de cada tarjeta es el `cardLabel` de
   su resumen que vence último, y su primer mes es el primer mes de vencimiento. Cada tarjeta lleva
   su `CashFlowCard` (la del mismo `issuer` en `input.cards`, o ninguna).
8. Devuelve `meses = [...historia.map(mesCerrado), ...proyeccion.map(mesProyectado)]`, en orden
   ascendente.

En los dos tipos de mes, el monto de cada resumen real es:

```
statementAmountArs(s, s.saldoUsd > 0 ? rateOnDate(min(vencimiento(s), today), usdRates) : null)
```

Si `saldoUsd > 0` y no hay cotización, se suma solo la parte en pesos y se agrega
`FALTA_COTIZACION` a `faltantes`, una sola vez por mes.

### Mes cerrado (`M < mesActual`)

**Ingreso**

- `recibos` son los recibos del mes.
- `ingreso = Σ neto`, o `null` si no hay ningún recibo.
- `conSac` es `true` si alguno de los recibos es `sac`.
- Si no hay un recibo `mensual`, falta `FALTA_RECIBO`.
- Si `M` termina en `-06` o `-12` y no hay SAC, falta `FALTA_SAC`.

**Tarjetas.** Para cada tarjeta cuyo primer mes es `<= M`:

- si tiene resúmenes que vencen en `M`, se suman sus montos;
- si no tiene ninguno, falta `faltaResumen(cardLabel)`.

**Hipoteca y auto.** Las dos siguen la misma regla:

- si no hay cupones, o `M` es anterior al mes del primer cupón: 0, sin faltante;
- si hay cupones en `M`: `Σ monto`;
- si no hay cupones en `M`: 0, y falta `FALTA_HIPOTECA` o `FALTA_AUTO`. La única excepción es un
  plan **terminado** (`cuotasTotales !== null`, `last.cuotaNro >= cuotasTotales` y `M` posterior al
  mes de `last`): ahí no se marca ningún faltante.

**Resultado**

- `faltantes`, en este orden: recibo, SAC, resúmenes (en el orden de las tarjetas), hipoteca, auto y
  cotización.
- `egresos = tarjetas + hipoteca + auto`.
- `estado = faltantes.length > 0 ? "incompleto" : "completo"`.
- `margen = estado === "completo" ? ingreso − egresos : null`.
- `tasaAhorro = margen !== null && ingreso > 0 ? margen / ingreso : null`.
- `estimados = []`.

### Mes proyectado (`M >= mesActual`)

`ultimoNeto` es el `neto` del recibo `mensual` con la `fechaPago` más reciente, o 0 si no hay
ninguno.

**Sueldo**

- Si hay un recibo `mensual` en `M`, se usa `Σ neto` de los recibos mensuales.
- Si no, se usa `ultimoNeto` y se agrega `ESTIMADO_SUELDO` a `estimados`.

**SAC**

- En junio y diciembre: si hay un recibo `sac` en `M`, se usa su `neto`; si no, se usa
  `ultimoNeto / 2` y se agrega `ESTIMADO_SAC`.
- En cualquier otro mes, se suma el SAC real que haya (en la práctica, ninguno).
- `conSac` es `true` en junio y diciembre, o si hay un SAC real en el mes.

**Ingreso:** `ingreso = sueldo + sac`. En la proyección nunca es `null`.

**Tarjetas.** Para cada tarjeta cuyo primer mes es `<= M`:

- si tiene resúmenes que vencen en `M`, se suma su monto real;
- si no, se suma `installmentFloor(card, M)` con su `CashFlowCard` (o 0 si no tiene) y se agrega
  `estimadoTarjeta(cardLabel)`.

**Hipoteca y auto.** Las dos siguen la misma regla:

- si hay un cupón en `M`, se usa el real;
- si no, se usa `projectPlanPayment(plan, M)`. Si da más de 0, se agrega `ESTIMADO_HIPOTECA` o
  `ESTIMADO_AUTO`.

**Resultado**

- `estado = M === mesActual ? "en_curso" : "proyectado"`.
- `margen = ingreso − egresos`.
- `tasaAhorro = ingreso > 0 ? margen / ingreso : null`.
- `faltantes` solo puede tener `FALTA_COTIZACION`.
- `estimados`, en este orden: sueldo, SAC, tarjetas, hipoteca y auto.

### Ejemplo (es el caso principal de `cashFlow.test.ts`)

`today = "2026-10-03"`.

**Septiembre 2026, mes cerrado completo**

| Concepto | Dato | Monto |
|---|---|---|
| Recibo mensual | — | 1.100.000 |
| Visa | vence 14/9: 450.000 ARS + 20 USD × 1.400 | 478.000 |
| ICBC | vence 15/9 | 100.000 |
| Hipoteca | se debita el 17/9 | 300.000 |
| Auto | vence el 10/9 | 150.000 |
| **Egresos** | | **1.028.000** |
| **Margen** | | **72.000** |
| **Tasa de ahorro** | | **6,5 %** |

**Proyección**

Datos de partida:

- **Visa**: último resumen con cierre el 2/10 y vencimiento el 13/10, saldo 500.000. Cuotas que
  quedan: 30.000 (restan 3) y 20.000 (restan 1).
- **ICBC**: el último resumen importado vence el 15/9 y tiene una cuota de 10.000 a la que le restan 2.
- **Hipoteca y auto**: el último cupón de cada uno es el de septiembre.

| Mes | Sueldo | SAC | Visa | ICBC | Hipoteca | Auto | Margen |
|---|---|---|---|---|---|---|---|
| 2026-10 (en curso) | 1.100.000 e | — | 500.000 r | 10.000 e (k=1) | 300.000 e | 150.000 e | 140.000 |
| 2026-11 | 1.100.000 e | — | 50.000 e (k=1) | 10.000 e (k=2) | 300.000 e | 150.000 e | 590.000 |
| 2026-12 | 1.100.000 e | 550.000 e | 30.000 e (k=2) | 0 e (k=3) | 300.000 e | 150.000 e | 1.170.000 |
| 2027-01 | 1.100.000 e | — | 30.000 e (k=3) | 0 e | 300.000 e | 150.000 e | 620.000 |
| 2027-02 | 1.100.000 e | — | 0 e (k=4) | 0 e | 300.000 e | 150.000 e | 650.000 |
| 2027-03 | 1.100.000 e | — | 0 e | 0 e | 300.000 e | 150.000 e | 650.000 |

`r` = real, `e` = estimado.

### Casos borde

| Situación | Resultado |
|---|---|
| Sin recibos, o sin resúmenes con fecha | `meses: []`, y la página muestra el estado vacío |
| Mes cerrado sin recibo mensual | `ingreso` = lo que haya (por ejemplo, el SAC) o `null`; queda incompleto con "Recibo de sueldo" |
| Junio o diciembre sin SAC | Incompleto con "Recibo del SAC" |
| Tarjeta en uso sin resumen que venza en el mes | Incompleto con "Resumen \<cardLabel\>" |
| Mes anterior al primer resumen de una tarjeta, o al primer cupón de la hipoteca o del auto | Esa parte vale 0 y no se marca faltante |
| Hipoteca o auto sin cupón después de haber empezado, con el plan sin terminar | Incompleto con "Cuota de la hipoteca" o "Cupón del auto" |
| Plan terminado (`cuotaNro >= cuotasTotales`) | Deja de esperarse y de proyectarse |
| Dos resúmenes de la misma tarjeta que vencen en el mismo mes | Se suman, porque ese mes se pagan los dos |
| Dos documentos del mismo resumen (mismo `issuer` y mismo `closingDate`) | Cuenta solo el subido último |
| Un mes recibe dos vencimientos y el siguiente ninguno (se corrió el calendario de cierres) | El segundo mes queda incompleto. Se acepta: pasa muy poco, y la alternativa (encadenar los cierres) no vale la complejidad |
| Resumen sin `dueDate` | Se usa `closingDate` + 12 días |
| Resumen sin `dueDate` ni `closingDate` | Se ignora |
| Saldo a favor (negativo) | Cuenta 0 |
| Saldo en USD sin cotización (antes de 2025, o con las series sin cargar) | Se suma solo la parte en pesos y el mes lista "Cotización del dólar" |
| Dos cupones de la hipoteca o del auto en el mismo mes | Se suman |
| Mes en curso | Nunca es el "último mes completo"; va en la proyección, con lo real que ya esté importado y el resto estimado |
| Ingreso 0 | `tasaAhorro: null` |
| Margen negativo | Se muestra en rojo y la tasa queda negativa |
| La cuota del auto o de la hipoteca se paga con la tarjeta | Se contaría dos veces. Hoy no pasa: la hipoteca se debita de la cuenta y el auto se paga por Link o Banelco |

## API

### `GET /api/cash-flow`

El router vive en `server/src/http/routes/cashFlow.ts` (`cashFlowRouter`, ya montado por la base en
`/api/cash-flow`). No recibe parámetros: el año se filtra en el cliente.

```ts
cashFlowRouter.get("/", asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [payslips, statements, mortgageCoupons, autoCoupons, usdPoints] = await Promise.all([
    PayslipModel.find().lean(),
    StatementModel.find().lean(),
    MortgageCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    AutoCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    MacroSeriesModel.find({ serie: "usd_oficial" }).sort({ fecha: 1 }).lean(),
  ]);
  const latestIds = latestStatementIdsPerIssuer(statements.map(toRecency));
  const installmentTxs = await TransactionModel.find({
    statementId: { $in: latestIds }, type: "purchase", isInstallment: true, currency: "ARS",
  }).lean();
  const credit = computeCreditProgress(mortgageCoupons.map(toCouponInput));
  res.json(buildCashFlow({ today, payslips, statements, cards, mortgage, auto, usdRates }));
}));
```

- **Mapeos.** Son funciones privadas del archivo de la ruta: `toRecency`, `toCouponInput`,
  `toFlowStatement`, `toFlowPayslip`, `toFlowCoupon` y `toInstallmentTx`. Pasan los `Date` a ISO y
  `doc.totals.saldoActual.{ars,usd}` a `saldoArs` y `saldoUsd`.
- **Tarjetas.** `cards` es `toCashFlowCard(toFlowStatement(s), txsDe(s))` para cada resumen cuyo id
  está en `latestIds`, descartando los `null`.
- **Planes.** `mortgage` es `{ coupons, cuotasTotales: credit?.cuotasTotales ?? null }`, con
  `monto = totalDebitado` y `fecha = fechaDebito`. `auto` es
  `{ coupons, cuotasTotales: AUTO_CUOTAS_TOTALES }`, con `monto = totalAPagar` y
  `fecha = fechaVencimiento`.
- **Respuesta.** Devuelve la salida de `buildCashFlow` sin mapper, igual que `/api/macro/series`.

### DTO (`shared/src/dtos.ts`, ya en la base)

```ts
export const cashFlowEstadoSchema = z.enum(["completo", "incompleto", "en_curso", "proyectado"]);

export const cashFlowMonthSchema = z.object({
  mes: z.string(),
  estado: cashFlowEstadoSchema,
  ingreso: z.number().nullable(),
  conSac: z.boolean(),
  tarjetas: z.number(),
  hipoteca: z.number(),
  auto: z.number(),
  egresos: z.number(),
  margen: z.number().nullable(),
  tasaAhorro: z.number().nullable(),
  faltantes: z.array(z.string()),
  estimados: z.array(z.string()),
});

export const cashFlowDtoSchema = z.object({
  mesActual: z.string(),
  meses: z.array(cashFlowMonthSchema),
});
```

Ejemplo de respuesta:

```json
{
  "mesActual": "2026-10",
  "meses": [
    { "mes": "2026-08", "estado": "incompleto", "ingreso": 1050000, "conSac": false, "tarjetas": 420000,
      "hipoteca": 290000, "auto": 148000, "egresos": 858000, "margen": null, "tasaAhorro": null,
      "faltantes": ["Resumen ICBC"], "estimados": [] },
    { "mes": "2026-09", "estado": "completo", "ingreso": 1100000, "conSac": false, "tarjetas": 578000,
      "hipoteca": 300000, "auto": 150000, "egresos": 1028000, "margen": 72000, "tasaAhorro": 0.0655,
      "faltantes": [], "estimados": [] },
    { "mes": "2026-10", "estado": "en_curso", "ingreso": 1100000, "conSac": false, "tarjetas": 510000,
      "hipoteca": 300000, "auto": 150000, "egresos": 960000, "margen": 140000, "tasaAhorro": 0.1273,
      "faltantes": [], "estimados": ["Sueldo (último neto)", "ICBC (solo cuotas)", "Hipoteca (última cuota)", "Auto (último cupón)"] }
  ]
}
```

## UI

### Datos y lógica pura en el cliente

`useCashFlow()` ya está en `client/src/api/hooks.ts`. No lleva `staleTime`: `useImportFile`,
`useDeleteImportedFile` y `useRefreshMacro` ya invalidan todas las queries, así que el flujo se
recalcula solo después de importar, borrar o actualizar el dólar.

**`client/src/cashFlow.ts`** (nuevo, puro). Patrón `cardCycle.ts`: sin React y sin red. Importa solo
tipos de `@ledgerly/shared` y de `@nivo/bar`.

```ts
export const AHORRO_VENTANA_MESES = 12;
export const ESTADO_LABEL: Record<CashFlowEstado, string> =
  { completo: "Completo", incompleto: "Incompleto", en_curso: "En curso", proyectado: "Proyectado" };

export interface SavingsAverage { tasa: number | null; meses: number }
export type MonthNoteLabel = "Falta" | "Estimado";
export interface MonthNote { label: MonthNoteLabel; text: string }

export const isClosedMonth = (mes: CashFlowMonthDTO): boolean
export const closedMonths = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO[]
export const projectionMonths = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO[]
export const closedMonthsInYears = (meses: CashFlowMonthDTO[], selection: YearSelection): CashFlowMonthDTO[]
export const cashFlowYears = (meses: CashFlowMonthDTO[]): string[]
export const lastClosedMonth = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO | null
export const lastCompleteMonth = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO | null
export const averageSavingsRate = (meses: CashFlowMonthDTO[], ventana?: number): SavingsAverage
export const savingsAverageLabel = (average: SavingsAverage): string
export const formatSavingsRate = (tasa: number | null): string
export const isNegative = (value: number | null): boolean
export const cashFlowChartRows = (meses: CashFlowMonthDTO[]): BarDatum[]
export const detailRows = (historia: CashFlowMonthDTO[], proyeccion: CashFlowMonthDTO[]): CashFlowMonthDTO[]
export const monthNotes = (mes: CashFlowMonthDTO): MonthNote[]
export const notesText = (mes: CashFlowMonthDTO): string
export const shortMonth = (mes: string): string
export const incompleteCaption = (meses: CashFlowMonthDTO[]): string | null
```

Qué hace cada función:

- **`isClosedMonth`** es `true` para los estados `completo` e `incompleto`.
- **`closedMonths`** y **`projectionMonths`** devuelven los meses en orden ascendente por `mes`.
- **`closedMonthsInYears`** usa `matchesYears` de `client/src/filters/globalFilters.ts`.
- **`cashFlowYears`** devuelve `yearsOf` de los meses cerrados.
- **`averageSavingsRate`**:
  - toma los últimos `ventana` meses cerrados (el server los manda contiguos, así que alcanza con
    `slice(-12)`);
  - de esos, se queda con los `completo` con `ingreso > 0`;
  - devuelve `{ tasa: Σ margen / Σ ingreso, meses: n }`;
  - si no queda ninguno, devuelve `{ tasa: null, meses: 0 }`.
- **`savingsAverageLabel`** da «promedio 3 meses: 6,5%» («promedio 1 mes: …» con uno solo), o «sin
  promedio todavía».
- **`formatSavingsRate`** da `formatPercent(tasa × 100)`, o «—» con `null`.
- **`isNegative`** es `true` solo para un número menor que 0 (no para `null`).
- **`cashFlowChartRows`** arma filas `{ month, estado, Ingreso, Egresos, Margen }`. Se omiten las
  keys sin valor (`Ingreso` o `Margen` en `null`) para que nivo no dibuje esa barra.
- **`detailRows`** junta `[...proyeccion, ...historia]` y lo ordena por `mes` descendente.
- **`monthNotes`** devuelve, en este orden:
  - `{ label: "Falta", text: faltantes.join(", ") }` si hay faltantes;
  - `{ label: "Estimado", text: estimados.join(", ") }` si hay estimados.
- **`notesText`** da `"Falta: … · Estimado: …"` (las notas unidas con « · »).
- **`shortMonth`** da `"Jul 2026"`, con el `monthLabel` de `payslipConcepts.ts`.
- **`incompleteCaption`** da `"Los meses incompletos se ven atenuados y sin margen: Jul 2026 (falta
  Recibo de sueldo), Ago 2026 (falta Resumen ICBC)."`, o `null` si no hay meses incompletos.

### Página `client/src/pages/CashFlowPage.tsx`

Reemplaza el stub. La ruta `/flujo` y el ítem de menú ya están en la base.

**Hooks** (todos antes de los early returns):

- `useCashFlow()`, `useGlobalFilters()` y `useIsMobile()`;
- `meses = data?.meses ?? []`;
- `historia = closedMonthsInYears(meses, yearSelection)`;
- `proyeccion = projectionMonths(meses)`;
- `detalle = detailRows(historia, proyeccion)`;
- `yearOptions = cashFlowYears(meses)`.

Los derivados van con `useMemo`. Además,
`monthOnly = yearSelection.kind === "years" && yearSelection.years.length === 1`, como en Sueldo.

**Encabezado.** `h4` «Flujo de caja» y debajo, en `body2` y `text.secondary`: «Lo que entra por
sueldo menos lo que sale sí o sí: tarjetas, hipoteca y auto.». Se muestra en todos los estados.

**Early returns**

| Caso | Qué muestra debajo del encabezado |
|---|---|
| `isLoading` | `CircularProgress` |
| `isError` | «No se pudo calcular el flujo de caja. Probá de nuevo en un rato.» |
| `meses.length === 0` | «Para ver el flujo de caja importá tus recibos de sueldo y al menos un resumen de tarjeta desde la página Importar.» |

**Vista en la compu, de arriba a abajo**

1. Encabezado.
2. `FiltersBar fields={["year"]} yearOptions={yearOptions}`.
3. `CashFlowKpiCards meses={meses}`. No se filtra por año.
4. Una grilla `MotionBox` + `staggerContainer` con `gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }`
   y dos `ChartCard`:
   - **«Ingreso, egresos y margen por mes»**: `CashFlowChart meses={historia} monthOnly={monthOnly}`,
     más `incompleteCaption(historia)` en `caption` / `text.secondary`.
   - **«Próximos 6 meses (estimado)»**: el número sale de `proyeccion.length`. Lleva
     `CashFlowChart meses={proyeccion}` y este caption fijo: «Sueldo con el último neto (y la mitad en
     junio y diciembre por el SAC), hipoteca y auto con la última cuota, y tarjetas con los resúmenes
     ya emitidos y, después, solo las cuotas que ya compraste. El margen es lo que te queda para
     consumos nuevos y gastos fuera de la tarjeta.»
5. Un `h6` «Detalle mes a mes» y después `CashFlowTable meses={detalle}` en la compu, o
   `CashFlowCards meses={detalle}` en mobile.

### Componentes

**`client/src/components/CashFlowKpiCards.tsx`**, con props `{ meses: CashFlowMonthDTO[] }`. Calcula
`lastCompleteMonth`, `lastClosedMonth` y `averageSavingsRate`.

- **Sin mes completo.** Muestra un `Typography` en `text.secondary`: «Todavía no hay un mes cerrado
  completo.». Si `lastClosed` existe, agrega « En {formatMonthLabel(mes)} falta: {faltantes}.».
- **Con mes completo.** Muestra un `subtitle1`: «Último mes completo: {formatMonthLabel(mes)}» (por
  ejemplo, «Septiembre de 2026»). Si `lastClosed` es otro mes, agrega un `caption`:
  «{formatMonthLabel(lastClosed.mes)} todavía está incompleto: falta {faltantes}.». Después va un
  `KpiGrid` con 4 `Kpi` compartidos (`components/Kpi.tsx`):

| label | valor | formato | sub | ícono | color |
|---|---|---|---|---|---|
| Ingreso | `ingreso` | `formatMoney(·, "ARS")` | «neto, con SAC» si `conSac`; si no, «neto de recibos» | `PaymentsIcon` | primary |
| Egresos conocidos | `egresos` | money | «tarjetas, hipoteca y auto» | `ReceiptLongIcon` | warning |
| Margen libre | `margen` | money | «lo que quedó del mes» | `SavingsIcon` | `margen >= 0 ? "success" : "error"` |
| Tasa de ahorro | `tasaAhorro × 100` | `formatPercent` | `savingsAverageLabel(promedio)` | `PercentIcon` | secondary |

**`client/src/components/charts/CashFlowChart.tsx`**, con props
`{ meses: CashFlowMonthDTO[]; monthOnly?: boolean }`. Es presentacional: no llama a ningún hook de
datos.

- **Sin datos.** Si `meses` está vacío, muestra «Sin datos».
- **Barras.** `ResponsiveBar` agrupado con las keys `["Ingreso", "Egresos", "Margen"]` y
  `indexBy="month"`, de 260 px de alto, `innerPadding={2}` y `borderRadius={4}`.
- **Colores.** Los arma `cashFlowBarColor(colors)` (exportado y testeado):
  - Ingreso es `seriesColor(mode, 0)` y Egresos es `seriesColor(mode, 3)`.
  - Margen es `success.main` si es ≥ 0 y `error.main` si no.
  - En los meses `incompleto`, todas las barras van atenuadas con `alpha(color, 0.35)`.
- **Ejes y escala.** `valueScale` lineal con `min` y `max` en `"auto"`, y un marcador en y = 0, como
  en `TasaRealChart`. El eje izquierdo usa `formatMoneyCompact`. `valueFormat` es `formatMoney`.
- **Eje inferior.** Rotación de -45° salvo con `monthOnly`, que pasa a `monthLabel` sin rotar.
- **Layout.** `useChartLayout()`: `seriesMargin({ top: 16, right: 24, bottom: 64, left: 64 })` y
  `bottomTicks`.
- **Leyenda.** Va con `ChartLegend` debajo del gráfico, en compu y en mobile. No se usan las
  `legends` de nivo, porque el color de Margen depende del signo.
- **Tooltip.** En mobile se usa `compactBarTooltip({ showKey: true })`.

**`client/src/components/CashFlowStatusChip.tsx`**, con props `{ estado: CashFlowEstado }`. Es un
`Chip` `size="small"` `variant="outlined"` con `ESTADO_LABEL[estado]`. El color depende del estado:
`completo` → success, `incompleto` → warning, `en_curso` → info, `proyectado` → default.

**`client/src/components/CashFlowTable.tsx`** (compu), con props `{ meses: CashFlowMonthDTO[] }`.

- Si `meses` está vacío, devuelve `null`.
- Es un `Table size="small"` con `aria-label="Detalle del flujo de caja"`, adentro de un
  `TableContainer` con `overflowX: auto`, y usa `MotionTableBody` / `MotionTableRow`, como
  `PayslipsTable`.
- Las columnas son: Mes (`formatMonthLabel`) · Estado (chip) · Ingreso · Tarjetas · Hipoteca · Auto
  · Egresos · Margen · Ahorro · Notas.
- Un mes con SAC lleva el chip «SAC» en la celda de Ingreso, como `PayslipsTable`.
- `null` se muestra como «—» (`formatMoneyOrDash` y `formatSavingsRate`).
- El margen negativo va en `error.main`.
- Notas es `notesText(mes)` y hace wrap.

**`client/src/components/CashFlowCards.tsx`** (mobile), con las mismas props. Va un `RecordCard` por
mes, adentro de `recordListSx`:

- **Título**: `formatMonthLabel(mes)`.
- **Badge**: `CashFlowStatusChip`.
- **Destacados**: Margen (en rojo si es negativo) y Ahorro.
- **Detalle**: Ingreso (con «· con SAC» si corresponde), Tarjetas, Hipoteca, Auto, Egresos, y un
  campo por cada `MonthNote` (label «Falta» o «Estimado»).

### Mobile

- **Filtros.** `FiltersBar` ya cambia a botón «Filtros» con una hoja; no hay nada que agregar.
- **KPIs.** `KpiGrid` pasa a 1 columna en contenedores angostos y a 2 desde 600 px. `Kpi` ya achica
  el ícono y el valor.
- **Gráficos.** Una columna, con `seriesMargin` / `bottomTicks` (como mucho 6 etiquetas, siempre con
  el último mes), `ChartLegend` debajo y el tooltip compacto.
- **Detalle.** `CashFlowCards` en lugar de la tabla, con `useIsMobile()`, siguiendo el patrón del
  spec responsive: tarjetas en vez de tablas.
- **Interacción táctil.** No hay acciones de edición. El único control táctil propio es «Ver
  detalle» de `RecordCard`, que ya mide 44 px (`MIN_TAP_SIZE` de `tapTarget.ts`).
- **Textos largos.** Los captions de los gráficos y las notas hacen wrap. No hay texto con `noWrap`,
  salvo el `sub` de `Kpi`, que se mantiene corto.

## Tests

Se hace con TDD: cada pieza arranca con un test en rojo. Todos los fixtures son **sintéticos**: CUIL
de mentira, `cardLabel` «Visa Signature» / «ICBC» y montos redondos.

### Server

- **`server/src/stats/cashFlow.test.ts`** (el grueso):
  - **Funciones auxiliares:**
    - `statementAmountArs` funciona con y sin `rate`, y un saldo negativo da 0;
    - `toCashFlowCard` ancla al mes de vencimiento (o cierre + 12 días), descarta cuotas sin
      restantes y devuelve `null` sin fechas;
    - `installmentFloor` con `k < 1` da 0 y respeta `remaining >= k`;
    - `projectPlanPayment` respeta `cuotasTotales`;
    - `incomeByMonth` agrupa por el mes de `fechaPago`.
  - **Imputación del ingreso:** un recibo mensual y un SAC del mismo mes se suman y dan
    `conSac: true`.
  - **Imputación de la tarjeta:**
    - por mes de `dueDate`;
    - sin `dueDate`, por cierre + 12 días: un cierre el 25/9 cae en octubre;
    - sin ninguna de las dos fechas, el resumen se ignora.
  - **Imputación de hipoteca y auto:** van por `fechaDebito` y `fechaVencimiento`, y dos cupones del
    mismo mes se suman.
  - **Saldo en USD:**
    - se convierte con la cotización del vencimiento;
    - con el vencimiento en el futuro, usa la del día de hoy;
    - sin cotización, suma solo los pesos y lista «Cotización del dólar»;
    - un saldo negativo cuenta 0.
  - **Duplicados:** dos resúmenes con el mismo `issuer` y `closingDate` cuentan una vez, el del
    `uploadedAt` más nuevo.
  - **Mes cerrado sin recibo:** `ingreso` `null`, `margen` y `tasaAhorro` `null`, y «Recibo de
    sueldo» en `faltantes`. Junio sin SAC lista «Recibo del SAC».
  - **Obligaciones:**
    - una tarjeta que empieza después de `desde` no es faltante antes de su primer mes, y sí lo es
      en un mes sin resumen después;
    - lo mismo para la hipoteca y el auto;
    - un plan terminado no es faltante ni se proyecta.
  - **Rango:**
    - `desde` es el mayor de los dos primeros meses;
    - sin recibos o sin resúmenes → `meses: []`;
    - la historia termina en `mesActual − 1`.
  - **Proyección:** reproduce la tabla del ejemplo completa. Los estados son `en_curso` y
    `proyectado`, y en `estimados` aparecen los textos esperados.
- **`server/src/http/routes/cashFlow.test.ts`** usa `withDb()` y supertest, con
  `vi.useFakeTimers({ toFake: ["Date"] })` y `vi.setSystemTime(new Date("2026-10-03T12:00:00Z"))`. Se
  cargan:
  - recibos de agosto y septiembre;
  - resúmenes de Visa que vencen en agosto, septiembre y octubre, con un punto `usd_oficial` en
    `MacroSeries`;
  - una transacción en cuotas (2/4, 30.000) en el resumen de octubre;
  - un cupón de hipoteca y uno de auto (sintéticos).

  Se verifica:
  - `cashFlowDtoSchema.parse(res.body)` no tira error;
  - septiembre está `completo`;
  - octubre usa el saldo real;
  - noviembre y diciembre llevan 30.000 de tarjeta, y enero 0;
  - noviembre lista «Visa Signature (solo cuotas)».

  También se prueba la base vacía, que debe dar `{ mesActual: "2026-10", meses: [] }`.

### Shared

- `shared/src/dtos.test.ts` ya valida `cashFlowDtoSchema` (base).

### Cliente

Los archivos con varios renders llevan `afterEach(cleanup)`, porque el auto-cleanup de RTL está
apagado en este repo.

- **`client/src/cashFlow.test.ts`**
  - `lastCompleteMonth` salta los meses incompletos y los proyectados.
  - `lastClosedMonth` devuelve el mes cerrado más reciente.
  - `averageSavingsRate` pondera por ingreso, mira solo los últimos 12 meses cerrados e ignora los
    incompletos; sin meses válidos devuelve `{ tasa: null, meses: 0 }`.
  - `savingsAverageLabel` y `formatSavingsRate`.
  - `closedMonthsInYears` funciona con años sueltos y con «Todos».
  - `cashFlowChartRows` omite `Margen` cuando es `null`.
  - `detailRows` ordena de forma descendente.
  - `monthNotes` pone primero «Falta» y después «Estimado»; `notesText` las une.
  - `incompleteCaption` da `null` sin meses incompletos.
- **`client/src/components/charts/cashFlowChart.test.tsx`**, con `@nivo/bar` mockeado por
  `NivoProbe`:
  - con meses vacíos muestra «Sin datos»;
  - en mobile, con 14 meses, muestra como mucho 6 ticks e incluye el último;
  - en mobile usa el tooltip compacto;
  - no usa leyendas de nivo (`legends` 0) y muestra los tres ítems de `ChartLegend`;
  - `cashFlowBarColor` pinta el margen negativo con el color de error y atenúa los meses
    incompletos.
- **`client/src/components/CashFlowDetail.test.tsx`**: la tabla muestra una fila por mes con el chip
  de estado, «—» en el margen de un mes incompleto, las notas y el margen negativo en rojo; las
  tarjetas muestran un `article` por mes con Margen y Ahorro, y las notas en el detalle.
- **`client/src/pages/CashFlowPage.test.tsx`**, con `fetch` stubeado para `/cash-flow` y
  `route: "/flujo?year=all"`:
  - muestra «Último mes completo: Agosto de 2026» y el aviso de que «Septiembre de 2026 todavía está
    incompleto: falta Resumen ICBC»;
  - muestra los cuatro KPIs, los dos títulos de gráfico y una fila «Proyectado» en la tabla;
  - con `meses: []` muestra el estado vacío que invita a importar;
  - con un error del server muestra el aviso de error;
  - el filtro de Año ofrece los años de los meses cerrados;
  - con `?year=2025`, el detalle no muestra los meses cerrados de 2026 pero sí los proyectados;
  - con `emulateMobile()` se ven tarjetas (`article`) y no `table`.
- **Menú y rutas**: `navItems.test.ts`, `MoreSheet.test.tsx`, `Layout.test.tsx` y `App.test.tsx` ya
  cubren «Flujo» y `/flujo` desde la base.

**Verificación final.** `bun run test`, `bun run typecheck` y `bun run build` en verde. La prueba
manual con la app levantada (KPIs del último mes completo, el Año filtra solo la historia, diciembre
con SAC en la proyección, la vista a 375 px) queda para el usuario: en esta ejecución autónoma no se
levanta la app (el 4100 es del servicio instalado y 4000/5173 son de otras sesiones).

## Orden de implementación

1. **Cálculo.** `server/src/stats/cashFlow.ts` con su test: auxiliares, historia y proyección.
2. **API.** El handler en `server/src/http/routes/cashFlow.ts` y su test.
3. **Cliente puro.** `client/src/cashFlow.ts` con sus tests.
4. **UI.** El gráfico, el chip, la tabla y las tarjetas, los KPIs y la página.

## Fuera de alcance

- Gastos que no pasan por la tarjeta (alquiler, expensas, servicios por débito, efectivo) y otros
  ingresos (freelance, alquileres). No hay carga manual.
- Proyectar consumos nuevos de tarjeta (por ejemplo, el promedio de los últimos meses) o sumar al
  piso los cobros recurrentes. Cuando exista Suscripciones, sus cobros podrían sumarse al piso de
  tarjeta.
- Indexar la proyección por inflación o por UVA: la cuota de la hipoteca y la del auto se proyectan
  en nominal.
- Las percepciones por pagar el saldo en USD con pesos, y el pago mínimo o parcial del resumen.
- Ver el flujo en USD o en pesos constantes (eso es de Gasto real).
- Un selector de horizonte (3 o 6 meses), un desglose por tarjeta en la UI y alertas cuando el margen
  proyectado queda negativo.
- Detectar que una tarjeta se dio de baja: una tarjeta que deja de usarse queda marcada como faltante
  en los meses cerrados siguientes.
- Mostrar el flujo en el Dashboard.
- Refactorizar `addMonths` de `futureInstallments.ts` o `shiftDate` de `dollarRate.ts` para que usen
  `months.ts`.
