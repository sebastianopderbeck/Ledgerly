# Bandeja de movimientos sin categoría — diseño

Fecha: 2026-10-03
Estado: aprobado para plan (diseño autónomo). Rama `feat/bandeja-sin-categoria`, creada desde
`feat/base-nuevas-features`.

## Objetivo

Hoy, cuando un comercio no matchea ninguna regla, sus movimientos quedan en **«Sin categoría»** y la
única forma de arreglarlo es ir a Reglas, inventar un patrón a mano, crear la regla y apretar
«Reaplicar a todo» (que además pisa categorías manuales). Nada te dice cuántos quedan ni cuáles
pesan más.

Esta feature agrega, **arriba de las reglas en la página Reglas**, una **bandeja**:

- agrupa por comercio los movimientos que quedaron en «Sin categoría», con un **indicador** de cuántos
  quedan pendientes;
- los ordena por **monto total** (default) o por **frecuencia**;
- para cada comercio propone un **patrón** sacado del nombre y deja elegir una **categoría
  existente**; «Crear regla» crea la regla y **la aplica en el acto** a los movimientos pendientes;
- en el celular usa una lista + hoja inferior, con objetivos táctiles de 44px.

## Lo que ya trae la base

`feat/base-nuevas-features` deja en su forma final los archivos que comparten varias features. Esta
feature **no los toca**:

- **DTOs** en `shared/src/dtos.ts` (con test en `dtos.test.ts`): `uncategorizedGroupSchema`,
  `uncategorizedInboxDtoSchema`, `inboxRuleResultDtoSchema` y los tipos `UncategorizedGroupDTO`,
  `UncategorizedInboxDTO`, `InboxRuleResultDTO` (forma exacta en la sección API).
- **Constante del server**: `UNCATEGORIZED_CATEGORY = "Sin categoría"` en `shared/src/schemas.ts`.
- **Hooks** en `client/src/api/hooks.ts`: `useUncategorizedInbox()` (`queryKey: ["rules-inbox"]`,
  `GET /category-rules/inbox`) y `useCreateInboxRule()` (`POST /category-rules/inbox/rules`,
  `onSuccess: () => qc.invalidateQueries()`).
- **Categorías elegibles** en `client/src/categoryOptions.ts` (con test): `UNCATEGORIZED` y
  `categoryOptions(categories, rules)`. Presupuestos también lo usa.
- **Link a Movimientos** en `client/src/filters/transactionsLink.ts`: `transactionsLink({ year,
  category, currency, month, search })`, con orden fijo de parámetros.
- Las rutas nuevas cuelgan del router existente `categoryRulesRouter`, ya montado en
  `/api/category-rules`: `server/src/http/app.ts` no cambia.

## Decisiones tomadas

- **El grupo es el patrón sugerido, no el `merchant` crudo.** Los resúmenes traen variantes del mismo
  comercio con referencias que cambian (`STEAMGAMES.COM 4259522985`, `STEAMGAMES.COM 4259518112`):
  agrupar por `suggestPattern(merchant)` las junta, y la regla con ese patrón cubre a todas.
- **Pendiente = `category: "Sin categoría"` y `type: "purchase"`.** Pagos, impuestos y
  bonificaciones también quedan sin categoría, pero no entran en ningún gráfico por categoría
  (`/stats/by-category` filtra `type: "purchase"`), así que serían ruido en la bandeja.
- **Todo el historial.** La bandeja no usa el filtro de año global: las reglas valen para todos los
  años y Reglas no tiene barra de filtros.
- **Regla siempre `contains`, prioridad 100, `source: "user"`.** Igual que el alta de compu y la
  «Nueva regla» de mobile. Regex queda para el formulario normal.
- **Solo categorías existentes**: unión de las categorías de movimientos (`GET
  /api/transactions/categories`) y las de las reglas, sin «Sin categoría» (`categoryOptions` de la
  base). Una categoría nueva se sigue creando con «Nueva regla» / el formulario de alta.
- **Crear y aplicar en un solo request**, y la aplicación es **acotada**: solo la regla nueva, solo
  sobre movimientos en «Sin categoría» (de cualquier `type`). Nunca toca un movimiento ya
  categorizado ni una categoría manual, por eso **no pide confirmación** (a diferencia de «Reaplicar
  a todo» en mobile).
- **Elegir categoría no dispara nada**: «Crear regla» es un toque explícito. Con el patrón ya
  sugerido son dos toques (categoría + Crear). En el celular hay un toque previo para abrir la hoja
  del comercio. No hay «Deshacer»: si te equivocaste, editás la regla y reaplicás, como hoy.
- **Orden por monto en pesos equivalentes**: `totalArs + totalUsd × último dólar oficial` (el último
  `usd_oficial` de `MacroSeries`, sin llamadas de red). Sin cotización cargada, los USD no pesan en el
  orden y la bandeja lo avisa.
- **Frecuencia = cantidad de movimientos.** Cada cuota de una compra en cuotas es un movimiento
  aparte, igual que en los gráficos.
- **El orden se resuelve en el cliente** (sin refetch) y no se persiste.
- **Se ven 8 comercios** y «Mostrar todos (N)», para que una bandeja larga no tape las reglas.
- **Patrón mínimo de 3 caracteres**, validado en cliente y server. En el cliente, además, «Crear
  regla» se deshabilita si el patrón editado ya no coincide con el comercio del grupo, y se avisa si
  también cubre otros comercios de la bandeja.
