import { describe, it, expect } from "vitest";
import type { ParsedRow, ParsedStatement } from "@ledgerly/shared";
import { hasSaneRowDates } from "./statementSanity.js";

const row = (date: string): ParsedRow => ({
  date,
  descriptionRaw: "COMERCIO",
  merchant: "COMERCIO",
  amount: 100,
  currency: "ARS",
  direction: "debit",
  type: "purchase",
  isInstallment: false,
  installmentCurrent: null,
  installmentTotal: null,
  comprobante: null,
});

const statementOf = (closingDate: string | null, dates: string[]): ParsedStatement => ({
  header: {
    issuer: "icbc",
    cardLabel: "ICBC",
    last4: null,
    closingDate,
    dueDate: null,
    totals: {
      totalConsumos: { ars: 0, usd: 0 },
      saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 },
      saldoAnterior: { ars: 0, usd: 0 },
    },
  },
  rows: dates.map(row),
});

describe("hasSaneRowDates", () => {
  it("acepta fechas reales dentro del período", () => {
    expect(hasSaneRowDates(statementOf("2026-10-01", ["2026-03-28", "2026-09-30"]))).toBe(true);
  });

  it("rechaza un día imposible", () => {
    expect(hasSaneRowDates(statementOf("2026-10-01", ["2026-01-64"]))).toBe(false);
    expect(hasSaneRowDates(statementOf("2026-10-01", ["2026-02-30"]))).toBe(false);
  });

  it("rechaza un mes inválido", () => {
    expect(hasSaneRowDates(statementOf("2026-10-01", ["2026-13-05"]))).toBe(false);
  });

  it("rechaza fechas con formato inesperado", () => {
    expect(hasSaneRowDates(statementOf("2026-10-01", ["26-09-30"]))).toBe(false);
  });

  it("rechaza fechas más viejas que tres años antes del cierre", () => {
    expect(hasSaneRowDates(statementOf("2026-10-01", ["2022-01-01"]))).toBe(false);
    expect(hasSaneRowDates(statementOf("2026-10-01", ["2023-10-01"]))).toBe(true);
  });

  it("rechaza fechas más de 31 días después del cierre", () => {
    expect(hasSaneRowDates(statementOf("2026-10-01", ["2026-11-01"]))).toBe(true);
    expect(hasSaneRowDates(statementOf("2026-10-01", ["2026-11-02"]))).toBe(false);
  });

  it("sin fecha de cierre solo valida que las fechas existan", () => {
    expect(hasSaneRowDates(statementOf(null, ["2010-01-01", "2030-12-31"]))).toBe(true);
    expect(hasSaneRowDates(statementOf(null, ["2026-01-64"]))).toBe(false);
  });
});
