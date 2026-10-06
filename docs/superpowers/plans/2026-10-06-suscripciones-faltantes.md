# Suscripciones faltantes: categoría, alta manual y cadencia anual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una suscripción aparezca en la página Suscripciones desde su primer cobro cuando el usuario ya dijo que lo es (categoría «Suscripciones» o marca desde Movimientos), y que las anuales se muestren y se sumen como tales.

**Architecture:** El detector puro de `server/src/stats/subscriptions.ts` suma un «plan B»: si el camino de hoy no encuentra una racha válida y el comercio está *forzado* (categoría del último cobro, marca manual o marca anual), toma su última racha mensual de cualquier largo. Una marca anual cambia la racha por `annualRun` (paso de 12 meses), el próximo cobro a un año y divide por 12 los montos mensuales. Las marcas viven en dos colecciones nuevas con la forma de `HiddenSubscription` (`ManualSubscription`, `AnnualSubscription`); la API suma `POST /manual` y `PUT`/`DELETE /annual/:key`. En el cliente, la página Suscripciones gana un botón de cadencia por fila y Movimientos un botón «marcar como suscripción» (columna en la grilla, botón en la hoja mobile) con un snackbar de resultado.

**Tech Stack:** TypeScript estricto, Express + Mongoose (server), React 18 + MUI 6 + MUI X DataGrid 7 + React Query 5 (client), Zod en `@ledgerly/shared`, Vitest + supertest + `mongodb-memory-server` + Testing Library, bun.

**Spec:** `docs/superpowers/specs/2026-10-06-suscripciones-faltantes-design.md`

## Global Constraints

- **Rama:** `feat/suscripciones-faltantes` (ya existe, sale de `main` y tiene el spec). Otras sesiones comparten el working tree: antes de cada commit, `git branch --show-current` y `git status`, y commitear solo los archivos de la tarea con pathspec explícito. Nunca `git push` ni `gh pr`.
- **Antes de la Task 1:** `bun install`. Hoy `bun run typecheck` falla en la base porque `imapflow` (declarada en `server/package.json`) no está en `node_modules`. Si `bun install` cambia `bun.lock`, no commitearlo y avisar.
- **Comandos:** un archivo `bunx vitest run <ruta>`; todo `bun run test`; tipos `bun run typecheck`; build `bun run build`.
- **Constantes nuevas** (exportadas arriba de `subscriptions.ts`): `CATEGORIA_SUSCRIPCIONES = "Suscripciones"` (comparación exacta) y `MESES_CADENCIA: Record<Cadencia, number> = { mensual: 1, anual: 12 }`. Las de hoy no cambian (`MIN_COBROS = 3`, `GRACIA_DIAS = 7`, `VENTANA_CORTADAS_MESES = 12`, `VENTANA_AUMENTO_MESES = 12`, etc.).
- **Colecciones:** `ManualSubscription` (`key` única, `createdAt: "markedAt"`) y `AnnualSubscription` (`key` única, `createdAt: "annualAt"`), sin `updatedAt`, sin backfill. No hay `DELETE` de manuales: una manual se deshace con «Ocultar».
- **Textos exactos:**
  - INTRO: «Cobros que se repiten en tus tarjetas: los que aparecen 3 meses seguidos con montos parecidos, los de la categoría Suscripciones y los que marcaste desde Movimientos. No incluye cuotas ni impuestos.»
  - EMPTY: «No encontramos suscripciones. Aparecen solas con 3 meses seguidos de cobros del mismo comercio, con la categoría Suscripciones o marcándolas desde Movimientos.»
  - Botón de cadencia: «Marcar {nombre} como anual» / «Marcar {nombre} como mensual»; tooltip «Es anual» / «Es mensual»; captions «por año» y «por mes».
  - Movimientos: «Marcar {merchant} como suscripción», «Es una suscripción», «Agregado a Suscripciones», «No pudimos marcarlo como suscripción».
  - API: `400` «Comercio inválido» (body que no valida) y `400` «Este comercio no tiene un nombre reconocible» (clave vacía); `400` «Clave inválida» en `/annual/:key` como en `/hidden/:key`.
- **Código:** sin comentarios. Componentes funcionales con destructuring en la firma, fragments `<>`, early returns para carga/error, lógica condicional antes del `return`, nunca el índice como `key`, `useCallback` para handlers que bajan como props, `any` prohibido.
- **Tests del cliente:** el auto-cleanup de RTL está apagado; todo archivo con varios renders lleva `afterEach(cleanup)` (los que se tocan acá ya lo tienen). La grilla ya usa `disableVirtualization`; los botones de celda son `IconButton` con `aria-label`, nunca `GridActionsCellItem`.
- **Datos:** fixtures sintéticos (`VIDEOMAX 99123`, `STREAMBOX 4410`, `CAFE ROSITA 4471`). Nada de comercios, montos ni conteos reales en código, tests, commits ni en este plan.
- **Servers temporales:** nunca el 4100 (servicio instalado) ni 4000/5173 (otras sesiones). Usar 4300+ después de `lsof -iTCP:<puerto> -sTCP:LISTEN`, y matar solo el PID propio.
- **Commits:** uno por tarea, mensaje convencional en castellano y trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Tocar el botón de suscripción en la grilla de Movimientos también selecciona la fila** (la grilla tiene `checkboxSelection` y selecciona al hacer click en la fila). Se espera que solo marque y que no aparezca «Borrar seleccionados». → Task 6 (`stopPropagation` + test en `TransactionsTable.test.tsx`).
2. **El `POST /manual` falla** (comercio sin palabras, server caído). Se espera el snackbar de error, nunca «Agregado a Suscripciones». → Task 6 (test en `TransactionsPage.test.tsx`).
3. **Un comercio forzado cuyo único mes tiene dos cobros** (por ejemplo, el primer cobro y un ajuste). `monthlyRuns` no arma racha en un mes con varios cobros sin un anterior, así que el plan B del spec no devolvería nada y el comercio desaparecería justo después de «Agregado a Suscripciones». Ajuste respecto del spec: si no hay ninguna racha, el plan B usa el último cobro solo. → Task 2.
4. **Una anual cuyo cobro del año anterior cayó unos días antes en el mes** (por ejemplo, el 5 contra el 8). La ventana de `priceIncrease` compara fechas, así que ese cobro queda afuera y el aumento nunca se informa. Ajuste respecto del spec: la ventana se compara por mes (`monthOf(date) >= addMonths(monthOf(last.date), -12)`). Con cobros en el mismo día no cambia nada. → Task 3.
5. **Marcar dos veces el mismo comercio** (doble toque, o dos movimientos del mismo comercio). Se espera `204` las dos veces y una sola marca guardada. → Task 4.

---

### Task 1: Shared — `cadencia` en el DTO y el body del alta manual

**Files:**
- Modify: `shared/src/dtos.ts` (`subscriptionDtoSchema` y vecinos, ~323-354; tipos, ~619-621)
- Test: `shared/src/dtos.test.ts` (~135-200)
- Modify (solo para que el typecheck siga en verde): `server/src/stats/subscriptions.ts`, `server/src/stats/subscriptions.test.ts`, `client/src/subscriptions.test.ts`, `client/src/pages/SubscriptionsPage.test.tsx`

**Interfaces:**
- Consumes: `currencySchema`, `subscriptionIncreaseSchema` (ya existen en `dtos.ts`).
- Produces: `cadenciaSchema = z.enum(["mensual", "anual"])`; `type Cadencia = "mensual" | "anual"`; `SubscriptionDTO.cadencia: Cadencia`; `manualSubscriptionInputSchema = z.object({ merchant: z.string().trim().min(1).max(200) })`; `type ManualSubscriptionInput = { merchant: string }`. El detector devuelve `cadencia: "mensual"` en todas las suscripciones (las Tasks 2 y 3 lo vuelven real).

- [ ] **Step 1: Instalar dependencias y confirmar la base**

Run: `bun install && bun run typecheck`
Expected: typecheck sin errores (antes fallaba solo por `imapflow`).

- [ ] **Step 2: Escribir los tests que fallan**

En `shared/src/dtos.test.ts`, sumar `manualSubscriptionInputSchema` al segundo bloque de imports (después de `manualAssetUpdateSchema`):

```ts
import {
  budgetDtoSchema, budgetInputSchema, budgetPatchSchema, budgetSpendingDtoSchema, cashFlowDtoSchema,
  inboxRuleResultDtoSchema, installmentPurchaseDtoSchema, isoDateSchema, mailSourceStatusDtoSchema, mailSyncRunDtoSchema,
  MANUAL_ASSET_TYPE_LABELS, manualAssetCreateSchema, manualAssetTypeSchema, manualAssetUpdateSchema,
  manualSubscriptionInputSchema, netWorthDtoSchema,
  statementReviewDtoSchema, statementReviewKeysDtoSchema, statementReviewPatchSchema, subscriptionsReportDtoSchema,
  uncategorizedInboxDtoSchema,
} from "./dtos.js";
```

Sumar `cadencia` al fixture `subscription`:

```ts
const subscription = {
  key: "MUSICAPP", nombre: "MUSICAPP", busqueda: "MUSICAPP", categoria: "Suscripciones", cardLabel: "ICBC",
  moneda: "ARS", montoActual: 5490, montoMensualArs: 5490,
  primerCobro: "2026-03-12", ultimoCobro: "2026-08-12", proximoCobro: "2026-09-12",
  cobros: 6, estado: "activa", oculta: false,
  aumento: { variacion: 0.1002, desde: "2026-03", montoAnterior: 4990 }, monedaAnterior: null,
  cadencia: "mensual",
};
```

Dentro de `describe("subscriptionsReportDtoSchema", ...)`, después de «rechaza una suscripción sin cobros», agregar:

```ts
  it("valida la cadencia anual y rechaza una desconocida o ausente", () => {
    const report = (item: object) => ({
      cotizacionOficial: null, totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0, items: [item],
    });
    expect(subscriptionsReportDtoSchema.parse(report({ ...subscription, cadencia: "anual" })).items[0].cadencia).toBe("anual");
    expect(subscriptionsReportDtoSchema.safeParse(report({ ...subscription, cadencia: "semanal" })).success).toBe(false);
    expect(subscriptionsReportDtoSchema.safeParse(report({ ...subscription, cadencia: undefined })).success).toBe(false);
  });
```

Y a continuación de ese `describe`, uno nuevo:

```ts
describe("manualSubscriptionInputSchema", () => {
  it("recorta el comercio", () => {
    expect(manualSubscriptionInputSchema.parse({ merchant: "  VIDEOMAX 99123  " })).toEqual({ merchant: "VIDEOMAX 99123" });
  });

  it.each([
    ["sin comercio", {}],
    ["con el comercio en blanco", { merchant: "   " }],
    ["con más de 200 caracteres", { merchant: "A".repeat(201) }],
    ["con un comercio que no es texto", { merchant: 42 }],
  ])("rechaza un body %s", (_label, body) => {
    expect(manualSubscriptionInputSchema.safeParse(body).success).toBe(false);
  });
});
```

- [ ] **Step 3: Correrlos y verlos fallar**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: FAIL. «valida un reporte con una suscripción activa…» falla porque el schema descarta `cadencia`; los de `manualSubscriptionInputSchema` fallan con `Cannot read properties of undefined (reading 'parse')`.

- [ ] **Step 4: Implementar en `shared/src/dtos.ts`**

Antes de `subscriptionDtoSchema`:

```ts
export const cadenciaSchema = z.enum(["mensual", "anual"]);
```

Al final de `subscriptionDtoSchema`, después de `monedaAnterior`:

```ts
  monedaAnterior: currencySchema.nullable(),
  cadencia: cadenciaSchema,
});
```

Después de `subscriptionsReportDtoSchema`:

```ts
export const manualSubscriptionInputSchema = z.object({
  merchant: z.string().trim().min(1).max(200),
});
```

En el bloque de tipos, rodeando a los de suscripciones:

```ts
export type Cadencia = z.infer<typeof cadenciaSchema>;
export type SubscriptionIncrease = z.infer<typeof subscriptionIncreaseSchema>;
export type SubscriptionDTO = z.infer<typeof subscriptionDtoSchema>;
export type SubscriptionsReportDTO = z.infer<typeof subscriptionsReportDtoSchema>;
export type ManualSubscriptionInput = z.infer<typeof manualSubscriptionInputSchema>;
```

- [ ] **Step 5: Correrlos y verlos pasar**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: PASS.

- [ ] **Step 6: Mantener el typecheck en verde**

En `server/src/stats/subscriptions.ts`, al final del objeto que devuelve `subscriptionOf`:

```ts
    monedaAnterior: previousCurrency(run, last),
    cadencia: "mensual",
  };
```

