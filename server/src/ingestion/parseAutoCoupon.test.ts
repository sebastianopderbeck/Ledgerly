import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAutoCoupon } from "./parseAutoCoupon.js";

const pdf = readFileSync(fileURLToPath(new URL("../../../examples/auto/11-2024.pdf", import.meta.url)));
const pdfWkhtml = readFileSync(fileURLToPath(new URL("../../../examples/auto/08-2026.pdf", import.meta.url)));

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

  it("parsea un cupón renderizado con wkhtmltopdf (espacios espurios y mojibake)", async () => {
    const { coupon } = await parseAutoCoupon(new Uint8Array(pdfWkhtml));
    expect(coupon.grupo).toBe("3684");
    expect(coupon.orden).toBe("97");
    expect(coupon.cuotaNro).toBe(23);
    expect(coupon.plan).toBe("K");
    expect(coupon.fechaEmision).toBe("2026-07-18");
    expect(coupon.fechaVencimiento).toBe("2026-08-10");
    expect(coupon.comprobante).toBe("000065811268");
    expect(coupon.totalAPagar).toBe(467069.84);
    expect(coupon.valorMovil).toBe(43870000);
    const byLabel = Object.fromEntries(coupon.conceptos.map((x) => [x.label, x.amount]));
    expect(byLabel["ANTICIPO ALICUOTA (AL)"]).toBe(365619.89);
    expect(byLabel["IVA SOBRE CONCEPTOS GRAVADOS"]).toBe(11997.67);
    expect(byLabel["RECUP IMP BANCARIOS LEY 25413"]).toBe(3752.87);
    expect(byLabel["GASTOS ADMINISTRATIVOS"]).toBe(36561.99);
    expect(byLabel["DIFERIMIENTO COMERCIAL"]).toBe(-36561.99);
    expect(byLabel["DER. INSCRIP.PRORR. HIST (DIP)"]).toBe(34274.38);
    expect(byLabel["ACTUALIZACIÓN VALOR HIST.DIP"]).toBe(20569.75);
    expect(byLabel["SEGURO DE VIDA (SV)"]).toBe(30855.28);
  });
});
