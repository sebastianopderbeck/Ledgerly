import type { InflationRateDTO } from "@ledgerly/shared";

export interface AccumulatedInflationPoint {
  periodo: string;
  acumulado: number;
}

export function accumulatedInflation(
  inflation: InflationRateDTO[],
  years: string[],
): AccumulatedInflationPoint[] {
  if (years.length === 0) return [];
  const sortedYears = [...years].sort();
  const firstYear = sortedYears[0];
  const lastYear = sortedYears[sortedYears.length - 1];
  const months = inflation
    .filter((entry) => {
      const year = entry.periodo.slice(0, 4);
      return year >= firstYear && year <= lastYear;
    })
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  let factor = 1;
  return months
    .map((entry) => {
      factor *= 1 + entry.variacionMensual / 100;
      return { periodo: entry.periodo, acumulado: (factor - 1) * 100 };
    })
    .filter((point) => years.includes(point.periodo.slice(0, 4)));
}
