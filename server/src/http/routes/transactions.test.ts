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
  it("filtra por rango de fechas", async () => {
    const res = await request(app).get("/api/transactions?from=2026-06-01&to=2026-06-30");
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].type).toBe("payment");
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
