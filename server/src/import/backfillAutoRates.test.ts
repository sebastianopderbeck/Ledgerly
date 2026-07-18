import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";

vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../fx/dollarRate.js";
import { backfillAutoRates } from "./backfillAutoRates.js";
import { AutoCouponModel } from "../db/models.js";

withDb();
const mockedFx = vi.mocked(fetchOficialRate);

const base = {
  grupo: "3684", orden: "97", plan: "K", fechaEmision: new Date("2024-10-18"),
  fechaVencimiento: new Date("2024-11-11"), comprobante: "c", modelo: "C3", valorMovil: 1,
  conceptos: [], totalAPagar: 1000, sourceFileName: "x.pdf",
};

beforeEach(async () => {
  await AutoCouponModel.insertMany([
    { ...base, cuotaNro: 1, sourceHash: "h1" },
    { ...base, cuotaNro: 2, sourceHash: "h2", tipoCambioUsd: 999, tipoCambioSource: "manual" },
  ]);
});

describe("backfillAutoRates", () => {
  it("completa solo los cupones sin TC", async () => {
    mockedFx.mockResolvedValue(1000);
    const r = await backfillAutoRates();
    expect(r.updated).toBe(1);
    const c1 = await AutoCouponModel.findOne({ cuotaNro: 1 });
    expect(c1?.tipoCambioUsd).toBe(1000);
    expect(c1?.tipoCambioSource).toBe("api");
    const c2 = await AutoCouponModel.findOne({ cuotaNro: 2 });
    expect(c2?.tipoCambioUsd).toBe(999);
  });

  it("cuenta como skipped si la API no devuelve dato", async () => {
    mockedFx.mockResolvedValue(null);
    const r = await backfillAutoRates();
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(1);
  });
});
