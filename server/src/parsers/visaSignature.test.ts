import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { visaSignatureParser } from "./visaSignature.js";
import type { PdfMeta } from "@ledgerly/shared";

const text = readFileSync(
  fileURLToPath(new URL("./__fixtures__/visa-signature.sample.txt", import.meta.url)),
  "utf8",
);
const meta: PdfMeta = { producer: "Adobe LiveCycle", creator: null, pageCount: 2, encrypted: false };

describe("visaSignatureParser.detect", () => {
  it("detecta por el marker VISA SIGNATURE", () => {
    expect(visaSignatureParser.detect(text, meta)).toBe(true);
    expect(visaSignatureParser.detect("banco cualquiera", meta)).toBe(false);
  });
});

describe("visaSignatureParser.parse", () => {
  const result = visaSignatureParser.parse(text, meta);

  it("extrae el header", () => {
    expect(result.header.issuer).toBe("visa_signature");
    expect(result.header.last4).toBe("1234");
    expect(result.header.closingDate).toBe("2026-07-02");
    expect(result.header.totals.totalConsumos).toEqual({ ars: 3700, usd: 50 });
    expect(result.header.totals.saldoActual).toEqual({ ars: 3910, usd: 50 });
    expect(result.header.totals.saldoAnterior).toEqual({ ars: 1000, usd: 10 });
  });

  it("parsea 5 movimientos (excluye SALDO ANTERIOR y líneas de totales)", () => {
    expect(result.rows).toHaveLength(5);
  });

  it("clasifica el pago", () => {
    const pago = result.rows.find((r) => r.type === "payment");
    expect(pago).toMatchObject({ amount: 1000, currency: "ARS", direction: "credit" });
  });

  it("parsea una compra ARS", () => {
    expect(result.rows.find((r) => r.comprobante === "111111")).toMatchObject({
      date: "2026-06-10", merchant: "COMERCIO UNO", amount: 2500,
      currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
    });
  });

  it("parsea una compra en cuotas", () => {
    expect(result.rows.find((r) => r.comprobante === "222222")).toMatchObject({
      merchant: "COMERCIO DOS", amount: 1200, isInstallment: true,
      installmentCurrent: 3, installmentTotal: 6,
    });
  });

  it("parsea una compra USD", () => {
    expect(result.rows.find((r) => r.comprobante === "333333")).toMatchObject({
      amount: 50, currency: "USD", type: "purchase", merchant: "SERVICIO EXTERIOR",
    });
  });

  it("clasifica el impuesto", () => {
    expect(result.rows.find((r) => r.comprobante === "444444")).toMatchObject({ amount: 210, type: "tax" });
  });
});
