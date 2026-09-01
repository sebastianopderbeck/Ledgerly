import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { visaSignatureParser } from "./visaSignature.js";
import { reconcile } from "./reconcile.js";
import type { ParsedStatement, PdfMeta } from "@ledgerly/shared";

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

const realPath = fileURLToPath(new URL("../../../examples/visa-real.txt", import.meta.url));
const hasReal = existsSync(realPath);
const realMeta: PdfMeta = { producer: "Adobe LiveCycle", creator: null, pageCount: 2, encrypted: false };

describe.skipIf(!hasReal)("visaSignatureParser.parse (extracción real)", () => {
  let result: ParsedStatement;

  beforeAll(() => {
    result = visaSignatureParser.parse(readFileSync(realPath, "utf8"), realMeta);
  });

  it("parsea los 43 movimientos del resumen real", () => {
    expect(result.rows).toHaveLength(43);
  });

  it("extrae el header del resumen real", () => {
    expect(result.header.last4).toBe("8883");
    expect(result.header.closingDate).toBe("2026-07-02");
    expect(result.header.totals.totalConsumos).toEqual({ ars: 2585250.04, usd: 691.71 });
    expect(result.header.totals.saldoActual).toEqual({ ars: 2895556.7, usd: 691.71 });
    expect(result.header.totals.pagoMinimo).toEqual({ ars: 544016, usd: 0 });
    expect(result.header.totals.saldoAnterior).toEqual({ ars: 1990883.84, usd: 11.95 });
  });

  it("reconcilia los consumos contra los totales del header", () => {
    expect(reconcile(result)).toMatchObject({
      ok: true,
      entries: [
        { currency: "ARS", expected: 2585250.04, parsed: 2585250.04, diff: 0 },
        { currency: "USD", expected: 691.71, parsed: 691.71, diff: 0 },
      ],
    });
  });
});
