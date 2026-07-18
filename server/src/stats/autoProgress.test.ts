import { describe, it, expect } from "vitest";
import { computeAutoProgress } from "./autoProgress.js";
import { RAW_AUTO_COUPONS } from "../testing/autoCouponFixtures.js";

const inputs = RAW_AUTO_COUPONS.map((c) => ({
  grupo: c.grupo, orden: c.orden, plan: c.plan, modelo: c.modelo, cuotaNro: c.cuotaNro,
  fechaVencimiento: c.fechaVencimiento, valorMovil: c.valorMovil, totalAPagar: c.totalAPagar,
  totalUsd: null,
}));

describe("computeAutoProgress", () => {
  it("devuelve null sin cupones", () => {
    expect(computeAutoProgress([])).toBeNull();
  });

  it("deriva el avance con los cupones", () => {
    const r = computeAutoProgress(inputs)!;
    expect(r.cuotasPagadas).toBe(4);
    expect(r.cuotasTotales).toBe(120);
    expect(r.porcentajeAvance).toBeCloseTo(4 / 120, 5);
    expect(r.totalPagado).toBeCloseTo(1428724.71, 2);
    expect(r.valorActualAuto).toBe(41580000);
    expect(r.ultimaCuota).toBe(22);
    expect(r.fechaUltimoVencimiento).toBe("2026-07-10");
    expect(r.modelo).toBe("AIRCROSS T200 FEEL PK MY26");
  });

  it("suma totalPagadoUsd de los que tienen TC", () => {
    const withUsd = inputs.map((c, i) => ({ ...c, totalUsd: i === 0 ? 200 : null }));
    const r = computeAutoProgress(withUsd)!;
    expect(r.totalPagadoUsd).toBe(200);
  });
});
