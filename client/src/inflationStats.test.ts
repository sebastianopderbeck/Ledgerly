import { describe, it, expect } from "vitest";
import type { InflationRateDTO } from "@ledgerly/shared";
import { accumulatedInflation } from "./inflationStats.js";

const inflation = (rows: [string, number][]): InflationRateDTO[] =>
  rows.map(([periodo, variacionMensual]) => ({ periodo, variacionMensual }));

describe("accumulatedInflation", () => {
  it("acumula YTD del año elegido, primer punto = variación de enero", () => {
    const result = accumulatedInflation(
      inflation([["2024-12", 8], ["2025-01", 2], ["2025-02", 2], ["2025-03", 2]]),
      ["2025"],
    );
    expect(result.map((p) => p.periodo)).toEqual(["2025-01", "2025-02", "2025-03"]);
    expect(result[0].acumulado).toBeCloseTo(2, 6);
    expect(result[2].acumulado).toBeCloseTo(6.1208, 4);
  });

  it("con varios años acumula atravesándolos", () => {
    const result = accumulatedInflation(inflation([["2024-12", 10], ["2025-01", 2]]), ["2024", "2025"]);
    expect(result.map((p) => p.periodo)).toEqual(["2024-12", "2025-01"]);
    expect(result[0].acumulado).toBeCloseTo(10, 6);
    expect(result[1].acumulado).toBeCloseTo(12.2, 6);
  });

  it("con años no contiguos muestra solo los elegidos pero acumula también los años del medio", () => {
    const result = accumulatedInflation(
      inflation([["2024-12", 10], ["2025-01", 50], ["2026-01", 2]]),
      ["2024", "2026"],
    );
    expect(result.map((p) => p.periodo)).toEqual(["2024-12", "2026-01"]);
    expect(result[0].acumulado).toBeCloseTo(10, 6);
    expect(result[1].acumulado).toBeCloseTo(68.3, 6);
  });

  it("ordena la salida por período aunque la entrada venga desordenada", () => {
    const result = accumulatedInflation(inflation([["2025-03", 1], ["2025-01", 1], ["2025-02", 1]]), ["2025"]);
    expect(result.map((p) => p.periodo)).toEqual(["2025-01", "2025-02", "2025-03"]);
  });

  it("devuelve [] con serie vacía", () => {
    expect(accumulatedInflation([], ["2025"])).toEqual([]);
  });

  it("devuelve [] si el año no tiene datos en la serie", () => {
    expect(accumulatedInflation(inflation([["2024-01", 5]]), ["2025"])).toEqual([]);
  });
});
