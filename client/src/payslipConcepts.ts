import type { PayslipDTO } from "@ledgerly/shared";

export const byPeriodo = (a: PayslipDTO, b: PayslipDTO): number => a.periodo.localeCompare(b.periodo);

export function uniqueConceptLabels(payslips: PayslipDTO[]): string[] {
  const labels: string[] = [];
  for (const payslip of payslips) {
    for (const concepto of payslip.conceptos) {
      if (!labels.includes(concepto.label)) labels.push(concepto.label);
    }
  }
  return labels;
}

export const rawKey = (label: string): string => `raw:${label}`;

export function buildCompositionData(payslips: PayslipDTO[]): {
  labels: string[];
  rows: Record<string, number | string>[];
} {
  const sorted = [...payslips].sort(byPeriodo);
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
