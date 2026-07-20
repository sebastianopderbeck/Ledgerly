import { describe, it, expect } from "vitest";
import type { AutoCouponDTO } from "@ledgerly/shared";
import { buildCompositionData, rawKey } from "./autoConcepts.js";

const makeCoupon = (
  cuotaNro: number,
  fechaVencimiento: string,
  conceptos: AutoCouponDTO["conceptos"],
): AutoCouponDTO => ({
  id: `c-${cuotaNro}`,
  grupo: "3684",
  orden: "97",
  cuotaNro,
  plan: "K",
  fechaEmision: "2024-10-18",
  fechaVencimiento,
  comprobante: "x",
  modelo: "C3 AIRCROSS",
  valorMovil: 1,
  conceptos,
  totalAPagar: 1,
  tipoCambioUsd: null,
  tipoCambioSource: null,
  totalUsd: null,
});

const coupons = [
  makeCoupon(2, "2024-11-11", [
    { label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 },
    { label: "DIFERIMIENTO COMERCIAL", amount: -70607.06 },
  ]),
  makeCoupon(1, "2024-10-11", [{ label: "ANTICIPO ALICUOTA (AL)", amount: 200000 }]),
];

describe("buildCompositionData", () => {
  it("ordena por cuotaNro y arma un mes YYYY-MM por cupón", () => {
    const { rows } = buildCompositionData(coupons);
    expect(rows.map((row) => row.month)).toEqual(["2024-10", "2024-11"]);
  });

  it("grafica cada concepto por su magnitud, sin valores negativos", () => {
    const { labels, rows } = buildCompositionData(coupons);
    for (const row of rows) {
      for (const label of labels) expect(Number(row[label])).toBeGreaterThanOrEqual(0);
    }
    const noviembre = rows.find((row) => row.month === "2024-11");
    expect(noviembre?.["DIFERIMIENTO COMERCIAL"]).toBe(70607.06);
  });

  it("conserva el valor real con signo para el tooltip", () => {
    const { rows } = buildCompositionData(coupons);
    const noviembre = rows.find((row) => row.month === "2024-11");
    expect(noviembre?.[rawKey("DIFERIMIENTO COMERCIAL")]).toBe(-70607.06);
  });

  it("completa con 0 los conceptos ausentes en un cupón", () => {
    const { rows } = buildCompositionData(coupons);
    const octubre = rows.find((row) => row.month === "2024-10");
    expect(octubre?.["DIFERIMIENTO COMERCIAL"]).toBe(0);
    expect(octubre?.[rawKey("DIFERIMIENTO COMERCIAL")]).toBe(0);
  });
});
