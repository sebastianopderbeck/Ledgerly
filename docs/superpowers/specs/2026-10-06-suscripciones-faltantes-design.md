# Suscripciones faltantes: categoría, alta manual y cadencia anual — diseño

Fecha: 2026-10-06
Estado: aprobado para plan
Base: `main` con la página Suscripciones (ver `2026-10-03-suscripciones-design.md`)

## Problema

La página Suscripciones no muestra suscripciones que el usuario sí tiene. Todas comparten tres rasgos: tienen la categoría «Suscripciones», que les pone su propia regla; tienen **un solo cobro** en la base, y el detector no las encuentra.

Hay tres casos:

- un streaming **anual**, con un único cobro a principio de año;
- un streaming **mensual** que se cobró una sola vez, en el último resumen de la tarjeta;
- un streaming **mensual nuevo**, con su primer cobro en el último resumen de la otra tarjeta.

**Causa.** El detector de `server/src/stats/subscriptions.ts` pide **3 cobros mensuales seguidos** (`MIN_COBROS = 3`) y no mira la categoría. El spec original lo decidió así: «la recurrencia sale de las fechas y los montos», «solo cadencia mensual». Bajar `MIN_COBROS` no alcanza, porque las tres tienen un solo cobro.

## Objetivo

Que una suscripción aparezca en la lista **desde su primer cobro** cuando el usuario ya dijo que lo es, y que las suscripciones anuales se muestren y se sumen como tales.

El usuario puede decir que algo es una suscripción de dos formas:

1. **Por categoría:** el último cobro del comercio tiene la categoría «Suscripciones».
2. **Por alta manual:** lo marca desde Movimientos.

La cadencia (mensual o anual) se cambia **solo desde la página Suscripciones**, con una acción por fila.

## Decisiones tomadas

- **La categoría y el alta manual son un plan B.** Primero corre el detector de hoy, sin cambios. Solo si no encuentra una racha válida, un comercio *forzado* entra con su última racha mensual de cualquier largo.
- **La cadencia se marca a mano y no se detecta.** Con un solo cobro no hay forma de distinguir un plan anual de uno mensual cortado. Una suscripción forzada con un cobro viejo cae en «Dejaron de cobrarse», y desde ahí se marca como anual con un clic.
- **Desde Movimientos se marca sin cadencia.** Toda alta manual entra como mensual.
- **Dos colecciones nuevas con la forma de `HiddenSubscription`:** `ManualSubscription` y `AnnualSubscription`, cada una con `key` única. Es el patrón que ya anda. Se descartó una colección de preferencias `{ key, manual, anual }` (mezcla dos marcas independientes) y unificar con las ocultas (pide una migración).
- **Ocultar siempre gana.** Una manual se deshace con «Ocultar», así que no hay `DELETE` de manuales. Marcar a mano un comercio oculto lo vuelve a mostrar: el alta borra la oculta con esa clave.
- **La clave manual la calcula el server.** El cliente manda el `merchant` del movimiento y el server guarda `merchantKey(merchant)`, la clave cruda. El detector la busca como a las ocultas: por la clave canónica o por cualquier clave cruda del grupo.
- **Anual = la misma racha con paso de 12 meses.** Desde el último cobro se busca un cobro 12 meses antes, y así sucesivamente. Los cobros mensuales viejos de un comercio que pasó a anual no entran en la racha ni en el aumento.
- **Una anual suma 1/12 por mes.** Tanto `montoMensualArs` como el total en USD dividen por 12. `montoActual` sigue siendo el monto cobrado.
- **La categoría se compara por nombre exacto** con `CATEGORIA_SUSCRIPCIONES = "Suscripciones"`, la categoría que usa la regla del usuario.
- **Efecto aceptado:** una compra suelta que la regla categoriza como «Suscripciones» (por ejemplo, una app de la tienda de Google) aparece como suscripción de un cobro y después pasa a «Dejaron de cobrarse». Se saca con Ocultar.

## Datos

### Lo que se lee

Lo mismo que hoy, más:

| Fuente | Archivo | Campos |
|---|---|---|
| `ManualSubscriptionModel` | `server/src/db/models.ts` | `key` |
| `AnnualSubscriptionModel` | `server/src/db/models.ts` | `key` |

### Lo que se escribe

```ts
const manualSubscriptionSchema = new Schema(
  { key: { type: String, required: true, unique: true } },
  { timestamps: { createdAt: "markedAt", updatedAt: false } },
);

const annualSubscriptionSchema = new Schema(
  { key: { type: String, required: true, unique: true } },
  { timestamps: { createdAt: "annualAt", updatedAt: false } },
);
```