- **Mientras se crea una regla, todos los «Crear regla» quedan deshabilitados** (`creating`): un
  doble toque no crea dos reglas.
- **El indicador vive en la página Reglas** (chip con el número de pendientes en el título de la
  sección). Sin badge en el menú.
- **El cliente sigue importando solo tipos de `@ledgerly/shared`.** Importar un valor arrastraría zod
  al bundle. Por eso `UNCATEGORIZED` existe en el server (re-exporta `UNCATEGORIZED_CATEGORY` de
  shared) y en el cliente (`categoryOptions.ts`), y `MIN_RULE_PATTERN_LENGTH` una vez en cada lado;
  los tests de cada lado fijan el valor.
- **«Ver movimientos»** lleva a Movimientos filtrado por «Sin categoría» y por el patrón, en todos los
  años, para revisar qué es antes de categorizar.
- **El resultado se ve en un `Snackbar`** que vive fuera de la tarjeta de la bandeja: cuando la regla
  categoriza el último comercio, la bandeja pasa a «vacía» y el aviso sigue a la vista.

## Datos

No hay colecciones ni campos nuevos, y `server/src/db/models.ts` no cambia.

| Colección (modelo) | Campos que se usan | Para qué |
|---|---|---|
| `Transaction` (`TransactionModel`) | `category`, `type`, `merchant`, `descriptionRaw`, `amount`, `currency` (`ARS`/`USD`), `date`, `categorySource` | pendientes (`category === "Sin categoría"`, `type === "purchase"`), agrupado, totales y fecha del último; aplicación de la regla (`descriptionRaw` + `merchant`, como `matchRule`) |
| `CategoryRule` (`CategoryRuleModel`) | `priority`, `matchType`, `pattern`, `category`, `source`, `enabled` | alta de la regla nueva; en el cliente, las categorías de las reglas suman opciones |
| `MacroSeries` (`MacroSeriesModel`) | `serie === "usd_oficial"`, `fecha` (`YYYY-MM-DD`), `valor` | dólar oficial más reciente para el orden por monto |

Índices: `category` y `type` ya están indexados en `transactionSchema`; `MacroSeries` tiene
`{ serie: 1, fecha: 1 }` único.

`merchant` siempre viene de `normalizeMerchant` (`server/src/parsers/normalize.ts`): mayúsculas tal
como el resumen, espacios colapsados, sin montos, sin `Cuota N/M`/`C.NN/NN` y sin los prefijos
`MERPAGO*`, `PEDIDOSYA*`, `DLO*`, `PAYU*AR*`, `INI*`.

## Cálculo

Todo lo que decide algo es una función pura con test propio. Las rutas solo consultan y delegan.

### Constantes

- Server, `server/src/rules/categorize.ts`: `export const UNCATEGORIZED = UNCATEGORIZED_CATEGORY;`
  (importado de `@ledgerly/shared`). Reemplaza el literal en `categorize` y en `POST
  /api/category-rules/apply`.
- Server, `server/src/rules/suggestPattern.ts`: `export const MIN_RULE_PATTERN_LENGTH = 3;` y
  `export const MAX_PATTERN_WORDS = 3;`.
- Server, `server/src/http/routes/categoryRules.ts`: `const INBOX_RULE_PRIORITY = 100;`.
- Cliente, `client/src/categoryOptions.ts` (base): `export const UNCATEGORIZED = "Sin categoría";`.
- Cliente, `client/src/uncategorizedInbox.ts`: `export const MIN_RULE_PATTERN_LENGTH = 3;` y
  `export const INBOX_PREVIEW_SIZE = 8;`.

### Patrón sugerido — `server/src/rules/suggestPattern.ts`

```ts
export function suggestPattern(merchant: string): string
```

1. `clean = merchant.toUpperCase().replace(/\s+/g, " ").trim()`.
2. Corte en el **primer dígito**: si `clean` no tiene dígitos, `cut = clean`. Si lo tiene, se corta
   al inicio de la palabra que lo contiene (`clean.lastIndexOf(" ", digitAt) + 1`); si esa palabra
   es la primera, se corta en el dígito mismo (`clean.slice(0, digitAt)`).
3. Se queda con las primeras `MAX_PATTERN_WORDS` palabras y saca separadores finales
   (`/[\s*.\-#/]+$/`).
4. Si lo que queda tiene menos de `MIN_RULE_PATTERN_LENGTH` caracteres, devuelve `clean` entero.

Invariante (con test): el resultado es siempre un **prefijo** de `clean`, así que una regla
`contains` con ese patrón matchea el comercio del que salió (`matchRule` arma el haystack con
`descriptionRaw` + `merchant` en mayúsculas).

| `merchant` | Patrón |
|---|---|
| `COMERCIO UNO` | `COMERCIO UNO` |
| `NETFLIX.COM 12345` | `NETFLIX.COM` |
| `MERCADOLIBRE*3CUOTAS` | `MERCADOLIBRE` |
| `UBER *TRIP HELP.UBER.COM` | `UBER *TRIP HELP.UBER.COM` |
| `UBER * 123` | `UBER` |
| `LA PANADERIA DE PEPE` | `LA PANADERIA DE` |
| `YPF 1234` | `YPF` |
| `7 ELEVEN` | `7 ELEVEN` (fallback: el corte queda vacío) |
| `AB 123` | `AB 123` (fallback: `AB` es muy corto) |
| `  cafe   martinez ` | `CAFE MARTINEZ` |

