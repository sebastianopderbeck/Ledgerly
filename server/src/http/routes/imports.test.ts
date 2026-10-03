import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import type { Model, Types } from "mongoose";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import {
  AutoCouponModel, MortgageCouponModel, PayslipModel, StatementModel, TransactionModel,
} from "../../db/models.js";
import { RAW_COUPONS } from "../../testing/couponFixtures.js";
import { RAW_AUTO_COUPONS } from "../../testing/autoCouponFixtures.js";

withDb();
const app = createApp();

const money = { ars: 0, usd: 0 };
const MISSING_ID = "64b7f9c2a1b2c3d4e5f60718";

const setUploadedAt = <T>(model: Model<T>, id: Types.ObjectId, iso: string) =>
  model.collection.updateOne({ _id: id }, { $set: { uploadedAt: new Date(iso) } });

const seed = async () => {
  const statement = await StatementModel.create({
    issuer: "visa_signature", cardLabel: "Visa ****1234", last4: "1234",
    closingDate: new Date("2026-07-02"), dueDate: new Date("2026-07-13"),
    totals: { totalConsumos: money, saldoActual: money, pagoMinimo: money, saldoAnterior: money },
    sourceFileName: "visa-julio.pdf", sourceHash: "hs", pageCount: 2, parserVersion: "1",
    needsReview: true, reconciliation: { ok: false, entries: [] },
  });
  const tx = {
    statementId: statement._id, issuer: "visa_signature", cardLabel: "Visa ****1234", date: new Date("2026-06-10"),
    descriptionRaw: "COMERCIO", merchant: "COMERCIO", category: "Otros", categorySource: "rule", amount: 100,
    currency: "ARS", direction: "debit", type: "purchase", isInstallment: false, fingerprint: "f",
  };
  await TransactionModel.create([{ ...tx, fingerprint: "f1" }, { ...tx, fingerprint: "f2" }]);
  const [coupon] = RAW_COUPONS;
  const mortgage = await MortgageCouponModel.create({
    ...coupon, fechaDebito: new Date(coupon.fechaDebito), sourceFileName: "cupon-1.pdf", sourceHash: "hc",
  });
  const [autoRaw] = RAW_AUTO_COUPONS;
  const auto = await AutoCouponModel.create({
    ...autoRaw, fechaEmision: new Date(autoRaw.fechaEmision), fechaVencimiento: new Date(autoRaw.fechaVencimiento),
    sourceFileName: "auto-2.pdf", sourceHash: "ha",
  });
  const payslip = await PayslipModel.create({
    periodo: "2026-06", tipo: "sac", fechaPago: new Date("2026-06-30"), cuil: "20-1-3",
    remunerativo: 1, noRemunerativo: 0, descuentos: 0, brutoTotal: 1, neto: 1,
    sourceFileName: "recibo-sac.pdf", sourceHash: "hp",
  });
  await setUploadedAt(StatementModel, statement._id, "2026-07-05T10:00:00Z");
  await setUploadedAt(MortgageCouponModel, mortgage._id, "2026-07-01T10:00:00Z");
  await setUploadedAt(AutoCouponModel, auto._id, "2026-07-03T10:00:00Z");
  await setUploadedAt(PayslipModel, payslip._id, "2026-07-04T10:00:00Z");
  return { statement, mortgage, auto, payslip };
};

let ids: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  ids = await seed();
});

describe("GET /api/imports", () => {
  it("lista los archivos de los 4 tipos, del más reciente al más viejo", async () => {
    const res = await request(app).get("/api/imports");
    expect(res.status).toBe(200);
    expect(res.body.map((f: { kind: string }) => f.kind)).toEqual(["statement", "payslip", "auto", "coupon"]);
  });

  it("describe un resumen de tarjeta con su cantidad de movimientos", async () => {
    const res = await request(app).get("/api/imports");
    expect(res.body[0]).toEqual({
      id: ids.statement._id.toString(),
      kind: "statement",
      fileName: "visa-julio.pdf",
      uploadedAt: "2026-07-05T10:00:00.000Z",
      documentDate: "2026-07-02",
      description: "Visa ****1234 · 2 movimientos",
      needsReview: true,
    });
  });

  it("describe cupones y recibos con su fecha de documento", async () => {
    const res = await request(app).get("/api/imports");
    const [, payslip, auto, coupon] = res.body;
    expect(payslip).toMatchObject({ fileName: "recibo-sac.pdf", documentDate: "2026-06-30", description: "Período 2026-06 · SAC", needsReview: false });
    expect(auto).toMatchObject({ fileName: "auto-2.pdf", documentDate: "2024-11-11", description: "Grupo 3684 · cuota 2" });
    expect(coupon).toMatchObject({ fileName: "cupon-1.pdf", documentDate: "2025-08-18", description: "Préstamo 0405727408 · cuota 1" });
  });
});

describe("DELETE /api/imports/:kind/:id", () => {
  it("borra un resumen de tarjeta junto con sus movimientos", async () => {
    const res = await request(app).delete(`/api/imports/statement/${ids.statement._id}`);
    expect(res.status).toBe(204);
    expect(await StatementModel.countDocuments()).toBe(0);
    expect(await TransactionModel.countDocuments()).toBe(0);
  });

  it("borra un cupón del crédito hipotecario", async () => {
    const res = await request(app).delete(`/api/imports/coupon/${ids.mortgage._id}`);
    expect(res.status).toBe(204);
    expect(await MortgageCouponModel.countDocuments()).toBe(0);
  });

  it("borra un cupón del plan de auto", async () => {
    const res = await request(app).delete(`/api/imports/auto/${ids.auto._id}`);
    expect(res.status).toBe(204);
    expect(await AutoCouponModel.countDocuments()).toBe(0);
  });

  it("borra un recibo de sueldo", async () => {
    const res = await request(app).delete(`/api/imports/payslip/${ids.payslip._id}`);
    expect(res.status).toBe(204);
    expect(await PayslipModel.countDocuments()).toBe(0);
  });

  it("400 si el tipo no existe", async () => {
    const res = await request(app).delete(`/api/imports/factura/${ids.payslip._id}`);
    expect(res.status).toBe(400);
  });

  it("404 si el archivo no existe", async () => {
    const res = await request(app).delete(`/api/imports/payslip/${MISSING_ID}`);
    expect(res.status).toBe(404);
  });

  it("404 si el id no es válido", async () => {
    const res = await request(app).delete("/api/imports/coupon/no-es-un-id");
    expect(res.status).toBe(404);
  });

  it("no borra un archivo de otro tipo con el mismo id", async () => {
    const res = await request(app).delete(`/api/imports/coupon/${ids.payslip._id}`);
    expect(res.status).toBe(404);
    expect(await PayslipModel.countDocuments()).toBe(1);
  });
});
