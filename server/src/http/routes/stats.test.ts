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

async function addInstallmentCrossingYear() {
  const s = await StatementModel.findOne({});
  await TransactionModel.create({
    statementId: s!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-11-10"), descriptionRaw: "F",
    merchant: "FRAVEGA", category: "Hogar", categorySource: "rule", amount: 300, currency: "ARS",
    direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 1, installmentTotal: 4,
    comprobante: "12", fingerprint: "f-fravega",
  });
}

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
    vi.mocked(fetchOficialRate).mockResolvedValue(1000);
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
    expect(arsAll.body.map((c: { category: string }) => c.category).sort()).toEqual(["Compras", "Dolar", "Transporte", "VisaCat"]);

    const onlyVisa = await request(app).get("/api/stats/last-statement/by-category?currency=ARS&cardLabel=VISA1");
    expect(onlyVisa.body).toEqual([
      { category: "Dolar", total: 40_000, count: 1 },
      { category: "VisaCat", total: 300, count: 1 },
    ]);

    const usd = await request(app).get("/api/stats/last-statement/by-category?currency=USD");
    expect(usd.body).toEqual([{ category: "Dolar", total: 40, count: 1 }]);
  });

  async function addUsdPurchaseToLastStatement() {
    const s = await StatementModel.findOne({});
    await TransactionModel.create({
      statementId: s!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-12"), descriptionRaw: "UBER USD",
      merchant: "UBER", category: "Transporte", categorySource: "rule", amount: 2, currency: "USD",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: "30", fingerprint: "f-usd",
    });
  }

  it("last-statement/by-category en ARS suma los consumos en USD al oficial de hoy dentro de su categoría", async () => {
    vi.mocked(fetchOficialRate).mockResolvedValue(1000);
    await addUsdPurchaseToLastStatement();
    const res = await request(app).get("/api/stats/last-statement/by-category?currency=ARS");
    expect(res.body).toEqual([
      { category: "Transporte", total: 2500, count: 2 },
      { category: "Compras", total: 1500, count: 1 },
    ]);
    expect(fetchOficialRate).toHaveBeenCalledWith(new Date().toISOString().slice(0, 10));
  });

  it("last-statement/by-category en ARS sin cotización deja afuera los consumos en USD", async () => {
    vi.mocked(fetchOficialRate).mockResolvedValue(null);
    await addUsdPurchaseToLastStatement();
    const res = await request(app).get("/api/stats/last-statement/by-category?currency=ARS");
    expect(res.body).toEqual([
      { category: "Compras", total: 1500, count: 1 },
      { category: "Transporte", total: 500, count: 1 },
    ]);
  });

  it("monthly y by-category con year dejan afuera los otros años", async () => {
    const s = await StatementModel.findOne({});
    await TransactionModel.create({
      statementId: s!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2024-03-01"), descriptionRaw: "C",
      merchant: "COTO", category: "Supermercado", categorySource: "rule", amount: 700, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: "9", fingerprint: "f-2024",
    });
    const monthly = await request(app).get("/api/stats/monthly?currency=ARS&year=2025&year=2026");
    expect(monthly.body).toEqual([{ month: "2026-05", total: 2000, count: 2 }]);
    const byCategory = await request(app).get("/api/stats/by-category?currency=ARS&year=2024");
    expect(byCategory.body).toEqual([{ category: "Supermercado", total: 700, count: 1 }]);
  });

  it("year respeta el borde de año (31/12 vs 1/1)", async () => {
    const s = await StatementModel.findOne({});
    await TransactionModel.insertMany([
      { statementId: s!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2025-12-31"), descriptionRaw: "D",
        merchant: "FIN DE AÑO", category: "Compras", categorySource: "rule", amount: 100, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
        comprobante: "10", fingerprint: "f-1231" },
      { statementId: s!._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-01-01"), descriptionRaw: "E",
        merchant: "AÑO NUEVO", category: "Compras", categorySource: "rule", amount: 200, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
        comprobante: "11", fingerprint: "f-0101" },
    ]);
    const res = await request(app).get("/api/stats/monthly?currency=ARS&year=2025");
    expect(res.body).toEqual([{ month: "2025-12", total: 100, count: 1 }]);
  });

  it("year inválido no filtra", async () => {
    const res = await request(app).get("/api/stats/monthly?currency=ARS&year=abc");
    expect(res.body).toEqual([{ month: "2026-05", total: 2000, count: 2 }]);
  });

  it("future-installments y detail con year filtran por año de vencimiento", async () => {
    await addInstallmentCrossingYear();
    const res = await request(app).get("/api/stats/future-installments?currency=ARS&year=2027");
    expect(res.body).toEqual([{ month: "2027-01", total: 300 }, { month: "2027-02", total: 300 }]);
    const detail = await request(app).get("/api/stats/future-installments/detail?currency=ARS&year=2027");
    expect(detail.body.map((m: { month: string }) => m.month)).toEqual(["2027-01", "2027-02"]);
  });

  it("summary con year suma solo las cuotas que vencen en esos años", async () => {
    await addInstallmentCrossingYear();
    const withYear = await request(app).get("/api/stats/summary?currency=ARS&year=2027");
    expect(withYear.body.futureInstallmentTotal).toBe(600);
    expect(withYear.body.totalPurchases).toBe(0);
    const withoutYear = await request(app).get("/api/stats/summary?currency=ARS");
    expect(withoutYear.body.futureInstallmentTotal).toBe(3900);
  });

  it("monthly-usd con Mes filtra por mes de consumo, no por fecha de cierre", async () => {
    vi.mocked(fetchOficialRate).mockResolvedValue(1000);
    const june = await request(app).get("/api/stats/monthly-usd?currency=ARS&from=2026-06-01&to=2026-06-30&year=2026");
    expect(june.body).toEqual([{ month: "2026-06", totalArs: 6000, rate: 1000, totalUsd: 6 }]);
    const july = await request(app).get("/api/stats/monthly-usd?currency=ARS&from=2026-07-01&to=2026-07-31&year=2026");
    expect(july.body).toEqual([]);
  });

  it("monthly-usd con year excluye meses de otros años sin pedir cotización", async () => {
    vi.mocked(fetchOficialRate).mockClear();
    vi.mocked(fetchOficialRate).mockResolvedValue(1000);
    const res = await request(app).get("/api/stats/monthly-usd?currency=ARS&year=2025");
    expect(res.body).toEqual([]);
    expect(fetchOficialRate).not.toHaveBeenCalled();
  });
});

