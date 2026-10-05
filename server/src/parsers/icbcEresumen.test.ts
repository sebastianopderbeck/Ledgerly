import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { icbcEresumenParser, isIcbcEresumen } from "./icbcEresumen.js";
import { reconcile } from "./reconcile.js";
import type { PdfMeta } from "@ledgerly/shared";

const read = (file: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${file}`, import.meta.url)), "utf8");
const eresumenText = read("icbc-eresumen.sample.txt");
const meta: PdfMeta = { producer: null, creator: null, pageCount: 2, encrypted: false };

describe("isIcbcEresumen", () => {
  it("detecta el e-resumen", () => {
    expect(isIcbcEresumen(eresumenText)).toBe(true);
    expect(icbcEresumenParser.detect(eresumenText, meta)).toBe(true);
  });

  it("no detecta el resumen de home banking ni un voucher", () => {
    expect(isIcbcEresumen(read("icbc.sample.txt"))).toBe(false);
    expect(isIcbcEresumen(read("coto-voucher.sample.txt"))).toBe(false);
  });
});

describe("icbcEresumenParser.parse", () => {
  const result = icbcEresumenParser.parse(eresumenText, meta);
  const byComprobante = (comprobante: string) => result.rows.filter((r) => r.comprobante === comprobante);

  it("toma cierre y vencimiento actuales, no los anteriores ni los próximos", () => {
    expect(result.header).toMatchObject({
      issuer: "icbc",
      cardLabel: "ICBC",
      last4: null,
      closingDate: "2026-10-01",
      dueDate: "2026-10-14",
    });
  });

  it("lee los totales de la primera aparición", () => {
    expect(result.header.totals).toEqual({
      totalConsumos: { ars: 54009.7, usd: 0 },
      saldoActual: { ars: 54009.7, usd: 0 },
      pagoMinimo: { ars: 5400, usd: 0 },
      saldoAnterior: { ars: 40000, usd: 0 },
    });
  });

  it("deduplica los registros repetidos en una misma línea y concilia", () => {
    expect(result.rows).toHaveLength(9);
    expect(byComprobante("100001")).toHaveLength(1);
    expect(byComprobante("100006")).toHaveLength(1);
    expect(reconcile(result).ok).toBe(true);
  });

  it("conserva dos registros idénticos en líneas distintas", () => {
    const propinas = byComprobante("100004");
    expect(propinas).toHaveLength(2);
    expect(propinas.map((r) => r.date)).toEqual(["2026-09-22", "2026-09-23"]);
  });

  it("convierte DD.MM.YY a fecha ISO", () => {
    expect(result.rows.map((r) => r.date)).toEqual([
      "2026-09-15", "2026-09-18", "2026-09-20", "2026-09-21", "2026-09-22",
      "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-28",
    ]);
  });

  it("clasifica pago, crédito y bonificación", () => {
    expect(result.rows.find((r) => r.type === "payment")).toMatchObject({
      date: "2026-09-15", amount: 40000, direction: "credit", currency: "ARS", comprobante: null,
    });
    expect(result.rows.find((r) => r.merchant === "PEDIDOSYA MARKET")).toMatchObject({
      amount: 90.3, direction: "credit", type: "purchase", comprobante: "100005",
    });
    expect(byComprobante("100006")[0]).toMatchObject({ type: "refund", direction: "credit", amount: 5000 });
  });

  it("parsea cuotas y comprobante", () => {
    expect(byComprobante("100001")[0]).toMatchObject({
      date: "2026-09-18", merchant: "COMERCIO UNO", amount: 30000, direction: "debit",
      isInstallment: true, installmentCurrent: 1, installmentTotal: 3,
    });
  });

  it("conserva un número suelto dentro de la descripción", () => {
    expect(byComprobante("100003")[0]).toMatchObject({
      descriptionRaw: "PEDIDOSYA*OPEN25HS 372", amount: 2500,
    });
  });

  it("ignora los encabezados de salto de página", () => {
    expect(result.rows.some((r) => /PAGINA|TITULAR/.test(r.descriptionRaw))).toBe(false);
  });
});
