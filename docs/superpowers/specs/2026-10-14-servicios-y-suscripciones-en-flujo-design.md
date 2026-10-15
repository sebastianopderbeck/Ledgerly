# Servicios y suscripciones en el flujo de caja — diseño

Fecha: 2026-10-14
Estado: en revisión.

## Objetivo

Que los egresos del flujo de caja incluyan lo que se paga todos los meses y hoy falta:

1. **Servicios fuera de la tarjeta** (luz, gas, agua, internet, celular, expensas). Se pagan por débito o
   transferencia, así que Ledgerly no los ve. Se cargan a mano en una página nueva, **Servicios**, y se
   restan en el flujo desde el mes que se elija.
2. **Suscripciones de tarjeta en la proyección.** Las suscripciones detectadas se cobran en la tarjeta,
   así que en los meses que ya tienen resumen están dentro de **Tarjetas**. Donde faltan es en los meses
   proyectados: después del último resumen, cada tarjeta se estima con «solo cuotas» y el margen
   proyectado sale más alto de lo real.

## Decisiones tomadas

- **Servicios: solo de acá en adelante.** Cada servicio cuenta desde su mes `desde`, que por defecto es
  el mes en que se carga. Los meses anteriores no cambian. Cuando ese mes cierra, el servicio sigue
  contando en él, así el margen no salta al cerrar.
- **Sin historial de montos.** Un servicio tiene un solo monto. Si se edita, cambia en todos los meses
  desde `desde`, también en los cerrados. Es la consecuencia aceptada de no guardar historial.
- **Baja sin perder el pasado.** Para dejar de pagar un servicio se completa `hasta`: sigue contando
  hasta ese mes. Borrar un servicio lo saca de todos los meses; sirve para corregir un error.
- **Cadencia mensual, bimestral o anual.** Gas y agua suelen facturarse cada dos meses, y el ABL se paga una
  vez por año. Uno bimestral se paga en `desde` y desde ahí cada 2 meses; uno anual, en `desde` y desde ahí
  cada 12 meses. En los dos casos el Flujo resta el total en el mes de pago, sin repartirlo.
- **Solo pesos.** Los servicios se cargan en ARS.
- **Proyección de servicios con la inflación esperada.** En el mes en curso y en los proyectados, el
  monto crece con la tasa mensual esperada que el flujo ya usa para el sueldo
  (`SalaryInflation.esperadaMensual`: el REM, o el último IPC si no hay REM, o 0). Se cuenta desde
  `montoDesde`, el mes en que se cargó o se editó el monto por última vez. En los meses cerrados va el
  monto plano.
- **Suscripciones dentro de Tarjetas.** En los meses con resumen ya están incluidas en el total del
  resumen, así que en los meses estimados se suman al piso de la tarjeta y no a una columna propia. La
  nota de la tarjeta pasa de «(solo cuotas)» a «(cuotas y suscripciones)».
- **Qué suscripciones entran.** Las activas y no ocultas: la misma regla que `summarizeSubscriptions`
  usa para el total de la página Suscripciones. Se extrae a `isCounted` y la usan los dos. Las ocultas no entran, así un cobro que ya cuenta en
  Hipoteca o Auto no se duplica.
- **Las suscripciones no se indexan.** Van con el monto del último cobro, como las cuotas. El precio ya
  se conoce, y si sube, el próximo resumen lo trae.
- **El dólar de las suscripciones** se pasa a pesos con la serie `usd_oficial` de `MacroSeries` a la
  fecha de hoy (`rateOnDate`). Es el mismo dólar que el flujo usa para los resúmenes, sin pedirle nada a
  la API. Si no hay cotización, la suscripción en USD no se suma y el mes lista «Cotización del dólar»
  como faltante.
- **El server arma, el cliente pinta**, como en el resto del flujo. Ubicar un cobro en su resumen
  necesita el cierre de cada tarjeta, que solo tiene el server.
- **Página propia.** Servicios va en «Más», en el grupo del día a día, después de Suscripciones.

## Datos

### Colección nueva: `FixedServiceModel`

