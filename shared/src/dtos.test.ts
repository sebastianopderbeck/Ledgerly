import { describe, it, expect } from "vitest";
import { mortgageCouponDtoSchema, creditSummaryDtoSchema, importResultUnionSchema } from "./dtos.js";

describe("mortgageCouponDtoSchema", () => {
  it("valida un cupón", () => {
    const dto = {
      id: "x", prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18",
      capital: 184689.39, intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93,
      cuotaPuraUva: 699.6, cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84,
      tea: 9.27, tna: 8.9, cft: 0,
    };
    expect(mortgageCouponDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("creditSummaryDtoSchema", () => {
  it("valida el resumen de avance", () => {
    const dto = {
      prestamoNro: "0405727408", cuotasPagadas: 11, cuotasTotales: 240,
      totalPagado: 1, capitalPagado: 1, interesPagado: 1, seguroPagado: 1,
      capitalOriginalUva: 1, capitalAmortizadoUva: 1, capitalPendienteUva: 1, capitalPendientePesos: 1,
      porcentajeAvanceCapital: 0.017, cotizacionUvaActual: 1998.77, cuotaPuraUva: 699.6, tna: 8.9,
    };
    expect(creditSummaryDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("importResultUnionSchema", () => {
  it("discrimina por kind", () => {
    const coupon = { kind: "coupon", status: "imported", coupon: {
      id: "x", prestamoNro: "1", cuotaNro: 1, fechaDebito: "2025-08-18", capital: 1, intereses: 1,
      seguroIncendio: 1, totalDebitado: 1, cuotaPuraUva: 1, cotizacionUva: 1, capitalUva: 1, interesUva: 1,
      tea: 1, tna: 1, cft: 0 } };
    expect(importResultUnionSchema.parse(coupon).kind).toBe("coupon");
  });
});
