import { describe, it, expect } from "vitest";
import { computeFutureInstallments } from "./futureInstallments.js";

describe("computeFutureInstallments", () => {
  it("proyecta las cuotas restantes a meses futuros", () => {
    const res = computeFutureInstallments(
      [{ date: "2026-05-04", amount: 1000, currency: "ARS", isInstallment: true, installmentCurrent: 2, installmentTotal: 4 }],
      "ARS",
    );
    expect(res).toEqual([
      { month: "2026-06", total: 1000 },
      { month: "2026-07", total: 1000 },
    ]);
  });

  it("ignora no-cuotas, cuotas terminadas y otra moneda", () => {
    const res = computeFutureInstallments(
      [
        { date: "2026-05-04", amount: 500, currency: "ARS", isInstallment: false, installmentCurrent: null, installmentTotal: null },
        { date: "2026-05-04", amount: 500, currency: "ARS", isInstallment: true, installmentCurrent: 6, installmentTotal: 6 },
        { date: "2026-05-04", amount: 9, currency: "USD", isInstallment: true, installmentCurrent: 1, installmentTotal: 3 },
      ],
      "ARS",
    );
    expect(res).toEqual([]);
  });
});
