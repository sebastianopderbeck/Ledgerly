import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { MortgageCouponModel } from "../../db/models.js";
import { RAW_COUPONS } from "../../testing/couponFixtures.js";

withDb();
const app = createApp();

beforeEach(async () => {
  await MortgageCouponModel.insertMany(
    RAW_COUPONS.map((c) => ({ ...c, fechaDebito: new Date(c.fechaDebito), sourceFileName: `${c.cuotaNro}.pdf`, sourceHash: `h${c.cuotaNro}` })),
  );
});

describe("GET /api/credits/coupons", () => {
  it("lista los cupones ordenados con UVA derivada", async () => {
    const res = await request(app).get("/api/credits/coupons");
    expect(res.body).toHaveLength(11);
    expect(res.body[0].cuotaNro).toBe(1);
    expect(res.body[0].capitalUva).toBeCloseTo(118.76, 1);
  });
});

describe("GET /api/credits/summary", () => {
  it("devuelve el avance derivado", async () => {
    const res = await request(app).get("/api/credits/summary");
    expect(res.body.cuotasPagadas).toBe(11);
    expect(res.body.cuotasTotales).toBe(240);
    expect(res.body.capitalPendienteUva).toBeCloseTo(76960.84, 0);
  });

  it("devuelve 204 sin cupones", async () => {
    await MortgageCouponModel.deleteMany({});
    const res = await request(app).get("/api/credits/summary");
    expect(res.status).toBe(204);
  });
});
