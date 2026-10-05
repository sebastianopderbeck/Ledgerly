import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StatementDTO } from "@ledgerly/shared";
import { withDb } from "../testing/withDb.js";
import { FAKE_RECEIVED_AT, fakeGmailClient, fakePdfBytes, pdfPart } from "../testing/mailFixtures.js";

vi.mock("../gmail/gmailClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../gmail/gmailClient.js")>()),
  createGmailClient: vi.fn(),
}));
import { createGmailClient, GmailApiError, GmailAuthError } from "../gmail/gmailClient.js";
import { MailAttachmentModel, MailSyncRunModel } from "../db/models.js";
import { EncryptedPdfError, UnsupportedFormatError } from "../ingestion/errors.js";
import { MAX_PDF_BYTES, type ImportPdfInput, type ImportPdfOutcome } from "../import/importPdf.js";
import type { GmailConfig } from "../gmail/gmailConfig.js";
import {
  classifyImportError, findLastMailRun, MAIL_LIST_LIMIT, NO_PDF_PART_ID, runMailSync, selectPendingMessages, syncMail,
} from "./syncMail.js";

withDb();

const QUERY = "has:attachment filename:pdf";

const statementDto = (id: string): StatementDTO => ({
  id, issuer: "visa_signature", cardLabel: "Visa Signature ****1234", last4: "1234",
  closingDate: "2026-09-25", dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 3000, usd: 0 }, saldoActual: { ars: 3000, usd: 0 },
    pagoMinimo: { ars: 300, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "resumen-sintetico.pdf", needsReview: false, reconciliation: { ok: true, entries: [] },
  transactionCount: 3, uploadedAt: "2026-09-28T12:00:00.000Z",
});

const statementOutcome = (status: "imported" | "duplicate", id: string): ImportPdfOutcome => ({
  result: { kind: "statement", status, statement: statementDto(id), transactionCount: 3 },
  file: {
    id, kind: "statement", fileName: "resumen-sintetico.pdf", uploadedAt: "2026-09-28T12:00:00.000Z",
    documentDate: "2026-09-25", description: "Visa Signature ****1234 · 3 movimientos", needsReview: false,
  },
});

const importByName = (outcomes: Record<string, ImportPdfOutcome | Error>) =>
  vi.fn(async ({ fileName }: ImportPdfInput): Promise<ImportPdfOutcome> => {
    const outcome = outcomes[fileName];
    if (!outcome) throw new UnsupportedFormatError();
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });

const ticking = () => {
  let millis = Date.parse("2026-10-03T12:00:00.000Z");
  return () => {
    millis += 1000;
    return new Date(millis);
  };
};

const summaryOf = (items: { fileName: string; outcome: string; kind: string | null; documentId: string | null }[]) =>
  items.map(({ fileName, outcome, kind, documentId }) => ({ fileName, outcome, kind, documentId }));

describe("selectPendingMessages", () => {
  it("sin registro, todos están pendientes en el orden de Gmail", () => {
    expect(selectPendingMessages(["msg-3", "msg-2", "msg-1"], [], 10)).toEqual({ batch: ["msg-3", "msg-2", "msg-1"], hasMore: false });
  });

  it("saltea los ya resueltos y retoma los que tienen alguna parte fallida", () => {
    const ledger = [
      { messageId: "msg-1", partId: "1", outcome: "imported" as const },
      { messageId: "msg-2", partId: "1", outcome: "imported" as const },
      { messageId: "msg-2", partId: "2", outcome: "failed" as const },
      { messageId: "msg-3", partId: "-", outcome: "skipped" as const },
    ];
    expect(selectPendingMessages(["msg-4", "msg-3", "msg-2", "msg-1"], ledger, 10))
      .toEqual({ batch: ["msg-4", "msg-2"], hasMore: false });
  });

  it("toma los primeros max y avisa que quedan más", () => {
    expect(selectPendingMessages(["msg-3", "msg-2", "msg-1"], [], 2)).toEqual({ batch: ["msg-3", "msg-2"], hasMore: true });
  });
});