describe("installment-purchases", () => {
  const createStatement = (overrides: Record<string, unknown>) => StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
    sourceFileName: "x.pdf", sourceHash: `h-${Math.random()}`, pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
    ...overrides,
  });

  const installmentRow = (statementId: unknown, overrides: Record<string, unknown>) => ({
    statementId, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-07-20"), descriptionRaw: "R",
    merchant: "FRAVEGA", category: "Hogar", categorySource: "rule", amount: 700, currency: "ARS",
    direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 1, installmentTotal: 2,
    comprobante: "30", fingerprint: `f-${Math.random()}`,
    ...overrides,
  });

  const mercadolibre = {
    id: "ICBC|2026-05-04|MERCADOLIBRE|4|1",
    cardLabel: "ICBC",
    merchant: "MERCADOLIBRE",
    category: "Compras",
    purchaseDate: "2026-05-04",
    installmentTotal: 4,
    installments: [
      { number: 1, amount: 1500, paymentDate: "2026-06-14" },
      { number: 2, amount: 1500, paymentDate: "2026-07-14" },
      { number: 3, amount: 1500, paymentDate: "2026-08-14" },
      { number: 4, amount: 1500, paymentDate: "2026-09-14" },
    ],
  };

  it("arma el cronograma con el vencimiento estimado a 12 días del cierre y deja afuera lo que no es cuota", async () => {
    const res = await request(app).get("/api/stats/installment-purchases");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([mercadolibre]);
  });

  it("usa el vencimiento del resumen cuando lo trae", async () => {
    const statement = await createStatement({ closingDate: new Date("2026-07-28"), dueDate: new Date("2026-08-10") });
    await TransactionModel.create(installmentRow(statement._id, {}));
    const res = await request(app).get("/api/stats/installment-purchases");
    const fravega = res.body.find((purchase: { merchant: string }) => purchase.merchant === "FRAVEGA");
    expect(fravega.installments).toEqual([
      { number: 1, amount: 700, paymentDate: "2026-08-10" },
      { number: 2, amount: 700, paymentDate: "2026-09-10" },
    ]);
  });

  it("deja afuera las cuotas en dólares y los créditos", async () => {
    const statement = await StatementModel.findOne({});
    await TransactionModel.insertMany([
      installmentRow(statement!._id, { merchant: "AMAZON", currency: "USD" }),
      installmentRow(statement!._id, { merchant: "DEVOLUCION", direction: "credit" }),
    ]);
    const res = await request(app).get("/api/stats/installment-purchases");
    expect(res.body).toEqual([mercadolibre]);
  });

  it("descarta las cuotas de resúmenes sin cierre ni vencimiento", async () => {
    const statement = await createStatement({});
    await TransactionModel.create(installmentRow(statement._id, {}));
    const res = await request(app).get("/api/stats/installment-purchases");
    expect(res.body).toEqual([mercadolibre]);
  });

  it("filtra por año de compra", async () => {
    const other = await request(app).get("/api/stats/installment-purchases?year=2025");
    expect(other.body).toEqual([]);
    const same = await request(app).get("/api/stats/installment-purchases?year=2025&year=2026");
    expect(same.body).toEqual([mercadolibre]);
  });

  it("respeta la tarjeta", async () => {
    const otherCard = await request(app).get("/api/stats/installment-purchases?cardLabel=VISA1");
    expect(otherCard.body).toEqual([]);
    const icbc = await request(app).get("/api/stats/installment-purchases?cardLabel=ICBC");
    expect(icbc.body).toEqual([mercadolibre]);
  });

  it("ignora la moneda del pedido: siempre son cuotas en pesos", async () => {
    const res = await request(app).get("/api/stats/installment-purchases?currency=USD");
    expect(res.body).toEqual([mercadolibre]);
  });
});
