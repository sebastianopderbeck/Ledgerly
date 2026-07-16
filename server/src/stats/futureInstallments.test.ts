import { describe, it, expect } from "vitest";
import { computeFutureInstallments, computeFutureInstallmentsDetail } from "./futureInstallments.js";

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

describe("computeFutureInstallmentsDetail", () => {
  it("proyecta el detalle de cada cuota restante con su nº y comercio", () => {
    const res = computeFutureInstallmentsDetail(
      [{ date: "2026-05-04", amount: 1000, currency: "ARS", isInstallment: true, installmentCurrent: 2, installmentTotal: 4, merchant: "MEGATONE", category: "Compras" }],
      "ARS",
    );
    expect(res).toEqual([
      { month: "2026-06", total: 1000, count: 1, items: [{ merchant: "MEGATONE", category: "Compras", amount: 1000, installmentNumber: 3, installmentTotal: 4, purchaseDate: "2026-05-04" }] },
      { month: "2026-07", total: 1000, count: 1, items: [{ merchant: "MEGATONE", category: "Compras", amount: 1000, installmentNumber: 4, installmentTotal: 4, purchaseDate: "2026-05-04" }] },
    ]);
  });

  it("agrupa varias cuotas del mismo mes y ordena items por monto desc", () => {
    const res = computeFutureInstallmentsDetail(
      [
        { date: "2026-05-04", amount: 100, currency: "ARS", isInstallment: true, installmentCurrent: 1, installmentTotal: 2, merchant: "CHICO", category: "A" },
        { date: "2026-05-10", amount: 900, currency: "ARS", isInstallment: true, installmentCurrent: 3, installmentTotal: 4, merchant: "GRANDE", category: "B" },
      ],
      "ARS",
    );
    expect(res).toEqual([
      {
        month: "2026-06",
        total: 1000,
        count: 2,
        items: [
          { merchant: "GRANDE", category: "B", amount: 900, installmentNumber: 4, installmentTotal: 4, purchaseDate: "2026-05-10" },
          { merchant: "CHICO", category: "A", amount: 100, installmentNumber: 2, installmentTotal: 2, purchaseDate: "2026-05-04" },
        ],
      },
    ]);
  });

  it("ignora no-cuotas, cuotas terminadas y otra moneda", () => {
    const res = computeFutureInstallmentsDetail(
      [
        { date: "2026-05-04", amount: 500, currency: "ARS", isInstallment: false, installmentCurrent: null, installmentTotal: null, merchant: "X", category: "A" },
        { date: "2026-05-04", amount: 500, currency: "ARS", isInstallment: true, installmentCurrent: 6, installmentTotal: 6, merchant: "Y", category: "A" },
        { date: "2026-05-04", amount: 9, currency: "USD", isInstallment: true, installmentCurrent: 1, installmentTotal: 3, merchant: "Z", category: "A" },
      ],
      "ARS",
    );
    expect(res).toEqual([]);
  });
});
