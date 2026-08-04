import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";

export interface RealSalaryPoint {
  periodo: string;
  netoReal: number;
}

export function deflateToLatest(payslips: PayslipDTO[], inflation: InflationRateDTO[]): RealSalaryPoint[] {
  if (inflation.length === 0 || payslips.length === 0) return [];

  const sortedInflation = [...inflation].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const latest = sortedInflation[sortedInflation.length - 1].periodo;

  const factorTo = (periodo: string): number => {
    if (periodo >= latest) return 1;
    let factor = 1;
    for (const { periodo: mes, variacionMensual } of sortedInflation) {
      if (mes > periodo && mes <= latest) factor *= 1 + variacionMensual / 100;
    }
    return factor;
  };

  return [...payslips]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((p) => ({ periodo: p.periodo, netoReal: p.neto * factorTo(p.periodo) }));
}
