import type { InstallmentPurchaseDTO, InstallmentScheduleEntry } from "@ledgerly/shared";
import { addMonthsClamped } from "./months.js";

export interface InstallmentOccurrence {
  cardLabel: string;
  merchant: string;
  category: string;
  date: string;
  amount: number;
  installmentCurrent: number;
  installmentTotal: number;
  comprobante: string | null;
  paymentDate: string;
}

interface SeenInstallment {
  amount: number;
  paymentDate: string;
}

export function purchaseKey({ cardLabel, date, merchant, installmentTotal, comprobante }: InstallmentOccurrence): string {
  return [cardLabel, date, merchant, installmentTotal, comprobante ?? ""].join("|");
}

const isWithinPlan = ({ installmentCurrent, installmentTotal }: InstallmentOccurrence): boolean =>
  Number.isInteger(installmentCurrent) && installmentCurrent >= 1 && installmentCurrent <= installmentTotal;

const groupByPurchase = (occurrences: InstallmentOccurrence[]): Map<string, InstallmentOccurrence[]> => {
  const groups = new Map<string, InstallmentOccurrence[]>();
  for (const occurrence of occurrences.filter(isWithinPlan)) {
    const key = purchaseKey(occurrence);
    groups.set(key, [...(groups.get(key) ?? []), occurrence]);
  }
  return groups;
};

const seenInstallments = (group: InstallmentOccurrence[]): Map<number, SeenInstallment> => {
  const seen = new Map<number, SeenInstallment>();
  for (const { installmentCurrent, amount, paymentDate } of group) {
    const previous = seen.get(installmentCurrent);
    if (!previous || paymentDate < previous.paymentDate) seen.set(installmentCurrent, { amount, paymentDate });
  }
  return seen;
};

const buildSchedule = (seen: Map<number, SeenInstallment>, installmentTotal: number): InstallmentScheduleEntry[] => {
  const [anchorNumber, anchor] = [...seen.entries()].reduce((best, entry) => (entry[0] > best[0] ? entry : best));
  return Array.from({ length: installmentTotal }, (_, index) => {
    const number = index + 1;
    const real = seen.get(number);
    if (real) return { number, amount: real.amount, paymentDate: real.paymentDate };
    return { number, amount: anchor.amount, paymentDate: addMonthsClamped(anchor.paymentDate, number - anchorNumber) };
  });
};

const latestCategory = (group: InstallmentOccurrence[]): string =>
  group.reduce((latest, occurrence) => (occurrence.paymentDate > latest.paymentDate ? occurrence : latest)).category;

const toPurchase = (id: string, group: InstallmentOccurrence[]): InstallmentPurchaseDTO => {
  const [{ cardLabel, merchant, date, installmentTotal }] = group;
  return {
    id,
    cardLabel,
    merchant,
    category: latestCategory(group),
    purchaseDate: date,
    installmentTotal,
    installments: buildSchedule(seenInstallments(group), installmentTotal),
  };
};

const byPurchaseDateThenMerchant = (a: InstallmentPurchaseDTO, b: InstallmentPurchaseDTO): number =>
  a.purchaseDate.localeCompare(b.purchaseDate) || a.merchant.localeCompare(b.merchant) || a.id.localeCompare(b.id);

export function buildInstallmentPurchases(occurrences: InstallmentOccurrence[]): InstallmentPurchaseDTO[] {
  return [...groupByPurchase(occurrences)]
    .map(([id, group]) => toPurchase(id, group))
    .sort(byPurchaseDateThenMerchant);
}
