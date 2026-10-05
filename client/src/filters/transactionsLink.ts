import type { Currency } from "@ledgerly/shared";
import { ALL_YEARS, monthRange } from "./globalFilters.js";

export interface TransactionsLinkFilters {
  year?: string[] | typeof ALL_YEARS;
  category?: string;
  currency?: Currency;
  month?: string;
  search?: string;
}

const appendYears = (params: URLSearchParams, year: TransactionsLinkFilters["year"]): void => {
  if (year === ALL_YEARS) {
    params.append("year", ALL_YEARS);
    return;
  }
  for (const value of year ?? []) params.append("year", value);
};

export function transactionsLink({ year, category, currency, month, search }: TransactionsLinkFilters = {}): string {
  const params = new URLSearchParams();
  appendYears(params, year);
  if (category) params.set("category", category);
  if (currency) params.set("currency", currency);
  if (month) {
    const range = monthRange(month);
    params.set("from", range.from);
    params.set("to", range.to);
  }
  if (search) params.set("search", search);
  const query = params.toString();
  return query ? `/transactions?${query}` : "/transactions";
}
