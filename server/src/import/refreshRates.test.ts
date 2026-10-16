import { Types } from "mongoose";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";
import { AutoCouponModel, MortgageCouponModel, PayslipModel } from "../db/models.js";
import { refreshAllRates, refreshDocRates } from "./refreshRates.js";
import { ownedBy } from "../testing/ownedBy.js";

const USER_ID = new Types.ObjectId();

withDb();

const cuponBase = {
  prestamoNro: "0405727408", fechaDebito: new Date("2025-08-18"), capital: 1, intereses: 1,
  seguroIncendio: 1, totalDebitado: 1000, cuotaPuraUva: 1, cotizacionUva: 1, tea: 9.27, tna: 8.9, cft: 0,
  sourceFileName: "x.pdf",
};

const autoBase = {
  grupo: "3684", orden: "97", plan: "K", fechaEmision: new Date("2024-10-18"),
  fechaVencimiento: new Date("2024-11-11"), comprobante: "c", modelo: "C3", valorMovil: 1,
  conceptos: [], totalAPagar: 1000, sourceFileName: "x.pdf",
};

const sueldoBase = {
  cuil: "20304050607", fechaPago: new Date("2025-07-05"), remunerativo: 100, noRemunerativo: 0,
  descuentos: 20, brutoTotal: 100, neto: 80, sourceFileName: "x.pdf",
};

describe("refreshDocRates", () => {
  beforeEach(async () => {
    await MortgageCouponModel.insertMany(ownedBy(USER_ID, [
      { ...cuponBase, cuotaNro: 1, sourceHash: "h1" },
      { ...cuponBase, cuotaNro: 2, sourceHash: "h2", tipoCambioUsd: 100, tipoCambioSource: "api" },
    ]));
  });

  it("escribe el TC y marca el origen api en cada documento", async () => {
    const docs = await MortgageCouponModel.find({ userId: USER_ID }).sort({ cuotaNro: 1 });

    const result = await refreshDocRates(docs, (doc) => doc.fechaDebito, async () => 1350);

    expect(result).toEqual({ updated: 2, skipped: 0 });
    const refreshed = await MortgageCouponModel.find({ userId: USER_ID }).sort({ cuotaNro: 1 });
    expect(refreshed.map((doc) => doc.tipoCambioUsd)).toEqual([1350, 1350]);
    expect(refreshed.map((doc) => doc.tipoCambioSource)).toEqual(["api", "api"]);
  });

  it("cuenta como skipped y no pisa el valor previo cuando no hay cotización", async () => {
    const docs = await MortgageCouponModel.find({ userId: USER_ID }).sort({ cuotaNro: 1 });

    const result = await refreshDocRates(docs, (doc) => doc.fechaDebito, async () => null);

    expect(result).toEqual({ updated: 0, skipped: 2 });
    const previo = await MortgageCouponModel.findOne({ userId: USER_ID, cuotaNro: 2 });
    expect(previo?.tipoCambioUsd).toBe(100);
  });

  it("resuelve la cotización con la fecha del documento", async () => {
    const resolve = vi.fn().mockResolvedValue(1350);
    const docs = await MortgageCouponModel.find({ userId: USER_ID, cuotaNro: 1 });

    await refreshDocRates(docs, (doc) => doc.fechaDebito, resolve);

    expect(resolve).toHaveBeenCalledWith("2025-08-18");
  });
});

describe("refreshAllRates", () => {
  it("solo recalcula los documentos del usuario", async () => {
    const OTRO = new Types.ObjectId();
    await PayslipModel.create({
      userId: OTRO, periodo: "2026-08", tipo: "mensual", fechaPago: new Date("2026-09-01"), cuil: "20-00000000-0",
      conceptos: [], remunerativo: 1, noRemunerativo: 0, descuentos: 0, brutoTotal: 1, neto: 1,
      sourceFileName: "otro.pdf", sourceHash: "hash-otro", tipoCambioUsd: null, tipoCambioSource: null,
    });
    const result = await refreshAllRates(USER_ID, async () => 1000);
    expect(result.sueldos.updated).toBe(await PayslipModel.countDocuments({ userId: USER_ID }));
    expect((await PayslipModel.findOne({ userId: OTRO }))?.tipoCambioUsd).toBeNull();
  });

  beforeEach(async () => {
    await MortgageCouponModel.insertMany(ownedBy(USER_ID, [
      { ...cuponBase, cuotaNro: 1, sourceHash: "c1" },
      { ...cuponBase, cuotaNro: 2, sourceHash: "c2", tipoCambioUsd: 100, tipoCambioSource: "api" },
      { ...cuponBase, cuotaNro: 3, sourceHash: "c3", tipoCambioUsd: 999, tipoCambioSource: "manual" },
    ]));
    await AutoCouponModel.insertMany(ownedBy(USER_ID, [
      { ...autoBase, cuotaNro: 1, sourceHash: "a1" },
      { ...autoBase, cuotaNro: 2, sourceHash: "a2", tipoCambioUsd: 999, tipoCambioSource: "manual" },
    ]));
    await PayslipModel.insertMany(ownedBy(USER_ID, [
      { ...sueldoBase, periodo: "2025-06", sourceHash: "s1" },
      { ...sueldoBase, periodo: "2025-07", sourceHash: "s2", tipoCambioUsd: 200, tipoCambioSource: "api" },
    ]));
  });

  it("refresca los faltantes y los que ya venían de la API en los tres modelos", async () => {
    const result = await refreshAllRates(USER_ID, async () => 1350);

    expect(result).toEqual({
      cupones: { updated: 2, skipped: 0 },
      auto: { updated: 1, skipped: 0 },
      sueldos: { updated: 2, skipped: 0 },
    });
  });

  it("no toca los tipos de cambio cargados a mano", async () => {
    await refreshAllRates(USER_ID, async () => 1350);

    const cupon = await MortgageCouponModel.findOne({ userId: USER_ID, cuotaNro: 3 });
    expect(cupon?.tipoCambioUsd).toBe(999);
    expect(cupon?.tipoCambioSource).toBe("manual");
    const auto = await AutoCouponModel.findOne({ userId: USER_ID, cuotaNro: 2 });
    expect(auto?.tipoCambioUsd).toBe(999);
  });

  it("consulta la fecha propia de cada documento y delega el dedup en el resolver", async () => {
    const resolve = vi.fn().mockResolvedValue(1350);

    await refreshAllRates(USER_ID, resolve);

    expect(resolve.mock.calls.map(([date]) => date)).toEqual([
      "2025-08-18", "2025-08-18", "2024-11-11", "2025-07-05", "2025-07-05",
    ]);
  });
});