En `server/src/stats/subscriptions.test.ts`: en el primer test de `describe("detectSubscriptions")` («detecta 3 meses seguidos con el mismo monto») sumar `cadencia: "mensual",` después de `monedaAnterior: null,` en el objeto esperado; y en el helper `item` de `describe("summarizeSubscriptions")` sumar `cadencia: "mensual",` después de `monedaAnterior: null,`.

En `client/src/subscriptions.test.ts`, en el helper `item`, después de `monedaAnterior: null,`:

```ts
  monedaAnterior: null,
  cadencia: "mensual",
  ...overrides,
```

En `client/src/pages/SubscriptionsPage.test.tsx`, en el fixture `streamflix` (los demás lo esparcen):

```ts
  estado: "activa", oculta: false, aumento: null, monedaAnterior: "ARS", cadencia: "mensual",
```

Run: `bun run typecheck` → sin errores.
Run: `bunx vitest run server/src/stats/subscriptions.test.ts server/src/http/routes/subscriptions.test.ts client/src/subscriptions.test.ts client/src/pages/SubscriptionsPage.test.tsx` → PASS.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add shared/src/dtos.ts shared/src/dtos.test.ts server/src/stats/subscriptions.ts server/src/stats/subscriptions.test.ts client/src/subscriptions.test.ts client/src/pages/SubscriptionsPage.test.tsx
git commit -m "feat(shared): cadencia de las suscripciones y body del alta manual" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Detector — suscripciones forzadas por categoría o marca manual

**Files:**
- Modify: `server/src/stats/subscriptions.ts`
- Test: `server/src/stats/subscriptions.test.ts`
- Modify: `server/src/db/models.ts` (dos schemas, dos tipos, dos modelos)
- Modify: `server/src/http/routes/subscriptions.ts` (el `GET` lee las marcas)
- Test: `server/src/http/routes/subscriptions.test.ts`

**Interfaces:**
- Consumes: `SubscriptionDTO` con `cadencia` (Task 1); `latestCharge`, `monthlyRuns`, `isValidRun`, `hasLaterSimilar` (ya existen en `subscriptions.ts`).
- Produces: `CATEGORIA_SUSCRIPCIONES = "Suscripciones"`; `SubscriptionContext` con `manuales: ReadonlySet<string>` y `anuales: ReadonlySet<string>` (además de `hoy`, `ultimoCierre`, `ocultas`, `cotizacion`); helpers internos `type Marked = (marks: ReadonlySet<string>) => boolean`, `hasMark(key, rawKeys, marks)`, `isForced(charges, marked, ctx)`, `monthlyRun(charges, forced)` (la Task 3 los usa); `ManualSubscriptionModel`, `AnnualSubscriptionModel`, `ManualSubscriptionDoc`, `AnnualSubscriptionDoc` en `models.ts`. En los tests: constantes `SUSCRIPCION = { category: CATEGORIA_SUSCRIPCIONES }` y `CIERRE_SEPTIEMBRE = { visa_signature: "2026-09-26" }`, y el seed `cafeRosita()` en el test de rutas (las Tasks 3 y 4 los reusan).

- [ ] **Step 1: Ajustar los helpers del test del detector**

En `server/src/stats/subscriptions.test.ts`:

1. Sumar `CATEGORIA_SUSCRIPCIONES` al import de `./subscriptions.js`.
2. El default de `category` en `tx` pasa a `"Entretenimiento"`, para que los tests de hoy no queden forzados por categoría:

```ts
  isInstallment: false,
  category: "Entretenimiento",
  issuer: "visa_signature",
```

3. En el primer test de `describe("detectSubscriptions")`, el esperado pasa a `categoria: "Entretenimiento",`.
4. `ctx` suma los dos sets, y debajo van las dos constantes nuevas:

```ts
const ctx = (overrides: Partial<SubscriptionContext> = {}): SubscriptionContext => ({
  hoy: "2026-10-03",
  ultimoCierre: {},
  ocultas: new Set<string>(),
  manuales: new Set<string>(),
  anuales: new Set<string>(),
  cotizacion: 1000,
  ...overrides,
});

const SUSCRIPCION: Partial<SubscriptionTx> = { category: CATEGORIA_SUSCRIPCIONES };
const CIERRE_SEPTIEMBRE = { visa_signature: "2026-09-26" };
```

- [ ] **Step 2: Escribir los tests que fallan**

Después de `describe("detectSubscriptions", ...)` (antes de `describe("summarizeSubscriptions")`):

```ts
describe("detectSubscriptions con suscripciones forzadas", () => {
  it("un solo cobro con la categoría Suscripciones aparece activa y mensual", () => {
    const txs = [tx("2026-09-15", 4500, { merchant: "VIDEOMAX 99123", ...SUSCRIPCION })];
    expect(detectSubscriptions(txs, ctx({ ultimoCierre: CIERRE_SEPTIEMBRE }))).toEqual([expect.objectContaining({
      key: "VIDEOMAX",
      nombre: "VIDEOMAX",
      categoria: CATEGORIA_SUSCRIPCIONES,
      primerCobro: "2026-09-15",
      ultimoCobro: "2026-09-15",
      proximoCobro: "2026-10-15",
      cobros: 1,
      estado: "activa",
      cadencia: "mensual",
      montoMensualArs: 4500,
      aumento: null,
    })]);
  });

  it("un solo cobro con la categoría Suscripciones de hace meses queda cortada", () => {
    const txs = [tx("2026-01-20", 4500, { merchant: "VIDEOMAX", ...SUSCRIPCION })];
    expect(detectSubscriptions(txs, ctx({ ultimoCierre: CIERRE_SEPTIEMBRE }))).toMatchObject([
      { key: "VIDEOMAX", estado: "cortada", cadencia: "mensual", cobros: 1 },
    ]);
  });

  it("la categoría en un cobro viejo pero no en el último no la fuerza", () => {
    const txs = [
      tx("2026-07-10", 4500, { merchant: "VIDEOMAX", ...SUSCRIPCION }),
      tx("2026-09-10", 4500, { merchant: "VIDEOMAX" }),
    ];
    expect(detectSubscriptions(txs, ctx())).toEqual([]);
  });

  it("la categoría se compara por nombre exacto", () => {
    const txs = [tx("2026-09-15", 4500, { merchant: "VIDEOMAX", category: "suscripciones" })];
    expect(detectSubscriptions(txs, ctx())).toEqual([]);
  });

  it("la marca manual la fuerza por la clave canónica", () => {
    const txs = [tx("2026-09-15", 4500, { merchant: "VIDEOMAX 99123" })];
    expect(detectSubscriptions(txs, ctx({ manuales: new Set(["VIDEOMAX"]) }))).toMatchObject([
      { key: "VIDEOMAX", cobros: 1, cadencia: "mensual" },
    ]);
  });

  it("la marca manual la fuerza por una clave cruda que se fusionó en la canónica", () => {
    const txs = [
      tx("2026-08-09", 3500, { merchant: "GOOGLE *VideoP X1y2Z3" }),
      tx("2026-09-09", 3500, { merchant: "GOOGLE *VideoPremium" }),
    ];
    expect(detectSubscriptions(txs, ctx({ manuales: new Set(["GOOGLE VIDEOPREMIUM"]) }))).toMatchObject([
      { key: "GOOGLE VIDEOP", cobros: 2, primerCobro: "2026-08-09" },
    ]);
  });

  it("una racha válida no cambia por estar forzada", () => {
    const txs = [...monthly([100, 100, 100], "2026-01", SUSCRIPCION), tx("2026-05-09", 900, SUSCRIPCION)];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([{ ultimoCobro: "2026-03-09", cobros: 3, montoActual: 100 }]);
  });

  it("si la racha válida tiene un cobro parecido después, toma la última racha", () => {
    const txs = [...monthly([100, 100, 100]), ...monthly([100, 100], "2026-05", SUSCRIPCION)];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([
      { primerCobro: "2026-05-09", ultimoCobro: "2026-06-09", cobros: 2 },
    ]);
  });

  it("la última racha de una forzada no chequea montos", () => {
    const txs = monthly([26300, 12600], "2026-08", { merchant: "VIDEOMAX", ...SUSCRIPCION });
    expect(detectSubscriptions(txs, ctx())).toMatchObject([{ cobros: 2, montoActual: 12600 }]);
  });

  it("si su único mes tiene dos cobros, aparece con el último", () => {
    const txs = [
      tx("2026-09-05", 4500, { merchant: "VIDEOMAX", ...SUSCRIPCION }),
      tx("2026-09-18", 1200, { merchant: "VIDEOMAX", ...SUSCRIPCION }),
    ];
    expect(detectSubscriptions(txs, ctx())).toMatchObject([
      { primerCobro: "2026-09-18", ultimoCobro: "2026-09-18", cobros: 1, montoActual: 1200 },
    ]);
  });

  it("una forzada oculta llega oculta", () => {
    const txs = [tx("2026-09-15", 4500, { merchant: "VIDEOMAX", ...SUSCRIPCION })];
    expect(detectSubscriptions(txs, ctx({ ocultas: new Set(["VIDEOMAX"]) }))).toMatchObject([{ oculta: true }]);
  });
});
```

- [ ] **Step 3: Correrlos y verlos fallar**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts`
Expected: FAIL en los casos de un cobro, de la marca manual, de «toma la última racha», de «no chequea montos» y de «dos cobros» (`expected [] to …`). Los guardas («cobro viejo», «nombre exacto», «racha válida no cambia») ya pasan. Los tests de hoy siguen en verde.

- [ ] **Step 4: Implementar el plan B en `server/src/stats/subscriptions.ts`**

Constante, después de `TOLERANCIA_ANULACION`:

```ts
export const CATEGORIA_SUSCRIPCIONES = "Suscripciones";
```

El contexto:

```ts
export interface SubscriptionContext {
  hoy: string;
  ultimoCierre: Partial<Record<Issuer, string>>;
  ocultas: ReadonlySet<string>;
  manuales: ReadonlySet<string>;
  anuales: ReadonlySet<string>;
  cotizacion: number | null;
}
```

Después de `interface KeyedTx { ... }`:

```ts
type Marked = (marks: ReadonlySet<string>) => boolean;
```

Reemplazar `isHidden` y `subscriptionOf` completos por:

```ts
const hasMark = (key: string, rawKeys: ReadonlySet<string>, marks: ReadonlySet<string>): boolean =>
  marks.has(key) || [...rawKeys].some((rawKey) => marks.has(rawKey));

const isForced = (charges: Charge[], marked: Marked, { manuales, anuales }: SubscriptionContext): boolean =>
  latestCharge(charges)?.category === CATEGORIA_SUSCRIPCIONES || marked(manuales) || marked(anuales);

const detectedRun = (charges: Charge[]): Charge[] | undefined => {
  const run = monthlyRuns(charges).filter(isValidRun).at(-1);
  if (run === undefined || hasLaterSimilar(charges, run[run.length - 1])) return undefined;
  return run;
};

const lastMonthlyRun = (charges: Charge[]): Charge[] | undefined => {
  const latest = latestCharge(charges);
  return monthlyRuns(charges).at(-1) ?? (latest === undefined ? undefined : [latest]);
};

const monthlyRun = (charges: Charge[], forced: boolean): Charge[] | undefined =>
  detectedRun(charges) ?? (forced ? lastMonthlyRun(charges) : undefined);

const subscriptionOf = (charges: Charge[], marked: Marked, ctx: SubscriptionContext): SubscriptionDTO | null => {
  const run = monthlyRun(charges, isForced(charges, marked, ctx));
  if (run === undefined) return null;
  const first = run[0];
  const last = run[run.length - 1];
  const proximoCobro = addMonthsClamped(last.date, 1);
  const estado = statusOf(last, proximoCobro, ctx);
  if (estado === "cortada" && last.date < addMonthsClamped(ctx.hoy, -VENTANA_CORTADAS_MESES)) return null;
  return {
    key: last.key,
    nombre: merchantDisplayName(last.merchant),
    busqueda: merchantSearchTerm(run.map(({ merchant }) => merchant).reverse()),
    categoria: last.category,
    cardLabel: last.cardLabel,
    moneda: last.currency,
    montoActual: last.amount,
    montoMensualArs: monthlyArs(last, ctx.cotizacion),
    primerCobro: first.date,
    ultimoCobro: last.date,
    proximoCobro,
    cobros: run.length,
    estado,
    oculta: marked(ctx.ocultas),
    aumento: priceIncrease(run),
    monedaAnterior: previousCurrency(run, last),
    cadencia: "mensual",
  };
};
```

En `detectSubscriptions`, el `flatMap` arma el `marked` del grupo:

```ts
    .flatMap(([key, charges]) => {
      const rawKeys = new Set((rowsByGroup.get(key) ?? []).map(({ rawKey }) => rawKey));
      const marked: Marked = (marks) => hasMark(key, rawKeys, marks);
      const subscription = subscriptionOf(charges, marked, ctx);
      return subscription ? [subscription] : [];
    })
