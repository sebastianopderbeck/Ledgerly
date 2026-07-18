import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { StatementModel, TransactionModel, MortgageCouponModel, AutoCouponModel } from "./models.js";

withDb();

describe("modelos", () => {
  it("persiste y recupera un statement", async () => {
    const s = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null,
      closingDate: new Date("2026-07-02"), dueDate: new Date("2026-07-14"),
      totals: { totalConsumos: { ars: 2400, usd: 0 }, saldoActual: { ars: 2400, usd: 0 },
        pagoMinimo: { ars: 240, usd: 0 }, saldoAnterior: { ars: 5000, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "abc", pageCount: 10, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    expect(s._id).toBeDefined();
  });

  it("rechaza sourceHash duplicado", async () => {
    const base = {
      issuer: "icbc" as const, cardLabel: "ICBC", last4: null,
      closingDate: new Date(), dueDate: new Date(),
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "dup", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    };
    await StatementModel.init();
    await StatementModel.create(base);
    await expect(StatementModel.create(base)).rejects.toThrow();
  });

  it("persiste una transacción con categoría", async () => {
    const parent = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "tx-parent", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    const tx = await TransactionModel.create({
      statementId: parent._id,
      issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "COMERCIO TRES", merchant: "COMERCIO TRES",
      category: "Otros", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase",
      isInstallment: true, installmentCurrent: 2, installmentTotal: 6, comprobante: "001001",
      fingerprint: "fp1",
    });
    expect(tx.category).toBe("Otros");
  });
});

describe("MortgageCoupon", () => {
  const base = {
    prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: new Date("2025-08-18"),
    capital: 184689.39, intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93,
    cuotaPuraUva: 699.6, cotizacionUva: 1555.16, tea: 9.27, tna: 8.9, cft: 0,
    sourceFileName: "08-2025.pdf", sourceHash: "h1",
  };

  it("persiste un cupón", async () => {
    const c = await MortgageCouponModel.create(base);
    expect(c._id).toBeDefined();
  });

  it("rechaza (prestamoNro, cuotaNro) duplicado", async () => {
    await MortgageCouponModel.init();
    await MortgageCouponModel.create(base);
    await expect(MortgageCouponModel.create({ ...base, sourceHash: "h2" })).rejects.toThrow();
  });

  it("tipoCambioUsd/Source default null y aceptan valores", async () => {
    const withoutFx = await MortgageCouponModel.create(base);
    expect(withoutFx.tipoCambioUsd ?? null).toBeNull();
    expect(withoutFx.tipoCambioSource ?? null).toBeNull();
    const withFx = await MortgageCouponModel.create({ ...base, cuotaNro: 2, tipoCambioUsd: 1350.5, tipoCambioSource: "api" });
    expect(withFx.tipoCambioUsd).toBe(1350.5);
    expect(withFx.tipoCambioSource).toBe("api");
  });
});

describe("AutoCoupon", () => {
  const base = {
    grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
    fechaEmision: new Date("2024-10-18"), fechaVencimiento: new Date("2024-11-11"),
    comprobante: "000062757060", modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01,
    conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }, { label: "DIFERIMIENTO COMERCIAL", amount: -70607.06 }],
    totalAPagar: 268551.23, sourceFileName: "11-2024.pdf", sourceHash: "h1",
  };

  it("persiste un cupón de auto con conceptos", async () => {
    const c = await AutoCouponModel.create(base);
    expect(c._id).toBeDefined();
    expect(c.conceptos).toHaveLength(2);
    expect(c.conceptos[1].amount).toBe(-70607.06);
  });

  it("rechaza (grupo, orden, cuotaNro) duplicado", async () => {
    await AutoCouponModel.init();
    await AutoCouponModel.create(base);
    await expect(AutoCouponModel.create({ ...base, sourceHash: "h2" })).rejects.toThrow();
  });
});