Se exportan `ManualSubscriptionDoc`, `AnnualSubscriptionDoc`, `ManualSubscriptionModel` y `AnnualSubscriptionModel`, con el mismo idiom que `HiddenSubscriptionModel`. Igual que con las ocultas, borrar resúmenes o movimientos no toca estas colecciones. No hay backfill.

## Cálculo (`server/src/stats/subscriptions.ts`)

### Contexto y constantes

```ts
export const CATEGORIA_SUSCRIPCIONES = "Suscripciones";
export const MESES_CADENCIA: Record<Cadencia, number> = { mensual: 1, anual: 12 };

export interface SubscriptionContext {
  hoy: string;
  ultimoCierre: Partial<Record<Issuer, string>>;
  ocultas: ReadonlySet<string>;
  manuales: ReadonlySet<string>;
  anuales: ReadonlySet<string>;
  cotizacion: number | null;
}
```

`Cadencia` viene de `shared` (ver «API»).

Las tres marcas se buscan igual. Una marca aplica a un grupo si su clave canónica, o cualquiera de las claves crudas que se fusionaron en él, está en el set. La función `isHidden` de hoy pasa a ser un `hasMark(key, rawKeys, set)` genérico.

### Grupo forzado

Un grupo es **forzado** si cumple al menos una de estas:

- su débito más reciente (después de las anulaciones) tiene `category === CATEGORIA_SUSCRIPCIONES`;
- tiene marca en `manuales`;
- tiene marca en `anuales`.

### Elegir la racha

**Mensual** (el grupo no tiene marca en `anuales`):

1. Corre el camino de hoy sin cambios: la última racha válida (`MIN_COBROS` y `similarAmounts`), descartada si hay un cobro parecido en un mes posterior (`hasLaterSimilar`).
2. Si ese camino no da nada y el grupo está forzado, la racha es `monthlyRuns(charges).at(-1)`: la última racha mensual, de cualquier largo y sin chequear montos.
3. Si no está forzado, el grupo no es suscripción, igual que hoy.

**Anual** (el grupo tiene marca en `anuales`): la racha es `annualRun(charges)`.

```ts
export function annualRun(charges: Charge[]): Charge[]
```

`annualRun` arranca en el último cobro del grupo y va hacia atrás, mirando cada vez el mes `addMonths(monthOf(actual), -12)`:

- si ese mes tiene **un solo cobro**, entra;
- si tiene **varios**, entra el de la misma moneda que el actual con el monto más cercano; si ninguno es de esa moneda, la racha termina;
- si no tiene cobros, la racha termina.

Devuelve la racha ordenada por fecha. Nunca está vacía, porque el grupo tiene al menos un cobro.

### Derivados que cambian

Con `u` como último cobro de la racha y `meses = MESES_CADENCIA[cadencia]`:

- `cadencia`: `"anual"` si el grupo tiene marca en `anuales`, si no `"mensual"`;
- `proximoCobro = addMonthsClamped(u.date, meses)`;
- `montoMensualArs`: el monto en pesos de hoy dividido por `meses` y redondeado al centavo (`null` si es USD y no hay cotización);
- `aumento = priceIncrease(racha)`. Sin cambios: con la ventana de 12 meses, una anual se compara contra el cobro del año anterior.

El resto (`key`, `nombre`, `busqueda`, `primerCobro`, `cobros`, `monedaAnterior`, `oculta`) se arma igual que hoy, a partir de la racha elegida.

### Estado y ventana de cortadas

- El estado se calcula con la misma regla de hoy, `addDays(proximoCobro, GRACIA_DIAS) < cierre`, pero sobre el `proximoCobro` de la cadencia.
- **Mensual:** sin cambios. Una cortada con `ultimoCobro < addMonthsClamped(hoy, -VENTANA_CORTADAS_MESES)` no se lista.
- **Anual:** una cortada no se lista si `proximoCobro < addMonthsClamped(hoy, -VENTANA_CORTADAS_MESES)`. Con la regla mensual, una anual desaparecería apenas se corta, porque su último cobro ya tiene un año.

### `summarizeSubscriptions(items)`

- `totalMensualArs = Σ (montoMensualArs ?? 0)`, sin cambios (ya viene dividido).
- `totalMensualUsd = Σ montoActual / MESES_CADENCIA[cadencia]` de las USD, redondeado al centavo.
- `totalAnualArs = totalMensualArs × 12`, sin cambios.

### Casos borde nuevos

