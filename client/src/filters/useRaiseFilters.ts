import { useMemo, useState } from "react";
import { filterRaisesByVerdict, sortByPeriodo, type RaiseVerdictFilter } from "../salaryFilters.js";
import type { SalaryRaise } from "../salaryRaises.js";
import { usePeriodoOrden, type PeriodoOrdenState } from "./usePeriodoOrden.js";

export interface RaiseFiltersState extends PeriodoOrdenState {
  verdict: RaiseVerdictFilter;
  setVerdict: (verdict: RaiseVerdictFilter) => void;
  visibleRaises: SalaryRaise[];
}

export const useRaiseFilters = (raises: SalaryRaise[]): RaiseFiltersState => {
  const [verdict, setVerdict] = useState<RaiseVerdictFilter>("todos");
  const { orden, toggleOrden } = usePeriodoOrden();
  const visibleRaises = useMemo(
    () => sortByPeriodo(filterRaisesByVerdict(raises, verdict), orden),
    [raises, verdict, orden],
  );

  return { verdict, setVerdict, visibleRaises, orden, toggleOrden };
};
