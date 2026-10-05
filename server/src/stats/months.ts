const DAY_MS = 86_400_000;

const pad2 = (value: number): string => String(value).padStart(2, "0");

const monthIndex = (month: string): number => {
  const [year, monthNumber] = month.slice(0, 7).split("-").map(Number);
  return year * 12 + (monthNumber - 1);
};

const monthFromIndex = (index: number): string => {
  const year = Math.floor(index / 12);
  const monthNumber = index - year * 12 + 1;
  return `${year}-${pad2(monthNumber)}`;
};

const utcTime = (iso: string): number => {
  const [year, monthNumber, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, monthNumber - 1, day);
};

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  return monthFromIndex(monthIndex(month) + n);
}

export function monthsBetween(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from);
}

export function monthRange(from: string, to: string): string[] {
  const count = monthsBetween(from, to);
  return Array.from({ length: Math.max(0, count + 1) }, (_, offset) => addMonths(from, offset));
}

export function addDays(iso: string, days: number): string {
  return new Date(utcTime(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcTime(to) - utcTime(from)) / DAY_MS);
}

export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

export function lastDayOfMonth(month: string): string {
  const target = monthOf(month);
  return `${target}-${pad2(daysInMonth(target))}`;
}

export function addMonthsClamped(iso: string, months: number): string {
  const target = addMonths(iso, months);
  const day = Math.min(Number(iso.slice(8, 10)), daysInMonth(target));
  return `${target}-${pad2(day)}`;
}
