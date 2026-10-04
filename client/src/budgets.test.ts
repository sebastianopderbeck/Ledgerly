import { describe, it, expect } from "vitest";
import type { BudgetDTO, CategoryMonthStat, InflationRateDTO } from "@ledgerly/shared";
import { formatMoney } from "./format.js";
import {
  budgetBalanceText, budgetCategoryOptions, budgetInflationNote, budgetLines, budgetStatus, budgetTotals, currentLimit,
  formatPesos, limitForMonth, monthInText, unbudgetedCategories,
} from "./budgets.js";

const budget = (category: string, topeArs: number, overrides: Partial<BudgetDTO> = {}): BudgetDTO => ({
  id: `id-${category}`, category, topeArs, ajustaInflacion: false, periodoBase: "2026-08", ...overrides,
});

const gasto = (month: string, category: string, total: number): CategoryMonthStat => ({ month, category, total, count: 1 });

const ipc = (pairs: [string, number][]): InflationRateDTO[] =>
  pairs.map(([periodo, variacionMensual]) => ({ periodo, variacionMensual }));

const INFLATION = ipc([["2026-07", 4], ["2026-08", 10], ["2026-09", 10]]);

describe("budgetStatus", () => {
  it("en rango por debajo del 80 %, cerca hasta el 100 % inclusive y pasado arriba", () => {
    expect(budgetStatus(79, 100)).toBe("ok");
    expect(budgetStatus(80, 100)).toBe("cerca");
    expect(budgetStatus(100, 100)).toBe("cerca");
    expect(budgetStatus(101, 100)).toBe("pasado");
  });

  it("sin gasto está en rango", () => {
    expect(budgetStatus(0, 100)).toBe("ok");
  });
});

describe("limitForMonth", () => {
  it("sin ajuste el tope es el mismo todos los meses", () => {
    const fijo = budget("Comida", 1000);
    expect(limitForMonth(fijo, "2026-01", INFLATION)).toBe(1000);
    expect(limitForMonth(fijo, "2026-12", INFLATION)).toBe(1000);
  });

  it("con ajuste sube con el IPC publicado después de periodoBase", () => {
    const ajustado = budget("Comida", 1000, { ajustaInflacion: true, periodoBase: "2026-07" });
    expect(limitForMonth(ajustado, "2026-07", INFLATION)).toBe(1000);
    expect(limitForMonth(ajustado, "2026-09", INFLATION)).toBeCloseTo(1210);
  });

  it("con ajuste se deflacta hacia atrás", () => {
    const ajustado = budget("Comida", 1210, { ajustaInflacion: true, periodoBase: "2026-09" });
    expect(limitForMonth(ajustado, "2026-07", INFLATION)).toBeCloseTo(1000);
  });

  it("después del último IPC se queda con el último factor publicado", () => {
    const ajustado = budget("Comida", 1000, { ajustaInflacion: true, periodoBase: "2026-08" });
    expect(limitForMonth(ajustado, "2026-12", INFLATION)).toBeCloseTo(1100);
  });
});

describe("currentLimit", () => {
  it("lleva el tope a pesos del último IPC y lo redondea", () => {
    const ajustado = budget("Comida", 1000.4, { ajustaInflacion: true, periodoBase: "2026-08" });
    expect(currentLimit(ajustado, INFLATION)).toBe(1100);
  });

  it("sin IPC cargado devuelve el tope redondeado", () => {
    expect(currentLimit(budget("Comida", 1234.6, { ajustaInflacion: true }), [])).toBe(1235);
  });

  it("sin ajuste devuelve el tope fijo", () => {
    expect(currentLimit(budget("Comida", 5000), INFLATION)).toBe(5000);
  });
});

