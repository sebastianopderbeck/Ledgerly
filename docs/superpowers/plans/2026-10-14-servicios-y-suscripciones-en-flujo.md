# Servicios y suscripciones en el flujo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los egresos del flujo de caja incluyan los servicios pagados fuera de la tarjeta (cargados a mano en una página nueva) y, en los meses proyectados, las suscripciones de tarjeta.

**Architecture:** Colección nueva `FixedServiceModel` con su CRUD en `/api/fixed-services`. `buildCashFlow` (módulo puro) recibe dos entradas nuevas, `services` y `subscriptions`, y las imputa al mes que corresponde. La ruta del flujo las lee de Mongo y de la detección de suscripciones, cuya lectura se comparte con `/api/subscriptions`. El cliente suma la página `/servicios` y una columna «Servicios» en el detalle del flujo.

**Tech Stack:** TypeScript, Express, Mongoose, Zod (`@ledgerly/shared`), React 18 + MUI + TanStack Query, Vitest + Testing Library + mongodb-memory-server, Bun.

**Spec:** `docs/superpowers/specs/2026-10-14-servicios-y-suscripciones-en-flujo-design.md`

## Global Constraints

- Todo se hace en el worktree `.claude/worktrees/servicios-en-flujo` (rama `feat/servicios-en-flujo`). Los comandos corren desde ahí.
- Commits con pathspec explícito, mensaje `tipo(scope): …` en castellano y el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Después de cada commit: `git push`. Nunca a `main`, nunca PR.
- Nada de comentarios en el código. Nada de `any`. Componentes funcionales con destructuring en la firma; lógica de más de 15 líneas va a un hook propio; condicionales y mapeos antes del `return`; `key` por id, nunca por índice; carga y error con returns tempranos.
- Textos de UI y del server copiados tal cual del spec:
  - «Servicio inválido», «Servicio no encontrado».
  - «Servicios (último monto +2,1% por mes)» / «Servicios (último monto)»: sale de `detalleAumento`.
  - «<tarjeta> (cuotas y suscripciones)».
  - Bajada de Servicios: «Lo que pagás fuera de la tarjeta (luz, gas, agua, internet, expensas). Se restan en el Flujo desde el mes que elijas.»
  - Ayudas del editor: «Dejá vacío mientras lo sigas pagando», «El primer mes en que lo pagás», «Lo saca también de los meses pasados. Para dejar de pagarlo, completá Hasta.»
- Sin datos reales del usuario en código, tests, commits ni textos de GitHub. Los ejemplos son sintéticos.
- Servicios solo en ARS, cadencia `"mensual"` o `"bimestral"`. `MESES_SERVICIO = { mensual: 1, bimestral: 2 }`.
- El mes actual del server es `new Date().toISOString().slice(0, 7)` (UTC). En el cliente, `monthOf(todayIso())`.
- Correr un archivo de tests: `bunx vitest run <ruta>`. Todo: `bun run test`. Tipos: `bun run typecheck`.

## Review Focus

1. **Montos con decimales en formato argentino** («12.345,50»): el editor tiene que mandar `12345.5`. Test en la Task 7.
2. **El server rechaza una edición** (por ejemplo, un 400 «Servicio inválido»): el editor tiene que mostrar el mensaje y quedar abierto. Test en la Task 8.
3. **Una suscripción de un emisor sin `CashFlowCard`** (su último resumen no tiene fechas): no se proyecta y no rompe nada. Test en la Task 5.
4. **Un `proximoCobro` muy viejo**, más de un año antes del último cierre: el cálculo termina y arranca en el primer cobro posterior al cierre, uno por mes. Test en la Task 5.
5. **Servicios en un mes cerrado incompleto:** se suman a los egresos y no agregan faltantes. Test en la Task 4.

---

### Task 1: Schemas compartidos de servicios

**Files:**
- Modify: `shared/src/dtos.ts` (schemas después de `manualAssetUpdateSchema`; tipos después de `ManualAssetUpdateDTO`)
- Test: `shared/src/dtos.test.ts`

**Interfaces:**
- Produces:
  - `isoMonthSchema`
  - `fixedServiceCadenciaSchema`
  - `fixedServiceDtoSchema`, `fixedServiceCreateSchema`, `fixedServiceUpdateSchema`
  - `MESES_SERVICIO: Record<FixedServiceCadencia, number>`
  - tipos `FixedServiceCadencia`, `FixedServiceDTO` (`{ id, nombre, monto, cadencia, desde, hasta: string | null, montoDesde }`), `FixedServiceCreateDTO` (`{ nombre, monto, cadencia?, desde? }`) y `FixedServiceUpdateDTO` (`{ nombre?, monto?, cadencia?, desde?, hasta?: string | null }`).

- [ ] **Step 0: Preparar el worktree**

Run: `bun install --frozen-lockfile`
Expected: termina sin errores.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `shared/src/dtos.test.ts`:

```ts
import {
  MESES_SERVICIO, fixedServiceCreateSchema, fixedServiceDtoSchema, fixedServiceUpdateSchema, isoMonthSchema,
} from "./dtos.js";

describe("isoMonthSchema", () => {
  it("acepta un mes YYYY-MM", () => {
    expect(isoMonthSchema.safeParse("2026-10").success).toBe(true);
  });

  it.each(["2026-13", "2026-00", "2026-1", "2026-10-01", ""])("rechaza %s", (mes) => {
    expect(isoMonthSchema.safeParse(mes).success).toBe(false);
  });
});

describe("schemas de servicios", () => {
  const servicio = {
    id: "f1", nombre: "Luz", monto: 30000, cadencia: "mensual", desde: "2026-10", hasta: null, montoDesde: "2026-10",
  };

  it("valida un servicio", () => {
    expect(fixedServiceDtoSchema.parse(servicio)).toEqual(servicio);
  });

  it("el bimestral se paga cada 2 meses", () => {
    expect(MESES_SERVICIO).toEqual({ mensual: 1, bimestral: 2 });
  });

  it("el alta recorta el nombre y acepta cadencia y desde", () => {
    expect(fixedServiceCreateSchema.parse({ nombre: "  Gas ", monto: 12000, cadencia: "bimestral", desde: "2026-11" }))
      .toEqual({ nombre: "Gas", monto: 12000, cadencia: "bimestral", desde: "2026-11" });
  });

  it.each([
    ["sin nombre", { nombre: " ", monto: 100 }],
    ["con monto 0", { nombre: "Gas", monto: 0 }],
    ["con un mes inválido", { nombre: "Gas", monto: 100, desde: "2026-13" }],
    ["con hasta", { nombre: "Gas", monto: 100, hasta: "2026-12" }],
    ["con montoDesde", { nombre: "Gas", monto: 100, montoDesde: "2026-01" }],
    ["con una cadencia anual", { nombre: "Gas", monto: 100, cadencia: "anual" }],
  ])("el alta rechaza un servicio %s", (_label, body) => {
    expect(fixedServiceCreateSchema.safeParse(body).success).toBe(false);
  });

  it("la edición acepta hasta en null y rechaza montoDesde", () => {
    expect(fixedServiceUpdateSchema.parse({ hasta: null })).toEqual({ hasta: null });
    expect(fixedServiceUpdateSchema.parse({ hasta: "2026-12", monto: 15000 })).toEqual({ hasta: "2026-12", monto: 15000 });
    expect(fixedServiceUpdateSchema.safeParse({ montoDesde: "2026-01" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run shared/src/dtos.test.ts`
Expected: FAIL, porque `isoMonthSchema` y los demás no se exportan.

- [ ] **Step 3: Implementar**

En `shared/src/dtos.ts`, justo después de `manualAssetUpdateSchema`:

```ts
export const isoMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido");

export const fixedServiceCadenciaSchema = z.enum(["mensual", "bimestral"]);

export const MESES_SERVICIO: Record<FixedServiceCadencia, number> = { mensual: 1, bimestral: 2 };

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

Y después de `export type ManualAssetUpdateDTO = …`:

```ts
export type FixedServiceCadencia = z.infer<typeof fixedServiceCadenciaSchema>;
export type FixedServiceDTO = z.infer<typeof fixedServiceDtoSchema>;
export type FixedServiceCreateDTO = z.infer<typeof fixedServiceCreateSchema>;
export type FixedServiceUpdateDTO = z.infer<typeof fixedServiceUpdateSchema>;
```

- [ ] **Step 4: Correr los tests y el typecheck**

Run: `bunx vitest run shared/src/dtos.test.ts && bun run typecheck`
Expected: PASS y typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add shared/src/dtos.ts shared/src/dtos.test.ts
git commit -m "feat(shared): schemas de servicios fuera de la tarjeta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- shared/src/dtos.ts shared/src/dtos.test.ts
git push
```

---

### Task 2: Colección y API `/api/fixed-services`

**Files:**
- Modify: `server/src/db/models.ts` (schema después de `manualAssetSchema`; tipo y modelo junto a los de `ManualAsset`)
- Modify: `server/src/http/mappers.ts`
- Create: `server/src/http/routes/fixedServices.ts`
- Modify: `server/src/http/app.ts` (import y `app.use` después de `/api/budgets`)
- Test: `server/src/http/routes/fixedServices.test.ts`

**Interfaces:**
- Consumes: `fixedServiceCreateSchema`, `fixedServiceUpdateSchema`, `FixedServiceDTO`, `FixedServiceCadencia` (Task 1).
- Produces:
  - `FixedServiceModel` y `FixedServiceDoc` en `server/src/db/models.ts`;
  - `toFixedServiceDTO(doc: HydratedDocument<FixedServiceDoc>): FixedServiceDTO` en `mappers.ts`;
  - `fixedServicesRouter`, montado en `/api/fixed-services`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `server/src/http/routes/fixedServices.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { fixedServiceDtoSchema, type FixedServiceDTO } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { FixedServiceModel } from "../../db/models.js";

withDb();
const app = createApp();

const INVALID = "Servicio inválido";
const NOT_FOUND = "Servicio no encontrado";
const MISSING_ID = "66f000000000000000000000";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const create = (body: object) => request(app).post("/api/fixed-services").send(body);
const patch = (id: string, body: object) => request(app).patch(`/api/fixed-services/${id}`).send(body);
const created = async (body: object = { nombre: "Luz", monto: 30_000 }): Promise<FixedServiceDTO> =>
  fixedServiceDtoSchema.parse((await create(body)).body);

describe("POST /api/fixed-services", () => {
  it("crea un servicio mensual desde el mes actual", async () => {
    const res = await create({ nombre: " Luz ", monto: 30_000 });
    expect(res.status).toBe(201);
    expect(fixedServiceDtoSchema.parse(res.body)).toEqual({
      id: expect.any(String), nombre: "Luz", monto: 30_000, cadencia: "mensual",
      desde: "2026-10", hasta: null, montoDesde: "2026-10",
    });
  });

  it("respeta la cadencia y el mes desde, y montoDesde es el mes actual", async () => {
    expect(await created({ nombre: "Gas", monto: 18_000, cadencia: "bimestral", desde: "2026-11" }))
      .toMatchObject({ cadencia: "bimestral", desde: "2026-11", montoDesde: "2026-10" });
  });

  it.each([
    ["sin nombre", { nombre: "", monto: 100 }],
    ["con monto 0", { nombre: "Luz", monto: 0 }],
    ["con un mes inválido", { nombre: "Luz", monto: 100, desde: "2026-13" }],
    ["con montoDesde", { nombre: "Luz", monto: 100, montoDesde: "2026-01" }],
  ])("rechaza un alta %s", async (_label, body) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: INVALID });
  });
});

describe("GET /api/fixed-services", () => {
  it("lista primero los activos y después los dados de baja, por nombre", async () => {
    const internet = await created({ nombre: "Internet", monto: 25_000 });
    await created({ nombre: "Agua", monto: 9_000 });
    const cable = await created({ nombre: "Cable", monto: 15_000, desde: "2026-01" });
    await patch(cable.id, { hasta: "2026-09" });
    await patch(internet.id, { hasta: "2026-10" });
    const res = await request(app).get("/api/fixed-services");
    expect(res.status).toBe(200);
    expect((res.body as FixedServiceDTO[]).map((servicio) => servicio.nombre)).toEqual(["Agua", "Internet", "Cable"]);
  });

  it("un documento viejo sin cadencia ni hasta se lee con los defaults", async () => {
    await FixedServiceModel.collection.insertOne({ nombre: "Luz", monto: 30_000, desde: "2026-10", montoDesde: "2026-10" });
    const [servicio] = (await request(app).get("/api/fixed-services")).body as FixedServiceDTO[];
    expect(servicio).toMatchObject({ nombre: "Luz", cadencia: "mensual", hasta: null });
  });
});

describe("PATCH /api/fixed-services/:id", () => {
  it("cambiar el monto mueve montoDesde al mes actual", async () => {
    const luz = await created();
    vi.setSystemTime(new Date("2026-12-05T12:00:00Z"));
    const res = await patch(luz.id, { monto: 36_000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ monto: 36_000, montoDesde: "2026-12" });
  });

  it("cambiar otros campos, o mandar el mismo monto, no mueve montoDesde", async () => {
    const luz = await created();
    vi.setSystemTime(new Date("2026-12-05T12:00:00Z"));
    const res = await patch(luz.id, { nombre: "Electricidad", monto: 30_000, cadencia: "bimestral" });
    expect(res.body).toMatchObject({ nombre: "Electricidad", cadencia: "bimestral", montoDesde: "2026-10" });
  });

  it("da de baja con hasta y lo reactiva con null", async () => {
    const luz = await created();
    expect((await patch(luz.id, { hasta: "2026-11" })).body).toMatchObject({ hasta: "2026-11" });
    expect((await patch(luz.id, { hasta: null })).body).toMatchObject({ hasta: null });
  });

  it("rechaza un hasta anterior al desde, también combinando con lo guardado", async () => {
    const gas = await created({ nombre: "Gas", monto: 18_000, desde: "2026-10" });
    expect((await patch(gas.id, { hasta: "2026-09" })).status).toBe(400);
    expect((await patch(gas.id, { desde: "2026-12", hasta: "2026-11" })).status).toBe(400);
    await patch(gas.id, { hasta: "2026-11" });
    const res = await patch(gas.id, { desde: "2026-12" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: INVALID });
  });

  it("rechaza campos de más", async () => {
    const luz = await created();
    expect((await patch(luz.id, { montoDesde: "2026-01" })).status).toBe(400);
  });

  it.each([MISSING_ID, "no-es-un-id"])("responde 404 con el id %s", async (id) => {
    const res = await patch(id, { monto: 1 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: NOT_FOUND });
  });
});

describe("DELETE /api/fixed-services/:id", () => {
  it("borra el servicio", async () => {
    const luz = await created();
    expect((await request(app).delete(`/api/fixed-services/${luz.id}`)).status).toBe(204);
    expect(await FixedServiceModel.countDocuments()).toBe(0);
  });

  it("responde 404 con un id inexistente", async () => {
    const res = await request(app).delete(`/api/fixed-services/${MISSING_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: NOT_FOUND });
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run server/src/http/routes/fixedServices.test.ts`
Expected: FAIL, porque `FixedServiceModel` no existe.

- [ ] **Step 3: Implementar el modelo**

En `server/src/db/models.ts`, después de `manualAssetSchema`:

```ts
const fixedServiceSchema = new Schema(
  {
    nombre: { type: String, required: true },
    monto: { type: Number, required: true, min: 0 },
    cadencia: { type: String, required: true, enum: ["mensual", "bimestral"], default: "mensual" },
    desde: { type: String, required: true },
    hasta: { type: String, default: null },
    montoDesde: { type: String, required: true },
  },
  { timestamps: true },
);
```

Junto a `ManualAssetDoc`:

```ts
export type FixedServiceDoc = InferSchemaType<typeof fixedServiceSchema>;
```

Junto a `ManualAssetModel`:

```ts
export const FixedServiceModel: Model<FixedServiceDoc> =
  mongoose.models.FixedService ?? mongoose.model("FixedService", fixedServiceSchema);
