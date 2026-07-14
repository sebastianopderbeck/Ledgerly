import { describe, it, expect } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { StatementModel, TransactionModel } from "../../db/models.js";

withDb();
const app = createApp();

describe("category-rules CRUD", () => {
  it("crea, lista, edita y borra", async () => {
    const created = await request(app).post("/api/category-rules")
      .send({ priority: 5, matchType: "contains", pattern: "UBER", category: "Transporte" });
    expect(created.status).toBe(201);
    expect(created.body.source).toBe("user");
    const id = created.body.id;

    expect((await request(app).get("/api/category-rules")).body).toHaveLength(1);

    const patched = await request(app).patch(`/api/category-rules/${id}`).send({ enabled: false });
    expect(patched.body.enabled).toBe(false);

    expect((await request(app).delete(`/api/category-rules/${id}`)).status).toBe(204);
  });
});

describe("POST /api/category-rules/apply", () => {
  it("recategoriza respetando overrides manuales", async () => {
    const s = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "h", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.insertMany([
      { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date(), descriptionRaw: "UBER TRIP",
        merchant: "UBER TRIP", category: "Sin categoría", categorySource: "rule", amount: 100, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null,
        installmentTotal: null, comprobante: "1", fingerprint: "f1" },
      { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date(), descriptionRaw: "UBER EATS",
        merchant: "UBER EATS", category: "Comida", categorySource: "manual", amount: 200, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null,
        installmentTotal: null, comprobante: "2", fingerprint: "f2" },
    ]);
    await request(app).post("/api/category-rules")
      .send({ priority: 1, matchType: "contains", pattern: "UBER", category: "Transporte" });

    const res = await request(app).post("/api/category-rules/apply");
    expect(res.body.updated).toBe(1);
    expect((await TransactionModel.findOne({ comprobante: "1" }))?.category).toBe("Transporte");
    expect((await TransactionModel.findOne({ comprobante: "2" }))?.category).toBe("Comida");
  });
});
