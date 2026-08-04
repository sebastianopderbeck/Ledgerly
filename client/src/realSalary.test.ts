import { describe, it, expect } from "vitest";
import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";
import { deflateToLatest } from "./realSalary.js";

const payslip = (periodo: string, neto: number): PayslipDTO => ({
  id: periodo, periodo, fechaPago: `${periodo}-05`, cuil: "20-1-3", conceptos: [],
  remunerativo: neto, noRemunerativo: 0, descuentos: 0, brutoTotal: neto, neto,
  costoTotalEmpleador: null, tipoCambioUsd: null, tipoCambioSource: null, netoUsd: null,
});

const inflation = (rows: [string, number][]): InflationRateDTO[] =>
  rows.map(([periodo, variacionMensual]) => ({ periodo, variacionMensual }));

describe("deflateToLatest", () => {
  it("deflacta acumulando la inflación posterior al recibo", () => {
    const result = deflateToLatest(
      [payslip("2025-01", 1000)],
      inflation([["2025-01", 5], ["2025-02", 10], ["2025-03", 10]]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].periodo).toBe("2025-01");
    expect(result[0].netoReal).toBeCloseTo(1210, 6);
  });

  it("no toca el recibo del último período (factor 1)", () => {
    const result = deflateToLatest(
      [payslip("2025-03", 1000)],
      inflation([["2025-01", 5], ["2025-02", 10], ["2025-03", 10]]),
    );
    expect(result).toEqual([{ periodo: "2025-03", netoReal: 1000 }]);
  });

  it("usa factor 1 para recibos posteriores al último IPC", () => {
    const result = deflateToLatest(
      [payslip("2025-05", 1000)],
      inflation([["2025-01", 5], ["2025-02", 10]]),
    );
    expect(result).toEqual([{ periodo: "2025-05", netoReal: 1000 }]);
  });

  it("ignora meses ausentes en la serie (hueco = 0%)", () => {
    const result = deflateToLatest(
      [payslip("2025-01", 1000)],
      inflation([["2025-01", 5], ["2025-03", 10]]),
    );
    expect(result).toEqual([{ periodo: "2025-01", netoReal: 1100 }]);
  });

  it("devuelve [] sin serie de inflación", () => {
    expect(deflateToLatest([payslip("2025-01", 1000)], [])).toEqual([]);
  });

  it("ordena la salida por período", () => {
    const result = deflateToLatest(
      [payslip("2025-02", 2000), payslip("2025-01", 1000)],
      inflation([["2025-01", 0], ["2025-02", 0]]),
    );
    expect(result.map((p) => p.periodo)).toEqual(["2025-01", "2025-02"]);
  });
});
