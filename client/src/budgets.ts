import type { BudgetDTO, BudgetSpendingDTO, CategoryMonthStat, CategoryRuleDTO, InflationRateDTO } from "@ledgerly/shared";
import { categoryOptions } from "./categoryOptions.js";
import { formatMonthLabel } from "./format.js";
import { inflationFactor, latestInflationPeriod } from "./inflationIndex.js";

export type BudgetStatus = "ok" | "cerca" | "pasado";
export type BudgetStatusColor = "success" | "warning" | "error";

export const CERCA_DESDE = 0.8;
export const BUDGET_STATUSES: BudgetStatus[] = ["ok", "cerca", "pasado"];
export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = { ok: "En rango", cerca: "Cerca", pasado: "Pasado" };
export const BUDGET_STATUS_COLOR: Record<BudgetStatus, BudgetStatusColor> = { ok: "success", cerca: "warning", pasado: "error" };

export interface BudgetLine {
  budget: BudgetDTO;
  category: string;
  tope: number;
  gastado: number;
  restante: number;
  ratio: number;
  estado: BudgetStatus;
}

export interface BudgetTotals {
  tope: number;
  gastado: number;
  restante: number;
  ratio: number;
  estado: BudgetStatus;
  cumplidos: number;
  cerca: number;
  total: number;
}

export interface UnbudgetedCategory {
  category: string;
  total: number;
}

export interface BudgetMonthSummary {
  month: string;
  ok: string[];
  cerca: string[];
  pasado: string[];
}

export interface BudgetsViewInput {
  budgets: BudgetDTO[];
  spending: BudgetSpendingDTO;
  inflation: InflationRateDTO[];
  selectedMonth: string | null;
  today: Date;
}

export interface BudgetsView {
  months: string[];
  month: string;
  partial: boolean;
  lines: BudgetLine[];
  totals: BudgetTotals | null;
  unbudgeted: UnbudgetedCategory[];
  history: BudgetMonthSummary[];
  latestIpc: string | null;
  hasSpending: boolean;
}

const pesosFormat = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 0,
});

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const spendingIn = (gastos: CategoryMonthStat[], month: string): Map<string, number> =>
  new Map(gastos.filter((gasto) => gasto.month === month).map(({ category, total }) => [category, total]));

const byRatioThenCategory = (a: BudgetLine, b: BudgetLine): number =>
  b.ratio - a.ratio || a.category.localeCompare(b.category, "es");

const pad2 = (value: number): string => String(value).padStart(2, "0");

const calendarMonth = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();

const categoriesIn = (lines: BudgetLine[], estado: BudgetStatus): string[] =>
  lines.filter((line) => line.estado === estado).map((line) => line.category);

export function formatPesos(value: number): string {
  return pesosFormat.format(Math.round(value) || 0);
}

export function monthInText(month: string): string {
  return formatMonthLabel(month).toLowerCase();
}

export function budgetStatus(gastado: number, tope: number): BudgetStatus {
  const ratio = gastado / tope;
  if (ratio < CERCA_DESDE) return "ok";
  if (ratio <= 1) return "cerca";
  return "pasado";
}

export function limitForMonth(budget: BudgetDTO, month: string, inflation: InflationRateDTO[]): number {
  if (!budget.ajustaInflacion) return budget.topeArs;
  return budget.topeArs * inflationFactor(inflation, budget.periodoBase, month);
}

export function currentLimit(budget: BudgetDTO, inflation: InflationRateDTO[]): number {
  const pesosDeHoy = latestInflationPeriod(inflation) ?? budget.periodoBase;
  return Math.round(limitForMonth(budget, pesosDeHoy, inflation));
}

export function budgetLines(
  budgets: BudgetDTO[],
  gastos: CategoryMonthStat[],
  month: string,
  inflation: InflationRateDTO[],
): BudgetLine[] {
  const spent = spendingIn(gastos, month);
  return budgets
    .map((budget) => {
      const tope = limitForMonth(budget, month, inflation);
      const gastado = spent.get(budget.category) ?? 0;
      return {
        budget,
        category: budget.category,
        tope,
        gastado,
        restante: tope - gastado,
        ratio: gastado / tope,
        estado: budgetStatus(gastado, tope),
      };
    })
    .sort(byRatioThenCategory);
}

