const YEAR_PATTERN = /^\d{4}$/;

export interface YearDateRange { date: { $gte: Date; $lt: Date } }

export function parseYears(raw: unknown): number[] | null {
  const values = Array.isArray(raw) ? raw : [raw];
  const years = values
    .filter((value): value is string => typeof value === "string" && YEAR_PATTERN.test(value))
    .map(Number);
  const unique = [...new Set(years)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : null;
}

export function monthInYears(month: string, years: number[] | null): boolean {
  return years === null || years.includes(Number(month.slice(0, 4)));
}

export function yearDateRanges(years: number[]): YearDateRange[] {
  return years.map((year) => ({
    date: { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) },
  }));
}
