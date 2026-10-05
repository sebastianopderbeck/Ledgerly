import type { HydratedDocument } from "mongoose";
import type { MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";
import type { MailAttachmentDoc, MailSyncRunDoc } from "../db/models.js";

export function toMailSyncItemDTO(doc: HydratedDocument<MailAttachmentDoc>): MailSyncItemDTO {
  return {
    id: doc._id.toString(),
    fileName: doc.fileName,
    receivedAt: doc.receivedAt.toISOString(),
    outcome: doc.outcome as MailSyncItemDTO["outcome"],
    kind: (doc.kind ?? null) as MailSyncItemDTO["kind"],
    documentId: doc.documentId ?? null,
    detail: doc.detail,
  };
}

export function toMailSyncRunDTO(
  run: HydratedDocument<MailSyncRunDoc>,
  items: HydratedDocument<MailAttachmentDoc>[],
): MailSyncRunDTO {
  return {
    trigger: run.trigger as MailSyncRunDTO["trigger"],
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt.toISOString(),
    status: run.status as MailSyncRunDTO["status"],
    error: run.error ?? null,
    messagesChecked: run.messagesChecked,
    hasMore: run.hasMore,
    items: items.map(toMailSyncItemDTO),
  };
}
