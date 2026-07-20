import { describe, it, expect } from "vitest";
import { mortgageCouponDtoSchema, creditSummaryDtoSchema, importResultUnionSchema } from "./dtos.js";

describe("mortgageCouponDtoSchema", () => {
  it("valida un cupón", () => {
    const dto = {
      id: "x", prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18",
      capital: 184689.39, intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93,
      cuotaPuraUva: 699.6, cotizacionUva: 1555.16, capitalUva: 118.76, interesUva: 580.84,
      tea: 9.27, tna: 8.9, cft: 0,
      tipoCambioUsd: 1350.5, tipoCambioSource: "api", totalUsd: 1044.58,
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
      tea: 1, tna: 1, cft: 0,
      tipoCambioUsd: null, tipoCambioSource: null, totalUsd: null } };
    expect(importResultUnionSchema.parse(coupon).kind).toBe("coupon");
  });
});

import { autoCouponDtoSchema, autoSummaryDtoSchema } from "./dtos.js";

describe("autoCouponDtoSchema", () => {
  it("valida un cupón de auto con conceptos", () => {
    const dto = {
      id: "x", grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
      fechaEmision: "2024-10-18", fechaVencimiento: "2024-11-11", comprobante: "000062757060",
      modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01,
      conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }, { label: "DIFERIMIENTO COMERCIAL", amount: -70607.06 }],
      totalAPagar: 268551.23, tipoCambioUsd: 1000, tipoCambioSource: "api", totalUsd: 268.55,
    };
    expect(autoCouponDtoSchema.parse(dto)).toEqual(dto);
  });
});

describe("autoSummaryDtoSchema", () => {
  it("valida el resumen del plan", () => {
    const dto = {
      grupo: "3684", orden: "97", plan: "K", modelo: "C3 AIRCROSS",
      cuotasPagadas: 4, cuotasTotales: 120, porcentajeAvance: 0.0333, totalPagado: 1428724.71,
      valorActualAuto: 41580000, totalPagadoUsd: 1000, ultimaCuota: 22, fechaUltimoVencimiento: "2026-07-10",
    };
    expect(autoSummaryDtoSchema.parse(dto)).toEqual(dto);
  });
});

import { oficialRateDtoSchema, monthlyUsdStatSchema } from "./dtos.js";

describe("oficialRateDtoSchema", () => {
  it("valida la cotización oficial y acepta rate null", () => {
    expect(oficialRateDtoSchema.parse({ date: "2026-07-20", rate: 1000, source: "oficial" }))
      .toEqual({ date: "2026-07-20", rate: 1000, source: "oficial" });
    expect(oficialRateDtoSchema.parse({ date: "2026-07-20", rate: null, source: "oficial" }).rate).toBeNull();
  });
});

describe("monthlyUsdStatSchema", () => {
  it("valida un punto mensual en USD y acepta rate/totalUsd null", () => {
    const dto = { month: "2026-05", totalArs: 2000, rate: 1000, totalUsd: 2 };
    expect(monthlyUsdStatSchema.parse(dto)).toEqual(dto);
    expect(monthlyUsdStatSchema.parse({ month: "2026-06", totalArs: 500, rate: null, totalUsd: null }).totalUsd).toBeNull();
  });
});
