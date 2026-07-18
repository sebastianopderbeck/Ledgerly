import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";
import type { ParsedAutoCoupon } from "@ledgerly/shared";

vi.mock("../ingestion/parseAutoCoupon.js", () => ({ parseAutoCoupon: vi.fn() }));
vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { parseAutoCoupon } from "../ingestion/parseAutoCoupon.js";
import { fetchOficialRate } from "../fx/dollarRate.js";
import { importAutoCoupon } from "./importAutoCoupon.js";
import { AutoCouponModel } from "../db/models.js";

withDb();
const mockedParse = vi.mocked(parseAutoCoupon);
const mockedFx = vi.mocked(fetchOficialRate);

const coupon: ParsedAutoCoupon = {
  grupo: "3684", orden: "97", cuotaNro: 2, plan: "K",
  fechaEmision: "2024-10-18", fechaVencimiento: "2024-11-11", comprobante: "000062757060",
  modelo: "C3 AIRCROSS T200 FEEL PK MY24", valorMovil: 28240000.01,
  conceptos: [{ label: "ANTICIPO ALICUOTA (AL)", amount: 235356.87 }],
  totalAPagar: 268551.23,
};

beforeEach(() => {
  mockedParse.mockResolvedValue({ coupon, meta: { producer: null, creator: null, pageCount: 3, encrypted: false } });
  mockedFx.mockResolvedValue(1000);
});

describe("importAutoCoupon", () => {
  it("importa un cupón nuevo y guarda el TC oficial", async () => {
    const r = await importAutoCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    expect(r.status).toBe("imported");
    const doc = await AutoCouponModel.findOne({ cuotaNro: 2 });
    expect(doc?.tipoCambioUsd).toBe(1000);
    expect(doc?.tipoCambioSource).toBe("api");
    expect(doc?.conceptos).toHaveLength(1);
  });

  it("deduplica por (grupo, orden, cuotaNro) aunque cambien los bytes", async () => {
    await importAutoCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const r = await importAutoCoupon({ data: new Uint8Array([2, 3]), fileName: "b.pdf" });
    expect(r.status).toBe("duplicate");
    expect(await AutoCouponModel.countDocuments()).toBe(1);
  });

  it("importa igual si la API de dólar falla (tipoCambioUsd null)", async () => {
    mockedFx.mockResolvedValueOnce(null);
    const r = await importAutoCoupon({ data: new Uint8Array([9]), fileName: "c.pdf" });
    expect(r.status).toBe("imported");
    const doc = await AutoCouponModel.findOne({ cuotaNro: 2 });
    expect(doc?.tipoCambioUsd ?? null).toBeNull();
    expect(doc?.tipoCambioSource ?? null).toBeNull();
  });

  it("no consulta el dólar oficial en un duplicado", async () => {
    await importAutoCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    mockedFx.mockClear();
    const r = await importAutoCoupon({ data: new Uint8Array([2]), fileName: "b.pdf" });
    expect(r.status).toBe("duplicate");
    expect(mockedFx).not.toHaveBeenCalled();
  });

  it("replace reemplaza el cupón existente (misma clave natural)", async () => {
    const first = await importAutoCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const r = await importAutoCoupon({ data: new Uint8Array([2]), fileName: "b.pdf", replace: true });
    expect(r.status).toBe("imported");
    expect(r.couponId).not.toBe(first.couponId);
    expect(await AutoCouponModel.countDocuments()).toBe(1);
  });

  it("importa igual si fetchOficialRate lanza (catch → null)", async () => {
    mockedFx.mockRejectedValueOnce(new Error("network"));
    const r = await importAutoCoupon({ data: new Uint8Array([7]), fileName: "d.pdf" });
    expect(r.status).toBe("imported");
    const doc = await AutoCouponModel.findOne({ cuotaNro: 2 });
    expect(doc?.tipoCambioUsd ?? null).toBeNull();
  });
});
