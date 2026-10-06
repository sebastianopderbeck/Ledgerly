import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ParsedCouponImage } from "@ledgerly/shared";
import { icbcMortgageImageParser, totalsMatch } from "./icbcMortgageImage.js";

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");
const text = read("icbc-mortgage-image.sample.txt");
const pdfText = read("icbc-mortgage.sample.txt");
const without = (label: string): string => text.split("\n").filter((line) => !line.startsWith(label)).join("\n");
const { detect, parse } = icbcMortgageImageParser;

describe("icbcMortgageImageParser.detect", () => {
  it("detecta la captura por la cuota y el total en UVA", () => {
    expect(detect(text)).toBe(true);
  });

  it("no confunde el cupón PDF con la captura", () => {
    expect(detect(pdfText)).toBe(false);
  });

  it("no detecta una captura de otra cosa", () => {
    expect(detect("Mercado Pago\nTotal $ 1.000,00")).toBe(false);
  });
});

describe("icbcMortgageImageParser.parse", () => {
  it("lee la cuota, el vencimiento y los montos, con el $ separado o pegado", () => {
    expect(parse(text)).toEqual({
      cuotaNro: 3,
      cuotasTotales: 240,
      fechaDebito: "2025-11-17",
      capital: 150000.1,
      intereses: 1000000.2,
      iva: 0,
      seguros: 10000.3,
      totalPagado: 1160000.6,
      totalUva: 499.9,
    });
  });

  it("falla si falta un monto", () => {
    expect(() => parse(without("Seguros"))).toThrow(/seguros/);
  });

  it("falla si falta la cuota", () => {
    expect(() => parse(without("Cuota"))).toThrow(/cuota/);
  });

  it("falla si el total en UVA es cero", () => {
    expect(() => parse(text.replace("UVA 499,90", "UVA 0,00"))).toThrow(/UVA/);
  });
});

describe("totalsMatch", () => {
  it("da true cuando capital + intereses + IVA + seguros es el total pagado", () => {
    expect(totalsMatch(parse(text))).toBe(true);
  });

  it("da false si un monto se leyó mal", () => {
    expect(totalsMatch(parse(text.replace("$ 10.000,30", "$ 10.000,80")))).toBe(false);
  });

  it("compara en centavos, sin errores de coma flotante", () => {
    const coupon: ParsedCouponImage = {
      cuotaNro: 1, cuotasTotales: 1, fechaDebito: "2025-01-01",
      capital: 0.1, intereses: 0.2, iva: 0, seguros: 0, totalPagado: 0.3, totalUva: 1,
    };
    expect(totalsMatch(coupon)).toBe(true);
  });
});
