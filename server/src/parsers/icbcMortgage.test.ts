import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { icbcMortgageParser } from "./icbcMortgage.js";
import type { PdfMeta } from "@ledgerly/shared";

const text = readFileSync(fileURLToPath(new URL("./__fixtures__/icbc-mortgage.sample.txt", import.meta.url)), "utf8");
const meta: PdfMeta = { producer: null, creator: null, pageCount: 1, encrypted: false };

describe("icbcMortgageParser.detect", () => {
  it("detecta por el marker del cupón", () => {
    expect(icbcMortgageParser.detect(text, meta)).toBe(true);
    expect(icbcMortgageParser.detect("EXCLUSIVE ICBC CLUB SALDO ANTERIOR", meta)).toBe(false);
  });
});

describe("icbcMortgageParser.parse", () => {
  const c = icbcMortgageParser.parse(text, meta);
  it("extrae identificadores y fecha", () => {
    expect(c.prestamoNro).toBe("0405727408");
    expect(c.cuotaNro).toBe(1);
    expect(c.fechaDebito).toBe("2025-08-18");
  });
  it("extrae montos en pesos", () => {
    expect(c.capital).toBe(184689.39);
    expect(c.intereses).toBe(903304.93);
    expect(c.seguroIncendio).toBe(9693.61);
    expect(c.totalDebitado).toBe(1097687.93);
  });
  it("extrae UVA y tasas", () => {
    expect(c.cuotaPuraUva).toBe(699.6);
    expect(c.cotizacionUva).toBe(1555.16);
    expect(c.tna).toBe(8.9);
    expect(c.tea).toBe(9.27);
    expect(c.cft).toBe(0);
  });
});
