import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { StatementModel, TransactionModel } from "../db/models.js";
import { toStatementDTO, toTransactionDTO } from "./mappers.js";
import { statementDtoSchema, transactionDtoSchema } from "@ledgerly/shared";

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
});
