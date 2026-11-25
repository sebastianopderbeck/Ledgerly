import { describe, it, expect } from "vitest";
import type { PayslipConceptoDTO, PayslipDTO } from "@ledgerly/shared";
import {
  CODIGO_AJUSTE_ANIO_ANTERIOR,
  CODIGOS_APORTES_DEDUCIBLES,
  CODIGOS_RETENIDO,
  sumarConceptos,
} from "./gananciasConceptos.js";

const concepto = (codigo: string, monto: number, tipo: PayslipConceptoDTO["tipo"] = "descuento"): PayslipConceptoDTO => ({
  codigo, label: codigo, tipo, monto,
});

const recibo = (conceptos: PayslipConceptoDTO[]): PayslipDTO => ({
  id: "r1", periodo: "2026-03", tipo: "mensual", fechaPago: "2026-03-31", cuil: "20-1-3", conceptos,
  remunerativo: 10000, noRemunerativo: 0, descuentos: 0, brutoTotal: 10000, neto: 10000,
  costoTotalEmpleador: null, tipoCambioUsd: null, tipoCambioSource: null, netoUsd: null,
});

const completo = recibo([
  concepto("0201", 10000, "remunerativo"),
  concepto("0403", 1000),
  concepto("0402", 300),
  concepto("0422", 200),
  concepto("0430", 900),
  concepto("0433", -400),
  concepto("0446", -50),
]);

describe("sumarConceptos", () => {
  it("suma los aportes deducibles", () => {
    expect(sumarConceptos(completo, CODIGOS_APORTES_DEDUCIBLES)).toBe(1500);
  });

  it("suma retención y devolución con su signo", () => {
    expect(sumarConceptos(completo, CODIGOS_RETENIDO)).toBe(500);
  });

  it("el ajuste del año anterior no es retenido", () => {
    expect(CODIGOS_RETENIDO.has(CODIGO_AJUSTE_ANIO_ANTERIOR)).toBe(false);
  });

  it("da 0 si el recibo no trae esos códigos", () => {
    expect(sumarConceptos(recibo([concepto("0201", 10000, "remunerativo")]), CODIGOS_RETENIDO)).toBe(0);
  });
});