| Situación | Resultado |
|---|---|
| Un cobro con categoría «Suscripciones», el último cierre todavía no cubre el próximo cobro | Activa, mensual, `cobros: 1` |
| Un cobro con categoría «Suscripciones» hace varios meses, sin marca anual | Cortada (en «Dejaron de cobrarse») |
| El mismo, marcado como anual | Activa, `proximoCobro` un año después, ÷12 en los totales |
| Anual con `proximoCobro + 7 días` anterior al último cierre de su tarjeta | Cortada, visible hasta 12 meses después de su próximo cobro |
| Comercio que pasó de mensual a anual | La racha anual solo junta los cobros a 12 meses entre sí; el aumento se mide contra el cobro del año anterior |
| Forzado por categoría con una racha válida | Se usa la racha válida, sin cambios respecto de hoy |
| Forzado cuya racha válida tiene un cobro parecido después | El camino de hoy lo descarta; el plan B toma la última racha (la que tiene ese cobro) |
| La última compra del comercio cambia de categoría | Deja de estar forzado; si no tiene marca manual ni racha válida, sale de la lista |
| Marca manual sobre un comercio oculto | El alta borra la oculta con la misma clave cruda y vuelve a aparecer |
| Marca manual sobre un comercio sin débitos elegibles (solo cuotas, por ejemplo) | No aparece. La UI no ofrece marcar esos movimientos |
| Marca anual y oculta a la vez | Solo en «Ocultas» |

## API

### Shared (`shared/src/dtos.ts`)

```ts
export const cadenciaSchema = z.enum(["mensual", "anual"]);

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
  cadencia: cadenciaSchema,
});

export const manualSubscriptionInputSchema = z.object({
  merchant: z.string().trim().min(1).max(200),
});

export type Cadencia = z.infer<typeof cadenciaSchema>;
export type ManualSubscriptionInput = z.infer<typeof manualSubscriptionInputSchema>;
```

### Endpoints (`server/src/http/routes/subscriptions.ts`)

