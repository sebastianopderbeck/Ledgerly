import { describe, it, expect } from "vitest";
import type { StatementDTO } from "@ledgerly/shared";
import { buildCardCycleBarData, buildCardCycleSummary, latestStatementPerIssuer } from "./cardCycle.js";

const makeStatement = (
  issuer: StatementDTO["issuer"],
  cardLabel: string,
  closingDate: string | null,
  saldoActual: { ars: number; usd: number },
  pagoMinimoArs = 0,
  dueDate: string | null = null,
): StatementDTO => ({
  id: `${issuer}-${closingDate}`,
  issuer,
  cardLabel,
  last4: "1234",
  closingDate,
  dueDate,
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual,
    pagoMinimo: { ars: pagoMinimoArs, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "x.pdf",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt: "2026-07-01T00:00:00.000Z",
});

describe("buildCardCycleSummary", () => {
  it("combina el último corte de cada banco y suma ARS, USD y pago mínimo", () => {
    const statements = [
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 534567, usd: 456.78 }, 90000, "2026-07-25"),
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }, 120000, "2026-07-20"),
    ];
    const summary = buildCardCycleSummary(statements);
    expect(summary?.totalArs).toBe(1234567);
    expect(summary?.totalUsd).toBeCloseTo(456.78);
    expect(summary?.totalPagoMinimoArs).toBe(210000);
    expect(summary?.cards).toHaveLength(2);
  });

  it("ordena las tarjetas por corte más reciente primero", () => {
    const statements = [
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 534567, usd: 456.78 }),
    ];
    expect(buildCardCycleSummary(statements)?.cards.map((c) => c.cardLabel)).toEqual(["Visa Signature", "ICBC"]);
  });

  it("elige el corte más reciente cuando un banco tiene varios resúmenes", () => {
    const statements = [
      makeStatement("icbc", "ICBC", "2026-06-07", { ars: 500000, usd: 0 }),
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
    ];
    const summary = buildCardCycleSummary(statements);
    expect(summary?.cards).toHaveLength(1);
    expect(summary?.totalArs).toBe(700000);
  });

  it("el total USD proviene sólo de Visa (ICBC aporta 0)", () => {
    const statements = [
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 534567, usd: 456.78 }),
    ];
    expect(buildCardCycleSummary(statements)?.totalUsd).toBeCloseTo(456.78);
  });

  it("ordena los cortes null al final sin romperse", () => {
    const statements = [
      makeStatement("visa_signature", "Visa Signature", null, { ars: 534567, usd: 456.78 }),
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
    ];
    expect(buildCardCycleSummary(statements)?.cards.map((c) => c.cardLabel)).toEqual(["ICBC", "Visa Signature"]);
  });

  it("devuelve null sin resúmenes", () => {
    expect(buildCardCycleSummary([])).toBeNull();
  });
});

describe("latestStatementPerIssuer", () => {
  it("devuelve un resumen por banco", () => {
    const statements = [
      makeStatement("icbc", "ICBC", "2026-06-07", { ars: 1, usd: 0 }),
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 2, usd: 0 }),
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 3, usd: 0 }),
    ];
    expect(latestStatementPerIssuer(statements)).toHaveLength(2);
  });
});

describe("buildCardCycleBarData", () => {
  it("arma una fila con una key por tarjeta = saldo actual ARS", () => {
    const summary = buildCardCycleSummary([
      makeStatement("icbc", "ICBC", "2026-07-07", { ars: 700000, usd: 0 }),
      makeStatement("visa_signature", "Visa Signature", "2026-07-12", { ars: 534567, usd: 456.78 }),
    ]);
    const { keys, row } = buildCardCycleBarData(summary!.cards);
    expect(keys).toEqual(["Visa Signature", "ICBC"]);
    expect(row["ICBC"]).toBe(700000);
    expect(row["Visa Signature"]).toBe(534567);
    expect(row.label).toBe("A pagar");
  });
});