### Armado de la bandeja — `server/src/stats/uncategorizedInbox.ts`

```ts
export interface PendingPurchase { merchant: string; amount: number; currency: Currency; date: string; }
export function buildUncategorizedInbox(rows: PendingPurchase[], usdRate: number | null): UncategorizedInboxDTO
```

- Agrupa `rows` por `suggestPattern(merchant)`. Por grupo:
  - `pattern`: la clave;
  - `merchants`: variantes distintas de `merchant`, de la más frecuente a la menos (empate:
    alfabético);
  - `count`: cantidad de filas;
  - `totalArs` / `totalUsd`: suma de `amount` por moneda. Se suma `amount` sin mirar `direction`,
    igual que `/stats/by-category`, para que el total coincida con la porción «Sin categoría» del
    gráfico de categorías;
  - `equivalentArs = totalArs + (usdRate === null ? 0 : totalUsd × usdRate)`;
  - `lastDate`: la `date` más reciente (`YYYY-MM-DD`).
- Orden de `groups`: `equivalentArs` desc, después `count` desc, después `pattern` (`localeCompare`).
- Devuelve `{ pendingCount: rows.length, usdRate, groups }`.

### Dólar oficial más reciente — `server/src/fx/latestUsdOficial.ts`

```ts
export async function latestUsdOficial(): Promise<number | null>
```

`MacroSeriesModel.findOne({ serie: "usd_oficial" }).sort({ fecha: -1 }).lean()` → `valor`, o `null`
si la serie está vacía (nunca se corrió `seed:macro` ni el botón de actualizar datos).

### Qué categoriza la regla nueva — `server/src/rules/categorize.ts`

```ts
export interface RuleCandidate { id: string; descriptionRaw: string; merchant: string; }
export function idsMatchingRule(candidates: RuleCandidate[], rule: RuleInput): string[]
```

Devuelve los `id` para los que `matchRule(descriptionRaw, merchant, [rule]) !== null`. Reusa la
misma semántica que el import y «Reaplicar a todo»: `contains` sin mayúsculas sobre
`descriptionRaw + " " + merchant` (los caracteres especiales de regex valen literal), y un regex
inválido no matchea.

### Cliente — `client/src/uncategorizedInbox.ts`

```ts
export type InboxOrder = "amount" | "count";
export interface InboxRuleDraft { pattern: string; category: string; }
export interface PatternCheck { valid: boolean; hint: string | null; }
export interface InboxFeedback { severity: "success" | "info" | "error"; message: string; }

export function sortInboxGroups(groups: UncategorizedGroupDTO[], order: InboxOrder): UncategorizedGroupDTO[]
export function checkPattern(pattern: string, group: UncategorizedGroupDTO, groups: UncategorizedGroupDTO[]): PatternCheck
export function inboxSummary(pendingCount: number, groupCount: number): string
export function pendingLabel(pendingCount: number): string
export function groupTotalLabel(group: UncategorizedGroupDTO): string
export function groupCaption(group: UncategorizedGroupDTO): string
export function missingUsdRate(inbox: UncategorizedInboxDTO): boolean
export function inboxTransactionsHref(pattern: string): string
export function inboxRuleFeedback(result: InboxRuleResultDTO): InboxFeedback
```

- `sortInboxGroups`: no muta la entrada. `"amount"` → `equivalentArs` desc, `count` desc, `pattern`.
  `"count"` → `count` desc, `equivalentArs` desc, `pattern`.
- `checkPattern` (con `needle = pattern.trim().toUpperCase()`; un grupo "coincide" si alguna de sus
  `merchants` en mayúsculas contiene `needle`):
  - `needle.length < MIN_RULE_PATTERN_LENGTH` → `{ valid: false, hint: "Mínimo 3 caracteres" }`;
  - el grupo propio no coincide → `{ valid: false, hint: "No coincide con «<merchants[0]>»" }`;
  - coinciden `n > 1` grupos → `{ valid: true, hint: "También cubre 1 comercio más de la bandeja" }` /
    `"También cubre <n-1> comercios más de la bandeja"`;
  - si no → `{ valid: true, hint: null }`.
  Es una vista previa por comercio: el server matchea también contra `descriptionRaw`, así que puede
  categorizar algo más. El número real llega en la respuesta. Un patrón en minúsculas o con espacios
  alrededor es válido (se compara en mayúsculas y recortado).
- `inboxSummary(23, 9)` → `"23 movimientos en 9 comercios"`; `inboxSummary(1, 1)` →
  `"1 movimiento en 1 comercio"`.
- `pendingLabel(8)` → `"8 movimientos pendientes"`; `pendingLabel(1)` → `"1 movimiento pendiente"`. Es
  el `aria-label` del chip.
- `groupTotalLabel`: los montos no nulos con `formatMoney`, unidos por `" · "` (por ejemplo
  `"$ 9.000,00"`, `"US$ 10,00"`, `"$ 9.000,00 · US$ 10,00"`); si los dos son 0,
  `formatMoney(0, "ARS")`.
