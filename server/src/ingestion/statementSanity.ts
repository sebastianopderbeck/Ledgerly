import type { ParsedStatement } from "@ledgerly/shared";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS_BEFORE_CLOSING = 1096;
const MAX_DAYS_AFTER_CLOSING = 31;

const timeOf = (isoDate: string): number | null => {
  if (!ISO_DATE.test(isoDate)) return null;
  const time = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10) === isoDate ? time : null;
};

export function hasSaneRowDates({ header, rows }: ParsedStatement): boolean {
  const closingTime = header.closingDate ? timeOf(header.closingDate) : null;
  return rows.every(({ date }) => {
    const time = timeOf(date);
    if (time === null) return false;
    if (closingTime === null) return true;
    return time >= closingTime - MAX_DAYS_BEFORE_CLOSING * DAY_MS && time <= closingTime + MAX_DAYS_AFTER_CLOSING * DAY_MS;
  });
}
