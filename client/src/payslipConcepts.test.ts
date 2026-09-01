import { describe, it, expect } from "vitest";
import type { PayslipDTO } from "@ledgerly/shared";
import { buildCompositionData, byPeriodo } from "./payslipConcepts.js";

const recibo = (periodo: string, tipo: PayslipDTO["tipo"] = "mensual"): PayslipDTO => ({
  id: `${periodo}-${tipo}`,
  periodo,
  tipo,
  fechaPago: `${periodo}-28`,
  cuil: "20-11111111-2",
  conceptos: [{ codigo: "0430", label: "RETENCION 4º CATEGORÍA", tipo: "descuento", monto: 10 }],
  remunerativo: 100,
  noRemunerativo: 0,
  descuentos: 10,
  brutoTotal: 100,
  neto: 90,
  costoTotalEmpleador: null,
  tipoCambioUsd: null,
  tipoCambioSource: null,
  netoUsd: null,
});

const periodos = ["2026-05", "2026-07", "2026-06"];

describe("byPeriodo", () => {
  it("ordena del más reciente al más antiguo por defecto", () => {
    const rows = periodos.map((p) => recibo(p)).sort(byPeriodo);
    expect(rows.map((r) => r.periodo)).toEqual(["2026-07", "2026-06", "2026-05"]);
  });

  it("ordena cronológicamente cuando se le pide ascendente", () => {
    const rows = periodos.map((p) => recibo(p)).sort((a, b) => byPeriodo(a, b, "asc"));
    expect(rows.map((r) => r.periodo)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });
});

describe("buildCompositionData", () => {
  it("arma las filas del gráfico en orden cronológico", () => {
    const { rows } = buildCompositionData(periodos.map((p) => recibo(p)));
    expect(rows.map((r) => r.month)).toEqual(["2026-05", "2026-06", "2026-07"]);
  });
});
