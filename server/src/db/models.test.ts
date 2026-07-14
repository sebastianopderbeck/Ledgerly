import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { StatementModel, TransactionModel } from "./models.js";

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
