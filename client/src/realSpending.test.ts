import { describe, it, expect } from "vitest";
import type {
  FutureInstallmentItem, FutureInstallmentMonth, InflationRateDTO, MonthlyStat, StatementDTO,
} from "@ledgerly/shared";
import { buildDeflator, type Deflator } from "./inflationIndex.js";
import { addMonths } from "./isoDate.js";
import {
  buildRealSpendingView,
  pendingByPurchaseMonth,
  realSpendingSeries,
  summarizeRealSpending,
  type RealSpendingInput,
  type RealSpendingPoint,
} from "./realSpending.js";

const monthsFrom = (desde: string, hasta: string): string[] => {
  const months: string[] = [];
  for (let month = desde; month <= hasta; month = addMonths(month, 1)) months.push(month);
  return months;
};

const ipc = (desde: string, hasta: string, variacionMensual: number): InflationRateDTO[] =>
  monthsFrom(desde, hasta).map((periodo) => ({ periodo, variacionMensual }));

const monthly = (pairs: [string, number][]): MonthlyStat[] => pairs.map(([month, total]) => ({ month, total, count: 1 }));

const item = (purchaseDate: string, amount: number): FutureInstallmentItem => ({
  merchant: "COMERCIO", category: "Compras", amount, installmentNumber: 2, installmentTotal: 3, purchaseDate,
});

const pendingMonth = (month: string, items: FutureInstallmentItem[]): FutureInstallmentMonth => ({
  month, total: items.reduce((sum, { amount }) => sum + amount, 0), count: items.length, items,
});

const point = (month: string, real: number): RealSpendingPoint => ({ month, nominal: real, real });

const makeStatement = (issuer: StatementDTO["issuer"], cardLabel: string, closingDate: string): StatementDTO => ({
  id: `${issuer}-${closingDate}`,
  issuer,
  cardLabel,
  last4: "1234",
  closingDate,
  dueDate: null,
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 0, usd: 0 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "x.pdf",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 0,
  uploadedAt: "2026-07-01T00:00:00.000Z",
});

const statementsEveryMonth = (
  issuer: StatementDTO["issuer"], cardLabel: string, desde: string, hasta: string, day: string,
): StatementDTO[] => monthsFrom(desde, hasta).map((month) => makeStatement(issuer, cardLabel, `${month}-${day}`));

describe("pendingByPurchaseMonth", () => {
  it("suma en el mes de compra las cuotas que vencen en meses distintos", () => {
    const detail = [
      pendingMonth("2026-09", [item("2026-07-15", 1000), item("2026-08-03", 500)]),
      pendingMonth("2026-10", [item("2026-07-15", 1000)]),
    ];
    expect(pendingByPurchaseMonth(detail)).toEqual(new Map([["2026-07", 2000], ["2026-08", 500]]));
  });

  it("sin cuotas pendientes devuelve un mapa vacío", () => {
    expect(pendingByPurchaseMonth([]).size).toBe(0);
  });
});

