import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { payslipParser } from "./payslip.js";
import type { PdfMeta } from "@ledgerly/shared";

const read = (name: string) => readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");
const text = read("payslip.sample.txt");
const legacyText = read("payslip-legacy.sample.txt");
const sacText = read("payslip-sac.sample.txt");
const sacSinPeriodoText = read("payslip-sac-sin-periodo.sample.txt");
const meta: PdfMeta = { producer: null, creator: null, pageCount: 1, encrypted: false };

describe("payslipParser.detect", () => {
  it("detecta el recibo por período de pago y sueldo", () => {
    expect(payslipParser.detect(text, meta)).toBe(true);
    expect(payslipParser.detect(legacyText, meta)).toBe(true);
    expect(payslipParser.detect("EXCLUSIVE ICBC CLUB SALDO ANTERIOR", meta)).toBe(false);
  });

  it("detecta el recibo de SAC, que no menciona la palabra sueldo", () => {
    expect(sacText.toUpperCase()).not.toContain("SUELDO");
    expect(payslipParser.detect(sacText, meta)).toBe(true);
  });
});

describe("payslipParser.parse formato con contribuciones del empleador", () => {
  const p = payslipParser.parse(text, meta);

  it("extrae período, fecha de pago y CUIL del empleado", () => {
    expect(p.periodo).toBe("2026-06");
    expect(p.fechaPago).toBe("2026-06-30");
    expect(p.cuil).toBe("20-11111111-2");
  });

  it("excluye las contribuciones patronales de los conceptos", () => {
    expect(p.conceptos.map((c) => c.codigo)).toEqual(["0201", "0205", "0220", "9999", "0403", "0405"]);
    expect(p.conceptos.some((c) => c.codigo.startsWith("05"))).toBe(false);
  });

  it("no suma la contribución de obra social del empleador a los descuentos", () => {
    expect(p.descuentos).toBe(156000);
  });

  it("calcula bruto y neto según la composición salarial del recibo", () => {
    expect(p.remunerativo).toBe(1150000);
    expect(p.noRemunerativo).toBe(0.5);
    expect(p.brutoTotal).toBe(1150000.5);
    expect(p.neto).toBe(994000.5);
  });

  it("extrae el costo total del empleador", () => {
    expect(p.costoTotalEmpleador).toBe(1350215);
  });
});

describe("payslipParser.parse formato anterior", () => {
  const p = payslipParser.parse(legacyText, meta);

  it("clasifica la obra social del trabajador como descuento aunque no sea código 04xx", () => {
    const obraSocial = p.conceptos.find((c) => c.codigo === "0314");
    expect(obraSocial?.tipo).toBe("descuento");
    expect(p.descuentos).toBe(70000);
    expect(p.neto).toBe(430000.4);
  });
});

describe("payslipParser.parse recibo de SAC", () => {
  const p = payslipParser.parse(sacText, meta);

  it("ubica el segundo SAC en diciembre del año liquidado", () => {
    expect(p.periodo).toBe("2024-12");
    expect(p.fechaPago).toBe("2024-12-31");
  });

  it("lo marca como liquidación de SAC", () => {
    expect(p.tipo).toBe("sac");
  });

  it("ubica el primer SAC en junio", () => {
    const primero = payslipParser.parse(sacText.replace("Segundo SAC 2024", "Primer SAC 2026"), meta);
    expect(primero.periodo).toBe("2026-06");
    expect(primero.tipo).toBe("sac");
  });

  it("acepta la forma abreviada del ordinal", () => {
    expect(payslipParser.parse(sacText.replace("Segundo SAC 2024", "1er SAC 2023"), meta).periodo).toBe("2023-06");
    expect(payslipParser.parse(sacText.replace("Segundo SAC 2024", "2do SAC 2021"), meta).periodo).toBe("2021-12");
  });

  it("suma los conceptos del aguinaldo", () => {
    expect(p.remunerativo).toBe(1000000);
    expect(p.noRemunerativo).toBe(0.4);
    expect(p.descuentos).toBe(200000);
    expect(p.neto).toBe(800000.4);
  });
});

describe("payslipParser.parse recibo de SAC sin período en el texto", () => {
  const fileName = "Primer_SAC_2024_19_Legajo_56_Empleado-Empleador.PDF";

  it("deduce el período del nombre del archivo", () => {
    const p = payslipParser.parse(sacSinPeriodoText, meta, { fileName });
    expect(p.periodo).toBe("2024-06");
    expect(p.tipo).toBe("sac");
    expect(p.neto).toBe(445000.6);
  });

  it("falla si no hay período ni nombre de archivo que lo indique", () => {
    expect(() => payslipParser.parse(sacSinPeriodoText, meta)).toThrow(/período de pago/);
    expect(() => payslipParser.parse(sacSinPeriodoText, meta, { fileName: "Marzo.PDF" })).toThrow(/período de pago/);
  });

  it("no usa el nombre del archivo cuando el texto ya trae el período", () => {
    const p = payslipParser.parse(sacText, meta, { fileName: "Primer_SAC_2024_19_Legajo_56.PDF" });
    expect(p.periodo).toBe("2024-12");
  });
});

describe("payslipParser.parse tipo de liquidación", () => {
  it("marca como mensual a los recibos que no son de SAC", () => {
    expect(payslipParser.parse(text, meta).tipo).toBe("mensual");
    expect(payslipParser.parse(legacyText, meta).tipo).toBe("mensual");
  });
});
