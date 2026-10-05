import type { PayslipDTO } from "@ledgerly/shared";
import type { PeriodoOrden } from "./payslipConcepts.js";
import type { RaiseVerdict, SalaryRaise } from "./salaryRaises.js";

export type PayslipTipoFilter = "todos" | PayslipDTO["tipo"];

export type RaiseVerdictFilter = "todos" | RaiseVerdict;

export interface PayslipFilters {
  tipo: PayslipTipoFilter;
  desde: string;
  hasta: string;
}

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

export const EMPTY_PAYSLIP_FILTERS: PayslipFilters = { tipo: "todos", desde: "", hasta: "" };

export const PAYSLIP_TIPO_OPTIONS: FilterOption<PayslipTipoFilter>[] = [
  { value: "todos", label: "Todos" },
  { value: "mensual", label: "Mensual" },
  { value: "sac", label: "SAC" },
];

export const RAISE_VERDICT_OPTIONS: FilterOption<RaiseVerdictFilter>[] = [
  { value: "todos", label: "Todos" },
  { value: "real", label: "Real" },
  { value: "ipc", label: "Solo IPC" },
  { value: "debajo", label: "Debajo" },
  { value: "parcial", label: "IPC parcial" },
];

export const isPayslipTipoFilter = (value: string): value is PayslipTipoFilter =>
  PAYSLIP_TIPO_OPTIONS.some((option) => option.value === value);

export const isRaiseVerdictFilter = (value: string): value is RaiseVerdictFilter =>
  RAISE_VERDICT_OPTIONS.some((option) => option.value === value);

export function filterPayslips(payslips: PayslipDTO[], { tipo, desde, hasta }: PayslipFilters): PayslipDTO[] {
  return payslips.filter((payslip) =>
    (tipo === "todos" || payslip.tipo === tipo)
    && (!desde || payslip.periodo >= desde)
    && (!hasta || payslip.periodo <= hasta));
}

export function sortByPeriodo<T extends { periodo: string }>(items: T[], orden: PeriodoOrden): T[] {
  const direction = orden === "asc" ? 1 : -1;
  return [...items].sort((a, b) => a.periodo.localeCompare(b.periodo) * direction);
}

export function periodoOptions(payslips: PayslipDTO[]): string[] {
  return [...new Set(payslips.map((payslip) => payslip.periodo))].sort().reverse();
}

export function filterRaisesByVerdict(raises: SalaryRaise[], verdict: RaiseVerdictFilter): SalaryRaise[] {
  return verdict === "todos" ? raises : raises.filter((raise) => raise.verdict === verdict);
}
