import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { StatementModel, TransactionModel, InflationRateModel, ManualAssetModel, BudgetModel } from "../db/models.js";
import { toStatementDTO, toTransactionDTO, toInflationRateDTO, toManualAssetDTO, toBudgetDTO } from "./mappers.js";
import { statementDtoSchema, transactionDtoSchema, inflationRateDtoSchema, manualAssetDtoSchema, budgetDtoSchema } from "@ledgerly/shared";

withDb();

async function makeStatement(hash: string) {
  return StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
    sourceFileName: "r.pdf", sourceHash: hash, pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
}

describe("mappers", () => {
  it("toTransactionDTO cumple el schema y serializa la fecha a ISO", async () => {
    const s = await makeStatement("h1");
    const tx = await TransactionModel.create({
      statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "X", merchant: "X", category: "Otros", categorySource: "rule",
      amount: 100, currency: "ARS", direction: "debit", type: "purchase",
      isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: null, fingerprint: "fp",
    });
    const dto = toTransactionDTO(tx);
    expect(() => transactionDtoSchema.parse(dto)).not.toThrow();
    expect(dto.date).toBe("2026-05-04");
    expect(dto.id).toBe(tx._id.toString());
  });

  it("toStatementDTO cumple el schema", async () => {
    const s = await makeStatement("h2");
    const dto = toStatementDTO(s, 3);
    expect(() => statementDtoSchema.parse(dto)).not.toThrow();
    expect(dto.transactionCount).toBe(3);
  });

  it("toInflationRateDTO cumple el schema", async () => {
    const doc = await InflationRateModel.create({ periodo: "2025-01", variacionMensual: 2.2 });
    const dto = toInflationRateDTO(doc);
    expect(inflationRateDtoSchema.parse(dto)).toEqual({ periodo: "2025-01", variacionMensual: 2.2 });
  });

  it("toManualAssetDTO cumple el schema y conserva las valuaciones", async () => {
    const doc = await ManualAssetModel.create({
      nombre: "Ahorros", tipo: "ahorro", moneda: "USD",
      valuaciones: [{ fecha: "2026-09-01", monto: 4000 }, { fecha: "2026-10-01", monto: 5000 }],
    });
    const dto = toManualAssetDTO(doc);
    expect(manualAssetDtoSchema.parse(dto)).toEqual({
      id: doc._id.toString(), nombre: "Ahorros", tipo: "ahorro", moneda: "USD",
      valuaciones: [{ fecha: "2026-09-01", monto: 4000 }, { fecha: "2026-10-01", monto: 5000 }],
    });
  });

  it("toBudgetDTO cumple el schema", async () => {
    const doc = await BudgetModel.create({ category: "Comida", topeArs: 300000, periodoBase: "2026-08" });
    const dto = toBudgetDTO(doc);
    expect(budgetDtoSchema.parse(dto)).toEqual({
      id: doc._id.toString(), category: "Comida", topeArs: 300000, ajustaInflacion: false, periodoBase: "2026-08",
    });
  });
});
