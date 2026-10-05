import { Types } from "mongoose";
import type { MailSyncOutcome, MailSyncRunDTO, MailSyncTrigger, ImportedFileKind } from "@ledgerly/shared";
import { MailAttachmentModel, MailSyncRunModel } from "../db/models.js";
import { IngestionError } from "../ingestion/errors.js";
import {
  importPdf as importPdfFile, MAX_PDF_BYTES, type ImportPdfInput, type ImportPdfOutcome,
} from "../import/importPdf.js";
import { createGmailClient, type GmailClient, type GmailMessage, type GmailPdfPart } from "../gmail/gmailClient.js";
import type { GmailConfig } from "../gmail/gmailConfig.js";
import { toMailSyncRunDTO } from "./mailMappers.js";

export const MAIL_LIST_LIMIT = 500;
export const MAIL_MAX_MESSAGES_PER_RUN = 50;
export const NO_PDF_PART_ID = "-";

const NO_PDF_FILE_NAME = "(sin PDF adjunto)";
const NO_PDF_DETAIL = "El mail no trae un PDF adjunto";
const TOO_BIG_DETAIL = "Supera el máximo de 15 MB";
const UNEXPECTED_ERROR = "Error inesperado";

export interface MailLedgerEntry {
  messageId: string;
  partId: string;
  outcome: MailSyncOutcome;
}

export interface SyncMailDeps {
  client: GmailClient;
  query: string;
  trigger: MailSyncTrigger;
  importPdf?: (input: ImportPdfInput) => Promise<ImportPdfOutcome>;
  maxMessages?: number;
  now?: () => Date;
}

interface PendingSelection {
  batch: string[];
  hasMore: boolean;
}

interface ImportErrorOutcome {
  outcome: "skipped" | "failed";
  detail: string;
}

interface PartResult {
  outcome: MailSyncOutcome;
  kind: ImportedFileKind | null;
  documentId: string | null;
  detail: string;
}

interface RunContext {
  runId: Types.ObjectId;
  client: GmailClient;
  importPdf: (input: ImportPdfInput) => Promise<ImportPdfOutcome>;
  now: () => Date;
  settled: Set<string>;
}

interface RunProgress {
  messagesChecked: number;
  hasMore: boolean;
  error: string | null;
}

const NO_DOCUMENT = { kind: null, documentId: null } as const;

const errorMessage = (err: unknown): string => (err instanceof Error && err.message ? err.message : UNEXPECTED_ERROR);

const ledgerKey = (messageId: string, partId: string): string => `${messageId}/${partId}`;

export function selectPendingMessages(ids: string[], ledger: MailLedgerEntry[], max: number): PendingSelection {
  const outcomesByMessage = new Map<string, MailSyncOutcome[]>();
  for (const { messageId, outcome } of ledger) {
    outcomesByMessage.set(messageId, [...(outcomesByMessage.get(messageId) ?? []), outcome]);
  }
  const pending = ids.filter((id) => {
    const outcomes = outcomesByMessage.get(id);
    return !outcomes || outcomes.includes("failed");
  });
  return { batch: pending.slice(0, max), hasMore: pending.length > max };
}

export function classifyImportError(err: unknown): ImportErrorOutcome {
  if (err instanceof IngestionError) return { outcome: "skipped", detail: err.message };
  return { outcome: "failed", detail: errorMessage(err) };
}

const readLedger = async (ids: string[]): Promise<MailLedgerEntry[]> => {
  const docs = await MailAttachmentModel.find({ messageId: { $in: ids } }, { messageId: 1, partId: 1, outcome: 1 }).lean();
  return docs.map(({ messageId, partId, outcome }) => ({ messageId, partId, outcome: outcome as MailSyncOutcome }));
};

const settledKeys = (ledger: MailLedgerEntry[]): Set<string> =>
  new Set(ledger.filter(({ outcome }) => outcome !== "failed").map(({ messageId, partId }) => ledgerKey(messageId, partId)));

const recordPart = async (
  ctx: RunContext, message: GmailMessage, partId: string, fileName: string, result: PartResult,
): Promise<void> => {
  await MailAttachmentModel.updateOne(
    { messageId: message.id, partId },
    { $set: { runId: ctx.runId, fileName, receivedAt: new Date(message.receivedAt), ...result, processedAt: ctx.now() } },
    { upsert: true },
  );
};

