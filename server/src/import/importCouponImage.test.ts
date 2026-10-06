import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";

vi.mock("../ocr/recognizeImage.js", () => ({ recognizeImage: vi.fn() }));
import { recognizeImage } from "../ocr/recognizeImage.js";
vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../fx/dollarRate.js";
import { MortgageCouponModel } from "../db/models.js";
import {
  CouponImageMismatchError, CouponImageTotalsError, MissingPreviousCouponError, OcrFailedError,
  UnrecognizedCouponImageError,
} from "../ingestion/errors.js";
import { importCouponImage } from "./importCouponImage.js";

withDb();
const mockedOcr = vi.mocked(recognizeImage);
const mockedFx = vi.mocked(fetchOficialRate);

const fixture = readFileSync(
  fileURLToPath(new URL("../parsers/__fixtures__/icbc-mortgage-image.sample.txt", import.meta.url)),
  "utf8",
);
const observe = (text: string) =>
  text.trim().split("\n").map((line, index) => ({ text: line, x: 0.04, y: 0.1 * (index + 1), height: 0.03 }));
const withoutLine = (label: string): string =>
  fixture.split("\n").filter((line) => !line.startsWith(label)).join("\n");
const png = new Uint8Array([1, 2, 3]);

const PREVIOUS = {
  prestamoNro: "0000000001", capital: 1, intereses: 1, seguroIncendio: 1, totalDebitado: 3,
  cuotaPuraUva: 499.9, cotizacionUva: 2200, tea: 9.5, tna: 9.1, cft: 11.2,
  sourceFileName: "cupon-2.pdf", sourceHash: "hash-2",
};

beforeEach(async () => {
  mockedOcr.mockReset();
  mockedOcr.mockResolvedValue(observe(fixture));
  mockedFx.mockResolvedValue(1400);
  await MortgageCouponModel.create([
    { ...PREVIOUS, cuotaNro: 1, fechaDebito: new Date("2025-09-17"), tea: 1, tna: 1, cft: 1, sourceHash: "hash-1" },
    { ...PREVIOUS, cuotaNro: 2, fechaDebito: new Date("2025-10-17") },
  ]);
});

