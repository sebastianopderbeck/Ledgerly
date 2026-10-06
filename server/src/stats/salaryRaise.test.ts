import { describe, it, expect } from "vitest";
import { expectedMonthlyInflation, raiseFactor, raisesBetween, type SalaryInflation } from "./salaryRaise.js";

const publicada = (pares: Array<[string, number]>) => pares.map(([periodo, variacion]) => ({ periodo, variacion }));

const compuesto = (tasas: number[]): number => tasas.reduce((factor, tasa) => factor * (1 + tasa), 1) - 1;

describe("expectedMonthlyInflation", () => {
  it("pasa la expectativa anual del REM a una tasa mensual equivalente", () => {
    expect(expectedMonthlyInflation(26.8242, [])).toBeCloseTo(0.02, 6);
  });

  it("sin REM usa el último IPC publicado", () => {
    expect(expectedMonthlyInflation(null, publicada([["2026-08", 0.017], ["2026-07", 0.019]]))).toBe(0.017);
  });

  it("sin REM ni IPC no estima inflación", () => {
    expect(expectedMonthlyInflation(null, [])).toBe(0);
  });
});

describe("raisesBetween", () => {
  const inflacion: SalaryInflation = {
    publicada: publicada([
      ["2026-05", 0.015], ["2026-06", 0.016], ["2026-07", 0.018], ["2026-08", 0.017], ["2026-09", 0.02],
    ]),
    esperadaMensual: 0.01,
  };

  it("el aumento de enero compone el IPC de septiembre a diciembre, con la tasa esperada para lo no publicado", () => {
    expect(raisesBetween("2026-09", "2027-03", inflacion)).toEqual([
      { mes: "2027-01", porcentaje: expect.closeTo(compuesto([0.02, 0.01, 0.01, 0.01]), 10), conRem: true },
    ]);
  });

  it("con los 4 meses publicados el aumento no usa el REM", () => {
    expect(raisesBetween("2026-08", "2026-09", inflacion)).toEqual([
      { mes: "2026-09", porcentaje: expect.closeTo(compuesto([0.015, 0.016, 0.018, 0.017]), 10), conRem: false },
    ]);
  });

  it("no cuenta el aumento del mes del último recibo, que ya lo trae", () => {
    expect(raisesBetween("2026-09", "2026-12", inflacion)).toEqual([]);
  });

  it("devuelve los aumentos en orden cuando hay más de uno", () => {
    expect(raisesBetween("2026-09", "2027-06", inflacion).map((raise) => raise.mes)).toEqual(["2027-01", "2027-05"]);
  });
});

describe("raiseFactor", () => {
  it("compone los aumentos", () => {
    expect(raiseFactor([
      { mes: "2027-01", porcentaje: 0.1, conRem: true },
      { mes: "2027-05", porcentaje: 0.05, conRem: true },
    ])).toBeCloseTo(1.155, 10);
  });

  it("sin aumentos deja el sueldo igual", () => {
    expect(raiseFactor([])).toBe(1);
  });
});
