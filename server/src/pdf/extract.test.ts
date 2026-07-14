import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractPdfText } from "./extract.js";

const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
const visaPath = examples + "UltimaLiquidacion.pdf";
const icbcPath = examples + "Resumen14jul2026.pdf";
const hasReal = existsSync(visaPath) && existsSync(icbcPath);

describe.skipIf(!hasReal)("extractPdfText (PDFs reales)", () => {
  it("extrae texto del PDF Visa (no encriptado)", async () => {
    const { text, meta } = await extractPdfText(readFileSync(visaPath));
    expect(text).toContain("VISA SIGNATURE");
    expect(meta.pageCount).toBeGreaterThan(0);
  });

  it("extrae texto del PDF ICBC (AES, password vacía)", async () => {
    const { text, meta } = await extractPdfText(readFileSync(icbcPath));
    expect(text).toContain("ICBC");
    expect(text.length).toBeGreaterThan(500);
    expect(meta.pageCount).toBeGreaterThan(0);
  });
});
