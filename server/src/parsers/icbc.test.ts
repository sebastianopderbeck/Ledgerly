import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { icbcParser } from "./icbc.js";
import type { PdfMeta } from "@ledgerly/shared";

const text = readFileSync(
  fileURLToPath(new URL("./__fixtures__/icbc.sample.txt", import.meta.url)),
  "utf8",
);
const realText = readFileSync(
  fileURLToPath(new URL("../../../examples/icbc-real.txt", import.meta.url)),
  "utf8",
);
const meta: PdfMeta = { producer: "iText 5.0.6", creator: null, pageCount: 10, encrypted: true };

describe("icbcParser.detect", () => {
  it("detecta por el marker ICBC", () => {
    expect(icbcParser.detect(text, meta)).toBe(true);
    expect(icbcParser.detect("otro banco", meta)).toBe(false);
  });
});

describe("icbcParser.parse", () => {
  const result = icbcParser.parse(text, meta);

  it("header con totales", () => {
    expect(result.header.issuer).toBe("icbc");
    expect(result.header.closingDate).toBe("2026-07-02");
    expect(result.header.totals.totalConsumos.ars).toBe(2400);
    expect(result.header.totals.saldoAnterior).toEqual({ ars: 5000, usd: 0 });
  });

  it("parsea 4 movimientos", () => {
    expect(result.rows).toHaveLength(4);
  });

  it("arrastra año+mes en filas de solo-día", () => {
    expect(result.rows.find((r) => r.comprobante === "001001")?.date).toBe("2026-05-04");
    expect(result.rows.find((r) => r.comprobante === "001002")?.date).toBe("2026-05-07");
    expect(result.rows.find((r) => r.comprobante === "001003")?.date).toBe("2026-05-10");
  });

  it("fecha completa para el pago", () => {
    const pago = result.rows.find((r) => r.type === "payment");
    expect(pago).toMatchObject({ date: "2026-06-08", amount: 5000, direction: "credit" });
  });

  it("compra en cuotas con merchant y comprobante", () => {
    expect(result.rows.find((r) => r.comprobante === "001001")).toMatchObject({
      merchant: "COMERCIO TRES", amount: 1500, type: "purchase",
      isInstallment: true, installmentCurrent: 2, installmentTotal: 6,
    });
  });

  it("bonificación como refund/credit", () => {
    expect(result.rows.find((r) => r.comprobante === "001003")).toMatchObject({
      amount: 100, type: "refund", direction: "credit",
    });
  });
});

describe("icbcParser.parse — resumen real sin etiquetas SALDO ACTUAL/PAGO MINIMO", () => {
  const result = icbcParser.parse(realText, meta);

  it("extrae saldo actual y pago mínimo del pie de totales", () => {
    expect(result.header.totals.saldoActual.ars).toBe(3137688.74);
    expect(result.header.totals.pagoMinimo.ars).toBe(197650);
  });
});