- `groupCaption`: `"6 movimientos · último 2026-09-28"` (`"1 movimiento · …"` en singular), más
  `" · 2 variantes"` si `merchants.length > 1`.
- `missingUsdRate`: `usdRate === null` y algún grupo con `totalUsd > 0`.
- `inboxTransactionsHref(pattern)` = `transactionsLink({ year: ALL_YEARS, category: UNCATEGORIZED,
  search: pattern })`. Con `"PANADERIA LA ESPIGA"` da
  `/transactions?year=all&category=Sin+categor%C3%ADa&search=PANADERIA+LA+ESPIGA`. `search` en
  Movimientos filtra `merchant` sin mayúsculas (con el texto escapado) y el patrón es subcadena del
  comercio, así que aparecen todos sus movimientos.
- `inboxRuleFeedback({ rule, categorized })`:
  - `> 0` → `success`, `"Regla «<pattern>» → <category>: <n> movimientos categorizados."` (singular
    con 1: `"1 movimiento categorizado."`);
  - `0` → `info`, `"Regla «<pattern>» → <category> creada, pero no coincidió con ningún movimiento
    pendiente."`.

### Cliente — `client/src/categoryOptions.ts` (base, sin cambios)

```ts
export function categoryOptions(categories: string[], rules: Pick<CategoryRuleDTO, "category">[]): string[]
```

Unión de `categories` y `rules.map((r) => r.category)`, con `trim`, sin vacíos, sin duplicados, sin
`UNCATEGORIZED`, ordenada con `localeCompare(…, "es")`.

### Casos borde

| Situación | Comportamiento |
|---|---|
| No queda nada pendiente | Chip `0` en verde y «No quedan movimientos sin categoría.»; sin orden ni lista |
| Sin `usd_oficial` en `MacroSeries` | `usdRate: null`; los USD no suman al orden por monto y, si hay grupos con USD, se ve el aviso |
| Comercio cuyo patrón sugerido tiene menos de 3 caracteres | `suggestPattern` devuelve el comercio entero; si igual es corto, el campo muestra «Mínimo 3 caracteres» y hay que editarlo |
| Patrón editado que ya no matchea el comercio del grupo | «Crear regla» deshabilitado con «No coincide con «…»» |
| Patrón que también cubre otros comercios | Se deja crear y se avisa «También cubre N comercios más de la bandeja»; al crear, esos grupos también salen |
| Patrón con caracteres de regex (`UBER *TRIP`, `NETFLIX.COM`) | Valen literal: la regla es `contains` |
| Doble toque en «Crear regla» | El botón queda deshabilitado mientras el request está en curso |
| La regla categoriza el último comercio pendiente | La bandeja pasa a vacía y el aviso del resultado sigue a la vista |
| La regla no categoriza nada (carrera, o matchea solo por `descriptionRaw` en otro lado) | 201 con `categorized: 0` y aviso `info` |
| No hay categorías existentes | Compu: el autocomplete dice «No hay categorías»; mobile: «Todavía no hay categorías. Creá una desde «Nueva regla».» |
| Ya existe una regla igual pero deshabilitada | Se crea otra; no se deduplica |
| Comercio con nombre largo en el celular | Una sola línea con puntos suspensivos; el total no se corre |
| Meses sin resúmenes | No aplica: la bandeja es un corte del estado actual, no una serie por mes |

## API

Las dos rutas van en el router existente `server/src/http/routes/categoryRules.ts` (ya montado en
`/api/category-rules`), así que `server/src/http/app.ts` no cambia. Ninguna choca con `PATCH/DELETE
/:id` ni con `POST /apply`.

### `GET /api/category-rules/inbox`

```ts
const [pending, usdRate] = await Promise.all([
  TransactionModel.find({ category: UNCATEGORIZED, type: "purchase" })
    .select({ merchant: 1, amount: 1, currency: 1, date: 1 }).lean(),
  latestUsdOficial(),
]);
res.json(buildUncategorizedInbox(pending.map(toPendingPurchase), usdRate));
```

`toPendingPurchase` pasa `date` a `toISOString().slice(0, 10)` y castea `currency` a `Currency`.

Respuesta (`UncategorizedInboxDTO`):

```json
{
  "pendingCount": 8,
  "usdRate": 1415,
  "groups": [
    { "pattern": "STEAMGAMES.COM", "merchants": ["STEAMGAMES.COM 4259522985", "STEAMGAMES.COM 4259518112"],
      "count": 2, "totalArs": 0, "totalUsd": 19.98, "equivalentArs": 28271.7, "lastDate": "2026-09-14" },
    { "pattern": "PANADERIA LA ESPIGA", "merchants": ["PANADERIA LA ESPIGA"],
      "count": 6, "totalArs": 21400, "totalUsd": 0, "equivalentArs": 21400, "lastDate": "2026-09-28" }
  ]
}
```

### `POST /api/category-rules/inbox/rules`

Body: `{ "pattern": "PANADERIA LA ESPIGA", "category": "Comida" }`.

1. `pattern` y `category` con `trim` (si no son string, `""`).
2. `pattern.length < MIN_RULE_PATTERN_LENGTH` → `400 { error: "El patrón tiene que tener al menos 3
   caracteres" }`.
