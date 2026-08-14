import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";

vi.mock("../../fx/macroSources.js", () => ({
  MACRO_START: "2025-01-01",
  fetchOficialSeries: vi.fn(),
  fetchUvaSeries: vi.fn(),
  fetchTasa30Series: vi.fn(),
}));
vi.mock("../../fx/inflationRate.js", () => ({ fetchInflationSeries: vi.fn() }));
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));

import { fetchOficialSeries, fetchTasa30Series, fetchUvaSeries } from "../../fx/macroSources.js";
import { fetchInflationSeries } from "../../fx/inflationRate.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import { InflationRateModel, MacroSeriesModel, MortgageCouponModel } from "../../db/models.js";
import { createApp } from "../app.js";

withDb();
const app = createApp();

const mockedUsd = vi.mocked(fetchOficialSeries);
const mockedUva = vi.mocked(fetchUvaSeries);
const mockedTasa = vi.mocked(fetchTasa30Series);
const mockedInflacion = vi.mocked(fetchInflationSeries);
const mockedRate = vi.mocked(fetchOficialRate);

describe("GET /api/macro/series", () => {
  it("devuelve la serie mensual y el spot", async () => {
    await MacroSeriesModel.create([
      { serie: "usd_oficial", fecha: "2025-01-31", valor: 1050 },
      { serie: "uva", fecha: "2025-01-31", valor: 1250.3 },
      { serie: "tasa30", fecha: "2025-01-31", valor: 29.1 },
    ]);
    await InflationRateModel.create({ periodo: "2025-01", variacionMensual: 2.2 });

    const res = await request(app).get("/api/macro/series");
    expect(res.status).toBe(200);
    expect(res.body.desde).toBe("2025-01");
    expect(res.body.meses).toEqual([
      { periodo: "2025-01", usdOficial: 1050, uva: 1250.3, tasa30: 29.1, inflacion: 2.2 },
    ]);
    expect(res.body.hoy.usdOficial).toBe(1050);
  });

  it("sin series cargadas devuelve meses vacío", async () => {
    const res = await request(app).get("/api/macro/series");
    expect(res.status).toBe(200);
    expect(res.body.meses).toEqual([]);
  });
});

describe("POST /api/macro/refresh", () => {
  const cuponBase = {
    prestamoNro: "0405727408", fechaDebito: new Date("2025-08-18"), capital: 1, intereses: 1,
    seguroIncendio: 1, totalDebitado: 1000, cuotaPuraUva: 1, cotizacionUva: 1, tea: 9.27, tna: 8.9, cft: 0,
    sourceFileName: "x.pdf",
  };

  beforeEach(async () => {
    mockedUsd.mockResolvedValue([{ fecha: "2025-01-02", valor: 1010 }, { fecha: "2025-01-03", valor: 1015 }]);
    mockedUva.mockResolvedValue([{ fecha: "2025-01-02", valor: 1250.3 }]);
    mockedTasa.mockResolvedValue([{ fecha: "2025-01-02", valor: 29.1 }]);
    mockedInflacion.mockResolvedValue([{ periodo: "2025-01", variacionMensual: 2.2 }]);
    mockedRate.mockResolvedValue(1350);
  });

  it("devuelve el resumen de lo actualizado", async () => {
    await MortgageCouponModel.insertMany([
      { ...cuponBase, cuotaNro: 1, sourceHash: "c1" },
      { ...cuponBase, cuotaNro: 2, sourceHash: "c2", tipoCambioUsd: 999, tipoCambioSource: "manual" },
    ]);

    const res = await request(app).post("/api/macro/refresh");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      series: { usdOficial: 2, uva: 1, tasa30: 1, inflacion: 1 },
      tipoCambio: {
        cupones: { updated: 1, skipped: 0 },
        auto: { updated: 0, skipped: 0 },
        sueldos: { updated: 0, skipped: 0 },
      },
    });
  });

  it("persiste las series y el tipo de cambio traídos", async () => {
    await MortgageCouponModel.create({ ...cuponBase, cuotaNro: 1, sourceHash: "c1" });

    await request(app).post("/api/macro/refresh");

    expect(await MacroSeriesModel.countDocuments()).toBe(4);
    expect(await InflationRateModel.countDocuments()).toBe(1);
    const cupon = await MortgageCouponModel.findOne({ cuotaNro: 1 });
    expect(cupon?.tipoCambioUsd).toBe(1350);
    expect(cupon?.tipoCambioSource).toBe("api");
  });

  it("es idempotente: dos llamadas seguidas no duplican puntos de serie", async () => {
    await request(app).post("/api/macro/refresh");
    await request(app).post("/api/macro/refresh");

    expect(await MacroSeriesModel.countDocuments()).toBe(4);
  });
});