```

- [ ] **Step 5: Correrlos y verlos pasar**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts`
Expected: PASS (los nuevos y todos los de hoy).

- [ ] **Step 6: Test de rutas que falla: el `GET` lee las marcas manuales**

En `server/src/http/routes/subscriptions.test.ts`, el import de modelos pasa a:

```ts
import { HiddenSubscriptionModel, ManualSubscriptionModel, StatementModel, TransactionModel } from "../../db/models.js";
```

Después de `streamflixAndNoise`, un seed que no queda forzado por categoría:

```ts
const cafeRosita = (): TxSeed[] => [{ date: "2026-08-15", merchant: "CAFE ROSITA 4471", amount: 3800, category: "Comida" }];
```

Y al final del archivo:

```ts
describe("GET /api/subscriptions con marcas guardadas", () => {
  it("un comercio marcado a mano aparece desde su primer cobro", async () => {
    await seedVisa(cafeRosita());
    expect((await request(app).get("/api/subscriptions")).body.items).toEqual([]);
    await ManualSubscriptionModel.create({ key: "CAFE ROSITA" });
    const report = subscriptionsReportDtoSchema.parse((await request(app).get("/api/subscriptions")).body);
    expect(report.items).toMatchObject([{ key: "CAFE ROSITA", cobros: 1, cadencia: "mensual", estado: "activa" }]);
  });
});
```

Run: `bunx vitest run server/src/http/routes/subscriptions.test.ts`
Expected: FAIL (`ManualSubscriptionModel` es `undefined`).

- [ ] **Step 7: Modelos y lectura en el `GET`**

En `server/src/db/models.ts`, después de `hiddenSubscriptionSchema`:

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

Después de `export type HiddenSubscriptionDoc = ...`:

```ts
export type ManualSubscriptionDoc = InferSchemaType<typeof manualSubscriptionSchema>;
export type AnnualSubscriptionDoc = InferSchemaType<typeof annualSubscriptionSchema>;
```

Después de `export const HiddenSubscriptionModel ...`:

```ts
export const ManualSubscriptionModel: Model<ManualSubscriptionDoc> =
  mongoose.models.ManualSubscription ?? mongoose.model("ManualSubscription", manualSubscriptionSchema);
export const AnnualSubscriptionModel: Model<AnnualSubscriptionDoc> =
  mongoose.models.AnnualSubscription ?? mongoose.model("AnnualSubscription", annualSubscriptionSchema);
```

En `server/src/http/routes/subscriptions.ts`, el import de modelos:

```ts
import {
  AnnualSubscriptionModel, HiddenSubscriptionModel, ManualSubscriptionModel, StatementModel, TransactionModel,
} from "../../db/models.js";
```

Y el `GET`:

```ts
subscriptionsRouter.get("/", asyncHandler(async (_req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const [transactions, statements, hidden, manual, annual, cotizacion] = await Promise.all([
    TransactionModel.find({ isInstallment: false, type: { $in: ["purchase", "refund"] } }).lean(),
    StatementModel.find({}, { issuer: 1, closingDate: 1 }).lean(),
    HiddenSubscriptionModel.find().lean(),
    ManualSubscriptionModel.find().lean(),
    AnnualSubscriptionModel.find().lean(),
    fetchOficialRate(hoy),
  ]);
  const txs: SubscriptionTx[] = transactions.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    merchant: t.merchant,
    amount: t.amount,
    currency: t.currency as Currency,
    direction: t.direction as Direction,
    type: t.type as TxType,
    isInstallment: t.isInstallment,
    category: t.category,
    issuer: t.issuer as Issuer,
    cardLabel: t.cardLabel,
  }));
  const items = detectSubscriptions(txs, {
    hoy,
    ultimoCierre: latestClosingByIssuer(statements.map((s) => ({ issuer: s.issuer, closingDate: s.closingDate ?? null }))),
    ocultas: new Set(hidden.map((h) => h.key)),
    manuales: new Set(manual.map((m) => m.key)),
    anuales: new Set(annual.map((a) => a.key)),
    cotizacion,
  });
  const report: SubscriptionsReportDTO = { cotizacionOficial: cotizacion, ...summarizeSubscriptions(items), items };
  res.json(report);
}));
```

- [ ] **Step 8: Correr, typecheck y commit**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts server/src/http/routes/subscriptions.test.ts` → PASS.
Run: `bun run typecheck` → sin errores.

```bash
git branch --show-current
git add server/src/stats/subscriptions.ts server/src/stats/subscriptions.test.ts server/src/db/models.ts server/src/http/routes/subscriptions.ts server/src/http/routes/subscriptions.test.ts
git commit -m "feat(server): suscripciones forzadas por categoría o marca manual" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Detector — cadencia anual

**Files:**
- Modify: `server/src/stats/subscriptions.ts`
- Test: `server/src/stats/subscriptions.test.ts`

**Interfaces:**
- Consumes: `Cadencia` (Task 1); `Marked`, `isForced`, `monthlyRun`, `SUSCRIPCION`, `CIERRE_SEPTIEMBRE` (Task 2).
- Produces: `MESES_CADENCIA: Record<Cadencia, number>`; `annualRun(charges: Charge[]): Charge[]`; `SubscriptionDTO.cadencia` real (`"anual"` si el grupo tiene marca en `anuales`); `montoMensualArs` dividido por 12 en las anuales; `summarizeSubscriptions` divide por 12 los USD anuales; `priceIncrease` con ventana por mes.

- [ ] **Step 1: Escribir los tests que fallan**

Sumar `annualRun` al import de `./subscriptions.js`. Después de `describe("monthlyRuns", ...)`:

```ts
describe("annualRun", () => {
  it("salta de a 12 meses hacia atrás desde el último cobro, cruzando años", () => {
    const charges = [charge("2024-01-05", 100), charge("2025-01-05", 110), charge("2026-01-05", 120)];
    expect(dates(annualRun(charges))).toEqual(["2024-01-05", "2025-01-05", "2026-01-05"]);
  });

  it("deja afuera los cobros mensuales que no caen a 12 meses", () => {
    const charges = [
      ...monthlyCharges(Array.from({ length: 11 }, () => 5000), "2024-10"),
      charge("2025-09-09", 50000),
      charge("2026-09-09", 60000),
    ];
    expect(dates(annualRun(charges))).toEqual(["2025-09-09", "2026-09-09"]);
  });

  it("en un mes con varios cobros elige el de la misma moneda con el monto más cercano", () => {
    const charges = [
      charge("2025-01-03", 300),
      charge("2025-01-05", 950),
      charge("2025-01-20", 990, { currency: "USD" }),
      charge("2026-01-05", 1000),
    ];
    expect(amounts(annualRun(charges))).toEqual([950, 1000]);
  });

  it("si ninguno de los varios cobros es de la misma moneda, la racha termina", () => {
    const charges = [charge("2025-01-03", 300), charge("2025-01-05", 950), charge("2026-01-05", 10, { currency: "USD" })];
    expect(dates(annualRun(charges))).toEqual(["2026-01-05"]);
  });

  it("un único cobro en el mes entra aunque sea de otra moneda", () => {
    const charges = [charge("2025-01-05", 90000), charge("2026-01-05", 80, { currency: "USD" })];
    expect(dates(annualRun(charges))).toEqual(["2025-01-05", "2026-01-05"]);
  });

  it("devuelve la racha ordenada aunque los cobros lleguen desordenados", () => {
    expect(dates(annualRun([charge("2026-01-05", 120), charge("2025-01-05", 110)]))).toEqual(["2025-01-05", "2026-01-05"]);
  });
});
```

Después de `describe("detectSubscriptions con suscripciones forzadas", ...)`:

```ts
const ANUAL: Partial<SubscriptionContext> = { anuales: new Set(["STREAMBOX"]) };

describe("detectSubscriptions con cadencia anual", () => {
  it("una anual cobra de nuevo en un año y suma un doceavo por mes", () => {
    const txs = [tx("2026-01-14", 60000, { merchant: "STREAMBOX 4410" })];
    expect(detectSubscriptions(txs, ctx({ ...ANUAL, ultimoCierre: CIERRE_SEPTIEMBRE }))).toEqual([expect.objectContaining({
      key: "STREAMBOX",
      cadencia: "anual",
      estado: "activa",
      cobros: 1,
      montoActual: 60000,
      montoMensualArs: 5000,
      ultimoCobro: "2026-01-14",
      proximoCobro: "2027-01-14",
    })]);
  });

  it("sin la marca, ese mismo cobro con la categoría Suscripciones es una mensual cortada", () => {
    const txs = [tx("2026-01-14", 60000, { merchant: "STREAMBOX 4410", ...SUSCRIPCION })];
    expect(detectSubscriptions(txs, ctx({ ultimoCierre: CIERRE_SEPTIEMBRE }))).toMatchObject([
      { cadencia: "mensual", estado: "cortada", proximoCobro: "2026-02-14" },
    ]);
  });

  it("una anual en dólares pasa a pesos y divide por 12", () => {
    const txs = [tx("2026-01-14", 99.99, { merchant: "STREAMBOX", currency: "USD" })];
    expect(detectSubscriptions(txs, ctx({ ...ANUAL, cotizacion: 1465 }))).toMatchObject([{ montoMensualArs: 12207.11 }]);
  });

  it("queda cortada si el próximo cobro más la gracia cae antes del último cierre, y se sigue listando", () => {
    const txs = [tx("2025-03-10", 60000, { merchant: "STREAMBOX" })];
    expect(detectSubscriptions(txs, ctx({ ...ANUAL, ultimoCierre: CIERRE_SEPTIEMBRE }))).toMatchObject([
      { cadencia: "anual", estado: "cortada", proximoCobro: "2026-03-10" },
    ]);
  });

  it("una anual cortada deja de listarse 12 meses después de su próximo cobro", () => {
    const txs = [tx("2024-08-10", 60000, { merchant: "STREAMBOX" })];
    expect(detectSubscriptions(txs, ctx({ ...ANUAL, ultimoCierre: CIERRE_SEPTIEMBRE }))).toEqual([]);
  });

  it("si pasó de mensual a anual, junta solo los cobros anuales y mide el aumento contra el del año anterior", () => {
    const txs = [
      ...monthly(Array.from({ length: 11 }, () => 5000), "2024-10", { merchant: "STREAMBOX" }),
      tx("2025-09-09", 50000, { merchant: "STREAMBOX" }),
      tx("2026-09-09", 60000, { merchant: "STREAMBOX" }),
    ];
    expect(detectSubscriptions(txs, ctx(ANUAL))).toMatchObject([{
      cadencia: "anual",
      cobros: 2,
      primerCobro: "2025-09-09",
      aumento: { variacion: expect.closeTo(0.2, 6), desde: "2025-09", montoAnterior: 50000 },
    }]);
  });

  it("mide el aumento aunque el cobro del año anterior haya caído unos días antes en el mes", () => {
    const txs = [tx("2025-01-05", 50000, { merchant: "STREAMBOX" }), tx("2026-01-08", 60000, { merchant: "STREAMBOX" })];
    expect(detectSubscriptions(txs, ctx(ANUAL))).toMatchObject([
      { aumento: { variacion: expect.closeTo(0.2, 6), desde: "2025-01", montoAnterior: 50000 } },
    ]);
  });

  it("la marca anual se busca también por la clave cruda", () => {
    const txs = [
      tx("2025-01-09", 3500, { merchant: "GOOGLE *VideoP X1y2Z3" }),
      tx("2026-01-09", 3500, { merchant: "GOOGLE *VideoPremium" }),
    ];
    expect(detectSubscriptions(txs, ctx({ anuales: new Set(["GOOGLE VIDEOPREMIUM"]) }))).toMatchObject([
      { key: "GOOGLE VIDEOP", cadencia: "anual", cobros: 2 },
    ]);
  });

  it("marcada como anual y oculta a la vez, llega oculta", () => {
    const txs = [tx("2026-01-14", 60000, { merchant: "STREAMBOX" })];
    expect(detectSubscriptions(txs, ctx({ ...ANUAL, ocultas: new Set(["STREAMBOX"]) }))).toMatchObject([
      { cadencia: "anual", oculta: true },
    ]);
  });
});
```

En `describe("summarizeSubscriptions", ...)`, después de «suma solo las activas visibles…»:

```ts
  it("una anual suma un doceavo: los pesos ya vienen divididos y los dólares se dividen por 12", () => {
    expect(summarizeSubscriptions([
      item({ montoActual: 5000, montoMensualArs: 5000 }),
      item({ cadencia: "anual", montoActual: 60000, montoMensualArs: 5000 }),
      item({ cadencia: "anual", moneda: "USD", montoActual: 120, montoMensualArs: 14650 }),
      item({ moneda: "USD", montoActual: 10, montoMensualArs: 14650 }),
    ])).toEqual({ totalMensualArs: 39300, totalMensualUsd: 20, totalAnualArs: 471600 });
  });
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts`
Expected: FAIL. `annualRun is not a function`; las anuales salen con `cadencia: "mensual"` o no salen; el resumen da `totalMensualUsd: 130`.

- [ ] **Step 3: Implementar en `server/src/stats/subscriptions.ts`**

Sumar `type Cadencia` al import de `@ledgerly/shared`, y después de `CATEGORIA_SUSCRIPCIONES`:

```ts
export const MESES_CADENCIA: Record<Cadencia, number> = { mensual: 1, anual: 12 };
```

Reemplazar `closestRepeat` por estos tres (el de hoy queda igual en comportamiento):

```ts
const closestTo = (reference: Charge, candidates: Charge[]): Charge | undefined =>
  candidates.reduce<Charge | undefined>(
    (best, candidate) =>
      best === undefined || amountGap(reference, candidate) < amountGap(reference, best) ? candidate : best,
    undefined,
  );

const closestRepeat = (reference: Charge, candidates: Charge[]): Charge | undefined =>
  closestTo(reference, candidates.filter((candidate) => repeatsAmount(reference, candidate)));

const closestSameCurrency = (reference: Charge, candidates: Charge[]): Charge | undefined =>
  closestTo(reference, candidates.filter(({ currency }) => currency === reference.currency));
```

Después de `monthlyRuns`:

```ts
const previousYearCharge = (current: Charge, monthCharges: Charge[]): Charge | undefined =>
  monthCharges.length === 1 ? monthCharges[0] : closestSameCurrency(current, monthCharges);

export function annualRun(charges: Charge[]): Charge[] {
  const months = groupBy(charges, ({ date }) => monthOf(date));
  const run: Charge[] = [];
  let current = latestCharge(charges);
  while (current !== undefined) {
    run.unshift(current);
    const previousMonth = addMonths(monthOf(current.date), -MESES_CADENCIA.anual);
    current = previousYearCharge(current, months.get(previousMonth) ?? []);
  }
  return run;
}
```

`priceIncrease` compara la ventana por mes (Review Focus 4):

```ts
export function priceIncrease(run: Charge[]): SubscriptionIncrease | null {
  const last = run.at(-1);
  if (last === undefined) return null;
  const since = addMonths(monthOf(last.date), -VENTANA_AUMENTO_MESES);
  const reference = currencyTail(run).find(({ date }) => monthOf(date) >= since);
  if (reference === undefined || reference === last) return null;
  const variacion = last.amount / reference.amount - 1;
  if (variacion < UMBRAL_AUMENTO) return null;
  return { variacion, desde: monthOf(reference.date), montoAnterior: reference.amount };
}
```

`monthlyArs` divide por los meses de la cadencia:

```ts
const monthlyArs = ({ amount, currency }: Charge, meses: number, cotizacion: number | null): number | null => {
  if (currency === "ARS") return roundCents(amount / meses);
  return cotizacion === null ? null : roundCents((amount * cotizacion) / meses);
};
```

Después de `monthlyRun` (Task 2), y reemplazando `subscriptionOf`:

```ts
const runFor = (charges: Charge[], cadencia: Cadencia, forced: boolean): Charge[] | undefined =>
  cadencia === "anual" ? annualRun(charges) : monthlyRun(charges, forced);

const tooOldToList = (cadencia: Cadencia, last: Charge, proximoCobro: string, hoy: string): boolean =>
  (cadencia === "anual" ? proximoCobro : last.date) < addMonthsClamped(hoy, -VENTANA_CORTADAS_MESES);

const subscriptionOf = (charges: Charge[], marked: Marked, ctx: SubscriptionContext): SubscriptionDTO | null => {
  const cadencia: Cadencia = marked(ctx.anuales) ? "anual" : "mensual";
  const run = runFor(charges, cadencia, isForced(charges, marked, ctx));
  if (run === undefined) return null;
  const first = run[0];
  const last = run[run.length - 1];
  const meses = MESES_CADENCIA[cadencia];
  const proximoCobro = addMonthsClamped(last.date, meses);
  const estado = statusOf(last, proximoCobro, ctx);
  if (estado === "cortada" && tooOldToList(cadencia, last, proximoCobro, ctx.hoy)) return null;
  return {
    key: last.key,
    nombre: merchantDisplayName(last.merchant),
    busqueda: merchantSearchTerm(run.map(({ merchant }) => merchant).reverse()),
    categoria: last.category,
    cardLabel: last.cardLabel,
    moneda: last.currency,
    montoActual: last.amount,
    montoMensualArs: monthlyArs(last, meses, ctx.cotizacion),
    primerCobro: first.date,
    ultimoCobro: last.date,
    proximoCobro,
    cobros: run.length,
    estado,
    oculta: marked(ctx.ocultas),
    aumento: priceIncrease(run),
    monedaAnterior: previousCurrency(run, last),
    cadencia,
  };
};
```

`summarizeSubscriptions`:

```ts
const monthlyUsd = ({ montoActual, cadencia }: SubscriptionDTO): number => montoActual / MESES_CADENCIA[cadencia];

export function summarizeSubscriptions(items: SubscriptionDTO[]): SubscriptionTotals {
  const counted = items.filter(({ estado, oculta }) => estado === "activa" && !oculta);
  const totalMensualArs = roundCents(sum(counted.map(({ montoMensualArs }) => montoMensualArs ?? 0)));
  const totalMensualUsd = roundCents(sum(counted.filter(({ moneda }) => moneda === "USD").map(monthlyUsd)));
  return { totalMensualArs, totalMensualUsd, totalAnualArs: roundCents(totalMensualArs * 12) };
}
```

