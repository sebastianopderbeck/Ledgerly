# Presupuestos por categoría — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la página Presupuestos (`/presupuestos`): topes mensuales en pesos por categoría, opcionalmente ajustados por IPC, con el gasto del mes contra cada tope, su estado y el histórico de cumplimiento.

**Architecture:** El server guarda los topes (`/api/budgets`, CRUD) y sirve el gasto en ARS agregado por mes y categoría más el último mes cerrado (`/api/budgets/spending`). El cliente calcula topes del mes, estados, totales, meses e histórico en un módulo puro (`client/src/budgets.ts`, con `budgetsView` que arma la vista entera). Dos hooks (`useBudgetsPage`, `useBudgetEditor`) combinan queries y mutaciones, y la página solo compone componentes.

**Tech Stack:** React 18 + MUI 6 + react-router 6 + @tanstack/react-query 5 + @nivo/bar (cliente); Express + Mongoose (server); zod (shared); Vitest + Testing Library + supertest + mongodb-memory-server (tests); Bun como runner.

**Spec:** `docs/superpowers/specs/2026-10-03-presupuestos-design.md`

## Prerrequisitos

- Trabajar en la rama `feat/presupuestos`, creada desde `feat/base-nuevas-features`, en un worktree propio. `bun install` si el worktree es nuevo.
- La base ya trae: ruta y stub de la página, ítem del menú, router stub montado en `/api/budgets`, `BudgetModel`, `toBudgetDTO`, los DTOs de presupuestos, los hooks `useBudgets`/`useBudgetSpending`/`useCreateBudget`/`useUpdateBudget`/`useDeleteBudget`, `inflationIndex.ts`, `moneyInput.ts`, `transactionsLink.ts`, `categoryOptions.ts` y `ResponsiveSheet.tsx`. No se crean de nuevo ni se modifican.

## Global Constraints

- **Archivos que no se tocan**: `shared/*`, `server/src/db/models.ts`, `server/src/http/app.ts`, `server/src/http/mappers.ts`, `server/src/http/routes/stats.ts`, `client/src/App.tsx`, `client/src/App.test.tsx`, `client/src/api/hooks.ts`, `client/src/components/layout/*`, `client/src/filters/{globalFilters,useGlobalFilters,transactionsLink}.ts`, `client/src/inflationIndex.ts`, `client/src/moneyInput.ts`, `client/src/categoryOptions.ts`, `client/src/components/ResponsiveSheet.tsx`, `client/src/format.ts`, los `package.json`, `bun.lock`, `.env.example` y `README.md`. Los stubs `server/src/http/routes/budgets.ts` y `client/src/pages/BudgetsPage.tsx` se **reemplazan** (son de esta feature).
- **Sin comentarios en el código**: nada de `//`, bloques ni JSDoc.
- Componentes funcionales `const X = ({ props }: XProps) => {...}`, destructuring en la firma, `interface` para props, prohibido `any`. Filtros, mapeos y condicionales antes del `return`. `key` siempre por id o nombre, nunca por índice. Carga y error con early returns.
- Imports con extensión `.js` (ESM). El cliente importa solo **tipos** de `@ledgerly/shared`.
- Copy en español rioplatense, exacto: estados «En rango», «Cerca», «Pasado»; botones «Nuevo tope», «Poner tope», «Categorizar», «Ver movimientos», «Borrar», «Cancelar», «Guardar»; `aria-label` «mes anterior», «mes siguiente», «editar tope de {categoría}», «Poner tope a {categoría}».
- Umbral de «cerca»: `CERCA_DESDE = 0.8`; «cerca» incluye el 100 %.
- Objetivos táctiles de 44 px con `tapTargetSx` / `iconTapTargetSx` / `MIN_TAP_SIZE` de `client/src/components/tapTarget.ts`.
- Tests de cliente con más de un render en el archivo llevan `afterEach(cleanup)` (el auto-cleanup de RTL está apagado). Los que emulan viewport suman `vi.unstubAllGlobals()`.
- Fixtures siempre sintéticos. `examples/` nunca se commitea.
- Comandos: `bun run test <ruta>` (vitest run), `bun run typecheck`, `bun run build`. No levantar la app.
- Commits con pathspec explícito y mensaje convencional en español, terminado en la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git add -A`, nunca push.

## Review Focus

1. **Dos altas simultáneas de la misma categoría**: las dos pasan el `exists` y la segunda choca con el índice único; tiene que responder `409`, no `500`. → test en Task 2.
2. **Reabrir «Nuevo tope» después de guardar o cancelar**: no puede arrastrar el borrador anterior (ni una categoría que ya tiene tope y no está en las opciones). → test en Task 7 (`editorKey`).
3. **Mes global sin consumos elegido en otra sección** (`from=2026-12-01`): se respeta, se suma a los meses elegibles y las flechas siguen andando. → test en Task 5 (`budgetsView`).
4. **Tope ajustado en un mes posterior al último IPC**: se queda con el último factor publicado y la fila lo aclara («IPC hasta agosto de 2026»). → tests en Task 4.
5. **Montos tipeados raros** («0», «abc», vacío): `parseMoneyInput` acepta `0`, así que «Guardar» tiene que quedar deshabilitado y el campo marcado en rojo. → test en Task 7.

---

### Task 1: Último mes cerrado (server)

**Files:**
- Create: `server/src/stats/closedMonth.ts`
- Test: `server/src/stats/closedMonth.test.ts`

**Interfaces:**
- Consumes: `addMonths(month, n)`, `lastDayOfMonth(month)`, `monthOf(iso)` de `server/src/stats/months.ts`.
- Produces: `lastClosedMonth(closingDates: Array<Date | null>): string | null`.

- [ ] **Step 1: Write the failing test**

`server/src/stats/closedMonth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lastClosedMonth } from "./closedMonth.js";

const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

