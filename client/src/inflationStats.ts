import type { InflationRateDTO } from "@ledgerly/shared";

export interface AccumulatedInflationPoint {
  periodo: string;
  acumulado: number;
}

export function accumulatedInflation(
  inflation: InflationRateDTO[],
  year: string | null,
  years: string[],
): AccumulatedInflationPoint[] {
  const inScope = (periodo: string): boolean =>
    year === null ? years.includes(periodo.slice(0, 4)) : periodo.slice(0, 4) === year;

  const months = inflation
    .filter((entry) => inScope(entry.periodo))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  let factor = 1;
  return months.map((entry) => {
    factor *= 1 + entry.variacionMensual / 100;
    return { periodo: entry.periodo, acumulado: (factor - 1) * 100 };
  });
}