- [ ] **Step 4: Correrlos y verlos pasar**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts server/src/http/routes/subscriptions.test.ts`
Expected: PASS, incluidos los de `priceIncrease` de hoy (con cobros el mismo día la ventana por mes da lo mismo).

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git branch --show-current
git add server/src/stats/subscriptions.ts server/src/stats/subscriptions.test.ts
git commit -m "feat(server): cadencia anual de las suscripciones" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API — alta manual y marca anual

**Files:**
- Modify: `server/src/http/routes/subscriptions.ts`
- Test: `server/src/http/routes/subscriptions.test.ts`

**Interfaces:**
- Consumes: `manualSubscriptionInputSchema` (Task 1); `ManualSubscriptionModel`, `AnnualSubscriptionModel`, `cafeRosita()` (Task 2); la cadencia anual del detector (Task 3); `merchantKey` de `server/src/stats/merchantKey.ts`.
- Produces: `POST /api/subscriptions/manual` (body `{ merchant }`, `204`); `PUT` y `DELETE /api/subscriptions/annual/:key` (`204`, idempotentes). `hiddenKeyOf` pasa a llamarse `keyParamOf`.

- [ ] **Step 1: Escribir los tests que fallan**

En `server/src/http/routes/subscriptions.test.ts`, el import de modelos pasa a:

```ts
import {
  AnnualSubscriptionModel, HiddenSubscriptionModel, ManualSubscriptionModel, StatementModel, TransactionModel,
} from "../../db/models.js";
```

Al final del archivo:

```ts
describe("marcar suscripciones a mano", () => {
  it("POST /manual responde 204 y el comercio aparece con un solo cobro", async () => {
    await seedVisa(cafeRosita());
    const res = await request(app).post("/api/subscriptions/manual").send({ merchant: "CAFE ROSITA 4471" });
    expect(res.status).toBe(204);
    const report = subscriptionsReportDtoSchema.parse((await request(app).get("/api/subscriptions")).body);
    expect(report.items).toMatchObject([
      { key: "CAFE ROSITA", cobros: 1, cadencia: "mensual", estado: "activa", oculta: false },
    ]);
  });

  it("guarda la clave cruda del comercio y marcar dos veces deja una sola marca", async () => {
    expect((await request(app).post("/api/subscriptions/manual").send({ merchant: "  GOOGLE *VideoPremium  " })).status).toBe(204);
    expect((await request(app).post("/api/subscriptions/manual").send({ merchant: "GOOGLE *VideoPremium" })).status).toBe(204);
    const docs = await ManualSubscriptionModel.find().lean();
    expect(docs.map(({ key }) => key)).toEqual(["GOOGLE VIDEOPREMIUM"]);
  });

  it.each([
    ["sin comercio", {}],
    ["con el comercio en blanco", { merchant: "   " }],
    ["con un comercio de más de 200 caracteres", { merchant: "A".repeat(201) }],
  ])("POST /manual %s responde 400", async (_label, body) => {
    const res = await request(app).post("/api/subscriptions/manual").send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Comercio inválido" });
  });

  it("POST /manual con un comercio sin palabras responde 400 y no guarda nada", async () => {
    const res = await request(app).post("/api/subscriptions/manual").send({ merchant: "123456 7890" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Este comercio no tiene un nombre reconocible" });
    expect(await ManualSubscriptionModel.countDocuments()).toBe(0);
  });

  it("marcar un comercio oculto lo vuelve a mostrar", async () => {
    await seedVisa(cafeRosita());
    await request(app).put("/api/subscriptions/hidden/CAFE%20ROSITA");
    await request(app).post("/api/subscriptions/manual").send({ merchant: "CAFE ROSITA 4471" });
    expect(await HiddenSubscriptionModel.countDocuments()).toBe(0);
    const res = await request(app).get("/api/subscriptions");
    expect(res.body.items).toMatchObject([{ key: "CAFE ROSITA", oculta: false }]);
  });
});

describe("marcar suscripciones anuales", () => {
  it("PUT la pasa a anual, es idempotente y divide por 12", async () => {
    await seedVisa(streamflixAndNoise());
    expect((await request(app).put("/api/subscriptions/annual/STREAMFLIX%20COM")).status).toBe(204);
    expect((await request(app).put("/api/subscriptions/annual/STREAMFLIX%20COM")).status).toBe(204);
    expect(await AnnualSubscriptionModel.countDocuments()).toBe(1);
    const report = subscriptionsReportDtoSchema.parse((await request(app).get("/api/subscriptions")).body);
    expect(report.items).toMatchObject([{
      key: "STREAMFLIX COM", cadencia: "anual", cobros: 1, proximoCobro: "2027-08-09", montoMensualArs: 1585.86,
    }]);
    expect(report).toMatchObject({ totalMensualArs: 1585.86, totalMensualUsd: 1.08 });
  });

  it("DELETE la vuelve mensual y también es idempotente", async () => {
    await seedVisa(streamflixAndNoise());
    await request(app).put("/api/subscriptions/annual/STREAMFLIX%20COM");
    expect((await request(app).delete("/api/subscriptions/annual/STREAMFLIX%20COM")).status).toBe(204);
    expect((await request(app).delete("/api/subscriptions/annual/STREAMFLIX%20COM")).status).toBe(204);
    const res = await request(app).get("/api/subscriptions");
    expect(res.body.items).toMatchObject([{ cadencia: "mensual", cobros: 4 }]);
    expect(res.body.totalMensualUsd).toBe(12.99);
  });

  it.each([
    ["PUT", "en blanco", "%20%20"],
    ["PUT", "de más de 60 caracteres", "A".repeat(61)],
    ["DELETE", "en blanco", "%20%20"],
  ])("%s /annual con una clave %s responde 400", async (method, _label, key) => {
    const url = `/api/subscriptions/annual/${key}`;
    const res = method === "PUT" ? await request(app).put(url) : await request(app).delete(url);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Clave inválida" });
  });
});
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `bunx vitest run server/src/http/routes/subscriptions.test.ts`
Expected: FAIL con `404` en `POST /manual` y en `PUT`/`DELETE /annual/:key`.

- [ ] **Step 3: Implementar en `server/src/http/routes/subscriptions.ts`**

Imports:

```ts
import { Router, type Request } from "express";
import {
  manualSubscriptionInputSchema, type Currency, type Direction, type Issuer, type SubscriptionsReportDTO, type TxType,
} from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import {
  AnnualSubscriptionModel, HiddenSubscriptionModel, ManualSubscriptionModel, StatementModel, TransactionModel,
} from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import { merchantKey } from "../../stats/merchantKey.js";
import {
  detectSubscriptions,
  latestClosingByIssuer,
  summarizeSubscriptions,
  type SubscriptionTx,
} from "../../stats/subscriptions.js";
```

Constantes y helper (renombrado):

```ts
const MAX_CLAVE = 60;
const INVALID_MERCHANT = "Comercio inválido";
const UNRECOGNIZABLE_MERCHANT = "Este comercio no tiene un nombre reconocible";

export const subscriptionsRouter = Router();

const keyParamOf = (req: Request): string => {
  const key = String(req.params.key ?? "").trim();
  if (key === "" || key.length > MAX_CLAVE) throw new HttpError(400, "Clave inválida");
  return key;
};
```

Las dos rutas de ocultas usan `keyParamOf` en lugar de `hiddenKeyOf`. Al final del archivo:

```ts
subscriptionsRouter.post("/manual", asyncHandler(async (req, res) => {
  const parsed = manualSubscriptionInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_MERCHANT);
  const key = merchantKey(parsed.data.merchant);
  if (key === "") throw new HttpError(400, UNRECOGNIZABLE_MERCHANT);
  await Promise.all([
    ManualSubscriptionModel.updateOne({ key }, { $setOnInsert: { key } }, { upsert: true }),
    HiddenSubscriptionModel.deleteOne({ key }),
  ]);
  res.status(204).end();
}));

subscriptionsRouter.put("/annual/:key", asyncHandler(async (req, res) => {
  const key = keyParamOf(req);
  await AnnualSubscriptionModel.updateOne({ key }, { $setOnInsert: { key } }, { upsert: true });
  res.status(204).end();
}));

subscriptionsRouter.delete("/annual/:key", asyncHandler(async (req, res) => {
  const key = keyParamOf(req);
  await AnnualSubscriptionModel.deleteOne({ key });
  res.status(204).end();
}));
```

- [ ] **Step 4: Correrlos y verlos pasar**

Run: `bunx vitest run server/src/http/routes/subscriptions.test.ts`
Expected: PASS, incluidos los de ocultas de hoy.

- [ ] **Step 5: Typecheck y commit**

Run: `bun run typecheck` → sin errores.

```bash
git branch --show-current
git add server/src/http/routes/subscriptions.ts server/src/http/routes/subscriptions.test.ts
git commit -m "feat(server): alta manual y marca anual de suscripciones" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cliente — cambiar la cadencia desde la página Suscripciones

**Files:**
- Modify: `client/src/api/hooks.ts` (después de `useSetSubscriptionHidden`)
- Test: `client/src/api/hooks.test.tsx`
- Modify: `client/src/subscriptions.ts`
- Test: `client/src/subscriptions.test.ts`
- Modify: `client/src/components/SubscriptionsTable.tsx`, `client/src/components/SubscriptionCards.tsx`, `client/src/pages/SubscriptionsPage.tsx`
- Test: `client/src/pages/SubscriptionsPage.test.tsx`

**Interfaces:**
- Consumes: `Cadencia`, `SubscriptionDTO.cadencia` (Task 1); `PUT`/`DELETE /api/subscriptions/annual/:key` (Task 4).
- Produces: `useSetSubscriptionAnnual(): UseMutationResult<void, Error, { key: string; annual: boolean }>`; `SubscriptionListProps.onToggleAnnual: (key: string, annual: boolean) => void`; `cadenceToggleLabel(nombre: string, cadencia: Cadencia): string`; `cadenceToggleTooltip(cadencia: Cadencia): string`; `cadenceAmountCaption(cadencia: Cadencia): string | null`.

- [ ] **Step 1: Tests que fallan del hook y de los textos**

En `client/src/api/hooks.test.tsx`, sumar `useSetSubscriptionAnnual` al import de `./hooks.js` y, dentro de `describe("hooks de las features nuevas")`, después del test de `useSetSubscriptionHidden`:

```ts
  it("useSetSubscriptionAnnual codifica la clave, usa PUT para anual y DELETE para mensual, e invalida las suscripciones", async () => {
    vi.stubGlobal("fetch", respond(204));
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSetSubscriptionAnnual(), { wrapper: wrapperFor(client) });
    await act(() => result.current.mutateAsync({ key: "STREAMBOX PLUS", annual: true }));
    await act(() => result.current.mutateAsync({ key: "STREAMBOX PLUS", annual: false }));
    expect(calledUrls()).toEqual([
      "PUT /api/subscriptions/annual/STREAMBOX%20PLUS",
      "DELETE /api/subscriptions/annual/STREAMBOX%20PLUS",
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["subscriptions"] });
  });
```

En `client/src/subscriptions.test.ts`, sumar `cadenceAmountCaption`, `cadenceToggleLabel` y `cadenceToggleTooltip` al import y, al final:

```ts
describe("textos de cadencia", () => {
  it("cadenceToggleLabel ofrece pasar a la otra cadencia", () => {
    expect(cadenceToggleLabel("STREAMBOX", "mensual")).toBe("Marcar STREAMBOX como anual");
    expect(cadenceToggleLabel("STREAMBOX", "anual")).toBe("Marcar STREAMBOX como mensual");
  });

  it("cadenceToggleTooltip nombra la cadencia de destino", () => {
    expect(cadenceToggleTooltip("mensual")).toBe("Es anual");
    expect(cadenceToggleTooltip("anual")).toBe("Es mensual");
  });

  it("cadenceAmountCaption aclara solo las anuales", () => {
    expect(cadenceAmountCaption("anual")).toBe("por año");
    expect(cadenceAmountCaption("mensual")).toBeNull();
  });
});
```

Run: `bunx vitest run client/src/api/hooks.test.tsx client/src/subscriptions.test.ts`
Expected: FAIL (`useSetSubscriptionAnnual is not a function`, `cadenceToggleLabel is not a function`).

- [ ] **Step 2: Implementar el hook y los textos**

En `client/src/api/hooks.ts`, después de `useSetSubscriptionHidden`:

```ts
export function useSetSubscriptionAnnual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, annual }: { key: string; annual: boolean }) =>
      apiFetch<void>(`/subscriptions/annual/${encodeURIComponent(key)}`, { method: annual ? "PUT" : "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}
```

En `client/src/subscriptions.ts`, el import de tipos suma `Cadencia`:

```ts
import type { Cadencia, Currency, SubscriptionDTO, SubscriptionIncrease } from "@ledgerly/shared";
```

`SubscriptionListProps` suma el handler:

```ts
export interface SubscriptionListProps {
  items: SubscriptionDTO[];
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
  onToggleAnnual: (key: string, annual: boolean) => void;
}
```

Después de `CURRENCY_NAMES`:

```ts
const OTHER_CADENCE: Record<Cadencia, Cadencia> = { mensual: "anual", anual: "mensual" };
```

Y al final del archivo:

```ts
export function cadenceToggleLabel(nombre: string, cadencia: Cadencia): string {
  return `Marcar ${nombre} como ${OTHER_CADENCE[cadencia]}`;
}

export function cadenceToggleTooltip(cadencia: Cadencia): string {
  return `Es ${OTHER_CADENCE[cadencia]}`;
}

export function cadenceAmountCaption(cadencia: Cadencia): string | null {
  return cadencia === "anual" ? "por año" : null;
}
```

Run: `bunx vitest run client/src/api/hooks.test.tsx client/src/subscriptions.test.ts` → PASS.

- [ ] **Step 3: Tests que fallan de la página**

En `client/src/pages/SubscriptionsPage.test.tsx`:

`serve` también responde `204` a la marca anual:

```ts
const isMutation = (url: string): boolean =>
  url.includes("/subscriptions/hidden/") || url.includes("/subscriptions/annual/");

const serve = (body: SubscriptionsReportDTO): void => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (isMutation(url) ? new Response(null, { status: 204 }) : json(body))));
};
```

El test de carga fija el texto de la intro (sumar al final de «muestra el título mientras carga»):

```ts
    expect(screen.getByText(
      "Cobros que se repiten en tus tarjetas: los que aparecen 3 meses seguidos con montos parecidos, los de la categoría Suscripciones y los que marcaste desde Movimientos. No incluye cuotas ni impuestos.",
    )).toBeInTheDocument();
```

El test del estado vacío pasa a:

```ts
  it("sin suscripciones muestra el estado vacío", async () => {
    serve({ cotizacionOficial: 1465, totalMensualArs: 0, totalMensualUsd: 0, totalAnualArs: 0, items: [] });
    renderWithProviders(<SubscriptionsPage />);
    expect(await screen.findByText(
      "No encontramos suscripciones. Aparecen solas con 3 meses seguidos de cobros del mismo comercio, con la categoría Suscripciones o marcándolas desde Movimientos.",
    )).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Suscripciones" })).toBeInTheDocument();
  });