3. `category === ""` o `category === UNCATEGORIZED` → `400 { error: "Elegí una categoría" }`.
4. `CategoryRuleModel.create({ priority: 100, matchType: "contains", pattern, category, source:
   "user", enabled: true })`. El patrón se guarda como vino, recortado (sin pasarlo a mayúsculas: el
   match no distingue).
5. `TransactionModel.find({ category: UNCATEGORIZED }).select({ descriptionRaw: 1, merchant: 1
   }).lean()` → `idsMatchingRule(…, regla)`.
6. Si hay ids: `TransactionModel.updateMany({ _id: { $in: ids }, category: UNCATEGORIZED }, {
   category, categorySource: "rule" })`.
7. `201` con `InboxRuleResultDTO`: `{ rule: toCategoryRuleDTO(doc), categorized: modifiedCount }`.

Ante un 400 no se crea ninguna regla.

### DTOs — `shared/src/dtos.ts` (base)

```ts
export const uncategorizedGroupSchema = z.object({
  pattern: z.string(),
  merchants: z.array(z.string()),
  count: z.number().int(),
  totalArs: z.number(),
  totalUsd: z.number(),
  equivalentArs: z.number(),
  lastDate: z.string(),
});

export const uncategorizedInboxDtoSchema = z.object({
  pendingCount: z.number().int(),
  usdRate: z.number().nullable(),
  groups: z.array(uncategorizedGroupSchema),
});

export const inboxRuleResultDtoSchema = z.object({
  rule: categoryRuleDtoSchema,
  categorized: z.number().int(),
});

export type UncategorizedGroupDTO = z.infer<typeof uncategorizedGroupSchema>;
export type UncategorizedInboxDTO = z.infer<typeof uncategorizedInboxDtoSchema>;
export type InboxRuleResultDTO = z.infer<typeof inboxRuleResultDtoSchema>;
```

### Hooks — `client/src/api/hooks.ts` (base)

```ts
export function useUncategorizedInbox() {
  return useQuery({ queryKey: ["rules-inbox"], queryFn: () => apiFetch<UncategorizedInboxDTO>("/category-rules/inbox") });
}
export function useCreateInboxRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { pattern: string; category: string }) =>
      apiFetch<InboxRuleResultDTO>("/category-rules/inbox/rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
```

`invalidateQueries()` sin filtro, como `useApplyRules`: cambian categorías, así que se refrescan la
bandeja, las reglas, `["categories"]`, Movimientos y todos los gráficos. Editar una categoría en
Movimientos o «Reaplicar a todo» ya invalidan todo, así que la bandeja se actualiza sola en esos
casos.

## UI

### Página — `client/src/pages/RulesPage.tsx`

Orden nuevo:

1. Título «Reglas de categoría» + «Reaplicar a todo» (sin cambios).
2. Aviso de «Reaplicar a todo» (sin cambios).
3. **`<UncategorizedInbox rules={rules} />`** (nuevo).
4. `<Typography variant="h6" sx={{ mb: 2 }}>Reglas</Typography>` (nuevo, separa la bandeja de la
   lista).
5. `rulesView` (compu: formulario + tabla; mobile: `RulesMobile`), sin cambios.

La bandeja maneja su propia carga y su error con early returns (`CircularProgress size={24}` /
`Alert`), como `ImportedFilesSection`: no bloquea la lista de reglas.

### Sección — `client/src/components/UncategorizedInbox.tsx`

`({ rules }: UncategorizedInboxProps)`, con la lógica en el hook
`client/src/components/useInboxSection.ts`, que también exporta el contrato de las dos vistas:

```ts
export type CreateInboxRule = (draft: InboxRuleDraft, onCreated?: () => void) => void;
export interface InboxViewProps {
  groups: UncategorizedGroupDTO[];
  allGroups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  onCreate: CreateInboxRule;
}
export interface InboxSection {
  inbox: UncategorizedInboxDTO | undefined;
  isLoading: boolean;
  error: Error | null;
  order: InboxOrder;
  changeOrder: (event: MouseEvent<HTMLElement>, order: InboxOrder | null) => void;
  showAll: boolean;
  toggleShowAll: () => void;
  visibleGroups: UncategorizedGroupDTO[];
  allGroups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  createRule: CreateInboxRule;
  feedback: InboxFeedback | null;
  dismissFeedback: () => void;
}
export function useInboxSection(rules: CategoryRuleDTO[]): InboxSection
```

- `useUncategorizedInbox()`, `useCategories()` y `useCreateInboxRule()`.
- `allGroups = useMemo(() => sortInboxGroups(inbox.groups, order))`;
  `visibleGroups = showAll ? allGroups : allGroups.slice(0, INBOX_PREVIEW_SIZE)`.
- `categories = useMemo(() => categoryOptions(categoryNames, rules))`.
- `createRule` llama `mutate(draft, { onSuccess: (r) => { setFeedback(inboxRuleFeedback(r));
  onCreated?.(); }, onError: (e) => setFeedback({ severity: "error", message: e.message }) })`.
- `changeOrder` ignora `null` (no se puede deseleccionar el orden).

Estructura (`Card component="section"` con `aria-labelledby` apuntando al título, `CardContent` con
`compactCardContentSx`, `mb: 3`):

