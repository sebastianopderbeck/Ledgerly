import { describe, it, expect } from "vitest";
import type { InflationRateDTO } from "@ledgerly/shared";
import {
  buildDeflator,
  inflationFactor,
  inflationFactorBetween,
  inflationRates,
  latestInflation,
  latestInflationPeriod,
} from "./inflationIndex.js";

const ipc = (pairs: [string, number][]): InflationRateDTO[] =>
  pairs.map(([periodo, variacionMensual]) => ({ periodo, variacionMensual }));

describe("latestInflation", () => {
  it("toma el período más alto aunque la lista venga desordenada", () => {
    const inflation = ipc([["2026-07", 2.1], ["2026-05", 1.5], ["2026-06", 1.8]]);
    expect(latestInflation(inflation)).toEqual({ periodo: "2026-07", variacionMensual: 2.1 });
    expect(latestInflationPeriod(inflation)).toBe("2026-07");
  });

  it("sin IPC devuelve null", () => {
    expect(latestInflation([])).toBeNull();
    expect(latestInflationPeriod([])).toBeNull();
  });
});

describe("inflationFactor", () => {
  const inflation = ipc([["2026-02", 10], ["2026-03", 10], ["2026-05", 5]]);

  it("compone los meses de (from, to] hacia adelante", () => {
    expect(inflationFactor(inflation, "2026-01", "2026-03")).toBeCloseTo(1.21);
  });

  it("hacia atrás es el inverso", () => {
    expect(inflationFactor(inflation, "2026-03", "2026-01")).toBeCloseTo(1 / 1.21);
  });

  it("el mismo mes da 1", () => {
    expect(inflationFactor(inflation, "2026-03", "2026-03")).toBe(1);
  });

  it("los meses sin IPC cuentan 0 %", () => {
    expect(inflationFactor(inflation, "2026-03", "2026-05")).toBeCloseTo(1.05);
    expect(inflationFactor(inflation, "2026-05", "2026-09")).toBe(1);
  });

  it("sin inflación da 1", () => {
    expect(inflationFactor([], "2025-01", "2026-01")).toBe(1);
  });
});

describe("inflationFactorBetween", () => {
  const rates = inflationRates(ipc([["2026-02", 2], ["2026-03", 2]]));
  const assumption = { periodo: "2026-03", variacionMensual: 2 };

  it("compone (compra, pago] con el IPC publicado", () => {
    expect(inflationFactorBetween(rates, "2026-01", "2026-02", assumption)).toEqual({ factor: 1.02, estimated: false });
    const twoMonths = inflationFactorBetween(rates, "2026-01", "2026-03", assumption);
    expect(twoMonths.factor).toBeCloseTo(1.0404);
    expect(twoMonths.estimated).toBe(false);
  });

  it("usa el supuesto en los meses posteriores al último IPC y lo marca como estimado", () => {
    const result = inflationFactorBetween(rates, "2026-01", "2026-04", assumption);
    expect(result.factor).toBeCloseTo(1.061208);
    expect(result.estimated).toBe(true);
  });

  it("usa el supuesto en los huecos de la serie", () => {
    const withGap = inflationRates(ipc([["2026-02", 2], ["2026-04", 2]]));
    const result = inflationFactorBetween(withGap, "2026-01", "2026-04", { periodo: "2026-04", variacionMensual: 3 });
    expect(result.factor).toBeCloseTo(1.02 * 1.03 * 1.02);
    expect(result.estimated).toBe(true);
  });

  it("con el pago en el mismo mes o antes de la compra da 1 sin estimar", () => {
    expect(inflationFactorBetween(rates, "2026-03", "2026-03", assumption)).toEqual({ factor: 1, estimated: false });
    expect(inflationFactorBetween(rates, "2026-03", "2026-02", assumption)).toEqual({ factor: 1, estimated: false });
  });
});

describe("buildDeflator", () => {
  it("lleva a pesos del último IPC con dos meses al 10 %", () => {
    const deflator = buildDeflator(ipc([["2026-02", 10], ["2026-03", 10]]));
    expect(deflator?.pesosDe).toBe("2026-03");
    expect(deflator?.factor("2026-01")).toBeCloseTo(1.21);
  });

  it("el mes del último IPC y los posteriores tienen factor 1", () => {
    const deflator = buildDeflator(ipc([["2026-02", 10], ["2026-03", 10]]));
    expect(deflator?.factor("2026-03")).toBe(1);
    expect(deflator?.factor("2026-06")).toBe(1);
  });

  it("un hueco en la serie no aporta factor", () => {
    const deflator = buildDeflator(ipc([["2026-02", 10], ["2026-04", 10]]));
    expect(deflator?.factor("2026-01")).toBeCloseTo(1.21);
  });

  it("con la serie desordenada pesosDe es el máximo", () => {
    expect(buildDeflator(ipc([["2026-04", 1], ["2026-02", 1]]))?.pesosDe).toBe("2026-04");
  });

  it("sin IPC devuelve null", () => {
    expect(buildDeflator([])).toBeNull();
  });
});
