import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { autoPlanParser } from "./autoPlan.js";
import type { PdfMeta } from "@ledgerly/shared";

const text = readFileSync(fileURLToPath(new URL("./__fixtures__/auto-plan.sample.txt", import.meta.url)), "utf8");
const meta: PdfMeta = { producer: null, creator: null, pageCount: 3, encrypted: false };

describe("autoPlanParser.detect", () => {
  it("detecta el cupón de plan de ahorro", () => {
    expect(autoPlanParser.detect(text, meta)).toBe(true);
    expect(autoPlanParser.detect("INFORME DE COBRO DE CUOTA PRESTAMO", meta)).toBe(false);
  });
});

describe("autoPlanParser.parse", () => {
  const c = autoPlanParser.parse(text, meta);
  it("extrae identificadores y fechas (orden sin padding)", () => {
    expect(c.grupo).toBe("3684");
    expect(c.orden).toBe("97");
    expect(c.cuotaNro).toBe(2);
    expect(c.plan).toBe("K");
    expect(c.fechaEmision).toBe("2024-10-18");
    expect(c.fechaVencimiento).toBe("2024-11-11");
    expect(c.comprobante).toBe("000062757060");
  });
  it("extrae total, valor del auto y modelo", () => {
    expect(c.totalAPagar).toBe(268551.23);
    expect(c.valorMovil).toBe(28240000.01);
    expect(c.modelo).toBe("C3 AIRCROSS T200 FEEL PK MY24");
  });
  it("extrae los conceptos con signo", () => {
    expect(c.conceptos).toHaveLength(11);
    const byLabel = Object.fromEntries(c.conceptos.map((x) => [x.label, x.amount]));
    expect(byLabel["ANTICIPO ALICUOTA (AL)"]).toBe(235356.87);
    expect(byLabel["PORCION DE ALICUOTA DIFERIDA"]).toBe(-11767.85);
    expect(byLabel["DIFERIMIENTO COMERCIAL"]).toBe(-70607.06);
    expect(byLabel["RECUP IMP BANCARIOS LEY 25413"]).toBe(2157.79);
  });
});
