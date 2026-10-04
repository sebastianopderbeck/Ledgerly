import type { Issuer, StatementDTO } from "@ledgerly/shared";
import { addMonths, lastDayOfMonth, monthOf } from "./isoDate.js";

export interface MonthRange {
  desde: string;
  hasta: string;
}

interface ClosingSpan {
  first: string;
  last: string;
}

const closingSpanPerIssuer = (statements: StatementDTO[]): ClosingSpan[] => {
  const spans = new Map<Issuer, ClosingSpan>();
  for (const { issuer, closingDate } of statements) {
    if (closingDate === null) continue;
    const fecha = closingDate.slice(0, 10);
    const span = spans.get(issuer);
    spans.set(issuer, {
      first: span === undefined || fecha < span.first ? fecha : span.first,
      last: span === undefined || fecha > span.last ? fecha : span.last,
    });
  }
  return [...spans.values()];
};

const lastCompleteMonth = (closingDate: string): string => {
  const month = monthOf(closingDate);
  return closingDate === lastDayOfMonth(month) ? month : addMonths(month, -1);
};

export function completeMonthRange(statements: StatementDTO[]): MonthRange | null {
  const spans = closingSpanPerIssuer(statements);
  if (spans.length === 0) return null;
  const desde = monthOf(spans.map(({ first }) => first).reduce((latest, fecha) => (fecha > latest ? fecha : latest)));
  const commonClosing = spans.map(({ last }) => last).reduce((earliest, fecha) => (fecha < earliest ? fecha : earliest));
  const hasta = lastCompleteMonth(commonClosing);
  return hasta < desde ? null : { desde, hasta };
}
