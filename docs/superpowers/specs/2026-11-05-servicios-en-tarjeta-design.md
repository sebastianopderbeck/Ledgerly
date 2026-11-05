# Servicios que llegan en la tarjeta — diseño

Fecha: 2026-11-05
Estado: en revisión.

## Objetivo

Que un servicio que se paga con la tarjeta (por ejemplo, el gas debitado en la Visa) se pueda marcar como
servicio desde Movimientos, para:

1. **Tenerlo junto con los demás servicios** en la página Servicios, al lado de los que se cargan a mano.
2. **Que el Flujo lo cuente como servicio**: en los meses con resumen, separado de Tarjetas; en los meses
   que todavía no tienen resumen, proyectado.

Hoy la página Servicios solo lista lo cargado a mano, pensado para lo que se paga fuera de la tarjeta. Un
cargo de servicio en la tarjeta ya tiene la categoría «Servicios» por regla, pero:

- en los meses con resumen cuenta dentro de **Tarjetas**;
- en los meses estimados la tarjeta solo proyecta cuotas, así que el servicio no se cuenta y el margen
  proyectado sale más alto de lo real.

## Decisiones tomadas

Las de la conversación:

- **Se marca el comercio, no el cargo.** El botón «Es un servicio» en un movimiento marca su comercio. Los
  cargos de ese comercio, pasados y futuros, cuentan como servicio sin volver a marcarlos.
- **Separar, no sumar.** En los meses con resumen, los cargos del servicio salen de Tarjetas y pasan a
  Servicios. `egresos` no cambia en ningún mes con resumen; solo cambia el desglose. Es la misma regla que
  ya se usa para las suscripciones (`2026-10-15-suscripciones-columna-flujo-design.md`).
- **Proyección: último monto más la inflación esperada del REM**, como los servicios cargados a mano, y en
  el mes en que vence el resumen de la tarjeta, como las suscripciones.
- **En la página Servicios aparece con los demás** y su monto entra en el total por mes. No se edita a
  mano: el monto sale del último cargo. Se puede quitar.

Decisiones mías (a revisar):

- **Cadencia mensual.** Un servicio de tarjeta se proyecta todos los meses: los cargos de gas que motivaron
  esto llegan uno por mes. Cambiarle la cadencia queda fuera de alcance.
- **«Último monto» es el último resumen, no el último cargo.** Si un resumen trae dos cargos del mismo
  servicio (dos medidores, dos cuentas), el monto que se proyecta y el que suma el KPI es la suma de los
  cargos del resumen más reciente que tenga alguno. Así coincide con lo que el mes cerrado separa.
- **El comercio se agrupa igual que en suscripciones.** Las variantes de un mismo nombre (truncado en un
  resumen, completo en otro) son un solo comercio: se agrupan con `canonicalMerchantKeys` y una marca
  vale para el grupo si coincide con la clave del grupo o con cualquiera de sus variantes, como `hasMark`
  en `stats/subscriptions.ts`. Esa agrupación se extrae a un helper compartido y la usan la detección de
  suscripciones, la lista de servicios de tarjeta y el Flujo.
- **Solo pesos.** Los servicios son en ARS. El botón se muestra solo en compras en pesos, y solo los cargos
  en pesos cuentan.
- **Servicio gana sobre suscripción, sin borrar nada de suscripciones.** Mientras un comercio está marcado
  como servicio, sus movimientos se sacan de la detección de suscripciones, así un cargo nunca se separa
  dos veces. Marcarlo como servicio no toca su marca manual de suscripción ni los cobros marcados a mano:
  al quitarlo de Servicios vuelve a ser suscripción como antes. Al revés, «Es una suscripción» sobre un
  comercio marcado como servicio borra la marca de servicio (es solo una clave, no se pierde nada).
- **Sin baja automática.** Mientras está marcado se proyecta con el último monto. Si se deja de pagar con
  la tarjeta, se quita a mano; la lista muestra la fecha del último cargo para que se note. Las marcas sin
  ningún cargo no se listan ni cuentan.
- **Sección propia en la página.** Los servicios de tarjeta van en la misma página, en una sección «En la
  tarjeta» entre «Activos» y «Dados de baja», porque sus columnas son otras (tarjeta y último cargo en vez
  de cadencia y desde). El KPI «Por mes» y la cuenta de vigentes los incluyen.

## Datos

### Colección nueva: `CardServiceModel`

En `server/src/db/models.ts`, colección `cardservices`, con el mismo estilo que `hiddenSubscriptionSchema`:

| Campo | Tipo | Notas |
|---|---|---|
| `userId` | `userIdPath` | como el resto de las colecciones del usuario |
| `key` | string, requerido | `merchantKey(merchant)` del movimiento marcado |

