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