```

Dentro de `describe("SubscriptionsPage")`, después de ««Mostrar» dentro de «Ocultas (1)» manda el DELETE»:

```ts
  it("marcar como anual una activa manda el PUT con la clave codificada", async () => {
    serve(report);
    renderWithProviders(<SubscriptionsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Marcar STREAMFLIX.COM como anual" }));
    await waitFor(() => expect(mutations()).toEqual(["PUT /api/subscriptions/annual/STREAMFLIX%20COM"]));
  });

  it("una anual que dejó de cobrarse se vuelve mensual con DELETE", async () => {
    serve({ ...report, items: [streamflix, musicapp, { ...gimnasio, cadencia: "anual" }, plan] });
    renderWithProviders(<SubscriptionsPage />);
    const cortadas = await screen.findByRole("table", { name: "Suscripciones que dejaron de cobrarse" });
    await userEvent.click(within(cortadas).getByRole("button", { name: "Marcar GIMNASIO NORTE como mensual" }));
    await waitFor(() => expect(mutations()).toEqual(["DELETE /api/subscriptions/annual/GIMNASIO%20NORTE"]));
  });

  it("una anual aclara «por año» en el monto y «por mes» en pesos", async () => {
    serve({ ...report, items: [streamflix, { ...musicapp, cadencia: "anual", montoActual: 60000, montoMensualArs: 5000 }] });
    renderWithProviders(<SubscriptionsPage />);
    const activas = await screen.findByRole("table", { name: "Suscripciones activas" });
    expect(within(activas).getByText("por año")).toBeInTheDocument();
    expect(within(activas).getByText("por mes")).toBeInTheDocument();
  });
```

Dentro de `describe("SubscriptionsPage en mobile")`, al final:

```ts
  it("una anual suma «por año» al monto de la tarjeta y se vuelve mensual desde ahí", async () => {
    serve({ ...report, items: [streamflix, { ...musicapp, cadencia: "anual", montoActual: 60000, montoMensualArs: 5000 }] });
    renderWithProviders(<SubscriptionsPage />);
    const card = await screen.findByRole("article", { name: "MUSICAPP" });
    expect(within(card).getByText(`${money(60000, "ARS")} por año`)).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Marcar MUSICAPP como mensual" }));
    await waitFor(() => expect(mutations()).toEqual(["DELETE /api/subscriptions/annual/MUSICAPP"]));
  });
```

Run: `bunx vitest run client/src/pages/SubscriptionsPage.test.tsx`
Expected: FAIL (no hay botones de cadencia, ni captions, ni los textos nuevos).

- [ ] **Step 4: `SubscriptionsTable.tsx`**

Reemplazar el archivo por:

```tsx
import { Chip, IconButton, Table, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Link as RouterLink } from "react-router-dom";
import type { SubscriptionDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import {
  AMOUNT_LABEL,
  cadenceAmountCaption,
  cadenceToggleLabel,
  cadenceToggleTooltip,
  increaseDetail,
  increaseLabel,
  previousCurrencyLabel,
  subscriptionMeta,
  subscriptionTransactionsLink,
  type SubscriptionListProps,
  type SubscriptionVariant,
} from "../subscriptions.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

interface SubscriptionRowProps {
  item: SubscriptionDTO;
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
  onToggleAnnual: (key: string, annual: boolean) => void;
}

const TABLE_LABEL: Record<SubscriptionVariant, string> = {
  activas: "Suscripciones activas",
  cortadas: "Suscripciones que dejaron de cobrarse",
};

const PER_MONTH_CAPTION = "por mes";

const captionSx = { display: "block" };

const dash = <Typography component="span" color="text.disabled">—</Typography>;

const SubscriptionRow = ({
  item: {
    key, nombre, busqueda, categoria, cardLabel, moneda, montoActual, montoMensualArs,
    primerCobro, ultimoCobro, proximoCobro, aumento, monedaAnterior, cadencia,
  },
  variant,
  onHide,
  onToggleAnnual,
}: SubscriptionRowProps) => {
  const isActive = variant === "activas";
  const amountCaption = cadenceAmountCaption(cadencia);
  const previousCurrency = monedaAnterior && (
    <Typography variant="caption" color="text.secondary" sx={captionSx}>{previousCurrencyLabel(monedaAnterior)}</Typography>
  );
  const nextCharge = isActive && (
    <Typography variant="caption" color="text.secondary" sx={captionSx}>{`próximo ~${proximoCobro}`}</Typography>
  );
  const yearlyCaption = amountCaption && (
    <Typography variant="caption" color="text.secondary" sx={captionSx}>{amountCaption}</Typography>
  );
  const monthlyCaption = amountCaption && (
    <Typography variant="caption" color="text.secondary" sx={captionSx}>{PER_MONTH_CAPTION}</Typography>
  );
  const variation = aumento
    ? <Chip size="small" color="warning" label={increaseLabel(aumento)} title={increaseDetail(aumento, montoActual, moneda)} />
    : dash;
  const variationCell = isActive && <TableCell>{variation}</TableCell>;
  const toggleAnnual = () => onToggleAnnual(key, cadencia === "mensual");

  return (
    <MotionTableRow variants={fadeUpItem}>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{nombre}</Typography>
        <Typography variant="caption" color="text.secondary" sx={captionSx}>{subscriptionMeta({ cardLabel, categoria })}</Typography>
        {previousCurrency}
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        {formatMoney(montoActual, moneda)}
        {yearlyCaption}
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        {formatMoneyOrDash(montoMensualArs, "ARS")}
        {monthlyCaption}
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{primerCobro}</TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        {ultimoCobro}
        {nextCharge}
      </TableCell>
      {variationCell}
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        <Tooltip title={cadenceToggleTooltip(cadencia)} describeChild>
          <IconButton aria-label={cadenceToggleLabel(nombre, cadencia)} onClick={toggleAnnual}>
            <EventRepeatOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Ocultar: no es una suscripción" describeChild>
          <IconButton aria-label={`Ocultar ${nombre}`} onClick={() => onHide(key)}>
            <VisibilityOffOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton component={RouterLink} to={subscriptionTransactionsLink(busqueda)} aria-label={`Ver movimientos de ${nombre}`}>
          <ReceiptLongOutlinedIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </MotionTableRow>
  );
};

export const SubscriptionsTable = ({ items, variant, onHide, onToggleAnnual }: SubscriptionListProps) => {
  const variationHeader = variant === "activas" && <TableCell>Variación</TableCell>;
  const rows = items.map((item) => (
    <SubscriptionRow key={item.key} item={item} variant={variant} onHide={onHide} onToggleAnnual={onToggleAnnual} />
  ));

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={TABLE_LABEL[variant]}>
        <TableHead>
          <TableRow>
            <TableCell>Comercio</TableCell>
            <TableCell align="right">{AMOUNT_LABEL[variant]}</TableCell>
            <TableCell align="right">En pesos</TableCell>
            <TableCell>Desde</TableCell>
            <TableCell>Último cobro</TableCell>
            {variationHeader}
            <TableCell align="right" aria-label="Acciones" />
          </TableRow>
        </TableHead>
        <MotionTableBody variants={staggerContainer} initial="hidden" animate="visible">
          {rows}
        </MotionTableBody>
      </Table>
    </TableContainer>
  );
};
```

- [ ] **Step 5: `SubscriptionCards.tsx`**

Reemplazar el archivo por:

```tsx
import { Box, Chip, IconButton, Link } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { Link as RouterLink } from "react-router-dom";
import type { SubscriptionDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import {
  AMOUNT_LABEL,
  cadenceAmountCaption,
  cadenceToggleLabel,
  increaseShortLabel,
  increaseSinceDetail,
  previousCurrencyLabel,
  subscriptionMeta,
  subscriptionTransactionsLink,
  type SubscriptionListProps,
  type SubscriptionVariant,
} from "../subscriptions.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { MIN_TAP_SIZE, iconTapTargetSx } from "./tapTarget.js";

interface SubscriptionCardProps {
  item: SubscriptionDTO;
  variant: SubscriptionVariant;
  onHide: (key: string) => void;
  onToggleAnnual: (key: string, annual: boolean) => void;
}

const movementsLinkSx: SxProps<Theme> = { display: "inline-flex", alignItems: "center", minHeight: MIN_TAP_SIZE };

const actionsSx: SxProps<Theme> = { display: "flex" };

const amountOf = ({ montoActual, moneda, cadencia }: SubscriptionDTO): string => {
  const amount = formatMoney(montoActual, moneda);
  const caption = cadenceAmountCaption(cadencia);
  return caption === null ? amount : `${amount} ${caption}`;
};

const highlightsOf = (item: SubscriptionDTO, variant: SubscriptionVariant): RecordField[] => [
  { label: AMOUNT_LABEL[variant], value: amountOf(item) },
  { label: "En pesos", value: formatMoneyOrDash(item.montoMensualArs, "ARS") },
];

const detailsOf = (item: SubscriptionDTO, variant: SubscriptionVariant): RecordField[] => {
  const { nombre, busqueda, primerCobro, ultimoCobro, proximoCobro, cobros, aumento, montoActual, moneda, monedaAnterior } = item;
  const nextCharge: RecordField[] = variant === "activas" ? [{ label: "Próximo cobro", value: proximoCobro }] : [];
  const increase: RecordField[] = aumento
    ? [{ label: "Aumento", value: increaseSinceDetail(aumento, montoActual, moneda) }]
    : [];
  const currency: RecordField[] = monedaAnterior ? [{ label: "Moneda", value: previousCurrencyLabel(monedaAnterior) }] : [];
  const movements = (
    <Link
      component={RouterLink}
      to={subscriptionTransactionsLink(busqueda)}
      aria-label={`Ver movimientos de ${nombre}`}
      sx={movementsLinkSx}
    >
      Ver movimientos
    </Link>
  );
  return [
    { label: "Desde", value: primerCobro },
    { label: "Último cobro", value: ultimoCobro },
    ...nextCharge,
    { label: "Cobros", value: String(cobros) },
    ...increase,
    ...currency,
    { label: "Movimientos", value: movements },
  ];
};

const SubscriptionCard = ({ item, variant, onHide, onToggleAnnual }: SubscriptionCardProps) => {
  const badge = item.aumento ? <Chip size="small" color="warning" label={increaseShortLabel(item.aumento)} /> : undefined;
  const toggleAnnual = () => onToggleAnnual(item.key, item.cadencia === "mensual");
  const hide = () => onHide(item.key);
  const action = (
    <Box sx={actionsSx}>
      <IconButton aria-label={cadenceToggleLabel(item.nombre, item.cadencia)} onClick={toggleAnnual} sx={iconTapTargetSx}>
        <EventRepeatOutlinedIcon />
      </IconButton>
      <IconButton aria-label={`Ocultar ${item.nombre}`} onClick={hide} sx={iconTapTargetSx}>
        <VisibilityOffOutlinedIcon />
      </IconButton>
    </Box>
  );

  return (
    <RecordCard
      title={item.nombre}
      meta={subscriptionMeta(item)}
      badge={badge}
      action={action}
      highlights={highlightsOf(item, variant)}
      details={detailsOf(item, variant)}
    />
  );
};

export const SubscriptionCards = ({ items, variant, onHide, onToggleAnnual }: SubscriptionListProps) => {
  const cards = items.map((item) => (
    <SubscriptionCard key={item.key} item={item} variant={variant} onHide={onHide} onToggleAnnual={onToggleAnnual} />
  ));
  return <Box sx={recordListSx}>{cards}</Box>;
};
```

- [ ] **Step 6: `SubscriptionsPage.tsx`**

Import del hook:

```ts
import { useSetSubscriptionAnnual, useSetSubscriptionHidden, useSubscriptions } from "../api/hooks.js";
```

Textos:

```ts
const INTRO = "Cobros que se repiten en tus tarjetas: los que aparecen 3 meses seguidos con montos parecidos, los de la categoría Suscripciones y los que marcaste desde Movimientos. No incluye cuotas ni impuestos.";
const EMPTY = "No encontramos suscripciones. Aparecen solas con 3 meses seguidos de cobros del mismo comercio, con la categoría Suscripciones o marcándolas desde Movimientos.";
```

En el componente, junto a `setHidden`:

```ts
  const { mutate: setHidden } = useSetSubscriptionHidden();
  const { mutate: setAnnual } = useSetSubscriptionAnnual();
```

Junto a `hide` y `show`:

```ts
  const toggleAnnual = useCallback((key: string, annual: boolean) => setAnnual({ key, annual }), [setAnnual]);
```

Y las dos listas reciben el handler:

```tsx
  const activeList = activas.length > 0
    ? <SubscriptionList items={activas} variant="activas" onHide={hide} onToggleAnnual={toggleAnnual} />
    : <Typography color="text.secondary">No hay cobros recurrentes activos.</Typography>;
```

```tsx
      <SubscriptionList items={cortadas} variant="cortadas" onHide={hide} onToggleAnnual={toggleAnnual} />
```

- [ ] **Step 7: Correr, typecheck y commit**

Run: `bunx vitest run client/src/api/hooks.test.tsx client/src/subscriptions.test.ts client/src/pages/SubscriptionsPage.test.tsx` → PASS.
Run: `bun run typecheck` → sin errores.

```bash
git branch --show-current
git add client/src/api/hooks.ts client/src/api/hooks.test.tsx client/src/subscriptions.ts client/src/subscriptions.test.ts client/src/components/SubscriptionsTable.tsx client/src/components/SubscriptionCards.tsx client/src/pages/SubscriptionsPage.tsx client/src/pages/SubscriptionsPage.test.tsx
git commit -m "feat(client): marcar suscripciones como anuales" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cliente — marcar como suscripción desde Movimientos

**Files:**
- Modify: `client/src/api/hooks.ts`
- Test: `client/src/api/hooks.test.tsx`
- Modify: `client/src/subscriptions.ts`
- Test: `client/src/subscriptions.test.ts`
- Modify: `client/src/components/TransactionsTable.tsx`
- Test: `client/src/components/TransactionsTable.test.tsx`
- Modify: `client/src/components/TransactionSheet.tsx`
- Test: `client/src/components/TransactionSheet.test.tsx`
- Modify: `client/src/components/TransactionsList.tsx`
- Test: `client/src/components/TransactionsList.test.tsx` (solo pasar la prop nueva)
- Modify: `client/src/pages/TransactionsPage.tsx`
- Test: `client/src/pages/TransactionsPage.test.tsx`

**Interfaces:**
- Consumes: `POST /api/subscriptions/manual` (Task 4); `snackbarAboveNavSx` de `client/src/components/snackbarSx.ts`; `MIN_TAP_SIZE` de `client/src/components/tapTarget.ts`.
- Produces: `useMarkSubscription(): UseMutationResult<void, Error, string>`; `canMarkAsSubscription(tx: TransactionDTO): boolean`; la prop `onMarkSubscription: (merchant: string) => void` en `TransactionsTable`, `TransactionsList` y `TransactionSheet`.

- [ ] **Step 1: Tests que fallan del hook y de la elegibilidad**

En `client/src/api/hooks.test.tsx`, sumar `useMarkSubscription` al import y, después del test de `useSetSubscriptionAnnual`:

```ts
  it("useMarkSubscription manda el comercio por POST e invalida las suscripciones", async () => {
    vi.stubGlobal("fetch", respond(204));
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMarkSubscription(), { wrapper: wrapperFor(client) });
    await act(() => result.current.mutateAsync("VIDEOMAX 99123"));
    expect(calledUrls()).toEqual(["POST /api/subscriptions/manual"]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ merchant: "VIDEOMAX 99123" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["subscriptions"] });
  });
```

En `client/src/subscriptions.test.ts`, sumar `TransactionDTO` al import de tipos de `@ledgerly/shared`, `canMarkAsSubscription` al import de `./subscriptions.js` y, al final:

```ts
describe("canMarkAsSubscription", () => {
  const purchase: TransactionDTO = {
    id: "t1", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-09-15",
    descriptionRaw: "VIDEOMAX 99123", merchant: "VIDEOMAX 99123", category: "Entretenimiento", categorySource: "rule",
    amount: 4500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
    installmentCurrent: null, installmentTotal: null, comprobante: null,
  };

  const NOT_ELIGIBLE: [string, Partial<TransactionDTO>][] = [
    ["una cuota", { isInstallment: true, installmentCurrent: 3, installmentTotal: 12 }],
    ["un crédito", { direction: "credit" }],
    ["un pago", { type: "payment", direction: "credit" }],
    ["un impuesto", { type: "tax" }],
    ["un monto en cero", { amount: 0 }],
  ];

  it("acepta un consumo en un pago, en pesos o en dólares", () => {
    expect(canMarkAsSubscription(purchase)).toBe(true);
    expect(canMarkAsSubscription({ ...purchase, currency: "USD" })).toBe(true);
  });

  it.each(NOT_ELIGIBLE)("rechaza %s", (_label, overrides) => {
    expect(canMarkAsSubscription({ ...purchase, ...overrides })).toBe(false);
  });
});
```

Run: `bunx vitest run client/src/api/hooks.test.tsx client/src/subscriptions.test.ts`
Expected: FAIL (`useMarkSubscription is not a function`, `canMarkAsSubscription is not a function`).

- [ ] **Step 2: Implementar el hook y la elegibilidad**

En `client/src/api/hooks.ts`, después de `useSetSubscriptionAnnual`:

```ts
export function useMarkSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (merchant: string) =>
      apiFetch<void>("/subscriptions/manual", { method: "POST", body: JSON.stringify({ merchant }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}
```

En `client/src/subscriptions.ts`, el import de tipos suma `TransactionDTO`:

```ts
import type { Cadencia, Currency, SubscriptionDTO, SubscriptionIncrease, TransactionDTO } from "@ledgerly/shared";
```

Y al final:

```ts
export function canMarkAsSubscription({ type, direction, isInstallment, amount }: TransactionDTO): boolean {
  return type === "purchase" && direction === "debit" && !isInstallment && amount > 0;
}
```

Run: `bunx vitest run client/src/api/hooks.test.tsx client/src/subscriptions.test.ts` → PASS.

- [ ] **Step 3: Tests que fallan de la grilla**

En `client/src/components/TransactionsTable.test.tsx`, `setup` devuelve los dos mocks:

```ts
const setup = () => {
  const onDelete = vi.fn();
  const onMarkSubscription = vi.fn();
  renderWithProviders(
    <TransactionsTable rows={rows} onCategoryChange={() => undefined} onDelete={onDelete} onMarkSubscription={onMarkSubscription} />,
  );
  return { onDelete, onMarkSubscription };
};
```

En los dos tests de borrado que usan el retorno, `const onDelete = setup();` pasa a `const { onDelete } = setup();`. Al final del archivo:

```ts
describe("TransactionsTable marcar como suscripción", () => {
  it("ofrece el botón solo en los consumos en un pago", () => {
    setup();
    expect(screen.getByRole("button", { name: "Marcar MERCADOLIBRE como suscripción" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar SU PAGO como suscripción" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar NOTEBOOK como suscripción" })).not.toBeInTheDocument();
  });

  it("al tocarlo manda el comercio y no selecciona la fila", async () => {
    const { onMarkSubscription } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Marcar MERCADOLIBRE como suscripción" }));
    expect(onMarkSubscription).toHaveBeenCalledWith("MERCADOLIBRE");
    expect(screen.queryByRole("button", { name: /borrar seleccionados/i })).not.toBeInTheDocument();
  });
});
```

Run: `bunx vitest run client/src/components/TransactionsTable.test.tsx`
Expected: FAIL (no existe el botón).

- [ ] **Step 4: Columna en `TransactionsTable.tsx`**

Imports:

```ts
import { useMemo, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { Box, Button, Chip, IconButton } from "@mui/material";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
```

y, después de `import { formatMoney } from "../format.js";`:

```ts
import { canMarkAsSubscription } from "../subscriptions.js";
```

Props y botón de celda (antes de `TransactionsTable`):

```tsx
interface TransactionsTableProps {
  rows: TransactionDTO[];
  onCategoryChange: (id: string, category: string) => void;
  onDelete: (ids: string[]) => void;
  onMarkSubscription: (merchant: string) => void;
}

interface MarkSubscriptionButtonProps {
  merchant: string;
  onMark: (merchant: string) => void;
}

const MarkSubscriptionButton = ({ merchant, onMark }: MarkSubscriptionButtonProps) => {
  const mark = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onMark(merchant);
  };

  return (
    <IconButton size="small" aria-label={`Marcar ${merchant} como suscripción`} onClick={mark}>
      <AutorenewOutlinedIcon fontSize="small" />
    </IconButton>
  );
};
```

La firma del componente suma la prop:

```tsx
export const TransactionsTable = ({ rows, onCategoryChange, onDelete, onMarkSubscription }: TransactionsTableProps) => {
```

Y `columns` suma la última columna y la dependencia:

```tsx
    {
      field: "subscription", headerName: "", width: 64, sortable: false, filterable: false, disableColumnMenu: true,
      renderCell: ({ row }: GridRenderCellParams<TransactionDTO>) =>
        (canMarkAsSubscription(row) ? <MarkSubscriptionButton merchant={row.merchant} onMark={onMarkSubscription} /> : null),
    },
  ], [onMarkSubscription]);
```

Run: `bunx vitest run client/src/components/TransactionsTable.test.tsx`
Expected: PASS. Si «no selecciona la fila» falla, falta el `stopPropagation`.

- [ ] **Step 5: Tests que fallan de la hoja mobile**

En `client/src/components/TransactionSheet.test.tsx`, después de `notebook`:

```ts
const musicapp: TransactionDTO = {
  ...notebook, id: "4", descriptionRaw: "MUSICAPP 7731", merchant: "MUSICAPP 7731", category: "Entretenimiento",
  amount: 5490, isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: "4",
};
```

`setup` recibe el movimiento y devuelve el mock nuevo:

```ts
const setup = (transaction: TransactionDTO = notebook) => {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  const onMarkSubscription = vi.fn();
  renderWithProviders(
    <TransactionSheet
      transaction={transaction}
      open
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      onMarkSubscription={onMarkSubscription}
    />,
  );
  const sheet = screen.getByRole("dialog", { name: transaction.merchant });
  return {
    onSave, onDelete, onClose, onMarkSubscription, sheet,
    category: within(sheet).getByRole("combobox", { name: "Categoría" }),
  };
};
```

Al final de `describe("TransactionSheet")`:

```ts
  it("un consumo en cuotas no ofrece marcarlo como suscripción", () => {
    const { sheet } = setup();
    expect(within(sheet).queryByRole("button", { name: "Es una suscripción" })).not.toBeInTheDocument();
  });

  it("«Es una suscripción» manda el comercio y cierra la hoja", async () => {
    const { sheet, onMarkSubscription, onClose, onSave } = setup(musicapp);
    await userEvent.click(within(sheet).getByRole("button", { name: "Es una suscripción" }));
    expect(onMarkSubscription).toHaveBeenCalledWith("MUSICAPP 7731");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
```

Run: `bunx vitest run client/src/components/TransactionSheet.test.tsx`
Expected: FAIL (no existe el botón).

- [ ] **Step 6: Botón en `TransactionSheet.tsx`**

Imports:

```ts
import { useState, type SyntheticEvent } from "react";
import { Autocomplete, Box, Button, TextField, type AutocompleteRenderInputParams } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { TransactionDTO } from "@ledgerly/shared";
import { useCategories } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { canMarkAsSubscription } from "../subscriptions.js";
import { installmentLabel } from "../transactionInstallment.js";
import { BottomSheet } from "./BottomSheet.js";
import { RecordFields, type RecordField } from "./RecordCard.js";
import { MIN_TAP_SIZE, tapTargetSx } from "./tapTarget.js";
```

Las dos interfaces suman la prop:

```ts
interface TransactionSheetProps {
  transaction: TransactionDTO | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, category: string) => void;
  onDelete: (transaction: TransactionDTO) => void;
  onMarkSubscription: (merchant: string) => void;
}

interface TransactionFormProps {
  transaction: TransactionDTO;
  onClose: () => void;
  onSave: (id: string, category: string) => void;
  onDelete: (transaction: TransactionDTO) => void;
  onMarkSubscription: (merchant: string) => void;
}
```

Después de `NO_CATEGORIES`:

```ts
const markSubscriptionSx: SxProps<Theme> = { minHeight: MIN_TAP_SIZE, mt: 2 };
```

`TransactionForm`:

```tsx
const TransactionForm = ({ transaction, onClose, onSave, onDelete, onMarkSubscription }: TransactionFormProps) => {
  const { data: categories = NO_CATEGORIES } = useCategories();
  const [category, setCategory] = useState(transaction.category);
  const nextCategory = category.trim();
  const changed = nextCategory !== "" && nextCategory !== transaction.category;

  const fields: RecordField[] = [
    { label: "Fecha", value: transaction.date },
    { label: "Tipo", value: transaction.type },
    { label: "Monto", value: formatMoney(transaction.amount, transaction.currency) },
    { label: "Cuota", value: installmentLabel(transaction) ?? "—" },
  ];

  const changeCategory = (_event: SyntheticEvent, value: string) => setCategory(value);

  const save = () => {
    if (!changed) return;
    onSave(transaction.id, nextCategory);
    onClose();
  };

  const remove = () => onDelete(transaction);

  const markSubscription = () => {
    onMarkSubscription(transaction.merchant);
    onClose();
  };

  const subscriptionButton = canMarkAsSubscription(transaction) && (
    <Button fullWidth variant="outlined" onClick={markSubscription} sx={markSubscriptionSx}>Es una suscripción</Button>
  );

  return (
    <>
      <RecordFields fields={fields} />
      <Autocomplete
        freeSolo
        options={categories}
        inputValue={category}
        onInputChange={changeCategory}
        renderInput={renderCategoryInput}
        sx={{ mt: 2.5 }}
      />
      {subscriptionButton}
      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button fullWidth color="error" onClick={remove} sx={tapTargetSx}>Borrar</Button>
        <Button fullWidth variant="contained" disabled={!changed} onClick={save} sx={tapTargetSx}>Guardar</Button>
      </Box>
    </>
  );
};

export const TransactionSheet = ({ transaction, open, onClose, onSave, onDelete, onMarkSubscription }: TransactionSheetProps) => (
  <BottomSheet open={open} onClose={onClose} title={transaction?.merchant ?? "Movimiento"}>
    {transaction && (
      <TransactionForm
        key={transaction.id}
        transaction={transaction}
        onClose={onClose}
        onSave={onSave}
        onDelete={onDelete}
        onMarkSubscription={onMarkSubscription}
      />
    )}
  </BottomSheet>
);
```

Run: `bunx vitest run client/src/components/TransactionSheet.test.tsx` → PASS.

- [ ] **Step 7: `TransactionsList` pasa la prop**

En `client/src/components/TransactionsList.tsx`:

```ts
interface TransactionsListProps {
  rows: TransactionDTO[];
  onCategoryChange: (id: string, category: string) => void;
  onDelete: (ids: string[]) => void;
  onMarkSubscription: (merchant: string) => void;
}
```

```tsx
export const TransactionsList = ({ rows, onCategoryChange, onDelete, onMarkSubscription }: TransactionsListProps) => {
```

```tsx
      <TransactionSheet
        transaction={target}
        open={open}
        onClose={close}
        onSave={onCategoryChange}
        onDelete={askDeleteOne}
        onMarkSubscription={onMarkSubscription}
      />
```

En `client/src/components/TransactionsList.test.tsx`, los tres renders suman `onMarkSubscription={vi.fn()}`:

```tsx
  renderWithProviders(
    <TransactionsList rows={items} onCategoryChange={onCategoryChange} onDelete={onDelete} onMarkSubscription={vi.fn()} />,
  );
```

```tsx
      <TransactionsList rows={shown} onCategoryChange={vi.fn()} onDelete={onDelete} onMarkSubscription={vi.fn()} />
```

(este último en `FilterHarness` y en `PushPastPageHarness`).

Run: `bunx vitest run client/src/components/TransactionsList.test.tsx` → PASS.

- [ ] **Step 8: Tests que fallan de la página**

En `client/src/pages/TransactionsPage.test.tsx`, el stub del `beforeEach` pasa a una función que deja elegir la respuesta del alta:

```ts
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const accepted = (): Response => new Response(null, { status: 204 });

const stubApi = (markResponse: () => Response = accepted): void => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("/subscriptions/manual")) return markResponse();
    const body = url.includes("/stats/monthly") ? [{ month: "2025-11", total: 1, count: 1 }, { month: "2026-05", total: 1, count: 1 }]
      : url.includes("/transactions/categories") ? ["Compras", "Salud"]
      : url.includes("/transactions") ? { items: [tx], total: 1, page: 1, pageSize: 50 }
      : {};
    return json(body);
  }));
};

beforeEach(() => stubApi());
```

Dentro de `describe("TransactionsPage")`, al final:

```ts
  it("marcar un consumo como suscripción manda el POST con el comercio y avisa", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await userEvent.click(await screen.findByRole("button", { name: "Marcar MERCADOLIBRE como suscripción" }));
    expect(await screen.findByText("Agregado a Suscripciones")).toBeInTheDocument();
    const call = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes("/subscriptions/manual"));
    expect((call?.[1] as RequestInit | undefined)?.method).toBe("POST");
    expect(JSON.parse(String((call?.[1] as RequestInit | undefined)?.body))).toEqual({ merchant: "MERCADOLIBRE" });
    expect(screen.queryByRole("button", { name: /borrar seleccionados/i })).not.toBeInTheDocument();
  });

  it("si el server no lo acepta avisa que no pudo marcarlo", async () => {
    stubApi(() => json({ error: "Este comercio no tiene un nombre reconocible" }, 400));
    const { default: userEvent } = await import("@testing-library/user-event");
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    await userEvent.click(await screen.findByRole("button", { name: "Marcar MERCADOLIBRE como suscripción" }));
    expect(await screen.findByText("No pudimos marcarlo como suscripción")).toBeInTheDocument();
    expect(screen.queryByText("Agregado a Suscripciones")).not.toBeInTheDocument();
  });
```

Dentro de `describe("TransactionsPage en mobile")`, al final:

```ts
  it("«Es una suscripción» desde la hoja manda el POST y avisa", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderWithProviders(<TransactionsPage />, { route: "/transactions" });
    const sheet = await openSheet();
    await userEvent.click(within(sheet).getByRole("button", { name: "Es una suscripción" }));
    expect(await screen.findByText("Agregado a Suscripciones")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]).includes("/subscriptions/manual"))).toBe(true);
  });
```

Run: `bunx vitest run client/src/pages/TransactionsPage.test.tsx`
Expected: FAIL en los tres nuevos (la página todavía no pasa `onMarkSubscription` ni muestra el snackbar); los de hoy pasan.

- [ ] **Step 9: Hook y snackbar en `TransactionsPage.tsx`**

Reemplazar el archivo por:

```tsx
import { useCallback, useState } from "react";
import { Alert, CircularProgress, Snackbar, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import {
  useDeleteTransactions, useMarkSubscription, usePatchTransaction, useTransactions, type TxFilters,
} from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { snackbarAboveNavSx } from "../components/snackbarSx.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useTransactionYearOptions } from "../filters/useYearOptions.js";
import { TransactionsList } from "../components/TransactionsList.js";
import { TransactionsTable } from "../components/TransactionsTable.js";
import { useIsMobile } from "../useIsMobile.js";

interface MarkFeedback {
  severity: "success" | "error";
  message: string;
}

const TRANSACTION_FIELDS: FilterField[] = ["year", "currency", "card", "month", "transaction"];
const SNACKBAR_ANCHOR = { vertical: "bottom", horizontal: "center" } as const;
const MARKED: MarkFeedback = { severity: "success", message: "Agregado a Suscripciones" };
const MARK_FAILED: MarkFeedback = { severity: "error", message: "No pudimos marcarlo como suscripción" };

export const TransactionsPage = () => {
  const [params] = useSearchParams();
  const { years, currency, cardLabel, from, to } = useGlobalFilters();
  const isMobile = useIsMobile();
  const { mutate: patchTransaction } = usePatchTransaction();
  const { mutate: deleteTransactions } = useDeleteTransactions();
  const { mutate: markSubscription } = useMarkSubscription();
  const [feedback, setFeedback] = useState<MarkFeedback | null>(null);
  const filters: TxFilters = {
    currency: params.get("currency") === null ? undefined : currency,
    from,
    to,
    year: years,
    category: params.getAll("category"),
    search: params.get("search") ?? undefined,
    cardLabel,
    installment: params.get("installment") ?? undefined,
  };
  const { data, isLoading, isError, error } = useTransactions(filters);
  const yearOptions = useTransactionYearOptions(currency, cardLabel);

  const changeCategory = useCallback(
    (id: string, category: string) => patchTransaction({ id, body: { category } }),
    [patchTransaction],
  );
  const deleteRows = useCallback((ids: string[]) => deleteTransactions(ids), [deleteTransactions]);
  const markAsSubscription = useCallback((merchant: string) => markSubscription(merchant, {
    onSuccess: () => setFeedback(MARKED),
    onError: () => setFeedback(MARK_FAILED),
  }), [markSubscription]);
  const dismissFeedback = useCallback(() => setFeedback(null), []);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  const Rows = isMobile ? TransactionsList : TransactionsTable;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Movimientos</Typography>
      <FiltersBar fields={TRANSACTION_FIELDS} yearOptions={yearOptions} />
      <Rows
        rows={data?.items ?? []}
        onCategoryChange={changeCategory}
        onDelete={deleteRows}
        onMarkSubscription={markAsSubscription}
      />
      <Snackbar
        open={feedback !== null}
        autoHideDuration={6000}
        onClose={dismissFeedback}
        sx={snackbarAboveNavSx}
        anchorOrigin={SNACKBAR_ANCHOR}
      >
        {feedback ? <Alert severity={feedback.severity} onClose={dismissFeedback}>{feedback.message}</Alert> : undefined}
      </Snackbar>
    </>
  );
};
```

- [ ] **Step 10: Correr, typecheck y commit**

Run: `bunx vitest run client/src/api/hooks.test.tsx client/src/subscriptions.test.ts client/src/components/TransactionsTable.test.tsx client/src/components/TransactionSheet.test.tsx client/src/components/TransactionsList.test.tsx client/src/pages/TransactionsPage.test.tsx client/src/pages/TransactionsPage.filters.test.tsx` → PASS.
Run: `bun run typecheck` → sin errores.

```bash
git branch --show-current
git add client/src/api/hooks.ts client/src/api/hooks.test.tsx client/src/subscriptions.ts client/src/subscriptions.test.ts client/src/components/TransactionsTable.tsx client/src/components/TransactionsTable.test.tsx client/src/components/TransactionSheet.tsx client/src/components/TransactionSheet.test.tsx client/src/components/TransactionsList.tsx client/src/components/TransactionsList.test.tsx client/src/pages/TransactionsPage.tsx client/src/pages/TransactionsPage.test.tsx
git commit -m "feat(client): marcar una suscripción desde Movimientos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación final

**Files:** ninguno del repo. Los dos scripts van al scratchpad de la sesión y no se commitean.

**Interfaces:**
- Consumes: todo lo anterior; `connectMongo` (`server/src/db/connection.ts`), `createApp` (`server/src/http/app.ts`), `serveClient` (`server/src/http/serveClient.ts`).
- Produces: el resultado de la validación contra la base local, para el resumen al usuario (sin datos reales en ningún texto que vaya a GitHub).

- [ ] **Step 1: Suite, typecheck y build**

Run: `bun run test` → todo en verde (anotar cualquier falla ajena a la feature que ya fallara en la base).
Run: `bun run typecheck` → sin errores.
Run: `bun run build` → build de Vite sin errores.

- [ ] **Step 2: Server temporal sin el job de mail**

`server/src/index.ts` arranca el job de mail; para no disparar sincronizaciones, el server temporal se arma con `createApp`. Crear `<scratchpad>/tempServer.ts`:

```ts
import { connectMongo } from "/Users/sebastianopderbeck/WebstormProjects/sopderbeck/Ledgerly/server/src/db/connection.js";
import { createApp } from "/Users/sebastianopderbeck/WebstormProjects/sopderbeck/Ledgerly/server/src/http/app.js";
import { serveClient } from "/Users/sebastianopderbeck/WebstormProjects/sopderbeck/Ledgerly/server/src/http/serveClient.js";

const port = Number(process.env.PORT);
await connectMongo(process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly");
const app = createApp();
serveClient(app, "/Users/sebastianopderbeck/WebstormProjects/sopderbeck/Ledgerly/client/dist");
app.listen(port, "127.0.0.1", () => console.log(`Ledgerly temporal en http://127.0.0.1:${port}`));
```

Elegir un puerto libre (`lsof -iTCP:4310 -sTCP:LISTEN` vacío; si no, 4311, …) y, desde la raíz del repo, en background guardando el PID:

Run: `PORT=4310 node --env-file=.env --import tsx <scratchpad>/tempServer.ts`
Expected: «Ledgerly temporal en http://127.0.0.1:4310».

- [ ] **Step 3: Comparar contra el servicio instalado (solo lectura)**

El servicio del 4100 corre `main`, sin esta feature. Crear `<scratchpad>/compareSubscriptions.ts`:

```ts
interface Item {
  key: string;
  estado: string;
  cadencia?: string;
  cobros: number;
  ultimoCobro: string;
  proximoCobro: string;
  oculta: boolean;
}

interface Report {
  cotizacionOficial: number | null;
  totalMensualArs: number;
  totalMensualUsd: number;
  items: Item[];
}

const [antesUrl, despuesUrl] = process.argv.slice(2);
const load = async (url: string): Promise<Report> => (await fetch(`${url}/api/subscriptions`)).json() as Promise<Report>;
const [antes, despues] = await Promise.all([load(antesUrl), load(despuesUrl)]);
const viejas = new Map(antes.items.map((entry) => [entry.key, entry]));
const nuevas = new Map(despues.items.map((entry) => [entry.key, entry]));
const sinCadencia = ({ cadencia: _cadencia, ...resto }: Item): string => JSON.stringify(resto);
const cambio = (entry: Item): boolean => {
  const nueva = nuevas.get(entry.key);
  return nueva !== undefined && sinCadencia(entry) !== sinCadencia(nueva);
};
const resumen = ({ key, estado, cadencia, cobros, ultimoCobro, proximoCobro, oculta }: Item) =>
  ({ key, estado, cadencia, cobros, ultimoCobro, proximoCobro, oculta });

console.log("Nuevas:", despues.items.filter(({ key }) => !viejas.has(key)).map(resumen));
console.log("Ya no aparecen:", antes.items.filter(({ key }) => !nuevas.has(key)).map(({ key }) => key));
console.log("Cambiaron:", antes.items.filter(cambio).map(({ key }) => ({ antes: viejas.get(key), despues: nuevas.get(key) })));
console.log("Sin cadencia mensual:", despues.items.filter(({ cadencia }) => cadencia !== "mensual").map(({ key }) => key));
console.log("Totales:", {
  antes: [antes.cotizacionOficial, antes.totalMensualArs, antes.totalMensualUsd],
  despues: [despues.cotizacionOficial, despues.totalMensualArs, despues.totalMensualUsd],
});
```

Run: `node --import tsx <scratchpad>/compareSubscriptions.ts http://127.0.0.1:4100 http://127.0.0.1:4310`

Expected:
- «Nuevas» trae las tres suscripciones del «Problema» del spec: las dos mensuales `activa` y la anual `cortada`, todas con `cadencia: "mensual"` y `cobros: 1`. Si aparece alguna compra suelta categorizada como «Suscripciones», es el efecto aceptado del spec (se saca con Ocultar).
- «Ya no aparecen» vacío.
- «Cambiaron» vacío. La única diferencia admisible es un `aumento` distinto por la ventana por mes (Review Focus 4). Si las dos cotizaciones de «Totales» difieren, también cambia `montoMensualArs` de las que están en USD: repetir la corrida. Cualquier otra diferencia, frenar y revisar.
- «Sin cadencia mensual» vacío.

- [ ] **Step 4: Marcar la anual (escribe en la base real: pedir confirmación)**

Preguntar al usuario antes de escribir: la marca anual es un cambio real en su base y queda guardado. Con el OK, tomar la `key` de la anual de «Nuevas»:

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X PUT "http://127.0.0.1:4310/api/subscriptions/annual/<key codificada>"`
Expected: `204`.

Run otra vez el script del Step 3.
Expected: esa clave pasa a `estado: "activa"`, `cadencia: "anual"` y `proximoCobro` un año después de su último cobro; `totalMensualArs` de «después» sube en el `montoMensualArs` de esa suscripción (1/12 de su monto en pesos).

Si el usuario no confirma, queda como pendiente para él (se hace con el botón de la página Suscripciones una vez mergeado).

- [ ] **Step 5: Revisión visual y cierre del server**

Con el server temporal, abrir `http://127.0.0.1:4310/suscripciones` y `http://127.0.0.1:4310/transactions` en compu y a 375 px: botón de cadencia con tooltip, captions «por año»/«por mes», columna del botón en Movimientos y «Es una suscripción» en la hoja. Solo mirar: no marcar nada desde Movimientos. Si no hay navegador disponible, queda pendiente para el usuario.

Matar el server temporal por su PID (nunca por puerto): `kill <PID>`.

- [ ] **Step 6: Estado final**

Run: `git status` → limpio salvo archivos ajenos de otras sesiones; `git log --oneline main..` → los seis commits de las Tasks 1-6 (más el del spec). No hacer push ni PR: la integración la hace el usuario.
