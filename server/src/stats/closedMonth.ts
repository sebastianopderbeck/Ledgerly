import { addMonths, lastDayOfMonth, monthOf } from "./months.js";

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export function lastClosedMonth(closingDates: Array<Date | null>): string | null {
  const days = closingDates.filter((date): date is Date => date !== null).map(isoDay);
  if (days.length === 0) return null;
  const latest = days.reduce((best, current) => (current > best ? current : best));
  const month = monthOf(latest);
  return latest === lastDayOfMonth(month) ? month : addMonths(month, -1);
}
