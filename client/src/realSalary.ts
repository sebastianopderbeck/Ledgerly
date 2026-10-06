import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";
import { buildDeflator } from "./inflationIndex.js";

export interface RealSalaryPoint {
  periodo: string;
  netoReal: number;
}

export function deflateToLatest(payslips: PayslipDTO[], inflation: InflationRateDTO[]): RealSalaryPoint[] {
  const deflator = buildDeflator(inflation);
  if (deflator === null || payslips.length === 0) return [];

  return [...payslips]
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .map((p) => ({ periodo: p.periodo, netoReal: p.neto * deflator.factor(p.periodo) }));
}
