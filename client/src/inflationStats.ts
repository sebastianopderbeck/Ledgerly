import type { InflationRateDTO } from "@ledgerly/shared";

export interface AccumulatedInflationPoint {
  periodo: string;
  acumulado: number;
}

export function accumulatedInflation(
  inflation: InflationRateDTO[],
  years: string[],
): AccumulatedInflationPoint[] {
  const months = inflation
    .filter((entry) => years.includes(entry.periodo.slice(0, 4)))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  let factor = 1;
  return months.map((entry) => {
    factor *= 1 + entry.variacionMensual / 100;
    return { periodo: entry.periodo, acumulado: (factor - 1) * 100 };
  });
}
