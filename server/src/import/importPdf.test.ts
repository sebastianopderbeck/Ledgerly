import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";

vi.mock("../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn(async () => null) }));
import { extractPdfText } from "../pdf/extract.js";
import { importPdf } from "./importPdf.js";
import { EncryptedPdfError, NoTextError, UnsupportedFormatError } from "../ingestion/errors.js";
import { StatementModel } from "../db/models.js";

withDb();
const mocked = vi.mocked(extractPdfText);
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };
const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../parsers/__fixtures__/${name}`, import.meta.url)), "utf8");
const pdf = (label: string) => new TextEncoder().encode(`pdf-sintetico-${label}`);

beforeEach(() => {
  mocked.mockReset();
});

describe("importPdf", () => {
  it("importa un resumen de tarjeta y describe el archivo", async () => {
    mocked.mockResolvedValue({ text: fixture("icbc.sample.txt"), meta });
    const { result, file } = await importPdf({ data: pdf("icbc"), fileName: "resumen-sintetico.pdf" });
    if (result.kind !== "statement") throw new Error("esperaba un resumen");
    expect(result.status).toBe("imported");
    expect(file).toMatchObject({ id: result.statement.id, kind: "statement", fileName: "resumen-sintetico.pdf" });
    expect(file.description).toBe(`${result.statement.cardLabel} · ${result.transactionCount} movimientos`);
    expect(await StatementModel.countDocuments()).toBe(1);
  });

  it("reimportar el mismo PDF es duplicate y describe el existente", async () => {
    mocked.mockResolvedValue({ text: fixture("icbc.sample.txt"), meta });
    const first = await importPdf({ data: pdf("icbc"), fileName: "resumen-sintetico.pdf" });
    const second = await importPdf({ data: pdf("icbc"), fileName: "resumen-sintetico.pdf" });
    expect(second.result.status).toBe("duplicate");
    expect(second.file.id).toBe(first.file.id);
    expect(second.file.description).toBe(first.file.description);
  });

  it("importa un cupón de la hipoteca", async () => {
    mocked.mockResolvedValue({ text: fixture("icbc-mortgage.sample.txt"), meta });
    const { result, file } = await importPdf({ data: pdf("cupon"), fileName: "cupon-sintetico.pdf" });
    expect(result.kind).toBe("coupon");
    expect(file.kind).toBe("coupon");
    expect(file.description).toMatch(/^Préstamo .+ · cuota 1$/);
  });

  it("importa un cupón del plan del auto", async () => {
    mocked.mockResolvedValue({ text: fixture("auto-plan.sample.txt"), meta });
    const { result, file } = await importPdf({ data: pdf("auto"), fileName: "auto-sintetico.pdf" });
    expect(result.kind).toBe("auto");
    expect(file.kind).toBe("auto");
    expect(file.description).toMatch(/^Grupo .+ · cuota 2$/);
  });

  it("importa un recibo de sueldo", async () => {
    mocked.mockResolvedValue({ text: fixture("payslip.sample.txt"), meta });
    const { result, file } = await importPdf({ data: pdf("recibo"), fileName: "recibo-sintetico.pdf" });
    expect(result.kind).toBe("payslip");
    expect(file.kind).toBe("payslip");
    expect(file.description).toMatch(/^Período \d{4}-\d{2}/);
  });

  it("un PDF con contraseña de usuario es EncryptedPdfError", async () => {
    mocked.mockRejectedValue(Object.assign(new Error("No password given"), { name: "PasswordException" }));
    await expect(importPdf({ data: pdf("protegido"), fileName: "protegido.pdf" }))
      .rejects.toBeInstanceOf(EncryptedPdfError);
  });

  it("otros errores de extracción siguen de largo", async () => {
    mocked.mockRejectedValue(new Error("PDF roto"));
    await expect(importPdf({ data: pdf("roto"), fileName: "roto.pdf" })).rejects.toThrow("PDF roto");
  });

  it("un PDF casi sin texto es NoTextError", async () => {
    mocked.mockResolvedValue({ text: "   corto   ", meta });
    await expect(importPdf({ data: pdf("escaneado"), fileName: "escaneado.pdf" })).rejects.toBeInstanceOf(NoTextError);
  });

  it("un documento ajeno es UnsupportedFormatError", async () => {
    mocked.mockResolvedValue({ text: "factura de luz sin ningún marcador conocido de resumen", meta });
    await expect(importPdf({ data: pdf("factura"), fileName: "factura.pdf" }))
      .rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});