- **Encabezado** (flex, wrap): `Typography variant="h6"` «Sin categoría» + `Chip size="small"` con
  `pendingCount` (`color="warning"` si hay pendientes, `"success"` si es 0;
  `aria-label={pendingLabel(pendingCount)}`) + `Typography variant="body2" color="text.secondary"` con
  `inboxSummary(...)` (solo si hay pendientes). A la derecha (`ml: "auto"` en compu), `ToggleButtonGroup exclusive size="small"
  aria-label="Ordenar por"` con «Monto» (`amount`) y «Frecuencia» (`count`).
- **Vacío**: `Typography color="text.secondary"` «No quedan movimientos sin categoría.» y nada más.
- **Lista**: `InboxTable` en compu, `InboxList` en mobile (`useIsMobile()`), con `groups={visibleGroups}
  allGroups={allGroups} categories={categories} creating={creating} onCreate={createRule}`.
- **«Mostrar todos (N)» / «Mostrar menos»** (`Button size="small"`) solo si `allGroups.length >
  INBOX_PREVIEW_SIZE`.
- **Aviso de dólar**: si `missingUsdRate(inbox)`, `Typography variant="caption"` «Sin cotización del
  dólar cargada: los montos en USD no cuentan para ordenar por monto.»
- **Feedback**: `Snackbar` (6 s) con `Alert severity={feedback.severity} onClose={dismissFeedback}`,
  anclado abajo al centro con `snackbarAboveNavSx` (ver abajo), igual que `RefreshDataButton`. Va
  fuera de la `Card`, así sobrevive al paso a «vacía».

### Borrador de una regla — `client/src/components/useInboxRuleDraft.ts`

```ts
export interface InboxRuleDraftState {
  pattern: string;
  changePattern: (event: ChangeEvent<HTMLInputElement>) => void;
  category: string | null;
  changeCategory: (category: string | null) => void;
  check: PatternCheck;
  draft: InboxRuleDraft | null;
}
export function useInboxRuleDraft(group: UncategorizedGroupDTO, groups: UncategorizedGroupDTO[]): InboxRuleDraftState
```

`pattern` arranca en `group.pattern`; `category` en `null`; `check = useMemo(checkPattern(…))`;
`draft` es `{ pattern: pattern.trim(), category }` solo si `check.valid && category !== null`.
Lo usan la fila de compu y la hoja de mobile.

### Compu — `client/src/components/InboxTable.tsx`

`Table size="small"` con columnas **Comercio · Movs. · Total · Patrón · Categoría · (acciones)**. Una
fila `InboxGroupRow` por grupo, `key={group.pattern}`:

- **Comercio**: `merchants[0]` en `fontWeight: 600` y debajo `Typography variant="caption"` con
  `groupCaption(group)`; si hay variantes, `Tooltip` con `merchants.join(" · ")`.
- **Movs.**: `count`. **Total**: `groupTotalLabel(group)`.
- **Patrón**: `TextField size="small"` monoespaciado (reusa `patternInputProps`, que pasa a
  exportarse desde `RuleSheet.tsx`, más `aria-label="Patrón"`), `error={!check.valid}`,
  `helperText={check.hint}`.
- **Categoría**: `Autocomplete size="small"` (sin `freeSolo`), `options={categories}`, ancho 200,
  `noOptionsText="No hay categorías"`, `renderInput` con label «Categoría».
- **Acciones**: `Button variant="contained" size="small"` «Crear regla», `disabled={!draft ||
  creating}`, que llama `onCreate(draft)`; e `IconButton` con `ReceiptLongOutlinedIcon`,
  `component={RouterLink}`, `to={inboxTransactionsHref(group.pattern)}` y `aria-label="ver
  movimientos de <merchants[0]>"`.

Elegir categoría + «Crear regla» = dos acciones. El grupo desaparece al refrescar la bandeja.

### Mobile — `client/src/components/InboxList.tsx` + `InboxRuleSheet.tsx`

**Lista** (sin tabla, mismo estilo que `TransactionsList`): `List` con un `ListItemButton` por grupo
(`divider`, `minHeight: 56`):

- primera línea: `merchants[0]` (`noWrap`) y a la derecha `groupTotalLabel(group)` en negrita;
- segunda línea: `groupCaption(group)` en `caption`.

Tocarlo abre `InboxRuleSheet` (vía `useSheetTarget<UncategorizedGroupDTO>()`).

**Hoja** — `InboxRuleSheet({ open, group, groups, categories, creating, onClose, onCreate })`:
`BottomSheet` con `title={group.merchants[0]}` y un `InboxRuleForm` interno con `key={group.pattern}`:

1. `RecordFields`: «Movimientos» (`count`), «Total» (`groupTotalLabel`), «Último» (`lastDate`) y, si
   hay más de una, «Variantes» (`merchants.join(" · ")`).
2. `TextField` «Patrón» `fullWidth`, con `patternInputProps` (sin autocapitalizar, sin autocorrector,
   monoespaciado), `error`/`helperText` de `check`.
3. `Typography variant="subtitle2"` «Categoría» y una **grilla de 2 columnas de `Button`s**, uno por
   categoría (`key={category}`): `variant="contained"` la elegida y `"outlined"` el resto,
   `aria-pressed`, `tapTargetSx` (44px). Sin categorías: «Todavía no hay categorías. Creá una desde
   «Nueva regla».»
