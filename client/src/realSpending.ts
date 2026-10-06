import type { FutureInstallmentMonth, InflationRateDTO, MonthlyStat, StatementDTO } from "@ledgerly/shared";
import { buildDeflator, type Deflator } from "./inflationIndex.js";
import { addMonths, monthOf } from "./isoDate.js";
import { completeMonthRange, type MonthRange } from "./statementCoverage.js";

export const MIN_MESES_PROMEDIO = 3;
const MESES_VENTANA = 12;

export interface RealSpendingPoint {
  month: string;
  nominal: number;
  real: number;
}

export interface RealSpendingSummary {
  month: string;
  real: number;
  interanual: number | null;
  vsPromedio: number | null;
  mesesPromedio: number;
}

export interface RealSpendingInput {
  monthly: MonthlyStat[];
  pendingDetail: FutureInstallmentMonth[];
  statements: StatementDTO[];
  inflation: InflationRateDTO[];
}

export interface RealSpendingScope {
  cardLabel?: string;
  years?: string[];
  from?: string;
  to?: string;
}

export interface RealSpendingView {
  pesosDe: string | null;
  points: RealSpendingPoint[];
  summary: RealSpendingSummary | null;
}

const variation = (value: number, base: number): number => (value / base - 1) * 100;

export function pendingByPurchaseMonth(detail: FutureInstallmentMonth[]): Map<string, number> {
  const pending = new Map<string, number>();
  for (const { items } of detail) {
    for (const { purchaseDate, amount } of items) {
      const month = monthOf(purchaseDate);
      pending.set(month, (pending.get(month) ?? 0) + amount);
    }
  }
  return pending;
}

export function realSpendingSeries(
  monthly: MonthlyStat[],
  pending: Map<string, number>,
  deflator: Deflator,
  range: MonthRange,
): RealSpendingPoint[] {
  const tope = range.hasta < deflator.pesosDe ? range.hasta : deflator.pesosDe;
  return monthly
    .filter(({ month }) => month >= range.desde && month <= tope)
    .map(({ month, total }) => {
      const nominal = total + (pending.get(month) ?? 0);
      return { month, nominal, real: nominal * deflator.factor(month) };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function summarizeRealSpending(series: RealSpendingPoint[], month: string): RealSpendingSummary | null {
  const current = series.find((point) => point.month === month);
  if (!current) return null;

  const inicioVentana = addMonths(month, -MESES_VENTANA);
  const previousYear = series.find((point) => point.month === inicioVentana);
  const ventana = series.filter((point) => point.month >= inicioVentana && point.month < month);
  const promedio = ventana.reduce((sum, point) => sum + point.real, 0) / Math.max(ventana.length, 1);

  return {
    month,
    real: current.real,
    interanual: previousYear && previousYear.real > 0 ? variation(current.real, previousYear.real) : null,
    vsPromedio: ventana.length >= MIN_MESES_PROMEDIO && promedio > 0 ? variation(current.real, promedio) : null,
    mesesPromedio: ventana.length,
  };
}

const inScope = ({ years, from, to }: RealSpendingScope) => ({ month }: RealSpendingPoint): boolean => {
  if (years !== undefined && !years.includes(month.slice(0, 4))) return false;
  if (from === undefined) return true;
  return month >= monthOf(from) && month <= monthOf(to ?? from);
};

export function buildRealSpendingView(input: RealSpendingInput, scope: RealSpendingScope): RealSpendingView {
  const deflator = buildDeflator(input.inflation);
  if (deflator === null) return { pesosDe: null, points: [], summary: null };

  const statements = scope.cardLabel
    ? input.statements.filter(({ cardLabel }) => cardLabel === scope.cardLabel)
    : input.statements;
  const range = completeMonthRange(statements);
  if (range === null) return { pesosDe: deflator.pesosDe, points: [], summary: null };

  const series = realSpendingSeries(input.monthly, pendingByPurchaseMonth(input.pendingDetail), deflator, range);
  const points = series.filter(inScope(scope));
  const reference = points.at(-1);

  return {
    pesosDe: deflator.pesosDe,
    points,
    summary: reference ? summarizeRealSpending(series, reference.month) : null,
  };
}
