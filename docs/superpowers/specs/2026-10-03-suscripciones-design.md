# Suscripciones y cobros recurrentes — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo)
Base: `feat/base-nuevas-features` (ver `2026-10-03-base-nuevas-features-design.md`)

## Objetivo

Agregar una página nueva —**Suscripciones**, ruta `/suscripciones`, en «Más»— que responda: **¿cuánto me cobran todos los meses sin que yo haga nada, y qué cambió?**

La página detecta sola los comercios que se cobran todos los meses en las tarjetas (streaming, apps, membresías, débitos automáticos). Para cada uno muestra:

- cuánto cuesta hoy, en su moneda y en pesos al oficial;
- la fecha del primer y del último cobro;
- si subió de precio («Subió 7,0% desde mayo de 2026»);
- si dejó de cobrarse.

Arriba van el total mensual y el anualizado.

No hay que cargar nada: todo sale de los movimientos ya importados. La única acción es **Ocultar** un cobro que no querés ver como suscripción.

## Lo que ya trae la base

La rama base dejó en su forma final todo lo compartido. Esta feature **no** toca:

| Pieza | Dónde |
|---|---|
| Ruta `/suscripciones` → `SubscriptionsPage` (hoy un stub con el `h4`) | `client/src/App.tsx` |
| Menú «Suscripciones» (`AutorenewOutlined`, `placement: "more"`) justo **después de Movimientos** y antes de Reglas, con sus tests | `client/src/components/layout/navItems.ts` |
| Router `subscriptionsRouter` montado en `/api/subscriptions` (hoy sin handlers) | `server/src/http/app.ts` |
| Modelo `HiddenSubscriptionModel` / `HiddenSubscriptionDoc` (`key` única, timestamp `hiddenAt`) | `server/src/db/models.ts` |
| DTOs `subscriptionIncreaseSchema`, `subscriptionDtoSchema`, `subscriptionsReportDtoSchema` y tipos `SubscriptionIncrease`, `SubscriptionDTO`, `SubscriptionsReportDTO`, con test | `shared/src/dtos.ts` |
| Hooks `useSubscriptions()` (`staleTime` 1 h) y `useSetSubscriptionHidden()` (`{ key, hidden }` → `PUT`/`DELETE /subscriptions/hidden/${encodeURIComponent(key)}`, invalida `["subscriptions"]`), con test | `client/src/api/hooks.ts` |
| Clave de comercio: `merchantWords`, `merchantKey`, `canonicalMerchantKeys`, `merchantDisplayName`, `merchantSearchTerm` (y `merchantMatchKey` de revisión-resumen), con tests | `server/src/stats/merchantKey.ts` |
| Fechas: `addMonthsClamped`, `addDays`, `daysBetween`, `monthOf`, `addMonths` | `server/src/stats/months.ts` |
| Link a Movimientos con orden fijo de parámetros (`year`, `category`, `currency`, `from`, `to`, `search`) | `client/src/filters/transactionsLink.ts` |
| `formatSignedPercent` | `client/src/format.ts` |

Lo que crea esta feature: `server/src/stats/subscriptions.ts` (+test), los handlers de `server/src/http/routes/subscriptions.ts` (+test), `client/src/subscriptions.ts` (+test), la página real `SubscriptionsPage` (+test) y los componentes `SubscriptionKpiCards`, `SubscriptionsTable`, `SubscriptionCards` y `HiddenSubscriptions`.

## Decisiones tomadas

