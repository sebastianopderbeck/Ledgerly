import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCoupon } from "./parseCoupon.js";

const pdfPath = fileURLToPath(new URL("../../../examples/credito/08-2025-opderbeck.pdf", import.meta.url));
const hasReal = existsSync(pdfPath);

describe.skipIf(!hasReal)("parseCoupon", () => {
  it("extrae y parsea un cupón real", async () => {
    const { coupon } = await parseCoupon(new Uint8Array(readFileSync(pdfPath)));
    expect(coupon.cuotaNro).toBe(1);
    expect(coupon.prestamoNro).toBe("0405727408");
    expect(coupon.capital).toBe(184689.39);
    expect(coupon.cotizacionUva).toBe(1555.16);
    expect(coupon.fechaDebito).toBe("2025-08-18");
  });
});
