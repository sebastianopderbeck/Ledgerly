# Revisión del resumen antes de pagarlo — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo)

## Objetivo

Antes de pagar la tarjeta, contestar en un minuto: **¿hay algo raro en este resumen?**

La sección compara un resumen contra los anteriores de **la misma tarjeta** y arma un **checklist**
con lo que conviene mirar:

1. **posibles cobros duplicados**: mismo comercio y mismo monto, en el mismo resumen o con fechas
   cercanas;
2. **cargos en USD fuera de lo habitual**;
3. **comercios que aparecen por primera vez** en la tarjeta;
4. **categorías cuyo gasto supera claramente su promedio** de los últimos resúmenes;
5. movimientos **«Sin categoría»**.

Cada hallazgo se tilda como revisado y **el estado se guarda por resumen**. La sección vive en la
página **Importar**: se enfoca sola en el resumen que se acaba de importar y queda accesible para el
**último resumen de cada tarjeta**.

No es un detector de fraude ni bloquea nada. Marca lo que una persona tiene que mirar, con el porqué
en una línea.

## Lo que ya trae la base (`feat/base-nuevas-features`)

La base del lote (`2026-10-03-base-nuevas-features-design.md`) dejó en su forma final todo lo
compartido. Esta feature **no toca** esos archivos:

| Pieza | Dónde | Estado |
|---|---|---|
| `reviewedKeys: { type: [String], default: [] }` en `statementSchema` | `server/src/db/models.ts` | listo, probado |
| `UNCATEGORIZED_CATEGORY = "Sin categoría"` | `shared/src/schemas.ts` | listo |
| DTOs `reviewReasonSchema` … `statementReviewKeysDtoSchema` y sus tipos | `shared/src/dtos.ts` | listos, probados en `dtos.test.ts` |
| Router `statementReviewRouter = Router({ mergeParams: true })` montado en `/api/statements/:id/review` **antes** de `/api/statements` | `server/src/http/routes/statementReview.ts`, `app.ts` | stub sin handlers: **esta feature le agrega `GET /` y `PATCH /`** |
| `statementsBefore(target, statements)`: mismo issuer, estrictamente anteriores, del más nuevo al más viejo | `server/src/stats/lastStatement.ts` | listo, probado |
| `merchantMatchKey(merchant)` | `server/src/stats/merchantKey.ts` | listo, probado (lo comparte con suscripciones) |
| `daysBetween(from, to)` (días con signo, en UTC) | `server/src/stats/months.ts` | listo, probado |
| `statementReviewKey`, `useStatementReview`, `useStatementReviews`, `useMarkFindingsReviewed` | `client/src/api/hooks.ts` | listos, probados en `hooks.test.tsx` |
| `applyReviewedDelta` | `client/src/statementReview.ts` | listo: **esta feature extiende el módulo** sin cambiarla |
| `<StatementReviewSection key={focusStatement?.id ?? "latest"} focusStatement={focusStatement} />` después de `<GmailImportSection />` y antes de «Archivos importados» | `client/src/pages/ImportPage.tsx` | listo |
| Stub `StatementReviewSection` con `StatementReviewSectionProps` | `client/src/components/StatementReviewSection.tsx` | **se reemplaza** |
| Mocks de `/statements` (`[]`) y `/statements/<id>/review` (`reviewOf(id)`) | `client/src/pages/ImportPage.test.tsx` | listos: **esta feature agrega su test** |

## Decisiones tomadas

- **Tarjeta = `issuer`** (`visa_signature` / `icbc`), igual que `latestStatementIdsPerIssuer`
  (`server/src/stats/lastStatement.ts`) y `latestStatementPerIssuer` (`client/src/cardCycle.ts`). El
  `cardLabel` de Visa incluye los últimos 4 dígitos: si te renuevan el plástico, la historia sigue
  siendo la misma.
- **"Anteriores" son los resúmenes de la misma tarjeta estrictamente más viejos**, por
  `closingDate` y con desempate por `uploadedAt` (`statementsBefore`). Revisar un resumen viejo nunca
  usa los posteriores como historia.
- **Ventana: los últimos 6 resúmenes anteriores** (`REVIEW_WINDOW = 6`) para el promedio por
  categoría, para el USD habitual y para los duplicados contra resúmenes anteriores. Para "comercio
  nuevo" se mira **toda** la historia de la tarjeta. Se cuenta en **resúmenes, no en meses
  calendario**: un mes sin importar no se rellena con ceros.
- **Un hallazgo por movimiento, con uno o más motivos**, no una sección por chequeo. Un comercio
  nuevo que cobra en USD y no tiene categoría aparece **una vez**, con tres chips, y se tilda una vez.
  Lo que cuenta cada chequeo se ve en una fila de chips de resumen arriba del checklist.
- **Las categorías en alza son hallazgos aparte** (no son movimientos): uno por categoría.
- **Se calcula en el server, a pedido.** Hace falta la historia de transacciones de la tarjeta, que el
  cliente no tiene. Una función pura (`buildStatementReview`) y una ruta que carga y delega: el
  patrón de `server/src/stats/*.ts`. Los hallazgos **no se persisten**: se recalculan en cada GET.
  Por eso categorizar un movimiento o importar un resumen anterior los actualiza sin hacer nada más.
- **Se persiste solo lo tildado**: `reviewedKeys: string[]` embebido en el documento `Statement`.
  Borrar el resumen borra su revisión. «Reemplazar» (reimportar) la pierde, porque recrea el resumen y
  sus movimientos con ids nuevos.
