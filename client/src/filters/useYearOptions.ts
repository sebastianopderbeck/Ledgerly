import { useMemo } from "react";
import type { Currency } from "@ledgerly/shared";
import { useFutureInstallments, useMonthly } from "../api/hooks.js";
import { yearsOf } from "./globalFilters.js";

export const useTransactionYearOptions = (currency: Currency, cardLabel: string | undefined): string[] => {
  const { data } = useMonthly({ currency, cardLabel });
  return useMemo(() => yearsOf(Array.isArray(data) ? data.map((row) => row.month) : []), [data]);
};

export const useInstallmentYearOptions = (currency: Currency, cardLabel: string | undefined): string[] => {
  const { data } = useFutureInstallments({ currency, cardLabel });
  return useMemo(() => yearsOf(Array.isArray(data) ? data.map((row) => row.month) : []), [data]);
};