Con `timestamps: { createdAt: "markedAt", updatedAt: false }`. Se suma `"CardService"` a
`USER_SCOPED_MODEL_NAMES`. Marcar dos veces el mismo comercio no crea dos documentos (`updateOne` con
`upsert`).

### Cargos de un servicio de tarjeta

Son los movimientos del usuario con `type: "purchase"`, `direction: "debit"`, `isInstallment: false` y
`currency: "ARS"` cuyo grupo de comercio (ver «El comercio se agrupa igual que en suscripciones») tiene una
marca. Las devoluciones no se restan: quedan en Tarjetas.

### Schemas compartidos (`shared/src/dtos.ts`)

```ts
export const cardServiceDtoSchema = z.object({
  key: z.string(),
  nombre: z.string(),
  issuer: issuerSchema,
  cardLabel: z.string(),
  ultimoMonto: z.number(),
  ultimoCargo: z.string(),
});

export const cardServiceInputSchema = z.object({ transactionId: z.string() }).strict();
```

- `key`: la clave canónica del grupo.
- `nombre`: `merchantDisplayName` del último cargo.
- `issuer`, `cardLabel`, `ultimoCargo` (`YYYY-MM-DD`): del último cargo por fecha.
- `ultimoMonto`: la suma de los cargos del grupo en el resumen más reciente que tenga alguno.

## API

Router nuevo `cardServicesRouter` en `server/src/http/routes/cardServices.ts`, montado en
`/api/card-services` detrás del login, como los demás.

- `GET /` → `CardServiceDTO[]`, uno por grupo de comercio marcado que tenga al menos un cargo, ordenados
  por `nombre`.
- `POST /` con `{ transactionId }` → 204. Busca el movimiento del usuario (404 «Movimiento no encontrado»
  si no existe o el id es inválido). Si no es una compra en pesos, en un pago y sin cuotas, 400
  «Movimiento inválido». Si `merchantKey` da vacío, 400 «Este comercio no tiene un nombre reconocible».
  Hace upsert de la marca con `merchantKey(merchant)`. No toca las marcas de suscripción.
- `DELETE /:key` → 204. `key` es la clave canónica que devuelve el `GET`. Borra todas las marcas del grupo:
  la de esa clave y las de cualquiera de sus variantes. Misma validación de clave que
  `/subscriptions/hidden/:key`.

`POST /api/subscriptions/manual` suma: borra las marcas de servicio del grupo del movimiento.

## Suscripciones

`loadSubscriptionInputs` carga también las marcas de servicio y deja afuera de `txs` los movimientos cuyo
grupo de comercio está marcado como servicio. Con eso la página Suscripciones y el Flujo dejan de verlos
como suscripción mientras dure la marca. Las marcas de suscripción (`ManualSubscription`,
`HiddenSubscription`, `SubscriptionCadence`) quedan como estaban.

## Flujo (`server/src/stats/cashFlow.ts`)

### Meses con resumen

- `CashFlowStatement` suma `serviciosArs`: lo cobrado por servicios de tarjeta en ese resumen. Los cargos
  van a su resumen por `statementId`, como los de las suscripciones.
- La parte de servicios de un resumen tiene tope: no pasa del saldo positivo en pesos que queda después de
  la parte de suscripciones en pesos. Así Tarjetas nunca queda negativa.
- `splitStatement` devuelve `{ tarjeta, suscripciones, servicios, sinCotizacion }`, con
  `tarjeta = monto del resumen − suscripciones − servicios`.
- En `closedMonth` y `projectedMonth`, `servicios` = servicios cargados a mano que se pagan ese mes + la
  parte de servicios de los resúmenes del mes + (solo en `projectedMonth`) los cargos proyectados de las
  tarjetas estimadas.

### Meses estimados

- Entrada nueva `cardServices: CashFlowCardService[]` en `CashFlowInput`, con
  `{ issuer, monto, ultimoCargo }` por servicio (`monto` = `ultimoMonto`, la suma del último resumen).
- Cada servicio se proyecta como un cobro mensual que empieza un mes después de `ultimoCargo`, y cae en el
  mes de pago de su tarjeta con la misma regla que `subscriptionPaymentMonths`. Solo se suma en las
  tarjetas que ese mes no tienen resumen (`estimatedCard`), igual que las suscripciones.
- El cargo proyectado `k` meses después del último vale `monto × (1 + esperadaMensual)^k`.
- La nota «Servicios (último monto…)» aparece si ese mes hay servicios cargados a mano o servicios de
  tarjeta proyectados. No aparece si lo único que hay en Servicios es la parte de un resumen real.

### Ruta (`GET /api/cash-flow`)

Carga las marcas y los cargos de servicios de tarjeta del usuario, con la misma agrupación que el
`GET /api/card-services`. Los cargos van a cada resumen (`serviciosArs`), y cada servicio va a
`cardServices` con su `ultimoMonto` y `ultimoCargo`.

