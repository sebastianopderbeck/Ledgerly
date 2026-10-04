# Base compartida del lote de features nuevas — diseño

Fecha: 2026-10-03
Estado: implementado en `feat/base-nuevas-features` (diseño autónomo)

## Objetivo

Once features se implementan en paralelo, cada una en su rama creada desde esta:

| Slug | Spec |
|---|---|
| flujo-de-caja | `2026-10-03-flujo-de-caja-design.md` |
| gasto-real | `2026-10-03-gasto-real-design.md` |
| suscripciones | `2026-10-03-suscripciones-design.md` |
| revision-resumen | `2026-10-03-revision-resumen-design.md` |
| ahorro-cuotas | `2026-10-03-ahorro-cuotas-design.md` |
| simulador-uva | `2026-10-03-simulador-uva-design.md` |
| patrimonio | `2026-10-03-patrimonio-design.md` |
| presupuestos | `2026-10-03-presupuestos-design.md` |
| bandeja-sin-categoria | `2026-10-03-bandeja-sin-categoria-design.md` |
| vencimientos | `2026-10-03-vencimientos-design.md` |
| importacion-gmail | `2026-10-03-importacion-gmail-design.md` |

Esta base deja en su forma **final** todo archivo que tocan dos o más features (o que es compartido
por naturaleza: DTOs, modelos, registro de routers, rutas, menú, hooks, dependencias, `.env.example`
y README), más la lógica que necesitan dos o más features. Después de esta rama, cada feature toca
solo archivos que son exclusivamente suyos, y todas las ramas mergean sin conflictos.

Donde un archivo compartido tiene que referenciar un módulo de una sola feature (una página, un
router o una sección), ese módulo existe como **stub** con su nombre de export y su interfaz de
props finales: la feature lo reemplaza.

## Decisiones tomadas

### Menú y rutas

Orden final del menú (sidebar de compu):

Dashboard · Cuotas · Créditos · Auto · **Patrimonio** · Sueldo · **Vencimientos** · Contexto ·
**Flujo** · **Presupuestos** · Movimientos · **Suscripciones** · Reglas · Importar

Respeta la ubicación que pidió cada spec: Patrimonio después de Auto, Vencimientos entre Sueldo y
Contexto, Flujo justo después de Contexto, Presupuestos después de Flujo y antes de Movimientos, y
Suscripciones justo después de Movimientos. Todas van en «Más», que queda: Créditos, Auto,
Patrimonio, Sueldo, Vencimientos, Contexto, Flujo, Presupuestos, Suscripciones y Reglas.

| Ruta | Página (stub) | Ícono |
|---|---|---|
| `/patrimonio` | `NetWorthPage` | `AccountBalanceWalletOutlined` |
| `/vencimientos` | `VencimientosPage` | `EventNoteOutlined` |
| `/flujo` | `CashFlowPage` | `SavingsOutlined` |
| `/presupuestos` | `BudgetsPage` | `TrackChangesOutlined` |
| `/suscripciones` | `SubscriptionsPage` | `AutorenewOutlined` |

Cada stub muestra solo su título `h4` («Patrimonio», «Vencimientos», «Flujo de caja»,
«Presupuestos», «Suscripciones»). `client/src/App.test.tsx` verifica que cada ruta muestre ese título:
la página final tiene que mostrarlo también mientras carga (todas las specs ya lo hacen).

### API, modelos y DTOs

- **Routers** registrados en `server/src/http/app.ts` (stubs sin handlers):
  `/api/statements/:id/review` (`statementReviewRouter`, con `mergeParams`, montado **antes** de
  `/api/statements`), `/api/cash-flow`, `/api/subscriptions`, `/api/net-worth`, `/api/gmail` y
  `/api/budgets`. Las rutas nuevas de stats (`/installment-purchases`) y de reglas (`/inbox`) cuelgan
  de routers que ya existen y son de una sola feature.
- **Modelos** en `server/src/db/models.ts`: `reviewedKeys` en `Statement`, y las colecciones
  `HiddenSubscription`, `ManualAsset`, `Budget`, `GmailSyncRun` y `GmailAttachment`, tal como las
  definen sus specs.
- **Mappers** `toManualAssetDTO` y `toBudgetDTO` en `server/src/http/mappers.ts`. Los de Gmail viven en
  `server/src/gmail/gmailMappers.ts`, que es de esa feature.
- **DTOs** de las ocho features con API en `shared/src/dtos.ts`, con tests en `dtos.test.ts`.
- **`isoDateSchema`**: el refine de la spec de patrimonio rompía con fechas mal formadas (zod corre el
  refine aunque falle el regex y `toISOString()` de una fecha inválida tira). Se valida con
  `Date.parse` primero.
