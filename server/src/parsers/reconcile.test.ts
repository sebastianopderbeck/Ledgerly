import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile.js";
import type { ParsedRow, ParsedStatement } from "@ledgerly/shared";

function row(overrides: Partial<ParsedRow>): ParsedRow {
  return {
    date: "2026-05-04",
    descriptionRaw: "X",
    merchant: "X",
    amount: 0,
    currency: "ARS",
    direction: "debit",
    type: "purchase",
    isInstallment: false,
    installmentCurrent: null,
    installmentTotal: null,
    comprobante: null,
    ...overrides,
  };
}

function make(totalArs: number, rows: ParsedRow[]): ParsedStatement {
  return {
    header: {
      issuer: "icbc",
      cardLabel: "ICBC",
      last4: null,
      closingDate: null,
      dueDate: null,
      totals: {
        totalConsumos: { ars: totalArs, usd: 0 },
        saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 },
        saldoAnterior: { ars: 0, usd: 0 },
      },
    },
    rows,
  };
}

describe("reconcile", () => {
  it("neto de consumos = compras - reintegros, ignorando pagos", () => {
    const statement = make(2000, [
      row({ amount: 2400, type: "purchase", direction: "debit" }),
      row({ amount: 400, type: "refund", direction: "credit" }),
      row({ amount: 9999, type: "payment", direction: "credit" }),
    ]);
    const result = reconcile(statement);
    expect(result.ok).toBe(true);
    expect(result.entries.find((e) => e.currency === "ARS")).toMatchObject({
      expected: 2000,
      parsed: 2000,
      diff: 0,
      ok: true,
    });
  });

  it("resta las compras con dirección crédito (reversas)", () => {
    const statement = make(1000, [
      row({ amount: 1500, type: "purchase", direction: "debit" }),
      row({ amount: 500, type: "purchase", direction: "credit" }),
    ]);
    expect(reconcile(statement).ok).toBe(true);
  });

  it("no-ok cuando difiere más que la tolerancia", () => {
    const statement = make(2100, [row({ amount: 2000, type: "purchase", direction: "debit" })]);
    const result = reconcile(statement);
    expect(result.ok).toBe(false);
    expect(result.entries.find((e) => e.currency === "ARS")).toMatchObject({ diff: -100, ok: false });
  });
});