- **Claves estables**: `tx:<transactionId>` y `cat:<categoría>`. Si el hallazgo de una clave tildada
  desaparece, la clave se ignora y no se limpia.
- **"Revisado" se deriva**: un resumen está revisado cuando todos sus hallazgos actuales están
  tildados, o cuando no tiene ninguno. No se guarda una fecha de revisión ni un estado aparte.
- **Solo compras** (`type: "purchase"`). Pagos, impuestos (IVA, percepciones), bonificaciones y
  ajustes no entran a ningún chequeo.
- **Los umbrales son constantes** arriba de `server/src/stats/statementReview.ts`, para ajustarlos al
  ver datos reales (el mismo criterio que `macroSignals.ts`).
- **Sin ajuste por inflación** en el chequeo de categorías. Con una inflación mensual del 2 al 3 %,
  el promedio de 6 resúmenes queda menos de un 10 % abajo del valor actual, y eso lo absorbe el umbral
  de ×1,5.
- **Los comercios se comparan con `merchantMatchKey`** (`server/src/stats/merchantKey.ts`, de la
  base): sin tildes, en mayúsculas, la puntuación como espacio, sin las palabras que tienen dígitos
  ni la palabra `USD`, todas las palabras unidas con un espacio; si no queda ninguna, el comercio
  entero en mayúsculas. Así "STREAMING P1A2B3" y "STREAMING X9Y8" cuentan como el mismo comercio, y
  "SERVICIO EXTERIOR USD 14,99" es el mismo que "SERVICIO EXTERIOR". No se crea un `merchantKey`
  propio: el `merchantKey` de ese módulo es el de suscripciones (dos primeras palabras) y no sirve
  acá, porque "DELIVERY PLUS" y "DELIVERY PROPINA" tienen que ser comercios distintos.
- **Las cuotas viejas no son "nuevas"**: una cuota con `installmentCurrent > 1` es una compra de un
  ciclo anterior (aunque ese resumen no esté importado). No se marca como comercio nuevo ni como USD
  inusual.
