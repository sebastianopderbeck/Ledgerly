import type { MailSyncItemDTO, MailSyncOutcome, MailSyncRunDTO, MailSyncTrigger } from "@ledgerly/shared";
import { formatLocalDate } from "./format.js";
import { IMPORTED_FILE_KIND_LABELS } from "./importedFiles.js";

export type MailOutcomeColor = "success" | "default" | "warning" | "error";

export interface MailItemsSplit {
  visible: MailSyncItemDTO[];
  skipped: MailSyncItemDTO[];
}

interface CountLabels {
  one: string;
  many: string;
}

export const MAIL_OUTCOME_LABELS: Record<MailSyncOutcome, string> = {
  imported: "Importado",
  duplicate: "Ya estaba",
  skipped: "Omitido",
  failed: "Error",
};

export const MAIL_OUTCOME_COLORS: Record<MailSyncOutcome, MailOutcomeColor> = {
  imported: "success",
  duplicate: "default",
  skipped: "warning",
  failed: "error",
};

const TRIGGER_LABELS: Record<MailSyncTrigger, string> = { manual: "manual", job: "automática" };

const OUTCOME_COUNT_LABELS: Record<MailSyncOutcome, CountLabels> = {
  imported: { one: "importado", many: "importados" },
  duplicate: { one: "ya estaba", many: "ya estaban" },
  skipped: { one: "omitido", many: "omitidos" },
  failed: { one: "con error", many: "con error" },
};

const SUMMARY_ORDER: MailSyncOutcome[] = ["imported", "duplicate", "skipped", "failed"];
const VISIBLE_ORDER: MailSyncOutcome[] = ["imported", "failed", "duplicate"];
const MINUTES_PER_HOUR = 60;
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

export const joinWithY = (items: string[]): string =>
  (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

export const formatDateTime = (iso: string): string => DATE_TIME_FORMAT.format(new Date(iso));

export const gmailMissingVarsMessage = (missing: string[]): string => {
  const single = missing.length === 1;
  const verb = single ? "Falta" : "Faltan";
  const pronoun = single ? "obtenerla" : "obtenerlas";
  return `${verb} ${joinWithY(missing)} en el .env del server. Los pasos para ${pronoun} están en el README, sección «Importar desde Gmail»; después reiniciá el server.`;
};

export const mailIntervalLabel = (minutes: number | null): string => {
  if (minutes === null) return "apagada";
  return minutes % MINUTES_PER_HOUR === 0 ? `cada ${minutes / MINUTES_PER_HOUR} h` : `cada ${minutes} min`;
};

export const gmailLastRunLabel = (run: MailSyncRunDTO | null): string =>
  (run ? `Última búsqueda: ${formatDateTime(run.startedAt)} (${TRIGGER_LABELS[run.trigger]})` : "Todavía no buscaste en Gmail.");

const countOf = (items: MailSyncItemDTO[], outcome: MailSyncOutcome): number =>
  items.filter((item) => item.outcome === outcome).length;

const countLabel = (count: number, outcome: MailSyncOutcome): string => {
  const { one, many } = OUTCOME_COUNT_LABELS[outcome];
  return `${count} ${count === 1 ? one : many}`;
};

export const mailRunSummary = (run: MailSyncRunDTO): string | null => {
  if (run.status === "error" && run.items.length === 0) return null;
  if (run.messagesChecked === 0) return "No había mails nuevos.";
  const single = run.messagesChecked === 1;
  const mails = single ? "1 mail nuevo" : `${run.messagesChecked} mails nuevos`;
  if (run.items.length === 0) return `Revisé ${mails}: ${single ? "no tenía" : "no tenían"} PDFs.`;
  const counts = SUMMARY_ORDER
    .map((outcome) => ({ outcome, count: countOf(run.items, outcome) }))
    .filter(({ count }) => count > 0)
    .map(({ outcome, count }) => countLabel(count, outcome));
  return `Revisé ${mails}: ${counts.join(" · ")}`;
};

export const splitMailItems = (items: MailSyncItemDTO[]): MailItemsSplit => ({
  visible: VISIBLE_ORDER.flatMap((outcome) => items.filter((item) => item.outcome === outcome)),
  skipped: items.filter((item) => item.outcome === "skipped"),
});

export const mailItemSecondary = ({ kind, detail, receivedAt }: MailSyncItemDTO): string =>
  [kind ? IMPORTED_FILE_KIND_LABELS[kind] : "", detail, formatLocalDate(receivedAt)]
    .filter((part) => part !== "")
    .join(" · ");
