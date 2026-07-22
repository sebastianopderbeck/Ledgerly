import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { StatementModel, TransactionModel } from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";

withDb();
const app = createApp();

beforeEach(async () => {
  const s = await StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-07-02"), dueDate: null,
    totals: { totalConsumos: { ars: 6000, usd: 0 }, saldoActual: { ars: 6000, usd: 0 },
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

  it("monthly-usd suma el saldo a pagar de los resúmenes por mes de consumo, en USD", async () => {
    vi.mocked(fetchOficialRate).mockResolvedValue(1000);
    const res = await request(app).get("/api/stats/monthly-usd?currency=ARS");
    expect(res.body).toEqual([{ month: "2026-06", totalArs: 6000, rate: 1000, totalUsd: 6 }]);
  });

  it("monthly-usd deja totalUsd null si no hay cotización", async () => {
    vi.mocked(fetchOficialRate).mockResolvedValue(null);
    const res = await request(app).get("/api/stats/monthly-usd?currency=ARS");
    expect(res.body).toEqual([{ month: "2026-06", totalArs: 6000, rate: null, totalUsd: null }]);
  });

  it("top-merchants ordena por gasto", async () => {
    const res = await request(app).get("/api/stats/top-merchants?currency=ARS&limit=5");
    expect(res.body[0].merchant).toBe("MERCADOLIBRE");
  });

  it("future-installments proyecta cuotas", async () => {
    const res = await request(app).get("/api/stats/future-installments?currency=ARS");
    expect(res.body).toEqual([{ month: "2026-06", total: 1500 }, { month: "2026-07", total: 1500 }]);
  });

  it("future-installments no duplica cuotas con varios resúmenes", async () => {
    const older = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-06-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "old.pdf", sourceHash: "hf1", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: older._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
      installmentCurrent: 1, installmentTotal: 4, comprobante: "1b", fingerprint: "f1b",
    });
    const res = await request(app).get("/api/stats/future-installments?currency=ARS");
    const total = res.body.reduce((acc: number, m: { total: number }) => acc + m.total, 0);
    expect(total).toBe(3000);
  });

  it("future-installments/detail no duplica cuotas con varios resúmenes", async () => {
    const older = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-06-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "old.pdf", sourceHash: "hf2", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: older._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
      installmentCurrent: 1, installmentTotal: 4, comprobante: "1c", fingerprint: "f1c",
    });
    const res = await request(app).get("/api/stats/future-installments/detail?currency=ARS");
    const count = res.body.reduce((acc: number, m: { count: number }) => acc + m.count, 0);
    expect(count).toBe(2);
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

  it("summary: futureInstallmentTotal usa solo el último resumen (no duplica cuotas)", async () => {
    const older = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-06-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "old.pdf", sourceHash: "hold", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: older._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
      installmentCurrent: 1, installmentTotal: 4, comprobante: "1b", fingerprint: "f1b",
    });
    const res = await request(app).get("/api/stats/summary?currency=ARS");
    expect(res.body.futureInstallmentTotal).toBe(3000);
  });

  it("last-statement/by-category agrega solo el último resumen de cada issuer", async () => {
    const oldIcbc = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-05-02"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "old.pdf", sourceHash: "hold", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.create({
      statementId: oldIcbc._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-04-04"),
      descriptionRaw: "OLD", merchant: "OLD", category: "Viejo", categorySource: "rule", amount: 777, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: "10", fingerprint: "f10",
    });
    const res = await request(app).get("/api/stats/last-statement/by-category?currency=ARS");
    expect(res.body.some((c: { category: string }) => c.category === "Viejo")).toBe(false);
    const compras = res.body.find((c: { category: string }) => c.category === "Compras");
    expect(compras.total).toBe(1500);
  });

  it("last-statement/by-category respeta cardLabel y currency", async () => {
    const visa = await StatementModel.create({
      issuer: "visa_signature", cardLabel: "VISA1", last4: null, closingDate: new Date("2026-07-05"), dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "v.pdf", sourceHash: "hv", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.insertMany([
      { statementId: visa._id, issuer: "visa_signature", cardLabel: "VISA1", date: new Date("2026-06-04"),
        descriptionRaw: "V", merchant: "V", category: "VisaCat", categorySource: "rule", amount: 300, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: "20", fingerprint: "f20" },
      { statementId: visa._id, issuer: "visa_signature", cardLabel: "VISA1", date: new Date("2026-06-05"),
        descriptionRaw: "U", merchant: "U", category: "Dolar", categorySource: "rule", amount: 40, currency: "USD",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: "21", fingerprint: "f21" },
    ]);
    const arsAll = await request(app).get("/api/stats/last-statement/by-category?currency=ARS");
    expect(arsAll.body.map((c: { category: string }) => c.category).sort()).toEqual(["Compras", "Transporte", "VisaCat"]);

    const onlyVisa = await request(app).get("/api/stats/last-statement/by-category?currency=ARS&cardLabel=VISA1");
    expect(onlyVisa.body).toEqual([{ category: "VisaCat", total: 300, count: 1 }]);

    const usd = await request(app).get("/api/stats/last-statement/by-category?currency=USD");
    expect(usd.body).toEqual([{ category: "Dolar", total: 40, count: 1 }]);
  });
});
