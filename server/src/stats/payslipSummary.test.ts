import { describe, it, expect } from "vitest";
import { computePayslipSummary, type PayslipSummaryInput } from "./payslipSummary.js";

const recibo = (periodo: string, tipo: "mensual" | "sac", neto: number): PayslipSummaryInput => ({
  periodo,
  tipo,
  neto,
  brutoTotal: neto * 2,
  descuentos: neto,
  netoUsd: null,
});

describe("computePayslipSummary", () => {
  const payslips = [
    recibo("2026-05", "mensual", 100),
    recibo("2026-06", "mensual", 200),
    recibo("2026-06", "sac", 90),
  ];

  it("toma el último recibo mensual y no el aguinaldo del mismo período", () => {
    const summary = computePayslipSummary(payslips);
    expect(summary?.ultimoPeriodo).toBe("2026-06");
    expect(summary?.ultimoNeto).toBe(200);
  });

  it("compara contra el mes anterior ignorando el aguinaldo", () => {
    expect(computePayslipSummary(payslips)?.variacionNetoMensual).toBeCloseTo(1);
  });

  it("cuenta solo los períodos mensuales", () => {
    expect(computePayslipSummary(payslips)?.periodos).toBe(2);
  });

  it("suma el aguinaldo al neto acumulado del año", () => {
    expect(computePayslipSummary(payslips)?.netoAcumuladoAnio).toBe(390);
  });

  it("cuenta los recibos del año sin mezclar años anteriores", () => {
    const conAnioAnterior = [recibo("2025-12", "mensual", 50), ...payslips];
    const summary = computePayslipSummary(conAnioAnterior);
    expect(summary?.recibosAnio).toBe(3);
    expect(summary?.periodos).toBe(3);
  });

  it("devuelve null sin recibos mensuales", () => {
    expect(computePayslipSummary([])).toBeNull();
    expect(computePayslipSummary([recibo("2026-06", "sac", 90)])).toBeNull();
  });
});