describe("importCouponImage", () => {
  it("guarda la captura como cupón con los datos del préstamo del cupón más reciente", async () => {
    const { result } = await importCouponImage({ data: png, fileName: "cuota-3.png" });
    expect(result).toMatchObject({ kind: "coupon", status: "imported" });
    const doc = await MortgageCouponModel.findOne({ cuotaNro: 3 }).lean();
    expect(doc).toMatchObject({
      prestamoNro: "0000000001", tea: 9.5, tna: 9.1, cft: 11.2,
      capital: 150000.1, intereses: 1000000.2, seguroIncendio: 10000.3, totalDebitado: 1160000.6,
      cuotaPuraUva: 499.9, cotizacionUva: 2300.46,
      sourceFileName: "cuota-3.png", tipoCambioUsd: 1400, tipoCambioSource: "api",
    });
    expect(doc?.fechaDebito.toISOString().slice(0, 10)).toBe("2025-11-17");
  });

  it("devuelve el archivo importado como un cupón del crédito", async () => {
    const { file } = await importCouponImage({ data: png, fileName: "cuota-3.png" });
    expect(file).toMatchObject({ kind: "coupon", fileName: "cuota-3.png", documentDate: "2025-11-17" });
  });

  it("reimportar la misma cuota devuelve duplicate sin crear otro cupón", async () => {
    await importCouponImage({ data: png, fileName: "cuota-3.png" });
    const { result } = await importCouponImage({ data: new Uint8Array([9]), fileName: "otra.png" });
    expect(result.status).toBe("duplicate");
    expect(await MortgageCouponModel.countDocuments({ cuotaNro: 3 })).toBe(1);
  });

  it("replace reemplaza la cuota ya importada y conserva el préstamo", async () => {
    await importCouponImage({ data: png, fileName: "cuota-3.png" });
    const corrected = fixture
      .replace("Seguros $ 10.000,30", "Seguros $ 10.000,40")
      .replace("Total pagado $1.160.000,60", "Total pagado $1.160.000,70");
    mockedOcr.mockResolvedValue(observe(corrected));
    const { result } = await importCouponImage({ data: new Uint8Array([9]), fileName: "corregida.png", replace: true });
    expect(result.status).toBe("imported");
    const docs = await MortgageCouponModel.find({ cuotaNro: 3 }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ seguroIncendio: 10000.4, prestamoNro: "0000000001", sourceFileName: "corregida.png" });
  });

  it("sin cupones previos falla con MissingPreviousCouponError y no guarda nada", async () => {
    await MortgageCouponModel.deleteMany({});
    await expect(importCouponImage({ data: png, fileName: "cuota-3.png" }))
      .rejects.toBeInstanceOf(MissingPreviousCouponError);
    expect(await MortgageCouponModel.countDocuments()).toBe(0);
  });

  it("si los montos no cierran falla con CouponImageTotalsError y no guarda nada", async () => {
    mockedOcr.mockResolvedValue(observe(fixture.replace("$ 10.000,30", "$ 10.000,80")));
    await expect(importCouponImage({ data: png, fileName: "cuota-3.png" }))
      .rejects.toBeInstanceOf(CouponImageTotalsError);
    expect(await MortgageCouponModel.countDocuments({ cuotaNro: 3 })).toBe(0);
  });

  it("una captura de otra cosa falla con UnrecognizedCouponImageError", async () => {
    mockedOcr.mockResolvedValue(observe("Mercado Pago\nTotal $ 1.000,00"));
    await expect(importCouponImage({ data: png, fileName: "otra.png" }))
      .rejects.toBeInstanceOf(UnrecognizedCouponImageError);
  });

  it("una imagen sin texto falla con UnrecognizedCouponImageError", async () => {
    mockedOcr.mockResolvedValue([]);
    await expect(importCouponImage({ data: png, fileName: "vacia.png" }))
      .rejects.toBeInstanceOf(UnrecognizedCouponImageError);
  });

  it("una captura del crédito incompleta falla con UnrecognizedCouponImageError", async () => {
    mockedOcr.mockResolvedValue(observe(withoutLine("Seguros")));
    await expect(importCouponImage({ data: png, fileName: "cortada.png" }))
      .rejects.toBeInstanceOf(UnrecognizedCouponImageError);
  });

  it("si la cuota leída no corresponde al mes del vencimiento falla y no guarda nada", async () => {
    mockedOcr.mockResolvedValue(observe(fixture.replace("Cuota 3/240", "Cuota 8/240")));
    await expect(importCouponImage({ data: png, fileName: "cuota-8.png" }))
      .rejects.toBeInstanceOf(CouponImageMismatchError);
    expect(await MortgageCouponModel.countDocuments({ cuotaNro: 8 })).toBe(0);
  });

  it("con replace, una cuota mal leída no pisa la cuota que ya estaba", async () => {
    mockedOcr.mockResolvedValue(observe(fixture.replace("Cuota 3/240", "Cuota 2/240")));
    await expect(importCouponImage({ data: png, fileName: "cuota-2.png", replace: true }))
      .rejects.toBeInstanceOf(CouponImageMismatchError);
    const docs = await MortgageCouponModel.find({ cuotaNro: 2 }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].sourceFileName).toBe("cupon-2.pdf");
  });

  it("si el total en UVA no es el de las cuotas anteriores falla y no guarda nada", async () => {
    mockedOcr.mockResolvedValue(observe(fixture.replace("UVA 499,90", "UVA 459,90")));
    await expect(importCouponImage({ data: png, fileName: "cuota-3.png" }))
      .rejects.toBeInstanceOf(CouponImageMismatchError);
    expect(await MortgageCouponModel.countDocuments({ cuotaNro: 3 })).toBe(0);
  });

  it("una cuota anterior a la última con el mes correcto se acepta y se trata como duplicado", async () => {
    const older = fixture.replace("Cuota 3/240", "Cuota 1/240").replace("17/11/2025", "17/09/2025");
    mockedOcr.mockResolvedValue(observe(older));
    const { result } = await importCouponImage({ data: png, fileName: "cuota-1.png" });
    expect(result.status).toBe("duplicate");
  });

  it("propaga el error del OCR", async () => {
    mockedOcr.mockRejectedValue(new OcrFailedError());
    await expect(importCouponImage({ data: png, fileName: "rota.png" })).rejects.toBeInstanceOf(OcrFailedError);
  });
});