4. Acciones (`display: flex`, `gap: 1`): `Button fullWidth component={RouterLink}` «Ver movimientos» y
   `Button fullWidth variant="contained"` «Crear regla» (`disabled={!draft || creating}`), ambos con
   `tapTargetSx`. «Crear regla» llama `onCreate(draft, onClose)`: la hoja se cierra solo si el server
   respondió bien; con error queda abierta y el `Snackbar` muestra el mensaje.

Además, en mobile:

- el `ToggleButtonGroup` de orden va `fullWidth` debajo del encabezado y cada `ToggleButton` lleva
  `tapTargetSx`;
- «Mostrar todos (N)» va `fullWidth` con `tapTargetSx`;
- el `Snackbar` queda arriba de la barra inferior (`snackbarAboveNavSx`).

### Refactor de paso

- `client/src/components/snackbarSx.ts` (nuevo): `export const snackbarAboveNavSx: SxProps<Theme> =
  { bottom: { xs: \`calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 8px)\`, md: 24 } };`.
  `RefreshDataButton.tsx` deja su `snackbarSx` local y usa este. Se ve igual.
- `client/src/components/RuleSheet.tsx`: `patternInputProps` pasa a `export const`.

### Textos

| Dónde | Texto |
|---|---|
| Título de la sección | «Sin categoría» |
| Resumen | «23 movimientos en 9 comercios» / «1 movimiento en 1 comercio» |
| Vacío | «No quedan movimientos sin categoría.» |
| Orden | «Monto» · «Frecuencia» (grupo «Ordenar por») |
| Columnas | «Comercio» · «Movs.» · «Total» · «Patrón» · «Categoría» |
| Botones | «Crear regla» · «Ver movimientos» · «Mostrar todos (N)» · «Mostrar menos» |
| Ayudas del patrón | «Mínimo 3 caracteres» · «No coincide con «X»» · «También cubre N comercios más de la bandeja» |
| Resultado | «Regla «X» → Comida: 6 movimientos categorizados.» · «Regla «X» → Comida creada, pero no coincidió con ningún movimiento pendiente.» |
| Sin dólar | «Sin cotización del dólar cargada: los montos en USD no cuentan para ordenar por monto.» |
| Encabezado de la lista de reglas | «Reglas» |

## Tests

TDD, cada pieza arranca en rojo. Los archivos de cliente con varios renders llevan
`afterEach(cleanup)` y los que emulan viewport o stubean `fetch`, `vi.unstubAllGlobals()`. Fixtures
sintéticos (comercios inventados: `PANADERIA LA ESPIGA`, `KIOSCO EL SOL`, `STEAMGAMES.COM …`).

**Server**

- `server/src/rules/suggestPattern.test.ts`: la tabla de casos de arriba; invariante: para una lista
  de salidas de `normalizeMerchant`, el patrón es prefijo del comercio en mayúsculas y
  `matchRule(m, m, [{ matchType: "contains", pattern, … }])` no es `null`.
- `server/src/stats/uncategorizedInbox.test.ts`: dos variantes con referencias distintas caen en un
  grupo; totales por moneda; `equivalentArs` con cotización y con `null`; `lastDate` es la más
  reciente; orden por `equivalentArs`, desempate por `count` y por `pattern`; variantes ordenadas por
  frecuencia; sin filas → `{ pendingCount: 0, usdRate, groups: [] }`.
- `server/src/rules/categorize.test.ts`: `UNCATEGORIZED` vale «Sin categoría»; `idsMatchingRule`
  matchea por `descriptionRaw` o por `merchant` sin mayúsculas, toma literal los caracteres de regex
  en `contains`, devuelve `[]` sin coincidencias y con un regex inválido; `categorize` sigue
  devolviendo `UNCATEGORIZED` sin match.
- `server/src/http/routes/categoryRules.test.ts` (`withDb` + supertest):
  - `GET /inbox` solo cuenta `Sin categoría` + `purchase` (deja afuera un pago, un impuesto, una
    compra categorizada y una manual); la respuesta pasa `uncategorizedInboxDtoSchema.parse`; toma el
    `usd_oficial` de `fecha` más reciente entre dos puntos; sin `MacroSeries`, `usdRate: null`.
  - `POST /inbox/rules` crea la regla (`source: "user"`, `contains`, prioridad 100), categoriza solo
    los pendientes que matchean (una compra ya categorizada y una manual con el mismo comercio no
    cambian; un impuesto pendiente que matchea sí), responde `201` con `categorized` correcto y pasa
    `inboxRuleResultDtoSchema.parse`; recorta patrón y categoría; patrón de 2 caracteres → 400 y
    ninguna regla nueva; categoría vacía o «Sin categoría» → 400.
  - El test actual de `/apply` sigue verde con `UNCATEGORIZED`.

**Cliente**

- `client/src/uncategorizedInbox.test.ts`: `sortInboxGroups` en los dos órdenes con desempates y sin
  mutar; los cuatro casos de `checkPattern` (más minúsculas y espacios); `inboxSummary` en singular y
  plural; `groupTotalLabel` con ARS, USD, ambos y ninguno; `groupCaption` con y sin variantes;
  `missingUsdRate`; `pendingLabel` en singular y plural; `inboxTransactionsHref` codifica categoría
  y búsqueda; `inboxRuleFeedback` con 0, 1 y n.
