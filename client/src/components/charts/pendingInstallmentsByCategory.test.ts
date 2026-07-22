import { describe, it, expect } from "vitest";
import { pendingInstallmentsByCategory } from "./pendingInstallmentsByCategory.js";

const item = (category: string, amount: number) => ({
  merchant: "M", category, amount, installmentNumber: 2, installmentTotal: 4, purchaseDate: "2026-05-04",
});

describe("pendingInstallmentsByCategory", () => {
  it("agrega ítems por categoría (suma montos, cuenta ítems) ordenado desc", () => {
    const res = pendingInstallmentsByCategory([
      { month: "2026-06", total: 300, count: 2, items: [item("Compras", 100), item("Transporte", 200)] },
      { month: "2026-07", total: 250, count: 2, items: [item("Compras", 50), item("Transporte", 200)] },
    ]);
    expect(res).toEqual([
      { category: "Transporte", total: 400, count: 2 },
      { category: "Compras", total: 150, count: 2 },
    ]);
  });

  it("lista vacía ⇒ []", () => {
    expect(pendingInstallmentsByCategory([])).toEqual([]);
  });
});
