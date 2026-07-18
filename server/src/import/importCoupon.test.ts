import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";
import type { ParsedCoupon } from "@ledgerly/shared";

vi.mock("../ingestion/parseCoupon.js", () => ({ parseCoupon: vi.fn() }));
import { parseCoupon } from "../ingestion/parseCoupon.js";
vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../fx/dollarRate.js";
import { importCoupon } from "./importCoupon.js";
import { MortgageCouponModel } from "../db/models.js";

withDb();
const mocked = vi.mocked(parseCoupon);
const mockedFx = vi.mocked(fetchOficialRate);

const coupon: ParsedCoupon = {
  prestamoNro: "0405727408", cuotaNro: 1, fechaDebito: "2025-08-18",
  capital: 184689.39, intereses: 903304.93, seguroIncendio: 9693.61, totalDebitado: 1097687.93,
  cuotaPuraUva: 699.6, cotizacionUva: 1555.16, tea: 9.27, tna: 8.9, cft: 0,
};

beforeEach(() => {
  mocked.mockResolvedValue({ coupon, meta: { producer: null, creator: null, pageCount: 1, encrypted: false } });
  mockedFx.mockResolvedValue(1350.5);
});

describe("importCoupon", () => {
  it("importa un cupón nuevo", async () => {
    const r = await importCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    expect(r.status).toBe("imported");
    expect(await MortgageCouponModel.countDocuments()).toBe(1);
  });

  it("deduplica por (prestamoNro, cuotaNro) aunque cambien los bytes", async () => {
    await importCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const r = await importCoupon({ data: new Uint8Array([2, 3]), fileName: "b.pdf" });
    expect(r.status).toBe("duplicate");
    expect(await MortgageCouponModel.countDocuments()).toBe(1);
  });

  it("replace reemplaza el cupón existente", async () => {
    await importCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const r = await importCoupon({ data: new Uint8Array([2]), fileName: "b.pdf", replace: true });
    expect(r.status).toBe("imported");
    expect(await MortgageCouponModel.countDocuments()).toBe(1);
  });

  it("guarda el tipo de cambio oficial al importar", async () => {
    await importCoupon({ data: new Uint8Array([1]), fileName: "a.pdf" });
    const doc = await MortgageCouponModel.findOne({ cuotaNro: 1 });
    expect(doc?.tipoCambioUsd).toBe(1350.5);
    expect(doc?.tipoCambioSource).toBe("api");
  });

  it("importa igual si la API de dólar falla (tipoCambioUsd null)", async () => {
    mockedFx.mockResolvedValueOnce(null);
    const r = await importCoupon({ data: new Uint8Array([9]), fileName: "b.pdf" });
    expect(r.status).toBe("imported");
    const doc = await MortgageCouponModel.findOne({ cuotaNro: 1 });
    expect(doc?.tipoCambioUsd ?? null).toBeNull();
    expect(doc?.tipoCambioSource ?? null).toBeNull();
  });
});
