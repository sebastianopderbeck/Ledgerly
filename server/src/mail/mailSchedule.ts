export interface MailSchedule {
  fromDay: number;
  toDay: number;
  hour: number;
}

export interface MailScheduleConfig {
  schedule: MailSchedule | null;
  invalid: string[];
}

export const DEFAULT_MAIL_SYNC_HOUR = 21;
export const MAIL_STARTUP_DELAY_MS = 60_000;

const DAYS_PATTERN = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/;
const HOUR_PATTERN = /^\d{1,2}$/;
const MAX_SEARCH_DAYS = 62;
const INVALID_DAYS = "MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5)";
const INVALID_HOUR = "MAIL_SYNC_HOUR inválido (entero de 0 a 23)";

const isDayOfMonth = (day: number): boolean => day >= 1 && day <= 31;

const parseDays = (raw: string): Pick<MailSchedule, "fromDay" | "toDay"> | null => {
  const match = DAYS_PATTERN.exec(raw);
  if (!match) return null;
  const [fromDay, toDay] = [Number(match[1]), Number(match[2])];
  return isDayOfMonth(fromDay) && isDayOfMonth(toDay) ? { fromDay, toDay } : null;
};

const parseHour = (raw: string): number | null => {
  if (raw === "") return DEFAULT_MAIL_SYNC_HOUR;
  if (!HOUR_PATTERN.test(raw)) return null;
  const hour = Number(raw);
  return hour <= 23 ? hour : null;
};

export function parseMailSchedule(env: NodeJS.ProcessEnv): MailScheduleConfig {
  const rawDays = env.MAIL_SYNC_DAYS?.trim() ?? "";
  if (rawDays === "") return { schedule: null, invalid: [] };
  const days = parseDays(rawDays);
  const hour = parseHour(env.MAIL_SYNC_HOUR?.trim() ?? "");
  const invalid = [days === null ? INVALID_DAYS : null, hour === null ? INVALID_HOUR : null]
    .filter((note): note is string => note !== null);
  if (days === null || hour === null) return { schedule: null, invalid };
  return { schedule: { ...days, hour }, invalid: [] };
}

export function isScheduledDay({ fromDay, toDay }: MailSchedule, date: Date): boolean {
  const day = date.getDate();
  return fromDay <= toDay ? day >= fromDay && day <= toDay : day >= fromDay || day <= toDay;
}

export function nextScheduledRun(schedule: MailSchedule, after: Date): Date {
  for (let offset = 0; offset <= MAX_SEARCH_DAYS; offset += 1) {
    const slot = new Date(after.getFullYear(), after.getMonth(), after.getDate() + offset, schedule.hour);
    if (slot.getTime() > after.getTime() && isScheduledDay(schedule, slot)) return slot;
  }
  throw new Error("No hay ningún día programado en la agenda de mails");
}

export function nextMailRunDelayMs(schedule: MailSchedule, lastStartedAt: Date | null, now: Date): number {
  const slot = nextScheduledRun(schedule, lastStartedAt ?? now);
  return slot.getTime() <= now.getTime() ? MAIL_STARTUP_DELAY_MS : slot.getTime() - now.getTime();
}

export function describeMailSchedule({ fromDay, toDay, hour }: MailSchedule): string {
  return `todos los días a las ${hour} h, del ${fromDay} al ${toDay}`;
}

export function describeMailAutomation({ schedule, invalid }: MailScheduleConfig): string {
  if (schedule) return `Mails: búsqueda automática ${describeMailSchedule(schedule)}`;
  if (invalid.length > 0) return `Mails: ${invalid.join("; ")}, búsqueda automática apagada`;
  return "Mails: búsqueda automática apagada (falta MAIL_SYNC_DAYS)";
}