export function budgetTotals(lines: BudgetLine[]): BudgetTotals | null {
  if (lines.length === 0) return null;
  const tope = sum(lines.map((line) => line.tope));
  const gastado = sum(lines.map((line) => line.gastado));
  return {
    tope,
    gastado,
    restante: tope - gastado,
    ratio: gastado / tope,
    estado: budgetStatus(gastado, tope),
    cumplidos: lines.filter((line) => line.estado !== "pasado").length,
    cerca: lines.filter((line) => line.estado === "cerca").length,
    total: lines.length,
  };
}

export function unbudgetedCategories(budgets: BudgetDTO[], gastos: CategoryMonthStat[], month: string): UnbudgetedCategory[] {
  const budgeted = new Set(budgets.map((budget) => budget.category));
  return gastos
    .filter((gasto) => gasto.month === month && gasto.total > 0 && !budgeted.has(gasto.category))
    .map(({ category, total }) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export function budgetCategoryOptions(
  categories: string[],
  rules: Pick<CategoryRuleDTO, "category">[],
  budgets: BudgetDTO[],
): string[] {
  const budgeted = new Set(budgets.map((budget) => budget.category));
  return categoryOptions(categories, rules).filter((category) => !budgeted.has(category));
}

export function budgetBalanceText(restante: number): string {
  return restante < 0 ? `Te pasaste por ${formatPesos(-restante)}` : `Te quedan ${formatPesos(restante)}`;
}

export function budgetInflationNote(budget: BudgetDTO, month: string, latestIpc: string | null): string {
  if (!budget.ajustaInflacion) return "";
  if (latestIpc === null) return " · Ajustado por IPC (sin IPC cargado)";
  if (month > latestIpc) return ` · Ajustado por IPC (IPC hasta ${monthInText(latestIpc)})`;
  return " · Ajustado por IPC";
}

export function isPartialMonth(month: string, ultimoMesCerrado: string | null): boolean {
  return ultimoMesCerrado !== null && month > ultimoMesCerrado;
}

export function selectableMonths(gastos: CategoryMonthStat[], selected: string | null): string[] {
  const months = gastos.map((gasto) => gasto.month);
  return uniqueSorted(selected === null ? months : [...months, selected]);
}

export function defaultBudgetMonth(months: string[], ultimoMesCerrado: string | null, today: Date): string {
  const closed = months.filter((month) => !isPartialMonth(month, ultimoMesCerrado));
  return closed.at(-1) ?? months.at(-1) ?? calendarMonth(today);
}

export function closedMonths(gastos: CategoryMonthStat[], ultimoMesCerrado: string | null): string[] {
  return selectableMonths(gastos, null).filter((month) => !isPartialMonth(month, ultimoMesCerrado));
}

export function budgetHistory(
  budgets: BudgetDTO[],
  gastos: CategoryMonthStat[],
  months: string[],
  inflation: InflationRateDTO[],
): BudgetMonthSummary[] {
  return months.map((month) => {
    const lines = budgetLines(budgets, gastos, month, inflation);
    return { month, ok: categoriesIn(lines, "ok"), cerca: categoriesIn(lines, "cerca"), pasado: categoriesIn(lines, "pasado") };
  });
}

export function budgetsView({ budgets, spending, inflation, selectedMonth, today }: BudgetsViewInput): BudgetsView {
  const { gastos, ultimoMesCerrado } = spending;
  const month = selectedMonth ?? defaultBudgetMonth(selectableMonths(gastos, null), ultimoMesCerrado, today);
  const lines = budgetLines(budgets, gastos, month, inflation);
  return {
    months: selectableMonths(gastos, month),
    month,
    partial: isPartialMonth(month, ultimoMesCerrado),
    lines,
    totals: budgetTotals(lines),
    unbudgeted: unbudgetedCategories(budgets, gastos, month),
    history: budgetHistory(budgets, gastos, closedMonths(gastos, ultimoMesCerrado), inflation),
    latestIpc: latestInflationPeriod(inflation),
    hasSpending: gastos.some((gasto) => gasto.month === month),
  };
}