- `client/src/categoryOptions.test.ts` (base): unión, sin duplicados, sin vacíos, sin «Sin
  categoría», orden alfabético en español.
- `client/src/components/UncategorizedInbox.test.tsx` (`fetch` mockeado por URL):
  - compu: chip y resumen; orden por monto por defecto y por frecuencia al cambiar; patrón
    precargado y «Crear regla» deshabilitado sin categoría; las opciones son las existentes sin «Sin
    categoría» y suman las de las reglas; crear manda `POST /api/category-rules/inbox/rules` con `{
    pattern, category }` y muestra el resultado; «Crear regla» queda deshabilitado mientras el
    request está en curso; al categorizar el último comercio se ve el vacío y el aviso; patrón que no
    coincide deshabilita y explica; el link de «Ver movimientos» tiene el `href` esperado; vacío; 8
    grupos + «Mostrar todos (10)»; aviso sin cotización.
  - mobile (`emulateMobile()`): lista sin `table`; tocar un comercio abre la hoja con su nombre;
    «Comida» + «Crear regla» manda el POST y cierra la hoja; un 400 deja la hoja abierta y muestra el
    error; `min-height:44px` (con `cssFor`) en los botones de categoría, «Crear regla», los toggles de
    orden y «Mostrar todos»; un comercio largo va en una línea (`noWrap`).
- `client/src/components/InboxRuleSheet.test.tsx`: el patrón no se autocapitaliza ni se corrige; los
  botones de categoría marcan `aria-pressed`; «Crear regla» habilitado solo con categoría y patrón
  válido; llama `onCreate` con el patrón recortado; sin categorías muestra el aviso.
- `client/src/pages/RulesPage.test.tsx`: el mock de `fetch` pasa a responder por URL
  (`/category-rules/inbox` → bandeja con un grupo `KIOSCO EL SOL`, `/transactions/categories` →
  categorías, `/category-rules` → `[rule]`), porque hoy cualquier GET con `/category-rules` devuelve
  la lista de reglas y rompería la bandeja. Los tests actuales siguen igual (la bandeja no usa
  `UBER`, ni «editar», ni tabla en mobile). Nuevo: la sección «Sin categoría» aparece antes del
  encabezado «Reglas».

**Cierre**: `bun run test`, `bun run typecheck` y `bun run build` en verde. Revisión a 390px:
hoja, objetivos táctiles, `Snackbar` arriba de la barra inferior.

## Archivos

Nuevos:

- `server/src/rules/suggestPattern.ts` (+ test)
- `server/src/stats/uncategorizedInbox.ts` (+ test)
- `server/src/fx/latestUsdOficial.ts`
- `client/src/uncategorizedInbox.ts` (+ test)
- `client/src/components/UncategorizedInbox.tsx` (+ test), `useInboxSection.ts`,
  `useInboxRuleDraft.ts`, `InboxTable.tsx`, `InboxList.tsx`, `InboxRuleSheet.tsx` (+ test),
  `snackbarSx.ts`

Modificados: `server/src/rules/categorize.ts` (+ test), `server/src/http/routes/categoryRules.ts`
(+ test), `client/src/pages/RulesPage.tsx` (+ test), `client/src/components/RuleSheet.tsx`,
`client/src/components/RefreshDataButton.tsx`.

Sin cambios (los trae la base o no hacen falta): `shared/*`, `client/src/api/hooks.ts`,
`client/src/categoryOptions.ts`, `client/src/filters/transactionsLink.ts`, `App.tsx`, `navItems.ts`,
`server/src/http/app.ts`, `server/src/http/mappers.ts`, `server/src/db/models.ts`, los `package.json`
y `bun.lock`.

## Orden de implementación

1. **Motor del server**: `suggestPattern`, `UNCATEGORIZED` + `idsMatchingRule`,
   `buildUncategorizedInbox`. Puro, sin DB.
2. **API**: `latestUsdOficial`, las dos rutas y sus tests con `withDb`.
3. **Motor del cliente**: `uncategorizedInbox.ts`.
4. **UI compu**: `snackbarSx`, `patternInputProps`, `useInboxRuleDraft`, `useInboxSection`,
   `InboxTable`, `UncategorizedInbox`; después el cableado en `RulesPage` y el ajuste del mock de
   `RulesPage.test.tsx`.
5. **UI mobile**: `InboxRuleSheet`, `InboxList` y el cambio de vista en `UncategorizedInbox`.

## Fuera de alcance

- Badge con pendientes en el menú lateral, la barra inferior o «Más».
- «Deshacer» la regla recién creada.
- Reglas regex o con prioridad distinta de 100 desde la bandeja (siguen en el formulario normal).
- Crear categorías nuevas desde la bandeja.
- Sugerir la categoría automáticamente (por similitud o por IA).
- Marcar un comercio como "no categorizar nunca" (hoy se resuelve con una categoría tipo «Otros»).
- Categorizar movimientos sueltos desde la bandeja (eso ya está en Movimientos).
- Aviso después de importar un resumen ("quedaron N sin categoría"): le corresponde a la revisión del
  resumen (feature #4), que puede linkear a `/rules`.
- Filtrar la bandeja por año, tarjeta o moneda, y persistir el orden elegido.
- Pagos, impuestos y bonificaciones sin categoría.
