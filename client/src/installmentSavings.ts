import type { InflationRateDTO, InstallmentPurchaseDTO, InstallmentScheduleEntry } from "@ledgerly/shared";
import { inflationFactorBetween, inflationRates, latestInflation, type InflationAssumption } from "./inflationIndex.js";
import { monthOf } from "./isoDate.js";

export interface InstallmentSaving {
  number: number;
  amount: number;
  paymentDate: string;
  paid: boolean;
  realValue: number;
  saving: number;
  estimated: boolean;
}

export interface PurchaseSaving {
  id: string;
  merchant: string;
  cardLabel: string;
  category: string;
  purchaseDate: string;
  installmentTotal: number;
  cashPrice: number;
  realValue: number;
  saving: number;
  savingPercent: number;
  paidSaving: number;
  futureSaving: number;
  installments: InstallmentSaving[];
}

export interface InstallmentSavingsSummary {
  purchases: PurchaseSaving[];
  cashPrice: number;
  realValue: number;
  saving: number;
  savingPercent: number;
  paidSaving: number;
  futureSaving: number;
  paidCount: number;
  futureCount: number;
  estimatedPaidCount: number;
  assumption: InflationAssumption;
}

export interface MerchantSaving {
  merchant: string;
  paidSaving: number;
  futureSaving: number;
  saving: number;
  purchaseCount: number;
}

interface SavingContext {
  rates: Map<string, number>;
  assumption: InflationAssumption;
  today: string;
}

const sumBy = <T>(items: T[], value: (item: T) => number): number => items.reduce((acc, item) => acc + value(item), 0);

const percentOf = (part: number, whole: number): number => (whole === 0 ? 0 : (part / whole) * 100);

const installmentSaving = (
  { number, amount, paymentDate }: InstallmentScheduleEntry,
  purchaseMonth: string,
  { rates, assumption, today }: SavingContext,
): InstallmentSaving => {
  const { factor, estimated } = inflationFactorBetween(rates, purchaseMonth, monthOf(paymentDate), assumption);
  const realValue = amount / factor;
  return { number, amount, paymentDate, paid: paymentDate <= today, realValue, saving: amount - realValue, estimated };
};

const purchaseSaving = (purchase: InstallmentPurchaseDTO, context: SavingContext): PurchaseSaving => {
  const { id, merchant, cardLabel, category, purchaseDate, installmentTotal } = purchase;
  const installments = purchase.installments.map((entry) => installmentSaving(entry, monthOf(purchaseDate), context));
  const cashPrice = sumBy(installments, (entry) => entry.amount);
  const realValue = sumBy(installments, (entry) => entry.realValue);
  const saving = cashPrice - realValue;
  return {
    id,
    merchant,
    cardLabel,
    category,
    purchaseDate,
    installmentTotal,
    cashPrice,
    realValue,
    saving,
    savingPercent: percentOf(saving, cashPrice),
    paidSaving: sumBy(installments.filter((entry) => entry.paid), (entry) => entry.saving),
    futureSaving: sumBy(installments.filter((entry) => !entry.paid), (entry) => entry.saving),
    installments,
  };
};

export function computeInstallmentSavings(
  purchases: InstallmentPurchaseDTO[],
  inflation: InflationRateDTO[],
  today: string,
): InstallmentSavingsSummary | null {
  const assumption = latestInflation(inflation);
  if (assumption === null) return null;
  const context: SavingContext = { rates: inflationRates(inflation), assumption, today };
  const purchaseSavings = purchases.map((purchase) => purchaseSaving(purchase, context));
  const installments = purchaseSavings.flatMap((purchase) => purchase.installments);
  const paid = installments.filter((entry) => entry.paid);
  const cashPrice = sumBy(purchaseSavings, (purchase) => purchase.cashPrice);
  const realValue = sumBy(purchaseSavings, (purchase) => purchase.realValue);
  const saving = cashPrice - realValue;
  return {
    purchases: purchaseSavings,
    cashPrice,
    realValue,
    saving,
    savingPercent: percentOf(saving, cashPrice),
    paidSaving: sumBy(purchaseSavings, (purchase) => purchase.paidSaving),
    futureSaving: sumBy(purchaseSavings, (purchase) => purchase.futureSaving),
    paidCount: paid.length,
    futureCount: installments.length - paid.length,
    estimatedPaidCount: paid.filter((entry) => entry.estimated).length,
    assumption,
  };
}

export function savingsByMerchant(purchases: PurchaseSaving[], limit: number): MerchantSaving[] {
  const byMerchant = new Map<string, MerchantSaving>();
  for (const { merchant, paidSaving, futureSaving, saving } of purchases) {
    const current = byMerchant.get(merchant) ?? { merchant, paidSaving: 0, futureSaving: 0, saving: 0, purchaseCount: 0 };
    byMerchant.set(merchant, {
      merchant,
      paidSaving: current.paidSaving + paidSaving,
      futureSaving: current.futureSaving + futureSaving,
      saving: current.saving + saving,
      purchaseCount: current.purchaseCount + 1,
    });
  }
  return [...byMerchant.values()].sort((a, b) => b.saving - a.saving).slice(0, limit);
}
