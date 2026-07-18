import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { AutoCouponModel } from "../../db/models.js";
import { RAW_AUTO_COUPONS } from "../../testing/autoCouponFixtures.js";

withDb();
const app = createApp();

beforeEach(async () => {
  await AutoCouponModel.insertMany(
    RAW_AUTO_COUPONS.map((c) => ({
      ...c,
      fechaEmision: new Date(c.fechaEmision),
      fechaVencimiento: new Date(c.fechaVencimiento),
      sourceFileName: `${c.cuotaNro}.pdf`,
      sourceHash: `h${c.cuotaNro}`,
    })),
  );
});

describe("GET /api/auto/coupons", () => {
  it("lista los cupones ordenados con conceptos", async () => {
    const res = await request(app).get("/api/auto/coupons");
    expect(res.body).toHaveLength(4);
    expect(res.body[0].cuotaNro).toBe(2);
    expect(res.body[0].conceptos.length).toBeGreaterThan(5);
    expect(res.body[0].totalUsd).toBeNull();
  });
});

describe("GET /api/auto/summary", () => {
  it("devuelve el avance derivado", async () => {
    const res = await request(app).get("/api/auto/summary");
    expect(res.body.cuotasPagadas).toBe(4);
    expect(res.body.cuotasTotales).toBe(120);
    expect(res.body.valorActualAuto).toBe(41580000);
  });

  it("devuelve 204 sin cupones", async () => {
    await AutoCouponModel.deleteMany({});
    const res = await request(app).get("/api/auto/summary");
    expect(res.status).toBe(204);
  });
});

describe("PATCH /api/auto/coupons/:id", () => {
  it("setea el TC manual y recalcula totalUsd", async () => {
    const list = await request(app).get("/api/auto/coupons");
    const first = list.body[0];
    const res = await request(app).patch(`/api/auto/coupons/${first.id}`).send({ tipoCambioUsd: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.tipoCambioSource).toBe("manual");
    expect(res.body.totalUsd).toBeCloseTo(first.totalAPagar / 1000, 2);
  });

  it("rechaza tipoCambioUsd no positivo", async () => {
    const list = await request(app).get("/api/auto/coupons");
    const res = await request(app).patch(`/api/auto/coupons/${list.body[0].id}`).send({ tipoCambioUsd: 0 });
    expect(res.status).toBe(400);
  });

  it("404 si el cupón no existe", async () => {
    const res = await request(app).patch("/api/auto/coupons/64b7f9c2a1b2c3d4e5f60718").send({ tipoCambioUsd: 1000 });
    expect(res.status).toBe(404);
  });
});