`hiddenKeyOf` pasa a llamarse `keyParamOf` y la usan `hidden` y `annual`.

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/subscriptions` | Igual que hoy. Además trae `ManualSubscriptionModel.find().lean()` y `AnnualSubscriptionModel.find().lean()` y los pasa como `manuales` y `anuales` |
| `POST` | `/api/subscriptions/manual` | Body `ManualSubscriptionInput`. Si no valida, `400`. Calcula `key = merchantKey(merchant)`; si queda `""`, responde `400` «Este comercio no tiene un nombre reconocible». Si no, hace upsert de `{ key }` en manuales y `HiddenSubscriptionModel.deleteOne({ key })`, y responde `204` |
| `PUT` | `/api/subscriptions/annual/:key` | `204`, idempotente, como `PUT /hidden/:key` |
| `DELETE` | `/api/subscriptions/annual/:key` | `204`, idempotente, como `DELETE /hidden/:key` |

### Hooks (`client/src/api/hooks.ts`)

Los dos invalidan `["subscriptions"]`:

- `useMarkSubscription()`: `mutationFn: (merchant: string)` hace `POST /subscriptions/manual` con `{ merchant }`.
- `useSetSubscriptionAnnual()`: `mutationFn: ({ key, annual })` hace `PUT` o `DELETE` sobre `/subscriptions/annual/${encodeURIComponent(key)}`. Es un espejo de `useSetSubscriptionHidden`.

## UI

### Lógica pura (`client/src/subscriptions.ts`)

- `SubscriptionListProps` suma `onToggleAnnual: (key: string, annual: boolean) => void`.
- `canMarkAsSubscription(tx: TransactionDTO): boolean` devuelve `type === "purchase" && direction === "debit" && !isInstallment && amount > 0`. Es el mismo criterio que el débito elegible del server.
- `cadenceToggleLabel(nombre, cadencia)` devuelve «Marcar {nombre} como anual» para una mensual y «Marcar {nombre} como mensual» para una anual.
- `cadenceToggleTooltip(cadencia)` devuelve «Es anual» para una mensual y «Es mensual» para una anual.
- `cadenceAmountCaption(cadencia)` devuelve «por año» para una anual y `null` para una mensual.
- `INTRO` y `EMPTY` de la página:
  - INTRO: «Cobros que se repiten en tus tarjetas: los que aparecen 3 meses seguidos con montos parecidos, los de la categoría Suscripciones y los que marcaste desde Movimientos. No incluye cuotas ni impuestos.»
  - EMPTY: «No encontramos suscripciones. Aparecen solas con 3 meses seguidos de cobros del mismo comercio, con la categoría Suscripciones o marcándolas desde Movimientos.»

### Página Suscripciones

- `SubscriptionsPage` usa `useSetSubscriptionAnnual` y le pasa `toggleAnnual` (con `useCallback`) a las listas de activas y de cortadas.
- **`SubscriptionsTable`.** Al lado de «Ocultar» se agrega un `IconButton` con `EventRepeatOutlined`, `aria-label={cadenceToggleLabel(...)}` y un `Tooltip` con `cadenceToggleTooltip(...)`. En las anuales:
  - la celda de monto suma el caption «por año»;
  - la celda «En pesos» suma el caption «por mes».
- **`SubscriptionCards`.** El slot `action` de `RecordCard` lleva los dos `IconButton` (cadencia y ocultar) dentro de un `Box` en fila. En las anuales, el highlight de monto suma «por año» al valor.

### Movimientos

- `TransactionsPage` usa `useMarkSubscription`, le pasa `onMarkSubscription` a `TransactionsTable` y a `TransactionsList`, y muestra un `Snackbar` con el idiom de `UncategorizedInbox` (`snackbarAboveNavSx`, `Alert`):
  - si sale bien: «Agregado a Suscripciones»;
  - si falla: «No pudimos marcarlo como suscripción».
- **`TransactionsTable` (desktop).** Suma una última columna `field: "subscription"`, sin header, `width: 64`, `sortable: false`, `filterable: false` y `disableColumnMenu: true`. En las filas que cumplen `canMarkAsSubscription` muestra un `IconButton` con `AutorenewOutlined` y `aria-label` «Marcar {merchant} como suscripción». No usa `GridActionsCellItem`.
- **`TransactionsList` → `TransactionSheet` (mobile).** El sheet recibe `onMarkSubscription`. Si el movimiento es elegible, muestra un botón `variant="outlined"` y `fullWidth`, «Es una suscripción», arriba de Borrar/Guardar. Al tocarlo llama a `onMarkSubscription(transaction.merchant)` y cierra el sheet.

## Tests

| Archivo | Casos |
|---|---|
| `server/src/stats/subscriptions.test.ts` | Forzado por categoría con 1 cobro: activa y cortada; categoría en un cobro viejo pero no en el último: no forzado; forzado manual por clave cruda; una racha válida no cambia por estar forzada; `annualRun` (salto de 12 meses, ignora cobros mensuales viejos, elige el monto más cercano); anual: `proximoCobro`, ÷12, estado, ventana de cortadas; `summarizeSubscriptions` con USD anual |
| `server/src/http/routes/subscriptions.test.ts` | `POST /manual`: 204 y aparece; 400 por body inválido y por clave vacía; borra la oculta. `PUT`/`DELETE /annual/:key`: idempotentes, cambian `cadencia`; 400 por clave inválida. Los seeds que no deben quedar forzados pasan una categoría explícita distinta de «Suscripciones» |
| `shared/src/dtos.test.ts` | `cadencia` en el DTO; `manualSubscriptionInputSchema` |
| `client/src/api/hooks.test.tsx` | `useMarkSubscription` y `useSetSubscriptionAnnual`: método, URL, body e invalidación |
| `client/src/subscriptions.test.ts` | `canMarkAsSubscription`, `cadenceToggleLabel`, `cadenceToggleTooltip`, `cadenceAmountCaption` |
| `client/src/pages/SubscriptionsPage.test.tsx` | El toggle llama al hook con `{ key, annual }`, en activas y en cortadas; caption «por año» en una anual |
| `client/src/components/TransactionsTable.test.tsx` | El botón está solo en filas elegibles y llama a `onMarkSubscription(merchant)` |
| `client/src/components/TransactionSheet.test.tsx` | El botón está solo si es elegible, llama y cierra |
| `client/src/pages/TransactionsPage.test.tsx` | Snackbar de éxito tras marcar |

## Validación contra los datos locales

Al terminar, con el server temporal en un puerto que no sea el del servicio instalado:

- Las tres suscripciones del «Problema» aparecen. Las dos mensuales quedan activas y la anual queda cortada.
- Después de marcar la anual, pasa a activa con próximo cobro a un año, y el total mensual sube en 1/12 de su monto.
- Las suscripciones que ya se detectaban siguen igual, salvo el campo `cadencia: "mensual"`.

## Fuera de alcance

- Detectar la cadencia anual sola.
- Otras cadencias (semanal, trimestral).
- Borrar una marca manual. Se usa Ocultar.
- Elegir la cadencia desde Movimientos.
