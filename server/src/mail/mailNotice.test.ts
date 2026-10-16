import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { withDb } from "../testing/withDb.js";
import { MailAttachmentModel, MailSyncRunModel } from "../db/models.js";
import { hasPendingMailNotice } from "./mailNotice.js";

withDb();

const USER_ID = new Types.ObjectId();
const SEEN_AT = new Date("2026-10-20T00:00:00Z");

const run = (startedAt: string, overrides: Record<string, unknown> = {}) => MailSyncRunModel.create({
  userId: USER_ID, source: "gmail", trigger: "job", startedAt: new Date(startedAt), finishedAt: new Date(startedAt),
  status: "ok", error: null, messagesChecked: 1, hasMore: false, ...overrides,
});

const attachment = (runId: Types.ObjectId, outcome: string, messageId = "m1") => MailAttachmentModel.create({
  userId: USER_ID, source: "gmail", messageId, partId: "1", runId, fileName: "a.pdf", receivedAt: new Date(),
  outcome, kind: null, documentId: null, detail: "x", processedAt: new Date(),
});

describe("hasPendingMailNotice", () => {
  it("sin corridas no hay aviso", async () => {
    expect(await hasPendingMailNotice(USER_ID, null)).toBe(false);
  });

  it("una corrida automática que importó algo prende el aviso", async () => {
    const { _id } = await run("2026-10-21T00:30:00Z");
    await attachment(_id, "imported");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(true);
  });

  it("un adjunto fallido también lo prende", async () => {
    const { _id } = await run("2026-10-21T00:30:00Z");
    await attachment(_id, "failed");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(true);
  });

  it("una corrida con error lo prende aunque no tenga adjuntos", async () => {
    await run("2026-10-21T00:30:00Z", { status: "error", error: "Gmail respondió 500." });
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(true);
  });

  it("una corrida sin novedades no lo prende", async () => {
    const { _id } = await run("2026-10-21T00:30:00Z");
    await attachment(_id, "duplicate");
    await attachment(_id, "skipped", "m2");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(false);
  });

  it("una corrida manual no lo prende", async () => {
    const { _id } = await run("2026-10-21T00:30:00Z", { trigger: "manual" });
    await attachment(_id, "imported");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(false);
  });

  it("lo que pasó antes de verlo no lo prende", async () => {
    const { _id } = await run("2026-10-19T00:30:00Z");
    await attachment(_id, "imported");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(false);
    expect(await hasPendingMailNotice(USER_ID, null)).toBe(true);
  });
});
