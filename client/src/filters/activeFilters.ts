import { formatMonthLabel } from "../format.js";
import { currentYear, parseYearKey, yearKeyOf, yearsLabel, type YearSelection } from "./globalFilters.js";

export type FilterField = "year" | "currency" | "card" | "month" | "transaction";

type DetailField = Exclude<FilterField, "year" | "month">;

type ParamsReader<T> = (params: URLSearchParams) => T;

const SEPARATOR = " · ";

const yearSelectionOf = (params: URLSearchParams): YearSelection => parseYearKey(yearKeyOf(params));

const isCurrentYearOnly = (selection: YearSelection): boolean =>
  selection.kind === "years" && selection.years.length === 1 && selection.years[0] === currentYear();

const currencyOf = (params: URLSearchParams): string => (params.get("currency") === "USD" ? "USD" : "ARS");

const categoriesOf = (params: URLSearchParams): string[] => params.getAll("category").filter(Boolean);

const installmentLabel = (value: string | null): string | undefined => {
  if (value === "true") return "Solo cuotas";
  if (value === "false") return "Sin cuotas";
  return undefined;
};

const categoriesLabel = (categories: string[]): string | undefined => {
  if (categories.length === 0) return undefined;
  return categories.length === 1 ? categories[0] : `${categories.length} categorías`;
};

const countActive = (...active: boolean[]): number => active.filter(Boolean).length;

const ACTIVE_BY_FIELD: Record<FilterField, ParamsReader<number>> = {
  year: (params) => countActive(!isCurrentYearOnly(yearSelectionOf(params))),
  currency: (params) => countActive(currencyOf(params) === "USD"),
  card: (params) => countActive(Boolean(params.get("cardLabel"))),
  month: (params) => countActive(Boolean(params.get("from"))),
  transaction: (params) => countActive(
    categoriesOf(params).length > 0,
    installmentLabel(params.get("installment")) !== undefined,
    Boolean(params.get("search")),
  ),
};

const DETAILS_BY_FIELD: Record<DetailField, ParamsReader<Array<string | undefined>>> = {
  currency: (params) => [currencyOf(params)],
  card: (params) => [params.get("cardLabel") || undefined],
  transaction: (params) => [categoriesLabel(categoriesOf(params)), installmentLabel(params.get("installment"))],
};

const isDetailField = (field: FilterField): field is DetailField => field !== "year" && field !== "month";

const periodLabel = (params: URLSearchParams, fields: FilterField[]): string | undefined => {
  const from = params.get("from");
  if (fields.includes("month") && from) return formatMonthLabel(from.slice(0, 7));
  if (!fields.includes("year")) return undefined;
  const selection = yearSelectionOf(params);
  return selection.kind === "all" ? "Todos los años" : yearsLabel(selection.years);
};

export const activeFilterCount = (params: URLSearchParams, fields: FilterField[]): number =>
  fields.reduce((total, field) => total + ACTIVE_BY_FIELD[field](params), 0);

export const filtersSummary = (params: URLSearchParams, fields: FilterField[]): string => {
  const details = fields.filter(isDetailField).flatMap((field) => DETAILS_BY_FIELD[field](params));
  return [periodLabel(params, fields), ...details]
    .filter((part): part is string => Boolean(part))
    .join(SEPARATOR);
};

export const filtersButtonLabel = (count: number): string => {
  if (count === 0) return "Filtros";
  return `Filtros, ${count} ${count === 1 ? "activo" : "activos"}`;
};
