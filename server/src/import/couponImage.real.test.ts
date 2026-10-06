import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedCouponImage } from "@ledgerly/shared";
import { recognizeImage } from "../ocr/recognizeImage.js";
import { toLines } from "../ocr/toLines.js";
import { icbcMortgageImageParser, totalsMatch } from "../parsers/icbcMortgageImage.js";

const dir = fileURLToPath(new URL("../../../examples/credito/imagenes/", import.meta.url));
const images = existsSync(dir) ? readdirSync(dir).filter((name) => /\.(png|jpe?g|heic)$/i.test(name)) : [];
const canRun = process.platform === "darwin" && images.length > 0;

describe.skipIf(!canRun)("capturas reales del crédito", () => {
  const parsed: ParsedCouponImage[] = [];

  beforeAll(async () => {
    for (const name of images) {
      const observations = await recognizeImage(readFileSync(join(dir, name)), name);
      parsed.push(icbcMortgageImageParser.parse(toLines(observations)));
    }
  }, 120_000);

  it("lee cada captura completa y sus montos cierran con el total pagado", () => {
    expect(parsed).toHaveLength(images.length);
    for (const coupon of parsed) {
      expect(coupon.cuotaNro).toBeGreaterThan(0);
      expect(coupon.fechaDebito).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(totalsMatch(coupon)).toBe(true);
    }
  });
});
