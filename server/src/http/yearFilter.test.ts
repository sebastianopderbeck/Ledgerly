import { describe, it, expect } from "vitest";
import { monthInYears, parseYears, yearDateRanges } from "./yearFilter.js";

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

describe("yearDateRanges", () => {
  it("arma un rango [1/1, 1/1 del año siguiente) en UTC por año", () => {
    expect(yearDateRanges([2025, 2026])).toEqual([
      { date: { $gte: new Date("2025-01-01T00:00:00.000Z"), $lt: new Date("2026-01-01T00:00:00.000Z") } },
      { date: { $gte: new Date("2026-01-01T00:00:00.000Z"), $lt: new Date("2027-01-01T00:00:00.000Z") } },
    ]);
  });
});