const importPart = async (ctx: RunContext, data: Uint8Array, fileName: string): Promise<PartResult> => {
  try {
    const { result, file } = await ctx.importPdf({ data, fileName });
    return { outcome: result.status, kind: result.kind, documentId: file.id, detail: file.description };
  } catch (err) {
    return { ...classifyImportError(err), ...NO_DOCUMENT };
  }
};

const downloadPart = async (ctx: RunContext, message: GmailMessage, part: GmailPdfPart): Promise<Uint8Array> => {
  try {
    return await ctx.client.downloadPart(message.id, part);
  } catch (err) {
    await recordPart(ctx, message, part.partId, part.fileName, { outcome: "failed", detail: errorMessage(err), ...NO_DOCUMENT });
    throw err;
  }
};

const processPart = async (ctx: RunContext, message: GmailMessage, part: GmailPdfPart): Promise<PartResult> => {
  if (part.size > MAX_PDF_BYTES) return { outcome: "skipped", detail: TOO_BIG_DETAIL, ...NO_DOCUMENT };
  const data = await downloadPart(ctx, message, part);
  return importPart(ctx, data, part.fileName);
};

const processMessage = async (ctx: RunContext, message: GmailMessage): Promise<void> => {
  if (message.pdfParts.length === 0) {
    await recordPart(ctx, message, NO_PDF_PART_ID, NO_PDF_FILE_NAME, { outcome: "skipped", detail: NO_PDF_DETAIL, ...NO_DOCUMENT });
    return;
  }
  for (const part of message.pdfParts) {
    if (ctx.settled.has(ledgerKey(message.id, part.partId))) continue;
    await recordPart(ctx, message, part.partId, part.fileName, await processPart(ctx, message, part));
  }
};

const scanMailbox = async (
  deps: Omit<RunContext, "settled">, query: string, maxMessages: number, progress: RunProgress,
): Promise<void> => {
  const ids = await deps.client.listMessageIds(query, MAIL_LIST_LIMIT);
  const ledger = await readLedger(ids);
  const { batch, hasMore } = selectPendingMessages(ids, ledger, maxMessages);
  const ctx: RunContext = { ...deps, settled: settledKeys(ledger) };
  progress.hasMore = hasMore;
  for (const messageId of batch) {
    const message = await ctx.client.getMessage(messageId);
    progress.messagesChecked += 1;
    await processMessage(ctx, message);
  }
};

const itemsOf = (runId: Types.ObjectId) => MailAttachmentModel.find({ runId }).sort({ processedAt: 1, _id: 1 });

export async function syncMail({
  client, query, trigger, importPdf = importPdfFile, maxMessages = MAIL_MAX_MESSAGES_PER_RUN, now = () => new Date(),
}: SyncMailDeps): Promise<MailSyncRunDTO> {
  const runId = new Types.ObjectId();
  const startedAt = now();
  const progress: RunProgress = { messagesChecked: 0, hasMore: false, error: null };
  try {
    await scanMailbox({ runId, client, importPdf, now }, query, maxMessages, progress);
  } catch (err) {
    progress.error = errorMessage(err);
  }
  const run = await MailSyncRunModel.create({
    _id: runId,
    trigger,
    startedAt,
    finishedAt: now(),
    status: progress.error ? "error" : "ok",
    error: progress.error,
    messagesChecked: progress.messagesChecked,
    hasMore: progress.hasMore,
  });
  return toMailSyncRunDTO(run, await itemsOf(runId));
}

let inFlight: Promise<MailSyncRunDTO> | null = null;

export function runMailSync(config: GmailConfig, trigger: MailSyncTrigger): Promise<MailSyncRunDTO> {
  if (inFlight) return inFlight;
  const run = syncMail({ client: createGmailClient(config.credentials), query: config.query, trigger });
  const tracked = run.finally(() => {
    inFlight = null;
  });
  inFlight = tracked;
  return tracked;
}

export async function findLastMailRun(): Promise<MailSyncRunDTO | null> {
  const run = await MailSyncRunModel.findOne().sort({ startedAt: -1 });
  return run ? toMailSyncRunDTO(run, await itemsOf(run._id)) : null;
}
