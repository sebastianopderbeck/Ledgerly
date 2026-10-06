import {
  MAIL_SOURCE_LABELS, type MailSource, type MailSourceStatusDTO, type MailSyncItemDTO, type MailSyncOutcome, type MailSyncRunDTO,
  type MailSyncTrigger,
} from "@ledgerly/shared";
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

const SETUP_SECTIONS: Record<MailSource, string> = { gmail: "Importar desde Gmail", icloud: "Importar desde iCloud" };

const SCOPE_PREFIXES: Record<MailSource, string> = { gmail: "Consulta", icloud: "Revisa" };

const HIDDEN_MAIL_SOURCES: MailSource[] = ["gmail"];

const OUTCOME_COUNT_LABELS: Record<MailSyncOutcome, CountLabels> = {
  imported: { one: "importado", many: "importados" },
  duplicate: { one: "ya estaba", many: "ya estaban" },
  skipped: { one: "omitido", many: "omitidos" },
  failed: { one: "con error", many: "con error" },
};

const SUMMARY_ORDER: MailSyncOutcome[] = ["imported", "duplicate", "skipped", "failed"];
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

export const joinWithY = (items: string[]): string =>
  (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

export const formatDateTime = (iso: string): string => DATE_TIME_FORMAT.format(new Date(iso));

export const visibleMailStatuses = (statuses: MailSourceStatusDTO[]): MailSourceStatusDTO[] =>
  statuses.filter(({ source }) => !HIDDEN_MAIL_SOURCES.includes(source));

export const mailSearchLabel = (source: MailSource): string => `Buscar en ${MAIL_SOURCE_LABELS[source]}`;

export const mailDisabledTitle = (source: MailSource): string =>
  `Importación desde ${MAIL_SOURCE_LABELS[source]} deshabilitada`;

export const mailMissingMessage = (source: MailSource, missing: string[]): string => {
  const verb = missing.length === 1 ? "Falta" : "Faltan";
  return `${verb} ${joinWithY(missing)}. Los pasos están en el README, sección «${SETUP_SECTIONS[source]}»; después reiniciá el server.`;
};

export const mailScopeLabel = (source: MailSource, scope: string | null): string => `${SCOPE_PREFIXES[source]}: ${scope ?? ""}`;

export const mailLastRunLabel = (source: MailSource, run: MailSyncRunDTO | null): string =>
  (run
    ? `Última búsqueda: ${formatDateTime(run.startedAt)} (${TRIGGER_LABELS[run.trigger]})`
    : `Todavía no buscaste en ${MAIL_SOURCE_LABELS[source]}.`);

export const mailHasMoreMessage = (source: MailSource): string =>
  `Quedan mails por revisar: tocá «${mailSearchLabel(source)}» otra vez.`;

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

const isUnreadable = ({ outcome, kind }: MailSyncItemDTO): boolean => outcome === "skipped" && kind !== null;

const byOutcome = (items: MailSyncItemDTO[], outcome: MailSyncOutcome): MailSyncItemDTO[] =>
  items.filter((item) => item.outcome === outcome);

export const splitMailItems = (items: MailSyncItemDTO[]): MailItemsSplit => ({
  visible: [
    ...byOutcome(items, "imported"), ...byOutcome(items, "failed"), ...items.filter(isUnreadable), ...byOutcome(items, "duplicate"),
  ],
  skipped: byOutcome(items, "skipped").filter((item) => !isUnreadable(item)),
});

export const mailItemSecondary = ({ kind, detail, receivedAt }: MailSyncItemDTO): string =>
  [kind ? IMPORTED_FILE_KIND_LABELS[kind] : "", detail, formatLocalDate(receivedAt)]
    .filter((part) => part !== "")
    .join(" · ");