describe("realSpendingSeries", () => {
  const deflator = buildDeflator(ipc("2026-02", "2026-04", 10)) as Deflator;

  it("suma las cuotas pendientes al mes de compra y lleva a pesos del último IPC", () => {
    const series = realSpendingSeries(
      monthly([["2026-03", 1000], ["2026-04", 2000]]),
      new Map([["2026-03", 500]]),
      deflator,
      { desde: "2026-01", hasta: "2026-06" },
    );
    expect(series.map(({ month }) => month)).toEqual(["2026-03", "2026-04"]);
    expect(series[0].nominal).toBe(1500);
    expect(series[0].real).toBeCloseTo(1650);
    expect(series[1]).toEqual({ month: "2026-04", nominal: 2000, real: 2000 });
  });

  it("corta en el último mes completo aunque haya IPC posterior", () => {
    const series = realSpendingSeries(monthly([["2026-03", 1000], ["2026-04", 2000]]), new Map(), deflator, {
      desde: "2026-01", hasta: "2026-03",
    });
    expect(series.map(({ month }) => month)).toEqual(["2026-03"]);
  });

  it("corta en el último IPC aunque haya meses completos posteriores", () => {
    const series = realSpendingSeries(
      monthly([["2026-04", 1000], ["2026-05", 1000], ["2026-06", 1000]]),
      new Map(),
      deflator,
      { desde: "2026-01", hasta: "2026-06" },
    );
    expect(series.map(({ month }) => month)).toEqual(["2026-04"]);
  });

  it("deja afuera los meses anteriores a la cobertura", () => {
    const series = realSpendingSeries(monthly([["2026-02", 1000], ["2026-03", 1000]]), new Map(), deflator, {
      desde: "2026-03", hasta: "2026-04",
    });
    expect(series.map(({ month }) => month)).toEqual(["2026-03"]);
  });

  it("ignora las cuotas pendientes de meses sin compras facturadas", () => {
    const series = realSpendingSeries(monthly([["2026-04", 1000]]), new Map([["2026-03", 999]]), deflator, {
      desde: "2026-01", hasta: "2026-04",
    });
    expect(series).toEqual([{ month: "2026-04", nominal: 1000, real: 1000 }]);
  });

  it("ordena por mes aunque la entrada venga desordenada", () => {
    const series = realSpendingSeries(
      monthly([["2026-04", 1], ["2026-02", 1], ["2026-03", 1]]),
      new Map(),
      deflator,
      { desde: "2026-01", hasta: "2026-04" },
    );
    expect(series.map(({ month }) => month)).toEqual(["2026-02", "2026-03", "2026-04"]);
  });
});

describe("summarizeRealSpending", () => {
  it("con cuotas pendientes la interanual real del ejemplo da +41,9 %", () => {
    const deflator = buildDeflator(ipc("2025-09", "2026-08", 2)) as Deflator;
    const series = realSpendingSeries(
      monthly([["2025-08", 100000], ["2026-08", 150000]]),
      new Map([["2026-08", 30000]]),
      deflator,
      { desde: "2025-01", hasta: "2026-08" },
    );
    const summary = summarizeRealSpending(series, "2026-08");
    expect(series[0].real).toBeCloseTo(126824.18, 1);
    expect(summary?.real).toBe(180000);
    expect(summary?.interanual).toBeCloseTo(41.93, 1);
    expect(summary?.vsPromedio).toBeNull();
    expect(summary?.mesesPromedio).toBe(1);
  });

  it("sin el mismo mes del año anterior la interanual es null", () => {
    const series = monthsFrom("2026-01", "2026-08").map((month) => point(month, 100));
    expect(summarizeRealSpending(series, "2026-08")?.interanual).toBeNull();
  });

  it("con el mismo mes del año anterior en 0 la interanual es null", () => {
    const series = [point("2025-08", 0), point("2026-08", 100)];
    expect(summarizeRealSpending(series, "2026-08")?.interanual).toBeNull();
  });

  it("promedia los 12 meses anteriores y nada más", () => {
    const series = [
      point("2025-07", 1000),
      ...monthsFrom("2025-08", "2026-07").map((month) => point(month, 100)),
      point("2026-08", 150),
    ];
    const summary = summarizeRealSpending(series, "2026-08");
    expect(summary?.vsPromedio).toBeCloseTo(50);
    expect(summary?.mesesPromedio).toBe(12);
    expect(summary?.interanual).toBeCloseTo(50);
  });

  it("con 3 meses anteriores ya calcula el promedio", () => {
    const series = [point("2026-05", 100), point("2026-06", 100), point("2026-07", 100), point("2026-08", 90)];
    const summary = summarizeRealSpending(series, "2026-08");
    expect(summary?.vsPromedio).toBeCloseTo(-10);
    expect(summary?.mesesPromedio).toBe(3);
  });

  it("con 2 meses anteriores no alcanza para el promedio", () => {
    const series = [point("2026-06", 100), point("2026-07", 100), point("2026-08", 90)];
    const summary = summarizeRealSpending(series, "2026-08");
    expect(summary?.vsPromedio).toBeNull();
    expect(summary?.mesesPromedio).toBe(2);
  });

  it("los meses que faltan no cuentan como cero", () => {
    const series = [point("2026-03", 100), point("2026-05", 100), point("2026-07", 100), point("2026-08", 200)];
    const summary = summarizeRealSpending(series, "2026-08");
    expect(summary?.vsPromedio).toBeCloseTo(100);
    expect(summary?.mesesPromedio).toBe(3);
  });

  it("un mes fuera de la serie no tiene resumen", () => {
    expect(summarizeRealSpending([point("2026-08", 100)], "2026-09")).toBeNull();
  });
});