describe("classifyImportError", () => {
  it("un error de ingestión es omitido con su motivo", () => {
    expect(classifyImportError(new UnsupportedFormatError())).toEqual({ outcome: "skipped", detail: "Formato de resumen no reconocido" });
    expect(classifyImportError(new EncryptedPdfError())).toEqual({ outcome: "skipped", detail: "El PDF está protegido con contraseña" });
  });

  it("cualquier otro error es fallido, con su mensaje o «Error inesperado»", () => {
    expect(classifyImportError(new Error("Mongo se cayó"))).toEqual({ outcome: "failed", detail: "Mongo se cayó" });
    expect(classifyImportError(new Error(""))).toEqual({ outcome: "failed", detail: "Error inesperado" });
    expect(classifyImportError("texto")).toEqual({ outcome: "failed", detail: "Error inesperado" });
  });
});

describe("syncMail", () => {
  it("registra importados, duplicados y omitidos en el registro y en la corrida", async () => {
    const client = fakeGmailClient([
      { id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] },
      { id: "msg-2", pdfParts: [pdfPart("1", "resumen-repetido.pdf")] },
      { id: "msg-3", pdfParts: [pdfPart("2", "factura-ajena.pdf")] },
    ]);
    const importPdf = importByName({
      "resumen-sintetico.pdf": statementOutcome("imported", "stmt-1"),
      "resumen-repetido.pdf": statementOutcome("duplicate", "stmt-0"),
    });
    const run = await syncMail({ client, query: QUERY, trigger: "manual", importPdf, now: ticking() });
    expect(run).toMatchObject({ trigger: "manual", status: "ok", error: null, messagesChecked: 3, hasMore: false });
    expect(summaryOf(run.items)).toEqual([
      { fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement", documentId: "stmt-1" },
      { fileName: "resumen-repetido.pdf", outcome: "duplicate", kind: "statement", documentId: "stmt-0" },
      { fileName: "factura-ajena.pdf", outcome: "skipped", kind: null, documentId: null },
    ]);
    expect(run.items.map(({ detail }) => detail)).toEqual([
      "Visa Signature ****1234 · 3 movimientos", "Visa Signature ****1234 · 3 movimientos", "Formato de resumen no reconocido",
    ]);
    expect(run.items[0].receivedAt).toBe(FAKE_RECEIVED_AT);
    expect(client.listMessageIds).toHaveBeenCalledWith(QUERY, MAIL_LIST_LIMIT);
    expect(importPdf).toHaveBeenCalledWith({ data: fakePdfBytes("msg-1", "1"), fileName: "resumen-sintetico.pdf" });
    expect(await MailAttachmentModel.countDocuments()).toBe(3);
    expect(await MailSyncRunModel.countDocuments()).toBe(1);
  });

  it("una segunda corrida no vuelve a leer los mails ya procesados", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]);
    const importPdf = importByName({ "resumen-sintetico.pdf": statementOutcome("imported", "stmt-1") });
    await syncMail({ client, query: QUERY, trigger: "manual", importPdf });
    client.getMessage.mockClear();
    const second = await syncMail({ client, query: QUERY, trigger: "job", importPdf });
    expect(client.getMessage).not.toHaveBeenCalled();
    expect(second).toMatchObject({ trigger: "job", status: "ok", messagesChecked: 0, items: [] });
    expect(await MailSyncRunModel.countDocuments()).toBe(2);
  });

  it("un adjunto que falló se reintenta y pasa a importado", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]);
    const importPdf = vi.fn<(input: ImportPdfInput) => Promise<ImportPdfOutcome>>()
      .mockRejectedValueOnce(new Error("Mongo se cayó"))
      .mockResolvedValueOnce(statementOutcome("imported", "stmt-1"));
    const first = await syncMail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(first.status).toBe("ok");
    expect(first.items).toMatchObject([{ outcome: "failed", detail: "Mongo se cayó" }]);
    const second = await syncMail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(second.items).toMatchObject([{ outcome: "imported", documentId: "stmt-1" }]);
    expect(client.getMessage).toHaveBeenCalledTimes(2);
    expect(await MailAttachmentModel.countDocuments()).toBe(1);
  });

  it("un adjunto de más de 15 MB queda omitido sin bajarlo", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "enorme.pdf", MAX_PDF_BYTES + 1)] }]);
    const importPdf = importByName({});
    const run = await syncMail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(run.items).toMatchObject([{ fileName: "enorme.pdf", outcome: "skipped", detail: "Supera el máximo de 15 MB" }]);
    expect(client.downloadPart).not.toHaveBeenCalled();
    expect(importPdf).not.toHaveBeenCalled();
  });

  it("un mail sin PDF queda registrado con partId «-» y no se relee", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [] }]);
    const run = await syncMail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}) });
    expect(run.items).toMatchObject([{ fileName: "(sin PDF adjunto)", outcome: "skipped", detail: "El mail no trae un PDF adjunto" }]);
    expect((await MailAttachmentModel.findOne())?.partId).toBe(NO_PDF_PART_ID);
    client.getMessage.mockClear();
    await syncMail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}) });
    expect(client.getMessage).not.toHaveBeenCalled();
  });

  it("un PDF con contraseña queda omitido con el motivo", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "protegido.pdf")] }]);
    const run = await syncMail({
      client, query: QUERY, trigger: "manual", importPdf: importByName({ "protegido.pdf": new EncryptedPdfError() }),
    });
    expect(run.items).toMatchObject([{ outcome: "skipped", detail: "El PDF está protegido con contraseña" }]);
  });

  it("un GmailAuthError al listar deja una corrida con error, guardada y sin lanzar", async () => {
    const client = fakeGmailClient([]);
    client.listMessageIds.mockRejectedValueOnce(new GmailAuthError("Gmail rechazó el refresh token (venció o fue revocado)."));
    const run = await syncMail({ client, query: QUERY, trigger: "job", importPdf: importByName({}) });
    expect(run).toMatchObject({
      status: "error", error: "Gmail rechazó el refresh token (venció o fue revocado).", messagesChecked: 0, items: [],
    });
    expect(await MailSyncRunModel.countDocuments()).toBe(1);
  });

  it("un error inesperado fuera de la importación también termina en corrida con error", async () => {
    const client = fakeGmailClient([]);
    client.listMessageIds.mockRejectedValueOnce(new Error("se rompió algo"));
    const run = await syncMail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}) });
    expect(run).toMatchObject({ status: "error", error: "se rompió algo" });
  });

  it("un error al leer un mail a mitad de camino conserva lo procesado antes", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf")] }]);
    client.listMessageIds.mockResolvedValueOnce(["msg-1", "msg-borrado"]);
    const importPdf = importByName({ "resumen-sintetico.pdf": statementOutcome("imported", "stmt-1") });
    const run = await syncMail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(run).toMatchObject({ status: "error", error: "Gmail respondió 404.", messagesChecked: 1 });
    expect(run.items).toMatchObject([{ fileName: "resumen-sintetico.pdf", outcome: "imported" }]);
  });

  it("si Gmail falla al bajar el segundo PDF de un mail, ese PDF queda fallido y la próxima corrida lo importa", async () => {
    const client = fakeGmailClient([
      { id: "msg-1", pdfParts: [pdfPart("1", "resumen-sintetico.pdf"), pdfPart("2", "cupon-sintetico.pdf")] },
    ]);
    client.downloadPart
      .mockResolvedValueOnce(fakePdfBytes("msg-1", "1"))
      .mockRejectedValueOnce(new GmailApiError("Gmail respondió 500."));
    const importPdf = importByName({
      "resumen-sintetico.pdf": statementOutcome("imported", "stmt-1"),
      "cupon-sintetico.pdf": statementOutcome("imported", "stmt-2"),
    });
    const first = await syncMail({ client, query: QUERY, trigger: "manual", importPdf, now: ticking() });
    expect(first).toMatchObject({ status: "error", error: "Gmail respondió 500." });
    expect(summaryOf(first.items)).toEqual([
      { fileName: "resumen-sintetico.pdf", outcome: "imported", kind: "statement", documentId: "stmt-1" },
      { fileName: "cupon-sintetico.pdf", outcome: "failed", kind: null, documentId: null },
    ]);
    const second = await syncMail({ client, query: QUERY, trigger: "manual", importPdf });
    expect(second.status).toBe("ok");
    expect(summaryOf(second.items)).toEqual([
      { fileName: "cupon-sintetico.pdf", outcome: "imported", kind: "statement", documentId: "stmt-2" },
    ]);
    expect(importPdf).toHaveBeenCalledTimes(2);
  });

  it("con maxMessages avisa que quedan mails y la próxima corrida sigue", async () => {
    const client = fakeGmailClient([
      { id: "msg-2", pdfParts: [pdfPart("1", "factura-a.pdf")] },
      { id: "msg-1", pdfParts: [pdfPart("1", "factura-b.pdf")] },
    ]);
    const first = await syncMail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}), maxMessages: 1 });
    expect(first).toMatchObject({ messagesChecked: 1, hasMore: true });
    expect(first.items.map(({ fileName }) => fileName)).toEqual(["factura-a.pdf"]);
    const second = await syncMail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}), maxMessages: 1 });
    expect(second).toMatchObject({ messagesChecked: 1, hasMore: false });
    expect(second.items.map(({ fileName }) => fileName)).toEqual(["factura-b.pdf"]);
  });
});

