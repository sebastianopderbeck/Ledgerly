import { describe, it, expect } from "vitest";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import {
  averageSavingsRate, cashFlowChartRows, cashFlowYears, closedMonths, closedMonthsInYears, detailRows, formatSavingsRate,
  incompleteCaption, isNegative, lastClosedMonth, lastCompleteMonth, monthNotes, notesText, projectionMonths,
  savingsAverageLabel, shortMonth,
} from "./cashFlow.js";

const month = (mes: string, overrides: Partial<CashFlowMonthDTO> = {}): CashFlowMonthDTO => ({
  mes,
  estado: "completo",
  ingreso: 1_000_000,
  conSac: false,
  tarjetas: 500_000,
  hipoteca: 300_000,
  auto: 100_000,
  egresos: 900_000,
  margen: 100_000,
  tasaAhorro: 0.1,
  faltantes: [],
  estimados: [],
  ...overrides,
});

const incompleto = (mes: string, faltantes: string[]): CashFlowMonthDTO =>
  month(mes, { estado: "incompleto", margen: null, tasaAhorro: null, faltantes });

const proyectado = (mes: string): CashFlowMonthDTO =>
  month(mes, { estado: "proyectado", estimados: ["Sueldo (último neto)"] });

const meses = [
  month("2026-07"),
  month("2026-08"),
  incompleto("2026-09", ["Resumen ICBC"]),
  month("2026-10", { estado: "en_curso" }),
  proyectado("2026-11"),
];

describe("meses cerrados y proyectados", () => {
  it("separa los meses cerrados de la proyección, en orden ascendente", () => {
    const desordenados = [meses[4], meses[2], meses[0], meses[3], meses[1]];
    expect(closedMonths(desordenados).map((item) => item.mes)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(projectionMonths(desordenados).map((item) => item.mes)).toEqual(["2026-10", "2026-11"]);
  });

  it("el último mes completo salta los incompletos y los proyectados", () => {
    expect(lastCompleteMonth(meses)?.mes).toBe("2026-08");
    expect(lastCompleteMonth([incompleto("2026-09", ["Recibo de sueldo"]), proyectado("2026-10")])).toBeNull();
  });

  it("el último mes cerrado es el más reciente aunque esté incompleto", () => {
    expect(lastClosedMonth(meses)?.mes).toBe("2026-09");
    expect(lastClosedMonth([proyectado("2026-10")])).toBeNull();
  });

  it("filtra los meses cerrados por año y ofrece solo los años de la historia", () => {
    const conAnios = [month("2025-12"), ...meses, proyectado("2027-01")];
    expect(closedMonthsInYears(conAnios, { kind: "years", years: ["2025"] }).map((item) => item.mes)).toEqual(["2025-12"]);
    expect(closedMonthsInYears(conAnios, { kind: "all" }).map((item) => item.mes)).toEqual(["2025-12", "2026-07", "2026-08", "2026-09"]);
    expect(cashFlowYears(conAnios)).toEqual(["2025", "2026"]);
  });
});

describe("averageSavingsRate", () => {
  it("pondera por ingreso e ignora los incompletos y los proyectados", () => {
    const conSac = month("2026-06", { ingreso: 2_000_000, margen: 500_000, tasaAhorro: 0.25, conSac: true });
    expect(averageSavingsRate([conSac, ...meses])).toEqual({ tasa: 700_000 / 4_000_000, meses: 3 });
  });

  it("mira solo los últimos 12 meses cerrados", () => {
    const viejos = [month("2025-08", { margen: 900_000 }), month("2025-09", { margen: 900_000 })];
    const recientes = Array.from({ length: 12 }, (_unused, index) => month(`2026-${String(index + 1).padStart(2, "0")}`));
    expect(averageSavingsRate([...viejos, ...recientes])).toEqual({ tasa: 0.1, meses: 12 });
  });

  it("descarta los meses sin ingreso y sin meses válidos no hay promedio", () => {
    expect(averageSavingsRate([month("2026-08", { ingreso: 0, margen: -100, tasaAhorro: null })])).toEqual({ tasa: null, meses: 0 });
    expect(averageSavingsRate([incompleto("2026-09", ["Recibo de sueldo"])])).toEqual({ tasa: null, meses: 0 });
  });
});

describe("textos", () => {
  it("describe el promedio de ahorro", () => {
    expect(savingsAverageLabel({ tasa: 0.065, meses: 3 })).toBe("promedio 3 meses: 6,5%");
    expect(savingsAverageLabel({ tasa: 0.1, meses: 1 })).toBe("promedio 1 mes: 10,0%");
    expect(savingsAverageLabel({ tasa: null, meses: 0 })).toBe("sin promedio todavía");
  });

  it("formatea la tasa como porcentaje o raya", () => {
    expect(formatSavingsRate(0.065)).toBe("6,5%");
    expect(formatSavingsRate(null)).toBe("—");
  });

  it("solo un número menor que 0 es negativo", () => {
    expect(isNegative(-1)).toBe(true);
    expect(isNegative(0)).toBe(false);
    expect(isNegative(null)).toBe(false);
  });

  it("abrevia el mes con el año", () => {
    expect(shortMonth("2026-07")).toBe("Jul 2026");
  });

  it("pone primero lo que falta y después lo estimado", () => {
    const mes = month("2026-10", { faltantes: ["Resumen ICBC", "Cupón del auto"], estimados: ["Sueldo (último neto)"] });
    expect(monthNotes(mes)).toEqual([
      { label: "Falta", text: "Resumen ICBC, Cupón del auto" },
      { label: "Estimado", text: "Sueldo (último neto)" },
    ]);
    expect(notesText(mes)).toBe("Falta: Resumen ICBC, Cupón del auto · Estimado: Sueldo (último neto)");
    expect(monthNotes(month("2026-08"))).toEqual([]);
    expect(notesText(month("2026-08"))).toBe("");
  });

  it("explica los meses incompletos del gráfico", () => {
    const historia = [incompleto("2026-07", ["Recibo de sueldo"]), incompleto("2026-08", ["Resumen ICBC"]), month("2026-09")];
    expect(incompleteCaption(historia)).toBe(
      "Los meses incompletos se ven atenuados y sin margen: Jul 2026 (falta Recibo de sueldo), Ago 2026 (falta Resumen ICBC).",
    );
    expect(incompleteCaption([month("2026-09")])).toBeNull();
  });
});

describe("filas", () => {
  it("el gráfico omite las barras sin valor", () => {
    const rows = cashFlowChartRows([month("2026-08"), month("2026-09", { estado: "incompleto", ingreso: null, margen: null })]);
    expect(rows[0]).toEqual({ month: "2026-08", estado: "completo", Ingreso: 1_000_000, Egresos: 900_000, Margen: 100_000 });
    expect(rows[1]).toEqual({ month: "2026-09", estado: "incompleto", Egresos: 900_000 });
  });

  it("el detalle va del mes más nuevo al más viejo", () => {
    const historia = closedMonths(meses);
    const proyeccion = projectionMonths(meses);
    expect(detailRows(historia, proyeccion).map((item) => item.mes)).toEqual(["2026-11", "2026-10", "2026-09", "2026-08", "2026-07"]);
  });
});