```

- [ ] **Step 4: Implementar el mapper**

En `server/src/http/mappers.ts`, sumar `FixedServiceCadencia` y `FixedServiceDTO` al `import type` de `@ledgerly/shared`, y `FixedServiceDoc` al de `../db/models.js`. Después de `toManualAssetDTO`:

```ts
export function toFixedServiceDTO(doc: HydratedDocument<FixedServiceDoc>): FixedServiceDTO {
  return {
    id: doc._id.toString(),
    nombre: doc.nombre,
    monto: doc.monto,
    cadencia: doc.cadencia as FixedServiceCadencia,
    desde: doc.desde,
    hasta: doc.hasta ?? null,
    montoDesde: doc.montoDesde,
  };
}
```

- [ ] **Step 5: Implementar el router**

Crear `server/src/http/routes/fixedServices.ts`:

```ts
import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { fixedServiceCreateSchema, fixedServiceUpdateSchema, type FixedServiceDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { FixedServiceModel } from "../../db/models.js";
import { toFixedServiceDTO } from "../mappers.js";

export const fixedServicesRouter = Router();

const INVALID_SERVICE = "Servicio inválido";
const SERVICE_NOT_FOUND = "Servicio no encontrado";

const currentMonth = (): string => new Date().toISOString().slice(0, 7);

const isActive = ({ hasta }: FixedServiceDTO, mes: string): boolean => hasta === null || hasta >= mes;

const byActiveThenName = (mes: string) => (a: FixedServiceDTO, b: FixedServiceDTO): number =>
  Number(isActive(b, mes)) - Number(isActive(a, mes)) || a.nombre.localeCompare(b.nombre);

const findService = async (id: string) => {
  const doc = isValidObjectId(id) ? await FixedServiceModel.findById(id) : null;
  if (!doc) throw new HttpError(404, SERVICE_NOT_FOUND);
  return doc;
};

fixedServicesRouter.get("/", asyncHandler(async (_req, res) => {
  const docs = await FixedServiceModel.find();
  res.json(docs.map(toFixedServiceDTO).sort(byActiveThenName(currentMonth())));
}));

fixedServicesRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = fixedServiceCreateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_SERVICE);
  const mes = currentMonth();
  const { nombre, monto, cadencia = "mensual", desde = mes } = parsed.data;
  const doc = await FixedServiceModel.create({ nombre, monto, cadencia, desde, hasta: null, montoDesde: mes });
  res.status(201).json(toFixedServiceDTO(doc));
}));

fixedServicesRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = fixedServiceUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, INVALID_SERVICE);
  const doc = await findService(req.params.id);
  const actual = toFixedServiceDTO(doc);
  const { nombre, monto, cadencia, desde = actual.desde, hasta = actual.hasta } = parsed.data;
  if (hasta !== null && hasta < desde) throw new HttpError(400, INVALID_SERVICE);
  if (nombre !== undefined) doc.nombre = nombre;
  if (cadencia !== undefined) doc.cadencia = cadencia;
  if (monto !== undefined && monto !== actual.monto) {
    doc.monto = monto;
    doc.montoDesde = currentMonth();
  }
  doc.desde = desde;
  doc.hasta = hasta;
  await doc.save();
  res.json(toFixedServiceDTO(doc));
}));

fixedServicesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const doc = await findService(req.params.id);
  await doc.deleteOne();
  res.status(204).end();
}));
```

Ojo: en la desestructuración, `hasta = actual.hasta` aplica el default solo si `hasta` es `undefined`, así que un `null` explícito se respeta.

- [ ] **Step 6: Montar el router**

En `server/src/http/app.ts`, agregar `import { fixedServicesRouter } from "./routes/fixedServices.js";` junto a los otros imports, y después de `app.use("/api/budgets", budgetsRouter);`:

```ts
  app.use("/api/fixed-services", fixedServicesRouter);
```

- [ ] **Step 7: Correr los tests y el typecheck**

Run: `bunx vitest run server/src/http/routes/fixedServices.test.ts && bun run typecheck`
Expected: PASS. Si falla «un documento viejo… se lee con los defaults», hay que revisar que el GET use `find()` sin `.lean()`, porque los documentos hidratados aplican los defaults del schema.

- [ ] **Step 8: Commit**

```bash
git add server/src/db/models.ts server/src/http/mappers.ts server/src/http/routes/fixedServices.ts server/src/http/routes/fixedServices.test.ts server/src/http/app.ts
git commit -m "feat(server): CRUD de servicios fuera de la tarjeta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/db/models.ts server/src/http/mappers.ts server/src/http/routes/fixedServices.ts server/src/http/routes/fixedServices.test.ts server/src/http/app.ts
git push
```

---

### Task 3: Emisor en las suscripciones y lectura compartida

**Files:**
- Modify: `shared/src/dtos.ts` (`subscriptionDtoSchema`)
- Modify: `server/src/stats/subscriptions.ts` (`subscriptionOf`, `summarizeSubscriptions`)
- Create: `server/src/http/loadSubscriptions.ts`
- Modify: `server/src/http/routes/subscriptions.ts` (GET `/`)
- Test: `server/src/stats/subscriptions.test.ts`, `server/src/http/routes/subscriptions.test.ts`, `shared/src/dtos.test.ts`, `client/src/subscriptions.test.ts`, `client/src/pages/SubscriptionsPage.test.tsx`

**Interfaces:**
- Produces:
  - `SubscriptionDTO.issuer: Issuer`;
  - `isCounted(item: Pick<SubscriptionDTO, "estado" | "oculta">): boolean` en `server/src/stats/subscriptions.ts`;
  - `loadSubscriptionInputs(hoy: string): Promise<SubscriptionInputs>`, con `SubscriptionInputs = { txs: SubscriptionTx[]; ctx: Omit<SubscriptionContext, "cotizacion"> }`, en `server/src/http/loadSubscriptions.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

En `server/src/stats/subscriptions.test.ts`:
- en el `toEqual` de «detecta 3 meses seguidos con el mismo monto», agregar `issuer: "visa_signature",` después de `cardLabel`;
- en el helper `item` de `describe("summarizeSubscriptions")`, agregar `issuer: "icbc",` después de `cardLabel`;
- agregar `isCounted` al import de `./subscriptions.js` y este test dentro de `describe("summarizeSubscriptions")`:

```ts
  it("isCounted cuenta solo las activas que no están ocultas", () => {
    expect(isCounted({ estado: "activa", oculta: false })).toBe(true);
    expect(isCounted({ estado: "activa", oculta: true })).toBe(false);
    expect(isCounted({ estado: "cortada", oculta: false })).toBe(false);
  });
```

En `server/src/http/routes/subscriptions.test.ts`, dentro del `describe` del GET:

```ts
  it("cada suscripción trae el emisor de su tarjeta", async () => {
    await seedVisa(streamflixAndNoise());
    const report = subscriptionsReportDtoSchema.parse((await request(app).get("/api/subscriptions")).body);
    expect(report.items.length).toBeGreaterThan(0);
    expect(new Set(report.items.map((item) => item.issuer))).toEqual(new Set(["visa_signature"]));
  });
```

Agregar `issuer` a los fixtures de `SubscriptionDTO`, con el emisor que corresponde a su `cardLabel` («Visa Signature…» → `"visa_signature"`, «ICBC» → `"icbc"`):
- `shared/src/dtos.test.ts`: `const subscription = { … cardLabel: "ICBC", issuer: "icbc", … }`;
- `client/src/subscriptions.test.ts`: en `item`, `issuer: "icbc",`;
- `client/src/pages/SubscriptionsPage.test.tsx`: `streamflix` con `issuer: "visa_signature"`. Cada fixture que hace spread de `streamflix` y cambia `cardLabel` a `"ICBC"` (como `musicapp`) también pasa `issuer: "icbc"`.

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts server/src/http/routes/subscriptions.test.ts`
Expected: FAIL. Falta `issuer` en el resultado y no existe `isCounted`.

- [ ] **Step 3: Implementar el DTO y la detección**

En `shared/src/dtos.ts`, en `subscriptionDtoSchema`, después de `cardLabel: z.string(),`:

```ts
  issuer: issuerSchema,
```

En `server/src/stats/subscriptions.ts`, en el objeto que devuelve `subscriptionOf`, después de `cardLabel: last.cardLabel,`:

```ts
    issuer: last.issuer,
```

Y antes de `summarizeSubscriptions`:

```ts
export const isCounted = ({ estado, oculta }: Pick<SubscriptionDTO, "estado" | "oculta">): boolean =>
  estado === "activa" && !oculta;
```

Dentro de `summarizeSubscriptions`, la primera línea pasa a ser:

```ts
  const counted = items.filter(isCounted);
```

- [ ] **Step 4: Extraer la lectura**

Crear `server/src/http/loadSubscriptions.ts`:

```ts
import type { Currency, Direction, Issuer, TxType } from "@ledgerly/shared";
import {
  HiddenSubscriptionModel, ManualSubscriptionModel, StatementModel, SubscriptionCadenceModel, TransactionModel,
} from "../db/models.js";
import { latestClosingByIssuer, type SubscriptionContext, type SubscriptionTx } from "../stats/subscriptions.js";

