import type { Types } from "mongoose";
import { MailAttachmentModel, MailSyncRunModel } from "../db/models.js";

const NOTICE_OUTCOMES = ["imported", "failed"];

export async function hasPendingMailNotice(userId: Types.ObjectId, seenAt: Date | null): Promise<boolean> {
  const since = seenAt ? { startedAt: { $gt: seenAt } } : {};
  const runs = await MailSyncRunModel.find({ userId, trigger: "job", ...since }, { _id: 1, status: 1 }).lean();
  if (runs.some(({ status }) => status === "error")) return true;
  if (runs.length === 0) return false;
  const runIds = runs.map(({ _id }) => _id);
  return (await MailAttachmentModel.exists({ userId, runId: { $in: runIds }, outcome: { $in: NOTICE_OUTCOMES } })) !== null;
}