## Cliente

### Movimientos

- `canMarkAsService(transaction)` en un módulo nuevo `client/src/cardServices.ts`: lo mismo que
  `canMarkAsSubscription` y además `currency === "ARS"`.
- `TransactionSheet`: botón «Es un servicio» debajo de «Es una suscripción», con el mismo estilo.
- `TransactionsTable`: botón de ícono `ElectricalServicesOutlined` junto al de suscripción, con
  `aria-label` «Marcar {comercio} como servicio».
- `TransactionsPage`: snackbar «Agregado a Servicios» o «No pudimos marcarlo como servicio», como el de
  suscripciones.
- Hooks `useCardServices`, `useMarkCardService` y `useUnmarkCardService` en `api/hooks.ts`. Marcar y
  quitar invalidan `card-services`, `subscriptions` y el Flujo. `useMarkSubscription` invalida también
  `card-services` y el Flujo.

### Servicios

- Sección «En la tarjeta» entre «Activos» y «Dados de baja», con tabla en escritorio y tarjetas en el
  celular, como las otras secciones. Columnas: Nombre, Tarjeta (`cardLabel`), Último cargo (fecha),
  Monto, y un botón «Quitar de Servicios» que pide confirmación: «¿Sacar «{nombre}» de Servicios? Sus
  cargos vuelven a contar en Tarjetas.»
- KPI «Por mes»: suma el `ultimoMonto` de cada servicio de tarjeta. «vigentes» los cuenta.
- La bajada pasa a: «Lo que pagás todos los meses: luz, gas, agua, internet, expensas. Cargá a mano lo que
  pagás fuera de la tarjeta; lo que llega en el resumen marcalo desde Movimientos con «Es un servicio». Se
  restan en el Flujo.»
- El vacío («Todavía no cargaste servicios…») se muestra solo si no hay servicios cargados ni de tarjeta.

### Flujo

`PROJECTION_CAPTION` dice que los servicios de la tarjeta van con el último cargo más la inflación
esperada del REM, en el mes en que vence su resumen.

## Tests

**Server, lógica pura**

- Cargos de un servicio: solo compras en pesos, en un pago, del grupo marcado; una marca con una variante
  del nombre vale para todo el grupo; `ultimoMonto` suma los cargos del último resumen.
- La agrupación extraída da los mismos grupos que hoy en la detección de suscripciones.
- `cashFlow.test.ts`:
  - un mes cerrado separa el cargo de servicio de Tarjetas y `egresos` no cambia;
  - el tope: con suscripciones y servicios en el mismo resumen, Tarjetas no queda negativa;
  - un mes estimado proyecta el servicio en el mes de pago de su tarjeta, con la inflación esperada
    compuesta por cada mes desde el último cargo;
  - una tarjeta con resumen ese mes no suma la proyección;
  - la nota de servicios aparece con servicios de tarjeta proyectados y no con solo la parte de un resumen.
- `subscriptions`: un comercio marcado como servicio no se detecta como suscripción, aunque tenga marca
  manual de suscripción; al quitar la marca de servicio vuelve a detectarse.

**Server, rutas**

- `POST /api/card-services`: marca, es idempotente, rechaza cuotas, dólares y movimientos de otro usuario,
  y deja intacta la marca de suscripción.
- `DELETE /api/card-services/:key` quita las marcas de todo el grupo, también la de una variante.
- `GET /api/card-services` devuelve el último cargo y no lista marcas sin cargos.
- `POST /api/subscriptions/manual` borra las marcas de servicio del grupo.
- `GET /api/cash-flow`: con un comercio marcado, sus cargos salen de Tarjetas y aparecen en Servicios.

**Shared:** `cardServiceDtoSchema` y `cardServiceInputSchema`.

**Cliente:** el botón en la hoja y en la tabla (solo en compras en pesos sin cuotas), el snackbar, la
sección «En la tarjeta» con su confirmación al quitar, el KPI con los servicios de tarjeta, la bajada y el
vacío.

**Verificación:** `bun run test` y `bun run typecheck` en verde. Chequeo contra una copia local de la base
(nunca escribiendo en Atlas): marcar un comercio de servicio y comparar `GET /api/cash-flow` antes y
después. En los meses con resumen, `egresos` igual y `tarjetas + servicios` igual que antes. En los
estimados, Servicios sube por el cargo proyectado.

## Fuera de alcance

- Cadencia bimestral o anual para servicios de tarjeta.
- Servicios de tarjeta en dólares.
- Restar las devoluciones de un servicio.
- Cambiar la categoría del movimiento al marcarlo.
- Mostrar en Movimientos si un comercio ya está marcado como servicio.
