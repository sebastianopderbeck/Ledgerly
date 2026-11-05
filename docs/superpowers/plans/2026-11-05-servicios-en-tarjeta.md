# Servicios que llegan en la tarjeta — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar un comercio de la tarjeta como servicio desde Movimientos, para verlo en la página Servicios y que el Flujo lo cuente como servicio (separado de Tarjetas en los meses con resumen, proyectado en los estimados).

**Architecture:** Colección nueva `CardServiceModel` (una clave de comercio por marca) con `GET/POST/DELETE /api/card-services`. La agrupación de variantes de un comercio se extrae de la detección de suscripciones a `merchantKey.ts` y la usan suscripciones, la lista de servicios de tarjeta y el Flujo. `buildCashFlow` (puro) recibe `serviciosArs` por resumen y una entrada nueva `cardServices`, y reparte igual que hoy con las suscripciones. El cliente suma el botón en Movimientos y una sección «En la tarjeta» en Servicios.

**Tech Stack:** TypeScript, Express, Mongoose, Zod (`@ledgerly/shared`), React 18 + MUI + TanStack Query, Vitest + Testing Library + mongodb-memory-server, Bun.

**Spec:** `docs/superpowers/specs/2026-11-05-servicios-en-tarjeta-design.md`

## Global Constraints

- Todo se hace en el worktree `.claude/worktrees/servicios-en-tarjeta` (rama `feat/servicios-en-tarjeta`). Los comandos corren desde ahí.
- Commits con pathspec explícito, mensaje `tipo(scope): …` en castellano, **sin** trailer ni mención de Claude. Después de cada commit: `git push -u origin feat/servicios-en-tarjeta`. Nunca a `main`, nunca PR.
- Nada de comentarios en el código. Nada de `any`. Componentes funcionales con destructuring en la firma; lógica de más de 15 líneas va a un hook propio; condicionales y mapeos antes del `return`; `key` por id, nunca por índice; carga y error con returns tempranos.
- Sin datos reales del usuario en código, tests, commits ni textos de GitHub. Ejemplos sintéticos: `GASCO`, `CAFE SERVIC` / `CAFE SERVICIO`.
- Textos copiados tal cual del spec:
  - Server: «Movimiento inválido», «Movimiento no encontrado», «Este comercio no tiene un nombre reconocible», «Clave inválida».
  - Botón: «Es un servicio». `aria-label` de la tabla: «Marcar {comercio} como servicio».
  - Snackbar: «Agregado a Servicios» / «No pudimos marcarlo como servicio».
  - Sección: «En la tarjeta». Confirmación: «¿Sacar «{nombre}» de Servicios? Sus cargos vuelven a contar en Tarjetas.»
  - Bajada de Servicios: «Lo que pagás todos los meses: luz, gas, agua, internet, expensas. Cargá a mano lo que pagás fuera de la tarjeta; lo que llega en el resumen marcalo desde Movimientos con «Es un servicio». Se restan en el Flujo.»
- Un cargo de servicio de tarjeta es `type: "purchase"`, `direction: "debit"`, `isInstallment: false`, `currency: "ARS"`, `amount > 0`.
- Correr un archivo de tests: `bunx vitest run <ruta>`. Todo: `bun run test`. Tipos: `bun run typecheck`.
- Nunca escribir en Atlas. La verificación con datos reales es contra una copia local.

## Review Focus

1. **Resumen con saldo menor que suscripciones + servicios** (pago anticipado, devolución): Tarjetas nunca negativa y `egresos` igual que sin marca. Test en la Task 5.
2. **Variante del nombre** (marca hecha sobre «CAFE SERVICIO», cargos como «CAFE SERVIC»): cuenta en Servicios, no aparece en Suscripciones y `DELETE` con la clave canónica la borra. Tests en las Tasks 1 y 4.
3. **Servicio marcado cuyo último cargo es viejo** (meses sin cargos): la proyección arranca después del último cierre y el monto crece con un exponente por cada mes desde el último cargo, sin repetir meses. Test en la Task 5.
4. **Servicio de una tarjeta que ese mes ya tiene resumen** (cargo nuevo después del cierre): no se suma la proyección, así no se cuenta dos veces. Test en la Task 5.
5. **Página Servicios con solo servicios de tarjeta** (ninguno cargado a mano): no muestra el vacío ni «No hay servicios activos», muestra KPIs y la sección. Test en la Task 8.

---

### Task 1: Agrupación de comercios compartida

**Files:**
- Modify: `server/src/stats/merchantKey.ts`
- Modify: `server/src/stats/subscriptions.ts` (`hasMark` pasa a usar `groupHasMark`)
- Test: `server/src/stats/merchantKey.test.ts`