- **Detección automática, sin alta manual.** No se usa la categoría «Suscripciones» de las reglas: la recurrencia sale de las fechas y los montos. La categoría solo se muestra como dato.
- **La racha se mide por mes calendario del cobro, no por resumen.** Los cierres se mueven (del 26 al 2 del mes siguiente), así que un resumen puede traer dos cobros mensuales y el siguiente ninguno. El mes de `date` es estable. Hace falta un cobro por mes durante **3 meses seguidos**.
- **Solo cadencia mensual.** Los planes anuales o semanales quedan afuera.
- **Todas las monedas de un comercio van juntas.** En los datos reales, dos suscripciones pasaron de cobrarse en pesos a cobrarse en dólares a mitad de año. Si se agrupara por moneda, la página anunciaría que «dejaron de cobrarse» cuando siguen activas.
- **El precio y el aumento se miden en la moneda del último cobro**, sin convertir el historial. Una suscripción en USD que no cambió en dólares no «subió», aunque el peso se haya devaluado.
- **Los pesos se calculan al oficial de hoy**, con `fetchOficialRate` (venta). Es la misma cotización de `/api/fx/oficial` y de la tarjeta «A pagar al cierre» del Dashboard. Los montos van **sin impuestos ni percepciones**: esos se cobran en líneas aparte (`type: "tax"`).
- **«Dejó de cobrarse» se decide contra el último resumen importado de esa tarjeta**, no contra la fecha de hoy. Si todavía no importaste el resumen que traería el cobro, la suscripción sigue activa.
- **Ocultar se guarda en Mongo**, no en `localStorage`, porque la app se usa desde la compu y desde el iPhone. Las ocultas no suman a los totales y se pueden volver a mostrar.
- **El débito del plan de ahorro del auto aparece como cobro recurrente**, porque lo es: entra a la tarjeta como compra común, sin «Cuota N/M». No se cruza automáticamente con `AutoCoupon`. Se saca con un clic en Ocultar.
- **El cálculo vive en el server** como función pura (`server/src/stats/subscriptions.ts`), igual que `futureInstallments.ts`, porque necesita todos los movimientos. El cliente solo arma secciones y textos (`client/src/subscriptions.ts`).
- **Sin filtros globales.** La página describe el estado actual, y la regla del filtro de año dice que «lo que describe el estado actual no se filtra». No se muestra `FiltersBar`.
- **Los umbrales son constantes** arriba del módulo, para ajustarlos al ver más datos (mismo criterio que `macroSignals.ts`).
- **Nombres:** la ruta de UI va en español (`/suscripciones`, como `/sueldo` y `/contexto`) y la API en inglés (`/api/subscriptions`, como `/api/credits`).
- **Fechas compartidas.** `subscriptions.ts` usa `addMonthsClamped`, `addDays` y `monthOf` de `months.ts` y re-exporta `addMonthsClamped` para que sus tests lo cubran desde la API del motor. `latestClosingByIssuer` queda en `subscriptions.ts`: la usa solo esta feature.
- **Ambigüedad mirando solo los meses posteriores.** El paso 7 mira los cobros de **meses posteriores** al último mes de la racha, no los posteriores por fecha. Un cobro suelto del mismo mes que el último cobro ya lo descartó `monthlyRuns`; si contara como «posterior», una compra suelta parecida en el mismo comercio escondería una suscripción activa.
- **Un mes raro cuesta dos pares.** `similarAmounts` cuenta pares de cobros consecutivos, así que un cobro raro en el medio de la racha rompe dos pares. Con cinco cobros, un mes raro se tolera en una punta (3 de 4 pares parecidos) pero no en el medio (2 de 4 no es más de la mitad); con seis o más cobros se tolera en cualquier lugar. En los datos reales el mes raro está dentro de una racha de 8 cobros (5 de 7 pares parecidos). Se prefiere esto a relajar el umbral, que haría pasar a la heladería (`[26300, 12600, 11600]`).
- **Cada crédito anula a lo sumo un débito, y cada débito se anula a lo sumo una vez.** Con dos cobros iguales y una sola devolución, uno de los cobros sigue contando.
- **La clave oculta se guarda recortada** (`key.trim()`), igual que la que calcula el server, que nunca tiene espacios en los extremos.
- **Montos en pesos redondeados al centavo.** `montoMensualArs` y los tres totales se redondean a 2 decimales, para que `12.99 × 1465` sea `19030.35` y no `19030.350000000002`.
- **El link a Movimientos del cliente se llama `subscriptionTransactionsLink(busqueda)`**, no `transactionsLink`, para no tapar el `transactionsLink` de la base que usa por dentro. Da `/transactions?year=all&search=STREAMFLIX` (orden fijo de la base).
- **`increaseShortLabel` usa `formatSignedPercent`** de la base: `"+10,0%"`.
- **Sin gráficos.** El KPI del Dashboard y el gráfico de evolución quedan fuera de alcance; los KPIs usan el `Kpi` compartido.

### Validación contra los datos reales

El algoritmo de abajo se probó en modo solo lectura contra la base local: 16 resúmenes (8 por tarjeta, de enero a agosto de 2026) y unos 840 movimientos.

**Lo que detecta.** Encuentra 5 cobros recurrentes y ningún falso positivo:

- tres en USD, de los cuales dos se cobraban en pesos hasta mayo;
- uno en pesos, con un aumento del 7 %;
- el débito del plan de ahorro.

**Lo que descarta.** Comercios de uso frecuente (transporte, delivery, cafés, supermercado) y una heladería con dos visitas de monto igual.

**Verificación de la implementación (2026-10-03).** El motor implementado, corrido en modo solo lectura contra la misma base (16 resúmenes, 628 movimientos de consumo o devolución), da los mismos 5 cobros, todos activos. Además del 7 % en pesos, informa dos aumentos: el plan de ahorro (+20,8 %, el valor móvil) y una de las que pasaron a USD (+48,9 %, de 4,66 a 6,94 USD entre junio y julio). Ese último sale de medir solo en la moneda nueva con dos cobros; si julio fue el mes con impuestos incluidos, desaparece solo con el cobro de agosto.

**Casos reales que fijaron decisiones:**

- **Anulación:** un cobro y su devolución al día siguiente. Sin el paso de anulaciones, ese mes tenía dos cobros y partía la racha.
- **Mes con impuestos incluidos:** un mes el cobro vino con los impuestos dentro (+51 %). Por eso se tolera un mes raro.
- **Descriptor truncado:** un mismo servicio aparece con el nombre entero algunos meses y truncado otros. Por eso se fusionan las claves que difieren solo por truncado.

## Datos

### Lo que se lee

| Fuente | Archivo | Campos |
|---|---|---|
| `TransactionModel` | `server/src/db/models.ts` | `date`, `merchant`, `amount`, `currency`, `direction`, `type`, `isInstallment`, `category`, `issuer`, `cardLabel` |
| `StatementModel` | `server/src/db/models.ts` | `issuer`, `closingDate` |
| `HiddenSubscriptionModel` | `server/src/db/models.ts` | `key` |
| Dólar oficial de hoy | `server/src/fx/dollarRate.ts` → `fetchOficialRate(hoy)` | `venta`, con hasta 7 días hacia atrás; `null` si falla |

La query de movimientos es `TransactionModel.find({ isInstallment: false, type: { $in: ["purchase", "refund"] } }).lean()`.

### Qué cuenta como consumo

| Movimiento | Entra | Por qué |
|---|---|---|
| `type: "purchase"`, `direction: "debit"`, `isInstallment: false`, `amount > 0` | sí | consumo |
| `isInstallment: true` | no | cuotas: tienen su página |
| `type` `payment`, `tax`, `fee`, `adjustment` | no | pagos de la tarjeta, IVA a servicios digitales y percepciones: no son consumo |
| `direction: "credit"` con `type` `purchase` o `refund` | solo para anular | devoluciones (ver «Anulaciones») |

### Cómo vienen los comercios

