import type { Currency, FutureInstallmentStat, FutureInstallmentMonth, FutureInstallmentItem } from "@ledgerly/shared";

interface InstallmentTx {
  date: string;
  amount: number;
  currency: Currency;
  isInstallment: boolean;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

interface InstallmentTxDetail extends InstallmentTx {
  merchant: string;
  category: string;
}

function addMonths(iso: string, months: number): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function computeFutureInstallments(txns: InstallmentTx[], currency: Currency): FutureInstallmentStat[] {
  const buckets = new Map<string, number>();
  for (const tx of txns) {
    if (tx.currency !== currency) continue;
    if (!tx.isInstallment || tx.installmentCurrent === null || tx.installmentTotal === null) continue;
    const remaining = tx.installmentTotal - tx.installmentCurrent;
    for (let k = 1; k <= remaining; k += 1) {
      const month = addMonths(tx.date, k);
      buckets.set(month, (buckets.get(month) ?? 0) + tx.amount);
    }
  }
  return [...buckets.entries()]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function computeFutureInstallmentsDetail(txns: InstallmentTxDetail[], currency: Currency): FutureInstallmentMonth[] {
  const buckets = new Map<string, FutureInstallmentItem[]>();
  for (const tx of txns) {
    if (tx.currency !== currency) continue;
    if (!tx.isInstallment || tx.installmentCurrent === null || tx.installmentTotal === null) continue;
    const remaining = tx.installmentTotal - tx.installmentCurrent;
    for (let k = 1; k <= remaining; k += 1) {
      const month = addMonths(tx.date, k);
      const item: FutureInstallmentItem = {
        merchant: tx.merchant,
        category: tx.category,
        amount: tx.amount,
        installmentNumber: tx.installmentCurrent + k,
        installmentTotal: tx.installmentTotal,
        purchaseDate: tx.date,
      };
      const items = buckets.get(month) ?? [];
      items.push(item);
      buckets.set(month, items);
    }
  }
  return [...buckets.entries()]
    .map(([month, items]) => ({
      month,
      total: items.reduce((acc, i) => acc + i.amount, 0),
      count: items.length,
      items: [...items].sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