**Interfaces:**
- Produces (en `merchantKey.ts`):
  - `merchantGroups(rawKeys: string[]): Map<string, Set<string>>`: clave canónica → variantes del grupo, con `canonicalMerchantKeys`. Ignora claves vacías.
  - `groupHasMark(canonical: string, rawKeys: ReadonlySet<string>, marks: ReadonlySet<string>): boolean`: el `hasMark` de hoy, movido.
  - `markedRawKeys(rawKeys: string[], marks: ReadonlySet<string>): Set<string>`: todas las variantes de los grupos marcados.
  - `groupOf(key: string, rawKeys: string[]): Set<string>`: la canónica y las variantes del grupo de `key`, calculado sobre `[...rawKeys, key]`.

- [ ] **Step 0: Preparar el worktree**

Run: `bun install --frozen-lockfile`
Expected: termina sin errores.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
describe("merchantGroups", () => {
  it("junta las variantes truncadas bajo la clave más corta", () => {
    expect(merchantGroups(["CAFE SERVICIO", "CAFE SERVIC", "GASCO", ""])).toEqual(new Map([
      ["CAFE SERVIC", new Set(["CAFE SERVIC", "CAFE SERVICIO"])],
      ["GASCO", new Set(["GASCO"])],
    ]));
  });
});

describe("markedRawKeys", () => {
  it("una marca en una variante marca todo el grupo", () => {
    expect(markedRawKeys(["CAFE SERVIC", "CAFE SERVICIO", "GASCO"], new Set(["CAFE SERVICIO"])))
      .toEqual(new Set(["CAFE SERVIC", "CAFE SERVICIO"]));
  });
  it("sin marcas no devuelve nada", () => {
    expect(markedRawKeys(["GASCO"], new Set())).toEqual(new Set());
  });
});

