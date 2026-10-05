import {
  MAIL_SOURCE_LABELS, type MailSource, type MailSyncOutcome, type MailSyncRunDTO, type MailSyncTrigger,
} from "@ledgerly/shared";
import { nextMailRunDelayMs } from "./mailSchedule.js";
import type { MailSourceSetup } from "./mailSourceSetup.js";
import { notifyRun } from "./notifyRun.js";
import { findLastMailRun, runMailSync } from "./syncMail.js";

const UNEXPECTED_ERROR = "Error inesperado";

const TRIGGER_LOG_LABELS: Record<MailSyncTrigger, string> = { manual: "manual", job: "automática" };

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

const previousRun = async (source: MailSource): Promise<MailSyncRunDTO | null> => {
  try {
    return await findLastMailRun(source);
  } catch {
    return null;
  }
};

export async function startMailJob(setup: MailSourceSetup): Promise<() => void> {
  const { source, schedule: mailSchedule, openClient } = setup;
  if (mailSchedule === null || openClient === null) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const runOnce = async (): Promise<void> => {
    const previous = await previousRun(source);
    const startedAt = new Date();
    let run: MailSyncRunDTO | null = null;
    try {
      run = await runMailSync(source, openClient, "job");
      logRun(run);
    } catch (err) {
      console.error(`${logPrefix(source, "job")}: error — ${err instanceof Error ? err.message : UNEXPECTED_ERROR}`);
    }
    schedule(nextMailRunDelayMs(mailSchedule, startedAt, new Date()));
    if (run) await notifyRun(run, previous);
  };

  const schedule = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      void runOnce();
    }, delayMs);
    timer.unref();
  };

  const last = await previousRun(source);
  schedule(nextMailRunDelayMs(mailSchedule, last ? new Date(last.startedAt) : null, new Date()));

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
