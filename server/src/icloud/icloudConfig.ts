import { MIN_SYNC_INTERVAL_MINUTES, parseSyncInterval } from "../mail/syncInterval.js";

export const ICLOUD_HOST = "imap.mail.me.com";
export const ICLOUD_PORT = 993;
export const ICLOUD_USER_VAR = "ICLOUD_USER";
export const ICLOUD_PASSWORD_MISSING = "la contraseña de app en el Llavero";
export const DEFAULT_ICLOUD_MAILBOXES = ["INBOX"];
export const DEFAULT_ICLOUD_WINDOW_DAYS = 90;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export interface IcloudConfig {
  user: string;
  since: string | null;
  sinceInvalid: boolean;
  mailboxes: string[];
  intervalMinutes: number | null;
  intervalInvalid: boolean;
}

const valueOf = (env: NodeJS.ProcessEnv, key: string): string => env[key]?.trim() ?? "";

const localDate = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export function parseIcloudSince(raw: string): string | null {
  const match = ISO_DATE.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  const sameDay = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return sameDay ? raw : null;
}

export function parseIcloudMailboxes(raw: string): string[] {
  const names = raw.split(",").map((name) => name.trim()).filter((name) => name !== "");
  return names.length > 0 ? [...new Set(names)] : DEFAULT_ICLOUD_MAILBOXES;
}

export function readIcloudConfig(env: NodeJS.ProcessEnv): IcloudConfig | null {
  const user = valueOf(env, ICLOUD_USER_VAR);
  if (!user) return null;
  const rawSince = valueOf(env, "ICLOUD_SINCE");
  const rawInterval = valueOf(env, "ICLOUD_SYNC_INTERVAL_MINUTES");
  const since = rawSince ? parseIcloudSince(rawSince) : null;
  const intervalMinutes = parseSyncInterval(rawInterval);
  return {
    user,
    since,
    sinceInvalid: rawSince !== "" && since === null,
    mailboxes: parseIcloudMailboxes(valueOf(env, "ICLOUD_MAILBOXES")),
    intervalMinutes,
    intervalInvalid: rawInterval !== "" && intervalMinutes === null,
  };
}

export function icloudSearchSince({ since }: Pick<IcloudConfig, "since">, now: Date): Date {
  return since ? localDate(since) : new Date(now.getTime() - DEFAULT_ICLOUD_WINDOW_DAYS * DAY_MS);
}

const formatDay = (iso: string): string => iso.split("-").reverse().join("/");

export function icloudScopeLabel({ since, mailboxes }: Pick<IcloudConfig, "since" | "mailboxes">): string {
  const window = since ? `desde el ${formatDay(since)}` : `últimos ${DEFAULT_ICLOUD_WINDOW_DAYS} días`;
  return `${mailboxes.join(", ")} · ${window}`;
}

export function describeIcloudSetup(config: IcloudConfig | null, hasPassword: boolean): string {
  if (!config) return `iCloud: deshabilitado (falta ${ICLOUD_USER_VAR})`;
  if (!hasPassword && config.intervalMinutes === null) return `iCloud: deshabilitado (falta ${ICLOUD_PASSWORD_MISSING})`;
  const mode = config.intervalMinutes !== null
    ? `búsqueda automática cada ${config.intervalMinutes} min`
    : "búsqueda manual; automática apagada";
  const notes = [
    config.sinceInvalid ? `ICLOUD_SINCE inválido (AAAA-MM-DD), uso los últimos ${DEFAULT_ICLOUD_WINDOW_DAYS} días` : null,
    config.intervalInvalid
      ? `ICLOUD_SYNC_INTERVAL_MINUTES inválido (entero ≥ ${MIN_SYNC_INTERVAL_MINUTES}), automática apagada`
      : null,
  ].filter((note): note is string => note !== null);
  const passwordNote = hasPassword
    ? null
    : `falta ${ICLOUD_PASSWORD_MISSING}, las corridas van a fallar hasta que la cargues`;
  return [`iCloud: ${mode} (${icloudScopeLabel(config)})`, passwordNote, ...notes]
    .filter((part): part is string => part !== null)
    .join("; ");
}
