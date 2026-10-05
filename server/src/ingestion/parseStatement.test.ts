import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const readFixture = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../parsers/__fixtures__/${f}`, import.meta.url)), "utf8");

vi.mock("../pdf/extract.js", () => ({
  extractPdfText: vi.fn(),
}));
import { extractPdfText } from "../pdf/extract.js";
import { parseStatement } from "./parseStatement.js";
import { InvalidStatementDatesError, NoTextError, UnsupportedFormatError } from "./errors.js";

import { detectParser } from "../parsers/registry.js";
import type { ParsedStatement } from "@ledgerly/shared";

vi.mock("../parsers/registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../parsers/registry.js")>();
  return { ...actual, detectParser: vi.fn(actual.detectParser) };
});

const mocked = vi.mocked(extractPdfText);
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };

describe("parseStatement (motor)", () => {
  it("parsea y reconcilia un statement Visa sintético", async () => {
    mocked.mockResolvedValue({ text: readFixture("visa-signature.sample.txt"), meta });
    const { statement, reconciliation } = await parseStatement(new Uint8Array());
    expect(statement.header.issuer).toBe("visa_signature");
    expect(statement.rows.length).toBeGreaterThan(0);
    expect(reconciliation.ok).toBe(true);
  });

  it("lanza NoTextError si no hay texto", async () => {
    mocked.mockResolvedValue({ text: "   ", meta });
    await expect(parseStatement(new Uint8Array())).rejects.toBeInstanceOf(NoTextError);
  });

  it("lanza UnsupportedFormatError si ningún parser detecta", async () => {
    mocked.mockResolvedValue({ text: "banco totalmente desconocido con mucho texto".repeat(20), meta });
    await expect(parseStatement(new Uint8Array())).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});

describe("parseStatement (fechas inválidas)", () => {
  it("rechaza un resumen con un movimiento de fecha imposible", async () => {
    const text = readFixture("icbc-eresumen.sample.txt");
    mocked.mockResolvedValue({ text, meta });
    const parser = detectParser(text, meta)!;
    const parsed = parser.parse(text, meta);
    const broken: ParsedStatement = {
      ...parsed,
      rows: parsed.rows.map((row, index) => (index === 0 ? { ...row, date: "2026-01-64" } : row)),
    };
    vi.mocked(detectParser).mockReturnValueOnce({ ...parser, parse: () => broken });
    await expect(parseStatement(new Uint8Array())).rejects.toBeInstanceOf(InvalidStatementDatesError);
  });
});

const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
const visaReal = examples + "UltimaLiquidacion.pdf";
const icbcReal = examples + "Resumen14jul2026.pdf";

describe.skipIf(!(existsSync(visaReal) && existsSync(icbcReal)))("parseStatement (PDFs reales, e2e)", () => {
  it("Visa real: reconcilia y trae movimientos", async () => {
    const real = await vi.importActual<typeof import("../pdf/extract.js")>("../pdf/extract.js");
    mocked.mockImplementation(real.extractPdfText);
    const { statement, reconciliation } = await parseStatement(readFileSync(visaReal));
    expect(statement.header.issuer).toBe("visa_signature");
    expect(statement.rows.filter((r) => r.type === "purchase").length).toBeGreaterThan(5);
    expect(reconciliation.ok).toBe(true);
  });

  it("ICBC real: reconcilia y trae movimientos", async () => {
    const real = await vi.importActual<typeof import("../pdf/extract.js")>("../pdf/extract.js");
    mocked.mockImplementation(real.extractPdfText);
    const { statement, reconciliation } = await parseStatement(readFileSync(icbcReal));
    expect(statement.header.issuer).toBe("icbc");
    expect(statement.rows.filter((r) => r.type === "purchase").length).toBeGreaterThan(3);
    expect(reconciliation.ok).toBe(true);
  });
});
