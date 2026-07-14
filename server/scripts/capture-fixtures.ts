import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractPdfText } from "../src/pdf/extract.js";

const examples = fileURLToPath(new URL("../../examples/", import.meta.url));
const targets = [
  { pdf: "UltimaLiquidacion.pdf", out: "visa-real.txt" },
  { pdf: "Resumen14jul2026.pdf", out: "icbc-real.txt" },
];

for (const { pdf, out } of targets) {
  const path = examples + pdf;
  if (!existsSync(path)) {
    console.log(`skip ${pdf} (no está)`);
    continue;
  }
  const { text, meta } = await extractPdfText(readFileSync(path));
  writeFileSync(examples + out, text);
  console.log(`${pdf} → ${out} (${text.length} chars)`, meta);
}
