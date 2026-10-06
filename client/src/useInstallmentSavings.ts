import { useMemo } from "react";
import { useInflation, useInstallmentPurchases } from "./api/hooks.js";
import {
  computeInstallmentSavings, savingsByMerchant, type InstallmentSavingsSummary, type MerchantSaving,
} from "./installmentSavings.js";
import { todayIso } from "./isoDate.js";

const TOP_MERCHANTS = 8;

interface UseInstallmentSavingsParams {
  cardLabel?: string;
  years?: string[];
}

export interface InstallmentSavingsState {
  summary: InstallmentSavingsSummary | null;
  merchants: MerchantSaving[];
  isLoading: boolean;
  isError: boolean;
}

const listOf = <T>(data: T[] | undefined): T[] => (Array.isArray(data) ? data : []);

export const useInstallmentSavings = ({ cardLabel, years }: UseInstallmentSavingsParams): InstallmentSavingsState => {
  const purchasesQuery = useInstallmentPurchases({ cardLabel, year: years });
  const inflationQuery = useInflation();
  const purchases = purchasesQuery.data;
  const inflation = inflationQuery.data;

  const summary = useMemo(
    () => computeInstallmentSavings(listOf(purchases), listOf(inflation), todayIso()),
    [purchases, inflation],
  );
  const merchants = useMemo(() => (summary ? savingsByMerchant(summary.purchases, TOP_MERCHANTS) : []), [summary]);

  return {
    summary,
    merchants,
    isLoading: purchasesQuery.isLoading || inflationQuery.isLoading,
    isError: purchasesQuery.isError || inflationQuery.isError,
  };
};
