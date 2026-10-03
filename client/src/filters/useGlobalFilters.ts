import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Currency } from "@ledgerly/shared";
import { matchesYears, parseYears, writeYears, yearsForApi, type YearSelection } from "./globalFilters.js";

export interface GlobalFilters {
  yearSelection: YearSelection;
  years: string[] | undefined;
  currency: Currency;
  cardLabel: string | undefined;
  from: string | undefined;
  to: string | undefined;
  setYears: (selection: YearSelection) => void;
  setCurrency: (currency: Currency) => void;
  setCardLabel: (cardLabel: string) => void;
  setMonth: (month: string) => void;
}

const monthRange = (month: string): { from: string; to: string } => {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
};

export const useGlobalFilters = (): GlobalFilters => {
  const [params, setParams] = useSearchParams();
  const yearKey = params.getAll("year").join(",");
  const yearSelection = useMemo(() => parseYears(yearKey ? yearKey.split(",") : []), [yearKey]);

  const update = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace: true });
  };

  const setYears = (selection: YearSelection) => update((next) => {
    writeYears(next, selection);
    const from = next.get("from");
    if (from && !matchesYears(from, selection)) {
      next.delete("from");
      next.delete("to");
    }
  });

  const setCurrency = (currency: Currency) => update((next) => next.set("currency", currency));

  const setCardLabel = (cardLabel: string) => update((next) => {
    if (cardLabel) next.set("cardLabel", cardLabel);
    else next.delete("cardLabel");
  });

  const setMonth = (month: string) => update((next) => {
    if (!month) {
      next.delete("from");
      next.delete("to");
      return;
    }
    const range = monthRange(month);
    next.set("from", range.from);
    next.set("to", range.to);
  });

  return {
    yearSelection,
    years: yearsForApi(yearSelection),
    currency: params.get("currency") === "USD" ? "USD" : "ARS",
    cardLabel: params.get("cardLabel") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    setYears,
    setCurrency,
    setCardLabel,
    setMonth,
  };
};
