import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { StatementModel, TransactionModel } from "../../db/models.js";

withDb();
const app = createApp();

async function seed() {
  const s = await StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-07-02"), dueDate: null,
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
    sourceFileName: "r.pdf", sourceHash: "h", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.insertMany([
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
      installmentCurrent: null, installmentTotal: null, comprobante: "1", fingerprint: "f1" },
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-06-08"),
      descriptionRaw: "SU PAGO", merchant: "SU PAGO", category: "Sin categoría", categorySource: "rule",
      amount: 5000, currency: "ARS", direction: "credit", type: "payment", isInstallment: false,
      installmentCurrent: null, installmentTotal: null, comprobante: null, fingerprint: "f2" },
  ]);
}

beforeEach(seed);

describe("GET /api/transactions", () => {
  it("lista con total y paginado", async () => {
    const res = await request(app).get("/api/transactions");
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
  });
  it("filtra por category", async () => {
    const res = await request(app).get("/api/transactions?category=Compras");
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].merchant).toBe("MERCADOLIBRE");
  });
  it("filtra por varias categorías (repetido)", async () => {
    const base = await StatementModel.findOne({});
    await TransactionModel.create({
      statementId: base!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-05"),
      descriptionRaw: "UBER", merchant: "UBER", category: "Transporte", categorySource: "rule", amount: 200, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: "3", fingerprint: "f3",
    });
    const res = await request(app).get("/api/transactions?category=Compras&category=Sin categoría");
    expect(res.body.total).toBe(2);
    const categories = res.body.items.map((t: { category: string }) => t.category).sort();
    expect(categories).toEqual(["Compras", "Sin categoría"]);
  });
  it("categories devuelve las categorías distintas ordenadas", async () => {
    const res = await request(app).get("/api/transactions/categories");
    expect(res.body).toEqual(["Compras", "Sin categoría"]);
  });
  it("filtra por rango de fechas", async () => {
    const res = await request(app).get("/api/transactions?from=2026-06-01&to=2026-06-30");
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].type).toBe("payment");
  });
  it("sin pageSize devuelve TODOS los movimientos (no sólo la primera página)", async () => {
    const base = await StatementModel.findOne({});
    await TransactionModel.insertMany(
      Array.from({ length: 60 }, (_, i) => ({
        statementId: base!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date(Date.UTC(2026, 0, (i % 27) + 1)),
        descriptionRaw: `M${i}`, merchant: `M${i}`, category: "Compras", categorySource: "rule",
        amount: 10, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
        installmentCurrent: null, installmentTotal: null, comprobante: null, fingerprint: `bulk-${i}`,
      })),
    );
    const res = await request(app).get("/api/transactions");
    expect(res.body.total).toBe(62);
    expect(res.body.items).toHaveLength(62);
  });
  it("con pageSize explícito pagina", async () => {
    const res = await request(app).get("/api/transactions?pageSize=1&page=1");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(2);
    expect(res.body.pageSize).toBe(1);
  });
  it("filtra por cuotas (installment=true / false)", async () => {
    const base = await StatementModel.findOne({});
    await TransactionModel.create({
      statementId: base!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-06-10"),
      descriptionRaw: "NOTEBOOK", merchant: "NOTEBOOK", category: "Tecnología", categorySource: "rule", amount: 45000,
      currency: "ARS", direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 3,
      installmentTotal: 12, comprobante: "3", fingerprint: "f-cuota",
    });
    const solo = await request(app).get("/api/transactions?installment=true");
    expect(solo.body.total).toBe(1);
    expect(solo.body.items[0].merchant).toBe("NOTEBOOK");
    const sin = await request(app).get("/api/transactions?installment=false");
    expect(sin.body.total).toBe(2);
    expect(sin.body.items.every((t: { isInstallment: boolean }) => !t.isInstallment)).toBe(true);
  });
  it("filtra por cardLabel", async () => {
    const other = await StatementModel.create({
      issuer: "visa_signature", cardLabel: "VISA1", last4: null, closingDate: new Date("2026-07-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "v.pdf", sourceHash: "h2", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: other._id, issuer: "visa_signature", cardLabel: "VISA1", date: new Date("2026-05-04"),
      descriptionRaw: "X", merchant: "X", category: "Compras", categorySource: "rule", amount: 999, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: "9", fingerprint: "f9",
    });
    const res = await request(app).get("/api/transactions?cardLabel=ICBC");
    expect(res.body.total).toBe(2);
  });
});

describe("PATCH /api/transactions/:id", () => {
  it("cambia la categoría y marca categorySource=manual", async () => {
    const list = await request(app).get("/api/transactions?category=Compras");
    const id = list.body.items[0].id;
    const res = await request(app).patch(`/api/transactions/${id}`).send({ category: "Regalos" });
    expect(res.status).toBe(200);
    expect(res.body.category).toBe("Regalos");
    expect(res.body.categorySource).toBe("manual");
  });
});

describe("POST /api/transactions/delete", () => {
  it("borra los movimientos por id y devuelve la cantidad", async () => {
    const list = await request(app).get("/api/transactions");
    const ids = list.body.items.map((t: { id: string }) => t.id);
    const res = await request(app).post("/api/transactions/delete").send({ ids });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
    expect(await TransactionModel.countDocuments()).toBe(0);
  });

  it("borra sólo los ids indicados", async () => {
    const list = await request(app).get("/api/transactions?category=Compras");
    const id = list.body.items[0].id;
    const res = await request(app).post("/api/transactions/delete").send({ ids: [id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(await TransactionModel.countDocuments()).toBe(1);
  });

  it("rechaza ids vacío con 400", async () => {
    const res = await request(app).post("/api/transactions/delete").send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it("rechaza body sin ids con 400", async () => {
    const res = await request(app).post("/api/transactions/delete").send({});
    expect(res.status).toBe(400);
  });
});