describe("findLastMailRun", () => {
  it("sin corridas devuelve null", async () => {
    expect(await findLastMailRun()).toBeNull();
  });

  it("devuelve la corrida más nueva con sus ítems", async () => {
    const client = fakeGmailClient([{ id: "msg-1", pdfParts: [pdfPart("1", "factura.pdf")] }]);
    const clock = ticking();
    await syncMail({ client, query: QUERY, trigger: "job", importPdf: importByName({}), now: clock });
    const latest = await syncMail({ client, query: QUERY, trigger: "manual", importPdf: importByName({}), now: clock });
    expect(await findLastMailRun()).toEqual(latest);
  });
});

describe("runMailSync", () => {
  const config: GmailConfig = {
    credentials: { clientId: "id-sintetico", clientSecret: "secreto-sintetico", refreshToken: "refresh-sintetico" },
    query: QUERY,
    intervalMinutes: null,
  };

  beforeEach(() => {
    vi.mocked(createGmailClient).mockReset();
    vi.mocked(createGmailClient).mockImplementation(() => fakeGmailClient([]));
  });

  it("une las llamadas concurrentes en una sola corrida", async () => {
    const manual = runMailSync(config, "manual");
    const job = runMailSync(config, "job");
    expect(job).toBe(manual);
    expect((await manual).trigger).toBe("manual");
    expect(createGmailClient).toHaveBeenCalledTimes(1);
    expect(createGmailClient).toHaveBeenCalledWith(config.credentials);
  });

  it("cuando termina, la próxima llamada arranca otra corrida", async () => {
    await runMailSync(config, "manual");
    await runMailSync(config, "manual");
    expect(createGmailClient).toHaveBeenCalledTimes(2);
    expect(await MailSyncRunModel.countDocuments()).toBe(2);
  });

  it("después de un rechazo, la próxima llamada arranca otra corrida", async () => {
    const create = vi.spyOn(MailSyncRunModel, "create").mockRejectedValueOnce(new Error("Mongo caído"));
    await expect(runMailSync(config, "manual")).rejects.toThrow("Mongo caído");
    create.mockRestore();
    const run = await runMailSync(config, "manual");
    expect(run.status).toBe("ok");
    expect(createGmailClient).toHaveBeenCalledTimes(2);
  });
});