- **La única acción del checklist es tildar.** No se edita la categoría ni se borra desde acá. Si hay
  movimientos «Sin categoría», un link lleva a Reglas (donde vive la bandeja de la feature #9).
- **Se reusa el aviso de reconciliación** (`ReconciliationBanner`) cuando el resumen no reconcilia:
  si el parser perdió movimientos, la revisión también puede quedar incompleta.
- **Sin ruta ni ítem de menú nuevos**: todo vive en `/import`.
- **Los montos en USD se muestran con `formatMoney`**, como en el resto de la app (`US$ 10,99`).
- **El chip de categoría de un movimiento se oculta cuando su motivo es «Sin categoría»**: el chip
  del motivo ya lo dice, y repetir "Sin categoría" dos veces en la misma fila es ruido.
- **El cliente no importa valores de `@ledgerly/shared`**, solo tipos (la base lo explica: un valor
  arrastraría zod al bundle). Por eso las etiquetas y el orden de los chequeos viven en
  `client/src/statementReview.ts`, y el mínimo de 3 resúmenes para categorías se repite ahí como
  `CATEGORY_HISTORY_NEEDED` solo para el texto. Qué chequeo se salteó lo dice siempre el server, en
  `skippedChecks`.

## Datos

### Lo que ya existe (no cambia)

`Statement` (`server/src/db/models.ts`, `statementSchema`): `issuer` (`"visa_signature" | "icbc"`),
`cardLabel`, `last4`, `closingDate: Date | null`, `dueDate: Date | null`,
`totals.{totalConsumos, saldoActual, pagoMinimo, saldoAnterior}.{ars, usd}`, `needsReview`,
`reconciliation`, `reviewedKeys: string[]` (de la base) y `uploadedAt` (timestamp de creación).

`Transaction` (`transactionSchema`): `statementId`, `issuer`, `cardLabel`, `date: Date`,
`descriptionRaw`, `merchant`, `category`, `categorySource`, `amount`, `currency` (`"ARS" | "USD"`),
`direction` (`"debit" | "credit"`), `type` (`purchase | payment | tax | fee | refund | adjustment`),
`isInstallment`, `installmentCurrent`, `installmentTotal`, `comprobante`, `fingerprint`.

Cómo son los datos reales, y qué parte del diseño depende de cada cosa:

- `merchant` ya viene normalizado por `normalizeMerchant` (`server/src/parsers/normalize.ts`): sin
  prefijos `MERPAGO*`, `DLO*`, `PAYU*AR*`, sin montos y sin "Cuota N/M". `merchantMatchKey` solo
  agrega la tolerancia a códigos variables.
- `category` sale de las reglas (`server/src/rules/categorize.ts`) y vale **"Sin categoría"** cuando
  ninguna matchea.
- Las cuotas traen la **fecha de compra original**, no la del ciclo: la cuota 3/6 de una compra de
  marzo tiene `date` de marzo en el resumen de mayo. Por eso, para ser duplicado, un movimiento
  también tiene que tener el mismo `installmentCurrent`.
- `amount` es siempre positivo, también en las devoluciones (`direction: "credit"`). Para los totales
  por categoría se usa el monto con signo, como hace `reconcile.ts`.
- La importación (`importStatement.ts`) ya descarta los movimientos con el mismo `fingerprint`
  (`issuer|fecha|comprobante|monto|moneda|cuota`), dentro del resumen y contra los anteriores. Dos
  cargos iguales con **comprobantes distintos** sí entran, y son los que este chequeo tiene que
  mostrar.
- ICBC no captura `saldoActual.usd`: queda en 0. En el encabezado, el USD se muestra solo si es > 0.

No hay cambio de esquema ni de DTOs: la base ya los trae.

## Cálculo

### `server/src/stats/statementReview.ts` (nuevo, puro)

Constantes:

```ts
export const REVIEW_WINDOW = 6;
export const DUPLICATE_WINDOW_DAYS = 3;
export const USD_SPIKE_RATIO = 1.2;
export const CATEGORY_MIN_HISTORY = 3;
export const CATEGORY_SPIKE_RATIO = 1.5;
export const CATEGORY_SPIKE_MIN_SHARE = 0.05;
export const REASON_ORDER: ReviewReason[] = ["duplicado", "usd", "nuevo", "sin-categoria"];
export const CHECK_ORDER: ReviewCheck[] = ["duplicado", "usd", "nuevo", "categoria", "sin-categoria"];
```

Contrato:

```ts
export interface StatementReviewInput {
  current: TransactionDTO[];
  history: TransactionDTO[][];
  knownMerchants: string[];
  previousStatements: number;
}

export interface StatementReviewResult {
  findings: ReviewFinding[];
  skippedChecks: ReviewCheck[];
}

export function buildStatementReview(input: StatementReviewInput): StatementReviewResult
```

- `current`: los movimientos del resumen revisado.
- `history`: los movimientos de los resúmenes anteriores de la ventana (hasta `REVIEW_WINDOW`), uno
  por resumen, del más nuevo al más viejo. Un resumen sin movimientos llega como `[]` y cuenta igual.
- `knownMerchants`: los `merchant` de compras de **todos** los resúmenes anteriores de la tarjeta.
- `previousStatements`: cuántos resúmenes anteriores tiene la tarjeta en total.

Definiciones auxiliares, exportadas para los tests:

```
purchases(txs)     = txs con type === "purchase"
charges(txs)       = purchases(txs) con direction === "debit"
isOldInstallment(t)= t.isInstallment && (t.installmentCurrent ?? 1) > 1
signedAmount(t)    = t.direction === "credit" ? −t.amount : t.amount
distancia(a, b)    = |daysBetween(a.date, b.date)|   (daysBetween de months.ts)
```

Cada chequeo es una función exportada que devuelve lo que encontró:

```ts
export function findDuplicates(current, history): Map<string, ReviewDuplicateRef>
export function findUnusualUsd(current, history): Map<string, number | null>
export function findNewMerchants(current, knownMerchants): Set<string>
export function findUncategorized(current): Set<string>
export function findCategorySpikes(current, history): ReviewCategoryFinding[]
```

#### ① Posibles duplicados — motivo `duplicado`

```
candidatos = charges(current) ordenados por (date, id)
para cada c en la posición i:
  pool = candidatos[0..i−1] (sameStatement: true) ∪ charges(history.flat()) (sameStatement: false)
  coincide(p) = merchantMatchKey(p.merchant) === merchantMatchKey(c.merchant)
             && p.currency === c.currency
             && |p.amount − c.amount| < 0.005
             && distancia(p, c) ≤ DUPLICATE_WINDOW_DAYS
             && (p.installmentCurrent ?? null) === (c.installmentCurrent ?? null)
  si alguno coincide → duplicateOf = el de fecha más cercana
                       (desempate: primero el del mismo resumen, después el id menor)
```

En un par dentro del mismo resumen se marca **el posterior**, que apunta al anterior. Tres cargos
iguales dan dos hallazgos. Un débito automático mensual (unos 30 días de distancia) nunca entra, y
tampoco la cuota k+1 de la misma compra en el resumen siguiente, porque tiene otro
`installmentCurrent`.

#### ② USD fuera de lo habitual — motivo `usd`

```
si history.length === 0 → "usd" va a skippedChecks
usdPrevio(k) = máximo amount de charges(history.flat()) con currency "USD" y merchantMatchKey k
para cada c en charges(current) con currency "USD" y !isOldInstallment(c):
  prev = usdPrevio(merchantMatchKey(c.merchant))
  sin prev                          → motivo "usd", usualUsd = null
  c.amount > prev × USD_SPIKE_RATIO → motivo "usd", usualUsd = prev
```

Se usa el **máximo** y no el promedio: un servicio con consumo variable no se marca mientras no pase
su techo de la ventana. Una suba de precio de una suscripción en USD de más del 20 % sí se marca.

#### ③ Comercio nuevo — motivo `nuevo`

```
si previousStatements === 0 → "nuevo" va a skippedChecks
conocidos = Set(knownMerchants.map(merchantMatchKey))
para cada c en charges(current) con !isOldInstallment(c):
  si !conocidos.has(merchantMatchKey(c.merchant)) → motivo "nuevo"
```

Si un comercio nuevo tiene varios cargos en el resumen, se marca cada uno: cada cargo es plata a
verificar.

#### ④ Categorías en alza — hallazgo `category`

```
si history.length < CATEGORY_MIN_HISTORY → "categoria" va a skippedChecks
totales(txs)  = Map categoría → Σ signedAmount(t), sobre purchases(txs) en ARS con category ≠ UNCATEGORIZED_CATEGORY
totalResumen  = Σ signedAmount(t) sobre purchases(current) en ARS (todas las categorías)
si totalResumen ≤ 0 → sin hallazgos de categoría
umbral = CATEGORY_SPIKE_MIN_SHARE × totalResumen
para cada (cat, total) de totales(current) con total > 0:
  promedio = Σ_h (totales(h).get(cat) ?? 0) / history.length
  promedio ≤ 0 → se marca si total ≥ umbral                      (ratio = null)
  si no        → se marca si total ≥ promedio × CATEGORY_SPIKE_RATIO
                                  && total − promedio ≥ umbral   (ratio = total / promedio)
```

El piso relativo (5 % del resumen) evita marcar una categoría chica que pasó de $ 2.000 a $ 4.000, y
como es proporcional no queda viejo con la inflación. El USD no entra a este chequeo: los cargos en
USD tienen el suyo.

#### ⑤ Sin categoría — motivo `sin-categoria`

Cada movimiento de `purchases(current)` con `category === UNCATEGORIZED_CATEGORY`. No se saltea
nunca.

#### Armado del resultado

- Un `ReviewTransactionFinding` por movimiento con al menos un motivo. `reasons` va en el orden de
  `REASON_ORDER`. `key = "tx:" + transaction.id`. `duplicateOf` y `usualUsd` valen `null` cuando el
  motivo correspondiente no está.
- Un `ReviewCategoryFinding` por categoría marcada. `key = "cat:" + category`.
- Orden: primero los movimientos, por la posición de `reasons[0]` en `REASON_ORDER`, después `date` y
  después `id`. Al final las categorías, por `total − average` de mayor a menor (y por nombre si
  empatan). El cliente no reordena.
- `skippedChecks` va en el orden de `CHECK_ORDER` (en la práctica, solo pueden aparecer `usd`,
  `nuevo` y `categoria`).

### Casos borde

| Situación | Resultado |
|---|---|
| Primer resumen de la tarjeta | `nuevo`, `usd` y `categoria` van a `skippedChecks`; duplicados (dentro del resumen) y sin categoría funcionan |
| 1 o 2 resúmenes anteriores | `usd` y `nuevo` funcionan; `categoria` se saltea |
| Se revisa un resumen viejo | los posteriores no cuentan como historia |
| `closingDate` nulo | el orden lo define `uploadedAt` (la regla de `lastStatement.ts`) |
| Meses sin importar | la ventana son los últimos 6 resúmenes **importados**; los huecos no se rellenan |
| Resumen sin compras en ARS | ningún hallazgo de categoría |
| Categoría ausente en toda la ventana | `average = 0`, `ratio = null`; se marca si supera el 5 % del resumen |
| Cuota con `installmentCurrent > 1` | nunca `nuevo` ni `usd`; `duplicado` solo con la misma cuota |
| Devolución (`credit`) | resta en los totales por categoría; no es candidata a `duplicado`, `usd` ni `nuevo` |
| Movimiento recategorizado | en el próximo GET, si su único motivo era `sin-categoria`, desaparece |
| Se importa después un resumen anterior | los hallazgos del posterior cambian en el próximo GET |
| «Reemplazar» un resumen | se pierden las marcas (ids nuevos) |
| Clave tildada sin hallazgo | se ignora al calcular el progreso y no se manda en «Marcar todo» |

## API

Los schemas y tipos ya están en `shared/src/dtos.ts` (base). `usualUsd` solo significa algo cuando
`reasons` incluye `"usd"`: `null` quiere decir "sin cargos en USD de ese comercio en la ventana".

### `GET /api/statements/:id/review`

En `server/src/http/routes/statementReview.ts` (el router de la base, ya montado):

1. Si `!isValidObjectId(id)` o `StatementModel.findById(id)` no encuentra nada →
   `HttpError(404, "Resumen no encontrado")`.
2. `StatementModel.find({ issuer: statement.issuer, _id: { $ne: statement._id } }).lean()` →
   `statementsBefore(...)`, que da `previous` (del más nuevo al más viejo).
3. `windowIds = previous.slice(0, REVIEW_WINDOW)`.
4. En paralelo:
   - `TransactionModel.find({ statementId: statement._id }).sort({ date: 1 })`
   - `TransactionModel.find({ statementId: { $in: windowIds } })`
   - `TransactionModel.distinct("merchant", { statementId: { $in: previousIds }, type: "purchase" })`
5. Mapea con `toTransactionDTO`, agrupa la ventana por `statementId` en el orden de `windowIds` y
   delega en `buildStatementReview`.
6. Responde `200` con un `StatementReviewDTO`:

```json
{
  "statement": { "id": "s3", "issuer": "visa_signature", "cardLabel": "Visa Signature ****1234",
    "closingDate": "2026-09-25", "dueDate": "2026-10-06", "...": "StatementDTO completo" },
  "previousStatements": 9,
  "historyStatements": 6,
  "skippedChecks": [],
  "findings": [
    { "kind": "transaction", "key": "tx:t31", "reasons": ["duplicado"],
      "transaction": { "id": "t31", "merchant": "COMERCIO UNO", "date": "2026-09-12", "amount": 2500,
        "currency": "ARS", "category": "Comida", "...": "TransactionDTO completo" },
      "duplicateOf": { "transactionId": "t30", "date": "2026-09-11", "sameStatement": true },
      "usualUsd": null },
    { "kind": "transaction", "key": "tx:t35", "reasons": ["usd"],
      "transaction": { "id": "t35", "merchant": "SERVICIO EXTERIOR", "amount": 14.99, "currency": "USD", "...": "..." },
      "duplicateOf": null, "usualUsd": 10.99 },
    { "kind": "category", "key": "cat:Supermercado", "category": "Supermercado",
      "total": 450000, "average": 250000, "ratio": 1.8 }
  ],
  "reviewedKeys": ["tx:t31"]
}
```

`statement` sale de `toStatementDTO(statement, current.length)`, `historyStatements` de
`history.length` y `reviewedKeys` de `[...statement.reviewedKeys]`.

### `PATCH /api/statements/:id/review`

Body `StatementReviewPatch` (`{ keys: string[], reviewed: boolean }`), validado con
`statementReviewPatchSchema.safeParse`. Un mismo endpoint sirve para tildar uno, destildar uno y
«Marcar todo como revisado».

- Body inválido → `400 { error: "Cuerpo inválido: se espera { keys: string[], reviewed: boolean }" }`.
- Id inválido o inexistente → `404 { error: "Resumen no encontrado" }`.
- `reviewed: true` → `findByIdAndUpdate(id, { $addToSet: { reviewedKeys: { $each: keys } } }, { new: true })`.
- `reviewed: false` → `findByIdAndUpdate(id, { $pull: { reviewedKeys: { $in: keys } } }, { new: true })`.
- `200 { reviewedKeys: string[] }`.

Las dos operaciones son atómicas y conmutan, así que varios clics rápidos no se pisan. El server no
valida que la clave exista entre los hallazgos actuales: una clave vieja no molesta.

## UI

### Cliente: API

Los hooks ya están en `client/src/api/hooks.ts` (base):

- `useStatementReview(id: string | null)`: `useQuery` con `queryKey: ["statement-review", id]`,
  `enabled: Boolean(id)`.
- `useStatementReviews(ids: string[])`: `useQueries` con la misma `queryKey`; comparte la caché.
- `useMarkFindingsReviewed()`: `PATCH` con `{ statementId, keys, reviewed }`, actualización optimista
  con `applyReviewedDelta` en `onMutate` e invalidación de esa revisión solo en `onError`.

`useImportFile` y `usePatchTransaction` ya invalidan todas las queries, así que la revisión se
recalcula después de importar o de recategorizar.

### Cliente: módulo puro `client/src/statementReview.ts` (se extiende)

```ts
export const REVIEW_CHECK_ORDER: ReviewCheck[] = ["duplicado", "usd", "nuevo", "categoria", "sin-categoria"];
export const REVIEW_CHECK_LABELS: Record<ReviewCheck, string>;
export const REVIEW_REASON_LABELS: Record<ReviewReason, string>;
export type ReviewChipColor = "error" | "warning" | "info" | "default";
export const REVIEW_CHECK_COLORS: Record<ReviewCheck, ReviewChipColor>;
export const CATEGORY_HISTORY_NEEDED = 3;

export interface ReviewOption { statement: StatementDTO; isLatest: boolean; }
export function reviewOptions(statements: StatementDTO[] | undefined, focus: StatementDTO | null): ReviewOption[]

export interface ReviewProgress { reviewed: number; total: number; pending: number; done: boolean; pendingKeys: string[]; }
export function reviewProgress(findings: ReviewFinding[], reviewedKeys: string[]): ReviewProgress

export interface ReviewCheckSummary { check: ReviewCheck; label: string; count: number; skipped: boolean; }
export function reviewCheckSummary(review: StatementReviewDTO): ReviewCheckSummary[]

export function applyReviewedDelta(current: string[], keys: string[], reviewed: boolean): string[]   (base, sin cambios)
export function splitFindings(findings: ReviewFinding[]): { transactions: ReviewTransactionFinding[]; categories: ReviewCategoryFinding[] }
export function transactionFindingNotes(finding: ReviewTransactionFinding, historyStatements: number): string[]
export function categoryFindingNote(finding: ReviewCategoryFinding, historyStatements: number): string
export function categoryFindingBadge(finding: ReviewCategoryFinding): string
export function historyCaption(review: StatementReviewDTO): string
export function statementCaption(statement: StatementDTO): string
```

- `reviewOptions`: si `statements` no es un array, lo toma como `[]` (mismo guard que
  `buildCardCycleSummary`). Arma `latestStatementPerIssuer(statements)` (de `cardCycle.ts`) con
  `isLatest: true`. Si `focus` no está entre esos, lo agrega **primero** con `isLatest: false`. No
  repite ids.
- `reviewProgress`: `reviewed` cuenta los hallazgos cuya `key` está en `reviewedKeys` (las claves
  sueltas se ignoran). `done = pending === 0`. `pendingKeys` alimenta «Marcar todo como revisado».
- `reviewCheckSummary`: una entrada por chequeo en `REVIEW_CHECK_ORDER`. Para `categoria`, `count`
  es la cantidad de hallazgos de categoría. Para el resto, la cantidad de hallazgos de movimiento que
  incluyen ese motivo (cuenta motivos, no secciones). `skipped` sale de `skippedChecks`.
- `statementCaption`: "Cierre 2026-09-25 · Vence 2026-10-06 · Saldo $ 1.234.567,89", con
  " + US$ 45,00" solo si `saldoActual.usd > 0`. Fechas nulas como "—".

Textos:

| Constante | Valores |
|---|---|
| `REVIEW_CHECK_LABELS` | Duplicados · USD inusuales · Comercios nuevos · Categorías en alza · Sin categoría |
| `REVIEW_REASON_LABELS` | ¿Duplicado? · USD inusual · Comercio nuevo · Sin categoría |
| `REVIEW_CHECK_COLORS` | duplicado `error` · usd `warning` · nuevo `info` · categoria `warning` · sin-categoria `default` |

La ventana se nombra con `historyStatements`: "el resumen anterior" con 1, "los últimos N
resúmenes" con más.

- `transactionFindingNotes`:
  - duplicado en el mismo resumen: "Mismo comercio y monto que el cargo del 2026-09-11."
  - duplicado contra un resumen anterior: "Mismo comercio y monto que un cargo del 2026-08-29, en un
    resumen anterior."
  - usd sin historia: "Sin cargos en USD de este comercio en los últimos 6 resúmenes."
  - usd en suba: "Hasta ahora, como mucho US$ 10,99 (+36,4%)."

  Las fechas van en ISO, como en el resto de la app. El porcentaje sale de `formatSignedPercent`
  (base) y el monto de `formatMoney`.
- `categoryFindingNote`: "Promedio de los últimos 6 resúmenes: $ 250.000,00" o, con `ratio = null`,
  "Sin gasto en los últimos 6 resúmenes".
- `categoryFindingBadge`: "+80,0%", o "Nueva" con `ratio = null`.
- `historyCaption`:
  - `previousStatements === 0`: "Es el primer resumen de esta tarjeta: solo se buscan duplicados y
    movimientos sin categoría."
  - `skippedChecks` incluye `categoria`: "Comparado con 1 resumen anterior. Para comparar categorías
    hacen falta 3." (en plural cuando son 2).
  - si no: "Comparado con los 6 resúmenes anteriores de esta tarjeta."

### Cliente: componentes (nuevos, en `client/src/components/`)

- **`useStatementReviewPicker.ts`**: `useStatementReviewPicker(focusStatement: StatementDTO | null)`
  → `{ isLoading, error, options: ReviewPickerOption[], selectedId, select }`.
  - Usa `useStatements()`, `reviewOptions` y `useStatementReviews(ids)` (para los pendientes de cada
    tarjeta) y `useState(focusStatement?.id ?? null)`.
  - `selectedId` efectivo: `selected ?? options[0]?.id ?? null`.
  - `ReviewPickerOption = { id, label, caption, pending: number | null }`. `label = cardLabel`.
    `caption = "vence <dueDate | —>"` si es la última, o `"recién importado · cierre <closingDate | —>"`
    si no lo es. `pending` es `null` mientras esa revisión no llegó.
- **`StatementReviewPicker.tsx`**: presentacional. `ToggleButtonGroup` exclusivo con
  `aria-label="resumen a revisar"` y un `ToggleButton` por opción (alto mínimo de 44px): label,
  caption y, a la derecha, un `Chip` `color="warning"` con los pendientes, o un
  `CheckCircleOutlineIcon` `color="success"` con `titleAccess="revisado"` si no queda nada
  (`titleAccess` y no `aria-label`, porque MUI oculta el ícono a los lectores de pantalla si no tiene
  título). Ignora la deselección (`value === null`). Se renderiza solo con 2 opciones o más.
- **`StatementReviewSection.tsx`**: el contenedor.
  `({ focusStatement = null }: StatementReviewSectionProps)`. Llama al picker y a
  `useMarkFindingsReviewed()` antes de cualquier early return. La revisión elegida la carga un
  subcomponente `SelectedReview` con `useStatementReview(selectedId)`, para tener sus propios early
  returns.
  - Picker cargando → `CircularProgress size={24}`.
  - Error → `Alert severity="error"`.
  - Sin opciones (no hay resúmenes importados) → `null`: la sección entera no aparece.
  - Si no, el título `Typography variant="h6" component="h2"` **«Revisión antes de pagar»**
    (`sx={{ mt: 4, mb: 2 }}`, igual que «Archivos importados»), el picker, y la revisión
    seleccionada: spinner o `Alert` "No se pudo cargar la revisión: {mensaje}" mientras carga o si
    falla. Si la mutación falla: `Alert severity="error"` "No se pudo guardar la revisión: {mensaje}".
- **`StatementReviewChecklist.tsx`**: presentacional.
  `({ review, onMark }: { review: StatementReviewDTO; onMark: (keys: string[], reviewed: boolean) => void })`.
  Va en un `Card` dentro de `MotionBox` `fadeUpItem` (como `CardCycleSummary`), con
  `CardContent sx={compactCardContentSx}`. De arriba hacia abajo:
  1. Encabezado: `cardLabel` (subtitle1, 600) y `statementCaption` en caption. A la derecha (si hay
     hallazgos): "4 de 7 revisados" y un `LinearProgress` determinado
     (`aria-label="progreso de la revisión"`). Si `done` y hay hallazgos, un `Chip` `color="success"`
     con el texto "Revisado".
  2. `ReconciliationBanner` con `review.statement.reconciliation` (no muestra nada si `ok`).
  3. `historyCaption(review)` en caption `text.secondary`.
  4. Fila de chips de `reviewCheckSummary`, con `flexWrap: "wrap"`:
     - `skipped` → outlined, "Comercios nuevos: sin historial".
     - `count === 0` → outlined, `color="success"`, con `CheckIcon`, "Duplicados: 0".
     - `count > 0` → relleno con `REVIEW_CHECK_COLORS`, "Duplicados: 1".
  5. Sin hallazgos → `CheckCircleOutlineIcon` en verde y "No encontramos nada raro en este resumen."
  6. Subtítulo **«Movimientos»** y una `List` de `ReviewTransactionItem`.
  7. Subtítulo **«Categorías por encima de su promedio»** y una `List` de `ReviewCategoryItem`.
  8. Acciones: `Button component={RouterLink} to="/rules"` **«Categorizar en Reglas»**, si hay algún
     `sin-categoria`; y `Button variant="outlined"` **«Marcar todo como revisado»**, si
     `pending > 0`, que llama `onMark(pendingKeys, true)`.

  Los ítems tildados **no cambian de lugar** (para que la lista no salte al tildar): solo bajan a
  `opacity: 0.6`.
- **`ReviewFindingRow.tsx`**: la fila que comparten los dos tipos de ítem.
  `({ findingKey, title, amount, reviewed, onToggle, children })`.
  `ListItem disablePadding divider` > `ListItemButton` (toda la fila tilda o destilda,
  `minHeight: MIN_TAP_SIZE`, `alignItems: "flex-start"`) >
  `Checkbox edge="start" checked tabIndex={-1} disableRipple inputProps={{ "aria-label": "revisado: <title>" }}`,
  y en la primera línea el título (`noWrap`) con el monto a la derecha. `children` son las líneas de
  abajo.
- **`ReviewTransactionItem.tsx`**: `({ finding, reviewed, historyStatements, onToggle })` sobre
  `ReviewFindingRow`.
    - Línea 1: comercio y `formatMoney(amount, currency)`.
    - Línea 2: `date`, un chip con la `category` (salvo que el motivo sea `sin-categoria`) y un
      `Chip` por motivo, con `REVIEW_REASON_LABELS` y `REVIEW_CHECK_COLORS`.
    - Línea 3: `transactionFindingNotes`, en caption.
- **`ReviewCategoryItem.tsx`**: misma fila. La categoría y `formatMoney(total, "ARS")` en la línea 1.
  `categoryFindingNote` y un `Chip color="warning"` con `categoryFindingBadge` en la línea 2.
  `aria-label` del checkbox: "revisado: <categoría>".

### Página Importar

Ya integrada por la base: `focusStatement` es el resumen del último resultado de importación
(también con `status: "duplicate"`: volver a subir un PDF ya importado es una forma de abrir su
revisión), y la `key` remonta la sección con cada resumen importado, así queda seleccionado sin
necesidad de un `useEffect`.

Orden final de la página: título → dropzone → resultado de la importación → «Gmail» →
**Revisión antes de pagar** → Archivos importados.

### Compu

```
Revisión antes de pagar
[ Visa Signature ****1234 · vence 2026-10-06  (3) ] [ ICBC · vence 2026-10-09  ✓ ]
┌─────────────────────────────────────────────────────────────────────────────┐
│ Visa Signature ****1234                                  4 de 7 revisados   │
│ Cierre 2026-09-25 · Vence 2026-10-06 · Saldo $ 1.234.567,89 + US$ 45,00     │
│                                                          ▬▬▬▬▬▬▭▭▭▭        │
│ Comparado con los 6 resúmenes anteriores de esta tarjeta.                   │
│ [Duplicados: 1] [USD inusuales: 1] [Comercios nuevos: 2] [Categorías en alza: 1] [Sin categoría: 2] │
│ Movimientos                                                                 │
│ ☐ COMERCIO UNO                                               $ 2.500,00     │
│   2026-09-12 [Comida] [¿Duplicado?]                                          │
│   Mismo comercio y monto que el cargo del 2026-09-11.                        │
│ ☑ SERVICIO EXTERIOR                                          US$ 14,99      │
│   2026-09-03 [Suscripciones] [USD inusual]                                   │
│   Hasta ahora, como mucho US$ 10,99 (+36,4%).                                │
│ Categorías por encima de su promedio                                        │
│ ☐ Supermercado                                             $ 450.000,00     │
│   Promedio de los últimos 6 resúmenes: $ 250.000,00   [+80,0%]               │
│                         [Categorizar en Reglas]  [Marcar todo como revisado] │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Mobile (`useIsMobile()`)

- Picker: `orientation="vertical"` y `fullWidth`, como `MacroAssumptionsBar`. Cada botón de 44px o
  más.
- La misma lista, sin tablas ni hojas: cada fila es un objetivo táctil de 44px o más. El comercio se
  corta con ellipsis en la primera línea, al lado del monto, y los chips bajan y hacen wrap.
- El encabezado se apila (`flexDirection: { xs: "column", md: "row" }`): primero el título y el
  progreso, y después la fila de chips (con wrap).
- Acciones apiladas en ancho completo (`fullWidth`), con `sx={tapTargetSx}`.
- No usa `BottomSheet`: no hay nada que editar.

## Tests

TDD, con fixtures sintéticos ("COMERCIO UNO", "SERVICIO EXTERIOR", "COMERCIO NUEVO"). Los archivos
con varios renders llevan `afterEach(cleanup)`. `merchantMatchKey`, `statementsBefore`, los DTOs y los
hooks ya tienen sus tests en la base.

- `server/src/stats/statementReview.test.ts` (el grueso):
  - duplicado dentro del resumen (se marca el posterior; `sameStatement: true`) y contra el resumen
    anterior a 2 días (`sameStatement: false`); el más cercano gana;
  - no es duplicado: a 4 días, otro monto, otra moneda, cuotas con distinto `installmentCurrent`
    (2/6 y 3/6), una devolución, un impuesto;
  - tres cargos iguales dan dos hallazgos;
  - USD: comercio sin historia USD → `usualUsd: null`; suba del 36 % → marcado con `usualUsd`; suba
    del 10 % → no; se compara contra el máximo; cuota vieja en USD → no; sin historia → `"usd"` en
    `skippedChecks`; "SERVICIO EXTERIOR USD 10,99" y "SERVICIO EXTERIOR X9Y8" son el mismo comercio;
  - nuevo: comercio desconocido → sí; conocido con otro código ("SPOTIFY P1" contra "SPOTIFY X9")
    → no; cuota 3/6 de un comercio desconocido → no; cuota 1/6 → sí; devolución → no;
    `previousStatements === 0` → `skippedChecks`;
  - categoría: 2× del promedio y más del 5 % del resumen → sí; 2× pero menos del 5 % → no; 1,3× → no;
    categoría ausente en la ventana → `ratio: null`; «Sin categoría» excluida; promedio con ceros en
    los resúmenes donde la categoría no estaba; menos de 3 resúmenes → `skippedChecks`; devoluciones
    que restan; USD fuera; resumen con total ≤ 0 → nada;
  - sin categoría: compras sí, pagos e impuestos no;
  - un movimiento con varios motivos da un solo hallazgo, con `reasons` en `REASON_ORDER`;
  - orden de los hallazgos y claves `tx:` / `cat:`;
  - entrada vacía → `{ findings: [], skippedChecks: ["usd", "nuevo", "categoria"] }`, sin excepción.
- `server/src/http/routes/statementReview.test.ts` (`withDb` + supertest, siembra como
  `imports.test.ts`):
  - forma del GET con dos tarjetas: la historia es solo del mismo `issuer` y solo de resúmenes más
    viejos (revisar el viejo no ve el nuevo);
  - un comercio usado en ICBC es "nuevo" en Visa;
  - un duplicado contra el resumen anterior apunta al id real de ese movimiento;
  - `reviewedKeys` es `[]` en un resumen sin marcas;
  - 404 con id inexistente y con id inválido (GET y PATCH);
  - PATCH `reviewed: true` agrega sin repetir (es idempotente); `reviewed: false` saca; 400 con
    `keys: []` y con body sin `reviewed`;
  - borrar el resumen por `DELETE /api/imports/statement/:id` y que después el GET dé 404.
- `client/src/statementReview.test.ts` (además de los de `applyReviewedDelta`):
  - `reviewOptions`: último por tarjeta, foco que no es el último va primero, foco que ya es el último
    no se repite, entrada que no es array → `[]`;
  - `reviewProgress`: ignora las claves sueltas; sin hallazgos → `done`;
  - `reviewCheckSummary`: cuenta motivos y marca `skipped`;
  - los textos de `transactionFindingNotes`, `categoryFindingNote`, `categoryFindingBadge`,
    `historyCaption` (singular y plural) y `statementCaption` (con y sin USD).
- `client/src/components/StatementReviewChecklist.test.tsx`:
  - muestra los hallazgos con sus chips y notas;
  - tocar una fila llama `onMark(["tx:…"], true)` y tocar una fila tildada, `onMark([...], false)`;
  - «Marcar todo como revisado» manda solo las pendientes;
  - estado vacío, chip "sin historial", `ReconciliationBanner` con `ok: false`, el chip «Revisado» y
    el link a `/rules` solo si hay alguna «Sin categoría».
- `client/src/components/StatementReviewSection.test.tsx` (con `fetch` mockeado como en
  `ImportPage.test.tsx`):
  - lista las tarjetas con sus pendientes y cambiar de tarjeta muestra la otra revisión;
  - con `focusStatement` viejo aparece la opción "recién importado" y queda elegida;
  - tildar hace un `PATCH` con `{ keys, reviewed }` y el checkbox queda tildado;
  - si el `PATCH` falla, aparece el aviso y el tilde vuelve al estado del server;
  - si falla el GET de una revisión, el título y el picker siguen y se ve el error;
  - sin resúmenes no renderiza el título;
  - con `emulateMobile()`: el grupo vertical y `cssFor(fila)` con `min-height:44px`.
- `client/src/pages/ImportPage.test.tsx`: test nuevo, después de importar un resumen se ve
  «Revisión antes de pagar» con sus hallazgos.

Verificación final: `bun run test`, `bun run typecheck` y `bun run build` en verde. Después, revisión
manual en `/import` a 1280px y a 390px con los resúmenes reales (la hace el usuario).

## Orden de implementación

1. **Cálculo**: `buildStatementReview` con su batería de tests. No depende de nada más.
2. **API**: `GET` y `PATCH` en el router de la base. Se valida con los tests de la ruta.
3. **Cliente puro**: el resto de `statementReview.ts`.
4. **UI**: los componentes de la checklist, el picker y la sección, el test en `ImportPage` y mobile.

## Fuera de alcance

- Detección de fraude, alertas, notificaciones o mails.
- Editar la categoría o borrar movimientos desde el checklist (para eso están Movimientos y la bandeja
  de la feature #9 en Reglas).
- Revisar resúmenes viejos desde la tabla «Archivos importados». Solo se puede revisar el último de
  cada tarjeta y el recién importado (o un viejo que se vuelva a subir).
- Badge de pendientes en el menú o en el «A pagar al cierre» del Dashboard.
- Ajustar los promedios por inflación.
- Comparar contra la otra tarjeta.
- Notas por hallazgo, y "no volver a marcar este comercio" (lista blanca).
- Persistir los hallazgos o un historial de revisiones.
- Cambiar la deduplicación por `fingerprint` de la importación. Dos cargos con el mismo comprobante,
  fecha, monto y cuota se guardan una sola vez, y esta revisión no los puede ver.
- Reemplazar los literales "Sin categoría" que ya existen en `categorize.ts` y `categoryRules.ts`.
