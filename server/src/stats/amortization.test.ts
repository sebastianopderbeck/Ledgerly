import { describe, it, expect } from "vitest";
import { computeCreditProgress } from "./amortization.js";
import { RAW_COUPONS } from "../testing/couponFixtures.js";

const inputs = RAW_COUPONS.map((c) => ({
  prestamoNro: c.prestamoNro, cuotaNro: c.cuotaNro, capital: c.capital, intereses: c.intereses,
  seguroIncendio: c.seguroIncendio, totalDebitado: c.totalDebitado, cuotaPuraUva: c.cuotaPuraUva,
  cotizacionUva: c.cotizacionUva, tna: c.tna,
}));

describe("computeCreditProgress", () => {
  it("devuelve null sin cupones", () => {
    expect(computeCreditProgress([])).toBeNull();
  });

  it("deriva el avance con los 11 cupones reales", () => {
    const r = computeCreditProgress(inputs)!;
    expect(r.cuotasPagadas).toBe(11);
    expect(r.cuotasTotales).toBe(240);
    expect(r.capitalOriginalUva).toBeCloseTo(78316.73, 0);
    expect(r.capitalPendienteUva).toBeCloseTo(76960.84, 0);
    expect(r.capitalAmortizadoUva).toBeCloseTo(1355.89, 0);
    expect(r.porcentajeAvanceCapital).toBeCloseTo(0.0173, 3);
    expect(r.totalPagado).toBeCloseTo(13594820.38, 1);
    expect(r.interesPagado).toBeCloseTo(11097965.12, 1);
    expect(r.seguroPagado).toBeCloseTo(117881.48, 1);
    expect(r.cotizacionUvaActual).toBe(1998.77);
  });

  it("usa la TNA como fallback con un solo cupón", () => {
    const r = computeCreditProgress([inputs[0]])!;
    expect(r.cuotasPagadas).toBe(1);
    expect(r.cuotasTotales).toBe(240);
  });

  it("devuelve null si no se puede establecer una tasa positiva (tna=0, un solo cupón)", () => {
    const bad = { ...inputs[0], tna: 0 };
    expect(computeCreditProgress([bad])).toBeNull();
  });
});
