import { useMemo } from "react";
import { useFutureInstallmentsDetail, useInflation, useMonthly, useStatements } from "./api/hooks.js";
import { buildRealSpendingView, type RealSpendingScope, type RealSpendingView } from "./realSpending.js";

export interface RealSpendingState {
  isLoading: boolean;
  isError: boolean;
  view: RealSpendingView;
}

function listOf<T>(data: T[] | undefined): T[] {
  return Array.isArray(data) ? data : [];
}

export const useRealSpending = ({ cardLabel, years, from, to }: RealSpendingScope): RealSpendingState => {
  const monthly = useMonthly({ currency: "ARS", cardLabel });
  const pending = useFutureInstallmentsDetail({ currency: "ARS", cardLabel });
  const statements = useStatements();
  const inflation = useInflation();
  const yearsKey = years?.join(",");

  const view = useMemo(
    () => buildRealSpendingView(
      {
        monthly: listOf(monthly.data),
        pendingDetail: listOf(pending.data),
        statements: listOf(statements.data),
        inflation: listOf(inflation.data),
      },
      { cardLabel, years, from, to },
    ),
    [monthly.data, pending.data, statements.data, inflation.data, cardLabel, yearsKey, from, to],
  );

  const queries = [monthly, pending, statements, inflation];
  return {
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
    view,
  };
};
