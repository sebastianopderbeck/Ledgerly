import { describe, it, expect } from "vitest";
import { autoMonthlyGrowth, couponMonthlyGrowth, mortgageMonthlyGrowth, seriesMonthlyGrowth } from "./planGrowth.js";

describe("seriesMonthlyGrowth", () => {
  it("compone el aumento mensual entre el último dato y el de hace N meses", () => {
    const points = [
      { fecha: "2026-04-06", valor: 500 },
      { fecha: "2026-07-06", valor: 1_000 },
      { fecha: "2026-08-20", valor: 5_000 },
      { fecha: "2026-10-06", valor: 1_061.208 },
    ];
    expect(seriesMonthlyGrowth(points, 3)).toBeCloseTo(0.02, 6);
  });

  it("con un hueco en la serie toma el dato anterior y estira el período", () => {
    const points = [
      { fecha: "2026-08-07", valor: 1_000 },
      { fecha: "2026-10-06", valor: 1_040.4 },
    ];
    expect(seriesMonthlyGrowth(points, 1)).toBeCloseTo(0.02, 6);
  });

  it("sin un dato de hace N meses no mide nada", () => {
    expect(seriesMonthlyGrowth([], 3)).toBeNull();
    expect(seriesMonthlyGrowth([{ fecha: "2026-09-06", valor: 1_000 }, { fecha: "2026-10-06", valor: 1_020 }], 3)).toBeNull();
    expect(seriesMonthlyGrowth([{ fecha: "2026-07-06", valor: 0 }, { fecha: "2026-10-06", valor: 1_020 }], 3)).toBeNull();
  });
});

describe("couponMonthlyGrowth", () => {
  it("compone el aumento por cuota dentro de la ventana de cupones", () => {
    const coupons = [
      { cuotaNro: 1, valor: 1 },
      { cuotaNro: 2, valor: 1_000 },
      { cuotaNro: 5, valor: 5_000 },
      { cuotaNro: 8, valor: 1_126.162419264 },
    ];
    expect(couponMonthlyGrowth(coupons, 6)).toBeCloseTo(0.02, 6);
  });

  it("con cupones salteados divide por las cuotas que pasaron", () => {
    const coupons = [
      { cuotaNro: 12, valor: 1_040.4 },
      { cuotaNro: 10, valor: 1_000 },
    ];
    expect(couponMonthlyGrowth(coupons, 3)).toBeCloseTo(0.02, 6);
  });

  it("con un solo cupón o un valor en cero no mide nada", () => {
    expect(couponMonthlyGrowth([], 3)).toBeNull();
    expect(couponMonthlyGrowth([{ cuotaNro: 4, valor: 1_000 }], 3)).toBeNull();
    expect(couponMonthlyGrowth([{ cuotaNro: 3, valor: 0 }, { cuotaNro: 4, valor: 1_000 }], 3)).toBeNull();
  });
});

describe("mortgageMonthlyGrowth", () => {
  const uva = [
    { fecha: "2026-07-06", valor: 1_000 },
    { fecha: "2026-10-06", valor: 1_061.208 },
  ];
  const cotizaciones = [
    { cuotaNro: 12, valor: 1_000 },
    { cuotaNro: 13, valor: 1_050 },
  ];

  it("usa la serie UVA de los últimos 3 meses", () => {
    expect(mortgageMonthlyGrowth(uva, cotizaciones)).toBeCloseTo(0.02, 6);
  });

  it("sin serie UVA usa la cotización de los últimos cupones", () => {
    expect(mortgageMonthlyGrowth([], cotizaciones)).toBeCloseTo(0.05, 6);
  });

  it("sin datos no aumenta", () => {
    expect(mortgageMonthlyGrowth([], [])).toBe(0);
  });
});

describe("autoMonthlyGrowth", () => {
  it("usa el valor móvil de los últimos 6 cupones", () => {
    const valores = [
      { cuotaNro: 18, valor: 1 },
      { cuotaNro: 19, valor: 1_000 },
      { cuotaNro: 25, valor: 1_126.162419264 },
    ];
    expect(autoMonthlyGrowth(valores)).toBeCloseTo(0.02, 6);
  });

  it("sin datos no aumenta", () => {
    expect(autoMonthlyGrowth([{ cuotaNro: 25, valor: 1_000 }])).toBe(0);
  });
});
