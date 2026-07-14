import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";
import type { ParsedStatement } from "@ledgerly/shared";

vi.mock("../ingestion/parseStatement.js", () => ({ parseStatement: vi.fn() }));
import { parseStatement } from "../ingestion/parseStatement.js";
import { importStatement } from "./importStatement.js";
import { seedCategoryRules } from "../rules/seedRules.js";
import { StatementModel, TransactionModel } from "../db/models.js";

withDb();
const mocked = vi.mocked(parseStatement);

const parsed: ParsedStatement = {
  header: {
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: "2026-07-02", dueDate: "2026-07-14",
    totals: { totalConsumos: { ars: 2400, usd: 0 }, saldoActual: { ars: 2400, usd: 0 },
      pagoMinimo: { ars: 240, usd: 0 }, saldoAnterior: { ars: 5000, usd: 0 } },
  },
  rows: [
    { date: "2026-05-04", descriptionRaw: "MERPAGO*MERCADOLIBRE", merchant: "MERCADOLIBRE", amount: 1500,
      currency: "ARS", direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 2,
      installmentTotal: 6, comprobante: "001001" },
    { date: "2026-06-08", descriptionRaw: "SU PAGO EN PESOS", merchant: "SU PAGO EN PESOS", amount: 5000,
      currency: "ARS", direction: "credit", type: "payment", isInstallment: false, installmentCurrent: null,
      installmentTotal: null, comprobante: null },
  ],
};

beforeEach(() => {
  mocked.mockResolvedValue({ statement: parsed, reconciliation: { ok: true, entries: [] },
    meta: { producer: null, creator: null, pageCount: 10, encrypted: true } });
});

describe("importStatement", () => {
  it("importa statement + transacciones y categoriza", async () => {
    await seedCategoryRules();
    const res = await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf" });
    expect(res.status).toBe("imported");
    expect(res.transactionCount).toBe(2);
    expect(await StatementModel.countDocuments()).toBe(1);
    const ml = await TransactionModel.findOne({ comprobante: "001001" });
    expect(ml?.category).toBe("Compras");
    expect(ml?.categorySource).toBe("rule");
  });

  it("es idempotente: reimportar el mismo PDF no duplica", async () => {
    await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf" });
    const res = await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf" });
    expect(res.status).toBe("duplicate");
    expect(await StatementModel.countDocuments()).toBe(1);
    expect(await TransactionModel.countDocuments()).toBe(2);
  });

  it("replace=true reemplaza el statement anterior", async () => {
    await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf" });
    const res = await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf", replace: true });
    expect(res.status).toBe("imported");
    expect(await StatementModel.countDocuments()).toBe(1);
    expect(await TransactionModel.countDocuments()).toBe(2);
  });
});
