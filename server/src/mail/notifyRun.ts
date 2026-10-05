import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MAIL_SOURCE_LABELS, type ImportedFileKind, type MailSyncItemDTO, type MailSyncRunDTO } from "@ledgerly/shared";

export type Notify = (title: string, message: string) => Promise<void>;

export interface NotifyDeps {
  notify?: Notify;
  platform?: NodeJS.Platform;
}

const execFileAsync = promisify(execFile);

const APPLESCRIPT = ["-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run"];
const UNEXPECTED_ERROR = "Error inesperado";

const KIND_PHRASES: Record<ImportedFileKind, string> = {
  statement: "un resumen",
  coupon: "un cupón de la hipoteca",
  auto: "un cupón del plan del auto",
  payslip: "un recibo de sueldo",
};

export const osascriptNotify: Notify = async (title, message) => {
  await execFileAsync("osascript", [...APPLESCRIPT, title, message]);
};

const joinWithY = (items: string[]): string =>
  (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`);

const itemsWith = (run: MailSyncRunDTO, outcome: MailSyncItemDTO["outcome"]): MailSyncItemDTO[] =>
  run.items.filter((item) => item.outcome === outcome);

const importedMessages = (items: MailSyncItemDTO[]): string[] => {
  if (items.length === 0) return [];
  if (items.length === 1) return [`Importé ${items[0].fileName}: ${items[0].detail}`];
  return [`Importé ${items.length} documentos: ${joinWithY(items.map(({ fileName }) => fileName))}`];
};

const failedMessages = (items: MailSyncItemDTO[]): string[] =>
  items.map(({ fileName, detail }) => `No pude importar ${fileName}: ${detail}`);

const unreadableMessages = (items: MailSyncItemDTO[]): string[] =>
  items.flatMap(({ fileName, detail, kind }) => (kind ? [`${fileName} parece ${KIND_PHRASES[kind]} pero no lo pude leer: ${detail}`] : []));

const runErrorMessages = (run: MailSyncRunDTO, previous: MailSyncRunDTO | null): string[] =>
  (run.status === "error" && previous?.status !== "error" ? [run.error ?? UNEXPECTED_ERROR] : []);

export function runNotifications(run: MailSyncRunDTO, previous: MailSyncRunDTO | null): string[] {
  if (run.trigger !== "job") return [];
  return [
    ...importedMessages(itemsWith(run, "imported")),
    ...failedMessages(itemsWith(run, "failed")),
    ...unreadableMessages(itemsWith(run, "skipped")),
    ...runErrorMessages(run, previous),
  ];
}

export async function notifyRun(
  run: MailSyncRunDTO, previous: MailSyncRunDTO | null, { notify = osascriptNotify, platform = process.platform }: NotifyDeps = {},
): Promise<void> {
  if (platform !== "darwin") return;
  const title = `Ledgerly · ${MAIL_SOURCE_LABELS[run.source]}`;
  for (const message of runNotifications(run, previous)) {
    try {
      await notify(title, message);
    } catch (err) {
      console.error(`${title}: no pude mostrar la notificación — ${err instanceof Error ? err.message : UNEXPECTED_ERROR}`);
    }
  }
}