En `server/src/db/models.ts`, colección `fixedservices`, con `timestamps: true` como `manualAssetSchema`.

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | string, requerido | 1 a 60 caracteres, sin espacios al borde |
| `monto` | number, requerido, > 0 | ARS |
| `cadencia` | `"mensual"` \| `"bimestral"` \| `"anual"` | default `"mensual"` |
| `desde` | string `YYYY-MM`, requerido | default: el mes actual |
| `hasta` | string `YYYY-MM` \| null | default `null` |
| `montoDesde` | string `YYYY-MM`, requerido | lo pone el server al crear y cada vez que cambia `monto` |

`montoDesde` no es editable desde la API.

### Schemas compartidos (`shared/src/dtos.ts`)

```ts
export const isoMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const fixedServiceCadenciaSchema = z.enum(["mensual", "bimestral", "anual"]);

export const fixedServiceDtoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  monto: z.number(),
  cadencia: fixedServiceCadenciaSchema,
  desde: isoMonthSchema,
  hasta: isoMonthSchema.nullable(),
  montoDesde: isoMonthSchema,
});

export const fixedServiceCreateSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  monto: z.number().positive(),
  cadencia: fixedServiceCadenciaSchema.optional(),
  desde: isoMonthSchema.optional(),
}).strict();

export const fixedServiceUpdateSchema = z.object({
  nombre: z.string().trim().min(1).max(60).optional(),
  monto: z.number().positive().optional(),
  cadencia: fixedServiceCadenciaSchema.optional(),
  desde: isoMonthSchema.optional(),
  hasta: isoMonthSchema.nullable().optional(),
}).strict();
```

Más los tipos `FixedServiceCadencia`, `FixedServiceDTO`, `FixedServiceCreateDTO` y `FixedServiceUpdateDTO`.

La regla `hasta ≥ desde` se valida en la ruta, porque en un PATCH hay que combinar el cuerpo con lo que
ya está guardado.

Cambios en schemas que ya existen:

- `cashFlowMonthSchema` suma `servicios: z.number()`.
- `subscriptionDtoSchema` suma `issuer: issuerSchema`. Así el flujo asocia cada suscripción a su
  tarjeta por emisor, que es la clave de los tracks de tarjeta, y no por `cardLabel`, que puede cambiar
  entre resúmenes. `subscriptionOf` lo toma del último cobro de la corrida.

## API

### `/api/fixed-services`

Router propio en `server/src/http/routes/fixedServices.ts`, montado en `app.ts`.

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/` | `FixedServiceDTO[]`: primero los activos (`hasta` null o ≥ mes actual), después los dados de baja; dentro de cada grupo, por `nombre` |
| POST | `/` | 201 con el DTO. 400 «Servicio inválido» si el cuerpo no valida |
| PATCH | `/:id` | 200 con el DTO. 400 «Servicio inválido» si el cuerpo no valida o si `hasta < desde` con los valores combinados. 404 «Servicio no encontrado». Si el cuerpo trae un `monto` distinto del guardado, `montoDesde` pasa al mes actual |
| DELETE | `/:id` | 204. 404 «Servicio no encontrado» |

Un `:id` que no es un ObjectId válido responde 404, igual que un id que no existe.

El mes actual es `new Date().toISOString().slice(0, 7)`, en UTC, igual que en el flujo.

### `GET /api/cash-flow`

- **Lectura de suscripciones compartida.** La lectura que hoy hace `GET /api/subscriptions` (transacciones
  sin cuotas de tipo `purchase`/`refund`, cierres por emisor, ocultas, marcadas a mano y cadencias) pasa a
  `server/src/http/loadSubscriptions.ts`:
  `loadSubscriptionInputs(hoy: string): Promise<{ txs: SubscriptionTx[]; ctx: Omit<SubscriptionContext, "cotizacion"> }>`.
  Cada ruta llama después a `detectSubscriptions(txs, { ...ctx, cotizacion })` con su cotización.
  `/api/subscriptions` corre la lectura en paralelo con `fetchOficialRate`, como hoy. El flujo le pasa
  `null`, porque no usa `montoMensualArs` y hace su propia conversión.
- **Servicios.** `FixedServiceModel.find().lean()`, mapeado a `CashFlowService`. Se mapea campo por campo,
  con defaults explícitos, porque `.lean()` no aplica los defaults del schema.
- **Cierre de la tarjeta.** `CashFlowCard` suma `closingDate: string`: el cierre del último resumen o, si
  no lo tiene, su vencimiento menos `DIAS_CIERRE_A_VENCIMIENTO`. `toCashFlowCard` ya devuelve `null` si
  no puede calcular el vencimiento; con el cierre pasa lo mismo.

## Cálculo (`server/src/stats/cashFlow.ts`)

### Entradas nuevas

```ts
export interface CashFlowService {
  monto: number;
  cadencia: FixedServiceCadencia;
  desde: string;
  hasta: string | null;
  montoDesde: string;
}