`merchant` sale de `normalizeMerchant` (`server/src/parsers/normalize.ts`). Esa función saca montos, cuotas y prefijos de procesadores (`MERPAGO*`, `DLO*`, `PAYU*AR*`…), pero no saca los IDs. Por eso el mismo servicio aparece distinto cada mes. Los ejemplos tienen la forma real con nombres inventados:

- **ID de transacción al final**, distinto cada mes: `STREAMFLIX.COM 58141049416586488`, `STREAMFLIX.COM ydnBWjd7S`.
- **Comprobante pegado adelante:** el `ROW` de `visaSignature.ts` solo separa comprobantes con sufijo `*`, `F` o `K`, así que `081419Q STREAMFLIX.COM LYXdQ0WEI5` queda entero.
- **Puntuación y mayúsculas:** `Streamflix com` frente a `STREAMFLIX.COM`, y `APPCLOUD.COM/BILL` frente a `APPCLOUD.COM BILL MLV4JWFSG`.
- **Truncado:** `GOOGLE *VideoP X1y2Z3` frente a `GOOGLE *VideoPremium`.

Por eso hace falta una clave de comercio, que ya trae la base en `merchantKey.ts`.

### Lo que se escribe: colección `HiddenSubscription` (ya en la base)

`key` es la clave canónica del comercio. Borrar resúmenes o movimientos no toca esta colección: si el comercio vuelve a aparecer, sigue oculto. No hay backfill ni script nuevo.

## Cálculo

### `server/src/stats/merchantKey.ts` (de la base, no se modifica)

| Función | Qué hace |
|---|---|
| `merchantKey(merchant)` | Mayúsculas, sin tildes, puntuación como espacio, sin palabras con dígitos ni `USD`; las `PALABRAS_CLAVE = 2` primeras palabras. `""` si no queda ninguna (el movimiento se ignora) |
| `canonicalMerchantKeys(keys)` | Fusiona las claves que difieren solo por truncado de la última palabra (misma cantidad de palabras, prefijo de al menos `MIN_PREFIJO = 4` letras). Devuelve `Map<clave cruda, clave canónica>` |
| `merchantDisplayName(merchant)` | El comercio sin las palabras con dígitos: `STREAMFLIX.COM 677290205` → `STREAMFLIX.COM` |
| `merchantSearchTerm(merchants)` | Prefijo común sin comprobante inicial ni separadores al final; si queda con menos de 3 caracteres, `merchantDisplayName(merchants[0])` |

| `merchant` | clave |
|---|---|
| `STREAMFLIX.COM 58141049416586488` | `STREAMFLIX COM` |
| `081419Q STREAMFLIX.COM LYXdQ0WEI5` | `STREAMFLIX COM` |
| `Streamflix com` | `STREAMFLIX COM` |
| `APPCLOUD.COM/BILL` y `APPCLOUD.COM BILL MLV4JWFSG` | `APPCLOUD COM` |
| `GOOGLE *VideoP X1y2Z3` | `GOOGLE VIDEOP` |
| `GOOGLE *VideoPremium` | `GOOGLE VIDEOPREMIUM` → canónica `GOOGLE VIDEOP` |
| `PEDIDOSYA PLUS` y `PEDIDOSYA PROPINA` | distintas |
| `123456` | `""` |

### `server/src/stats/subscriptions.ts` (nuevo)

```ts
export const MIN_COBROS = 3;
export const VARIACION_PARECIDA = 0.25;
export const MISMO_MONTO = 0.01;
export const UMBRAL_AUMENTO = 0.05;
export const VENTANA_AUMENTO_MESES = 12;
export const GRACIA_DIAS = 7;
export const VENTANA_CORTADAS_MESES = 12;
export const DIAS_ANULACION = 15;

export { addMonthsClamped } from "./months.js";

export interface SubscriptionTx {
  date: string;
  merchant: string;
  amount: number;
  currency: Currency;
  direction: Direction;
  type: TxType;
  isInstallment: boolean;
  category: string;
  issuer: Issuer;
  cardLabel: string;
}

export interface SubscriptionContext {
  hoy: string;
  ultimoCierre: Partial<Record<Issuer, string>>;
  ocultas: ReadonlySet<string>;
  cotizacion: number | null;
}

export interface Charge extends SubscriptionTx {
  key: string;
}

export function latestClosingByIssuer(statements: { issuer: string; closingDate: Date | null }[]): Partial<Record<Issuer, string>>
export function removeRefunded(debits: Charge[], credits: Charge[]): Charge[]
export function monthlyRuns(charges: Charge[]): Charge[][]
export function similarAmounts(run: Charge[]): boolean
export function priceIncrease(run: Charge[]): SubscriptionIncrease | null
export function detectSubscriptions(txs: SubscriptionTx[], ctx: SubscriptionContext): SubscriptionDTO[]
export function summarizeSubscriptions(items: SubscriptionDTO[]): Pick<SubscriptionsReportDTO, "totalMensualArs" | "totalMensualUsd" | "totalAnualArs">
```

Fechas como `string` `YYYY-MM-DD` y meses como `YYYY-MM`, con aritmética en UTC (la de `months.ts`). Dos definiciones que se usan en todo el algoritmo:

- **Montos parecidos:** misma moneda y `|ln(b / a)| ≤ ln(1 + VARIACION_PARECIDA)`.
- **`addMonthsClamped`:** recorta el día al último día del mes destino. Por ejemplo, `addMonthsClamped("2026-01-31", 1) = "2026-02-28"` y `addMonthsClamped("2026-03-31", -1) = "2026-02-28"`.

#### Paso a paso de `detectSubscriptions`

1. **Separar movimientos.**
   - Débitos elegibles: `type === "purchase"`, `direction === "debit"`, `!isInstallment` y `amount > 0`.
   - Créditos: `direction === "credit"` y `type` `purchase` o `refund`.
   - A todos se les calcula `merchantKey` y se descartan los de clave `""`. Después se canonizan juntos con `canonicalMerchantKeys` y cada `Charge` lleva su clave canónica.