- **Hooks** de todas las features en `client/src/api/hooks.ts`. `useNetWorth` devuelve `null` (no
  `undefined`) cuando el server responde 204: React Query 5 marca como error una query que resuelve
  `undefined`, y la página tiene que mostrar el estado vacío.
- **Constantes de categoría**: `UNCATEGORIZED_CATEGORY = "Sin categoría"` en `shared/src/schemas.ts`
  para el server, y `UNCATEGORIZED` en `client/src/categoryOptions.ts` para el cliente. El cliente
  importa solo **tipos** de `@ledgerly/shared`: un valor arrastraría zod al bundle. Por el mismo
  motivo, `MANUAL_ASSET_TYPE_LABELS` (shared) es para el server; el cliente arma su propio mapa
  tipado con `Record<ManualAssetType, string>`.

### Lógica compartida

| Necesidad | Módulo | Lo usan |
|---|---|---|
| Aritmética de meses y días (server) | `server/src/stats/months.ts`: `monthOf`, `addMonths`, `monthsBetween` (número), `monthRange` (lista inclusiva), `addDays`, `daysBetween`, `daysInMonth`, `lastDayOfMonth`, `addMonthsClamped` | flujo, suscripciones (`addMonthsClamped`), ahorro-cuotas (`addMonthsClamped` en lugar de `addMonthsToDate`), patrimonio (`monthRange` en lugar de su `monthsBetween`), presupuestos |
| Cotización a una fecha sin red | `server/src/stats/rateOnDate.ts`: `rateOnDate(fecha, points)` y `pointOnDate(fecha, points)` (devuelve el punto, para informar la fecha) | flujo, patrimonio (`pointOnDate` en lugar de `valueAtOrBefore`) |
| Vencimiento efectivo de un resumen | `server/src/stats/statementDueDate.ts`: `statementDueDate({ dueDate, closingDate })` y `DIAS_CIERRE_A_VENCIMIENTO` | flujo (en lugar de `cardDueDate`), ahorro-cuotas (en lugar de `statementPaymentDate`) |
| Clave de comercio | `server/src/stats/merchantKey.ts`: `merchantKey`, `canonicalMerchantKeys`, `merchantDisplayName`, `merchantSearchTerm`, `merchantMatchKey`, `merchantWords` | suscripciones, revision-resumen (`merchantMatchKey`) |
| Resúmenes anteriores de una tarjeta | `statementsBefore` en `server/src/stats/lastStatement.ts` | revision-resumen |
| Fechas de calendario (cliente) | `client/src/isoDate.ts` | vencimientos, gasto-real (`addMonths` en lugar de `shiftMonth`) |
| Inflación | `client/src/inflationIndex.ts`: `inflationRates`, `latestInflation`, `latestInflationPeriod`, `inflationFactor`, `inflationFactorBetween`, `buildDeflator` | gasto-real, ahorro-cuotas, presupuestos |
| Montos tipeados | `client/src/moneyInput.ts`: `parseMoneyInput` y `formatMoneyInput` | patrimonio, presupuestos (en lugar de `parseAmount.ts`), simulador-uva (en lugar de `parseMontoPesos`) |
| Variaciones con signo | `formatSignedPercent` en `client/src/format.ts` | gasto-real, simulador-uva (en lugar de `signedPercent`) |
| Link a Movimientos filtrado | `client/src/filters/transactionsLink.ts` (y `monthRange` exportado desde `globalFilters.ts`) | suscripciones, presupuestos, bandeja-sin-categoria |
| Categorías elegibles | `client/src/categoryOptions.ts`: `UNCATEGORIZED` y `categoryOptions` | bandeja-sin-categoria, presupuestos |
| Hoja de formulario | `client/src/components/ResponsiveSheet.tsx` (`BottomSheet` en mobile, `Dialog` en compu, `actions` opcional) | patrimonio, presupuestos |
| Revisado optimista | `applyReviewedDelta` en `client/src/statementReview.ts` | `useMarkFindingsReviewed` (hooks) y revision-resumen |

Decisiones de unificación:

- **Vencimiento estimado = cierre + 12 días.** Flujo proponía 10 y ahorro-cuotas 12. Se toma 12,
  que es lo que ahorro-cuotas midió en todos los resúmenes ICBC importados. Los ejemplos de flujo
  siguen valiendo: un cierre el 25/9 vence el 7/10, en octubre.
