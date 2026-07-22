import type { CategoryStat, FutureInstallmentMonth } from "@ledgerly/shared";

export function pendingInstallmentsByCategory(months: FutureInstallmentMonth[]): CategoryStat[] {
  const totals = new Map<string, { total: number; count: number }>();
  for (const month of months) {
    for (const item of month.items) {
      const current = totals.get(item.category) ?? { total: 0, count: 0 };
      current.total += item.amount;
      current.count += 1;
      totals.set(item.category, current);
    }
  }
  return [...totals.entries()]
    .map(([category, { total, count }]) => ({ category, total, count }))
    .sort((a, b) => b.total - a.total);
}
