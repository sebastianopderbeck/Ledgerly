import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { mailSyncRunDtoSchema } from "@ledgerly/shared";
import { withDb } from "../testing/withDb.js";
import { MailAttachmentModel, MailSyncRunModel } from "../db/models.js";
import { toMailSyncItemDTO, toMailSyncRunDTO } from "./mailMappers.js";

withDb();

const attachment = (overrides: Record<string, unknown> = {}) => MailAttachmentModel.create({
  source: "gmail", messageId: "msg-1", partId: "1", runId: new Types.ObjectId(), fileName: "resumen-sintetico.pdf",
  receivedAt: new Date("2026-09-28T12:00:00.000Z"), outcome: "imported", kind: "statement", documentId: "stmt-1",
  detail: "ICBC · 3 movimientos", processedAt: new Date("2026-10-03T12:00:01.000Z"), ...overrides,
});

describe("toMailSyncItemDTO", () => {
  it("mapea un adjunto importado", async () => {
    const doc = await attachment();
    expect(toMailSyncItemDTO(doc)).toEqual({
      id: doc._id.toString(), fileName: "resumen-sintetico.pdf", receivedAt: "2026-09-28T12:00:00.000Z",
      outcome: "imported", kind: "statement", documentId: "stmt-1", detail: "ICBC · 3 movimientos",
    });
  });

  it("un omitido queda sin kind ni documento", async () => {
    const doc = await attachment({ outcome: "skipped", kind: null, documentId: null, detail: "Formato de resumen no reconocido" });
    expect(toMailSyncItemDTO(doc)).toMatchObject({ outcome: "skipped", kind: null, documentId: null });
  });
});

describe("toMailSyncRunDTO", () => {
  it("arma la corrida con sus ítems y cumple el schema", async () => {
    const run = await MailSyncRunModel.create({
      source: "gmail", trigger: "job", startedAt: new Date("2026-10-03T12:00:00.000Z"), finishedAt: new Date("2026-10-03T12:00:05.000Z"),
      status: "error", error: "Gmail respondió 500.", messagesChecked: 1, hasMore: true,
    });
    const item = await attachment({ runId: run._id });
    const dto = toMailSyncRunDTO(run, [item]);
    expect(dto).toEqual({
      source: "gmail", trigger: "job", startedAt: "2026-10-03T12:00:00.000Z", finishedAt: "2026-10-03T12:00:05.000Z",
      status: "error", error: "Gmail respondió 500.", messagesChecked: 1, hasMore: true, items: [toMailSyncItemDTO(item)],
    });
    expect(() => mailSyncRunDtoSchema.parse(dto)).not.toThrow();
  });
});
