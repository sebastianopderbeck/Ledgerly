import {
  MAIL_SOURCE_LABELS, type MailSource, type MailSyncOutcome, type MailSyncRunDTO, type MailSyncTrigger,
} from "@ledgerly/shared";
import type { MailSourceSetup } from "./mailSourceSetup.js";
import { findLastMailRun, runMailSync } from "./syncMail.js";

export const MAIL_STARTUP_DELAY_MS = 60_000;
const MINUTE_MS = 60_000;
const UNEXPECTED_ERROR = "Error inesperado";

const TRIGGER_LOG_LABELS: Record<MailSyncTrigger, string> = { manual: "manual", job: "automática" };

export function nextMailRunDelayMs(lastStartedAt: Date | null, intervalMinutes: number, now: Date): number {
  if (!lastStartedAt) return MAIL_STARTUP_DELAY_MS;
  const dueInMs = lastStartedAt.getTime() + intervalMinutes * MINUTE_MS - now.getTime();
  return Math.max(MAIL_STARTUP_DELAY_MS, dueInMs);
}

const countOf = (run: MailSyncRunDTO, outcome: MailSyncOutcome): number =>
  run.items.filter((item) => item.outcome === outcome).length;

const mailsLabel = (count: number): string => (count === 1 ? "1 mail nuevo" : `${count} mails nuevos`);

const logPrefix = (source: MailSource, trigger: MailSyncTrigger): string =>
  `${MAIL_SOURCE_LABELS[source]} (${TRIGGER_LOG_LABELS[trigger]})`;

export function formatMailRunLog(run: MailSyncRunDTO): string {
  const prefix = logPrefix(run.source, run.trigger);
  if (run.status === "error") return `${prefix}: error — ${run.error ?? UNEXPECTED_ERROR}`;
  const counts = [
    `importados ${countOf(run, "imported")}`,
    `ya estaban ${countOf(run, "duplicate")}`,
    `omitidos ${countOf(run, "skipped")}`,
    `con error ${countOf(run, "failed")}`,
  ];
  return `${prefix}: ${[mailsLabel(run.messagesChecked), ...counts].join(" · ")}`;
}

const logRun = (run: MailSyncRunDTO): void => {
  const line = formatMailRunLog(run);
  if (run.status === "error") console.error(line);
  else console.log(line);
};

const lastStartedAt = async (source: MailSource): Promise<Date | null> => {
  try {
    const run = await findLastMailRun(source);
    return run ? new Date(run.startedAt) : null;
  } catch {
    return null;
  }
};

export async function startMailJob(setup: MailSourceSetup): Promise<() => void> {
  const { source, intervalMinutes, openClient } = setup;
  if (intervalMinutes === null || openClient === null) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const runOnce = async (): Promise<void> => {
    try {
      logRun(await runMailSync(source, openClient, "job"));
    } catch (err) {
      console.error(`${logPrefix(source, "job")}: error — ${err instanceof Error ? err.message : UNEXPECTED_ERROR}`);
    }
    schedule(intervalMinutes * MINUTE_MS);
  };

  const schedule = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      void runOnce();
    }, delayMs);
    timer.unref();
  };

  schedule(nextMailRunDelayMs(await lastStartedAt(source), intervalMinutes, new Date()));

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
