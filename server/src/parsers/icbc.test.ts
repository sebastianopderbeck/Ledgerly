import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { icbcParser } from "./icbc.js";
import { reconcile } from "./reconcile.js";
import type { ParsedStatement, PdfMeta } from "@ledgerly/shared";

const text = readFileSync(
  fileURLToPath(new URL("./__fixtures__/icbc.sample.txt", import.meta.url)),
  "utf8",
);
const eresumenText = readFileSync(
  fileURLToPath(new URL("./__fixtures__/icbc-eresumen.sample.txt", import.meta.url)),
  "utf8",
);
const cotoVoucherText = readFileSync(
  fileURLToPath(new URL("./__fixtures__/coto-voucher.sample.txt", import.meta.url)),
  "utf8",
);
const realPath = fileURLToPath(new URL("../../../examples/icbc-real.txt", import.meta.url));
const hasReal = existsSync(realPath);
const meta: PdfMeta = { producer: "iText 5.0.6", creator: null, pageCount: 10, encrypted: true };

describe("icbcParser.detect", () => {
  it("detecta por el marker ICBC", () => {
    expect(icbcParser.detect(text, meta)).toBe(true);
    expect(icbcParser.detect("otro banco", meta)).toBe(false);
  });

  it("detecta el e-resumen de ICBC", () => {
    expect(icbcParser.detect(eresumenText, meta)).toBe(true);
  });

  it("no detecta un voucher de supermercado que menciona ICBC", () => {
    expect(icbcParser.detect(cotoVoucherText, meta)).toBe(false);
  });
});

describe("icbcParser.parse (e-resumen con etiquetas primero)", () => {
  const result = icbcParser.parse(eresumenText, meta);

  it("toma cierre y vencimiento actuales, no los anteriores ni los próximos", () => {
    expect(result.header.closingDate).toBe("2026-10-01");
    expect(result.header.dueDate).toBe("2026-10-14");
  });

  it("parsea los movimientos y concilia", () => {
    expect(result.rows).toHaveLength(5);
    expect(reconcile(result).ok).toBe(true);
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

describe.skipIf(!hasReal)("icbcParser.parse — resumen real sin etiquetas SALDO ACTUAL/PAGO MINIMO", () => {
  let result: ParsedStatement;

  beforeAll(() => {
    result = icbcParser.parse(readFileSync(realPath, "utf8"), meta);
  });

  it("extrae saldo actual y pago mínimo del pie de totales", () => {
    expect(result.header.totals.saldoActual.ars).toBe(3137688.74);
    expect(result.header.totals.pagoMinimo.ars).toBe(197650);
  });
});
