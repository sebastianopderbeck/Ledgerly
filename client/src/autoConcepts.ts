import type { AutoCouponDTO } from "@ledgerly/shared";

export const byCuotaNro = (a: AutoCouponDTO, b: AutoCouponDTO): number => a.cuotaNro - b.cuotaNro;

export function uniqueConceptLabels(coupons: AutoCouponDTO[]): string[] {
  const labels: string[] = [];
  for (const coupon of coupons) {
    for (const concept of coupon.conceptos) {
      if (!labels.includes(concept.label)) labels.push(concept.label);
    }
  }
  return labels;
}

export const rawKey = (label: string): string => `raw:${label}`;

export function buildCompositionData(coupons: AutoCouponDTO[]): {
  labels: string[];
  rows: Record<string, number | string>[];
} {
  const sorted = [...coupons].sort(byCuotaNro);
  const labels = uniqueConceptLabels(sorted);
  const rows = sorted.map((coupon) => {
    const row: Record<string, number | string> = { month: coupon.fechaVencimiento.slice(0, 7) };
    for (const label of labels) {
      const amount = coupon.conceptos.find((concept) => concept.label === label)?.amount ?? 0;
      row[label] = Math.abs(amount);
      row[rawKey(label)] = amount;
    }
    return row;
  });
  return { labels, rows };
}