2. **Anulaciones (`removeRefunded`).** Cada crédito busca el débito que cumple todo esto:
   - misma clave y misma moneda;
   - `|monto − crédito| ≤ 0,01`;
   - fecha entre 0 y `DIAS_ANULACION` días antes del crédito;
   - todavía no anulado por otro crédito.

   Si hay varios, toma el más cercano en fecha (el más reciente). Ese débito sale del análisis (el crédito nunca entra). Una devolución parcial no anula nada.
3. **Agrupar** los débitos por clave canónica. Para saber si un comercio está oculto (paso 9), el grupo recuerda también las claves crudas que se fusionaron en él.
4. **Rachas (`monthlyRuns`).** Se ordenan los cobros por fecha y se agrupan por mes (`monthOf(date)`). Después se recorren los meses en orden, manteniendo una racha:
   - Si el mes no es el siguiente al último mes de la racha, la racha se cierra y empieza una nueva.
   - Si el mes tiene **un solo cobro**, ese cobro entra a la racha.
   - Si el mes tiene **varios cobros**, entra el que tenga la misma moneda que el último de la racha y un monto a `MISMO_MONTO` (±1 %) o menos; si hay varios, el más cercano en monto (y, si empatan, el primero por fecha). Los demás son compras sueltas y se ignoran. Si ninguno repite el monto, o si la racha está vacía, la racha se cierra y ese mes no empieza ninguna.

   La función devuelve todas las rachas no vacías.
5. **Racha válida:** tiene `length ≥ MIN_COBROS` y cumple `similarAmounts(run)`. `similarAmounts` mira los pares de cobros consecutivos **de la misma moneda** y exige que **más de la mitad** tengan montos parecidos. Los pares con cambio de moneda no cuentan, y si no queda ningún par devuelve `false`. Esta regla tolera un mes raro en una punta de cinco cobros o en cualquier lugar de seis o más (ver «Un mes raro cuesta dos pares»), pero rechaza dos visitas de monto igual precedidas de una distinta (1 de 2 pares no alcanza).
6. **Elegir** la **última** racha válida del grupo. Si no hay ninguna, el comercio no es recurrente.
7. **Ambigüedad.** Si en algún **mes posterior** al mes del último cobro de esa racha hay un cobro del grupo en la misma moneda y con monto parecido, el comercio **se omite**. Ese patrón aparece cuando falta importar un resumen: la racha se corta y lo que vino después todavía no llega a 3 meses. Es preferible no mostrarlo a anunciar falsamente que «dejó de cobrarse». Cuando se importa lo que falta, o cuando pasan 3 meses, vuelve a aparecer.
8. **Derivados** de la racha `r` (con `u = r.at(-1)`):
   - `key` = la clave canónica del grupo;
   - `nombre = merchantDisplayName(u.merchant)` y `busqueda = merchantSearchTerm(r.map((c) => c.merchant).reverse())`;
   - `categoria`, `cardLabel` y el emisor salen de `u`;
   - `moneda = u.currency` y `montoActual = u.amount`;
   - `primerCobro = r[0].date`, `ultimoCobro = u.date` y `proximoCobro = addMonthsClamped(u.date, 1)`;
   - `cobros = r.length`;
   - `monedaAnterior`: la otra moneda si aparece en `r`, si no `null`;
   - `aumento = priceIncrease(r)`.
9. **Estado y visibilidad:**
   - Con `cierre = ctx.ultimoCierre[u.issuer]`, el estado es `"cortada"` si existe `cierre` y `addDays(proximoCobro, GRACIA_DIAS) < cierre`. Si no, es `"activa"`.
   - Una suscripción cortada con `ultimoCobro < addMonthsClamped(ctx.hoy, -VENTANA_CORTADAS_MESES)` se descarta.
   - `oculta` es `true` si la clave canónica o cualquier clave cruda del grupo está en `ctx.ocultas`.
10. **Pesos:** `montoMensualArs` vale `montoActual` si la moneda es `ARS`. Si es `USD`, vale `montoActual × ctx.cotizacion`, o `null` si no hay cotización.
11. **Orden:**
    - Primero van las activas, por `montoMensualArs` descendente (las `null` al final) y después por `nombre` con `localeCompare`.
    - Después van las cortadas, por `ultimoCobro` descendente.

#### `priceIncrease(run)`

```
u            = run.at(-1)
segmento     = cola de run con currency === u.currency
desdeFecha   = addMonthsClamped(u.date, -VENTANA_AUMENTO_MESES)
referencia   = primer cobro del segmento con date ≥ desdeFecha
variacion    = u.amount / referencia.amount − 1
aumento      = variacion ≥ UMBRAL_AUMENTO
               ? { variacion, desde: monthOf(referencia.date), montoAnterior: referencia.amount }
               : null
```

`variacion` es una fracción (`0.1002`), igual que `variacionNetoMensual` en Sueldo. Las bajas no se informan. Si el segmento tiene un solo cobro (la moneda cambió en el último mes), `aumento` es `null`.

#### `summarizeSubscriptions(items)`

Solo cuentan las suscripciones con `estado === "activa"` y `!oculta`:

- `totalMensualArs = Σ (montoMensualArs ?? 0)`;
- `totalMensualUsd = Σ montoActual` de las que tienen `moneda === "USD"`;
- `totalAnualArs = totalMensualArs × 12`.

#### `latestClosingByIssuer(statements)`

Devuelve el `closingDate` máximo de cada `issuer` como ISO `YYYY-MM-DD`. Los resúmenes con `closingDate: null` o con un `issuer` desconocido no cuentan.

