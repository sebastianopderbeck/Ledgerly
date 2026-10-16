import type { MailSource } from "@ledgerly/shared";

export interface MailDays {
  fromDay: number;
  toDay: number;
}

export interface MailSchedule extends MailDays {
  hour: number;
}

export interface MailScheduleConfig {
  days: MailDays | null;
  invalid: string[];
}

export const MAIL_TIME_ZONE = "America/Argentina/Buenos_Aires";

export const MAIL_CRON_HOURS: Record<MailSource, number> = { icloud: 21, gmail: 22 };

const DAYS_PATTERN = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/;
const INVALID_DAYS = "MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5)";

const isDayOfMonth = (day: number): boolean => day >= 1 && day <= 31;

const parseDays = (raw: string): MailDays | null => {
  const match = DAYS_PATTERN.exec(raw);
  if (!match) return null;
  const [fromDay, toDay] = [Number(match[1]), Number(match[2])];
  return isDayOfMonth(fromDay) && isDayOfMonth(toDay) ? { fromDay, toDay } : null;
};

export function parseMailSchedule(env: NodeJS.ProcessEnv): MailScheduleConfig {
  const rawDays = env.MAIL_SYNC_DAYS?.trim() ?? "";
  if (rawDays === "") return { days: null, invalid: [] };
  const days = parseDays(rawDays);
  return days ? { days, invalid: [] } : { days: null, invalid: [INVALID_DAYS] };
}

export function mailScheduleFor(source: MailSource, env: NodeJS.ProcessEnv): MailSchedule | null {
  const { days } = parseMailSchedule(env);
  return days ? { ...days, hour: MAIL_CRON_HOURS[source] } : null;
}

export function isScheduledDay({ fromDay, toDay }: MailDays, day: number): boolean {
  return fromDay <= toDay ? day >= fromDay && day <= toDay : day >= fromDay || day <= toDay;
}

export function dayOfMonthIn(timeZone: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(now));
}

export function describeMailSchedule({ fromDay, toDay, hour }: MailSchedule): string {
  return `todos los días a las ${hour} h, del ${fromDay} al ${toDay}`;
}

export function describeMailAutomation({ days, invalid }: MailScheduleConfig): string {
  if (days) {
    return `Mails: búsqueda automática del ${days.fromDay} al ${days.toDay} (iCloud ${MAIL_CRON_HOURS.icloud} h, Gmail ${MAIL_CRON_HOURS.gmail} h)`;
  }
  if (invalid.length > 0) return `Mails: ${invalid.join("; ")}, búsqueda automática apagada`;
  return "Mails: búsqueda automática apagada (falta MAIL_SYNC_DAYS)";
}
