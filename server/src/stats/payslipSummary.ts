import type { PayslipSummaryDTO, PayslipTipo } from "@ledgerly/shared";

export interface PayslipSummaryInput {
  periodo: string;
  tipo: PayslipTipo;
  neto: number;
  brutoTotal: number;
  descuentos: number;
  netoUsd: number | null;
}

export function computePayslipSummary(payslips: PayslipSummaryInput[]): PayslipSummaryDTO | null {
  const mensuales = payslips
    .filter((payslip) => payslip.tipo === "mensual")
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  if (mensuales.length === 0) return null;

  const last = mensuales[mensuales.length - 1];
  const previous = mensuales[mensuales.length - 2];
  const anio = last.periodo.slice(0, 4);
  const delAnio = payslips.filter((payslip) => payslip.periodo.startsWith(anio));

  return {
    periodos: mensuales.length,
    ultimoPeriodo: last.periodo,
    ultimoNeto: last.neto,
    ultimoNetoUsd: last.netoUsd,
    ultimoBruto: last.brutoTotal,
    variacionNetoMensual: previous && previous.neto !== 0 ? (last.neto - previous.neto) / previous.neto : 0,
    porcentajeDescuentos: last.brutoTotal !== 0 ? last.descuentos / last.brutoTotal : 0,
    netoAcumuladoAnio: delAnio.reduce((acc, payslip) => acc + payslip.neto, 0),
    recibosAnio: delAnio.length,
  };
}