describe("budgetLines", () => {
  const budgets = [budget("Ropa", 100), budget("Comida", 300), budget("Transporte", 100), budget("Salidas", 50)];
  const gastos = [
    gasto("2026-08", "Comida", 999),
    gasto("2026-09", "Comida", 330),
    gasto("2026-09", "Transporte", 85),
    gasto("2026-09", "Ropa", 20),
    gasto("2026-09", "Farmacia", 15),
  ];

  it("arma una línea por tope con lo gastado en el mes, lo más comprometido arriba", () => {
    const lines = budgetLines(budgets, gastos, "2026-09", []);
    expect(lines.map(({ category, gastado, estado }) => ({ category, gastado, estado }))).toEqual([
      { category: "Comida", gastado: 330, estado: "pasado" },
      { category: "Transporte", gastado: 85, estado: "cerca" },
      { category: "Ropa", gastado: 20, estado: "ok" },
      { category: "Salidas", gastado: 0, estado: "ok" },
    ]);
    expect(lines[0]).toMatchObject({ budget: budgets[1], tope: 300, restante: -30, ratio: 1.1 });
  });

  it("si la proporción empata ordena por categoría", () => {
    const lines = budgetLines([budget("Salidas", 50), budget("Libros", 50)], [], "2026-09", []);
    expect(lines.map((line) => line.category)).toEqual(["Libros", "Salidas"]);
  });

  it("usa el tope ajustado de ese mes", () => {
    const ajustado = budget("Comida", 1000, { ajustaInflacion: true, periodoBase: "2026-07" });
    const [line] = budgetLines([ajustado], [gasto("2026-09", "Comida", 1200)], "2026-09", INFLATION);
    expect(line.tope).toBeCloseTo(1210);
    expect(line.estado).toBe("cerca");
  });
});

describe("budgetTotals", () => {
  it("suma topes y gastos de las categorías con tope y cuenta los cumplidos", () => {
    const lines = budgetLines(
      [budget("Comida", 300), budget("Transporte", 100), budget("Ropa", 100)],
      [gasto("2026-09", "Comida", 330), gasto("2026-09", "Transporte", 85), gasto("2026-09", "Ropa", 20), gasto("2026-09", "Farmacia", 15)],
      "2026-09",
      [],
    );
    expect(budgetTotals(lines)).toEqual({
      tope: 500, gastado: 435, restante: 65, ratio: 0.87, estado: "cerca", cumplidos: 2, cerca: 1, total: 3,
    });
  });

  it("sin líneas devuelve null", () => {
    expect(budgetTotals([])).toBeNull();
  });
});

describe("unbudgetedCategories", () => {
  it("lista las categorías con gasto en el mes y sin tope, de mayor a menor, incluida «Sin categoría»", () => {
    const gastos = [
      gasto("2026-09", "Comida", 330),
      gasto("2026-09", "Farmacia", 15),
      gasto("2026-09", "Sin categoría", 40),
      gasto("2026-09", "Regalos", 0),
      gasto("2026-08", "Libros", 99),
    ];
    expect(unbudgetedCategories([budget("Comida", 300)], gastos, "2026-09")).toEqual([
      { category: "Sin categoría", total: 40 },
      { category: "Farmacia", total: 15 },
    ]);
  });
});

describe("budgetCategoryOptions", () => {
  it("ofrece las categorías de movimientos y reglas que todavía no tienen tope, sin «Sin categoría»", () => {
    const options = budgetCategoryOptions(
      ["Comida", "Sin categoría", "Farmacia"],
      [{ category: "Viajes" }, { category: "Comida" }],
      [budget("Comida", 300)],
    );
    expect(options).toEqual(["Farmacia", "Viajes"]);
  });
});

describe("textos", () => {
  it("formatPesos redondea a pesos enteros y no muestra -0", () => {
    expect(formatPesos(1500.6)).toBe(formatMoney(1501, "ARS"));
    expect(formatPesos(-0.2)).toBe(formatMoney(0, "ARS"));
  });

  it("monthInText deja el mes en minúscula para usarlo en una oración", () => {
    expect(monthInText("2026-09")).toBe("septiembre de 2026");
  });

  it("budgetBalanceText dice cuánto queda o por cuánto te pasaste", () => {
    expect(budgetBalanceText(65000)).toBe(`Te quedan ${formatMoney(65000, "ARS")}`);
    expect(budgetBalanceText(0)).toBe(`Te quedan ${formatMoney(0, "ARS")}`);
    expect(budgetBalanceText(-30000)).toBe(`Te pasaste por ${formatMoney(30000, "ARS")}`);
  });

  it("budgetInflationNote aclara el ajuste y hasta qué IPC llega", () => {
    const ajustado = budget("Comida", 1000, { ajustaInflacion: true });
    expect(budgetInflationNote(budget("Comida", 1000), "2026-09", "2026-08")).toBe("");
    expect(budgetInflationNote(ajustado, "2026-08", "2026-08")).toBe(" · Ajustado por IPC");
    expect(budgetInflationNote(ajustado, "2026-09", "2026-08")).toBe(" · Ajustado por IPC (IPC hasta agosto de 2026)");
    expect(budgetInflationNote(ajustado, "2026-09", null)).toBe(" · Ajustado por IPC (sin IPC cargado)");
  });
});
