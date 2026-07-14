import { describe, it, expect } from "vitest";
import { parsedStatementSchema, type ParsedStatement } from "./index.js";

const valid: ParsedStatement = {
  header: {
    issuer: "visa_signature",
    cardLabel: "Visa Signature ****1234",
    last4: "1234",
    closingDate: "2026-07-02",
    dueDate: "2026-07-13",
    totals: {
      totalConsumos: { ars: 3700, usd: 50 },
      saldoActual: { ars: 3910, usd: 50 },
      pagoMinimo: { ars: 500, usd: 0 },
      saldoAnterior: { ars: 1000, usd: 10 },
    },
  },
  rows: [
    {
      date: "2026-06-10",
      descriptionRaw: "COMERCIO UNO",
      merchant: "COMERCIO UNO",
      amount: 2500,
      currency: "ARS",
      direction: "debit",
      type: "purchase",
      isInstallment: false,
      installmentCurrent: null,
      installmentTotal: null,
      comprobante: "111111",
    },
  ],
};

describe("parsedStatementSchema", () => {
  it("acepta un statement válido", () => {
    expect(parsedStatementSchema.parse(valid)).toEqual(valid);
  });

  it("rechaza currency inválida", () => {
    const bad = structuredClone(valid);
    // @ts-expect-error probamos runtime
    bad.rows[0].currency = "EUR";
    expect(() => parsedStatementSchema.parse(bad)).toThrow();
  });

  it("rechaza amount negativo", () => {
    const bad = structuredClone(valid);
    bad.rows[0].amount = -1;
    expect(() => parsedStatementSchema.parse(bad)).toThrow();
  });
});