export interface CashFlowSubscription {
  issuer: string;
  moneda: Currency;
  monto: number;
  cadencia: Cadencia;
  proximoCobro: string;
}

export interface CashFlowInput {
  services?: CashFlowService[];
  subscriptions?: CashFlowSubscription[];
}
```

Los dos campos son opcionales, con default `[]`, para que los tests actuales no cambien. La ruta mapea
`SubscriptionDTO` a `CashFlowSubscription` con `montoActual` como `monto`, después de filtrar las
`activa` y no ocultas.

### Servicios

Un servicio **paga** en el mes `m` si se cumplen las tres:

- `desde ≤ m`;
- `hasta === null` o `m ≤ hasta`;
- `monthsBetween(desde, m) % MESES_SERVICIO[cadencia] === 0`, con `MESES_SERVICIO = { mensual: 1, bimestral: 2, anual: 12 }`
  exportado desde `shared/src/dtos.ts`, porque el cliente también lo usa para el equivalente mensual.

El monto en el mes `m`:

- **mes cerrado** (`m < mesActual`): `monto`;
- **mes en curso o proyectado**: `monto × (1 + esperadaMensual) ^ max(0, monthsBetween(montoDesde, m))`,
  con `esperadaMensual = input.inflacion?.esperadaMensual ?? 0`.

`servicios` del mes es la suma. En el mes en curso y en los proyectados, si `servicios > 0`, `estimados`
suma `estimadoServicios(esperadaMensual)`: «Servicios (último monto +2,1% por mes)», o
«Servicios (último monto)» si la tasa es 0. Reusa `detalleAumento`.

Los servicios no agregan faltantes y no cambian el estado de un mes cerrado.

### Suscripciones en los meses estimados de una tarjeta

Para cada tarjeta con `CashFlowCard` (último cierre `C`, mes de vencimiento del último resumen `B`) y cada
suscripción del mismo `issuer`:

1. Los cobros futuros caen en los meses `addMonths(proximoCobro, j × MESES_CADENCIA[cadencia])`, con
   `j = 0, 1, 2…`.
2. Cada cobro va al resumen `k = monthsBetween(C, mes del cobro) + (día(proximoCobro) > día(C) ? 1 : 0)` y
   se paga en el mes `addMonths(B, k)`. Se comparan los días nominales del mes, sin recortar fechas: con
   un cierre el 28–30 y un cobro a fin de mes, comparar fechas recortadas en los meses cortos duplicaba un
   cobro en un mes y vaciaba el siguiente.
3. Un cobro con `k < 1` se saltea: es del día del cierre o anterior, así que debería estar en un resumen ya
   importado.
4. Se generan cobros hasta pasar el último mes de la proyección.

En cada mes proyectado, el piso de una tarjeta estimada pasa a ser
`installmentFloor(card, mes) + suscripciones de esa tarjeta que se pagan en ese mes`. Las suscripciones
se suman solo a tarjetas **estimadas** ese mes. Un mes con resumen real no cambia.

Un monto en USD se multiplica por `rateOnDate(today, usdRates)`. Si la cotización es `null`, ese cobro
no se suma y el mes agrega `FALTA_COTIZACION` a `faltantes`, sin repetirlo.

La nota de la tarjeta estimada:

- con al menos una suscripción ese mes: `estimadoTarjetaConSuscripciones(cardLabel)` → «Visa (cuotas y
  suscripciones)»;
- si no: `estimadoTarjeta(cardLabel)` → «Visa (solo cuotas)», como hoy.

Las suscripciones no tocan los meses cerrados: ahí el total del resumen ya las incluye.

### Mes

En `closedMonth` y en `projectedMonth`:

```
egresos = tarjetas + hipoteca + auto + servicios
```

y el DTO suma `servicios`.

## Cliente

### Página Servicios (`client/src/pages/FixedServicesPage.tsx`, ruta `/servicios`)

- **Menú:** ítem «Servicios» en `navItems.ts`, grupo `dia-a-dia`, después de Suscripciones,
  `placement: "more"`, ícono `ElectricalServicesOutlined`. Ruta en `App.tsx`.
- **Encabezado** (en todos los estados): título «Servicios» y la bajada «Lo que pagás fuera de la
  tarjeta (luz, gas, agua, internet, expensas). Se restan en el Flujo desde el mes que elijas.»
- **Carga y error:** returns tempranos con el encabezado, como en las demás páginas.
- **Vacío:** «Todavía no cargaste servicios. Agregá la luz, el gas o internet para que se resten en el Flujo.»
  El botón «Agregar servicio» del encabezado sigue visible.
- **KPI:** «Por mes» (los activos que ya empezaron, con los bimestrales y los anuales prorrateados), «Por año» (el mensual
  × 12) y «Activos» (la cantidad de los que ya empezaron). Si hay servicios con «desde» en un mes futuro,
  el subtítulo de «Activos» dice cuántos empiezan más adelante. Son tres porque `KpiGrid` admite 3 o 4
  tarjetas.
- **Activos:** tabla en escritorio y tarjetas (`RecordCard`) en el celular, como Suscripciones. Columnas:
  Nombre, Monto, Cadencia, Desde, Por mes. Tocar una fila abre el editor.
- **Dados de baja:** sección aparte, atenuada, con «Hasta» en lugar de «Desde».
- **Botón «Agregar servicio»** arriba de la lista.
- **Editor** (`FixedServiceEditor` en `ResponsiveSheet`, con el mismo patrón de `ManualAssetEditor`,
  `useManualAssetForm` y `useManualAssetEditor`):
  - Nombre;
  - Monto (pesos, `inputMode="decimal"`);
  - Cadencia (toggle Mensual / Bimestral / Anual);
  - Desde (`type="month"`, por defecto el mes actual; si es bimestral, con la ayuda «El primer mes en que
    lo pagás»; si es anual, «El mes en que lo pagás»);
  - Hasta (`type="month"`, opcional, con la ayuda «Dejá vacío mientras lo sigas pagando»);
  - «Borrar», solo al editar, con la ayuda «Lo saca también de los meses pasados. Para dejar de pagarlo,
    completá Hasta.» Pide confirmación con `ConfirmDialog` («¿Borrar «Luz»? Se saca también de los meses
    pasados del Flujo.»), como Patrimonio;
  - el error del server en un `Alert`.
- **Hooks** (`client/src/api/hooks.ts`): `useFixedServices` (queryKey `["fixed-services"]`),
  `useCreateFixedService`, `useUpdateFixedService` y `useDeleteFixedService`. Las mutaciones invalidan
  `["fixed-services"]` y `["cash-flow"]`.
- **Lógica pura** (`client/src/fixedServices.ts`): equivalente mensual, `isActive(service, mesActual)`,
  la separación entre activos y dados de baja, y el total por mes.

### Flujo

- `CashFlowTable`: columna «Servicios» entre «Auto» y «Egresos».
- `CashFlowCards`: fila «Servicios» entre «Auto» y «Egresos».
- `CashFlowKpiCards`: el subtítulo de «Egresos conocidos» pasa a «tarjetas, hipoteca, auto y servicios».
- `CashFlowPage`:
  - la bajada pasa a «Lo que entra por sueldo menos lo que sale sí o sí: tarjetas, hipoteca, auto y
    servicios.»;
  - `PROJECTION_CAPTION` dice que las tarjetas van «con los resúmenes ya emitidos y, después, las cuotas
    que ya compraste y tus suscripciones», que los servicios van «con el último monto más la inflación
    esperada del REM», y cierra con «El margen es lo que te queda para consumos nuevos y gastos que no
    cargaste en Servicios.»
- El gráfico no cambia: `Egresos` ya incluye los servicios.

## Tests

**Server, lógica pura (`server/src/stats/cashFlow.test.ts`)**

- Servicios:
  - cuenta desde `desde` y no antes;
  - deja de contar después de `hasta`;
  - el bimestral cae cada 2 meses desde `desde`;
  - en los meses cerrados va con el monto plano;
  - en el mes en curso y en los proyectados va con la inflación, contada desde `montoDesde`;
  - la nota de servicios, con y sin tasa;
  - `egresos` incluye `servicios`;
  - un mes cerrado completo sigue completo.
- Suscripciones:
  - un cobro mensual cae en el mes de vencimiento del resumen que cierra después del cobro;
  - un cobro con fecha anterior o igual al último cierre se saltea;
  - un cobro anual cae solo en su mes;
  - una suscripción de otro emisor no se suma;
  - las de USD se convierten con la cotización de hoy;
  - las de USD sin cotización no se suman y el mes lista el faltante una sola vez;
  - la nota «(cuotas y suscripciones)»;
  - un mes con resumen real no cambia;
  - un resumen sin cierre usa el vencimiento menos 12 días.

**Server, rutas (mongodb-memory-server)**

- `fixedServices.test.ts`:
  - el CRUD completo;
  - los 400 por cuerpo inválido, por campos extra y por `hasta < desde` combinando el cuerpo con lo
    guardado;
  - el 404 por id inexistente o inválido;
  - `montoDesde` cambia solo si cambia el monto;
  - el orden de la lista;
  - un documento viejo sin `cadencia` ni `hasta`, insertado con `collection.insertOne`, se lee con los
    defaults.
- `cashFlow.test.ts` (ruta): un servicio y una suscripción de tarjeta aparecen en la respuesta.
- `subscriptions.test.ts`: sigue pasando después de mover la lectura a `loadSubscriptions.ts`, y el DTO
  trae `issuer`. Los fixtures de `SubscriptionDTO` en los tests del cliente suman `issuer`.

**Shared:** `dtos.test.ts` cubre `isoMonthSchema`, los tres schemas de servicios (con el `strict`) y
`servicios` en `cashFlowMonthSchema`.

**Cliente** (con `afterEach(cleanup)`)

- `fixedServices.test.ts`: los helpers.
- `FixedServicesPage.test.tsx`: los estados de carga, error y vacío; la lista; crear, editar y borrar;
  la sección de dados de baja.
- `CashFlowDetail.test.tsx`, `CashFlowDetailSection.test.tsx` y `CashFlowPage.test.tsx`: la columna o
  fila «Servicios» y los textos nuevos.
- `navItems.test.ts`, `MoreSheet.test.tsx`, `Layout.test.tsx` y `App.test.tsx`: el ítem y la ruta
  nuevos.
- `hooks.test.tsx`: las mutaciones invalidan `["fixed-services"]` y `["cash-flow"]`.

**Verificación**

- `bun run test` y `bun run typecheck` en verde.
- Un chequeo de solo lectura contra la base local: `createApp()` + supertest con
  `GET /api/cash-flow` y `GET /api/subscriptions`, comparados con el servicio en :4100. En los meses
  cerrados no tiene que cambiar nada; en los proyectados, Tarjetas tiene que subir por las suscripciones.

## Fuera de alcance

- Historial de montos de un servicio.
- Servicios en dólares.
- Alertas de vencimiento de servicios en Vencimientos.
- Incluir los servicios en el total de la página Suscripciones.
