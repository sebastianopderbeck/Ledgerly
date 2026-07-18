import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAutoCoupon } from "./parseAutoCoupon.js";

const pdf = readFileSync(fileURLToPath(new URL("../../../examples/auto/11-2024.pdf", import.meta.url)));

describe("parseAutoCoupon", () => {
  it("extrae y parsea un cupón real", async () => {
    const { coupon } = await parseAutoCoupon(new Uint8Array(pdf));
    expect(coupon.grupo).toBe("3684");
    expect(coupon.cuotaNro).toBe(2);
    expect(coupon.totalAPagar).toBe(268551.23);
    expect(coupon.valorMovil).toBe(28240000.01);
    expect(coupon.fechaVencimiento).toBe("2024-11-11");
    expect(coupon.conceptos.length).toBeGreaterThanOrEqual(10);
  });
});