describe("lastClosedMonth", () => {
  it("un cierre a principio de mes cubre completo el mes anterior", () => {
    expect(lastClosedMonth([day("2026-10-02")])).toBe("2026-09");
  });

  it("un cierre el último día del mes cierra ese mismo mes", () => {
    expect(lastClosedMonth([day("2026-09-30")])).toBe("2026-09");
  });

  it("un cierre antes del último día deja abierto su mes", () => {
    expect(lastClosedMonth([day("2026-09-25")])).toBe("2026-08");
  });

  it("cruza el cambio de año", () => {
    expect(lastClosedMonth([day("2026-01-02")])).toBe("2025-12");
    expect(lastClosedMonth([day("2025-12-31")])).toBe("2025-12");
  });

  it("respeta febrero de 28 y de 29 días", () => {
    expect(lastClosedMonth([day("2026-02-28")])).toBe("2026-02");
    expect(lastClosedMonth([day("2028-02-28")])).toBe("2028-01");
    expect(lastClosedMonth([day("2028-02-29")])).toBe("2028-02");
  });

  it("con varias tarjetas manda el cierre más reciente e ignora los null", () => {
    expect(lastClosedMonth([day("2026-09-25"), null, day("2026-10-02"), day("2026-08-28")])).toBe("2026-09");
  });

  it("sin fechas devuelve null", () => {
    expect(lastClosedMonth([])).toBeNull();
    expect(lastClosedMonth([null, null])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/stats/closedMonth.test.ts`
Expected: FAIL — `Failed to load url ./closedMonth.js`.

- [ ] **Step 3: Write minimal implementation**

`server/src/stats/closedMonth.ts`:

```ts
import { addMonths, lastDayOfMonth, monthOf } from "./months.js";

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export function lastClosedMonth(closingDates: Array<Date | null>): string | null {
  const days = closingDates.filter((date): date is Date => date !== null).map(isoDay);
  if (days.length === 0) return null;
  const latest = days.reduce((best, current) => (current > best ? current : best));
  const month = monthOf(latest);
  return latest === lastDayOfMonth(month) ? month : addMonths(month, -1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/stats/closedMonth.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/closedMonth.ts server/src/stats/closedMonth.test.ts
git commit -m "feat(server): último mes cerrado según el cierre más reciente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: CRUD de topes (`/api/budgets`)

**Files:**
- Modify (reemplaza el stub): `server/src/http/routes/budgets.ts`
- Test: `server/src/http/routes/budgets.test.ts`

**Interfaces:**
- Consumes: `budgetInputSchema`, `budgetPatchSchema` (`@ledgerly/shared`); `BudgetModel`, `InflationRateModel` (`models.ts`); `toBudgetDTO` (`mappers.ts`); `HttpError`, `asyncHandler` (`errors.ts`).
- Produces: `budgetsRouter` con `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`. Mensajes: `"Tope inválido: category no vacía y topeArs mayor a 0"`, `"Tope inválido: mandá topeArs mayor a 0 o ajustaInflacion"`, `"Ya hay un tope para «{category}»"`, `"Tope no encontrado"`.

- [ ] **Step 1: Write the failing test**

`server/src/http/routes/budgets.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { BudgetModel, InflationRateModel } from "../../db/models.js";

withDb();
const app = createApp();

const MISSING_ID = "64b7f9c2a1b2c3d4e5f60718";
const INVALID_INPUT = "Tope inválido: category no vacía y topeArs mayor a 0";
const INVALID_PATCH = "Tope inválido: mandá topeArs mayor a 0 o ajustaInflacion";

const seedInflation = (...periodos: string[]) =>
  InflationRateModel.insertMany(periodos.map((periodo) => ({ periodo, variacionMensual: 2 })));

const createBudget = (body: object) => request(app).post("/api/budgets").send(body);

afterEach(() => {
  vi.useRealTimers();
});

describe("CRUD de /api/budgets", () => {
  it("el POST crea el tope con periodoBase en el último IPC publicado", async () => {
    await seedInflation("2026-08", "2026-07");
    const created = await createBudget({ category: "Comida", topeArs: 300000, ajustaInflacion: true });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String), category: "Comida", topeArs: 300000, ajustaInflacion: true, periodoBase: "2026-08",
    });
  });

  it("sin ajustaInflacion queda en false y la categoría se guarda sin espacios", async () => {
    await seedInflation("2026-08");
    const created = await createBudget({ category: "  Ropa ", topeArs: 1500.5 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ category: "Ropa", topeArs: 1500.5, ajustaInflacion: false });
  });

  it("el GET lista los topes ordenados por categoría", async () => {
    await seedInflation("2026-08");
    await createBudget({ category: "Transporte", topeArs: 100000 });
    await createBudget({ category: "Comida", topeArs: 300000 });
    const list = await request(app).get("/api/budgets");
    expect(list.status).toBe(200);
    expect(list.body.map((budget: { category: string }) => budget.category)).toEqual(["Comida", "Transporte"]);
  });

  it("el PATCH cambia el tope, ignora la categoría y rebasea periodoBase al IPC más nuevo", async () => {
    await seedInflation("2026-07");
    const { body: created } = await createBudget({ category: "Comida", topeArs: 300000, ajustaInflacion: true });
    expect(created.periodoBase).toBe("2026-07");
    await seedInflation("2026-08");
    const patched = await request(app).patch(`/api/budgets/${created.id}`).send({ topeArs: 320000, category: "Otra" });
    expect(patched.status).toBe(200);
    expect(patched.body).toEqual({
      id: created.id, category: "Comida", topeArs: 320000, ajustaInflacion: true, periodoBase: "2026-08",
    });
  });

  it("el PATCH puede cambiar solo el ajuste por inflación", async () => {
    await seedInflation("2026-08");
    const { body: created } = await createBudget({ category: "Comida", topeArs: 300000 });
    const patched = await request(app).patch(`/api/budgets/${created.id}`).send({ ajustaInflacion: true });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ topeArs: 300000, ajustaInflacion: true });
  });

  it("el DELETE borra el tope", async () => {
    await seedInflation("2026-08");
    const { body: created } = await createBudget({ category: "Comida", topeArs: 300000 });
    expect((await request(app).delete(`/api/budgets/${created.id}`)).status).toBe(204);
    expect((await request(app).get("/api/budgets")).body).toEqual([]);
  });

  it.each([MISSING_ID, "no-es-un-id"])("PATCH y DELETE con el id %s dan 404", async (id) => {
    const patched = await request(app).patch(`/api/budgets/${id}`).send({ topeArs: 1000 });
    expect(patched.status).toBe(404);
    expect(patched.body.error).toBe("Tope no encontrado");
    expect((await request(app).delete(`/api/budgets/${id}`)).status).toBe(404);
  });

  it("sin IPC cargado periodoBase es el mes actual", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    const created = await createBudget({ category: "Comida", topeArs: 300000 });
    expect(created.status).toBe(201);
    expect(created.body.periodoBase).toBe("2026-10");
  });
});

describe("validación de /api/budgets", () => {
  it.each([
    ["sin categoría", { topeArs: 1000 }],
    ["con la categoría en blanco", { category: "   ", topeArs: 1000 }],
    ["con tope cero", { category: "Comida", topeArs: 0 }],
    ["con tope negativo", { category: "Comida", topeArs: -5 }],
    ["con un tope que no es número", { category: "Comida", topeArs: "300.000" }],
  ])("el POST da 400 %s", async (_caso, body) => {
    const response = await createBudget(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(INVALID_INPUT);
  });

  it.each([
    ["con el body vacío", {}],
    ["con tope negativo", { topeArs: -1 }],
    ["solo con la categoría", { category: "Ropa" }],
  ])("el PATCH da 400 %s", async (_caso, body) => {
    await seedInflation("2026-08");
    const { body: created } = await createBudget({ category: "Comida", topeArs: 300000 });
    const response = await request(app).patch(`/api/budgets/${created.id}`).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(INVALID_PATCH);
  });

  it("el POST de una categoría que ya tiene tope da 409", async () => {
    await createBudget({ category: "Comida", topeArs: 300000 });
    const repeated = await createBudget({ category: "Comida", topeArs: 100 });
    expect(repeated.status).toBe(409);
    expect(repeated.body.error).toBe("Ya hay un tope para «Comida»");
  });

  it("dos altas simultáneas de la misma categoría dejan un solo tope y responden 201 y 409", async () => {
    await BudgetModel.init();
    const responses = await Promise.all([
      createBudget({ category: "Comida", topeArs: 1 }),
      createBudget({ category: "Comida", topeArs: 2 }),
    ]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(await BudgetModel.countDocuments()).toBe(1);
  });

  it("el índice único rechaza duplicados", async () => {
    await BudgetModel.init();
    await BudgetModel.create({ category: "Comida", topeArs: 1, periodoBase: "2026-08" });
    await expect(BudgetModel.create({ category: "Comida", topeArs: 2, periodoBase: "2026-08" })).rejects.toThrow(/duplicate key/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/http/routes/budgets.test.ts`
Expected: FAIL — las rutas no existen (404 en todos los pedidos) salvo el test del índice único.

- [ ] **Step 3: Write minimal implementation**

`server/src/http/routes/budgets.ts` (reemplaza el stub):

```ts
import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { budgetInputSchema, budgetPatchSchema } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { BudgetModel, InflationRateModel } from "../../db/models.js";
import { toBudgetDTO } from "../mappers.js";

export const budgetsRouter = Router();

const DUPLICATE_KEY = 11000;
const INVALID_INPUT = "Tope inválido: category no vacía y topeArs mayor a 0";
const INVALID_PATCH = "Tope inválido: mandá topeArs mayor a 0 o ajustaInflacion";
const NOT_FOUND = "Tope no encontrado";

const duplicated = (category: string): HttpError => new HttpError(409, `Ya hay un tope para «${category}»`);

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === DUPLICATE_KEY;

const basePeriod = async (): Promise<string> => {
  const latest = await InflationRateModel.findOne().sort({ periodo: -1 }).lean();
  return latest?.periodo ?? new Date().toISOString().slice(0, 7);
};

const validId = (id: string): string => {
  if (!isValidObjectId(id)) throw new HttpError(404, NOT_FOUND);
  return id;
};

budgetsRouter.get("/", asyncHandler(async (_req, res) => {
  const budgets = await BudgetModel.find().sort({ category: 1 });
  res.json(budgets.map(toBudgetDTO));
}));

budgetsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = budgetInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_INPUT);
  const { category } = parsed.data;
  if (await BudgetModel.exists({ category })) throw duplicated(category);
  const periodoBase = await basePeriod();
  try {
    const doc = await BudgetModel.create({ ...parsed.data, periodoBase });
    res.status(201).json(toBudgetDTO(doc));
  } catch (error) {
    throw isDuplicateKey(error) ? duplicated(category) : error;
  }
}));

budgetsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const id = validId(req.params.id);
  const parsed = budgetPatchSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_PATCH);
  const periodoBase = await basePeriod();
  const doc = await BudgetModel.findByIdAndUpdate(id, { ...parsed.data, periodoBase }, { new: true });
  if (!doc) throw new HttpError(404, NOT_FOUND);
  res.json(toBudgetDTO(doc));
}));

budgetsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = validId(req.params.id);
  const { deletedCount } = await BudgetModel.deleteOne({ _id: id });
  if (deletedCount === 0) throw new HttpError(404, NOT_FOUND);
  res.status(204).end();
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/http/routes/budgets.test.ts`
Expected: PASS (20 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/budgets.ts server/src/http/routes/budgets.test.ts
git commit -m "feat(server): alta, edición y baja de topes por categoría

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Gasto por mes y categoría (`/api/budgets/spending`)

**Files:**
- Modify: `server/src/http/routes/budgets.ts`
- Modify: `server/src/http/routes/budgets.test.ts`

**Interfaces:**
- Consumes: `lastClosedMonth` (Task 1); `parseYears`, `yearDateRanges` (`server/src/http/yearFilter.ts`); `StatementModel`, `TransactionModel`, `TransactionDoc`.
- Produces: `GET /api/budgets/spending?year=…` → `BudgetSpendingDTO` (`{ ultimoMesCerrado: string | null; gastos: CategoryMonthStat[] }`, `gastos` ordenado por mes ascendente y total descendente).

- [ ] **Step 1: Write the failing test**

En `server/src/http/routes/budgets.test.ts`, cambiar los imports del principio por:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import type { CategoryMonthStat } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { BudgetModel, InflationRateModel, StatementModel, TransactionModel } from "../../db/models.js";
```

Y agregar al final del archivo:

```ts
interface TxSeed {
  date: string;
  category: string;
  amount: number;
  currency?: "ARS" | "USD";
  type?: string;
  cardLabel?: string;
}

interface CategoryTotal {
  category: string;
  total: number;
}

const money = { ars: 0, usd: 0 };
let statementCount = 0;

const seedStatement = (closingDate: string | null) => {
  statementCount += 1;
  return StatementModel.create({
    issuer: "visa_signature", cardLabel: "Visa ****1234", last4: "1234",
    closingDate: closingDate === null ? null : new Date(closingDate), dueDate: null,
    totals: { totalConsumos: money, saldoActual: money, pagoMinimo: money, saldoAnterior: money },
    sourceFileName: `resumen-${statementCount}.pdf`, sourceHash: `hash-${statementCount}`, pageCount: 1,
    parserVersion: "1", needsReview: false, reconciliation: { ok: true, entries: [] },
  });
};

const seedTransactions = async (rows: TxSeed[]) => {
  const statement = await seedStatement(null);
  await TransactionModel.insertMany(rows.map((row, index) => ({
    statementId: statement._id, issuer: "visa_signature", cardLabel: row.cardLabel ?? "Visa ****1234",
    date: new Date(row.date), descriptionRaw: `COMERCIO ${index}`, merchant: `COMERCIO ${index}`,
    category: row.category, categorySource: "rule", amount: row.amount, currency: row.currency ?? "ARS",
    direction: "debit", type: row.type ?? "purchase", isInstallment: false, fingerprint: `f${index}`,
  })));
};

const byCategory = (a: CategoryTotal, b: CategoryTotal): number => a.category.localeCompare(b.category);

describe("GET /api/budgets/spending", () => {
  it("agrupa por mes y categoría solo los consumos en pesos de todas las tarjetas", async () => {
    await seedTransactions([
      { date: "2026-09-01", category: "Comida", amount: 100 },
      { date: "2026-09-15", category: "Comida", amount: 50 },
      { date: "2026-09-20", category: "Transporte", amount: 30 },
      { date: "2026-09-05", category: "Ropa", amount: 10, cardLabel: "ICBC Mastercard" },
      { date: "2026-09-10", category: "Comida", amount: 999, currency: "USD" },
      { date: "2026-09-11", category: "Comida", amount: 500, type: "payment" },
      { date: "2026-09-12", category: "Comida", amount: 70, type: "tax" },
      { date: "2026-09-13", category: "Comida", amount: -40, type: "refund" },
      { date: "2026-10-01", category: "Comida", amount: 20 },
    ]);
    const response = await request(app).get("/api/budgets/spending");
    expect(response.status).toBe(200);
    expect(response.body.gastos).toEqual([
      { month: "2026-09", category: "Comida", total: 150, count: 2 },
      { month: "2026-09", category: "Transporte", total: 30, count: 1 },
      { month: "2026-09", category: "Ropa", total: 10, count: 1 },
      { month: "2026-10", category: "Comida", total: 20, count: 1 },
    ]);
  });

  it("con year solo trae los meses de esos años", async () => {
    await seedTransactions([
      { date: "2025-12-31", category: "Comida", amount: 10 },
      { date: "2026-01-01", category: "Comida", amount: 20 },
    ]);
    const only2026 = await request(app).get("/api/budgets/spending?year=2026");
    expect(only2026.body.gastos.map((gasto: CategoryMonthStat) => gasto.month)).toEqual(["2026-01"]);
    const all = await request(app).get("/api/budgets/spending");
    expect(all.body.gastos.map((gasto: CategoryMonthStat) => gasto.month)).toEqual(["2025-12", "2026-01"]);
  });

  it("ultimoMesCerrado sale del cierre más reciente, sin importar el año elegido", async () => {
    await seedStatement("2026-09-25");
    await seedStatement("2026-10-02");
    await seedStatement(null);
    const response = await request(app).get("/api/budgets/spending?year=2025");
    expect(response.body.ultimoMesCerrado).toBe("2026-09");
  });

  it("sin resúmenes ni consumos devuelve null y una lista vacía", async () => {
    const response = await request(app).get("/api/budgets/spending");
    expect(response.body).toEqual({ ultimoMesCerrado: null, gastos: [] });
  });

  it("para un mes da lo mismo que «Gasto por categoría» del Dashboard en ARS", async () => {
    await seedTransactions([
      { date: "2026-08-31", category: "Comida", amount: 11 },
      { date: "2026-09-01", category: "Comida", amount: 100 },
      { date: "2026-09-14", category: "Transporte", amount: 45.5 },
      { date: "2026-09-30", category: "Comida", amount: 25 },
      { date: "2026-09-30", category: "Sin categoría", amount: 7 },
      { date: "2026-09-18", category: "Ropa", amount: 60, cardLabel: "ICBC Mastercard" },
      { date: "2026-09-18", category: "Ropa", amount: 3, currency: "USD" },
      { date: "2026-10-01", category: "Comida", amount: 13 },
    ]);
    const spending = await request(app).get("/api/budgets/spending");
    const dashboard = await request(app)
      .get("/api/stats/by-category")
      .query({ currency: "ARS", from: "2026-09-01", to: "2026-09-30" });
    const fromBudgets = spending.body.gastos
      .filter((gasto: CategoryMonthStat) => gasto.month === "2026-09")
      .map(({ category, total }: CategoryMonthStat) => ({ category, total }))
      .sort(byCategory);
    const fromDashboard = dashboard.body
      .map(({ category, total }: CategoryTotal) => ({ category, total }))
      .sort(byCategory);
    expect(fromBudgets).toEqual(fromDashboard);
    expect(fromBudgets).toEqual([
      { category: "Comida", total: 125 },
      { category: "Ropa", total: 60 },
      { category: "Sin categoría", total: 7 },
      { category: "Transporte", total: 45.5 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test server/src/http/routes/budgets.test.ts`
Expected: FAIL — `GET /api/budgets/spending` responde 404 (no hay ruta).

- [ ] **Step 3: Write minimal implementation**

En `server/src/http/routes/budgets.ts`, reemplazar los imports por:

```ts
import { Router } from "express";
import { isValidObjectId, type FilterQuery } from "mongoose";
import { budgetInputSchema, budgetPatchSchema, type BudgetSpendingDTO, type CategoryMonthStat } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import {
  BudgetModel, InflationRateModel, StatementModel, TransactionModel, type TransactionDoc,
} from "../../db/models.js";
import { toBudgetDTO } from "../mappers.js";
import { parseYears, yearDateRanges } from "../yearFilter.js";
import { lastClosedMonth } from "../../stats/closedMonth.js";
```

Y agregar, después del `GET /`:

```ts
const spendingByMonthAndCategory = (match: FilterQuery<TransactionDoc>) =>
  TransactionModel.aggregate<CategoryMonthStat>([
    { $match: match },
    {
      $group: {
        _id: { month: { $dateToString: { format: "%Y-%m", date: "$date" } }, category: "$category" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, month: "$_id.month", category: "$_id.category", total: 1, count: 1 } },
    { $sort: { month: 1, total: -1 } },
  ]);

budgetsRouter.get("/spending", asyncHandler(async (req, res) => {
  const match: FilterQuery<TransactionDoc> = { type: "purchase", currency: "ARS" };
  const years = parseYears(req.query.year);
  if (years) match.$or = yearDateRanges(years);
  const [gastos, statements] = await Promise.all([
    spendingByMonthAndCategory(match),
    StatementModel.find({}, { closingDate: 1 }).lean(),
  ]);
  const body: BudgetSpendingDTO = {
    ultimoMesCerrado: lastClosedMonth(statements.map((statement) => statement.closingDate ?? null)),
    gastos,
  };
  res.json(body);
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test server/src/http/routes/budgets.test.ts`
Expected: PASS (25 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/budgets.ts server/src/http/routes/budgets.test.ts
git commit -m "feat(server): gasto en pesos por mes y categoría y último mes cerrado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Motor de topes — tope del mes, estados, totales y categorías

**Files:**
- Create: `client/src/budgets.ts`
- Test: `client/src/budgets.test.ts`

**Interfaces:**
- Consumes: `inflationFactor`, `latestInflationPeriod` (`client/src/inflationIndex.ts`); `categoryOptions` (`client/src/categoryOptions.ts`); `formatMoney`, `formatMonthLabel` (`client/src/format.ts`).
- Produces (los usan las tasks 5 a 8):
  - `type BudgetStatus = "ok" | "cerca" | "pasado"`, `type BudgetStatusColor = "success" | "warning" | "error"`
  - `CERCA_DESDE`, `BUDGET_STATUSES`, `BUDGET_STATUS_LABEL`, `BUDGET_STATUS_COLOR`
  - `interface BudgetLine { budget: BudgetDTO; category: string; tope: number; gastado: number; restante: number; ratio: number; estado: BudgetStatus }`
  - `interface BudgetTotals { tope: number; gastado: number; restante: number; ratio: number; estado: BudgetStatus; cumplidos: number; cerca: number; total: number }`
  - `interface UnbudgetedCategory { category: string; total: number }`
  - `budgetStatus(gastado, tope)`, `limitForMonth(budget, month, inflation)`, `currentLimit(budget, inflation)`, `budgetLines(budgets, gastos, month, inflation)`, `budgetTotals(lines)`, `unbudgetedCategories(budgets, gastos, month)`, `budgetCategoryOptions(categories, rules, budgets)`
  - `formatPesos(value): string`, `monthInText(month): string`, `budgetBalanceText(restante): string`, `budgetInflationNote(budget, month, latestIpc): string`

- [ ] **Step 1: Write the failing test**

`client/src/budgets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { BudgetDTO, CategoryMonthStat, InflationRateDTO } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import {
  budgetBalanceText, budgetCategoryOptions, budgetInflationNote, budgetLines, budgetStatus, budgetTotals, currentLimit,
  formatPesos, limitForMonth, monthInText, unbudgetedCategories,
} from "./budgets.js";

const budget = (category: string, topeArs: number, overrides: Partial<BudgetDTO> = {}): BudgetDTO => ({
  id: `id-${category}`, category, topeArs, ajustaInflacion: false, periodoBase: "2026-08", ...overrides,
});

const gasto = (month: string, category: string, total: number): CategoryMonthStat => ({ month, category, total, count: 1 });

const ipc = (pairs: [string, number][]): InflationRateDTO[] =>
  pairs.map(([periodo, variacionMensual]) => ({ periodo, variacionMensual }));

const INFLATION = ipc([["2026-07", 4], ["2026-08", 10], ["2026-09", 10]]);

describe("budgetStatus", () => {
  it("en rango por debajo del 80 %, cerca hasta el 100 % inclusive y pasado arriba", () => {
    expect(budgetStatus(79, 100)).toBe("ok");
    expect(budgetStatus(80, 100)).toBe("cerca");
    expect(budgetStatus(100, 100)).toBe("cerca");
    expect(budgetStatus(101, 100)).toBe("pasado");
  });

  it("sin gasto está en rango", () => {
    expect(budgetStatus(0, 100)).toBe("ok");
  });
});

describe("limitForMonth", () => {
  it("sin ajuste el tope es el mismo todos los meses", () => {
    const fijo = budget("Comida", 1000);
    expect(limitForMonth(fijo, "2026-01", INFLATION)).toBe(1000);
    expect(limitForMonth(fijo, "2026-12", INFLATION)).toBe(1000);
  });

  it("con ajuste sube con el IPC publicado después de periodoBase", () => {
    const ajustado = budget("Comida", 1000, { ajustaInflacion: true, periodoBase: "2026-07" });
    expect(limitForMonth(ajustado, "2026-07", INFLATION)).toBe(1000);
    expect(limitForMonth(ajustado, "2026-09", INFLATION)).toBeCloseTo(1210);
  });

  it("con ajuste se deflacta hacia atrás", () => {
    const ajustado = budget("Comida", 1210, { ajustaInflacion: true, periodoBase: "2026-09" });
    expect(limitForMonth(ajustado, "2026-07", INFLATION)).toBeCloseTo(1000);
  });

  it("después del último IPC se queda con el último factor publicado", () => {
    const ajustado = budget("Comida", 1000, { ajustaInflacion: true, periodoBase: "2026-08" });
    expect(limitForMonth(ajustado, "2026-12", INFLATION)).toBeCloseTo(1100);
  });
});

describe("currentLimit", () => {
  it("lleva el tope a pesos del último IPC y lo redondea", () => {
    const ajustado = budget("Comida", 1000.4, { ajustaInflacion: true, periodoBase: "2026-08" });
    expect(currentLimit(ajustado, INFLATION)).toBe(1100);
  });

  it("sin IPC cargado devuelve el tope redondeado", () => {
    expect(currentLimit(budget("Comida", 1234.6, { ajustaInflacion: true }), [])).toBe(1235);
  });

  it("sin ajuste devuelve el tope fijo", () => {
    expect(currentLimit(budget("Comida", 5000), INFLATION)).toBe(5000);
  });
});

describe("budgetLines", () => {
  const budgets = [budget("Ropa", 100), budget("Comida", 300), budget("Transporte", 100), budget("Salidas", 50)];
  const gastos = [
    gasto("2026-08", "Comida", 999),
    gasto("2026-09", "Comida", 330),
    gasto("2026-09", "Transporte", 85),
    gasto("2026-09", "Ropa", 20),
    gasto("2026-09", "Farmacia", 15),
  ];

  it("arma una línea por tope con lo gastado en el mes, lo más comprometido arriba", () => {
    const lines = budgetLines(budgets, gastos, "2026-09", []);
    expect(lines.map(({ category, gastado, estado }) => ({ category, gastado, estado }))).toEqual([
      { category: "Comida", gastado: 330, estado: "pasado" },
      { category: "Transporte", gastado: 85, estado: "cerca" },
      { category: "Ropa", gastado: 20, estado: "ok" },
      { category: "Salidas", gastado: 0, estado: "ok" },
    ]);
    expect(lines[0]).toMatchObject({ budget: budgets[1], tope: 300, restante: -30, ratio: 1.1 });
  });

  it("si la proporción empata ordena por categoría", () => {
    const lines = budgetLines([budget("Salidas", 50), budget("Libros", 50)], [], "2026-09", []);
    expect(lines.map((line) => line.category)).toEqual(["Libros", "Salidas"]);
  });

  it("usa el tope ajustado de ese mes", () => {
    const ajustado = budget("Comida", 1000, { ajustaInflacion: true, periodoBase: "2026-07" });
    const [line] = budgetLines([ajustado], [gasto("2026-09", "Comida", 1200)], "2026-09", INFLATION);
    expect(line.tope).toBeCloseTo(1210);
    expect(line.estado).toBe("cerca");
  });
});

describe("budgetTotals", () => {
  it("suma topes y gastos de las categorías con tope y cuenta los cumplidos", () => {
    const lines = budgetLines(
      [budget("Comida", 300), budget("Transporte", 100), budget("Ropa", 100)],
      [gasto("2026-09", "Comida", 330), gasto("2026-09", "Transporte", 85), gasto("2026-09", "Ropa", 20), gasto("2026-09", "Farmacia", 15)],
      "2026-09",
      [],
    );
    expect(budgetTotals(lines)).toEqual({
      tope: 500, gastado: 435, restante: 65, ratio: 0.87, estado: "cerca", cumplidos: 2, cerca: 1, total: 3,
    });
  });

  it("sin líneas devuelve null", () => {
    expect(budgetTotals([])).toBeNull();
  });
});

describe("unbudgetedCategories", () => {
  it("lista las categorías con gasto en el mes y sin tope, de mayor a menor, incluida «Sin categoría»", () => {
    const gastos = [
      gasto("2026-09", "Comida", 330),
      gasto("2026-09", "Farmacia", 15),
      gasto("2026-09", "Sin categoría", 40),
      gasto("2026-09", "Regalos", 0),
      gasto("2026-08", "Libros", 99),
    ];
    expect(unbudgetedCategories([budget("Comida", 300)], gastos, "2026-09")).toEqual([
      { category: "Sin categoría", total: 40 },
      { category: "Farmacia", total: 15 },
    ]);
  });
});

describe("budgetCategoryOptions", () => {
  it("ofrece las categorías de movimientos y reglas que todavía no tienen tope, sin «Sin categoría»", () => {
    const options = budgetCategoryOptions(
      ["Comida", "Sin categoría", "Farmacia"],
      [{ category: "Viajes" }, { category: "Comida" }],
      [budget("Comida", 300)],
    );
    expect(options).toEqual(["Farmacia", "Viajes"]);
  });
});

describe("textos", () => {
  it("formatPesos redondea a pesos enteros y no muestra -0", () => {
    expect(formatPesos(1500.6)).toBe(formatMoney(1501, "ARS"));
    expect(formatPesos(-0.2)).toBe(formatMoney(0, "ARS"));
  });

  it("monthInText deja el mes en minúscula para usarlo en una oración", () => {
    expect(monthInText("2026-09")).toBe("septiembre de 2026");
  });

  it("budgetBalanceText dice cuánto queda o por cuánto te pasaste", () => {
    expect(budgetBalanceText(65000)).toBe(`Te quedan ${formatMoney(65000, "ARS")}`);
    expect(budgetBalanceText(0)).toBe(`Te quedan ${formatMoney(0, "ARS")}`);
    expect(budgetBalanceText(-30000)).toBe(`Te pasaste por ${formatMoney(30000, "ARS")}`);
  });

  it("budgetInflationNote aclara el ajuste y hasta qué IPC llega", () => {
    const ajustado = budget("Comida", 1000, { ajustaInflacion: true });
    expect(budgetInflationNote(budget("Comida", 1000), "2026-09", "2026-08")).toBe("");
    expect(budgetInflationNote(ajustado, "2026-08", "2026-08")).toBe(" · Ajustado por IPC");
    expect(budgetInflationNote(ajustado, "2026-09", "2026-08")).toBe(" · Ajustado por IPC (IPC hasta agosto de 2026)");
    expect(budgetInflationNote(ajustado, "2026-09", null)).toBe(" · Ajustado por IPC (sin IPC cargado)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/budgets.test.ts`
Expected: FAIL — `Failed to load url ./budgets.js`.

- [ ] **Step 3: Write minimal implementation**

`client/src/budgets.ts`:

```ts
import type { BudgetDTO, CategoryMonthStat, CategoryRuleDTO, InflationRateDTO } from "@ledgerly/shared";
import { categoryOptions } from "./categoryOptions.js";
import { formatMoney, formatMonthLabel } from "./format.js";
import { inflationFactor, latestInflationPeriod } from "./inflationIndex.js";

export type BudgetStatus = "ok" | "cerca" | "pasado";
export type BudgetStatusColor = "success" | "warning" | "error";

export const CERCA_DESDE = 0.8;
export const BUDGET_STATUSES: BudgetStatus[] = ["ok", "cerca", "pasado"];
export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = { ok: "En rango", cerca: "Cerca", pasado: "Pasado" };
export const BUDGET_STATUS_COLOR: Record<BudgetStatus, BudgetStatusColor> = { ok: "success", cerca: "warning", pasado: "error" };

export interface BudgetLine {
  budget: BudgetDTO;
  category: string;
  tope: number;
  gastado: number;
  restante: number;
  ratio: number;
  estado: BudgetStatus;
}

export interface BudgetTotals {
  tope: number;
  gastado: number;
  restante: number;
  ratio: number;
  estado: BudgetStatus;
  cumplidos: number;
  cerca: number;
  total: number;
}

export interface UnbudgetedCategory {
  category: string;
  total: number;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const spendingIn = (gastos: CategoryMonthStat[], month: string): Map<string, number> =>
  new Map(gastos.filter((gasto) => gasto.month === month).map(({ category, total }) => [category, total]));

const byRatioThenCategory = (a: BudgetLine, b: BudgetLine): number =>
  b.ratio - a.ratio || a.category.localeCompare(b.category, "es");

export function formatPesos(value: number): string {
  return formatMoney(Math.round(value) || 0, "ARS");
}

export function monthInText(month: string): string {
  return formatMonthLabel(month).toLowerCase();
}

export function budgetStatus(gastado: number, tope: number): BudgetStatus {
  const ratio = gastado / tope;
  if (ratio < CERCA_DESDE) return "ok";
  if (ratio <= 1) return "cerca";
  return "pasado";
}

export function limitForMonth(budget: BudgetDTO, month: string, inflation: InflationRateDTO[]): number {
  if (!budget.ajustaInflacion) return budget.topeArs;
  return budget.topeArs * inflationFactor(inflation, budget.periodoBase, month);
}

export function currentLimit(budget: BudgetDTO, inflation: InflationRateDTO[]): number {
  const pesosDeHoy = latestInflationPeriod(inflation) ?? budget.periodoBase;
  return Math.round(limitForMonth(budget, pesosDeHoy, inflation));
}

export function budgetLines(
  budgets: BudgetDTO[],
  gastos: CategoryMonthStat[],
  month: string,
  inflation: InflationRateDTO[],
): BudgetLine[] {
  const spent = spendingIn(gastos, month);
  return budgets
    .map((budget) => {
      const tope = limitForMonth(budget, month, inflation);
      const gastado = spent.get(budget.category) ?? 0;
      return {
        budget,
        category: budget.category,
        tope,
        gastado,
        restante: tope - gastado,
        ratio: gastado / tope,
        estado: budgetStatus(gastado, tope),
      };
    })
    .sort(byRatioThenCategory);
}

export function budgetTotals(lines: BudgetLine[]): BudgetTotals | null {
  if (lines.length === 0) return null;
  const tope = sum(lines.map((line) => line.tope));
  const gastado = sum(lines.map((line) => line.gastado));
  return {
    tope,
    gastado,
    restante: tope - gastado,
    ratio: gastado / tope,
    estado: budgetStatus(gastado, tope),
    cumplidos: lines.filter((line) => line.estado !== "pasado").length,
    cerca: lines.filter((line) => line.estado === "cerca").length,
    total: lines.length,
  };
}

export function unbudgetedCategories(budgets: BudgetDTO[], gastos: CategoryMonthStat[], month: string): UnbudgetedCategory[] {
  const budgeted = new Set(budgets.map((budget) => budget.category));
  return gastos
    .filter((gasto) => gasto.month === month && gasto.total > 0 && !budgeted.has(gasto.category))
    .map(({ category, total }) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export function budgetCategoryOptions(
  categories: string[],
  rules: Pick<CategoryRuleDTO, "category">[],
  budgets: BudgetDTO[],
): string[] {
  const budgeted = new Set(budgets.map((budget) => budget.category));
  return categoryOptions(categories, rules).filter((category) => !budgeted.has(category));
}

export function budgetBalanceText(restante: number): string {
  return restante < 0 ? `Te pasaste por ${formatPesos(-restante)}` : `Te quedan ${formatPesos(restante)}`;
}

export function budgetInflationNote(budget: BudgetDTO, month: string, latestIpc: string | null): string {
  if (!budget.ajustaInflacion) return "";
  if (latestIpc === null) return " · Ajustado por IPC (sin IPC cargado)";
  if (month > latestIpc) return ` · Ajustado por IPC (IPC hasta ${monthInText(latestIpc)})`;
  return " · Ajustado por IPC";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/budgets.test.ts`
Expected: PASS (20 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/budgets.ts client/src/budgets.test.ts
git commit -m "feat(client): tope del mes, estados y totales de los presupuestos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Motor de topes — meses, histórico y vista de la página

**Files:**
- Modify: `client/src/budgets.ts`
- Modify: `client/src/budgets.test.ts`

**Interfaces:**
- Consumes: lo de la Task 4.
- Produces:
  - `interface BudgetMonthSummary { month: string; ok: string[]; cerca: string[]; pasado: string[] }`
  - `interface BudgetsViewInput { budgets: BudgetDTO[]; spending: BudgetSpendingDTO; inflation: InflationRateDTO[]; selectedMonth: string | null; today: Date }`
  - `interface BudgetsView { months: string[]; month: string; partial: boolean; lines: BudgetLine[]; totals: BudgetTotals | null; unbudgeted: UnbudgetedCategory[]; history: BudgetMonthSummary[]; latestIpc: string | null; hasSpending: boolean }`
  - `selectableMonths(gastos, selected)`, `defaultBudgetMonth(months, ultimoMesCerrado, today)`, `isPartialMonth(month, ultimoMesCerrado)`, `closedMonths(gastos, ultimoMesCerrado)`, `budgetHistory(budgets, gastos, months, inflation)`, `budgetsView(input)`

- [ ] **Step 1: Write the failing test**

En `client/src/budgets.test.ts`, reemplazar los imports por:

```ts
import { describe, it, expect } from "vitest";
import type { BudgetDTO, BudgetSpendingDTO, CategoryMonthStat, InflationRateDTO } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import {
  budgetBalanceText, budgetCategoryOptions, budgetHistory, budgetInflationNote, budgetLines, budgetStatus, budgetTotals,
  budgetsView, closedMonths, currentLimit, defaultBudgetMonth, formatPesos, isPartialMonth, limitForMonth, monthInText,
  selectableMonths, unbudgetedCategories,
} from "./budgets.js";
```

Y agregar al final:

```ts
describe("meses", () => {
  const gastos = [
    gasto("2026-08", "Comida", 1),
    gasto("2026-09", "Comida", 1),
    gasto("2026-09", "Ropa", 1),
    gasto("2026-10", "Comida", 1),
  ];
  const today = new Date(2026, 9, 3);

  it("selectableMonths lista los meses con consumos y suma el elegido", () => {
    expect(selectableMonths(gastos, null)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(selectableMonths(gastos, "2026-12")).toEqual(["2026-08", "2026-09", "2026-10", "2026-12"]);
    expect(selectableMonths(gastos, "2026-09")).toEqual(["2026-08", "2026-09", "2026-10"]);
  });

  it("defaultBudgetMonth prefiere el último mes cerrado y cae al último o al actual", () => {
    expect(defaultBudgetMonth(["2026-08", "2026-09", "2026-10"], "2026-09", today)).toBe("2026-09");
    expect(defaultBudgetMonth(["2026-08", "2026-10"], "2026-09", today)).toBe("2026-08");
    expect(defaultBudgetMonth(["2026-10", "2026-11"], "2026-09", today)).toBe("2026-11");
    expect(defaultBudgetMonth(["2026-08", "2026-10"], null, today)).toBe("2026-10");
    expect(defaultBudgetMonth([], "2026-09", today)).toBe("2026-10");
  });

  it("isPartialMonth marca los meses posteriores al último cerrado", () => {
    expect(isPartialMonth("2026-10", "2026-09")).toBe(true);
    expect(isPartialMonth("2026-09", "2026-09")).toBe(false);
    expect(isPartialMonth("2026-10", null)).toBe(false);
  });

  it("closedMonths deja los meses con consumos hasta el último cerrado", () => {
    expect(closedMonths(gastos, "2026-09")).toEqual(["2026-08", "2026-09"]);
    expect(closedMonths(gastos, null)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
});

describe("budgetHistory", () => {
  it("agrupa por mes las categorías en cada estado con los topes actuales", () => {
    const budgets = [budget("Comida", 300), budget("Transporte", 100), budget("Ropa", 100)];
    const gastos = [
      gasto("2026-08", "Comida", 250),
      gasto("2026-08", "Ropa", 120),
      gasto("2026-09", "Comida", 330),
      gasto("2026-09", "Transporte", 85),
    ];
    expect(budgetHistory(budgets, gastos, ["2026-08", "2026-09"], [])).toEqual([
      { month: "2026-08", ok: ["Transporte"], cerca: ["Comida"], pasado: ["Ropa"] },
      { month: "2026-09", ok: ["Ropa"], cerca: ["Transporte"], pasado: ["Comida"] },
    ]);
  });
});

describe("budgetsView", () => {
  const spending: BudgetSpendingDTO = {
    ultimoMesCerrado: "2026-09",
    gastos: [
      gasto("2026-08", "Comida", 250),
      gasto("2026-09", "Comida", 330),
      gasto("2026-09", "Farmacia", 15),
      gasto("2026-10", "Comida", 40),
    ],
  };
  const budgets = [budget("Comida", 300)];
  const today = new Date(2026, 9, 3);

  it("sin Mes en la URL muestra el último mes cerrado", () => {
    const view = budgetsView({ budgets, spending, inflation: [], selectedMonth: null, today });
    expect(view).toMatchObject({
      month: "2026-09", months: ["2026-08", "2026-09", "2026-10"], partial: false, hasSpending: true, latestIpc: null,
    });
    expect(view.lines.map((line) => line.estado)).toEqual(["pasado"]);
    expect(view.totals).toMatchObject({ gastado: 330, tope: 300 });
    expect(view.unbudgeted).toEqual([{ category: "Farmacia", total: 15 }]);
  });

  it("un mes posterior al cerrado es parcial y el histórico lo deja afuera", () => {
    const view = budgetsView({ budgets, spending, inflation: [], selectedMonth: "2026-10", today });
    expect(view).toMatchObject({ month: "2026-10", partial: true });
    expect(view.history.map((summary) => summary.month)).toEqual(["2026-08", "2026-09"]);
  });

  it("un Mes sin consumos se respeta y se suma a los elegibles", () => {
    const view = budgetsView({ budgets, spending, inflation: [], selectedMonth: "2026-12", today });
    expect(view).toMatchObject({ month: "2026-12", hasSpending: false, months: ["2026-08", "2026-09", "2026-10", "2026-12"] });
    expect(view.lines[0]).toMatchObject({ gastado: 0, estado: "ok" });
  });

  it("sin consumos cae en el mes calendario actual", () => {
    const empty: BudgetSpendingDTO = { ultimoMesCerrado: null, gastos: [] };
    const view = budgetsView({ budgets: [], spending: empty, inflation: [], selectedMonth: null, today });
    expect(view).toMatchObject({ month: "2026-10", months: ["2026-10"], totals: null, history: [], hasSpending: false });
  });

  it("informa el último IPC publicado", () => {
    expect(budgetsView({ budgets, spending, inflation: INFLATION, selectedMonth: null, today }).latestIpc).toBe("2026-09");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/budgets.test.ts`
Expected: FAIL — `selectableMonths is not a function` (y los demás exports nuevos).

- [ ] **Step 3: Write minimal implementation**

En `client/src/budgets.ts`, cambiar el import de tipos por:

```ts
import type { BudgetDTO, BudgetSpendingDTO, CategoryMonthStat, CategoryRuleDTO, InflationRateDTO } from "@ledgerly/shared";
```

Agregar, después de `UnbudgetedCategory`:

```ts
export interface BudgetMonthSummary {
  month: string;
  ok: string[];
  cerca: string[];
  pasado: string[];
}

export interface BudgetsViewInput {
  budgets: BudgetDTO[];
  spending: BudgetSpendingDTO;
  inflation: InflationRateDTO[];
  selectedMonth: string | null;
  today: Date;
}

export interface BudgetsView {
  months: string[];
  month: string;
  partial: boolean;
  lines: BudgetLine[];
  totals: BudgetTotals | null;
  unbudgeted: UnbudgetedCategory[];
  history: BudgetMonthSummary[];
  latestIpc: string | null;
  hasSpending: boolean;
}
```

Agregar, junto a los helpers privados (después de `byRatioThenCategory`):

```ts
const pad2 = (value: number): string => String(value).padStart(2, "0");

const calendarMonth = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();

const categoriesIn = (lines: BudgetLine[], estado: BudgetStatus): string[] =>
  lines.filter((line) => line.estado === estado).map((line) => line.category);
```

Y al final del archivo:

```ts
export function isPartialMonth(month: string, ultimoMesCerrado: string | null): boolean {
  return ultimoMesCerrado !== null && month > ultimoMesCerrado;
}

export function selectableMonths(gastos: CategoryMonthStat[], selected: string | null): string[] {
  const months = gastos.map((gasto) => gasto.month);
  return uniqueSorted(selected === null ? months : [...months, selected]);
}

export function defaultBudgetMonth(months: string[], ultimoMesCerrado: string | null, today: Date): string {
  const closed = months.filter((month) => !isPartialMonth(month, ultimoMesCerrado));
  return closed.at(-1) ?? months.at(-1) ?? calendarMonth(today);
}

export function closedMonths(gastos: CategoryMonthStat[], ultimoMesCerrado: string | null): string[] {
  return selectableMonths(gastos, null).filter((month) => !isPartialMonth(month, ultimoMesCerrado));
}

export function budgetHistory(
  budgets: BudgetDTO[],
  gastos: CategoryMonthStat[],
  months: string[],
  inflation: InflationRateDTO[],
): BudgetMonthSummary[] {
  return months.map((month) => {
    const lines = budgetLines(budgets, gastos, month, inflation);
    return { month, ok: categoriesIn(lines, "ok"), cerca: categoriesIn(lines, "cerca"), pasado: categoriesIn(lines, "pasado") };
  });
}

export function budgetsView({ budgets, spending, inflation, selectedMonth, today }: BudgetsViewInput): BudgetsView {
  const { gastos, ultimoMesCerrado } = spending;
  const month = selectedMonth ?? defaultBudgetMonth(selectableMonths(gastos, null), ultimoMesCerrado, today);
  const lines = budgetLines(budgets, gastos, month, inflation);
  return {
    months: selectableMonths(gastos, month),
    month,
    partial: isPartialMonth(month, ultimoMesCerrado),
    lines,
    totals: budgetTotals(lines),
    unbudgeted: unbudgetedCategories(budgets, gastos, month),
    history: budgetHistory(budgets, gastos, closedMonths(gastos, ultimoMesCerrado), inflation),
    latestIpc: latestInflationPeriod(inflation),
    hasSpending: gastos.some((gasto) => gasto.month === month),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/budgets.test.ts`
Expected: PASS (30 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/budgets.ts client/src/budgets.test.ts
git commit -m "feat(client): meses elegibles, mes por defecto e histórico de los presupuestos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Gráfico de cumplimiento mes a mes

**Files:**
- Create: `client/src/components/charts/BudgetComplianceChart.tsx`
- Test: `client/src/components/charts/BudgetComplianceChart.test.tsx`

**Interfaces:**
- Consumes: `BUDGET_STATUSES`, `BUDGET_STATUS_COLOR`, `BUDGET_STATUS_LABEL`, `BudgetMonthSummary`, `BudgetStatus` (Tasks 4 y 5); `ChartTooltip`, `ChartLegend`, `nivoTheme`, `useChartLayout`; `formatMonthLabel`.
- Produces: `BudgetComplianceChart({ history })`, `BudgetComplianceTooltip({ id, color, data })`, `type ComplianceRow`, `countTicks(max): number[]`.

Decisiones de dataviz: los tres estados son **status**, no categóricos: usan `success`/`warning`/`error` del tema, siempre con su nombre (leyenda y tooltip), nunca solo color. Barras apiladas con 1 px de borde en el color de la superficie (2 px de separación entre segmentos), radio chico y grilla solo en enteros. Leyenda HTML debajo en compu y mobile (3 series).

- [ ] **Step 1: Write the failing test**

`client/src/components/charts/BudgetComplianceChart.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../../testing/viewport.js";
import { probeOf } from "../../testing/nivoProbe.js";
import type { BudgetMonthSummary } from "../../budgets.js";
import { BudgetComplianceChart, BudgetComplianceTooltip, countTicks } from "./BudgetComplianceChart.js";

vi.mock("@nivo/bar", async () => ({ ResponsiveBar: (await import("../../testing/nivoProbe.js")).NivoProbe }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const periodo = (index: number) => `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const history = (months: number): BudgetMonthSummary[] =>
  Array.from({ length: months }, (_unused, index) => ({
    month: periodo(index),
    ok: ["Ropa"],
    cerca: ["Transporte"],
    pasado: index % 2 === 0 ? ["Comida"] : [],
  }));

const chart = () => probeOf(screen.getByTestId("nivo-chart"));

const legendList = () => screen.getByRole("list", { name: "referencias" });

const cssColor = (color: string) => {
  const element = document.createElement("span");
  element.style.backgroundColor = color;
  return element.style.backgroundColor;
};

describe("BudgetComplianceChart", () => {
  it("sin historial dice Sin datos", () => {
    emulateDesktop();
    renderWithProviders(<BudgetComplianceChart history={[]} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByTestId("nivo-chart")).not.toBeInTheDocument();
  });

  it("usa un tooltip propio", () => {
    emulateDesktop();
    renderWithProviders(<BudgetComplianceChart history={history(3)} />);
    expect(chart().customTooltip).toBe("yes");
  });

  it("la leyenda nombra los tres estados con los mismos colores que las barras", () => {
    emulateDesktop();
    renderWithProviders(<BudgetComplianceChart history={history(3)} />);
    const items = within(legendList()).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["En rango", "Cerca", "Pasado"]);
    const swatches = within(legendList()).getAllByTestId("legend-swatch").map((swatch) => swatch.style.backgroundColor);
    expect((chart().colors ?? []).map((color) => cssColor(String(color)))).toEqual(swatches);
  });

  it("en mobile muestra a lo sumo 6 meses en el eje y siempre el último", () => {
    emulateMobile();
    renderWithProviders(<BudgetComplianceChart history={history(14)} />);
    const { tickValues } = chart();
    expect(tickValues!.length).toBeLessThanOrEqual(6);
    expect(tickValues!.at(-1)).toBe("2026-02");
    expect(legendList()).toBeInTheDocument();
  });

  it("en compu deja que nivo elija los meses", () => {
    emulateDesktop();
    renderWithProviders(<BudgetComplianceChart history={history(14)} />);
    expect(chart()).toMatchObject({ tickValues: null, margin: { top: 16, right: 24, bottom: 64, left: 40 } });
  });
});

describe("BudgetComplianceTooltip", () => {
  it("titula con el mes y lista las categorías de ese estado", () => {
    renderWithProviders(
      <BudgetComplianceTooltip
        id="pasado"
        color="#dc2626"
        data={{ month: "2026-09", ok: 1, cerca: 0, pasado: 2, okLista: "Ropa", cercaLista: "", pasadoLista: "Comida, Salidas" }}
      />,
    );
    expect(screen.getByText("Septiembre de 2026")).toBeInTheDocument();
    expect(screen.getByText("Pasado:")).toBeInTheDocument();
    expect(screen.getByText("Comida, Salidas")).toBeInTheDocument();
  });
});

describe("countTicks", () => {
  it("marca solo enteros, a lo sumo seis", () => {
    expect(countTicks(0)).toEqual([0]);
    expect(countTicks(3)).toEqual([0, 1, 2, 3]);
    expect(countTicks(5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(countTicks(12)).toEqual([0, 3, 6, 9, 12]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/charts/BudgetComplianceChart.test.tsx`
Expected: FAIL — `Failed to load url ./BudgetComplianceChart.js`.

- [ ] **Step 3: Write minimal implementation**

`client/src/components/charts/BudgetComplianceChart.tsx`:

```tsx
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import {
  BUDGET_STATUSES, BUDGET_STATUS_COLOR, BUDGET_STATUS_LABEL, type BudgetMonthSummary, type BudgetStatus,
} from "../../budgets.js";
import { formatMonthLabel } from "../../format.js";
import { nivoTheme } from "./nivoTheme.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { ChartTooltip, type ChartTooltipRow } from "./ChartTooltip.js";
import { useChartLayout } from "./useChartLayout.js";

type ListKey = `${BudgetStatus}Lista`;

export type ComplianceRow = Record<"month" | ListKey, string> & Record<BudgetStatus, number>;

interface BudgetComplianceChartProps {
  history: BudgetMonthSummary[];
}

interface BudgetComplianceTooltipProps {
  id: string | number;
  color: string;
  data: ComplianceRow;
}

const MAX_COUNT_STEPS = 5;

const LIST_KEY: Record<BudgetStatus, ListKey> = { ok: "okLista", cerca: "cercaLista", pasado: "pasadoLista" };

const isBudgetStatus = (value: string | number): value is BudgetStatus =>
  BUDGET_STATUSES.some((status) => status === value);

const complianceRow = ({ month, ok, cerca, pasado }: BudgetMonthSummary): ComplianceRow => ({
  month,
  ok: ok.length,
  cerca: cerca.length,
  pasado: pasado.length,
  okLista: ok.join(", "),
  cercaLista: cerca.join(", "),
  pasadoLista: pasado.join(", "),
});

export const countTicks = (max: number): number[] => {
  const step = Math.max(1, Math.ceil(max / MAX_COUNT_STEPS));
  return Array.from({ length: Math.floor(max / step) + 1 }, (_unused, index) => index * step);
};

export const BudgetComplianceTooltip = ({ id, color, data }: BudgetComplianceTooltipProps) => {
  if (!isBudgetStatus(id)) return null;
  const rows: ChartTooltipRow[] = [{ id, color, label: `${BUDGET_STATUS_LABEL[id]}:`, value: data[LIST_KEY[id]] }];
  return <ChartTooltip title={formatMonthLabel(data.month)} rows={rows} />;
};

export const BudgetComplianceChart = ({ history }: BudgetComplianceChartProps) => {
  const theme = useTheme();
  const { seriesMargin, bottomTicks } = useChartLayout();

  if (history.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = history.map(complianceRow);
  const colors = BUDGET_STATUSES.map((status) => theme.palette[BUDGET_STATUS_COLOR[status]].main);
  const ticks = countTicks(Math.max(...rows.map((row) => row.ok + row.cerca + row.pasado)));
  const legendItems: ChartLegendItem[] = BUDGET_STATUSES.map((status, slot) => ({
    id: status,
    label: BUDGET_STATUS_LABEL[status],
    color: colors[slot],
  }));

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsiveBar
          data={rows}
          theme={nivoTheme(theme)}
          keys={BUDGET_STATUSES}
          indexBy="month"
          colors={colors}
          margin={seriesMargin({ top: 16, right: 24, bottom: 64, left: 40 })}
          padding={0.35}
          borderRadius={2}
          borderWidth={1}
          borderColor={theme.palette.background.paper}
          enableLabel={false}
          enableGridX={false}
          gridYValues={ticks}
          axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(rows.map((row) => row.month)) }}
          axisLeft={{ tickSize: 0, tickPadding: 8, tickValues: ticks }}
          tooltip={BudgetComplianceTooltip}
          motionConfig="gentle"
        />
      </Box>
      <ChartLegend items={legendItems} />
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/charts/BudgetComplianceChart.test.tsx`
Expected: PASS (7 tests). Correr también `bun run typecheck` para validar el tipo de `tooltip` y de `ComplianceRow` contra `BarDatum`.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/charts/BudgetComplianceChart.tsx client/src/components/charts/BudgetComplianceChart.test.tsx
git commit -m "feat(client): gráfico de cumplimiento de topes mes a mes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Editor de topes

**Files:**
- Create: `client/src/components/useBudgetForm.ts`
- Create: `client/src/components/BudgetEditor.tsx`
- Test: `client/src/components/BudgetEditor.test.tsx`

**Interfaces:**
- Consumes: `ResponsiveSheet` (base), `parseMoneyInput`/`formatMoneyInput` (base), `MIN_TAP_SIZE`, `monthInText` (Task 4), `formatMoney`.
- Produces:
  - `interface BudgetEditorTarget { budget: BudgetDTO | null; category: string | null }` (en `useBudgetForm.ts`)
  - `useBudgetForm(target, initialTope): BudgetForm`
  - `BudgetEditor({ open, target, editorKey, categoryOptions, initialTope, latestIpc, onClose, onSave, onDelete })`

- [ ] **Step 1: Write the failing test**

`client/src/components/BudgetEditor.test.tsx`:

```tsx
import { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BudgetDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { cssFor } from "../testing/cssFor.js";
import { BudgetEditor } from "./BudgetEditor.js";
import type { BudgetEditorTarget } from "./useBudgetForm.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const COMIDA: BudgetDTO = { id: "b1", category: "Comida", topeArs: 300000, ajustaInflacion: true, periodoBase: "2026-08" };
const NEW: BudgetEditorTarget = { budget: null, category: null };
const noop = () => undefined;

interface EditorSetup {
  target?: BudgetEditorTarget;
  initialTope?: number | null;
  latestIpc?: string | null;
  categoryOptions?: string[];
}

const renderEditor = ({ target = NEW, initialTope = null, latestIpc = "2026-08", categoryOptions = ["Farmacia", "Ropa"] }: EditorSetup = {}) => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onDelete = vi.fn();
  renderWithProviders(
    <BudgetEditor
      open
      target={target}
      editorKey={1}
      categoryOptions={categoryOptions}
      initialTope={initialTope}
      latestIpc={latestIpc}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
    />,
  );
  return { onClose, onSave, onDelete };
};

const amountField = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: "Tope mensual (ARS)" });

const Reopening = () => {
  const [editorKey, setEditorKey] = useState(1);
  const reopen = () => setEditorKey((key) => key + 1);
  return (
    <>
      <button type="button" onClick={reopen}>reabrir</button>
      <BudgetEditor
        open
        target={NEW}
        editorKey={editorKey}
        categoryOptions={["Ropa"]}
        initialTope={null}
        latestIpc={null}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
      />
    </>
  );
};

describe("BudgetEditor", () => {
  it("un tope nuevo elige la categoría, lee el monto en formato argentino y guarda", async () => {
    emulateDesktop();
    const { onSave, onClose } = renderEditor();
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Categoría" }));
    await userEvent.click(await screen.findByRole("option", { name: "Ropa" }));
    await userEvent.type(amountField(dialog), "1.500,50");
    expect(within(dialog).getByText(/^= \$\s1\.500,50 por mes$/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ category: "Ropa", topeArs: 1500.5, ajustaInflacion: false });
    expect(onClose).toHaveBeenCalled();
  });

  it("con un monto que no es mayor a cero no deja guardar y marca el campo", async () => {
    emulateDesktop();
    renderEditor({ target: { budget: null, category: "Farmacia" } });
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    const save = within(dialog).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    await userEvent.type(amountField(dialog), "0");
    expect(save).toBeDisabled();
    expect(within(dialog).getByText("Ingresá un monto mayor a cero")).toBeInTheDocument();
    expect(amountField(dialog)).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(amountField(dialog));
    await userEvent.type(amountField(dialog), "abc");
    expect(save).toBeDisabled();
  });

  it("sin categoría elegida no deja guardar aunque haya monto", async () => {
    emulateDesktop();
    renderEditor();
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    await userEvent.type(amountField(dialog), "1000");
    expect(within(dialog).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("al editar fija la categoría, precarga el monto y ofrece Borrar", async () => {
    emulateDesktop();
    const { onDelete } = renderEditor({ target: { budget: COMIDA, category: "Comida" }, initialTope: 312000 });
    const dialog = screen.getByRole("dialog", { name: "Tope de Comida" });
    const category = within(dialog).getByRole("textbox", { name: "Categoría" });
    expect(category).toBeDisabled();
    expect(category).toHaveValue("Comida");
    expect(amountField(dialog)).toHaveValue("312.000");
    expect(within(dialog).getByLabelText("Ajustar por inflación")).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(COMIDA);
  });

  it("desde «Poner tope» la categoría viene fija y no hay Borrar", async () => {
    emulateDesktop();
    const { onSave } = renderEditor({ target: { budget: null, category: "Farmacia" } });
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    expect(within(dialog).getByRole("textbox", { name: "Categoría" })).toHaveValue("Farmacia");
    expect(within(dialog).queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
    await userEvent.type(amountField(dialog), "50.000");
    await userEvent.click(within(dialog).getByLabelText("Ajustar por inflación"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ category: "Farmacia", topeArs: 50000, ajustaInflacion: true });
  });

  it("Cancelar cierra sin guardar", async () => {
    emulateDesktop();
    const { onSave, onClose } = renderEditor();
    await userEvent.click(within(screen.getByRole("dialog", { name: "Nuevo tope" })).getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("explica en qué pesos queda un tope ajustado", () => {
    emulateDesktop();
    renderEditor();
    expect(screen.getByText(/^Queda en pesos de agosto de 2026: sube cada mes con el IPC publicado/)).toBeInTheDocument();
  });

  it("avisa cuando todavía no hay IPC cargado", () => {
    emulateDesktop();
    renderEditor({ latestIpc: null });
    expect(screen.getByText(/^Todavía no hay IPC cargado/)).toBeInTheDocument();
  });

  it("avisa cuando todas las categorías ya tienen tope", () => {
    emulateDesktop();
    renderEditor({ categoryOptions: [] });
    expect(screen.getByText("Todas las categorías ya tienen tope.")).toBeInTheDocument();
  });

  it("cada apertura nueva arranca vacía", async () => {
    emulateDesktop();
    renderWithProviders(<Reopening />);
    await userEvent.type(amountField(screen.getByRole("dialog", { name: "Nuevo tope" })), "1000");
    fireEvent.click(screen.getByRole("button", { name: "reabrir", hidden: true }));
    expect(amountField(screen.getByRole("dialog", { name: "Nuevo tope" }))).toHaveValue("");
  });

  it("en mobile es una hoja desde abajo con acciones de 44 px", () => {
    emulateMobile();
    renderEditor();
    const sheet = screen.getByRole("dialog", { name: "Nuevo tope" });
    expect(document.querySelector(".MuiDrawer-root")).toBeInTheDocument();
    expect(amountField(sheet)).toHaveAttribute("inputmode", "decimal");
    expect(cssFor(within(sheet).getByRole("button", { name: "Guardar" }))).toContain("min-height:44px");
    expect(cssFor(within(sheet).getByRole("button", { name: "Cancelar" }))).toContain("min-height:44px");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/components/BudgetEditor.test.tsx`
Expected: FAIL — `Failed to load url ./BudgetEditor.js`.

- [ ] **Step 3: Write minimal implementation**

`client/src/components/useBudgetForm.ts`:

```ts
import { useState } from "react";
import type { BudgetDTO, BudgetInput } from "@ledgerly/shared";
import { formatMoneyInput, parseMoneyInput } from "../moneyInput.js";

export interface BudgetEditorTarget {
  budget: BudgetDTO | null;
  category: string | null;
}

export interface BudgetForm {
  category: string;
  topeText: string;
  ajustaInflacion: boolean;
  topeArs: number | null;
  fixedCategory: boolean;
  draft: BudgetInput | null;
  setCategory: (category: string) => void;
  setTopeText: (text: string) => void;
  setAjustaInflacion: (ajustaInflacion: boolean) => void;
}

const positiveAmount = (text: string): number | null => {
  const value = parseMoneyInput(text);
  return value !== null && value > 0 ? value : null;
};

export const useBudgetForm = (target: BudgetEditorTarget | null, initialTope: number | null): BudgetForm => {
  const fixed = target?.budget?.category ?? target?.category ?? null;
  const [category, setCategory] = useState(fixed ?? "");
  const [topeText, setTopeText] = useState(initialTope === null ? "" : formatMoneyInput(initialTope));
  const [ajustaInflacion, setAjustaInflacion] = useState(target?.budget?.ajustaInflacion ?? false);
  const topeArs = positiveAmount(topeText);
  const trimmed = category.trim();
  const draft = trimmed !== "" && topeArs !== null ? { category: trimmed, topeArs, ajustaInflacion } : null;

  return {
    category,
    topeText,
    ajustaInflacion,
    topeArs,
    fixedCategory: fixed !== null,
    draft,
    setCategory,
    setTopeText,
    setAjustaInflacion,
  };
};
```

`client/src/components/BudgetEditor.tsx`:

```tsx
import type { ChangeEvent } from "react";
import { Box, Button, FormControlLabel, FormHelperText, MenuItem, Switch, TextField } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { BudgetDTO, BudgetInput } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { monthInText } from "../budgets.js";
import { ResponsiveSheet } from "./ResponsiveSheet.js";
import { MIN_TAP_SIZE } from "./tapTarget.js";
import { useBudgetForm, type BudgetEditorTarget } from "./useBudgetForm.js";

interface BudgetEditorProps {
  open: boolean;
  target: BudgetEditorTarget | null;
  editorKey: number;
  categoryOptions: string[];
  initialTope: number | null;
  latestIpc: string | null;
  onClose: () => void;
  onSave: (draft: BudgetInput) => void;
  onDelete: (budget: BudgetDTO) => void;
}

type BudgetEditorSheetProps = Omit<BudgetEditorProps, "editorKey">;

const actionSx: SxProps<Theme> = { minHeight: MIN_TAP_SIZE, flex: { xs: 1, md: "0 0 auto" } };

const deleteSx: SxProps<Theme> = { minHeight: MIN_TAP_SIZE, flex: { xs: 1, md: "0 0 auto" }, mr: { md: "auto" } };

const amountInputProps = { inputMode: "decimal" } as const;

const NO_OPTIONS = "Todas las categorías ya tienen tope.";

const amountHelper = (topeArs: number | null): string =>
  topeArs === null ? "Ingresá un monto mayor a cero" : `= ${formatMoney(topeArs, "ARS")} por mes`;

const inflationHelper = (latestIpc: string | null): string =>
  latestIpc === null
    ? "Todavía no hay IPC cargado: el tope queda fijo hasta que actualices los datos desde la barra superior."
    : `Queda en pesos de ${monthInText(latestIpc)}: sube cada mes con el IPC publicado y, para el histórico, se deflacta hacia atrás.`;

const editorTitle = (target: BudgetEditorTarget | null): string =>
  target?.budget ? `Tope de ${target.budget.category}` : "Nuevo tope";

const BudgetEditorSheet = ({
  open, target, categoryOptions, initialTope, latestIpc, onClose, onSave, onDelete,
}: BudgetEditorSheetProps) => {
  const form = useBudgetForm(target, initialTope);
  const budget = target?.budget ?? null;
  const amountError = form.topeText.trim() !== "" && form.topeArs === null;
  const categoryHelper = categoryOptions.length === 0 ? NO_OPTIONS : undefined;

  const changeCategory = (event: ChangeEvent<HTMLInputElement>) => form.setCategory(event.target.value);
  const changeTope = (event: ChangeEvent<HTMLInputElement>) => form.setTopeText(event.target.value);
  const changeAjusta = (event: ChangeEvent<HTMLInputElement>) => form.setAjustaInflacion(event.target.checked);
  const save = () => {
    if (!form.draft) return;
    onSave(form.draft);
    onClose();
  };

  const categoryItems = categoryOptions.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>);
  const categoryField = form.fixedCategory ? (
    <TextField label="Categoría" value={form.category} disabled fullWidth />
  ) : (
    <TextField select label="Categoría" value={form.category} onChange={changeCategory} helperText={categoryHelper} fullWidth>
      {categoryItems}
    </TextField>
  );
  const deleteButton = budget && (
    <Button color="error" onClick={() => onDelete(budget)} sx={deleteSx}>Borrar</Button>
  );
  const actions = (
    <>
      {deleteButton}
      <Button onClick={onClose} sx={actionSx}>Cancelar</Button>
      <Button variant="contained" disabled={form.draft === null} onClick={save} sx={actionSx}>Guardar</Button>
    </>
  );

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={editorTitle(target)} actions={actions}>
      <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
        {categoryField}
        <TextField
          label="Tope mensual (ARS)"
          value={form.topeText}
          onChange={changeTope}
          error={amountError}
          helperText={amountHelper(form.topeArs)}
          fullWidth
          slotProps={{ htmlInput: amountInputProps }}
        />
        <Box>
          <FormControlLabel
            control={<Switch checked={form.ajustaInflacion} onChange={changeAjusta} />}
            label="Ajustar por inflación"
          />
          <FormHelperText>{inflationHelper(latestIpc)}</FormHelperText>
        </Box>
      </Box>
    </ResponsiveSheet>
  );
};

export const BudgetEditor = ({
  open, target, editorKey, categoryOptions, initialTope, latestIpc, onClose, onSave, onDelete,
}: BudgetEditorProps) => (
  <BudgetEditorSheet
    key={editorKey}
    open={open}
    target={target}
    categoryOptions={categoryOptions}
    initialTope={initialTope}
    latestIpc={latestIpc}
    onClose={onClose}
    onSave={onSave}
    onDelete={onDelete}
  />
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/components/BudgetEditor.test.tsx`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/useBudgetForm.ts client/src/components/BudgetEditor.tsx client/src/components/BudgetEditor.test.tsx
git commit -m "feat(client): editor de topes en hoja o diálogo según el ancho

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Página Presupuestos

**Files:**
- Create: `client/src/useBudgetsPage.ts`
- Create: `client/src/useBudgetEditor.ts`
- Create: `client/src/components/BudgetMonthPicker.tsx`
- Create: `client/src/components/BudgetKpiCards.tsx`
- Create: `client/src/components/BudgetProgressList.tsx`
- Create: `client/src/components/UnbudgetedCategories.tsx`
- Modify (reemplaza el stub): `client/src/pages/BudgetsPage.tsx`
- Test: `client/src/pages/BudgetsPage.test.tsx`

**Interfaces:**
- Consumes: hooks de la base (`useBudgets`, `useBudgetSpending`, `useCreateBudget`, `useUpdateBudget`, `useDeleteBudget`, `useInflation`, `useCategories`, `useCategoryRules`), `useGlobalFilters`, `useTransactionYearOptions`, `useSheetTarget`, `transactionsLink`, `UNCATEGORIZED`, `Kpi`, `KpiGrid`, `FiltersBar`, `ConfirmDialog`, `ChartCard`; todo lo de las tasks 4 a 7.
- Produces:
  - `useBudgetsPage(): BudgetsPageData` con `BudgetsPageData extends BudgetsView { budgets; inflation; categoryOptions; yearOptions; isLoading; error; selectMonth }`
  - `useBudgetEditor(): BudgetEditorState` con `open`, `target`, `editorKey`, `pendingDelete`, `error`, `openNew`, `openForCategory`, `openEdit`, `close`, `save`, `askDelete`, `confirmDelete`, `cancelDelete`
  - `BudgetMonthPicker`, `BudgetKpiCards`, `BudgetProgressList`, `UnbudgetedCategories`, `BudgetsPage`

- [ ] **Step 1: Write the failing test**

`client/src/pages/BudgetsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BudgetDTO, BudgetSpendingDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { cssFor } from "../testing/cssFor.js";
import { BudgetsPage } from "./BudgetsPage.js";

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

interface StubOptions {
  budgets?: BudgetDTO[];
  rejectCreate?: boolean;
  failBudgets?: boolean;
}

const BUDGETS: BudgetDTO[] = [
  { id: "b1", category: "Comida", topeArs: 300000, ajustaInflacion: false, periodoBase: "2026-08" },
  { id: "b2", category: "Transporte", topeArs: 100000, ajustaInflacion: false, periodoBase: "2026-08" },
  { id: "b3", category: "Ropa", topeArs: 100000, ajustaInflacion: false, periodoBase: "2026-08" },
];

const SPENDING: BudgetSpendingDTO = {
  ultimoMesCerrado: "2026-09",
  gastos: [
    { month: "2026-08", category: "Comida", total: 250000, count: 10 },
    { month: "2026-08", category: "Ropa", total: 50000, count: 1 },
    { month: "2026-09", category: "Comida", total: 330000, count: 12 },
    { month: "2026-09", category: "Transporte", total: 85000, count: 6 },
    { month: "2026-09", category: "Ropa", total: 20000, count: 1 },
    { month: "2026-09", category: "Farmacia", total: 15000, count: 2 },
    { month: "2026-09", category: "Sin categoría", total: 12000, count: 3 },
    { month: "2026-10", category: "Comida", total: 50000, count: 2 },
  ],
};

const CATEGORIES = ["Comida", "Farmacia", "Ropa", "Sin categoría", "Transporte"];

const calls: FetchCall[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const respond = (url: string, method: string, { budgets = BUDGETS, rejectCreate = false, failBudgets = false }: StubOptions) => {
  if (method === "POST") return rejectCreate ? json({ error: "Ya hay un tope para «Farmacia»" }, 409) : json(BUDGETS[0], 201);
  if (method === "PATCH") return json(BUDGETS[0]);
  if (method === "DELETE") return new Response(null, { status: 204 });
  if (url.startsWith("/api/budgets/spending")) return json(SPENDING);
  if (url === "/api/budgets") return failBudgets ? json({ error: "Se cayó la base" }, 500) : json(budgets);
  if (url.startsWith("/api/inflation")) return json([]);
  if (url.startsWith("/api/transactions/categories")) return json(CATEGORIES);
  if (url.startsWith("/api/category-rules")) return json([]);
  if (url.startsWith("/api/stats/monthly")) return json([{ month: "2026-09", total: 1, count: 1 }]);
  return json({});
};

const stubFetch = (options: StubOptions = {}) => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return respond(url, method, options);
  }));
};

const sent = (method: string) => calls.filter((call) => call.method === method).map(({ url, body }) => ({ url, body }));

const renderPage = (search = "?year=2026") => renderWithProviders(<BudgetsPage />, { route: `/presupuestos${search}` });

const row = (category: string) => screen.getByRole("listitem", { name: category });

const amountField = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: "Tope mensual (ARS)" });

const openCreate = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Nuevo tope" }));
  return screen.getByRole("dialog", { name: "Nuevo tope" });
};

beforeEach(() => stubFetch());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BudgetsPage", () => {
  it("por defecto muestra el último mes cerrado con el estado de cada tope", async () => {
    renderPage();
    expect(await screen.findByText("Septiembre de 2026")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "topes por categoría" });
    expect(within(list).getAllByRole("listitem").map((item) => item.getAttribute("aria-label")))
      .toEqual(["Comida", "Transporte", "Ropa"]);
    expect(within(row("Comida")).getByText("Pasado")).toBeInTheDocument();
    expect(within(row("Transporte")).getByText("Cerca")).toBeInTheDocument();
    expect(within(row("Ropa")).getByText("En rango")).toBeInTheDocument();
    expect(within(row("Comida")).getByText(/^Te pasaste por \$\s30\.000$/)).toBeInTheDocument();
    expect(screen.getByText("Gastado con tope")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    expect(screen.getByText("87,0% usado")).toBeInTheDocument();
    expect(screen.getByText("1 cerca del tope")).toBeInTheDocument();
    expect(screen.getByText("Cumplimiento mes a mes (topes actuales)")).toBeInTheDocument();
    expect(screen.queryByText("Parcial")).not.toBeInTheDocument();
  });

  it("con Mes en la URL muestra ese mes", async () => {
    renderPage("?year=2026&from=2026-08-01&to=2026-08-31");
    expect(await screen.findByText("Agosto de 2026")).toBeInTheDocument();
    expect(within(row("Comida")).getByText("Cerca")).toBeInTheDocument();
    expect(within(row("Transporte")).getByText("En rango")).toBeInTheDocument();
  });

  it("«mes anterior» pasa al mes de antes y se frena en el primero", async () => {
    renderPage();
    await screen.findByText("Septiembre de 2026");
    await userEvent.click(screen.getByRole("button", { name: "mes anterior" }));
    expect(await screen.findByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mes anterior" })).toBeDisabled();
  });

  it("un mes posterior al último cerrado es parcial", async () => {
    renderPage("?year=2026&from=2026-10-01&to=2026-10-31");
    expect(await screen.findByText("Octubre de 2026")).toBeInTheDocument();
    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.getByText("Mes parcial: faltan consumos que llegan con el próximo resumen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mes siguiente" })).toBeDisabled();
  });

  it("«Ver movimientos» lleva a Movimientos filtrado por la categoría y el mes", async () => {
    renderPage();
    await screen.findByText("Septiembre de 2026");
    expect(within(row("Comida")).getByRole("link", { name: "Ver movimientos" }))
      .toHaveAttribute("href", "/transactions?category=Comida&currency=ARS&from=2026-09-01&to=2026-09-30");
  });

  it("lista lo gastado sin tope y «Sin categoría» lleva a Reglas", async () => {
    renderPage();
    expect(await screen.findByText("Sin tope en septiembre de 2026")).toBeInTheDocument();
    expect(within(row("Farmacia")).getByRole("button", { name: "Poner tope a Farmacia" })).toBeInTheDocument();
    expect(within(row("Sin categoría")).getByRole("link", { name: "Categorizar" })).toHaveAttribute("href", "/rules");
    expect(within(row("Sin categoría")).queryByRole("button", { name: /poner tope/i })).not.toBeInTheDocument();
  });

  it("sin topes da la bienvenida y ofrece poner tope desde las categorías", async () => {
    stubFetch({ budgets: [] });
    renderPage();
    expect(await screen.findByText(/^Todavía no definiste topes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poner tope a Comida" })).toBeInTheDocument();
    expect(screen.queryByText("Gastado con tope")).not.toBeInTheDocument();
    expect(screen.queryByText("Por categoría")).not.toBeInTheDocument();
    expect(screen.queryByText("Cumplimiento mes a mes (topes actuales)")).not.toBeInTheDocument();
  });

  it("crea un tope nuevo eligiendo la categoría", async () => {
    renderPage();
    const dialog = await openCreate();
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Categoría" }));
    await userEvent.click(await screen.findByRole("option", { name: "Farmacia" }));
    await userEvent.type(amountField(dialog), "300.000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("POST")).toEqual([
      { url: "/api/budgets", body: { category: "Farmacia", topeArs: 300000, ajustaInflacion: false } },
    ]));
  });

  it("«Poner tope» abre el editor con la categoría fija", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Poner tope a Farmacia" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    expect(within(dialog).getByRole("textbox", { name: "Categoría" })).toHaveValue("Farmacia");
    await userEvent.type(amountField(dialog), "50.000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("POST")).toEqual([
      { url: "/api/budgets", body: { category: "Farmacia", topeArs: 50000, ajustaInflacion: false } },
    ]));
  });

  it("edita un tope con el monto precargado", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "editar tope de Comida" }));
    const dialog = screen.getByRole("dialog", { name: "Tope de Comida" });
    expect(amountField(dialog)).toHaveValue("300.000");
    await userEvent.clear(amountField(dialog));
    await userEvent.type(amountField(dialog), "350.000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(sent("PATCH")).toEqual([
      { url: "/api/budgets/b1", body: { topeArs: 350000, ajustaInflacion: false } },
    ]));
  });

  it("borrar pide confirmación y recién ahí manda el DELETE", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "editar tope de Comida" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Tope de Comida" })).getByRole("button", { name: "Borrar" }));
    const confirm = screen.getByRole("dialog", { name: "Borrar tope" });
    expect(within(confirm).getByText("¿Borrar el tope de «Comida»? El histórico deja de contarla.")).toBeInTheDocument();
    expect(sent("DELETE")).toEqual([]);
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(sent("DELETE")).toEqual([{ url: "/api/budgets/b1", body: undefined }]));
  });

  it("si el server rechaza el tope muestra su mensaje", async () => {
    stubFetch({ rejectCreate: true });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Poner tope a Farmacia" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    await userEvent.type(amountField(dialog), "1000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Ya hay un tope para «Farmacia»")).toBeInTheDocument();
  });

  it("si falla la carga muestra el error debajo del título", async () => {
    stubFetch({ failBudgets: true });
    renderPage();
    expect(await screen.findByText("Se cayó la base")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Presupuestos" })).toBeInTheDocument();
  });
});

describe("BudgetsPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("«Nuevo tope» abre la hoja desde abajo", async () => {
    renderPage();
    await openCreate();
    expect(document.querySelector(".MuiDrawer-root")).toBeInTheDocument();
  });

  it("las flechas del mes miden 44 px para el pulgar", async () => {
    renderPage();
    await screen.findByText("Septiembre de 2026");
    for (const name of ["mes anterior", "mes siguiente"]) {
      const css = cssFor(screen.getByRole("button", { name }));
      expect(css).toContain("min-width:44px");
      expect(css).toContain("min-height:44px");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test client/src/pages/BudgetsPage.test.tsx`
Expected: FAIL — el stub solo muestra el título (no encuentra «Septiembre de 2026»).

- [ ] **Step 3: Write minimal implementation**

`client/src/useBudgetEditor.ts`:

```ts
import { useCallback, useState } from "react";
import type { BudgetDTO, BudgetInput } from "@ledgerly/shared";
import { useCreateBudget, useDeleteBudget, useUpdateBudget } from "./api/hooks.js";
import { useSheetTarget } from "./components/useSheetTarget.js";
import type { BudgetEditorTarget } from "./components/useBudgetForm.js";

type BudgetAction = "create" | "update" | "delete";

export interface BudgetEditorState {
  open: boolean;
  target: BudgetEditorTarget | null;
  editorKey: number;
  pendingDelete: BudgetDTO | null;
  error: Error | null;
  openNew: () => void;
  openForCategory: (category: string) => void;
  openEdit: (budget: BudgetDTO) => void;
  close: () => void;
  save: (draft: BudgetInput) => void;
  askDelete: (budget: BudgetDTO) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
}

export const useBudgetEditor = (): BudgetEditorState => {
  const { target, open, show, close } = useSheetTarget<BudgetEditorTarget>();
  const [editorKey, setEditorKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<BudgetDTO | null>(null);
  const [lastAction, setLastAction] = useState<BudgetAction | null>(null);
  const { mutate: createBudget, error: createError } = useCreateBudget();
  const { mutate: updateBudget, error: updateError } = useUpdateBudget();
  const { mutate: deleteBudget, error: deleteError } = useDeleteBudget();

  const showTarget = useCallback((next: BudgetEditorTarget) => {
    setEditorKey((key) => key + 1);
    show(next);
  }, [show]);

  const openNew = useCallback(() => showTarget({ budget: null, category: null }), [showTarget]);
  const openForCategory = useCallback((category: string) => showTarget({ budget: null, category }), [showTarget]);
  const openEdit = useCallback((budget: BudgetDTO) => showTarget({ budget, category: budget.category }), [showTarget]);

  const save = useCallback((draft: BudgetInput) => {
    const budget = target?.budget ?? null;
    if (budget) {
      setLastAction("update");
      updateBudget({ id: budget.id, body: { topeArs: draft.topeArs, ajustaInflacion: draft.ajustaInflacion } });
      return;
    }
    setLastAction("create");
    createBudget(draft);
  }, [target, updateBudget, createBudget]);

  const askDelete = useCallback((budget: BudgetDTO) => {
    close();
    setPendingDelete(budget);
  }, [close]);

  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const confirmDelete = useCallback(() => {
    if (pendingDelete) {
      setLastAction("delete");
      deleteBudget(pendingDelete.id);
    }
    setPendingDelete(null);
  }, [pendingDelete, deleteBudget]);

  const errors: Record<BudgetAction, Error | null> = { create: createError, update: updateError, delete: deleteError };

  return {
    open,
    target,
    editorKey,
    pendingDelete,
    error: lastAction === null ? null : errors[lastAction],
    openNew,
    openForCategory,
    openEdit,
    close,
    save,
    askDelete,
    confirmDelete,
    cancelDelete,
  };
};
```

`client/src/useBudgetsPage.ts`:

```ts
import { useMemo } from "react";
import type { BudgetDTO, BudgetSpendingDTO, CategoryRuleDTO, InflationRateDTO } from "@ledgerly/shared";
import { useBudgetSpending, useBudgets, useCategories, useCategoryRules, useInflation } from "./api/hooks.js";
import { budgetCategoryOptions, budgetsView, type BudgetsView } from "./budgets.js";
import { useGlobalFilters } from "./filters/useGlobalFilters.js";
import { useTransactionYearOptions } from "./filters/useYearOptions.js";

export interface BudgetsPageData extends BudgetsView {
  budgets: BudgetDTO[];
  inflation: InflationRateDTO[];
  categoryOptions: string[];
  yearOptions: string[];
  isLoading: boolean;
  error: Error | null;
  selectMonth: (month: string) => void;
}

const NO_BUDGETS: BudgetDTO[] = [];
const NO_SPENDING: BudgetSpendingDTO = { ultimoMesCerrado: null, gastos: [] };
const NO_INFLATION: InflationRateDTO[] = [];
const NO_CATEGORIES: string[] = [];
const NO_RULES: CategoryRuleDTO[] = [];

export const useBudgetsPage = (): BudgetsPageData => {
  const { years, from, setMonth } = useGlobalFilters();
  const budgetsQuery = useBudgets();
  const spendingQuery = useBudgetSpending(years);
  const inflationQuery = useInflation();
  const { data: categories = NO_CATEGORIES } = useCategories();
  const { data: rules = NO_RULES } = useCategoryRules();
  const yearOptions = useTransactionYearOptions("ARS", undefined);

  const budgets = budgetsQuery.data ?? NO_BUDGETS;
  const spending = spendingQuery.data ?? NO_SPENDING;
  const inflation = inflationQuery.data ?? NO_INFLATION;
  const selectedMonth = from ? from.slice(0, 7) : null;

  const view = useMemo(
    () => budgetsView({ budgets, spending, inflation, selectedMonth, today: new Date() }),
    [budgets, spending, inflation, selectedMonth],
  );
  const categoryOptions = useMemo(
    () => budgetCategoryOptions(categories, rules, budgets),
    [categories, rules, budgets],
  );

  return {
    ...view,
    budgets,
    inflation,
    categoryOptions,
    yearOptions,
    isLoading: budgetsQuery.isLoading || spendingQuery.isLoading || inflationQuery.isLoading,
    error: budgetsQuery.error ?? spendingQuery.error ?? null,
    selectMonth: setMonth,
  };
};
```

`client/src/components/BudgetMonthPicker.tsx`:

```tsx
import { Box, Chip, IconButton, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { formatMonthLabel } from "../format.js";
import { iconTapTargetSx } from "./tapTarget.js";

interface BudgetMonthPickerProps {
  month: string;
  months: string[];
  partial: boolean;
  onChange: (month: string) => void;
}

const PARTIAL_NOTE = "Mes parcial: faltan consumos que llegan con el próximo resumen.";

export const BudgetMonthPicker = ({ month, months, partial, onChange }: BudgetMonthPickerProps) => {
  const index = months.indexOf(month);
  const previous = index > 0 ? months[index - 1] : null;
  const next = index >= 0 && index < months.length - 1 ? months[index + 1] : null;

  const goPrevious = () => {
    if (previous) onChange(previous);
  };
  const goNext = () => {
    if (next) onChange(next);
  };

  const partialChip = partial && <Chip size="small" variant="outlined" label="Parcial" />;
  const partialNote = partial && (
    <Typography variant="caption" color="text.secondary" component="p" sx={{ textAlign: "center", mt: 0.5 }}>
      {PARTIAL_NOTE}
    </Typography>
  );

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <IconButton aria-label="mes anterior" onClick={goPrevious} disabled={previous === null} sx={iconTapTargetSx}>
          <ChevronLeftIcon />
        </IconButton>
        <Box
          aria-live="polite"
          sx={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 1, minWidth: 0 }}
        >
          <Typography variant="h6" component="p">{formatMonthLabel(month)}</Typography>
          {partialChip}
        </Box>
        <IconButton aria-label="mes siguiente" onClick={goNext} disabled={next === null} sx={iconTapTargetSx}>
          <ChevronRightIcon />
        </IconButton>
      </Box>
      {partialNote}
    </Box>
  );
};
```

`client/src/components/BudgetKpiCards.tsx`:

```tsx
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import { BUDGET_STATUS_COLOR, formatPesos, type BudgetTotals } from "../budgets.js";
import { formatPercent } from "../format.js";
import { Kpi } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";

interface BudgetKpiCardsProps {
  totals: BudgetTotals;
}

export const BudgetKpiCards = ({ totals }: BudgetKpiCardsProps) => {
  const balanceLabel = totals.restante < 0 ? "Excedido" : "Disponible";
  const usedSub = `${formatPercent(totals.ratio * 100)} usado`;
  const nearSub = totals.cerca > 0 ? `${totals.cerca} cerca del tope` : undefined;
  const fulfilled = (value: number): string => `${Math.round(value)} de ${totals.total}`;

  return (
    <KpiGrid cardCount={3}>
      <Kpi
        label="Gastado con tope"
        value={totals.gastado}
        format={formatPesos}
        sub={`de ${formatPesos(totals.tope)}`}
        icon={<ShoppingCartOutlinedIcon />}
        color="primary"
      />
      <Kpi
        label={balanceLabel}
        value={Math.abs(totals.restante)}
        format={formatPesos}
        sub={usedSub}
        icon={<AccountBalanceWalletOutlinedIcon />}
        color={BUDGET_STATUS_COLOR[totals.estado]}
      />
      <Kpi
        label="Topes cumplidos"
        value={totals.cumplidos}
        format={fulfilled}
        sub={nearSub}
        icon={<TaskAltOutlinedIcon />}
        color="secondary"
      />
    </KpiGrid>
  );
};
```

`client/src/components/BudgetProgressList.tsx`:

```tsx
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, Chip, IconButton, LinearProgress, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import type { BudgetDTO } from "@ledgerly/shared";
import {
  BUDGET_STATUS_COLOR, BUDGET_STATUS_LABEL, budgetBalanceText, budgetInflationNote, formatPesos, monthInText, type BudgetLine,
} from "../budgets.js";
import { formatPercent } from "../format.js";
import { transactionsLink } from "../filters/transactionsLink.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { iconTapTargetSx, tapTargetSx } from "./tapTarget.js";

interface BudgetProgressListProps {
  lines: BudgetLine[];
  month: string;
  latestIpc: string | null;
  hasSpending: boolean;
  onEdit: (budget: BudgetDTO) => void;
}

interface BudgetProgressRowProps {
  line: BudgetLine;
  month: string;
  latestIpc: string | null;
  onEdit: (budget: BudgetDTO) => void;
}

const CRITERIA =
  "Mismo criterio que el Dashboard: consumos en pesos por fecha de compra, todas las tarjetas. Las compras en cuotas suman cada cuota a medida que llegan los resúmenes.";

const listSx: SxProps<Theme> = { listStyle: "none", m: 0, p: 0, display: "grid", gap: 2.5 };
const titleRowSx: SxProps<Theme> = { display: "flex", alignItems: "center", gap: 1 };
const progressSx: SxProps<Theme> = { height: 8, borderRadius: 4, my: 0.5, "& .MuiLinearProgress-bar": { borderRadius: 4 } };
const amountsRowSx: SxProps<Theme> = { display: "flex", justifyContent: "space-between", gap: 1, mt: 0.5 };
const footerRowSx: SxProps<Theme> = {
  display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", columnGap: 1,
};

const BudgetProgressRow = ({ line, month, latestIpc, onEdit }: BudgetProgressRowProps) => {
  const { budget, category, tope, gastado, restante, ratio, estado } = line;
  const color = BUDGET_STATUS_COLOR[estado];
  const edit = () => onEdit(budget);
  const amounts = `${formatPesos(gastado)} de ${formatPesos(tope)}`;
  const caption = `${budgetBalanceText(restante)}${budgetInflationNote(budget, month, latestIpc)}`;
  const link = transactionsLink({ category, month, currency: "ARS" });

  return (
    <Box component="li" aria-label={category}>
      <Box sx={titleRowSx}>
        <Typography variant="subtitle1" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{category}</Typography>
        <Chip size="small" color={color} label={BUDGET_STATUS_LABEL[estado]} />
        <IconButton aria-label={`editar tope de ${category}`} onClick={edit} sx={iconTapTargetSx}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(ratio, 1) * 100}
        color={color}
        aria-label={`avance de ${category}`}
        sx={progressSx}
      />
      <Box sx={amountsRowSx}>
        <Typography variant="body2">{amounts}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatPercent(ratio * 100)}</Typography>
      </Box>
      <Box sx={footerRowSx}>
        <Typography variant="caption" color="text.secondary">{caption}</Typography>
        <Button size="small" component={RouterLink} to={link} sx={tapTargetSx}>Ver movimientos</Button>
      </Box>
    </Box>
  );
};

export const BudgetProgressList = ({ lines, month, latestIpc, hasSpending, onEdit }: BudgetProgressListProps) => {
  const rows = lines.map((line) => (
    <BudgetProgressRow key={line.budget.id} line={line} month={month} latestIpc={latestIpc} onEdit={onEdit} />
  ));
  const noSpending = !hasSpending && (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{`Sin consumos en ${monthInText(month)}.`}</Typography>
  );

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={compactCardContentSx}>
        <Typography variant="h6">Por categoría</Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>{CRITERIA}</Typography>
        {noSpending}
        <Box component="ul" aria-label="topes por categoría" sx={listSx}>{rows}</Box>
      </CardContent>
    </Card>
  );
};
```

`client/src/components/UnbudgetedCategories.tsx`:

```tsx
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { UNCATEGORIZED } from "../categoryOptions.js";
import { formatPesos, monthInText, type UnbudgetedCategory } from "../budgets.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { tapTargetSx } from "./tapTarget.js";

interface UnbudgetedCategoriesProps {
  month: string;
  categories: UnbudgetedCategory[];
  onAdd: (category: string) => void;
}

interface UnbudgetedRowProps {
  item: UnbudgetedCategory;
  onAdd: (category: string) => void;
}

const listSx: SxProps<Theme> = { listStyle: "none", m: 0, p: 0 };

const rowSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  py: 1,
  borderTop: 1,
  borderColor: "divider",
  "&:first-of-type": { borderTop: 0 },
};

const UnbudgetedRow = ({ item: { category, total }, onAdd }: UnbudgetedRowProps) => {
  const add = () => onAdd(category);
  const action = category === UNCATEGORIZED ? (
    <Button size="small" component={RouterLink} to="/rules" sx={tapTargetSx}>Categorizar</Button>
  ) : (
    <Button size="small" onClick={add} aria-label={`Poner tope a ${category}`} sx={tapTargetSx}>Poner tope</Button>
  );

  return (
    <Box component="li" aria-label={category} sx={rowSx}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap>{category}</Typography>
        <Typography variant="body2" color="text.secondary">{formatPesos(total)}</Typography>
      </Box>
      {action}
    </Box>
  );
};

export const UnbudgetedCategories = ({ month, categories, onAdd }: UnbudgetedCategoriesProps) => {
  const rows = categories.map((item) => <UnbudgetedRow key={item.category} item={item} onAdd={onAdd} />);

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={compactCardContentSx}>
        <Typography variant="h6" sx={{ mb: 1 }}>{`Sin tope en ${monthInText(month)}`}</Typography>
        <Box component="ul" sx={listSx}>{rows}</Box>
      </CardContent>
    </Card>
  );
};
```

`client/src/pages/BudgetsPage.tsx` (reemplaza el stub):

```tsx
import { Alert, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import type { BudgetDTO } from "@ledgerly/shared";
import { currentLimit } from "../budgets.js";
import { useBudgetsPage } from "../useBudgetsPage.js";
import { useBudgetEditor } from "../useBudgetEditor.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { BudgetMonthPicker } from "../components/BudgetMonthPicker.js";
import { BudgetKpiCards } from "../components/BudgetKpiCards.js";
import { BudgetProgressList } from "../components/BudgetProgressList.js";
import { UnbudgetedCategories } from "../components/UnbudgetedCategories.js";
import { BudgetEditor } from "../components/BudgetEditor.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { BudgetComplianceChart } from "../components/charts/BudgetComplianceChart.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { tapTargetSx } from "../components/tapTarget.js";

const BUDGET_FIELDS: FilterField[] = ["year"];

const WELCOME = "Todavía no definiste topes. Creá uno con «Nuevo tope» o desde las categorías de abajo.";

const headerSx: SxProps<Theme> = {
  justifyContent: "space-between",
  alignItems: { xs: "stretch", md: "center" },
  gap: { xs: 2, md: 0 },
  mb: 3,
};

const Title = () => <Typography variant="h4" sx={{ mb: 3 }}>Presupuestos</Typography>;

const deleteMessage = (budget: BudgetDTO | null): string =>
  budget ? `¿Borrar el tope de «${budget.category}»? El histórico deja de contarla.` : "";

export const BudgetsPage = () => {
  const page = useBudgetsPage();
  const editor = useBudgetEditor();

  if (page.isLoading) {
    return (
      <>
        <Title />
        <CircularProgress />
      </>
    );
  }

  if (page.error) {
    return (
      <>
        <Title />
        <Alert severity="error">{page.error.message}</Alert>
      </>
    );
  }

  const hasBudgets = page.budgets.length > 0;
  const initialTope = editor.target?.budget ? currentLimit(editor.target.budget, page.inflation) : null;
  const editorError = editor.error && <Alert severity="error" sx={{ mb: 2 }}>{editor.error.message}</Alert>;
  const welcome = !hasBudgets && <Typography color="text.secondary" sx={{ mb: 3 }}>{WELCOME}</Typography>;
  const kpis = page.totals && <BudgetKpiCards totals={page.totals} />;
  const progress = hasBudgets && (
    <BudgetProgressList
      lines={page.lines}
      month={page.month}
      latestIpc={page.latestIpc}
      hasSpending={page.hasSpending}
      onEdit={editor.openEdit}
    />
  );
  const unbudgeted = page.unbudgeted.length > 0 && (
    <UnbudgetedCategories month={page.month} categories={page.unbudgeted} onAdd={editor.openForCategory} />
  );
  const compliance = hasBudgets && (
    <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={{ mb: 3 }}>
      <ChartCard title="Cumplimiento mes a mes (topes actuales)">
        <BudgetComplianceChart history={page.history} />
      </ChartCard>
    </MotionBox>
  );

  return (
    <>
      <Stack direction={{ xs: "column", md: "row" }} sx={headerSx}>
        <Typography variant="h4">Presupuestos</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={editor.openNew} sx={tapTargetSx}>Nuevo tope</Button>
      </Stack>
      {editorError}
      <FiltersBar fields={BUDGET_FIELDS} yearOptions={page.yearOptions} />
      <BudgetMonthPicker month={page.month} months={page.months} partial={page.partial} onChange={page.selectMonth} />
      {welcome}
      {kpis}
      {progress}
      {unbudgeted}
      {compliance}
      <BudgetEditor
        open={editor.open}
        target={editor.target}
        editorKey={editor.editorKey}
        categoryOptions={page.categoryOptions}
        initialTope={initialTope}
        latestIpc={page.latestIpc}
        onClose={editor.close}
        onSave={editor.save}
        onDelete={editor.askDelete}
      />
      <ConfirmDialog
        open={editor.pendingDelete !== null}
        title="Borrar tope"
        message={deleteMessage(editor.pendingDelete)}
        confirmLabel="Borrar"
        onConfirm={editor.confirmDelete}
        onClose={editor.cancelDelete}
      />
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test client/src/pages/BudgetsPage.test.tsx client/src/App.test.tsx`
Expected: PASS (15 tests de la página y los 5 de rutas, incluido `/presupuestos` mostrando el `h4` mientras carga).

- [ ] **Step 5: Commit**

```bash
git add client/src/useBudgetsPage.ts client/src/useBudgetEditor.ts client/src/components/BudgetMonthPicker.tsx \
  client/src/components/BudgetKpiCards.tsx client/src/components/BudgetProgressList.tsx \
  client/src/components/UnbudgetedCategories.tsx client/src/pages/BudgetsPage.tsx client/src/pages/BudgetsPage.test.tsx
git commit -m "feat(client): página Presupuestos con progreso por categoría e histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificación final

**Files:** ninguno (solo si algo falla).

- [ ] **Step 1: Suite completa**

Run: `bun run test`
Expected: todos los archivos en verde (los `skipped` son los que necesitan PDFs reales de `examples/`).

- [ ] **Step 2: Tipos**

Run: `bun run typecheck`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build de Vite sin errores.

- [ ] **Step 4: Prueba manual (la hace el usuario con la app levantada)**

1. Crear dos topes, uno ajustado por IPC.
2. Comparar septiembre con la torta del Dashboard en Mes septiembre y ARS.
3. Revisar «Ver movimientos».
4. Revisar el mes parcial.
5. Revisar la vista a 390 px.
