# Suscripciones como columna del flujo de caja — diseño

Fecha: 2026-10-15
Estado: aprobado (columna propia en todos los meses).

## Objetivo

Que el Flujo muestre las suscripciones como un egreso propio, con una columna «Suscripciones» entre
«Servicios» y «Egresos», en todos los meses.

Hoy ya se pagan dentro de **Tarjetas** (ver `2026-10-14-servicios-y-suscripciones-en-flujo-design.md`):
en los meses con resumen están en el saldo del resumen, y en los meses estimados se suman al piso de la
tarjeta. Por eso no se ven.

## Decisiones tomadas

- **Separar, no sumar.** Lo que pasa a Suscripciones sale de Tarjetas. `egresos` no cambia en ningún mes;
  solo cambia el desglose. Sumarlas encima del resumen las contaría dos veces.
- **Qué cobros se separan de un resumen.** Los de la racha de cada suscripción detectada y no oculta,
  esté activa o cortada: una cortada se cobró de verdad en esos meses. Las ocultas quedan en Tarjetas,
  igual que las cortadas que la detección ya no lista (las de hace más de 12 meses).
- **Cada cobro va a su resumen por `statementId`**, el del movimiento, y no por fecha. Es el resumen que
  lo trajo.
- **Los dólares se pasan con la cotización del resumen**, la misma que `statementTotal` usa para el saldo
  en dólares (la del vencimiento, o la de hoy si todavía no venció).
- **Tope.** En cada moneda, la parte de suscripciones no pasa del saldo positivo del resumen en esa
  moneda, y el total no pasa del monto del resumen. Así Tarjetas nunca queda negativa, aunque un pago
  anticipado o una devolución dejen el saldo por debajo de las suscripciones.
- **Meses estimados.** Las suscripciones salen del piso de la tarjeta y van a su columna. La nota de la
  tarjeta vuelve a «Visa (solo cuotas)», y si alguna tarjeta estimada tiene cobros ese mes se suma la nota
  «Suscripciones (último cobro)». Se borra `estimadoTarjetaConSuscripciones`.
- **Qué suscripciones se proyectan** no cambia: las activas y no ocultas (`isCounted`), con el monto del
  último cobro, en el resumen en que caen.

## Cambios

### Detección (`server/src/stats/subscriptions.ts`)

- `SubscriptionTx` suma `statementId: string`. `loadSubscriptionInputs` lo llena con el `statementId` del
  movimiento.
- `detectSubscriptionRuns(txs, ctx): DetectedSubscription[]`, con
  `DetectedSubscription = { subscription: SubscriptionDTO; run: Charge[] }`, en el mismo orden que hoy.
  `detectSubscriptions` pasa a ser ese resultado mapeado a `subscription`.

### Flujo (`server/src/stats/cashFlow.ts`)

- `CashFlowStatement` suma `suscripcionesArs` y `suscripcionesUsd`: lo cobrado por suscripciones en ese
  resumen, en cada moneda.
- `subscriptionsByStatement(charges)`: agrupa los cobros por `statementId` y moneda.
- `statementSubscriptionsArs(statement, rate)`: la parte del resumen que son suscripciones, con el tope.
- En `closedMonth` y en `projectedMonth`:
  - `tarjetas` = resúmenes menos su parte de suscripciones + piso de cuotas de las tarjetas estimadas;
  - `suscripciones` = parte de suscripciones de los resúmenes + cobros proyectados de las tarjetas
    estimadas;
  - `egresos = tarjetas + hipoteca + auto + servicios + suscripciones`.
- Sin cotización: una suscripción en dólares de una tarjeta estimada no se suma y el mes lista «Cotización
  del dólar», como hoy.

### DTO (`shared/src/dtos.ts`)

`cashFlowMonthSchema` suma `suscripciones: z.number()`.

### Ruta (`GET /api/cash-flow`)

Corre `detectSubscriptionRuns` una vez. Las `isCounted` van a la proyección, como hoy. Las rachas de las no
ocultas van a `subscriptionsByStatement`, y cada resumen recibe sus totales.

### Cliente

- `CashFlowTable`: columna «Suscripciones» entre «Servicios» y «Egresos».
- `CashFlowCards`: fila «Suscripciones» entre «Servicios» y «Egresos».
- `CashFlowKpiCards`: el subtítulo de «Egresos conocidos» pasa a «tarjetas, hipoteca, auto, servicios y
  suscripciones».
- `CashFlowPage`: la bajada pasa a «Lo que entra por sueldo menos lo que sale sí o sí: tarjetas, hipoteca,
  auto, servicios y suscripciones.», y `PROJECTION_CAPTION` cuenta las suscripciones aparte de las
  tarjetas: «tarjetas con los resúmenes ya emitidos y, después, las cuotas que ya compraste; suscripciones
  con el último cobro de cada una, en el mes en que vence su resumen».
- El gráfico no cambia: usa `egresos`.

## Tests

**Server, lógica pura**

- `subscriptions.test.ts`: `detectSubscriptionRuns` devuelve la racha con el `statementId` de cada cobro,
  y `detectSubscriptions` sigue igual.
- `cashFlow.test.ts`:
  - `subscriptionsByStatement` agrupa por resumen y moneda;
  - `statementSubscriptionsArs` con pesos, con dólares y con los topes;
  - un mes cerrado separa las suscripciones de Tarjetas y `egresos` no cambia;
  - los dólares de un resumen usan la cotización del resumen;
  - sin cotización, los dólares del resumen no se separan;
  - en un mes estimado las suscripciones van a su columna, la tarjeta dice «(solo cuotas)» y aparece la
    nota «Suscripciones (último cobro)»;
  - las de USD sin cotización no se suman y el faltante aparece una sola vez.

**Server, ruta:** una suscripción cobrada en resúmenes ya importados sale de Tarjetas en esos meses y
aparece en Suscripciones; en los meses estimados va a Suscripciones; una oculta queda en Tarjetas.

**Shared:** `cashFlowMonthSchema` con `suscripciones`.

**Cliente:** columna y fila «Suscripciones», y los textos nuevos de la bajada, el KPI y la explicación.

**Verificación:** `bun run test` y `bun run typecheck` en verde, y un chequeo de solo lectura contra la
base local (`createApp()` + supertest con `GET /api/cash-flow`) comparado con el servicio en :4100: en cada
mes `egresos` tiene que ser el mismo, y `tarjetas + suscripciones` igual a las `tarjetas` de antes.

## Fuera de alcance

- Separar las suscripciones de las cortadas que ya no se listan.
- Repartir el saldo anterior o los pagos parciales de un resumen entre Tarjetas y Suscripciones.
