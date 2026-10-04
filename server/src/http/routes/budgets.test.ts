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