### Casos borde

| Situación | Resultado |
|---|---|
| Sin movimientos o sin resúmenes | `items: []` y totales en 0 |
| Dos meses seguidos de un mismo cobro | No alcanza: hacen falta 3 |
| Un mes con el cobro y una compra suelta en el mismo comercio | Sigue la racha si el cobro repite el monto (±1 %) |
| Un mes con un cobro de precio nuevo y una compra suelta | Se corta la racha (no hay forma de saber cuál es cuál) |
| Una compra suelta parecida en el mismo mes que el último cobro | No dispara la ambigüedad: la suscripción se muestra |
| Cobro y devolución por el mismo monto en ≤ 15 días | Se anulan los dos |
| Dos cobros iguales y una sola devolución | Se anula uno solo |
| Pasa de cobrarse en ARS a USD | Una sola suscripción, `moneda: "USD"`, `monedaAnterior: "ARS"` y aumento medido solo en USD |
| Un mes con monto muy distinto (impuestos incluidos) | Se tolera si más de la mitad de los pares son parecidos |
| Un resumen sin importar en el medio | La racha se corta. Si lo posterior es parecido, el comercio se omite hasta que haya 3 meses seguidos o se importe lo que falta |
| El próximo cobro esperado cae después del último cierre (cobra el 28 y cerró el 27) | Activa |
| Tarjeta sin `closingDate` en sus resúmenes | Nunca se marca cortada |
| Sin cotización | `cotizacionOficial: null`, `montoMensualArs: null` en las USD, que no suman a `totalMensualArs` (sí a `totalMensualUsd`) |
| Cobro el 31 | `proximoCobro` se recorta al último día del mes siguiente |
| Cortada hace más de 12 meses | No se lista |
| Oculta y cortada a la vez | Solo aparece en «Ocultas»; no cuenta en «Dejaron de cobrarse» |

## API

### Shared (`shared/src/dtos.ts`, de la base)

```ts
export const subscriptionIncreaseSchema = z.object({
  variacion: z.number(),
  desde: z.string(),
  montoAnterior: z.number(),
});

export const subscriptionDtoSchema = z.object({
  key: z.string(),
  nombre: z.string(),
  busqueda: z.string(),
  categoria: z.string(),
  cardLabel: z.string(),
  moneda: currencySchema,
  montoActual: z.number(),
  montoMensualArs: z.number().nullable(),
  primerCobro: z.string(),
  ultimoCobro: z.string(),
  proximoCobro: z.string(),
  cobros: z.number().int().positive(),
  estado: z.enum(["activa", "cortada"]),
  oculta: z.boolean(),
  aumento: subscriptionIncreaseSchema.nullable(),
  monedaAnterior: currencySchema.nullable(),
});

export const subscriptionsReportDtoSchema = z.object({
  cotizacionOficial: z.number().nullable(),
  totalMensualArs: z.number(),
  totalMensualUsd: z.number(),
  totalAnualArs: z.number(),
  items: z.array(subscriptionDtoSchema),
});
```

### Endpoints (`server/src/http/routes/subscriptions.ts`)

El router ya está montado en `server/src/http/app.ts` (`app.use("/api/subscriptions", subscriptionsRouter)`). Esta feature le agrega los handlers:

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/subscriptions` | `200` con `SubscriptionsReportDTO`. Nunca `204`: sin datos devuelve `items: []` |
| `PUT` | `/api/subscriptions/hidden/:key` | `204`. Es idempotente: `updateOne({ key }, { $setOnInsert: { key } }, { upsert: true })` con la clave recortada. Responde `400` «Clave inválida» si `key.trim()` está vacía o tiene más de 60 caracteres |
| `DELETE` | `/api/subscriptions/hidden/:key` | `204`, también idempotente (`deleteOne` con la clave recortada) |

El `GET` sigue estos pasos:

1. Calcula `hoy = new Date().toISOString().slice(0, 10)`.
2. Con `Promise.all`, trae:
   - los movimientos (query de «Datos»);
   - `StatementModel.find({}, { issuer: 1, closingDate: 1 }).lean()`;
   - `HiddenSubscriptionModel.find().lean()`;
   - `fetchOficialRate(hoy)`.
3. Mapea cada movimiento a `SubscriptionTx`, con `date.toISOString().slice(0, 10)`.
4. Llama a `detectSubscriptions(txs, { hoy, ultimoCierre: latestClosingByIssuer(statements), ocultas: new Set(hidden.map((h) => h.key)), cotizacion })`.
5. Responde `{ cotizacionOficial: cotizacion, ...summarizeSubscriptions(items), items }`.

La ruta no lleva mapper.

Ejemplo de respuesta, con datos sintéticos:

```json
{
  "cotizacionOficial": 1465,
  "totalMensualArs": 24520.35,
  "totalMensualUsd": 12.99,
  "totalAnualArs": 294244.2,
  "items": [
    {
      "key": "STREAMFLIX COM", "nombre": "STREAMFLIX.COM", "busqueda": "STREAMFLIX",
      "categoria": "Suscripciones", "cardLabel": "Visa Signature ****1234",
      "moneda": "USD", "montoActual": 12.99, "montoMensualArs": 19030.35,
      "primerCobro": "2026-01-09", "ultimoCobro": "2026-08-09", "proximoCobro": "2026-09-09",
      "cobros": 8, "estado": "activa", "oculta": false, "aumento": null, "monedaAnterior": "ARS"
    },
    {
      "key": "MUSICAPP", "nombre": "MUSICAPP", "busqueda": "MUSICAPP",
      "categoria": "Suscripciones", "cardLabel": "ICBC",
      "moneda": "ARS", "montoActual": 5490, "montoMensualArs": 5490,
      "primerCobro": "2026-03-12", "ultimoCobro": "2026-08-12", "proximoCobro": "2026-09-12",
      "cobros": 6, "estado": "activa", "oculta": false,
      "aumento": { "variacion": 0.1002, "desde": "2026-03", "montoAnterior": 4990 }, "monedaAnterior": null
    }
  ]
}
```

### Client (`client/src/api/hooks.ts`, de la base)

`useSubscriptions()` con `staleTime` de 1 h (como `useMonthlyUsd`: evita pedir la cotización en cada visita) y `useSetSubscriptionHidden()`. Importar, recategorizar o borrar movimientos ya invalidan todas las queries.

## UI

### Lógica pura del cliente: `client/src/subscriptions.ts` (nuevo)

```ts
export interface SubscriptionSections {
  activas: SubscriptionDTO[];
  cortadas: SubscriptionDTO[];
  ocultas: SubscriptionDTO[];
  subieron: number;
  ahorroMensualArs: number;
  conUsd: boolean;
}