- **Dos claves de comercio en un solo módulo.** Suscripciones agrupa con las **dos primeras**
  palabras (`merchantKey`) y devuelve `""` si no queda ninguna; la revisión compara con **todas** las
  palabras (`merchantMatchKey`) y, si no queda ninguna, con el comercio entero en mayúsculas. Las dos
  normalizan igual (`merchantWords`): sin tildes, en mayúsculas, la puntuación como espacio y sin las
  palabras con dígitos ni `USD`.
- **Un solo parser de montos.** Lee el formato argentino (`1.234.567,89`; puntos de a tres sin coma
  son de miles; si no, el punto es decimal), ignora `$`, `US$` y espacios, acepta `0` y rechaza
  negativos y basura. Cada feature valida su mínimo: el simulador y presupuestos exigen `> 0`. Con
  esta regla `"1.5"` es 1,5 (la spec del simulador lo leía como 15), y se acepta.
- **Links a Movimientos con un orden fijo de parámetros**: `year`, `category`, `currency`, `from`,
  `to`, `search`. Suscripciones queda en `/transactions?year=all&search=STREAMFLIX` (su spec lo
  escribía al revés).
- **Inflación**: `inflationFactor` cuenta 0 % en los meses sin IPC (presupuestos, y la base de
  `buildDeflator` para gasto-real); `inflationFactorBetween` usa el supuesto y marca `estimated`
  (ahorro-cuotas). `buildDeflator` reproduce exactamente `deflateToLatest` de `realSalary.ts`.
- **Lo que queda en cada feature** (un solo usuario real): `toCashFlowCard`, `installmentFloor`,
  `projectPlanPayment` e `incomeByMonth` (flujo); `buildInstallmentPurchases` (ahorro-cuotas);
  `lastClosedMonth` (presupuestos; gasto-real usa su propia cobertura en el cliente);
  `latestClosingByIssuer` (suscripciones); `latestUsdOficial` y `suggestPattern` (bandeja);
  `uvaDeHoy` y `duracion` (simulador); `estimarCuotaCredito` (vencimientos); `formatDateTime` y
  `joinWithY` (gmail); `snackbarAboveNavSx` (bandeja).

### Páginas existentes con slots

- **Dashboard**: la tarjeta «Gasto real (pesos de hoy)» con `RealSpendingPanel` (stub que no
  renderiza nada) va después de «Evolución mensual».
- **Importar**: título → dropzone → resultado de la subida → `GmailImportSection` (stub que muestra
  solo el encabezado «Gmail») → `StatementReviewSection` (stub que no renderiza nada, con
  `key={focusStatement?.id ?? "latest"}` y `focusStatement` del último resumen subido) → «Archivos
  importados».
- `ImportPage.test.tsx` queda preparado para las dos secciones reales: responde siempre
  `/gmail/status` (deshabilitado), `/statements` (`[]`) y `/statements/<id>/review` (una revisión
  sintética que cumple el schema), y los resultados de importar un resumen traen un `StatementDTO`
  completo con `id`. Ya incluye el test de que «Gmail» va antes de «Archivos importados».

### Lo que la base no toca a propósito

Archivos existentes que modifica una sola feature quedan para esa feature: `stats.ts` y su test
(ahorro-cuotas), `InstallmentsPage` (ahorro-cuotas), `CreditsPage` y `macroSignals.ts` (simulador),
`realSalary.ts` y `DashboardPage.test.tsx` (gasto-real), `categorize.ts`, `categoryRules.ts`,
`RulesPage`, `RuleSheet.tsx` y `RefreshDataButton.tsx` (bandeja), e `import.ts`, `errors.ts`,
`importStatement.ts` y `server/src/index.ts` (gmail).

## Tests

- Server: `months.test.ts`, `rateOnDate.test.ts`, `statementDueDate.test.ts`, `merchantKey.test.ts`,
  `statementsBefore` en `lastStatement.test.ts`, modelos nuevos en `models.test.ts` y mappers en
  `mappers.test.ts`.
- Shared: todos los DTOs nuevos en `dtos.test.ts` y `UNCATEGORIZED_CATEGORY` en `schemas.test.ts`.
- Cliente: `isoDate`, `inflationIndex`, `moneyInput`, `categoryOptions`, `transactionsLink`,
  `monthRange`, `formatSignedPercent`, `applyReviewedDelta`, `ResponsiveSheet`, los hooks más
  delicados (`hooks.test.tsx`), las rutas nuevas (`App.test.tsx`) y el menú (`navItems.test.ts`,
  `MoreSheet.test.tsx`, `Layout.test.tsx`).

`bun run test`, `bun run typecheck` y `bun run build` en verde.
