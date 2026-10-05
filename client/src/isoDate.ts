const DAY_MS = 86_400_000;

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const WEEKDAY_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const pad2 = (value: number): string => String(value).padStart(2, "0");

const partsOf = (fecha: string): [number, number, number] => {
  const [year, month, day] = fecha.split("-").map(Number);
  return [year, month, day ?? 1];
};

const utcTime = (fecha: string): number => {
  const [year, month, day] = partsOf(fecha);
  return Date.UTC(year, month - 1, day);
};

const isoOfUtc = (time: number): string => new Date(time).toISOString().slice(0, 10);

export const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

export const monthOf = (fecha: string): string => fecha.slice(0, 7);

export const addMonths = (mes: string, n: number): string => {
  const [year, month] = partsOf(mes.slice(0, 7));
  const index = year * 12 + (month - 1) + n;
  const nextYear = Math.floor(index / 12);
  return `${nextYear}-${pad2(index - nextYear * 12 + 1)}`;
};

export const addDays = (fecha: string, n: number): string => isoOfUtc(utcTime(fecha) + n * DAY_MS);

export const daysBetween = (desde: string, hasta: string): number => Math.round((utcTime(hasta) - utcTime(desde)) / DAY_MS);

export const lastDayOfMonth = (mes: string): string => {
  const [year, month] = partsOf(mes.slice(0, 7));
  return isoOfUtc(Date.UTC(year, month, 0));
};

export const weekdayOf = (fecha: string): number => new Date(utcTime(fecha)).getUTCDay();

export const startOfWeek = (fecha: string): string => addDays(fecha, -((weekdayOf(fecha) + 6) % 7));

export const formatDayMonth = (fecha: string): string => {
  const [, month, day] = partsOf(fecha);
  return `${pad2(day)}/${pad2(month)}`;
};

export const formatWeekdayShort = (fecha: string): string => WEEKDAY_SHORT[weekdayOf(fecha)];

export const formatDayOfMonthLong = (fecha: string): string => {
  const [, month, day] = partsOf(fecha);
  return `${day} de ${MONTH_NAMES[month - 1]}`;
};

export const formatMonthYear = (mes: string): string => {
  const [year, month] = partsOf(mes.slice(0, 7));
  return `${MONTH_NAMES[month - 1]} ${year}`;
};