describe("groupOf", () => {
  it("devuelve la canónica y las variantes del grupo de la clave", () => {
    expect(groupOf("CAFE SERVICIO", ["CAFE SERVIC", "GASCO"])).toEqual(new Set(["CAFE SERVIC", "CAFE SERVICIO"]));
  });
  it("una clave sin movimientos es su propio grupo", () => {
    expect(groupOf("OTRO", [])).toEqual(new Set(["OTRO"]));
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `bunx vitest run server/src/stats/merchantKey.test.ts`
Expected: FAIL, las funciones no existen.

- [ ] **Step 3: Implementar las cuatro funciones y mover `hasMark`**

`groupHasMark` es el cuerpo de `hasMark` de `subscriptions.ts`; ahí se borra `hasMark` y `detectSubscriptionRuns` usa `groupHasMark`.

- [ ] **Step 4: Correr merchantKey y subscriptions**

Run: `bunx vitest run server/src/stats/merchantKey.test.ts server/src/stats/subscriptions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/merchantKey.ts server/src/stats/merchantKey.test.ts server/src/stats/subscriptions.ts
git commit -m "refactor(server): agrupación de comercios compartida"
git push -u origin feat/servicios-en-tarjeta
```

---

### Task 2: Schemas compartidos y modelo de la marca

**Files:**
- Modify: `shared/src/dtos.ts` (schemas después de `isActiveFixedService`; tipos después de `FixedServiceUpdateDTO`)
- Modify: `server/src/db/models.ts`
- Test: `shared/src/dtos.test.ts`, `server/src/db/models.test.ts`
- Docs: `docs/superpowers/specs/2026-11-05-servicios-en-tarjeta-design.md` y este plan (ya están en el worktree sin commitear; van en este commit)

**Interfaces:**
- Produces:
  - `cardServiceDtoSchema` (`{ key, nombre, issuer: issuerSchema, cardLabel, ultimoMonto: number, ultimoCargo: string }`) y `cardServiceInputSchema` (`{ transactionId: string }`, `.strict()`), como en el spec.
  - tipos `CardServiceDTO`, `CardServiceInput`.
  - `CardServiceModel` (colección `cardservices`): `{ userId: userIdPath, key: String requerido }`, `timestamps: { createdAt: "markedAt", updatedAt: false }`, índice único `{ userId: 1, key: 1 }`. `"CardService"` en `USER_SCOPED_MODEL_NAMES`.

- [ ] **Step 1: Escribir los tests que fallan**

- `dtos.test.ts`: `cardServiceDtoSchema` acepta `{ key: "GASCO", nombre: "GASCO", issuer: "visa_signature", cardLabel: "Visa", ultimoMonto: 20000, ultimoCargo: "2026-09-20" }` y rechaza `issuer: "otra"`; `cardServiceInputSchema` rechaza una clave extra.
- `models.test.ts`:
  - `it("una marca de servicio guarda la clave una sola vez y registra cuándo se marcó")`, igual al de `HiddenSubscriptionModel` con `markedAt`.
  - La lista ordenada de `USER_SCOPED_MODEL_NAMES` suma `"CardService"`.
  - «los índices únicos empiezan por userId» suma `CardService: ["userId", "key"]`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `bunx vitest run shared/src/dtos.test.ts server/src/db/models.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar schemas, tipos y modelo**

- [ ] **Step 4: Correr y ver que pasan**

Run: `bunx vitest run shared/src/dtos.test.ts server/src/db/models.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/dtos.ts shared/src/dtos.test.ts server/src/db/models.ts server/src/db/models.test.ts docs/superpowers/specs/2026-11-05-servicios-en-tarjeta-design.md docs/superpowers/plans/2026-11-05-servicios-en-tarjeta.md
git commit -m "feat(server): marca de servicio de tarjeta"
git push
```

---

### Task 3: Lógica pura de servicios de tarjeta

**Files:**
- Create: `server/src/stats/cardServices.ts`
- Test: `server/src/stats/cardServices.test.ts`

**Interfaces:**
- Consumes: `merchantGroups`, `groupHasMark` (Task 1); `CardServiceDTO` (Task 2); `merchantKey`, `merchantDisplayName`.
- Produces:
  - `interface CardServiceTx { statementId: string; date: string; merchant: string; amount: number; currency: Currency; direction: Direction; type: TxType; isInstallment: boolean; issuer: Issuer; cardLabel: string }` (`date` en `YYYY-MM-DD`).
  - `isCardServiceCharge(tx: CardServiceTx): boolean` (la regla de Global Constraints).
  - `interface CardServiceGroup { key: string; charges: CardServiceTx[] }` (`key` = canónica; `charges` por fecha ascendente).
  - `cardServiceGroups(txs: CardServiceTx[], marks: ReadonlySet<string>): CardServiceGroup[]`: agrupa solo los cargos que pasan `isCardServiceCharge` y tienen `merchantKey` no vacía; deja los grupos con marca.
  - `toCardServiceDTO(group: CardServiceGroup): CardServiceDTO`: del último cargo por fecha salen `nombre` (`merchantDisplayName`), `issuer`, `cardLabel`, `ultimoCargo`; `ultimoMonto` es la suma, redondeada a centavos, de los cargos del grupo con el `statementId` del último cargo.
  - `cardServiceList(groups: CardServiceGroup[]): CardServiceDTO[]`: `toCardServiceDTO` de cada grupo, ordenada por `nombre` (`localeCompare`).

- [ ] **Step 1: Escribir los tests que fallan**

Con un helper `cargo(overrides)` que arma un `CardServiceTx` de `GASCO` en pesos:
- `it("solo cuenta compras en pesos, en un pago, del comercio marcado")`: con un cargo válido, uno en USD, uno en cuotas, un crédito y otro comercio, `cardServiceGroups(..., new Set(["GASCO"]))` devuelve un grupo `GASCO` con el cargo válido solamente.
- `it("una marca en una variante del nombre vale para todo el grupo")`: cargos `CAFE SERVIC` y `CAFE SERVICIO`, marca `CAFE SERVICIO` → un grupo con key `CAFE SERVIC` y los dos cargos.
- `it("sin marca no hay servicios")` → `[]`.
- `it("el último monto suma los cargos del resumen más reciente")`: cargos `2026-08-20` 18.000 (resumen `s1`), `2026-09-05` 9.000 y `2026-09-20` 11.000,5 (resumen `s2`), merchant del último `GASCO 1234` → `toCardServiceDTO` da `{ key: "GASCO", nombre: "GASCO", ultimoMonto: 20000.5, ultimoCargo: "2026-09-20" }` más `issuer` y `cardLabel` del último.
- `it("la lista sale ordenada por nombre")`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `bunx vitest run server/src/stats/cardServices.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `server/src/stats/cardServices.ts`**

- [ ] **Step 4: Correr y ver que pasan**

Run: `bunx vitest run server/src/stats/cardServices.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/cardServices.ts server/src/stats/cardServices.test.ts
git commit -m "feat(server): cargos y resumen de los servicios de tarjeta"
git push
```

---

### Task 4: Rutas de servicios de tarjeta y exclusión de suscripciones

**Files:**
- Create: `server/src/http/loadCardServices.ts`
- Create: `server/src/http/routes/cardServices.ts`
- Modify: `server/src/http/app.ts` (montar después de `/api/fixed-services`)
- Modify: `server/src/http/loadSubscriptions.ts`
- Modify: `server/src/http/routes/subscriptions.ts` (`POST /manual`)
- Test: `server/src/http/routes/cardServices.test.ts` (nuevo), `server/src/http/routes/subscriptions.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces:
  - `loadCardServiceGroups(userId: Types.ObjectId): Promise<CardServiceGroup[]>`: si el usuario no tiene marcas devuelve `[]` sin leer movimientos; si tiene, lee `TransactionModel.find({ userId, type: "purchase", direction: "debit", isInstallment: false, currency: "ARS" }).lean()`, lo pasa a `CardServiceTx` y llama a `cardServiceGroups`.
  - `unmarkCardServiceGroup(userId: Types.ObjectId, key: string): Promise<void>`: con las `merchantKey` de esos mismos movimientos, `groupOf(key, rawKeys)` y `CardServiceModel.deleteMany({ userId, key: { $in: [...grupo] } })`.
  - `cardServicesRouter` en `/api/card-services`:
    - `GET /` → `cardServiceList(await loadCardServiceGroups(userId))`.
    - `POST /` con `cardServiceInputSchema` → 204; errores como en el spec (400 «Movimiento inválido» si el body no parsea o el movimiento no es cargo de servicio, 404 «Movimiento no encontrado», 400 «Este comercio no tiene un nombre reconocible»). `updateOne({ userId, key }, { $setOnInsert: { key } }, { upsert: true })`.
    - `DELETE /:key` → valida la clave como `keyParamOf` de suscripciones (vacía o más de 60: 400 «Clave inválida») y llama a `unmarkCardServiceGroup` → 204.
  - `loadSubscriptionInputs` deja afuera de `txs` los movimientos cuya `merchantKey` está en `markedRawKeys(todasLasClaves, marcasDeServicio)`.
  - `POST /api/subscriptions/manual` llama a `unmarkCardServiceGroup(userId, key)` junto con lo que ya hace.

- [ ] **Step 1: Escribir los tests de rutas que fallan**

`cardServices.test.ts`, con `withDb()`, `withAuthedApi`, `ownedBy` y un `seedVisa` como el de `subscriptions.test.ts` (cargos `GASCO` en pesos, categoría «Servicios»):
- `it("sin marcas devuelve la lista vacía")`.
- `it("marcar un movimiento lista el servicio con su último cargo")`: POST con el id de un cargo `GASCO` → 204; GET → `[{ key: "GASCO", nombre: "GASCO", issuer: "visa_signature", cardLabel: "Visa Signature", ultimoMonto, ultimoCargo }]`.
- `it("marcar dos veces deja una sola marca")`: `CardServiceModel.countDocuments({ userId })` es 1.
- `it("rechaza cuotas y dólares")`: 400 «Movimiento inválido» en los dos.
- `it("no marca movimientos de otro usuario ni ids inválidos")`: 404 «Movimiento no encontrado».
- `it("marcar no toca la marca de suscripción")`: con `ManualSubscriptionModel` de `GASCO`, sigue existiendo después del POST.
- `it("quitar con la clave canónica borra la marca de una variante")`: cargos `CAFE SERVIC` y `CAFE SERVICIO`, marca `CAFE SERVICIO`; `DELETE /api/card-services/CAFE%20SERVIC` → 204 y no quedan marcas.
- `it("no lista una marca sin cargos")`: marca `NADA` sin movimientos → GET `[]`.

`subscriptions.test.ts`:
- `it("un comercio marcado como servicio no aparece como suscripción aunque tenga marca manual")`: `streamflixAndNoise()` + `CardServiceModel` con `merchantKey("STREAMFLIX.COM x")` → ningún item con ese `key`; después de borrar la marca vuelve a aparecer.
- `it("marcar como suscripción quita la marca de servicio del grupo")`: POST `/api/subscriptions/manual` → `CardServiceModel.countDocuments` es 0.

- [ ] **Step 2: Correr y ver que fallan**

Run: `bunx vitest run server/src/http/routes/cardServices.test.ts server/src/http/routes/subscriptions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `loadCardServices.ts`, el router, el montaje, la exclusión y el cambio de `POST /manual`**

- [ ] **Step 4: Correr y ver que pasan**

Run: `bunx vitest run server/src/http`
Expected: PASS (incluye `isolation.test.ts` y `app.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add server/src/http/loadCardServices.ts server/src/http/routes/cardServices.ts server/src/http/routes/cardServices.test.ts server/src/http/app.ts server/src/http/loadSubscriptions.ts server/src/http/routes/subscriptions.ts server/src/http/routes/subscriptions.test.ts
git commit -m "feat(server): marcar y quitar servicios de tarjeta"
git push
```

---

### Task 5: Servicios de tarjeta en el Flujo (lógica pura)

**Files:**
- Modify: `server/src/stats/cashFlow.ts`
- Test: `server/src/stats/cashFlow.test.ts` (el helper `statement()` suma `serviciosArs: 0`)

**Interfaces:**
- Produces:
  - `CashFlowStatement.serviciosArs: number`.
  - `servicesByStatement(charges: { statementId: string; amount: number }[]): Map<string, number>`.
  - `statementServicesArs(statement: Pick<CashFlowStatement, "saldoArs" | "saldoUsd" | "suscripcionesArs" | "suscripcionesUsd" | "serviciosArs">, rate: number | null): number` = el mínimo entre `serviciosArs`, el saldo positivo en pesos menos la parte en pesos de suscripciones (`min(suscripcionesArs, positive(saldoArs))`), y `statementAmountArs − statementSubscriptionsArs`. Nunca negativo.
  - `StatementTotal` suma `servicios`; `splitStatement` da `tarjeta = monto − suscripciones − servicios`.
  - `interface CashFlowCardService { issuer: string; monto: number; ultimoCargo: string }` y `CashFlowInput.cardServices?: CashFlowCardService[]`.
  - `paymentSchedule(card: Pick<CashFlowCard, "baseMonth" | "closingDate">, cobro: Pick<CashFlowSubscription, "proximoCobro" | "cadencia">, ultimoMes: string): { mes: string; cobro: number }[]`: el loop de hoy de `subscriptionPaymentMonths`, devolviendo también el índice del cobro (0 = `proximoCobro`). `subscriptionPaymentMonths` pasa a ser `paymentSchedule(...).map(({ mes }) => mes)`.
  - `cardServicePayments(card, service: CashFlowCardService, ultimoMes: string, aumentoMensual: number): { mes: string; monto: number }[]`: `paymentSchedule(card, { proximoCobro: addMonthsClamped(ultimoCargo, 1), cadencia: "mensual" }, ultimoMes)` con `monto × (1 + aumentoMensual) ** (cobro + 1)`.
  - `FlowContext.serviceCharges: { issuer: string; mes: string; monto: number }[]`, armado en `buildCashFlow` con las tarjetas del mismo emisor y `input.inflacion?.esperadaMensual ?? 0`.
  - `EstimatedCard` suma `servicios: number` y `conServicios: boolean`.
  - `closedMonth`: `servicios` = servicios cargados del mes + `servicios` de los resúmenes.
  - `projectedMonth`: `servicios` = cargados (proyectados) + `servicios` de los resúmenes reales + `servicios` de las tarjetas estimadas. La nota `estimadoServicios(...)` aparece si los cargados del mes suman más de 0 o alguna tarjeta estimada tiene `conServicios`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
describe("servicesByStatement", () => {
  it("suma los cargos de cada resumen", () => {
    expect(servicesByStatement([
      { statementId: "a", amount: 10_000 }, { statementId: "a", amount: 5_000 }, { statementId: "b", amount: 7_000 },
    ])).toEqual(new Map([["a", 15_000], ["b", 7_000]]));
  });
});

describe("statementServicesArs", () => {
  const base = { saldoArs: 100_000, saldoUsd: 0, suscripcionesArs: 0, suscripcionesUsd: 0, serviciosArs: 20_000 };
  it("separa los servicios del resumen", () => expect(statementServicesArs(base, null)).toBe(20_000));
  it("no pasa de lo que queda después de las suscripciones", () =>
    expect(statementServicesArs({ ...base, saldoArs: 12_000, suscripcionesArs: 5_000, serviciosArs: 10_000 }, null)).toBe(7_000));
  it("con saldo negativo no separa nada", () => expect(statementServicesArs({ ...base, saldoArs: -1_000 }, null)).toBe(0));
  it("no pasa del monto del resumen con dólares negativos", () =>
    expect(statementServicesArs({ ...base, saldoArs: 30_000, saldoUsd: -10, serviciosArs: 25_000 }, 1_000)).toBe(20_000));
});

describe("cardServicePayments", () => {
  const servicio: CashFlowCardService = { issuer: "visa_signature", monto: 20_000, ultimoCargo: "2026-09-20" };
  it("proyecta un cargo por mes desde el siguiente al último, con la inflación compuesta", () => {
    expect(cardServicePayments(visaCard, servicio, "2027-01", 0.02)).toEqual([
      { mes: "2026-11", monto: 20_000 * 1.02 },
      { mes: "2026-12", monto: 20_000 * 1.02 ** 2 },
      { mes: "2027-01", monto: 20_000 * 1.02 ** 3 },
    ]);
  });
  it("con un último cargo viejo arranca después del cierre y cuenta los meses desde el cargo", () => {
    const pagos = cardServicePayments(visaCard, { ...servicio, ultimoCargo: "2026-06-20" }, "2026-12", 0.02);
    expect(pagos.map(({ mes }) => mes)).toEqual(["2026-11", "2026-12"]);
    expect(pagos[0].monto).toBeCloseTo(20_000 * 1.02 ** 4);
  });
});
```

En `describe("buildCashFlow: servicios de tarjeta")`, sobre `ejemplo()`:
- `it("un mes cerrado pasa el cargo de Tarjetas a Servicios y los egresos no cambian")`: el resumen `2026-09-03` con `serviciosArs: 20_000` → en `2026-09`, `servicios` sube 20.000, `tarjetas` baja 20.000 y `egresos` es el mismo que sin el cargo.
- `it("con suscripciones y servicios en el mismo resumen Tarjetas no queda negativa")`: resumen de 10.000 con `suscripcionesArs: 6_000` y `serviciosArs: 8_000` → `tarjetas` 0, `suscripciones` 6.000, `servicios` 4.000.
- `it("un mes estimado proyecta el servicio en su tarjeta y suma la nota")`: `cardServices: [{ issuer: "visa_signature", monto: 20_000, ultimoCargo: "2026-09-20" }]`, sin inflación → `2026-11` `servicios` 20.000 más que sin el servicio, `tarjetas` igual, y `estimados` contiene `estimadoServicios(0)`.
- `it("no suma la proyección en el mes que ya tiene el resumen real de esa tarjeta")`: `2026-10` igual que sin el servicio.
- `it("con solo la parte de un resumen real no aparece la nota de servicios")`: `serviciosArs` en el resumen `2026-10-02`, sin `cardServices` ni servicios cargados → `2026-10` no contiene `estimadoServicios(0)`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `bunx vitest run server/src/stats/cashFlow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar los cambios en `cashFlow.ts`**

- [ ] **Step 4: Correr y ver que pasan**

Run: `bunx vitest run server/src/stats/cashFlow.test.ts`
Expected: PASS, incluidos los tests de `subscriptionPaymentMonths` que ya existían.

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/cashFlow.ts server/src/stats/cashFlow.test.ts
git commit -m "feat(server): servicios de tarjeta en el flujo"
git push
```

---

### Task 6: Ruta del Flujo con servicios de tarjeta

**Files:**
- Modify: `server/src/http/routes/cashFlow.ts`
- Test: `server/src/http/routes/cashFlow.test.ts`

**Interfaces:**
- Consumes: `loadCardServiceGroups` (Task 4), `toCardServiceDTO` (Task 3), `servicesByStatement` y `CashFlowCardService` (Task 5).
- Produces: `toFlowStatement(statement, suscripciones?, serviciosArs = 0)`; `buildCashFlow` recibe `cardServices` = cada grupo como `{ issuer, monto: ultimoMonto, ultimoCargo }`.

- [ ] **Step 1: Escribir el test que falla**

`it("pasa los cargos de un servicio de tarjeta a Servicios y lo proyecta")`: `seed()`, cargos `GASCO` de 20.000 en `statements[1]` (`2026-08-20`) y `statements[2]` (`2026-09-20`), `CardServiceModel` con `GASCO`:
- `2026-09`: `{ tarjetas: 458_000, servicios: 20_000 }`.
- `2026-10`: `{ tarjetas: 480_000, servicios: 20_000 }`.
- `2026-11`: `{ tarjetas: 30_000, servicios: 20_000 }` y `estimados` contiene «Servicios (último monto)».
- Sin la marca, el mismo seed da `servicios: 0` en los tres meses y `egresos` iguales a los de arriba en `2026-09` y `2026-10`.

- [ ] **Step 2: Correr y ver que falla**

Run: `bunx vitest run server/src/http/routes/cashFlow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Cablear la ruta**

- [ ] **Step 4: Correr el server entero**

Run: `bunx vitest run server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/cashFlow.ts server/src/http/routes/cashFlow.test.ts
git commit -m "feat(server): el flujo lee los servicios de tarjeta"
git push
```

---

### Task 7: Marcar un servicio desde Movimientos

**Files:**
- Create: `client/src/cardServices.ts`
- Modify: `client/src/api/hooks.ts`
- Modify: `client/src/components/TransactionSheet.tsx`, `client/src/components/TransactionsTable.tsx`, `client/src/components/TransactionsList.tsx`
- Modify: `client/src/pages/TransactionsPage.tsx`
- Test: `client/src/cardServices.test.ts`, `client/src/components/TransactionSheet.test.tsx`, `client/src/pages/TransactionsPage.test.tsx`

**Interfaces:**
- Consumes: `CardServiceDTO` (Task 2); `canMarkAsSubscription` de `client/src/subscriptions.ts`.
- Produces:
  - `canMarkAsService(transaction: TransactionDTO): boolean` = `canMarkAsSubscription(transaction) && transaction.currency === "ARS"`.
  - Hooks: `useCardServices()` (`queryKey: ["card-services"]`, GET `/card-services`), `useMarkCardService()` (POST `/card-services` con `{ transactionId }`), `useUnmarkCardService()` (DELETE `/card-services/${encodeURIComponent(key)}`). Las dos mutaciones invalidan `["card-services"]`, `["subscriptions"]` y `["cash-flow"]`. `useMarkSubscription` invalida también `["card-services"]` y `["cash-flow"]`.
  - Prop nueva `onMarkService: (transactionId: string) => void` en `TransactionSheet`, `TransactionsTable` y `TransactionsList`.
  - En `TransactionsTable`, la columna `subscription` pasa a `marks` (ancho 96) y muestra los dos botones de ícono, cada uno con su condición. El de servicio usa `ElectricalServicesOutlinedIcon`.

- [ ] **Step 1: Escribir los tests que fallan**

- `cardServices.test.ts`: `canMarkAsService` es true para una compra en pesos sin cuotas y false para USD, cuotas y créditos.
- `TransactionSheet.test.tsx` (el `setup` suma `onMarkService`):
  - `it("«Es un servicio» manda el movimiento y cierra la hoja")`: click → `onMarkService` con `"4"` y `onClose` llamado.
  - `it("un consumo en dólares no ofrece marcarlo como servicio")` y el de cuotas que ya existe chequea también que no está «Es un servicio».
- `TransactionsPage.test.tsx` (`stubApi` responde también `/card-services`):
  - `it("marcar un consumo como servicio manda el POST con el movimiento y avisa")`: botón «Marcar MERCADOLIBRE como servicio» → «Agregado a Servicios» y POST con `{ transactionId: "1" }`.
  - `it("si el server no acepta el servicio avisa que no pudo marcarlo")` → «No pudimos marcarlo como servicio».
  - En mobile: `it("«Es un servicio» desde la hoja manda el POST y avisa")`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `bunx vitest run client/src/cardServices.test.ts client/src/components/TransactionSheet.test.tsx client/src/pages/TransactionsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar helper, hooks, botones y snackbar**

- [ ] **Step 4: Correr y ver que pasan**

Run: `bunx vitest run client/src/cardServices.test.ts client/src/components client/src/pages/TransactionsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/cardServices.ts client/src/cardServices.test.ts client/src/api/hooks.ts client/src/components/TransactionSheet.tsx client/src/components/TransactionSheet.test.tsx client/src/components/TransactionsTable.tsx client/src/components/TransactionsList.tsx client/src/pages/TransactionsPage.tsx client/src/pages/TransactionsPage.test.tsx
git commit -m "feat(client): marcar un consumo como servicio"
git push
```

---

### Task 8: Sección «En la tarjeta» en Servicios y texto del Flujo

**Files:**
- Create: `client/src/components/CardServicesTable.tsx`, `client/src/components/CardServiceCards.tsx`, `client/src/components/useCardServiceRemoval.ts`
- Modify: `client/src/cardServices.ts`, `client/src/fixedServices.ts`, `client/src/pages/FixedServicesPage.tsx`, `client/src/pages/CashFlowPage.tsx`
- Test: `client/src/fixedServices.test.ts`, `client/src/pages/FixedServicesPage.test.tsx`, `client/src/pages/CashFlowPage.test.tsx`

**Interfaces:**
- Consumes: `useCardServices`, `useUnmarkCardService` (Task 7).
- Produces:
  - En `cardServices.ts`: `CARD_SERVICES_LABEL = "Servicios en la tarjeta"` (aria-label de la tabla y de la sección de tarjetas), `interface CardServiceListProps { items: CardServiceDTO[]; onRemove: (item: CardServiceDTO) => void }`, `removeCardServiceMessage(item: CardServiceDTO | null): string` con el texto del spec (vacío si es `null`).
  - `fixedServiceKpis(activos: FixedServiceDTO[], mesActual: string, enTarjeta: CardServiceDTO[] = []): FixedServiceKpis`: `porMes` suma el `ultimoMonto` de cada uno y `vigentes` los cuenta.
  - `CardServicesTable` y `CardServiceCards` (`CardServiceListProps`): Nombre, Tarjeta (`cardLabel`), Último cargo (`formatLocalDate`), Monto (`formatMoney(…, "ARS")`), y un `IconButton` con `aria-label` «quitar {nombre} de Servicios».
  - `useCardServiceRemoval(): { pendingRemoval: CardServiceDTO | null; askRemove: (item: CardServiceDTO) => void; cancelRemove: () => void; confirmRemove: () => void }`, con `useUnmarkCardService`.
  - `FixedServicesPage`: carga con `useFixedServices` y `useCardServices` (cargando si cualquiera carga, error si cualquiera falla); bajada nueva; vacío solo si no hay ninguno de los dos; «Activos» se muestra si hay activos o si no hay servicios de tarjeta; sección «En la tarjeta» entre «Activos» y «Dados de baja»; `ConfirmDialog` con título «Quitar de Servicios», `confirmLabel` «Quitar» y `removeCardServiceMessage`.
  - `CashFlowPage`: en `PROJECTION_CAPTION`, «y servicios con el último monto más la inflación esperada del REM.» pasa a «y servicios con el último monto más la inflación esperada del REM (los de la tarjeta, en el mes en que vence su resumen).»

- [ ] **Step 1: Escribir los tests que fallan**

- `fixedServices.test.ts`: `fixedServiceKpis([luz], "2026-10", [gasco])` suma `ultimoMonto` en `porMes` y da `vigentes: 2`.
- `FixedServicesPage.test.tsx` (el stub de `fetch` responde `/card-services` con `cardReply`, por defecto `[gasco]` con `{ key: "GASCO", nombre: "GASCO", issuer: "visa_signature", cardLabel: "Visa Signature", ultimoMonto: 20_000, ultimoCargo: "2026-09-20" }`):
  - `it("lista los servicios de la tarjeta en su sección y los suma al total por mes")`: tabla «Servicios en la tarjeta» con GASCO, Visa Signature, 2026-09-20 y el monto; KPI «Por mes» = luz + gas bimestral prorrateado + 20.000.
  - `it("Quitar pide confirmación y manda el DELETE con la clave")`: click en «quitar GASCO de Servicios» → diálogo con el texto del spec → «Quitar» → DELETE a `/api/card-services/GASCO`.
  - `it("con solo servicios de tarjeta no muestra el vacío ni la sección de activos")`: `listReply` `[]` → no está el vacío ni «No hay servicios activos», sí la sección y los KPIs.
  - `it("sin servicios cargados ni de tarjeta muestra el vacío")`.
  - El test de la bajada usa el texto nuevo.
  - Mobile: `it("muestra los servicios de la tarjeta como tarjetas y deja quitarlos")`.
- `CashFlowPage.test.tsx`: la explicación contiene «(los de la tarjeta, en el mes en que vence su resumen)».

- [ ] **Step 2: Correr y ver que fallan**

Run: `bunx vitest run client/src/fixedServices.test.ts client/src/pages/FixedServicesPage.test.tsx client/src/pages/CashFlowPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar componentes, hook, KPI, página y texto**

- [ ] **Step 4: Correr y ver que pasan**

Run: `bunx vitest run client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/cardServices.ts client/src/fixedServices.ts client/src/fixedServices.test.ts client/src/components/CardServicesTable.tsx client/src/components/CardServiceCards.tsx client/src/components/useCardServiceRemoval.ts client/src/pages/FixedServicesPage.tsx client/src/pages/FixedServicesPage.test.tsx client/src/pages/CashFlowPage.tsx client/src/pages/CashFlowPage.test.tsx
git commit -m "feat(client): servicios de la tarjeta en la página Servicios"
git push
```

---

### Task 9: Verificación final

- [ ] **Step 1: Suite y tipos**

Run: `bun run test && bun run typecheck`
Expected: todo en verde.

- [ ] **Step 2: Chequeo contra una copia local de los datos**

`docker compose up -d`, `bun run backup` y `bun run backup:restore-local` (lee Atlas, escribe solo en el Mongo local). Con un script en el scratchpad que corre `createApp()` del worktree contra el Mongo local con una sesión del owner (como `server/src/testing/auth.ts`): `GET /api/cash-flow` antes; insertar en el Mongo local una `CardService` con la clave del comercio de gas; `GET /api/cash-flow` y `GET /api/card-services` después.
Expected: en los meses con resumen, `egresos` igual y `tarjetas + servicios` igual que antes; en los estimados, `servicios` sube por la proyección; la lista trae el servicio con su último cargo. Los números reales quedan fuera de commits y textos de GitHub.