export type SubscriptionVariant = "activas" | "cortadas";

export interface SubscriptionListProps {
  items: SubscriptionDTO[];
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
}

export const AMOUNT_LABEL: Record<SubscriptionVariant, string>;

export function subscriptionSections(items: SubscriptionDTO[]): SubscriptionSections
export function subscriptionMeta(item: Pick<SubscriptionDTO, "cardLabel" | "categoria">): string
export function increaseLabel(aumento: SubscriptionIncrease): string
export function increaseShortLabel(aumento: SubscriptionIncrease): string
export function increaseDetail(aumento: SubscriptionIncrease, montoActual: number, moneda: Currency): string
export function increaseSinceDetail(aumento: SubscriptionIncrease, montoActual: number, moneda: Currency): string
export function previousCurrencyLabel(moneda: Currency): string
export function activeCountLabel(count: number): string
export function monthlyKpiSub(activas: number, totalMensualUsd: number, cotizacion: number | null): string
export function subscriptionTransactionsLink(busqueda: string): string
```

- `subscriptionSections` separa las ocultas (cualquier estado) y, entre las visibles, las activas y las cortadas, respetando el orden del server.
  - `subieron` cuenta las activas visibles con `aumento`.
  - `ahorroMensualArs` es `Σ (montoMensualArs ?? 0)` de las cortadas visibles.
  - `conUsd` es `true` si alguna activa visible se cobra en USD (para la aclaración de la cotización).
- `increaseLabel` → `"Subió 10,0% desde marzo de 2026"`. Usa `formatPercent(variacion * 100)` y `formatMonthLabel(desde).toLowerCase()`.
- `increaseShortLabel` → `"+10,0%"` (`formatSignedPercent(variacion * 100)`).
- `subscriptionMeta` → `"ICBC · Suscripciones"` (`"{cardLabel} · {categoria}"`), para la tabla y las tarjetas.
- `AMOUNT_LABEL` → `"Por mes"` en activas y `"Último monto"` en cortadas.
- `increaseDetail` → `"$ 4.990 → $ 5.490"`: el `title` del chip.
- `increaseSinceDetail` → `"$ 4.990 → $ 5.490 desde marzo de 2026"`: el detalle «Aumento» de la tarjeta.
- `previousCurrencyLabel("ARS")` → `"Antes se cobraba en pesos"`; con `"USD"` → `"Antes se cobraba en dólares"`.
- `activeCountLabel(1)` → `"1 activa"`; `activeCountLabel(3)` → `"3 activas"`.
- `monthlyKpiSub` arma el sub del KPI «Por mes»: `"3 activas"`, más `" · incluye US$ 12,99 al oficial"` si hay USD y cotización, o `" · sin cotización para US$ 12,99"` si hay USD y no hay cotización.
- `subscriptionTransactionsLink("STREAMFLIX")` → `"/transactions?year=all&search=STREAMFLIX"` (con `transactionsLink({ year: ALL_YEARS, search })` de la base). Movimientos sin `currency` en la URL muestra todas las monedas.

### Página `client/src/pages/SubscriptionsPage.tsx` (reemplaza el stub)

La página usa `useSubscriptions()`, `useSetSubscriptionHidden()`, `useIsMobile()` y `useMemo(() => subscriptionSections(items))`. Los handlers `hide(key)` y `show(key)` van con `useCallback` porque se pasan a la tabla, a las tarjetas y a las ocultas. Carga y error se resuelven con early returns, y el `h4` se ve siempre (lo exige `App.test.tsx`).

De arriba hacia abajo:

1. **Título** `h4` «Suscripciones». Debajo, una bajada en `text.secondary`: «Cobros que se repiten todos los meses en tus tarjetas: al menos 3 meses seguidos, con montos parecidos. No incluye cuotas ni impuestos.»
2. **Carga:** `CircularProgress`. **Error:** «No pudimos calcular las suscripciones.»
3. **Vacío** (`items.length === 0`): «No encontramos cobros recurrentes. Hacen falta al menos 3 meses seguidos con un cobro del mismo comercio; importá más resúmenes desde Importar.»
4. **`SubscriptionKpiCards`** (nuevo), dentro de un `KpiGrid` con `cardCount={4}` y usando el `Kpi` compartido:

   | Label | Valor | Sub | Ícono / color |
   |---|---|---|---|
   | Por mes | `totalMensualArs` (ARS) | `monthlyKpiSub(...)` (`subMultiline`) | `AutorenewOutlined` / `primary` |
   | Por año | `totalAnualArs` (ARS) | «al precio de hoy» | `EventRepeatOutlined` / `secondary` |
   | Subieron | `subieron` (`format: (v) => String(Math.round(v))`) | «en los últimos 12 meses» | `TrendingUpOutlined` / `warning` |
   | Dejaron de cobrarse | `cortadas.length` | `"$ X menos por mes"` si `ahorroMensualArs > 0`, si no «en los últimos 12 meses» | `CancelOutlined` / `success` |

5. **«Activas»** (`h6`): en compu `SubscriptionsTable` y en mobile `SubscriptionCards`, las dos con `variant="activas"`. Si no hay activas visibles: «No hay cobros recurrentes activos.» Debajo, cuando hay alguna en USD y hay cotización, una línea en `caption`: «Dólares al oficial de hoy ($ 1.465), sin impuestos ni percepciones.»
6. **«Dejaron de cobrarse»** (`h6`), solo si hay cortadas visibles. Bajada: «Sin cobro en el último resumen de la tarjeta.» Abajo, tabla o tarjetas con `variant="cortadas"`.
7. **`HiddenSubscriptions`** (nuevo), solo si hay ocultas: un `Accordion` cerrado titulado `"Ocultas ({n})"`, con la bajada «No se suman a los totales.». Cada fila muestra `nombre`, `montoActual` en su moneda y un botón «Mostrar» (`aria-label="Mostrar {nombre}"`, con `tapTargetSx`).

Todo lo animado usa `MotionBox`, `staggerContainer` y `fadeUpItem`, como en las demás páginas.

### Compu: `client/src/components/SubscriptionsTable.tsx` (nuevo)

Usa `Table` de MUI con `MotionTableBody` y `MotionTableRow`, como `PayslipsTable`. No usa DataGrid porque son pocas filas. Props: `{ items: SubscriptionDTO[]; variant: "activas" | "cortadas"; onHide: (key: string) => void }`.

| Columna | Contenido |
|---|---|
| Comercio | `nombre` (600). Debajo, en `caption`, `"{cardLabel} · {categoria}"`, y en otra línea `previousCurrencyLabel(monedaAnterior)` si corresponde |
| Por mes (activas) / Último monto (cortadas) | `formatMoney(montoActual, moneda)`, alineado a la derecha |
| En pesos | `formatMoneyOrDash(montoMensualArs, "ARS")`, alineado a la derecha |
| Desde | `primerCobro` |
| Último cobro | `ultimoCobro`. En activas, debajo y en `caption`: `"próximo ~{proximoCobro}"` |
| Variación (solo activas) | `Chip` `size="small"` `color="warning"` con `increaseLabel(aumento)`. El `title` lleva `increaseDetail(...)`. Sin aumento: «—» |
| (acciones) | `IconButton` con `VisibilityOffOutlined` (`aria-label="Ocultar {nombre}"`, `Tooltip` «Ocultar: no es una suscripción») y otro con `ReceiptLongOutlined`, que es `component={RouterLink}` a `subscriptionTransactionsLink(busqueda)` (`aria-label="Ver movimientos de {nombre}"`) |

Ocultar no pide confirmación: se deshace desde «Ocultas».

### Mobile: `client/src/components/SubscriptionCards.tsx` (nuevo)

Lista de `RecordCard` dentro de `recordListSx`, con las mismas props que la tabla. Cada tarjeta lleva:

- `title={nombre}` y `meta={"{cardLabel} · {categoria}"}`;
- `badge`: un `Chip` `warning` con `increaseShortLabel(aumento)` si hay aumento;
- `action`: el `IconButton` de Ocultar con `iconTapTargetSx`;
- `highlights`: «Por mes» (o «Último monto») con `formatMoney(montoActual, moneda)`, y «En pesos» con `formatMoneyOrDash(montoMensualArs, "ARS")`.

Los `details` («Ver detalle») son:

- Desde;
- Último cobro;
- Próximo cobro (solo activas);
- Cobros (`cobros`);
- Aumento (`increaseSinceDetail`), solo si hay;
- Moneda (`previousCurrencyLabel`), solo si hay;
- Movimientos: un `Link component={RouterLink}` «Ver movimientos» con `tapTargetSx` (`aria-label="Ver movimientos de {nombre}"`).

## Tests

Con TDD: cada pieza arranca con un test en rojo. Todos los fixtures son sintéticos (comercios inventados con la forma real de los descriptores). Los archivos con varios renders llevan `afterEach(cleanup)`, porque en este repo el auto-cleanup de RTL está apagado.

Ya cubiertos por la base (no se tocan): `merchantKey.test.ts`, `months.test.ts`, `subscriptionsReportDtoSchema` en `dtos.test.ts`, `useSetSubscriptionHidden` en `hooks.test.tsx`, la ruta en `App.test.tsx` y el menú en `navItems.test.ts`, `MoreSheet.test.tsx` y `Layout.test.tsx`.

**`server/src/stats/subscriptions.test.ts`**

- Detección de racha:
  - 3 meses seguidos con el mismo monto detecta; 2 no alcanzan;
  - un mes vacío en el medio corta la racha;
  - un mes con dos cobros sigue la racha solo si uno repite el monto (±1 %);
  - un mes con varios cobros al empezar no empieza racha;
  - `removeRefunded` anula débito y crédito iguales en ≤ 15 días; un crédito parcial no anula; un crédito anterior al débito no anula; dos débitos iguales y un crédito anulan uno solo.
- Movimientos excluidos: cuotas, `tax`, `payment` y créditos.
- Montos parecidos:
  - un mes con +51 % en la punta de cinco se tolera; en el medio de seis también;
  - `[26300, 12600, 11600]` se rechaza (1 de 2 pares parecidos);
  - los pares con cambio de moneda no cuentan.
- Cambio de moneda ARS→USD: una sola suscripción, con `monedaAnterior: "ARS"` y `aumento` medido solo en USD.
- Aumentos:
  - `priceIncrease` de `[4990, 4990, 5490]` da `variacion ≈ 0.1002` desde el primer mes;
  - +3 % → `null`; una baja → `null`;
  - la referencia se limita a los últimos 12 meses;
  - un solo cobro en la moneda nueva → `null`.
- Estado y fechas:
  - cortada si `proximoCobro + 7 < último cierre del emisor`;
  - activa si el próximo cobro cae después del cierre (cobra el 28 y cerró el 27);
  - activa si no hay cierre;
  - ambigüedad (racha válida, mes faltante y cobros parecidos después) → se omite;
  - una compra suelta parecida en el mismo mes del último cobro no dispara la ambigüedad;
  - cortadas de hace más de 12 meses no se listan;
  - `addMonthsClamped` con 31 → 28 y con meses negativos;
  - descriptor truncado: las variantes se fusionan en una sola suscripción.
- Totales y orden:
  - `oculta` por clave canónica y por clave cruda fusionada;
  - `summarizeSubscriptions` excluye ocultas y cortadas;
  - USD por la cotización; sin cotización → `montoMensualArs: null` y no suma en ARS, pero sí en `totalMensualUsd`;
  - orden: activas por pesos descendente con las `null` al final, después cortadas por fecha;
  - `latestClosingByIssuer` ignora los `closingDate` nulos.

**`server/src/http/routes/subscriptions.test.ts`** (con `withDb()` y `vi.mock("../../fx/dollarRate.js")`, como `stats.test.ts`)

- `GET` sin datos → `200` con `items: []` y totales en 0.
- `GET` con un resumen Visa y 4 cobros mensuales USD de `STREAMFLIX.COM <id>`, más ruido (cuotas, un `tax`, un café varias veces por mes) → una suscripción. La respuesta valida contra `subscriptionsReportDtoSchema` y `montoMensualArs = monto × cotización mockeada`.
- `PUT /hidden/STREAMFLIX%20COM` → `204`. Después el `GET` la marca `oculta` y los totales quedan en 0. Un segundo `PUT` también da `204`.
- `DELETE` la vuelve a mostrar.
- `PUT` con una clave en blanco o de más de 60 caracteres → `400`.
- Sin cotización (`mockResolvedValue(null)`) → `cotizacionOficial: null`.

**`client/src/subscriptions.test.ts`**

- `subscriptionSections`: separación (una oculta cortada va solo a ocultas), `subieron`, `ahorroMensualArs` y `conUsd`.
- `increaseLabel` → `"Subió 10,0% desde marzo de 2026"`, `increaseShortLabel`, `increaseDetail`, `increaseSinceDetail`, `subscriptionMeta` y `previousCurrencyLabel`.
- `activeCountLabel` y `monthlyKpiSub` con y sin cotización.
- `subscriptionTransactionsLink` escapa espacios y `*`.

**`client/src/pages/SubscriptionsPage.test.tsx`** (con `fetch` mockeado, como `CreditsPage.test.tsx`)

- Muestra los cuatro KPIs, la fila de una activa con el chip «Subió …» y la sección «Dejaron de cobrarse».
- El `h4` se ve mientras carga.
- Estado vacío y estado de error.
- «Ocultar STREAMFLIX.COM» llama `PUT /api/subscriptions/hidden/STREAMFLIX%20COM`.
- «Mostrar …» dentro de «Ocultas (1)» llama `DELETE`.
- El link «Ver movimientos de …» apunta a `/transactions?year=all&search=…`.
- Sin cotización, el KPI dice «sin cotización para US$ …».
- Con `emulateMobile()` se ven `article` (tarjetas) y no `table`; ocultar desde una tarjeta llama `PUT`, y «Ver movimientos» está en el detalle.

**Verificación final**

1. `bun run test`, `bun run typecheck` y `bun run build` en verde.
2. Correr el motor en modo solo lectura contra la base local (un script en el scratchpad que lee con Mongoose y llama a `detectSubscriptions`, sin escribir nada): tiene que dar los 5 cobros validados más arriba. Si la base local no está disponible, queda como pendiente para el usuario.
3. Revisión visual en el navegador (compu y 375 px): queda para el usuario, porque los puertos del servicio y de las otras sesiones están ocupados.

## Orden de implementación

1. **Motor:** helpers de `subscriptions.ts` (anulaciones, rachas, montos parecidos, aumento, cierres) con sus tests.
2. **Motor:** `detectSubscriptions` y `summarizeSubscriptions`.
3. **API:** handlers de la ruta y sus tests.
4. **Cliente:** lógica pura `subscriptions.ts`.
5. **UI compu:** KPIs, tabla, ocultas y página.
6. **UI mobile:** tarjetas.
7. **Verificación** contra los datos locales.

## Fuera de alcance

- Cadencias que no son mensuales (anual, semestral, semanal).
- Cuotas (`isInstallment`): tienen su página.
- Impuestos a servicios digitales y percepciones: se cobran en líneas aparte y no se atribuyen a cada suscripción.
- Débitos automáticos fuera de las tarjetas (cuenta bancaria, servicios): no hay datos.
- Cruzar el débito del plan de ahorro con `AutoCoupon.totalAPagar` para excluirlo solo: se resuelve con Ocultar.
- Separar dos suscripciones con el mismo descriptor (por ejemplo, dos cuentas del mismo servicio) o una compra suelta en el mismo mes en que cambia el precio.
- Comparar los aumentos contra la inflación.
- Informar bajas de precio.
- Renombrar comercios, fusionar a mano o marcar a mano algo como suscripción.
- Alertas o notificaciones de aumentos o de cobros nuevos.
- Filtros globales (año, moneda, tarjeta) en esta página.
- KPI en el Dashboard y gráfico de evolución.
- Tarjeta dada de baja: sus suscripciones siguen «activas» porque, sin resúmenes nuevos, no hay forma de saberlo.
