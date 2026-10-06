import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import type { CategoryMonthStat } from "@ledgerly/shared";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { BudgetModel, InflationRateModel, StatementModel, TransactionModel } from "../../db/models.js";

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
