import { describe, it, expect } from "vitest";
import { monthInYears, parseYears, yearExpr } from "./yearFilter.js";

describe("parseYears", () => {
  it("acepta un año suelto", () => {
    expect(parseYears("2025")).toEqual([2025]);
  });

  it("acepta años repetidos, los ordena y no los duplica", () => {
    expect(parseYears(["2026", "2025", "2026"])).toEqual([2025, 2026]);
  });

  it("descarta lo que no es un año de 4 dígitos", () => {
    expect(parseYears(["2025", "all", "26", "abcd", "20255"])).toEqual([2025]);
  });

  it("sin años válidos devuelve null", () => {
    expect(parseYears(undefined)).toBeNull();
    expect(parseYears("all")).toBeNull();
    expect(parseYears([])).toBeNull();
  });
});

describe("monthInYears", () => {
  it("compara el año de un mes YYYY-MM", () => {
    expect(monthInYears("2026-03", [2026])).toBe(true);
    expect(monthInYears("2027-01", [2025, 2026])).toBe(false);
  });

  it("con null deja pasar todo", () => {
    expect(monthInYears("1999-12", null)).toBe(true);
  });
});

describe("yearExpr", () => {
  it("arma un $in sobre el $year del campo", () => {
    expect(yearExpr("date", [2025, 2026])).toEqual({ $in: [{ $year: "$date" }, [2025, 2026]] });
  });
});
