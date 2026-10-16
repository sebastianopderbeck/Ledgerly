import {
  MAIL_SOURCE_LABELS, type MailSource, type MailSyncOutcome, type MailSyncRunDTO, type MailSyncTrigger,
} from "@ledgerly/shared";
import type { Types } from "mongoose";
import { MISSING_OWNER } from "../auth/owner.js";
import { MAX_TIMER_MS, nextMailRunDelayMs, nextScheduledRun } from "./mailSchedule.js";
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

export type ResolveOwner = () => Promise<Types.ObjectId | null>;

const previousRun = async (ownerId: Types.ObjectId | null, source: MailSource): Promise<MailSyncRunDTO | null> => {
  if (!ownerId) return null;
  try {
    return await findLastMailRun(ownerId, source);
  } catch {
    return null;
  }
};

export async function startMailJob(setup: MailSourceSetup, resolveOwner: ResolveOwner): Promise<() => void> {
  const { source, schedule: mailSchedule, openClient } = setup;
  if (mailSchedule === null || openClient === null) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const jobStartedAt = new Date();
  const ownerOrNull = (): Promise<Types.ObjectId | null> => resolveOwner().catch(() => null);
  const last = await previousRun(await ownerOrNull(), source);
  let lastStartedAt: Date | null = last ? new Date(last.startedAt) : null;

  const arm = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(onTimer, Math.min(delayMs, MAX_TIMER_MS));
    timer.unref();
  };

  const runAsOwner = async (ownerId: Types.ObjectId | null): Promise<MailSyncRunDTO | null> => {
    if (!ownerId) {
      console.error(`${logPrefix(source, "job")}: error — ${MISSING_OWNER}`);
      return null;
    }
    try {
      const run = await runMailSync(ownerId, source, openClient, "job");
      logRun(run);
      return run;
    } catch (err) {
      console.error(`${logPrefix(source, "job")}: error — ${err instanceof Error ? err.message : UNEXPECTED_ERROR}`);
      return null;
    }
  };

  const runOnce = async (slot: Date): Promise<void> => {
    const ownerId = await ownerOrNull();
    const previous = await previousRun(ownerId, source);
    const startedAt = new Date();
    lastStartedAt = startedAt.getTime() >= slot.getTime() ? startedAt : slot;
    const run = await runAsOwner(ownerId);
    arm(nextMailRunDelayMs(mailSchedule, lastStartedAt, new Date()));
    if (run) await notifyRun(run, previous);
  };

  const onTimer = (): void => {
    const slot = nextScheduledRun(mailSchedule, lastStartedAt ?? jobStartedAt);
    const remainingMs = slot.getTime() - Date.now();
    if (remainingMs > 0) arm(remainingMs);
    else void runOnce(slot);
  };

  arm(nextMailRunDelayMs(mailSchedule, lastStartedAt, new Date()));

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
