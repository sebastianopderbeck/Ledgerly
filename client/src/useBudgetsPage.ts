import { useMemo } from "react";
import type { BudgetDTO, BudgetSpendingDTO, CategoryRuleDTO, InflationRateDTO } from "@ledgerly/shared";
import { useBudgetSpending, useBudgets, useCategories, useCategoryRules, useInflation } from "./api/hooks.js";
import { budgetCategoryOptions, budgetsView, type BudgetsView } from "./budgets.js";
import { useGlobalFilters } from "./filters/useGlobalFilters.js";
import { useTransactionYearOptions } from "./filters/useYearOptions.js";

export interface BudgetsPageData extends BudgetsView {
  budgets: BudgetDTO[];
  inflation: InflationRateDTO[];
  categoryOptions: string[];
  yearOptions: string[];
  isLoading: boolean;
  error: Error | null;
  selectMonth: (month: string) => void;
}

const NO_BUDGETS: BudgetDTO[] = [];
const NO_SPENDING: BudgetSpendingDTO = { ultimoMesCerrado: null, gastos: [] };
const NO_INFLATION: InflationRateDTO[] = [];
const NO_CATEGORIES: string[] = [];
const NO_RULES: CategoryRuleDTO[] = [];

export const useBudgetsPage = (): BudgetsPageData => {
  const { years, from, setMonth } = useGlobalFilters();
  const budgetsQuery = useBudgets();
  const spendingQuery = useBudgetSpending(years);
  const inflationQuery = useInflation();
  const { data: categories = NO_CATEGORIES } = useCategories();
  const { data: rules = NO_RULES } = useCategoryRules();
  const yearOptions = useTransactionYearOptions("ARS", undefined);

  const budgets = budgetsQuery.data ?? NO_BUDGETS;
  const spending = spendingQuery.data ?? NO_SPENDING;
  const inflation = inflationQuery.data ?? NO_INFLATION;
  const selectedMonth = from ? from.slice(0, 7) : null;

  const view = useMemo(
    () => budgetsView({ budgets, spending, inflation, selectedMonth, today: new Date() }),
    [budgets, spending, inflation, selectedMonth],
  );
  const categoryOptions = useMemo(
    () => budgetCategoryOptions(categories, rules, budgets),
    [categories, rules, budgets],
  );

  return {
    ...view,
    budgets,
    inflation,
    categoryOptions,
    yearOptions,
    isLoading: budgetsQuery.isLoading || spendingQuery.isLoading || inflationQuery.isLoading,
    error: budgetsQuery.error ?? spendingQuery.error ?? null,
    selectMonth: setMonth,
  };
};
