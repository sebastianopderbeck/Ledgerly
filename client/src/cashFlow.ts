import type { BarDatum } from "@nivo/bar";
import type { CashFlowEstado, CashFlowMonthDTO } from "@ledgerly/shared";
import { formatPercent } from "./format.js";
import { matchesYears, yearsOf, type YearSelection } from "./filters/globalFilters.js";
import { monthLabel } from "./payslipConcepts.js";

export const AHORRO_VENTANA_MESES = 12;

export const ESTADO_LABEL: Record<CashFlowEstado, string> = {
  completo: "Completo",
  incompleto: "Incompleto",
  en_curso: "En curso",
  proyectado: "Proyectado",
};

export interface SavingsAverage {
  tasa: number | null;
  meses: number;
}

export type MonthNoteLabel = "Falta" | "Estimado";

export interface MonthNote {
  label: MonthNoteLabel;
  text: string;
}

const CLOSED_STATES: CashFlowEstado[] = ["completo", "incompleto"];

const byMesAsc = (a: CashFlowMonthDTO, b: CashFlowMonthDTO): number => a.mes.localeCompare(b.mes);

const byMesDesc = (a: CashFlowMonthDTO, b: CashFlowMonthDTO): number => b.mes.localeCompare(a.mes);

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const isComplete = (mes: CashFlowMonthDTO): boolean => mes.estado === "completo";

const countsForAverage = (mes: CashFlowMonthDTO): boolean =>
  isComplete(mes) && mes.margen !== null && (mes.ingreso ?? 0) > 0;

export const isClosedMonth = (mes: CashFlowMonthDTO): boolean => CLOSED_STATES.includes(mes.estado);

export const closedMonths = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO[] => meses.filter(isClosedMonth).sort(byMesAsc);

export const projectionMonths = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO[] =>
  meses.filter((mes) => !isClosedMonth(mes)).sort(byMesAsc);

export const closedMonthsInYears = (meses: CashFlowMonthDTO[], selection: YearSelection): CashFlowMonthDTO[] =>
  closedMonths(meses).filter((mes) => matchesYears(mes.mes, selection));

export const cashFlowYears = (meses: CashFlowMonthDTO[]): string[] => yearsOf(closedMonths(meses).map((mes) => mes.mes));

export const lastClosedMonth = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO | null => closedMonths(meses).at(-1) ?? null;

export const lastCompleteMonth = (meses: CashFlowMonthDTO[]): CashFlowMonthDTO | null =>
  closedMonths(meses).filter(isComplete).at(-1) ?? null;

export const averageSavingsRate = (meses: CashFlowMonthDTO[], ventana = AHORRO_VENTANA_MESES): SavingsAverage => {
  const validos = closedMonths(meses).slice(-ventana).filter(countsForAverage);
  if (validos.length === 0) return { tasa: null, meses: 0 };
  const margen = sum(validos.map((mes) => mes.margen ?? 0));
  const ingreso = sum(validos.map((mes) => mes.ingreso ?? 0));
  return { tasa: margen / ingreso, meses: validos.length };
};

export const savingsAverageLabel = ({ tasa, meses }: SavingsAverage): string => {
  if (tasa === null) return "sin promedio todavía";
  const unidad = meses === 1 ? "mes" : "meses";
  return `promedio ${meses} ${unidad}: ${formatPercent(tasa * 100)}`;
};

export const formatSavingsRate = (tasa: number | null): string => (tasa === null ? "—" : formatPercent(tasa * 100));

export const isNegative = (value: number | null): boolean => value !== null && value < 0;

const chartRow = ({ mes, estado, ingreso, egresos, margen }: CashFlowMonthDTO): BarDatum => {
  const row: BarDatum = { month: mes, estado, Egresos: egresos };
  if (ingreso !== null) row.Ingreso = ingreso;
  if (margen !== null) row.Margen = margen;
  return row;
};

export const cashFlowChartRows = (meses: CashFlowMonthDTO[]): BarDatum[] => meses.map(chartRow);

export const detailRows = (historia: CashFlowMonthDTO[], proyeccion: CashFlowMonthDTO[]): CashFlowMonthDTO[] =>
  [...proyeccion, ...historia].sort(byMesDesc);

const note = (label: MonthNoteLabel, items: string[]): MonthNote[] =>
  items.length > 0 ? [{ label, text: items.join(", ") }] : [];

export const monthNotes = ({ faltantes, estimados }: CashFlowMonthDTO): MonthNote[] => [
  ...note("Falta", faltantes),
  ...note("Estimado", estimados),
];

export const shortMonth = (mes: string): string => `${monthLabel(mes)} ${mes.slice(0, 4)}`;

export const incompleteCaption = (meses: CashFlowMonthDTO[]): string | null => {
  const incompletos = meses.filter((mes) => mes.estado === "incompleto");
  if (incompletos.length === 0) return null;
  const detalle = incompletos.map((mes) => `${shortMonth(mes.mes)} (falta ${mes.faltantes.join(", ")})`).join(", ");
  return `Los meses incompletos se ven atenuados y sin margen: ${detalle}.`;
};
