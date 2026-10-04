import { useMemo } from "react";
import {
  useAutoCoupons, useAutoSummary, useCreditCoupons, useCreditSummary, useMacroSeries, usePayslips, useStatements,
} from "./api/hooks.js";
import { todayIso } from "./isoDate.js";
import { hayDocumentos, listVencimientos, rangoDesde, type VencimientosInput, type VencimientosView } from "./vencimientos.js";

export interface UseVencimientosResult {
  isLoading: boolean;
  isError: boolean;
  hasDocuments: boolean;
  hoy: string;
  view: VencimientosView;
}

export function useVencimientos(): UseVencimientosResult {
  const statements = useStatements();
  const creditCoupons = useCreditCoupons();
  const creditSummary = useCreditSummary();
  const autoCoupons = useAutoCoupons();
  const autoSummary = useAutoSummary();
  const payslips = usePayslips();
  const macro = useMacroSeries();
  const hoy = useMemo(todayIso, []);

  const input = useMemo<VencimientosInput>(() => ({
    statements: statements.data ?? [],
    creditCoupons: creditCoupons.data ?? [],
    creditSummary: creditSummary.data,
    autoCoupons: autoCoupons.data ?? [],
    autoSummary: autoSummary.data,
    payslips: payslips.data ?? [],
    uvaHoy: macro.data?.hoy.uva ?? null,
  }), [statements.data, creditCoupons.data, creditSummary.data, autoCoupons.data, autoSummary.data, payslips.data, macro.data]);

  const view = useMemo(() => listVencimientos(input, rangoDesde(hoy)), [input, hoy]);
  const queries = [statements, creditCoupons, creditSummary, autoCoupons, autoSummary, payslips, macro];
  const documentLists = [statements, creditCoupons, autoCoupons, payslips];

  return {
    isLoading: queries.some(({ isLoading }) => isLoading),
    isError: documentLists.some(({ isError }) => isError),
    hasDocuments: hayDocumentos(input),
    hoy,
    view,
  };
}
