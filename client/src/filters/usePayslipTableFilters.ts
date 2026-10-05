import { useCallback, useMemo, useState } from "react";
import type { PayslipDTO } from "@ledgerly/shared";
import {
  EMPTY_PAYSLIP_FILTERS, filterPayslips, periodoOptions, sortByPeriodo, type PayslipFilters,
} from "../salaryFilters.js";
import { usePeriodoOrden, type PeriodoOrdenState } from "./usePeriodoOrden.js";

export interface PayslipTableFiltersState extends PeriodoOrdenState {
  filters: PayslipFilters;
  updateFilters: (patch: Partial<PayslipFilters>) => void;
  visiblePayslips: PayslipDTO[];
  periodos: string[];
}

export const usePayslipTableFilters = (payslips: PayslipDTO[]): PayslipTableFiltersState => {
  const [filters, setFilters] = useState<PayslipFilters>(EMPTY_PAYSLIP_FILTERS);
  const { orden, toggleOrden } = usePeriodoOrden();

  const updateFilters = useCallback(
    (patch: Partial<PayslipFilters>) => setFilters((current) => ({ ...current, ...patch })),
    [],
  );
  const visiblePayslips = useMemo(
    () => sortByPeriodo(filterPayslips(payslips, filters), orden),
    [payslips, filters, orden],
  );
  const periodos = useMemo(() => periodoOptions(payslips), [payslips]);

  return { filters, updateFilters, visiblePayslips, periodos, orden, toggleOrden };
};
