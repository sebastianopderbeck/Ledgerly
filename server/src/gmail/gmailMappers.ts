import type { HydratedDocument } from "mongoose";
import type { GmailSyncItemDTO, GmailSyncRunDTO } from "@ledgerly/shared";
import type { GmailAttachmentDoc, GmailSyncRunDoc } from "../db/models.js";

export function toGmailSyncItemDTO(doc: HydratedDocument<GmailAttachmentDoc>): GmailSyncItemDTO {
  return {
    id: doc._id.toString(),
    fileName: doc.fileName,
    receivedAt: doc.receivedAt.toISOString(),
    outcome: doc.outcome as GmailSyncItemDTO["outcome"],
    kind: (doc.kind ?? null) as GmailSyncItemDTO["kind"],
    documentId: doc.documentId ?? null,
    detail: doc.detail,
  };
}

export function toGmailSyncRunDTO(
  run: HydratedDocument<GmailSyncRunDoc>,
  items: HydratedDocument<GmailAttachmentDoc>[],
): GmailSyncRunDTO {
  return {
    trigger: run.trigger as GmailSyncRunDTO["trigger"],
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt.toISOString(),
    status: run.status as GmailSyncRunDTO["status"],
    error: run.error ?? null,
    messagesChecked: run.messagesChecked,
    hasMore: run.hasMore,
    items: items.map(toGmailSyncItemDTO),
  };
}
