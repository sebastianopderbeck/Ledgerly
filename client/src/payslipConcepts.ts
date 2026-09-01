import type { PayslipDTO } from "@ledgerly/shared";
import {capitalize} from "@mui/material";

export type PeriodoOrden = "asc" | "desc";

export const byPeriodo = (a: PayslipDTO, b: PayslipDTO, orden: PeriodoOrden = "desc"): number =>
  orden === "asc" ? a.periodo.localeCompare(b.periodo) : b.periodo.localeCompare(a.periodo);

export const byPeriodoAsc = (a: PayslipDTO, b: PayslipDTO): number => byPeriodo(a, b, "asc");

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function payslipYears(payslips: PayslipDTO[]): string[] {
  return [...new Set(payslips.map((payslip) => payslip.periodo.slice(0, 4)))].sort();
}

export function monthLabel(periodo: string): string {
  return MONTHS_SHORT[Number(periodo.slice(5, 7)) - 1] ?? periodo;
}

const ACCENTS: Record<string, string> = { Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U", Ñ: "N" };

const normalizeLabel = (label: string): string =>
  label.toUpperCase().replace(/[ÁÉÍÓÚÜÑ]/g, (char) => ACCENTS[char] ?? char);

export interface DescuentoTotal {
  ars: number;
  usd: number;
}

export function sumDescuento(
  payslips: PayslipDTO[],
  match: (normalizedLabel: string) => boolean,
): DescuentoTotal {
  let ars = 0;
  let usd = 0;
  for (const payslip of payslips) {
    const monto = payslip.conceptos
      .filter((concepto) => concepto.tipo === "descuento" && match(normalizeLabel(concepto.label)))
      .reduce((acc, concepto) => acc + concepto.monto, 0);
    ars += monto;
    if (payslip.tipoCambioUsd) usd += monto / payslip.tipoCambioUsd;
  }
  return { ars, usd };
}
const ROWS = ["RETENCION 4º CATEGORÍA", /*"Plus Feriado", "PRESENTISMO", "LEY 19032", "JUBILACION", "OBRA SOCIAL", "S.E.C.", "F.A.E.C.Y.S."*/]
export function uniqueConceptLabels(payslips: PayslipDTO[]): string[] {
  const labels: string[] = [];
  for (const payslip of payslips) {
    for (const concepto of payslip.conceptos) {

      if (!labels.includes(concepto.label) && ROWS.includes(concepto.label)) labels.push(concepto.label);
    }
  }
  return labels;
}

export const rawKey = (label: string): string => `raw:${label}`;

export function buildCompositionData(payslips: PayslipDTO[]): {
  labels: string[];
  rows: Record<string, number | string>[];
} {
  const sorted = [...payslips].sort(byPeriodoAsc);
  const labels = uniqueConceptLabels(sorted);
  const rows = sorted.map((payslip) => {
    const row: Record<string, number | string> = { month: payslip.periodo };
    for (const label of labels) {
      const monto = payslip.conceptos.find((concepto) => concepto.label === label)?.monto ?? 0;
      row[label] = Math.abs(monto);
      row[rawKey(label)] = monto;
    }
    return row;
  });
  return { labels, rows };
}
