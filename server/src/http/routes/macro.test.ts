import { describe, it, expect } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { InflationRateModel, MacroSeriesModel } from "../../db/models.js";
import { createApp } from "../app.js";

withDb();
const app = createApp();

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
