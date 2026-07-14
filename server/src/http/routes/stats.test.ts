import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { StatementModel, TransactionModel } from "../../db/models.js";

withDb();
const app = createApp();

beforeEach(async () => {
  const s = await StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-07-02"), dueDate: null,
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
    sourceFileName: "r.pdf", sourceHash: "h", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.insertMany([
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"), descriptionRaw: "A",
      merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule", amount: 1500, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 2, installmentTotal: 4, comprobante: "1", fingerprint: "f1" },
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-10"), descriptionRaw: "B",
      merchant: "UBER", category: "Transporte", categorySource: "rule", amount: 500, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: "2", fingerprint: "f2" },
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-06-08"), descriptionRaw: "PAGO",
      merchant: "SU PAGO", category: "Sin categoría", categorySource: "rule", amount: 9999, currency: "ARS",
      direction: "credit", type: "payment", isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: null, fingerprint: "f3" },
  ]);
});

describe("stats", () => {
  it("by-category suma solo compras", async () => {
    const res = await request(app).get("/api/stats/by-category?currency=ARS");
    const compras = res.body.find((c: { category: string }) => c.category === "Compras");
    expect(compras.total).toBe(1500);
    expect(res.body.some((c: { category: string }) => c.category === "Sin categoría")).toBe(false);
  });

  it("monthly agrupa por mes (solo compras)", async () => {
    const res = await request(app).get("/api/stats/monthly?currency=ARS");
    expect(res.body).toEqual([{ month: "2026-05", total: 2000, count: 2 }]);
  });

  it("top-merchants ordena por gasto", async () => {
    const res = await request(app).get("/api/stats/top-merchants?currency=ARS&limit=5");
    expect(res.body[0].merchant).toBe("MERCADOLIBRE");
  });

  it("future-installments proyecta cuotas", async () => {
    const res = await request(app).get("/api/stats/future-installments?currency=ARS");
    expect(res.body).toEqual([{ month: "2026-06", total: 1500 }, { month: "2026-07", total: 1500 }]);
  });

  it("summary", async () => {
    const res = await request(app).get("/api/stats/summary?currency=ARS");
    expect(res.body.totalPurchases).toBe(2000);
    expect(res.body.transactionCount).toBe(2);
    expect(res.body.statementCount).toBe(1);
    expect(res.body.futureInstallmentTotal).toBe(3000);
  });

  it("by-category filtra por cardLabel", async () => {
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
    const res = await request(app).get("/api/stats/by-category?currency=ARS&cardLabel=ICBC");
    const compras = res.body.find((c: { category: string }) => c.category === "Compras");
    expect(compras.total).toBe(1500);
  });

  it("future-installments y summary respetan cardLabel", async () => {
    const other = await StatementModel.create({
      issuer: "visa_signature", cardLabel: "VISA1", last4: null, closingDate: new Date("2026-07-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "v.pdf", sourceHash: "h2", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: other._id, issuer: "visa_signature", cardLabel: "VISA1", date: new Date("2026-05-04"),
      descriptionRaw: "Y", merchant: "Y", category: "Compras", categorySource: "rule", amount: 800, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 1, installmentTotal: 3,
      comprobante: "8", fingerprint: "f8",
    });
    const future = await request(app).get("/api/stats/future-installments?currency=ARS&cardLabel=ICBC");
    expect(future.body).toEqual([{ month: "2026-06", total: 1500 }, { month: "2026-07", total: 1500 }]);
    const summary = await request(app).get("/api/stats/summary?currency=ARS&cardLabel=ICBC");
    expect(summary.body.totalPurchases).toBe(2000);
    expect(summary.body.statementCount).toBe(1);
    expect(summary.body.futureInstallmentTotal).toBe(3000);
  });
});
