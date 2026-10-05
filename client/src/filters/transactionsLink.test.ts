import { describe, it, expect } from "vitest";
import { transactionsLink } from "./transactionsLink.js";

describe("transactionsLink", () => {
  it("sin filtros lleva a Movimientos tal cual", () => {
    expect(transactionsLink()).toBe("/transactions");
    expect(transactionsLink({})).toBe("/transactions");
  });

  it("con categoría, moneda y mes arma el rango del mes", () => {
    expect(transactionsLink({ category: "Comida", currency: "ARS", month: "2026-09" }))
      .toBe("/transactions?category=Comida&currency=ARS&from=2026-09-01&to=2026-09-30");
  });

  it("el rango contempla febrero de 28 y de 29 días", () => {
    expect(transactionsLink({ month: "2026-02" })).toBe("/transactions?from=2026-02-01&to=2026-02-28");
    expect(transactionsLink({ month: "2028-02" })).toBe("/transactions?from=2028-02-01&to=2028-02-29");
  });

  it("busca un comercio en todos los años", () => {
    expect(transactionsLink({ year: "all", search: "STREAMFLIX" })).toBe("/transactions?year=all&search=STREAMFLIX");
  });

  it("codifica la categoría y la búsqueda", () => {
    expect(transactionsLink({ year: "all", category: "Sin categoría", search: "PANADERIA LA ESPIGA" }))
      .toBe("/transactions?year=all&category=Sin+categor%C3%ADa&search=PANADERIA+LA+ESPIGA");
    expect(transactionsLink({ search: "GOOGLE *VideoP" })).toBe("/transactions?search=GOOGLE+*VideoP");
  });

  it("repite el parámetro por cada año elegido", () => {
    expect(transactionsLink({ year: ["2025", "2026"], category: "Hogar" }))
      .toBe("/transactions?year=2025&year=2026&category=Hogar");
  });
});
