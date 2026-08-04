import type { PayslipSummaryDTO } from "@ledgerly/shared";

export interface PayslipSummaryInput {
  periodo: string;
  neto: number;
  brutoTotal: number;
  descuentos: number;
  netoUsd: number | null;
}

export function computePayslipSummary(payslips: PayslipSummaryInput[]): PayslipSummaryDTO | null {
  if (payslips.length === 0) return null;

  const sorted = [...payslips].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const last = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const anio = last.periodo.slice(0, 4);

  return {
    periodos: sorted.length,
    ultimoPeriodo: last.periodo,
    ultimoNeto: last.neto,
    ultimoNetoUsd: last.netoUsd,
    ultimoBruto: last.brutoTotal,
    variacionNetoMensual: previous && previous.neto !== 0 ? (last.neto - previous.neto) / previous.neto : 0,
    porcentajeDescuentos: last.brutoTotal !== 0 ? last.descuentos / last.brutoTotal : 0,
    netoAcumuladoAnio: sorted.filter((p) => p.periodo.startsWith(anio)).reduce((acc, p) => acc + p.neto, 0),
  };
}