export interface SubscriptionInputs {
  txs: SubscriptionTx[];
  ctx: Omit<SubscriptionContext, "cotizacion">;
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export async function loadSubscriptionInputs(hoy: string): Promise<SubscriptionInputs> {
  const [transactions, statements, hidden, manual, cadences] = await Promise.all([
    TransactionModel.find({ isInstallment: false, type: { $in: ["purchase", "refund"] } }).lean(),
    StatementModel.find({}, { issuer: 1, closingDate: 1 }).lean(),
    HiddenSubscriptionModel.find().lean(),
    ManualSubscriptionModel.find().lean(),
    SubscriptionCadenceModel.find(),
  ]);
  const txs: SubscriptionTx[] = transactions.map((t) => ({
    date: isoDay(t.date),
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
  return {
    txs,
    ctx: {
      hoy,
      ultimoCierre: latestClosingByIssuer(statements.map((s) => ({ issuer: s.issuer, closingDate: s.closingDate ?? null }))),
      ocultas: new Set(hidden.map((h) => h.key)),
      manuales: new Set(manual.map((m) => m.key)),
      cobrosMarcados: new Map(manual.map(({ key, cobros = [] }) => [
        key,
        cobros.map(({ date, amount, currency }) => ({ date, amount, currency: currency as Currency })),
      ])),
      cadencias: new Map(cadences.map(({ key, cadencia }) => [key, cadencia])),
    },
  };
}
```

En `server/src/http/routes/subscriptions.ts`, el GET `/` pasa a ser:

```ts
subscriptionsRouter.get("/", asyncHandler(async (_req, res) => {
  const hoy = isoDay(new Date());
  const [{ txs, ctx }, cotizacion] = await Promise.all([loadSubscriptionInputs(hoy), fetchOficialRate(hoy)]);
  const items = detectSubscriptions(txs, { ...ctx, cotizacion });
  const report: SubscriptionsReportDTO = { cotizacionOficial: cotizacion, ...summarizeSubscriptions(items), items };
  res.json(report);
}));
```

Agregar `import { loadSubscriptionInputs } from "../loadSubscriptions.js";`. Sacar los imports que quedan sin uso: `Currency`, `Direction`, `Issuer` y `TxType` de `@ledgerly/shared`; `StatementModel` de los modelos; `latestClosingByIssuer` y `SubscriptionTx` de las stats. Los routers de abajo siguen usando `TransactionModel`, `HiddenSubscriptionModel`, `ManualSubscriptionModel` y `SubscriptionCadenceModel`.

- [ ] **Step 5: Correr los tests y el typecheck**

Run: `bunx vitest run server/src/stats/subscriptions.test.ts server/src/http/routes/subscriptions.test.ts shared/src/dtos.test.ts client/src/subscriptions.test.ts client/src/pages/SubscriptionsPage.test.tsx && bun run typecheck`
Expected: PASS y typecheck sin errores. Si el typecheck marca un fixture de `SubscriptionDTO` sin `issuer`, agregarlo con la regla del Step 1.

- [ ] **Step 6: Commit**

```bash
FILES=(shared/src/dtos.ts shared/src/dtos.test.ts server/src/stats/subscriptions.ts server/src/stats/subscriptions.test.ts server/src/http/loadSubscriptions.ts server/src/http/routes/subscriptions.ts server/src/http/routes/subscriptions.test.ts client/src/subscriptions.test.ts client/src/pages/SubscriptionsPage.test.tsx)
git add "${FILES[@]}"
git commit -m "refactor(server): suscripciones con emisor y lectura compartida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "${FILES[@]}"
git push
```

---

### Task 4: Servicios en el cálculo del flujo

**Files:**
- Modify: `shared/src/dtos.ts` (`cashFlowMonthSchema`)
- Modify: `server/src/stats/cashFlow.ts`
- Test: `server/src/stats/cashFlow.test.ts`; fixtures de `CashFlowMonthDTO` en `shared/src/dtos.test.ts`, `client/src/cashFlow.test.ts`, `client/src/components/CashFlowDetailSection.test.tsx`, `client/src/components/CashFlowDetail.test.tsx`, `client/src/components/charts/cashFlowChart.test.tsx` y `client/src/pages/CashFlowPage.test.tsx`

**Interfaces:**
- Consumes: `MESES_SERVICIO`, `FixedServiceCadencia` (Task 1).
- Produces:
  - `CashFlowMonthDTO.servicios: number`;
  - `CashFlowService = { monto: number; cadencia: FixedServiceCadencia; desde: string; hasta: string | null; montoDesde: string }`;
  - `CashFlowInput.services?: CashFlowService[]`;
  - `servicePays(service: CashFlowService, mes: string): boolean`;
  - `projectServiceAmount(service: CashFlowService, mes: string, aumentoMensual: number): number`;
  - `estimadoServicios(aumentoMensual: number): string`.

- [ ] **Step 1: Escribir los tests que fallan**

En `server/src/stats/cashFlow.test.ts`:
- agregar `estimadoServicios`, `projectServiceAmount`, `servicePays` y `type CashFlowService` al import de `./cashFlow.js`;
- en el `toEqual` de «arma el mes completo del ejemplo», agregar `servicios: 0,` después de `auto: 150_000,`;
- agregar al final:

```ts
const servicio = (overrides: Partial<CashFlowService> = {}): CashFlowService => ({
  monto: 30_000, cadencia: "mensual", desde: "2026-09", hasta: null, montoDesde: "2026-09", ...overrides,
});

describe("servicePays", () => {
  it("un mensual paga todos los meses desde desde hasta hasta", () => {
    const luz = servicio({ hasta: "2026-11" });
    expect(["2026-08", "2026-09", "2026-11", "2026-12"].map((mes) => servicePays(luz, mes))).toEqual([false, true, true, false]);
  });

  it("un bimestral paga cada 2 meses a partir de desde", () => {
    const gas = servicio({ cadencia: "bimestral", desde: "2026-10" });
    expect(["2026-10", "2026-11", "2026-12", "2027-01", "2027-02"].map((mes) => servicePays(gas, mes)))
      .toEqual([true, false, true, false, true]);
  });
});

describe("projectServiceAmount", () => {
  it("suma el aumento mensual desde montoDesde", () => {
    expect(projectServiceAmount(servicio(), "2026-11", 0.02)).toBeCloseTo(30_000 * 1.02 ** 2, 6);
  });

  it("antes de montoDesde va el monto plano", () => {
    expect(projectServiceAmount(servicio({ montoDesde: "2026-11" }), "2026-10", 0.02)).toBe(30_000);
  });
});

describe("buildCashFlow: servicios", () => {
  const sinServicios = buildCashFlow(ejemplo());

  it("en los meses cerrados resta el monto plano desde desde y el mes sigue completo", () => {
    const flow = buildCashFlow({ ...ejemplo(), services: [servicio()] });
    const septiembre = mesDe(sinServicios, "2026-09");
    expect(mesDe(flow, "2026-08")).toMatchObject({ servicios: 0, egresos: mesDe(sinServicios, "2026-08")?.egresos });
    expect(mesDe(flow, "2026-09")).toMatchObject({
      estado: "completo",
      servicios: 30_000,
      egresos: (septiembre?.egresos ?? 0) + 30_000,
      margen: (septiembre?.margen ?? 0) - 30_000,
      faltantes: [],
    });
  });

  it("en un mes cerrado incompleto suma los servicios sin agregar faltantes", () => {
    const base = ejemplo();
    const flow = buildCashFlow({ ...base, payslips: [payslip("2026-08-31", 1_050_000)], services: [servicio()] });
    expect(mesDe(flow, "2026-09")).toMatchObject({ estado: "incompleto", servicios: 30_000, faltantes: [FALTA_RECIBO] });
  });

  it("en los proyectados suma la inflación esperada desde montoDesde y lo anota", () => {
    const flow = buildCashFlow({
      ...ejemplo(), services: [servicio()], inflacion: { publicada: [], esperadaMensual: 0.02 },
    });
    expect(mesDe(flow, "2026-09")?.servicios).toBe(30_000);
    expect(mesDe(flow, "2026-10")?.servicios).toBeCloseTo(30_000 * 1.02, 6);
    expect(mesDe(flow, "2026-11")?.servicios).toBeCloseTo(30_000 * 1.02 ** 2, 6);
    expect(mesDe(flow, "2026-10")?.estimados.at(-1)).toBe("Servicios (último monto +2,0% por mes)");
  });

  it("sin inflación va el monto plano y la nota no lleva porcentaje", () => {
    const flow = buildCashFlow({ ...ejemplo(), services: [servicio()] });
    const noviembre = mesDe(sinServicios, "2026-11");
    expect(mesDe(flow, "2026-11")).toMatchObject({
      servicios: 30_000,
      egresos: (noviembre?.egresos ?? 0) + 30_000,
      margen: (noviembre?.margen ?? 0) - 30_000,
    });
    expect(mesDe(flow, "2026-11")?.estimados.at(-1)).toBe(estimadoServicios(0));
    expect(estimadoServicios(0)).toBe("Servicios (último monto)");
  });

  it("un bimestral solo resta y se anota en sus meses", () => {
    const flow = buildCashFlow({ ...ejemplo(), services: [servicio({ cadencia: "bimestral", desde: "2026-10", montoDesde: "2026-10" })] });
    expect(["2026-10", "2026-11", "2026-12"].map((mes) => mesDe(flow, mes)?.servicios)).toEqual([30_000, 0, 30_000]);
    expect(mesDe(flow, "2026-11")?.estimados).not.toContain(estimadoServicios(0));
  });

  it("deja de restar después de hasta", () => {
    const flow = buildCashFlow({ ...ejemplo(), services: [servicio({ hasta: "2026-11" })] });
    expect(mesDe(flow, "2026-11")?.servicios).toBe(30_000);
    expect(mesDe(flow, "2026-12")?.servicios).toBe(0);
  });
});
```

En los fixtures de `CashFlowMonthDTO`, agregar `servicios: 0,` después de `auto`:
- `shared/src/dtos.test.ts`: `cashFlowMonth`;
- `client/src/cashFlow.test.ts` y `client/src/components/CashFlowDetailSection.test.tsx`: `month`;
- `client/src/components/CashFlowDetail.test.tsx`: `completo`;
- `client/src/components/charts/cashFlowChart.test.tsx`: `mes`;
- `client/src/pages/CashFlowPage.test.tsx`: `base`.

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run server/src/stats/cashFlow.test.ts`
Expected: FAIL, porque `servicePays` y los demás no existen.

- [ ] **Step 3: Implementar**

En `shared/src/dtos.ts`, en `cashFlowMonthSchema`, después de `auto: z.number(),`:

```ts
  servicios: z.number(),
```

En `server/src/stats/cashFlow.ts`:

El primer import pasa a ser:

```ts
import { MESES_SERVICIO, type CashFlowDTO, type CashFlowMonthDTO, type FixedServiceCadencia, type PayslipTipo } from "@ledgerly/shared";
```

Después de `estimadoAuto`:

```ts
export const estimadoServicios = (aumentoMensual: number): string => `Servicios (último monto${detalleAumento(aumentoMensual)})`;
```

Después de `CashFlowPlan`:

```ts
export interface CashFlowService {
  monto: number;
  cadencia: FixedServiceCadencia;
  desde: string;
  hasta: string | null;
  montoDesde: string;
}
```

En `CashFlowInput`, después de `inflacion?: SalaryInflation;`:

```ts
  services?: CashFlowService[];
```

En `FlowContext`, después de `inflacion: SalaryInflation | null;`:

```ts
  services: CashFlowService[];
```

Después de `projectPlanPayment`:

```ts
export function servicePays({ cadencia, desde, hasta }: CashFlowService, mes: string): boolean {
  if (mes < desde || (hasta !== null && mes > hasta)) return false;
  return monthsBetween(desde, mes) % MESES_SERVICIO[cadencia] === 0;
}

export function projectServiceAmount({ monto, montoDesde }: CashFlowService, mes: string, aumentoMensual: number): number {
  return monto * (1 + aumentoMensual) ** Math.max(0, monthsBetween(montoDesde, mes));
}
```

Antes de `closedMonth`:

```ts
const servicesDue = (ctx: FlowContext, mes: string): CashFlowService[] =>
  ctx.services.filter((service) => servicePays(service, mes));

const expectedInflation = ({ inflacion }: FlowContext): number => inflacion?.esperadaMensual ?? 0;
```

En `closedMonth`, reemplazar la línea de `egresos` por:

```ts
  const servicios = sum(servicesDue(ctx, mes).map((service) => service.monto));
  const egresos = tarjetas + hipoteca.monto + auto.monto + servicios;
```

y agregar `servicios,` en el objeto que devuelve, después de `auto: auto.monto,`.

En `projectedMonth`, reemplazar la línea de `egresos` por:

```ts
  const aumentoServicios = expectedInflation(ctx);
  const servicios = sum(servicesDue(ctx, mes).map((service) => projectServiceAmount(service, mes, aumentoServicios)));
  const egresos = tarjetas + hipoteca.monto + auto.monto + servicios;
```

agregar `servicios,` en el objeto que devuelve, después de `auto: auto.monto,`, y como último elemento de `estimados`:

```ts
      ...onlyIf(servicios > 0, estimadoServicios(aumentoServicios)),
```

En `buildCashFlow`, dentro de `ctx`, después de `inflacion: input.inflacion ?? null,`:

```ts
    services: input.services ?? [],
```

- [ ] **Step 4: Correr los tests y el typecheck**

Run: `bunx vitest run server/src/stats/cashFlow.test.ts shared/src/dtos.test.ts client/src/cashFlow.test.ts client/src/components/CashFlowDetailSection.test.tsx client/src/components/CashFlowDetail.test.tsx client/src/components/charts/cashFlowChart.test.tsx client/src/pages/CashFlowPage.test.tsx && bun run typecheck`
Expected: PASS y typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
FILES=(shared/src/dtos.ts shared/src/dtos.test.ts server/src/stats/cashFlow.ts server/src/stats/cashFlow.test.ts client/src/cashFlow.test.ts client/src/components/CashFlowDetailSection.test.tsx client/src/components/CashFlowDetail.test.tsx client/src/components/charts/cashFlowChart.test.tsx client/src/pages/CashFlowPage.test.tsx)
git add "${FILES[@]}"
git commit -m "feat(server): el flujo resta los servicios cargados a mano

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "${FILES[@]}"
git push
```

---

### Task 5: Suscripciones de tarjeta en los meses estimados

**Files:**
- Modify: `server/src/stats/cashFlow.ts`
- Test: `server/src/stats/cashFlow.test.ts`

**Interfaces:**
- Consumes: `MESES_CADENCIA` de `server/src/stats/subscriptions.ts`; `addMonthsClamped` y `addDays` de `months.ts`; `DIAS_CIERRE_A_VENCIMIENTO` de `statementDueDate.ts`.
- Produces:
  - `CashFlowCard.closingDate: string`;
  - `CashFlowSubscription = { issuer: string; moneda: Currency; monto: number; cadencia: Cadencia; proximoCobro: string }`;
  - `CashFlowInput.subscriptions?: CashFlowSubscription[]`;
  - `subscriptionPaymentMonths(card: Pick<CashFlowCard, "baseMonth" | "closingDate">, subscription: Pick<CashFlowSubscription, "proximoCobro" | "cadencia">, ultimoMes: string): string[]`;
  - `estimadoTarjetaConSuscripciones(cardLabel: string): string`.

- [ ] **Step 1: Escribir los tests que fallan**

En `server/src/stats/cashFlow.test.ts`:
- agregar `estimadoTarjetaConSuscripciones`, `subscriptionPaymentMonths` y `type CashFlowSubscription` al import de `./cashFlow.js`;
- agregar `closingDate` a las tarjetas que ya existen:
  - en `ejemplo()`, Visa con `closingDate: "2026-10-02"` e ICBC con `closingDate: "2026-08-27"`;
  - en `describe("installmentFloor")`, la `card` con `closingDate: "2026-10-02"`;
  - en el primer test de `toCashFlowCard`, el `toEqual` con `closingDate: "2026-10-02"`;
- agregar al `describe("toCashFlowCard")`:

```ts
  it("sin cierre toma el vencimiento menos 12 días", () => {
    expect(toCashFlowCard(statement({ closingDate: null, dueDate: "2026-10-13" }), [])?.closingDate).toBe("2026-10-01");
  });
```

- agregar al final:

```ts
const visaCard = { baseMonth: "2026-10", closingDate: "2026-10-02" };

const suscripcion = (overrides: Partial<CashFlowSubscription> = {}): CashFlowSubscription => ({
  issuer: "visa_signature", moneda: "ARS", monto: 5_000, cadencia: "mensual", proximoCobro: "2026-10-09", ...overrides,
});

describe("subscriptionPaymentMonths", () => {
  it("un cobro mensual va al resumen que cierra después y se paga en su vencimiento", () => {
    expect(subscriptionPaymentMonths(visaCard, suscripcion(), "2027-03"))
      .toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
  });

  it("saltea el cobro con fecha anterior o igual al último cierre", () => {
    expect(subscriptionPaymentMonths(visaCard, suscripcion({ proximoCobro: "2026-09-28" }), "2027-03"))
      .toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
  });

  it("un cobro posterior al cierre del mes siguiente se paga un mes después", () => {
    expect(subscriptionPaymentMonths(visaCard, suscripcion({ proximoCobro: "2026-11-03" }), "2027-03"))
      .toEqual(["2026-12", "2027-01", "2027-02", "2027-03"]);
  });

  it("un anual cae solo en el mes en que se paga", () => {
    expect(subscriptionPaymentMonths(visaCard, suscripcion({ cadencia: "anual", proximoCobro: "2027-01-15" }), "2027-03"))
      .toEqual(["2027-02"]);
  });

  it("un bimestral cae cada 2 meses", () => {
    expect(subscriptionPaymentMonths(visaCard, suscripcion({ cadencia: "bimestral", proximoCobro: "2026-10-20" }), "2027-03"))
      .toEqual(["2026-11", "2027-01", "2027-03"]);
  });

  it("con un próximo cobro muy viejo arranca después del cierre, uno por mes", () => {
    expect(subscriptionPaymentMonths(visaCard, suscripcion({ proximoCobro: "2025-01-09" }), "2027-03"))
      .toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
  });
});

describe("buildCashFlow: suscripciones", () => {
  const sinSuscripciones = buildCashFlow(ejemplo());
  const tarjetasDe = (flow: CashFlowDTO, mes: string): number => mesDe(flow, mes)?.tarjetas ?? 0;

  it("suma la suscripción a la tarjeta estimada y cambia la nota", () => {
    const flow = buildCashFlow({ ...ejemplo(), subscriptions: [suscripcion()] });
    expect(tarjetasDe(flow, "2026-11")).toBe(tarjetasDe(sinSuscripciones, "2026-11") + 5_000);
    expect(mesDe(flow, "2026-11")?.egresos).toBe((mesDe(sinSuscripciones, "2026-11")?.egresos ?? 0) + 5_000);
    expect(mesDe(flow, "2026-11")?.estimados).toContain(estimadoTarjetaConSuscripciones("Visa Signature"));
    expect(mesDe(flow, "2026-11")?.estimados).not.toContain(estimadoTarjeta("Visa Signature"));
    expect(mesDe(flow, "2026-11")?.estimados).toContain(estimadoTarjeta("ICBC"));
    expect(estimadoTarjetaConSuscripciones("Visa Signature")).toBe("Visa Signature (cuotas y suscripciones)");
  });

  it("no toca el mes que ya tiene el resumen real de esa tarjeta", () => {
    const flow = buildCashFlow({ ...ejemplo(), subscriptions: [suscripcion()] });
    expect(mesDe(flow, "2026-10")).toEqual(mesDe(sinSuscripciones, "2026-10"));
  });

  it("en el mes en curso suma a la tarjeta que todavía no tiene resumen", () => {
    const flow = buildCashFlow({ ...ejemplo(), subscriptions: [suscripcion({ issuer: "icbc", proximoCobro: "2026-09-12" })] });
    expect(tarjetasDe(flow, "2026-10")).toBe(tarjetasDe(sinSuscripciones, "2026-10") + 5_000);
    expect(mesDe(flow, "2026-10")?.estimados).toContain(estimadoTarjetaConSuscripciones("ICBC"));
  });

  it("no suma una suscripción a la tarjeta de otro emisor ni a un emisor sin tarjeta", () => {
    const flow = buildCashFlow({ ...ejemplo(), subscriptions: [suscripcion({ issuer: "otra" })] });
    expect(flow).toEqual(sinSuscripciones);
  });

  it("no toca los meses cerrados", () => {
    const flow = buildCashFlow({ ...ejemplo(), subscriptions: [suscripcion({ proximoCobro: "2026-08-09" })] });
    expect(mesDe(flow, "2026-09")).toEqual(mesDe(sinSuscripciones, "2026-09"));
  });

  it("pasa los dólares a pesos con la cotización de hoy", () => {
    const flow = buildCashFlow({ ...ejemplo(), subscriptions: [suscripcion({ moneda: "USD", monto: 10 })] });
    expect(tarjetasDe(flow, "2026-11")).toBe(tarjetasDe(sinSuscripciones, "2026-11") + 10 * 1_450);
  });

  it("sin cotización no suma los dólares y lista el faltante una sola vez", () => {
    const base = { ...ejemplo(), usdRates: [] };
    const flow = buildCashFlow({
      ...base,
      subscriptions: [suscripcion({ moneda: "USD", monto: 10 }), suscripcion({ moneda: "USD", monto: 7 }), suscripcion()],
    });
    expect(tarjetasDe(flow, "2026-11")).toBe(tarjetasDe(buildCashFlow(base), "2026-11") + 5_000);
    expect(mesDe(flow, "2026-11")?.faltantes).toEqual([FALTA_COTIZACION]);
  });
});
```

`CashFlowDTO` ya está importado en este archivo.

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run server/src/stats/cashFlow.test.ts`
Expected: FAIL, porque `subscriptionPaymentMonths` no existe y `CashFlowCard` no acepta `closingDate`.

- [ ] **Step 3: Implementar**

En `server/src/stats/cashFlow.ts`, los imports pasan a ser:

```ts
import {
  MESES_SERVICIO,
  type Cadencia, type CashFlowDTO, type CashFlowMonthDTO, type Currency, type FixedServiceCadencia, type PayslipTipo,
} from "@ledgerly/shared";
import { addDays, addMonths, addMonthsClamped, monthOf, monthRange, monthsBetween } from "./months.js";
import { rateOnDate, type RatePoint } from "./rateOnDate.js";
import { raiseFactor, raisesBetween, type SalaryInflation, type SalaryRaise } from "./salaryRaise.js";
import { DIAS_CIERRE_A_VENCIMIENTO, statementDueDate } from "./statementDueDate.js";
import { MESES_CADENCIA } from "./subscriptions.js";
```

Después de `estimadoTarjeta`:

```ts
export const estimadoTarjetaConSuscripciones = (cardLabel: string): string => `${cardLabel} (cuotas y suscripciones)`;
```

En `CashFlowCard`, después de `baseMonth: string;`:

```ts
  closingDate: string;
```

Después de `CashFlowService`:

```ts
export interface CashFlowSubscription {
  issuer: string;
  moneda: Currency;
  monto: number;
  cadencia: Cadencia;
  proximoCobro: string;
}
```

En `CashFlowInput`, después de `services?: CashFlowService[];`:

```ts
  subscriptions?: CashFlowSubscription[];
```

`toCashFlowCard` pasa a ser:

```ts
export function toCashFlowCard(statement: CashFlowStatement, txs: InstallmentTxInput[]): CashFlowCard | null {
  const dueDate = statementDueDate(statement);
  if (!dueDate) return null;
  const closingDate = statement.closingDate ?? addDays(dueDate, -DIAS_CIERRE_A_VENCIMIENTO);
  const installments = txs
    .map((tx) => ({ amount: tx.amount, remaining: remainingOf(tx) }))
    .filter((installment) => installment.remaining > 0);
  return { issuer: statement.issuer, cardLabel: statement.cardLabel, baseMonth: monthOf(dueDate), closingDate, installments };
}
```

Después de `projectServiceAmount`:

```ts
const statementOffset = (closingDate: string, cobro: string): number => {
  let offset = 1;
  while (addMonthsClamped(closingDate, offset) < cobro) offset += 1;
  return offset;
};

export function subscriptionPaymentMonths(
  card: Pick<CashFlowCard, "baseMonth" | "closingDate">,
  { proximoCobro, cadencia }: Pick<CashFlowSubscription, "proximoCobro" | "cadencia">,
  ultimoMes: string,
): string[] {
  const cobro = (index: number): string => addMonthsClamped(proximoCobro, index * MESES_CADENCIA[cadencia]);
  const mesDePago = (index: number): string => addMonths(card.baseMonth, statementOffset(card.closingDate, cobro(index)));
  let index = 0;
  while (cobro(index) <= card.closingDate) index += 1;
  const meses: string[] = [];
  for (let mes = mesDePago(index); mes <= ultimoMes; mes = mesDePago(index)) {
    meses.push(mes);
    index += 1;
  }
  return meses;
}
```

Junto a las otras interfaces internas (después de `ClosedPlanMonth`):

```ts
interface SubscriptionCharge {
  issuer: string;
  mes: string;
  moneda: Currency;
  monto: number;
}

interface EstimatedCard {
  cardLabel: string;
  monto: number;
  conSuscripciones: boolean;
  sinCotizacion: boolean;
}
```

En `FlowContext`, después de `services: CashFlowService[];`:

```ts
  charges: SubscriptionCharge[];
  cotizacionHoy: number | null;
```

Antes de `projectedMonth`:

```ts
function subscriptionCharges(cards: CashFlowCard[], subscriptions: CashFlowSubscription[], ultimoMes: string): SubscriptionCharge[] {
  return cards.flatMap((card) => subscriptions
    .filter((subscription) => subscription.issuer === card.issuer)
    .flatMap((subscription) => subscriptionPaymentMonths(card, subscription, ultimoMes)
      .map((mes) => ({ issuer: card.issuer, mes, moneda: subscription.moneda, monto: subscription.monto }))));
}

const chargeArs = ({ moneda, monto }: SubscriptionCharge, cotizacion: number | null): number | null => {
  if (moneda === "ARS") return monto;
  return cotizacion === null ? null : monto * cotizacion;
};

function estimatedCard(ctx: FlowContext, { cardLabel, card }: CardTrack, mes: string): EstimatedCard {
  if (!card) return { cardLabel, monto: 0, conSuscripciones: false, sinCotizacion: false };
  const montos = ctx.charges
    .filter((charge) => charge.issuer === card.issuer && charge.mes === mes)
    .map((charge) => chargeArs(charge, ctx.cotizacionHoy));
  const convertidos = montos.filter((monto): monto is number => monto !== null);
  return {
    cardLabel,
    monto: installmentFloor(card, mes) + sum(convertidos),
    conSuscripciones: montos.length > 0,
    sinCotizacion: convertidos.length < montos.length,
  };
}

const estimatedCardNote = ({ cardLabel, conSuscripciones }: EstimatedCard): string =>
  (conSuscripciones ? estimadoTarjetaConSuscripciones(cardLabel) : estimadoTarjeta(cardLabel));
```

En `projectedMonth`, reemplazar las líneas de `estimadas`, `pisos` y `tarjetas` por:

```ts
  const estimadas = tracks
    .filter((trackMonth) => trackMonth.totals.length === 0)
    .map(({ track }) => estimatedCard(ctx, track, mes));
  const tarjetas = sum(reales.map((total) => total.monto)) + sum(estimadas.map((estimada) => estimada.monto));
  const sinCotizacion = reales.some((total) => total.sinCotizacion) || estimadas.some((estimada) => estimada.sinCotizacion);
```

En el objeto que devuelve `projectedMonth`, `faltantes` pasa a ser `onlyIf(sinCotizacion, FALTA_COTIZACION)` y, en `estimados`, la línea de las tarjetas pasa a ser `...estimadas.map(estimatedCardNote),`.

En `buildCashFlow`, antes de `const ctx`:

```ts
  const ultimoMes = addMonths(mesActual, (input.horizon ?? HORIZONTE_MESES) - 1);
```

dentro de `ctx`, después de `services: input.services ?? [],`:

```ts
    charges: subscriptionCharges(input.cards, input.subscriptions ?? [], ultimoMes),
    cotizacionHoy: rateOnDate(input.today, input.usdRates),
```

y `proyeccion` pasa a ser `monthRange(mesActual, ultimoMes)`.

- [ ] **Step 4: Correr los tests y el typecheck**

Run: `bunx vitest run server/src/stats/cashFlow.test.ts server/src/http/routes/cashFlow.test.ts && bun run typecheck`
Expected: PASS. La ruta sigue pasando porque todavía no manda suscripciones.

- [ ] **Step 5: Commit**

```bash
git add server/src/stats/cashFlow.ts server/src/stats/cashFlow.test.ts
git commit -m "feat(server): la proyección suma las suscripciones de cada tarjeta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/stats/cashFlow.ts server/src/stats/cashFlow.test.ts
git push
```

---

### Task 6: La ruta del flujo lee servicios y suscripciones

**Files:**
- Modify: `server/src/http/routes/cashFlow.ts`
- Test: `server/src/http/routes/cashFlow.test.ts`

**Interfaces:**
- Consumes:
  - `FixedServiceModel` (Task 2);
  - `loadSubscriptionInputs` e `isCounted` (Task 3);
  - `CashFlowService` (Task 4);
  - `CashFlowSubscription` (Task 5);
  - `detectSubscriptions` de `stats/subscriptions.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

En `server/src/http/routes/cashFlow.test.ts`:
- sumar `FixedServiceModel` y `HiddenSubscriptionModel` al import de `../../db/models.js`;
- agregar `import { merchantKey } from "../../stats/merchantKey.js";`;
- hacer que `seed` devuelva los resúmenes: al final de `seed`, agregar `return statements;`;
- agregar dentro de `describe("GET /api/cash-flow")`:

```ts
  const suscripcionVisa = async (statementId: unknown) => {
    await TransactionModel.insertMany(["2026-07-20", "2026-08-20", "2026-09-20"].map((fecha, index) => ({
      statementId, issuer: "visa_signature", cardLabel: "Visa Signature", date: new Date(fecha),
      descriptionRaw: "STREAMBOX", merchant: "STREAMBOX", category: "Suscripciones", categorySource: "rule",
      amount: 5_000, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
      installmentCurrent: null, installmentTotal: null, comprobante: null, fingerprint: `streambox-${index}`,
    })));
  };

  it("resta los servicios cargados, con defaults para los documentos viejos", async () => {
    await seed();
    await FixedServiceModel.create({
      nombre: "Luz", monto: 30_000, cadencia: "mensual", desde: "2026-09", hasta: null, montoDesde: "2026-09",
    });
    await FixedServiceModel.collection.insertOne({ nombre: "Gas", monto: 10_000, desde: "2026-10" });
    const flow = cashFlowDtoSchema.parse((await request(app).get("/api/cash-flow")).body);
    expect(mesDe(flow, "2026-08")?.servicios).toBe(0);
    expect(mesDe(flow, "2026-09")).toMatchObject({ servicios: 30_000, egresos: 958_000, margen: 142_000 });
    expect(mesDe(flow, "2026-10")?.servicios).toBe(40_000);
    expect(mesDe(flow, "2026-11")?.servicios).toBe(40_000);
    expect(mesDe(flow, "2026-11")?.estimados).toContain("Servicios (último monto)");
  });

  it("suma las suscripciones activas de la tarjeta en los meses estimados", async () => {
    const statements = await seed();
    await suscripcionVisa(statements[2]._id);
    const flow = cashFlowDtoSchema.parse((await request(app).get("/api/cash-flow")).body);
    expect(mesDe(flow, "2026-10")?.tarjetas).toBe(500_000);
    expect(mesDe(flow, "2026-11")?.tarjetas).toBe(35_000);
    expect(mesDe(flow, "2026-12")?.tarjetas).toBe(35_000);
    expect(mesDe(flow, "2027-01")?.tarjetas).toBe(5_000);
    expect(mesDe(flow, "2026-11")?.estimados).toContain("Visa Signature (cuotas y suscripciones)");
  });

  it("no suma una suscripción oculta", async () => {
    const statements = await seed();
    await suscripcionVisa(statements[2]._id);
    await HiddenSubscriptionModel.create({ key: merchantKey("STREAMBOX") });
    const flow = cashFlowDtoSchema.parse((await request(app).get("/api/cash-flow")).body);
    expect(mesDe(flow, "2026-11")?.tarjetas).toBe(30_000);
    expect(mesDe(flow, "2026-11")?.estimados).toContain("Visa Signature (solo cuotas)");
  });
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run server/src/http/routes/cashFlow.test.ts`
Expected: FAIL: `servicios` da 0 y las tarjetas no suman la suscripción.

- [ ] **Step 3: Implementar**

En `server/src/http/routes/cashFlow.ts`:
- sumar `FixedServiceModel` al import de `../../db/models.js`;
- agregar `import type { SubscriptionDTO } from "@ledgerly/shared";`, `import { loadSubscriptionInputs } from "../loadSubscriptions.js";` e `import { detectSubscriptions, isCounted } from "../../stats/subscriptions.js";`;
- sumar `type CashFlowService` y `type CashFlowSubscription` al import de `../../stats/cashFlow.js`.

Después de `interface InstallmentRow`:

```ts
interface FixedServiceRow {
  monto: number;
  cadencia?: string | null;
  desde: string;
  hasta?: string | null;
  montoDesde?: string | null;
}
```

Después de `toInstallmentTx`:

```ts
const toFlowService = ({ monto, cadencia, desde, hasta, montoDesde }: FixedServiceRow): CashFlowService => ({
  monto,
  cadencia: cadencia === "bimestral" ? "bimestral" : "mensual",
  desde,
  hasta: hasta ?? null,
  montoDesde: montoDesde ?? desde,
});

const toFlowSubscription = ({ issuer, moneda, montoActual, cadencia, proximoCobro }: SubscriptionDTO): CashFlowSubscription =>
  ({ issuer, moneda, monto: montoActual, cadencia, proximoCobro });
```

En el handler, sumar dos lecturas al final del `Promise.all` y sus nombres al destructuring:

```ts
  const [
    payslips, statements, mortgageCoupons, autoCoupons, usdPoints, uvaPoints, inflationRows, lastRem, fixedServices, subscriptionInputs,
  ] = await Promise.all([
    PayslipModel.find().lean(),
    StatementModel.find().lean(),
    MortgageCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    AutoCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    MacroSeriesModel.find({ serie: "usd_oficial" }).sort({ fecha: 1 }).lean(),
    MacroSeriesModel.find({ serie: "uva" }).sort({ fecha: 1 }).lean(),
    InflationRateModel.find().lean(),
    MacroSeriesModel.findOne({ serie: "rem_12m" }).sort({ fecha: -1 }).lean(),
    FixedServiceModel.find().lean(),
    loadSubscriptionInputs(today),
  ]);
```

Antes de `res.json(buildCashFlow({`:

```ts
  const subscriptions = detectSubscriptions(subscriptionInputs.txs, { ...subscriptionInputs.ctx, cotizacion: null })
    .filter(isCounted)
    .map(toFlowSubscription);
```

Y dentro de `buildCashFlow({ … })`, después de `inflacion: …,`:

```ts
    services: fixedServices.map(toFlowService),
    subscriptions,
```

- [ ] **Step 4: Correr los tests y el typecheck**

Run: `bunx vitest run server/src/http/routes/cashFlow.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/http/routes/cashFlow.ts server/src/http/routes/cashFlow.test.ts
git commit -m "feat(server): el flujo lee los servicios y las suscripciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/http/routes/cashFlow.ts server/src/http/routes/cashFlow.test.ts
git push
```

---

### Task 7: Hooks y lógica pura de servicios en el cliente

**Files:**
- Modify: `client/src/api/hooks.ts`
- Create: `client/src/fixedServices.ts`
- Test: `client/src/api/hooks.test.tsx`, `client/src/fixedServices.test.ts`

**Interfaces:**
- Consumes: `FixedServiceDTO`, `FixedServiceCreateDTO`, `FixedServiceUpdateDTO`, `FixedServiceCadencia`, `MESES_SERVICIO`, `isoMonthSchema` (Task 1).
- Produces:
  - Hooks: `useFixedServices()` (queryKey `["fixed-services"]`), `useCreateFixedService()` (`mutate(body: FixedServiceCreateDTO)`), `useUpdateFixedService()` (`mutate({ id, body: FixedServiceUpdateDTO })`), `useDeleteFixedService()` (`mutate(id: string)`).
  - De `client/src/fixedServices.ts`:
    - constantes: `SERVICE_NAME_MAX_LENGTH = 60`, `FIXED_SERVICE_CADENCIAS`, `CADENCIA_SERVICIO_LABEL`, `SERVICE_LIST_LABEL`, `SERVICE_MONTH_LABEL`;
    - tipos: `FixedServiceVariant = "activos" | "deBaja"`, `FixedServiceListProps`, `FixedServiceDraft`, `FixedServiceRequest`, `FixedServiceSections`;
    - funciones: `isFixedServiceCadencia`, `monthlyEquivalent`, `isActiveService`, `fixedServiceSections`, `monthlyTotal`, `serviceMonth`, `fixedServiceDraftFrom`, `fixedServiceRequest`.

- [ ] **Step 1: Escribir los tests que fallan**

En `client/src/api/hooks.test.tsx`, sumar `useCreateFixedService`, `useDeleteFixedService` y `useUpdateFixedService` al import de `./hooks.js`, y agregar dentro de `describe("hooks de las features nuevas")`:

```ts
  const LUZ = { id: "f1", nombre: "Luz", monto: 30000, cadencia: "mensual", desde: "2026-10", hasta: null, montoDesde: "2026-10" };

  it("useCreateFixedService manda el alta por POST e invalida los servicios y el flujo", async () => {
    vi.stubGlobal("fetch", respond(201, LUZ));
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateFixedService(), { wrapper: wrapperFor(client) });
    await act(() => result.current.mutateAsync({ nombre: "Luz", monto: 30000 }));
    expect(calledUrls()).toEqual(["POST /api/fixed-services"]);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ nombre: "Luz", monto: 30000 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["fixed-services"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cash-flow"] });
  });

  it("useUpdateFixedService manda la edición por PATCH e invalida los servicios y el flujo", async () => {
    vi.stubGlobal("fetch", respond(200, LUZ));
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateFixedService(), { wrapper: wrapperFor(client) });
    await act(() => result.current.mutateAsync({ id: "f1", body: { hasta: "2026-11" } }));
    expect(calledUrls()).toEqual(["PATCH /api/fixed-services/f1"]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["fixed-services"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cash-flow"] });
  });

  it("useDeleteFixedService borra por DELETE e invalida los servicios y el flujo", async () => {
    vi.stubGlobal("fetch", respond(204));
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteFixedService(), { wrapper: wrapperFor(client) });
    await act(() => result.current.mutateAsync("f1"));
    expect(calledUrls()).toEqual(["DELETE /api/fixed-services/f1"]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["fixed-services"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cash-flow"] });
  });
```

Crear `client/src/fixedServices.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { FixedServiceDTO } from "@ledgerly/shared";
import {
  fixedServiceDraftFrom, fixedServiceRequest, fixedServiceSections, isActiveService, monthlyEquivalent, monthlyTotal,
  serviceMonth, type FixedServiceDraft,
} from "./fixedServices.js";

const MES = "2026-10";

const servicio = (overrides: Partial<FixedServiceDTO> = {}): FixedServiceDTO => ({
  id: "f-luz", nombre: "Luz", monto: 30_000, cadencia: "mensual", desde: "2026-09", hasta: null, montoDesde: "2026-09",
  ...overrides,
});

const draft = (overrides: Partial<FixedServiceDraft> = {}): FixedServiceDraft => ({
  nombre: "Internet", monto: "25.000", cadencia: "mensual", desde: MES, hasta: "", ...overrides,
});

describe("monthlyEquivalent y monthlyTotal", () => {
  it("un bimestral cuenta la mitad por mes", () => {
    expect(monthlyEquivalent({ monto: 18_000, cadencia: "bimestral" })).toBe(9_000);
    expect(monthlyTotal([servicio(), servicio({ id: "f-gas", monto: 18_000, cadencia: "bimestral" })])).toBe(39_000);
  });
});

describe("isActiveService y fixedServiceSections", () => {
  it("está activo sin hasta o con hasta desde el mes actual", () => {
    expect(isActiveService({ hasta: null }, MES)).toBe(true);
    expect(isActiveService({ hasta: MES }, MES)).toBe(true);
    expect(isActiveService({ hasta: "2026-09" }, MES)).toBe(false);
  });

  it("separa activos y dados de baja", () => {
    const cable = servicio({ id: "f-cable", nombre: "Cable", hasta: "2026-08" });
    expect(fixedServiceSections([servicio(), cable], MES)).toEqual({ activos: [servicio()], deBaja: [cable] });
  });
});

describe("serviceMonth", () => {
  it("los activos muestran desde y los dados de baja, hasta", () => {
    expect(serviceMonth("activos", servicio({ hasta: "2026-12" }))).toBe("2026-09");
    expect(serviceMonth("deBaja", servicio({ hasta: "2026-08" }))).toBe("2026-08");
  });
});

describe("fixedServiceDraftFrom", () => {
  it("un servicio nuevo arranca vacío, mensual y desde el mes actual", () => {
    expect(fixedServiceDraftFrom(null, MES)).toEqual({ nombre: "", monto: "", cadencia: "mensual", desde: MES, hasta: "" });
  });

  it("uno existente trae el monto en formato argentino", () => {
    expect(fixedServiceDraftFrom(servicio({ hasta: "2026-12" }), MES))
      .toEqual({ nombre: "Luz", monto: "30.000", cadencia: "mensual", desde: "2026-09", hasta: "2026-12" });
  });
});

describe("fixedServiceRequest", () => {
  it("arma el alta con el monto tipeado", () => {
    expect(fixedServiceRequest(draft({ cadencia: "bimestral", desde: "2026-11" }), null)).toEqual({
      kind: "create", body: { nombre: "Internet", monto: 25_000, cadencia: "bimestral", desde: "2026-11" },
    });
  });

  it("entiende decimales en formato argentino", () => {
    expect(fixedServiceRequest(draft({ monto: "12.345,50" }), null)).toMatchObject({ body: { monto: 12_345.5 } });
  });

  it.each([
    ["sin nombre", { nombre: "  " }],
    ["sin monto", { monto: "" }],
    ["con monto 0", { monto: "0" }],
    ["con un mes inválido", { desde: "2026-13" }],
    ["con hasta antes de desde", { desde: "2026-11", hasta: "2026-10" }],
  ])("no arma nada %s", (_label, overrides) => {
    expect(fixedServiceRequest(draft(overrides), null)).toBeNull();
  });

  it("al editar manda solo lo que cambió", () => {
    const luz = servicio();
    expect(fixedServiceRequest(fixedServiceDraftFrom(luz, MES), luz)).toBeNull();
    expect(fixedServiceRequest({ ...fixedServiceDraftFrom(luz, MES), monto: "36.000" }, luz))
      .toEqual({ kind: "update", id: "f-luz", body: { monto: 36_000 } });
    expect(fixedServiceRequest({ ...fixedServiceDraftFrom(luz, MES), hasta: "2026-10" }, luz))
      .toEqual({ kind: "update", id: "f-luz", body: { hasta: "2026-10" } });
  });

  it("vaciar hasta reactiva el servicio", () => {
    const cable = servicio({ hasta: "2026-08" });
    expect(fixedServiceRequest({ ...fixedServiceDraftFrom(cable, MES), hasta: "" }, cable))
      .toEqual({ kind: "update", id: "f-luz", body: { hasta: null } });
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run client/src/api/hooks.test.tsx client/src/fixedServices.test.ts`
Expected: FAIL, porque los hooks y el módulo no existen.

- [ ] **Step 3: Implementar los hooks**

En `client/src/api/hooks.ts`:
- sumar `FixedServiceCreateDTO`, `FixedServiceDTO` y `FixedServiceUpdateDTO` al `import type` de `@ledgerly/shared`;
- sumar `type QueryClient` al import de `@tanstack/react-query`;
- después de `useDeleteAssetValuation`, agregar:

```ts
const invalidateFixedServices = (qc: QueryClient) => Promise.all([
  qc.invalidateQueries({ queryKey: ["fixed-services"] }),
  qc.invalidateQueries({ queryKey: ["cash-flow"] }),
]);

export function useFixedServices() {
  return useQuery({ queryKey: ["fixed-services"], queryFn: () => apiFetch<FixedServiceDTO[]>("/fixed-services") });
}

export function useCreateFixedService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FixedServiceCreateDTO) =>
      apiFetch<FixedServiceDTO>("/fixed-services", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => invalidateFixedServices(qc),
  });
}

export function useUpdateFixedService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: FixedServiceUpdateDTO }) =>
      apiFetch<FixedServiceDTO>(`/fixed-services/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => invalidateFixedServices(qc),
  });
}

export function useDeleteFixedService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/fixed-services/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateFixedServices(qc),
  });
}
```

- [ ] **Step 4: Implementar la lógica pura**

Crear `client/src/fixedServices.ts`:

```ts
import {
  MESES_SERVICIO, isoMonthSchema,
  type FixedServiceCadencia, type FixedServiceCreateDTO, type FixedServiceDTO, type FixedServiceUpdateDTO,
} from "@ledgerly/shared";
import { formatMoneyInput, parseMoneyInput } from "./moneyInput.js";

export type FixedServiceVariant = "activos" | "deBaja";

export interface FixedServiceListProps {
  items: FixedServiceDTO[];
  variant: FixedServiceVariant;
  onEdit: (id: string) => void;
}

export interface FixedServiceDraft {
  nombre: string;
  monto: string;
  cadencia: FixedServiceCadencia;
  desde: string;
  hasta: string;
}

export type FixedServiceRequest =
  | { kind: "create"; body: FixedServiceCreateDTO }
  | { kind: "update"; id: string; body: FixedServiceUpdateDTO };

export interface FixedServiceSections {
  activos: FixedServiceDTO[];
  deBaja: FixedServiceDTO[];
}

export const SERVICE_NAME_MAX_LENGTH = 60;

export const FIXED_SERVICE_CADENCIAS: FixedServiceCadencia[] = ["mensual", "bimestral"];

export const CADENCIA_SERVICIO_LABEL: Record<FixedServiceCadencia, string> = { mensual: "Mensual", bimestral: "Bimestral" };

export const SERVICE_LIST_LABEL: Record<FixedServiceVariant, string> = {
  activos: "Servicios activos",
  deBaja: "Servicios dados de baja",
};

export const SERVICE_MONTH_LABEL: Record<FixedServiceVariant, string> = { activos: "Desde", deBaja: "Hasta" };

export const isFixedServiceCadencia = (value: unknown): value is FixedServiceCadencia =>
  FIXED_SERVICE_CADENCIAS.some((cadencia) => cadencia === value);

export const monthlyEquivalent = ({ monto, cadencia }: Pick<FixedServiceDTO, "monto" | "cadencia">): number =>
  monto / MESES_SERVICIO[cadencia];

export const monthlyTotal = (services: FixedServiceDTO[]): number =>
  services.reduce((total, service) => total + monthlyEquivalent(service), 0);

export const isActiveService = ({ hasta }: Pick<FixedServiceDTO, "hasta">, mesActual: string): boolean =>
  hasta === null || hasta >= mesActual;

export const fixedServiceSections = (services: FixedServiceDTO[], mesActual: string): FixedServiceSections => ({
  activos: services.filter((service) => isActiveService(service, mesActual)),
  deBaja: services.filter((service) => !isActiveService(service, mesActual)),
});

export const serviceMonth = (variant: FixedServiceVariant, { desde, hasta }: Pick<FixedServiceDTO, "desde" | "hasta">): string =>
  (variant === "deBaja" && hasta !== null ? hasta : desde);

export function fixedServiceDraftFrom(service: FixedServiceDTO | null, mesActual: string): FixedServiceDraft {
  if (!service) return { nombre: "", monto: "", cadencia: "mensual", desde: mesActual, hasta: "" };
  return {
    nombre: service.nombre,
    monto: formatMoneyInput(service.monto),
    cadencia: service.cadencia,
    desde: service.desde,
    hasta: service.hasta ?? "",
  };
}

const isValidName = (nombre: string): boolean => nombre !== "" && nombre.length <= SERVICE_NAME_MAX_LENGTH;

const isMonth = (mes: string): boolean => isoMonthSchema.safeParse(mes).success;

const isValidRange = ({ desde, hasta }: FixedServiceDraft): boolean =>
  isMonth(desde) && (hasta === "" || (isMonth(hasta) && hasta >= desde));

const updateBody = (draft: FixedServiceDraft, service: FixedServiceDTO, nombre: string, monto: number): FixedServiceUpdateDTO => {
  const hasta = draft.hasta === "" ? null : draft.hasta;
  return {
    ...(nombre !== service.nombre ? { nombre } : {}),
    ...(monto !== service.monto ? { monto } : {}),
    ...(draft.cadencia !== service.cadencia ? { cadencia: draft.cadencia } : {}),
    ...(draft.desde !== service.desde ? { desde: draft.desde } : {}),
    ...(hasta !== service.hasta ? { hasta } : {}),
  };
};

export function fixedServiceRequest(draft: FixedServiceDraft, service: FixedServiceDTO | null): FixedServiceRequest | null {
  const nombre = draft.nombre.trim();
  const monto = parseMoneyInput(draft.monto);
  if (!isValidName(nombre) || monto === null || monto <= 0 || !isValidRange(draft)) return null;
  if (!service) return { kind: "create", body: { nombre, monto, cadencia: draft.cadencia, desde: draft.desde } };
  const body = updateBody(draft, service, nombre, monto);
  return Object.keys(body).length > 0 ? { kind: "update", id: service.id, body } : null;
}
```

- [ ] **Step 5: Correr los tests y el typecheck**

Run: `bunx vitest run client/src/api/hooks.test.tsx client/src/fixedServices.test.ts && bun run typecheck`
Expected: PASS. Si «entiende decimales en formato argentino» falla, revisar `parseMoneyInput` en `client/src/moneyInput.ts` antes de tocar el test: el editor de Patrimonio usa la misma función.

- [ ] **Step 6: Commit**

```bash
FILES=(client/src/api/hooks.ts client/src/api/hooks.test.tsx client/src/fixedServices.ts client/src/fixedServices.test.ts)
git add "${FILES[@]}"
git commit -m "feat(client): hooks y reglas de los servicios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "${FILES[@]}"
git push
```

---

### Task 8: Página Servicios

**Files:**
- Create: `client/src/components/useFixedServiceForm.ts`
- Create: `client/src/components/useFixedServiceEditor.ts`
- Create: `client/src/components/FixedServiceEditor.tsx`
- Create: `client/src/components/FixedServicesTable.tsx`
- Create: `client/src/components/FixedServiceCards.tsx`
- Create: `client/src/components/FixedServiceKpiCards.tsx`
- Create: `client/src/pages/FixedServicesPage.tsx`
- Modify: `client/src/components/layout/navItems.ts`, `client/src/App.tsx`
- Test:
  - Create: `client/src/pages/FixedServicesPage.test.tsx`
  - Modify: `client/src/components/layout/navItems.test.ts`, `client/src/components/layout/MoreSheet.test.tsx`, `client/src/App.test.tsx`

**Interfaces:**
- Consumes: los hooks y helpers de la Task 7; `ResponsiveSheet` (`{ open, onClose, title, children }`), `ConfirmDialog` (`{ open, title, message, confirmLabel, onConfirm, onClose }`), `RecordCard` (`{ title, action?, highlights, details }`), `Kpi` y `KpiGrid` (`cardCount: 3 | 4`).
- Produces: la ruta `/servicios` y el componente `FixedServicesPage`.

- [ ] **Step 1: Escribir los tests que fallan**

Actualizar los tests del menú:
- `client/src/components/layout/navItems.test.ts`:
  - el grupo del día a día pasa a ser `["Sueldo", "Vencimientos", "Flujo", "Suscripciones", "Servicios", "Movimientos"]`;
  - en `MORE_GROUPS`, el primer grupo pasa a ser `["Sueldo", "Vencimientos", "Flujo", "Suscripciones", "Servicios"]`;
  - `MORE_ITEMS` pasa a ser `["Sueldo", "Vencimientos", "Flujo", "Suscripciones", "Servicios", "Auto", "Créditos", "Patrimonio", "Contexto", "Reglas"]`, y el título del test se actualiza igual;
  - en `isMoreRoute`, sumar `"/servicios"` a la lista de rutas.
- `client/src/components/layout/MoreSheet.test.tsx`: la misma lista de `MORE_ITEMS`, en el `toEqual` y en el título del test.
- `client/src/App.test.tsx`: sumar `{ path: "/servicios", title: "Servicios" }` a `NEW_SECTIONS`.

Crear `client/src/pages/FixedServicesPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { FixedServicesPage } from "./FixedServicesPage.js";

interface StubReply {
  status: number;
  body?: unknown;
}

const TODAY = "2026-10-14";
const INVALID = "Servicio inválido";

const luz: FixedServiceDTO = {
  id: "f-luz", nombre: "Luz", monto: 30_000, cadencia: "mensual", desde: "2026-09", hasta: null, montoDesde: "2026-09",
};
const gas: FixedServiceDTO = {
  id: "f-gas", nombre: "Gas", monto: 18_000, cadencia: "bimestral", desde: "2026-10", hasta: null, montoDesde: "2026-10",
};
const cable: FixedServiceDTO = {
  id: "f-cable", nombre: "Cable", monto: 15_000, cadencia: "mensual", desde: "2026-01", hasta: "2026-08", montoDesde: "2026-01",
};

const money = (value: number): string => formatMoney(value, "ARS").replace(/\s/g, " ");

let listReply: StubReply;
let mutationReply: StubReply;

const respond = ({ status, body }: StubReply): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  listReply = { status: 200, body: [luz, gas, cable] };
  mutationReply = { status: 200, body: luz };
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return respond(listReply);
    if (method === "DELETE") return respond({ status: 204 });
    return respond(mutationReply);
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const requests = (method: string) => vi.mocked(fetch).mock.calls
  .filter(([, init]) => init?.method === method)
  .map(([url, init]) => ({ url: String(url), body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined }));

const renderPage = () => renderWithProviders(<FixedServicesPage />, { route: "/servicios" });

const editar = async (nombre: string) => {
  await userEvent.click(await screen.findByRole("button", { name: `editar ${nombre}` }));
  return screen.getByRole("dialog", { name: "Editar servicio" });
};

describe("FixedServicesPage", () => {
  it("muestra los activos con su equivalente mensual y los dados de baja aparte", async () => {
    renderPage();
    const activos = await screen.findByRole("table", { name: "Servicios activos" });
    const gasRow = within(activos).getByRole("row", { name: /Gas/ });
    expect(within(gasRow).getByText("Bimestral")).toBeInTheDocument();
    expect(within(gasRow).getByText(money(9_000))).toBeInTheDocument();
    expect(within(activos).getByRole("row", { name: /Luz/ })).toBeInTheDocument();
    expect(within(activos).queryByText("Cable")).not.toBeInTheDocument();
    const deBaja = screen.getByRole("table", { name: "Servicios dados de baja" });
    expect(within(deBaja).getByRole("columnheader", { name: "Hasta" })).toBeInTheDocument();
    expect(within(deBaja).getByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.getByText("Por año")).toBeInTheDocument();
  });

  it("sin servicios muestra el estado vacío y deja agregar uno", async () => {
    listReply = { status: 200, body: [] };
    renderPage();
    expect(await screen.findByText(/Todavía no cargaste servicios/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Agregar servicio" }));
    expect(screen.getByRole("dialog", { name: "Nuevo servicio" })).toBeInTheDocument();
  });

  it("si falla la carga lo dice debajo del título", async () => {
    listReply = { status: 500, body: { error: "Error interno" } };
    renderPage();
    expect(await screen.findByText("No pudimos cargar los servicios.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Servicios" })).toBeInTheDocument();
  });

  it("Agregar servicio manda el alta con el monto en formato argentino", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Servicios activos" });
    await userEvent.click(screen.getByRole("button", { name: "Agregar servicio" }));
    const sheet = screen.getByRole("dialog", { name: "Nuevo servicio" });
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Nombre" }), "Internet");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Monto en pesos" }), "25.000");
    await userEvent.click(within(sheet).getByRole("button", { name: "Bimestral" }));
    fireEvent.change(within(sheet).getByLabelText("Desde"), { target: { value: "2026-11" } });
    expect(within(sheet).queryByLabelText("Hasta")).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("POST")).toEqual([{
      url: "/api/fixed-services",
      body: { nombre: "Internet", monto: 25_000, cadencia: "bimestral", desde: "2026-11" },
    }]));
  });

  it("editar el monto manda solo el monto", async () => {
    renderPage();
    const sheet = await editar("Luz");
    const monto = within(sheet).getByRole("textbox", { name: "Monto en pesos" });
    expect(monto).toHaveValue("30.000");
    await userEvent.clear(monto);
    await userEvent.type(monto, "36.000");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("PATCH")).toEqual([{ url: "/api/fixed-services/f-luz", body: { monto: 36_000 } }]));
  });

  it("completar Hasta da de baja el servicio", async () => {
    renderPage();
    const sheet = await editar("Luz");
    fireEvent.change(within(sheet).getByLabelText("Hasta"), { target: { value: "2026-10" } });
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(requests("PATCH")).toEqual([{ url: "/api/fixed-services/f-luz", body: { hasta: "2026-10" } }]));
  });

  it("si el server rechaza la edición muestra el error y el editor queda abierto", async () => {
    mutationReply = { status: 400, body: { error: INVALID } };
    renderPage();
    const sheet = await editar("Luz");
    fireEvent.change(within(sheet).getByLabelText("Hasta"), { target: { value: "2026-10" } });
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(await within(sheet).findByText(INVALID)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Editar servicio" })).toBeInTheDocument();
  });

  it("Borrar pide confirmación y borra el servicio", async () => {
    renderPage();
    const sheet = await editar("Luz");
    await userEvent.click(within(sheet).getByRole("button", { name: "Borrar" }));
    const confirm = await screen.findByRole("dialog", { name: "Borrar servicio" });
    expect(confirm).toHaveTextContent("¿Borrar «Luz»? Se saca también de los meses pasados del Flujo.");
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(requests("DELETE")).toEqual([{ url: "/api/fixed-services/f-luz", body: undefined }]));
  });
});

describe("FixedServicesPage en mobile", () => {
  beforeEach(() => emulateMobile());

  it("muestra los servicios como tarjetas y deja editarlos", async () => {
    renderPage();
    const gasCard = await screen.findByRole("article", { name: "Gas" });
    expect(within(gasCard).getByText(money(9_000))).toBeInTheDocument();
    await userEvent.click(within(gasCard).getByRole("button", { name: "editar Gas" }));
    expect(screen.getByRole("dialog", { name: "Editar servicio" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run client/src/pages/FixedServicesPage.test.tsx client/src/components/layout/navItems.test.ts client/src/components/layout/MoreSheet.test.tsx client/src/App.test.tsx`
Expected: FAIL, porque `FixedServicesPage` no existe y el menú no tiene «Servicios».

- [ ] **Step 3: El hook del formulario**

Crear `client/src/components/useFixedServiceForm.ts`:

```ts
import { useMemo, useState } from "react";
import type { FixedServiceCadencia, FixedServiceDTO } from "@ledgerly/shared";
import {
  fixedServiceDraftFrom, fixedServiceRequest, type FixedServiceDraft, type FixedServiceRequest,
} from "../fixedServices.js";

export interface FixedServiceFormState {
  draft: FixedServiceDraft;
  setNombre: (nombre: string) => void;
  setMonto: (monto: string) => void;
  setCadencia: (cadencia: FixedServiceCadencia) => void;
  setDesde: (desde: string) => void;
  setHasta: (hasta: string) => void;
  request: FixedServiceRequest | null;
}

export const useFixedServiceForm = (service: FixedServiceDTO | null, mesActual: string): FixedServiceFormState => {
  const [draft, setDraft] = useState<FixedServiceDraft>(() => fixedServiceDraftFrom(service, mesActual));
  const request = useMemo(() => fixedServiceRequest(draft, service), [draft, service]);

  const setField = <Field extends keyof FixedServiceDraft>(field: Field) => (value: FixedServiceDraft[Field]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  return {
    draft,
    setNombre: setField("nombre"),
    setMonto: setField("monto"),
    setCadencia: setField("cadencia"),
    setDesde: setField("desde"),
    setHasta: setField("hasta"),
    request,
  };
};
```

- [ ] **Step 4: El hook del editor**

Crear `client/src/components/useFixedServiceEditor.ts`:

```ts
import { useCallback, useMemo, useState } from "react";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { useCreateFixedService, useDeleteFixedService, useUpdateFixedService } from "../api/hooks.js";
import type { FixedServiceRequest } from "../fixedServices.js";

export interface FixedServiceEditorState {
  open: boolean;
  service: FixedServiceDTO | null;
  error: string | null;
  saving: boolean;
  pendingDelete: FixedServiceDTO | null;
  openNew: () => void;
  openEdit: (serviceId: string) => void;
  close: () => void;
  save: (request: FixedServiceRequest) => void;
  askDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

const findService = (services: FixedServiceDTO[], id: string | null): FixedServiceDTO | null =>
  (id === null ? null : services.find((service) => service.id === id) ?? null);

export const useFixedServiceEditor = (services: FixedServiceDTO[]): FixedServiceEditorState => {
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { mutate: createService, reset: resetCreate, isPending: creating, error: createError } = useCreateFixedService();
  const { mutate: updateService, reset: resetUpdate, isPending: updating, error: updateError } = useUpdateFixedService();
  const { mutate: deleteService } = useDeleteFixedService();

  const service = useMemo(() => findService(services, serviceId), [services, serviceId]);
  const pendingDelete = useMemo(() => findService(services, pendingDeleteId), [services, pendingDeleteId]);
  const error = (createError ?? updateError)?.message ?? null;

  const openWith = useCallback((id: string | null) => {
    resetCreate();
    resetUpdate();
    setServiceId(id);
    setOpen(true);
  }, [resetCreate, resetUpdate]);

  const openNew = useCallback(() => openWith(null), [openWith]);
  const openEdit = useCallback((id: string) => openWith(id), [openWith]);
  const close = useCallback(() => setOpen(false), []);

  const save = useCallback((request: FixedServiceRequest) => {
    if (request.kind === "create") {
      createService(request.body, { onSuccess: close });
      return;
    }
    updateService({ id: request.id, body: request.body }, { onSuccess: close });
  }, [createService, updateService, close]);

  const askDelete = useCallback(() => {
    setOpen(false);
    setPendingDeleteId(serviceId);
  }, [serviceId]);

  const cancelDelete = useCallback(() => setPendingDeleteId(null), []);

  const confirmDelete = useCallback(() => {
    if (pendingDeleteId !== null) deleteService(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, deleteService]);

  return {
    open, service, error, saving: creating || updating, pendingDelete,
    openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete,
  };
};
```

- [ ] **Step 5: El editor**

Crear `client/src/components/FixedServiceEditor.tsx`:

```tsx
import type { ChangeEvent, MouseEvent } from "react";
import { Alert, Box, Button, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { FixedServiceCadencia, FixedServiceDTO } from "@ledgerly/shared";
import {
  CADENCIA_SERVICIO_LABEL, FIXED_SERVICE_CADENCIAS, SERVICE_NAME_MAX_LENGTH, isFixedServiceCadencia,
  type FixedServiceRequest,
} from "../fixedServices.js";
import { ResponsiveSheet } from "./ResponsiveSheet.js";
import { tapTargetSx } from "./tapTarget.js";
import { useFixedServiceForm } from "./useFixedServiceForm.js";

interface FixedServiceEditorProps {
  open: boolean;
  service: FixedServiceDTO | null;
  mesActual: string;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (request: FixedServiceRequest) => void;
  onDelete: () => void;
}

type FixedServiceFormProps = Omit<FixedServiceEditorProps, "open" | "onClose">;

const DESDE_HELPER: Record<FixedServiceCadencia, string> = {
  mensual: "El primer mes que se resta en el Flujo",
  bimestral: "El primer mes en que lo pagás",
};
const HASTA_HELPER = "Dejá vacío mientras lo sigas pagando";
const DELETE_HELPER = "Lo saca también de los meses pasados. Para dejar de pagarlo, completá Hasta.";
const MONTH_SLOT_PROPS = { inputLabel: { shrink: true } };

const cadenceButtons = FIXED_SERVICE_CADENCIAS.map((cadencia) => (
  <ToggleButton key={cadencia} value={cadencia} sx={tapTargetSx}>{CADENCIA_SERVICIO_LABEL[cadencia]}</ToggleButton>
));

const FixedServiceForm = ({ service, mesActual, error, saving, onSave, onDelete }: FixedServiceFormProps) => {
  const { draft, setNombre, setMonto, setCadencia, setDesde, setHasta, request } = useFixedServiceForm(service, mesActual);
  const editing = service !== null;

  const changeNombre = (event: ChangeEvent<HTMLInputElement>) => setNombre(event.target.value);
  const changeMonto = (event: ChangeEvent<HTMLInputElement>) => setMonto(event.target.value);
  const changeCadencia = (_event: MouseEvent<HTMLElement>, value: unknown) => {
    if (isFixedServiceCadencia(value)) setCadencia(value);
  };
  const changeDesde = (event: ChangeEvent<HTMLInputElement>) => setDesde(event.target.value);
  const changeHasta = (event: ChangeEvent<HTMLInputElement>) => setHasta(event.target.value);
  const save = () => {
    if (request) onSave(request);
  };

  const hastaField = editing && (
    <TextField
      type="month"
      label="Hasta"
      value={draft.hasta}
      onChange={changeHasta}
      fullWidth
      helperText={HASTA_HELPER}
      slotProps={MONTH_SLOT_PROPS}
    />
  );
  const errorAlert = error && <Alert severity="error">{error}</Alert>;
  const deleteButton = editing && <Button fullWidth color="error" onClick={onDelete} sx={tapTargetSx}>Borrar</Button>;
  const deleteHint = editing && <Typography variant="caption" color="text.secondary">{DELETE_HELPER}</Typography>;

  return (
    <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
      <TextField
        label="Nombre"
        value={draft.nombre}
        onChange={changeNombre}
        fullWidth
        slotProps={{ htmlInput: { maxLength: SERVICE_NAME_MAX_LENGTH } }}
      />
      <TextField
        label="Monto en pesos"
        value={draft.monto}
        onChange={changeMonto}
        fullWidth
        slotProps={{ htmlInput: { inputMode: "decimal" } }}
      />
      <ToggleButtonGroup exclusive fullWidth aria-label="cadencia" value={draft.cadencia} onChange={changeCadencia}>
        {cadenceButtons}
      </ToggleButtonGroup>
      <TextField
        type="month"
        label="Desde"
        value={draft.desde}
        onChange={changeDesde}
        fullWidth
        helperText={DESDE_HELPER[draft.cadencia]}
        slotProps={MONTH_SLOT_PROPS}
      />
      {hastaField}
      {errorAlert}
      <Box sx={{ display: "flex", gap: 1 }}>
        {deleteButton}
        <Button fullWidth variant="contained" disabled={!request || saving} onClick={save} sx={tapTargetSx}>
          Guardar
        </Button>
      </Box>
      {deleteHint}
    </Box>
  );
};

export const FixedServiceEditor = ({ open, service, mesActual, error, saving, onClose, onSave, onDelete }: FixedServiceEditorProps) => {
  const title = service ? "Editar servicio" : "Nuevo servicio";

  return (
    <ResponsiveSheet open={open} onClose={onClose} title={title}>
      <FixedServiceForm
        key={service?.id ?? "nuevo"}
        service={service}
        mesActual={mesActual}
        error={error}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
      />
    </ResponsiveSheet>
  );
};
```

- [ ] **Step 6: La tabla y las tarjetas**

Crear `client/src/components/FixedServicesTable.tsx`:

```tsx
import { IconButton, Table, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { formatMoney, formatMonthLabel } from "../format.js";
import {
  CADENCIA_SERVICIO_LABEL, SERVICE_LIST_LABEL, SERVICE_MONTH_LABEL, monthlyEquivalent, serviceMonth,
  type FixedServiceListProps, type FixedServiceVariant,
} from "../fixedServices.js";
import { MotionTableBody, MotionTableRow } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";
import { iconTapTargetSx } from "./tapTarget.js";

interface FixedServiceRowProps {
  item: FixedServiceDTO;
  variant: FixedServiceVariant;
  onEdit: (id: string) => void;
}

const NO_WRAP = { whiteSpace: "nowrap" } as const;

const CONTAINER_SX: Record<FixedServiceVariant, SxProps<Theme>> = {
  activos: { overflowX: "auto" },
  deBaja: { overflowX: "auto", opacity: 0.7 },
};

const money = (value: number): string => formatMoney(value, "ARS");

const FixedServiceRow = ({ item: { id, nombre, monto, cadencia, desde, hasta }, variant, onEdit }: FixedServiceRowProps) => {
  const mes = formatMonthLabel(serviceMonth(variant, { desde, hasta }));
  const porMes = money(monthlyEquivalent({ monto, cadencia }));
  const edit = () => onEdit(id);

  return (
    <MotionTableRow variants={fadeUpItem}>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{nombre}</Typography>
      </TableCell>
      <TableCell align="right" sx={NO_WRAP}>{money(monto)}</TableCell>
      <TableCell>{CADENCIA_SERVICIO_LABEL[cadencia]}</TableCell>
      <TableCell sx={NO_WRAP}>{mes}</TableCell>
      <TableCell align="right" sx={NO_WRAP}>{porMes}</TableCell>
      <TableCell align="right">
        <IconButton aria-label={`editar ${nombre}`} onClick={edit} sx={iconTapTargetSx}>
          <EditOutlinedIcon />
        </IconButton>
      </TableCell>
    </MotionTableRow>
  );
};

export const FixedServicesTable = ({ items, variant, onEdit }: FixedServiceListProps) => {
  const rows = items.map((item) => <FixedServiceRow key={item.id} item={item} variant={variant} onEdit={onEdit} />);

  return (
    <TableContainer sx={CONTAINER_SX[variant]}>
      <Table size="small" aria-label={SERVICE_LIST_LABEL[variant]}>
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell align="right">Monto</TableCell>
            <TableCell>Cadencia</TableCell>
            <TableCell>{SERVICE_MONTH_LABEL[variant]}</TableCell>
            <TableCell align="right">Por mes</TableCell>
            <TableCell />
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

Crear `client/src/components/FixedServiceCards.tsx`:

```tsx
import { Box, IconButton } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { formatMoney, formatMonthLabel } from "../format.js";
import {
  CADENCIA_SERVICIO_LABEL, SERVICE_LIST_LABEL, SERVICE_MONTH_LABEL, monthlyEquivalent, serviceMonth,
  type FixedServiceListProps, type FixedServiceVariant,
} from "../fixedServices.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { iconTapTargetSx } from "./tapTarget.js";

interface FixedServiceCardProps {
  item: FixedServiceDTO;
  variant: FixedServiceVariant;
  onEdit: (id: string) => void;
}

const SECTION_SX: Record<FixedServiceVariant, SxProps<Theme>> = {
  activos: {},
  deBaja: { opacity: 0.7 },
};

const money = (value: number): string => formatMoney(value, "ARS");

const FixedServiceCard = ({ item: { id, nombre, monto, cadencia, desde, hasta }, variant, onEdit }: FixedServiceCardProps) => {
  const edit = () => onEdit(id);
  const action = (
    <IconButton aria-label={`editar ${nombre}`} onClick={edit} sx={iconTapTargetSx}>
      <EditOutlinedIcon />
    </IconButton>
  );
  const highlights: RecordField[] = [
    { label: "Por mes", value: money(monthlyEquivalent({ monto, cadencia })) },
    { label: "Monto", value: money(monto) },
  ];
  const details: RecordField[] = [
    { label: "Cadencia", value: CADENCIA_SERVICIO_LABEL[cadencia] },
    { label: SERVICE_MONTH_LABEL[variant], value: formatMonthLabel(serviceMonth(variant, { desde, hasta })) },
  ];

  return <RecordCard title={nombre} action={action} highlights={highlights} details={details} />;
};

export const FixedServiceCards = ({ items, variant, onEdit }: FixedServiceListProps) => {
  const cards = items.map((item) => <FixedServiceCard key={item.id} item={item} variant={variant} onEdit={onEdit} />);

  return (
    <Box component="section" aria-label={SERVICE_LIST_LABEL[variant]} sx={SECTION_SX[variant]}>
      <Box sx={recordListSx}>{cards}</Box>
    </Box>
  );
};
```

- [ ] **Step 7: Los KPIs y la página**

Crear `client/src/components/FixedServiceKpiCards.tsx`:

```tsx
import ElectricalServicesOutlinedIcon from "@mui/icons-material/ElectricalServicesOutlined";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import FormatListBulletedOutlinedIcon from "@mui/icons-material/FormatListBulletedOutlined";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { monthlyTotal } from "../fixedServices.js";
import { Kpi } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";

interface FixedServiceKpiCardsProps {
  activos: FixedServiceDTO[];
}

const money = (value: number): string => formatMoney(value, "ARS");

const count = (value: number): string => String(Math.round(value));

export const FixedServiceKpiCards = ({ activos }: FixedServiceKpiCardsProps) => {
  const porMes = monthlyTotal(activos);

  return (
    <KpiGrid cardCount={3}>
      <Kpi label="Por mes" value={porMes} format={money} sub="los bimestrales, a la mitad" icon={<ElectricalServicesOutlinedIcon />} color="primary" />
      <Kpi label="Por año" value={porMes * 12} format={money} sub="al monto de hoy" icon={<EventRepeatOutlinedIcon />} color="secondary" />
      <Kpi label="Activos" value={activos.length} format={count} sub="se restan en el Flujo" icon={<FormatListBulletedOutlinedIcon />} color="warning" />
    </KpiGrid>
  );
};
```

Crear `client/src/pages/FixedServicesPage.tsx`:

```tsx
import { useMemo } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { useFixedServices } from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { FixedServiceCards } from "../components/FixedServiceCards.js";
import { FixedServiceEditor } from "../components/FixedServiceEditor.js";
import { FixedServiceKpiCards } from "../components/FixedServiceKpiCards.js";
import { FixedServicesTable } from "../components/FixedServicesTable.js";
import { useFixedServiceEditor } from "../components/useFixedServiceEditor.js";
import { tapTargetSx } from "../components/tapTarget.js";
import { fixedServiceSections } from "../fixedServices.js";
import { monthOf, todayIso } from "../isoDate.js";
import { useIsMobile } from "../useIsMobile.js";

interface FixedServicesHeaderProps {
  onAdd: () => void;
}

interface FixedServicesContentProps {
  services: FixedServiceDTO[];
  isLoading: boolean;
  isError: boolean;
  mesActual: string;
  onEdit: (id: string) => void;
}

const INTRO = "Lo que pagás fuera de la tarjeta (luz, gas, agua, internet, expensas). Se restan en el Flujo desde el mes que elijas.";
const EMPTY = "Todavía no cargaste servicios. Agregá la luz, el gas o internet para que se resten en el Flujo.";
const ERROR = "No pudimos cargar los servicios.";
const NO_ACTIVE = "No hay servicios activos.";
const NO_SERVICES: FixedServiceDTO[] = [];

const headerSx: SxProps<Theme> = {
  justifyContent: "space-between",
  alignItems: { xs: "stretch", md: "center" },
  gap: 2,
  mb: 1,
};

const deleteMessage = (service: FixedServiceDTO | null): string =>
  (service ? `¿Borrar «${service.nombre}»? Se saca también de los meses pasados del Flujo.` : "");

const FixedServicesHeader = ({ onAdd }: FixedServicesHeaderProps) => (
  <>
    <Stack direction={{ xs: "column", md: "row" }} sx={headerSx}>
      <Typography variant="h4">Servicios</Typography>
      <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd} sx={tapTargetSx}>Agregar servicio</Button>
    </Stack>
    <Typography color="text.secondary" sx={{ mb: 3 }}>{INTRO}</Typography>
  </>
);

const FixedServicesContent = ({ services, isLoading, isError, mesActual, onEdit }: FixedServicesContentProps) => {
  const isMobile = useIsMobile();
  const { activos, deBaja } = useMemo(() => fixedServiceSections(services, mesActual), [services, mesActual]);

  if (isLoading) return <CircularProgress />;
  if (isError) return <Typography color="error">{ERROR}</Typography>;
  if (services.length === 0) return <Typography color="text.secondary">{EMPTY}</Typography>;

  const ServiceList = isMobile ? FixedServiceCards : FixedServicesTable;
  const activeList = activos.length > 0
    ? <ServiceList items={activos} variant="activos" onEdit={onEdit} />
    : <Typography color="text.secondary">{NO_ACTIVE}</Typography>;
  const stoppedSection = deBaja.length > 0 && (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>Dados de baja</Typography>
      <ServiceList items={deBaja} variant="deBaja" onEdit={onEdit} />
    </Box>
  );

  return (
    <>
      <FixedServiceKpiCards activos={activos} />
      <Typography variant="h6" sx={{ mb: 1 }}>Activos</Typography>
      {activeList}
      {stoppedSection}
    </>
  );
};

export const FixedServicesPage = () => {
  const { data, isLoading, isError } = useFixedServices();
  const services = data ?? NO_SERVICES;
  const mesActual = monthOf(todayIso());
  const {
    open, service, error, saving, pendingDelete, openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete,
  } = useFixedServiceEditor(services);

  return (
    <>
      <FixedServicesHeader onAdd={openNew} />
      <FixedServicesContent services={services} isLoading={isLoading} isError={isError} mesActual={mesActual} onEdit={openEdit} />
      <FixedServiceEditor
        open={open}
        service={service}
        mesActual={mesActual}
        error={error}
        saving={saving}
        onClose={close}
        onSave={save}
        onDelete={askDelete}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Borrar servicio"
        message={deleteMessage(pendingDelete)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
    </>
  );
};
```

- [ ] **Step 8: El menú y la ruta**

En `client/src/components/layout/navItems.ts`, agregar `import ElectricalServicesOutlinedIcon from "@mui/icons-material/ElectricalServicesOutlined";` y, en el grupo `dia-a-dia`, después del ítem de Suscripciones:

```ts
      { to: "/servicios", label: "Servicios", icon: ElectricalServicesOutlinedIcon, placement: "more" },
```

En `client/src/App.tsx`, importar `FixedServicesPage` desde `./pages/FixedServicesPage.js` y, después de la ruta `/suscripciones`:

```tsx
        <Route path="/servicios" element={<PageTransition><FixedServicesPage /></PageTransition>} />
```

- [ ] **Step 9: Correr los tests y el typecheck**

Run: `bunx vitest run client/src/pages/FixedServicesPage.test.tsx client/src/components/layout client/src/App.test.tsx && bun run typecheck`
Expected: PASS. Si un test que usa `getByLabelText("Desde")` no encuentra el campo, revisar que el `TextField` tenga `label="Desde"`: MUI asocia el label con el `id` que genera.

- [ ] **Step 10: Commit**

```bash
FILES=(client/src/components/useFixedServiceForm.ts client/src/components/useFixedServiceEditor.ts client/src/components/FixedServiceEditor.tsx client/src/components/FixedServicesTable.tsx client/src/components/FixedServiceCards.tsx client/src/components/FixedServiceKpiCards.tsx client/src/pages/FixedServicesPage.tsx client/src/pages/FixedServicesPage.test.tsx client/src/components/layout/navItems.ts client/src/components/layout/navItems.test.ts client/src/components/layout/MoreSheet.test.tsx client/src/App.tsx client/src/App.test.tsx)
git add "${FILES[@]}"
git commit -m "feat(client): página Servicios para cargar los gastos fuera de la tarjeta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "${FILES[@]}"
git push
```

---

### Task 9: Servicios en la página de Flujo

**Files:**
- Modify: `client/src/components/CashFlowTable.tsx`, `client/src/components/CashFlowCards.tsx`, `client/src/components/CashFlowKpiCards.tsx`, `client/src/pages/CashFlowPage.tsx`
- Test: `client/src/components/CashFlowDetail.test.tsx`, `client/src/pages/CashFlowPage.test.tsx`

**Interfaces:**
- Consumes: `CashFlowMonthDTO.servicios` (Task 4).

- [ ] **Step 1: Escribir los tests que fallan**

En `client/src/components/CashFlowDetail.test.tsx`, el fixture `completo` pasa a tener `servicios: 45_000` y `egresos: 945_000`. Agregar dentro de `describe("CashFlowTable")`:

```tsx
  it("muestra los servicios entre el auto y los egresos", () => {
    renderWithProviders(<CashFlowTable meses={meses} />);
    const table = screen.getByRole("table", { name: "Detalle del flujo de caja" });
    const headers = within(table).getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers.slice(headers.indexOf("Auto"), headers.indexOf("Egresos") + 1)).toEqual(["Auto", "Servicios", "Egresos"]);
    const agosto = within(table).getByRole("row", { name: /Agosto de 2026/ });
    expect(within(agosto).getByText(money(45_000))).toBeInTheDocument();
  });
```

Y dentro de `describe("CashFlowCards")`:

```tsx
  it("en el detalle muestra los servicios", async () => {
    renderWithProviders(<CashFlowCards meses={meses} />);
    const agosto = screen.getByRole("article", { name: "Agosto de 2026" });
    await userEvent.click(within(agosto).getByRole("button", { name: "Ver detalle" }));
    expect(within(agosto).getByText("Servicios")).toBeInTheDocument();
    expect(within(agosto).getByText(money(45_000))).toBeInTheDocument();
  });
```

En `client/src/pages/CashFlowPage.test.tsx`, dentro de «muestra los KPIs, los dos gráficos y la proyección en el detalle», agregar:

```tsx
    expect(screen.getByText("Lo que entra por sueldo menos lo que sale sí o sí: tarjetas, hipoteca, auto y servicios.")).toBeInTheDocument();
    expect(screen.getByText("tarjetas, hipoteca, auto y servicios")).toBeInTheDocument();
    expect(screen.getByText(/después, las cuotas que ya compraste y tus suscripciones/)).toBeInTheDocument();
    expect(screen.getByText(/servicios con el último monto más la inflación esperada del REM/)).toBeInTheDocument();
    expect(screen.getByText(/gastos que no cargaste en Servicios\./)).toBeInTheDocument();
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `bunx vitest run client/src/components/CashFlowDetail.test.tsx client/src/pages/CashFlowPage.test.tsx`
Expected: FAIL. No hay columna «Servicios» y los textos son los viejos.

- [ ] **Step 3: Implementar**

En `client/src/components/CashFlowTable.tsx`:
- `AMOUNT_HEADERS` pasa a ser `["Ingreso", "Tarjetas", "Hipoteca", "Auto", "Servicios", "Egresos", "Margen", "Ahorro"]`;
- en `CashFlowTableRow`, después de la celda de `mes.auto`:

```tsx
      <TableCell align="right" sx={NO_WRAP}>{money(mes.servicios)}</TableCell>
```

En `client/src/components/CashFlowCards.tsx`, en `detailsOf`, después de `{ label: "Auto", … }`:

```tsx
  { label: "Servicios", value: money(mes.servicios) },
```

En `client/src/components/CashFlowKpiCards.tsx`, en el `Kpi` de «Egresos conocidos», `sub` pasa a ser `"tarjetas, hipoteca, auto y servicios"`.

En `client/src/pages/CashFlowPage.tsx`:
- `PROJECTION_CAPTION` pasa a ser:

```tsx
const PROJECTION_CAPTION =
  "Sueldo con el último neto más los aumentos de enero, mayo y septiembre por el IPC de los 4 meses anteriores (con la inflación esperada del REM del BCRA para los meses sin publicar), y la mitad en junio y diciembre por el SAC; hipoteca y auto con la última cuota más su aumento mensual reciente (la UVA de los últimos 3 meses y el valor del auto de los últimos 6 cupones); tarjetas con los resúmenes ya emitidos y, después, las cuotas que ya compraste y tus suscripciones; y servicios con el último monto más la inflación esperada del REM. El margen es lo que te queda para consumos nuevos y gastos que no cargaste en Servicios.";
```

- en `Header`, el texto de la bajada pasa a ser `Lo que entra por sueldo menos lo que sale sí o sí: tarjetas, hipoteca, auto y servicios.`

- [ ] **Step 4: Correr los tests y el typecheck**

Run: `bunx vitest run client/src/components/CashFlowDetail.test.tsx client/src/components/CashFlowDetailSection.test.tsx client/src/pages/CashFlowPage.test.tsx && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
FILES=(client/src/components/CashFlowTable.tsx client/src/components/CashFlowCards.tsx client/src/components/CashFlowKpiCards.tsx client/src/pages/CashFlowPage.tsx client/src/components/CashFlowDetail.test.tsx client/src/pages/CashFlowPage.test.tsx)
git add "${FILES[@]}"
git commit -m "feat(client): el flujo muestra los servicios y explica las suscripciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "${FILES[@]}"
git push
```

---

### Task 10: Verificación final

**Files:**
- Create (scratchpad, fuera del repo): `/private/tmp/claude-501/-Users-sebastianopderbeck-WebstormProjects-sopderbeck-Ledgerly/e8ec7a16-505f-46f9-8ffe-6c39880f143e/scratchpad/check-flujo.mts`

- [ ] **Step 1: Suite completa y tipos**

Run: `bun run test && bun run typecheck`
Expected: todo en verde. Si algo falla, se arregla en la task que corresponde, con su propio commit.

- [ ] **Step 2: Chequeo de solo lectura contra la base local**

Crear el script en el scratchpad. Solo hace GETs y no levanta `server/src/index.ts`, porque ese archivo arranca los jobs de mail que importan resúmenes:

```ts
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const worktree = process.argv[2];
const require = createRequire(join(worktree, "server/package.json"));
const mongoose = require("mongoose");
const request = require("supertest");
const env = readFileSync("/Users/sebastianopderbeck/WebstormProjects/sopderbeck/Ledgerly/.env", "utf8");
const mongoUrl = env.split("\n").find((line) => line.startsWith("MONGO_URL="))?.slice("MONGO_URL=".length).trim();
if (!mongoUrl) throw new Error("Falta MONGO_URL en el .env");

mongoose.set("autoIndex", false);
const { connectMongo } = await import(join(worktree, "server/src/db/connection.ts"));
const { createApp } = await import(join(worktree, "server/src/http/app.ts"));
await connectMongo(mongoUrl);

const nuevo = (await request(createApp()).get("/api/cash-flow")).body;
const actual = await (await fetch("http://localhost:4100/api/cash-flow")).json();
const porMes = new Map(actual.meses.map((mes: { mes: string }) => [mes.mes, mes]));
for (const mes of nuevo.meses) {
  const antes = porMes.get(mes.mes) as { tarjetas: number; egresos: number } | undefined;
  console.log(mes.mes, mes.estado, {
    deltaTarjetas: Math.round(mes.tarjetas - (antes?.tarjetas ?? 0)),
    servicios: Math.round(mes.servicios),
    deltaEgresos: Math.round(mes.egresos - (antes?.egresos ?? 0)),
  }, mes.estimados.filter((nota: string) => nota.includes("suscripciones")));
}
await mongoose.disconnect();
```

Run (desde el worktree): `bunx tsx /private/tmp/claude-501/-Users-sebastianopderbeck-WebstormProjects-sopderbeck-Ledgerly/e8ec7a16-505f-46f9-8ffe-6c39880f143e/scratchpad/check-flujo.mts "$PWD"`

Expected:
- en los meses cerrados y en los que tienen resumen real, `deltaTarjetas` es 0;
- en los proyectados, `deltaTarjetas` es mayor que 0 y aparece la nota «(cuotas y suscripciones)»;
- `servicios` es 0 en todos los meses, porque todavía no hay servicios cargados.

Si la base real no tiene suscripciones activas, el chequeo solo confirma que nada cambia. Los números quedan en la terminal y no se copian a GitHub.

- [ ] **Step 3: Push final**

Run: `git status --short && git log --oneline origin/main..HEAD && git push`
Expected: árbol limpio, los commits de las tasks 1 a 9 arriba de `main` y la rama al día en el remoto. No se abre PR.
