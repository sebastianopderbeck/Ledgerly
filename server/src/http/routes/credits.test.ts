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
    expect(res.body[0].totalUsd).toBeNull();
  });
});

describe("PATCH /api/credits/coupons/:id", () => {
  it("setea el TC manual y recalcula totalUsd", async () => {
    const list = await request(app).get("/api/credits/coupons");
    const first = list.body[0];
    const res = await request(app).patch(`/api/credits/coupons/${first.id}`).send({ tipoCambioUsd: 1350 });
    expect(res.status).toBe(200);
    expect(res.body.tipoCambioUsd).toBe(1350);
    expect(res.body.tipoCambioSource).toBe("manual");
    expect(res.body.totalUsd).toBeCloseTo(first.totalDebitado / 1350, 2);
  });

  it("rechaza tipoCambioUsd no positivo", async () => {
    const list = await request(app).get("/api/credits/coupons");
    const res = await request(app).patch(`/api/credits/coupons/${list.body[0].id}`).send({ tipoCambioUsd: 0 });
    expect(res.status).toBe(400);
  });

  it("404 si el cupón no existe", async () => {
    const res = await request(app).patch("/api/credits/coupons/64b7f9c2a1b2c3d4e5f60718").send({ tipoCambioUsd: 1350 });
    expect(res.status).toBe(404);
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
