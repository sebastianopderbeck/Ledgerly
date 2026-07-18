import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../fx/dollarRate.js";
import { backfillCouponRates } from "./backfillRates.js";
import { MortgageCouponModel } from "../db/models.js";

withDb();
const mockedFx = vi.mocked(fetchOficialRate);

const base = {
  prestamoNro: "0405727408", fechaDebito: new Date("2025-08-18"), capital: 1, intereses: 1,
  seguroIncendio: 1, totalDebitado: 1000, cuotaPuraUva: 1, cotizacionUva: 1, tea: 9.27, tna: 8.9, cft: 0,
  sourceFileName: "x.pdf",
};

beforeEach(async () => {
  await MortgageCouponModel.insertMany([
    { ...base, cuotaNro: 1, sourceHash: "h1" },
    { ...base, cuotaNro: 2, sourceHash: "h2", tipoCambioUsd: 999, tipoCambioSource: "manual" },
  ]);
});

describe("backfillCouponRates", () => {
  it("completa solo los cupones sin TC", async () => {
    mockedFx.mockResolvedValue(1350);
    const r = await backfillCouponRates();
    expect(r.updated).toBe(1);
    const c1 = await MortgageCouponModel.findOne({ cuotaNro: 1 });
    expect(c1?.tipoCambioUsd).toBe(1350);
    expect(c1?.tipoCambioSource).toBe("api");
    const c2 = await MortgageCouponModel.findOne({ cuotaNro: 2 });
    expect(c2?.tipoCambioUsd).toBe(999);
  });

  it("cuenta como skipped si la API no devuelve dato", async () => {
    mockedFx.mockResolvedValue(null);
    const r = await backfillCouponRates();
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(1);
  });
});
