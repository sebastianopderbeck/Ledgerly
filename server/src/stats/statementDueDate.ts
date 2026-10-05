import { addDays } from "./months.js";

export const DIAS_CIERRE_A_VENCIMIENTO = 12;

export interface StatementDates {
  dueDate: string | null;
  closingDate: string | null;
}

export function statementDueDate({ dueDate, closingDate }: StatementDates): string | null {
  if (dueDate) return dueDate;
  if (closingDate) return addDays(closingDate, DIAS_CIERRE_A_VENCIMIENTO);
  return null;
}
