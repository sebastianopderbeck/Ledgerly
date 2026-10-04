export const ALL_YEARS = "all";
export const GLOBAL_FILTER_KEYS = ["year", "currency", "cardLabel", "from", "to"] as const;

export type YearSelection = { kind: "all" } | { kind: "years"; years: string[] };

const YEAR_PATTERN = /^\d{4}$/;
const ALL: YearSelection = { kind: "all" };

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();

export const currentYear = (): string => String(new Date().getFullYear());

export const parseYears = (values: string[]): YearSelection => {
  if (values.includes(ALL_YEARS)) return ALL;
  const years = uniqueSorted(values.filter((value) => YEAR_PATTERN.test(value)));
  return { kind: "years", years: years.length > 0 ? years : [currentYear()] };
};

export const yearKeyOf = (params: URLSearchParams): string =>
  params.getAll("year").join(",") || (params.get("from")?.slice(0, 4) ?? "");

export const parseYearKey = (yearKey: string): YearSelection => parseYears(yearKey ? yearKey.split(",") : []);

export const matchesYears = (value: string, selection: YearSelection): boolean =>
  selection.kind === "all" || selection.years.includes(value.slice(0, 4));

export const filterInYears = <T>(
  items: T[] | undefined,
  dateOf: (item: T) => string,
  selection: YearSelection,
): T[] | undefined => items?.filter((item) => matchesYears(dateOf(item), selection));

export const yearsForApi = (selection: YearSelection): string[] | undefined =>
  selection.kind === "all" ? undefined : selection.years;

export const resolveYearChange = (previous: YearSelection, selected: string[]): YearSelection => {
  const years = uniqueSorted(selected.filter((value) => value !== ALL_YEARS));
  const pickedAll = selected.includes(ALL_YEARS) && previous.kind !== "all";
  if (pickedAll || years.length === 0) return ALL;
  return { kind: "years", years };
};

export const yearOptionsWith = (options: string[], selection: YearSelection): string[] => {
  const selected = selection.kind === "all" ? [] : selection.years;
  return uniqueSorted([...options, ...selected, currentYear()]).reverse();
};

export const yearsLabel = (years: string[]): string => {
  if (years.length <= 1) return years.join("");
  return `${years.slice(0, -1).join(", ")} y ${years[years.length - 1]}`;
};

export const yearsOf = (values: string[]): string[] => uniqueSorted(values.map((value) => value.slice(0, 4)));

export const writeYears = (params: URLSearchParams, selection: YearSelection): void => {
  params.delete("year");
  if (selection.kind === "all") {
    params.set("year", ALL_YEARS);
    return;
  }
  for (const year of selection.years) params.append("year", year);
};

export const globalSearch = (params: URLSearchParams): string => {
  const next = new URLSearchParams();
  for (const key of GLOBAL_FILTER_KEYS) {
    for (const value of params.getAll(key)) next.append(key, value);
  }
  const search = next.toString();
  return search ? `?${search}` : "";
};