describe("buildRealSpendingView", () => {
  const totals: [string, number][] = monthsFrom("2025-01", "2026-09").map((month) => {
    if (month === "2025-01") return [month, 80];
    if (month === "2026-01") return [month, 120];
    if (month === "2026-09") return [month, 50];
    return [month, 100];
  });

  const input: RealSpendingInput = {
    monthly: monthly(totals),
    pendingDetail: [],
    statements: statementsEveryMonth("icbc", "ICBC", "2025-01", "2026-09", "07"),
    inflation: ipc("2025-01", "2026-08", 0),
  };

  it("con un año elegido grafica solo ese año y termina en el último mes completo", () => {
    const view = buildRealSpendingView(input, { years: ["2026"] });
    expect(view.pesosDe).toBe("2026-08");
    expect(view.points.map(({ month }) => month)).toEqual(monthsFrom("2026-01", "2026-08"));
    expect(view.summary?.month).toBe("2026-08");
  });

  it("la interanual de enero usa enero del año anterior aunque no esté elegido", () => {
    const view = buildRealSpendingView(input, { years: ["2026"], from: "2026-01-01", to: "2026-01-31" });
    expect(view.points.map(({ month }) => month)).toEqual(["2026-01"]);
    expect(view.summary?.month).toBe("2026-01");
    expect(view.summary?.interanual).toBeCloseTo(50);
  });

  it("sin años elegidos grafica toda la cobertura", () => {
    const view = buildRealSpendingView(input, {});
    expect(view.points[0].month).toBe("2025-01");
    expect(view.points.at(-1)?.month).toBe("2026-08");
  });

  it("un año sin meses completos no grafica nada", () => {
    expect(buildRealSpendingView(input, { years: ["2027"] })).toEqual({ pesosDe: "2026-08", points: [], summary: null });
  });

  it("un mes elegido todavía abierto no grafica nada", () => {
    const view = buildRealSpendingView(input, { years: ["2026"], from: "2026-09-01", to: "2026-09-30" });
    expect(view.points).toEqual([]);
    expect(view.summary).toBeNull();
  });

  it("con una tarjeta elegida la cobertura usa solo sus resúmenes", () => {
    const withVisa: RealSpendingInput = {
      ...input,
      statements: [...input.statements, ...statementsEveryMonth("visa_signature", "Visa Signature", "2025-01", "2026-06", "02")],
    };
    expect(buildRealSpendingView(withVisa, {}).points.at(-1)?.month).toBe("2026-05");
    expect(buildRealSpendingView(withVisa, { cardLabel: "ICBC" }).points.at(-1)?.month).toBe("2026-08");
  });

  it("sin IPC no hay pesos de referencia", () => {
    expect(buildRealSpendingView({ ...input, inflation: [] }, {})).toEqual({ pesosDe: null, points: [], summary: null });
  });

  it("sin meses completos informa los pesos pero no grafica", () => {
    const view = buildRealSpendingView({ ...input, statements: [makeStatement("icbc", "ICBC", "2026-09-07")] }, {});
    expect(view).toEqual({ pesosDe: "2026-08", points: [], summary: null });
  });
});
