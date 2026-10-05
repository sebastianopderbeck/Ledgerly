import { describe, it, expect, vi, afterEach } from "vitest";
import { Readable } from "node:stream";
import type { FetchMessageObject, MessageStructureObject } from "imapflow";
import {
  collectImapPdfParts, createImapFlow, imapMessageId, newestFirst, openIcloudClient,
  type IcloudCandidate, type ImapSession,
} from "./icloudClient.js";
import { IcloudApiError, IcloudAuthError, ICLOUD_AUTH_FAILED_MESSAGE } from "./icloudErrors.js";

const SINCE = new Date(2026, 8, 1);
const USER = "usuario-sintetico@icloud.com";
const PASSWORD = "clave-app-sintetica";

interface FakeMailbox {
  uidValidity: bigint;
  messages: FetchMessageObject[];
}

const pdfNode = (part: string, filename: string, size = 2048): MessageStructureObject => ({
  part, type: "application/pdf", disposition: "attachment", dispositionParameters: { filename }, size,
});
const textNode = (part: string): MessageStructureObject => ({ part, type: "text/plain", size: 120 });
const multipart = (...childNodes: MessageStructureObject[]): MessageStructureObject => ({ type: "multipart/mixed", childNodes });

const message = (
  uid: number, receivedAt: string, bodyStructure: MessageStructureObject, messageId?: string,
): FetchMessageObject => ({ seq: uid, uid, internalDate: new Date(receivedAt), envelope: { messageId }, bodyStructure });

const fakeSession = (mailboxes: Record<string, FakeMailbox>) => {
  const state: { open: FakeMailbox | null } = { open: null };
  return {
    get mailbox(): false | { uidValidity: bigint } {
      return state.open ? { uidValidity: state.open.uidValidity } : false;
    },
    connect: vi.fn(async (): Promise<void> => undefined),
    getMailboxLock: vi.fn(async (path: string, _options: { readOnly: boolean }) => {
      const box = mailboxes[path];
      if (!box) throw new Error("Mailbox doesn't exist");
      state.open = box;
      return {
        release: () => {
          state.open = null;
        },
      };
    }),
    search: vi.fn(async (_query: { since: Date }, _options: { uid: true }): Promise<number[]> =>
      state.open?.messages.map(({ uid }) => uid) ?? []),
    fetchAll: vi.fn(async (range: number[]): Promise<FetchMessageObject[]> =>
      state.open?.messages.filter(({ uid }) => range.includes(uid)) ?? []),
    download: vi.fn(async (range: string, part: string): Promise<{ content?: Readable }> =>
      ({ content: Readable.from([Buffer.from(`pdf:${range}:${part}`)]) })),
    logout: vi.fn(async (): Promise<void> => undefined),
  } satisfies ImapSession;
};

type FakeSession = ReturnType<typeof fakeSession>;

interface OpenOptions {
  names?: string[];
  prepare?: (session: FakeSession) => void;
}

const open = (mailboxes: Record<string, FakeMailbox>, { names = Object.keys(mailboxes), prepare = () => {} }: OpenOptions = {}) => {
  const session = fakeSession(mailboxes);
  prepare(session);
  const createSession = vi.fn(() => session);
  const client = openIcloudClient({ user: USER, password: PASSWORD, mailboxes: names, since: SINCE, createSession });
  return { session, createSession, client };
};

const RESUMEN = message(
  11, "2026-09-30T13:00:00.000Z", multipart(textNode("1"), pdfNode("2", "Resumen6oct2026.pdf")), "<resumen@banco.example>",
);
const NEWSLETTER = message(12, "2026-10-01T09:00:00.000Z", multipart(textNode("1")), "<news@tienda.example>");
const CUPON = message(
  3, "2026-09-10T08:00:00.000Z", { type: "application/pdf", parameters: { name: "cupon.pdf" }, size: 2048 }, "<cupon@banco.example>",
);

describe("collectImapPdfParts", () => {
  it("encuentra los PDFs por tipo o por nombre, en cualquier nivel", () => {
    const structure = multipart(
      textNode("1"),
      pdfNode("2", "Resumen6oct2026.pdf", 51234),
      { part: "3", type: "application/octet-stream", parameters: { name: "CUPON.PDF" }, size: 900 },
      { part: "4", type: "image/png", dispositionParameters: { filename: "logo.png" }, size: 10 },
      { part: "5", type: "message/rfc822", childNodes: [textNode("5.1"), pdfNode("5.2", "reenviado.pdf")] },
    );
    expect(collectImapPdfParts(structure)).toEqual([
      { partId: "2", fileName: "Resumen6oct2026.pdf", size: 51234 },
      { partId: "3", fileName: "CUPON.PDF", size: 900 },
      { partId: "5.2", fileName: "reenviado.pdf", size: 2048 },
    ]);
  });

  it("si el mail entero es el PDF usa la parte 1", () => {
    expect(collectImapPdfParts({ type: "application/pdf", parameters: { name: "resumen.pdf" }, size: 10 }))
      .toEqual([{ partId: "1", fileName: "resumen.pdf", size: 10 }]);
  });

  it("un PDF sin nombre recibe uno por su parte", () => {
    expect(collectImapPdfParts(multipart({ part: "2", type: "APPLICATION/PDF" })))
      .toEqual([{ partId: "2", fileName: "adjunto-2.pdf", size: 0 }]);
  });
});

describe("imapMessageId", () => {
  it("usa el Message-ID sin los <>", () => {
    expect(imapMessageId("INBOX", 7n, 42, "<abc@banco.example>")).toBe("abc@banco.example");
  });

  it("sin Message-ID arma uno con carpeta, UIDVALIDITY y UID", () => {
    expect(imapMessageId("INBOX", 7n, 42, undefined)).toBe("INBOX/7/42");
    expect(imapMessageId("INBOX", 7n, 42, "  ")).toBe("INBOX/7/42");
  });
});

describe("newestFirst", () => {
  const candidate = (id: string, receivedAt: string, mailbox = "INBOX"): IcloudCandidate =>
    ({ id, mailbox, uid: 1, receivedAt, pdfParts: [] });

  it("ordena del más nuevo al más viejo, saca repetidos y corta en el límite", () => {
    const result = newestFirst([
      candidate("a", "2026-09-02T10:00:00.000Z"),
      candidate("b", "2026-09-30T10:00:00.000Z"),
      candidate("a", "2026-09-02T10:00:00.000Z", "Archivo"),
      candidate("c", "2026-09-15T10:00:00.000Z"),
    ], 2);
    expect(result.map(({ id }) => id)).toEqual(["b", "c"]);
  });

  it("de un repetido se queda con la primera carpeta", () => {
    const result = newestFirst([
      candidate("a", "2026-09-02T10:00:00.000Z", "INBOX"),
      candidate("a", "2026-09-02T10:00:00.000Z", "Archivo"),
    ], 10);
    expect(result.map(({ mailbox }) => mailbox)).toEqual(["INBOX"]);
  });
});

describe("openIcloudClient", () => {
  it("se conecta a iCloud por TLS con la cuenta y sin logs", async () => {
    const { createSession, session, client } = open({ INBOX: { uidValidity: 1n, messages: [] } });
    await client;
    expect(createSession).toHaveBeenCalledWith({
      host: "imap.mail.me.com", port: 993, secure: true, auth: { user: USER, pass: PASSWORD }, logger: false,
    });
    expect(session.connect).toHaveBeenCalledTimes(1);
  });

  it("lista solo los mails con PDF de todas las carpetas, del más nuevo al más viejo, en solo lectura", async () => {
    const { session, client } = open({
      INBOX: { uidValidity: 5n, messages: [RESUMEN, NEWSLETTER] },
      Bancos: { uidValidity: 9n, messages: [CUPON] },
    });
    expect(await (await client).listMessageIds(500)).toEqual(["resumen@banco.example", "cupon@banco.example"]);
    expect(session.getMailboxLock).toHaveBeenCalledWith("INBOX", { readOnly: true });
    expect(session.getMailboxLock).toHaveBeenCalledWith("Bancos", { readOnly: true });
    expect(session.search).toHaveBeenCalledWith({ since: SINCE }, { uid: true });
    expect(session.fetchAll).toHaveBeenCalledWith(
      [11, 12], { uid: true, envelope: true, internalDate: true, bodyStructure: true }, { uid: true },
    );
    expect(session.mailbox).toBe(false);
  });

  it("el mismo mail en dos carpetas cuenta una sola vez", async () => {
    const { client } = open({
      INBOX: { uidValidity: 5n, messages: [RESUMEN] },
      Archivo: { uidValidity: 6n, messages: [{ ...RESUMEN, uid: 99 }] },
    });
    expect(await (await client).listMessageIds(500)).toEqual(["resumen@banco.example"]);
  });

  it("getMessage devuelve las partes y downloadPart baja la parte por UID en su carpeta", async () => {
    const { session, client } = open({
      INBOX: { uidValidity: 5n, messages: [] },
      Bancos: { uidValidity: 9n, messages: [CUPON] },
    });
    const mail = await client;
    await mail.listMessageIds(500);
    const found = await mail.getMessage("cupon@banco.example");
    expect(found).toEqual({
      id: "cupon@banco.example", receivedAt: "2026-09-10T08:00:00.000Z",
      pdfParts: [{ partId: "1", fileName: "cupon.pdf", size: 2048, mailbox: "Bancos", uid: 3 }],
    });
    const bytes = await mail.downloadPart(found.id, found.pdfParts[0]);
    expect(new TextDecoder().decode(bytes)).toBe("pdf:3:1");
    expect(session.download).toHaveBeenCalledWith("3", "1", { uid: true });
    expect(session.getMailboxLock).toHaveBeenLastCalledWith("Bancos", { readOnly: true });
    expect(session.mailbox).toBe(false);
  });

  it("un mail desconocido o un adjunto vacío son errores de iCloud", async () => {
    const { session, client } = open({ INBOX: { uidValidity: 5n, messages: [RESUMEN] } });
    const mail = await client;
    await expect(mail.getMessage("otro@banco.example")).rejects.toBeInstanceOf(IcloudApiError);
    await mail.listMessageIds(500);
    const found = await mail.getMessage("resumen@banco.example");
    session.download.mockResolvedValueOnce({});
    await expect(mail.downloadPart(found.id, found.pdfParts[0])).rejects.toThrow("iCloud no devolvió el adjunto Resumen6oct2026.pdf.");
  });

  it("un login rechazado es IcloudAuthError con los pasos", async () => {
    const failure = Object.assign(new Error("Authentication failed"), { authenticationFailed: true });
    const { client } = open({}, { prepare: (session) => session.connect.mockRejectedValueOnce(failure) });
    const error = await client.catch((err: unknown) => err);
    expect(error).toBeInstanceOf(IcloudAuthError);
    expect((error as Error).message).toBe(ICLOUD_AUTH_FAILED_MESSAGE);
  });

  it("un corte al conectar es IcloudApiError con el motivo", async () => {
    const { client } = open({}, {
      prepare: (session) => session.connect.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND imap.mail.me.com")),
    });
    await expect(client).rejects.toThrow("No se pudo conectar con iCloud: getaddrinfo ENOTFOUND imap.mail.me.com");
  });

  it("una carpeta que no existe es IcloudApiError con su nombre", async () => {
    const { client } = open({ INBOX: { uidValidity: 5n, messages: [] } }, { names: ["INBOX", "Bancos"] });
    await expect((await client).listMessageIds(500))
      .rejects.toThrow("No pude abrir la carpeta «Bancos» de iCloud: Mailbox doesn't exist");
  });

  it("un error al buscar nombra la carpeta y libera el lock", async () => {
    const { session, client } = open({ INBOX: { uidValidity: 5n, messages: [] } }, {
      prepare: (fake) => fake.search.mockRejectedValueOnce(new Error("Connection closed")),
    });
    await expect((await client).listMessageIds(500)).rejects.toThrow("iCloud falló al revisar «INBOX»: Connection closed");
    expect(session.mailbox).toBe(false);
  });

  it("close hace logout y no propaga sus errores", async () => {
    const { session, client } = open({}, {
      prepare: (fake) => fake.logout.mockRejectedValueOnce(new Error("ya estaba cerrada")),
    });
    await expect((await client).close()).resolves.toBeUndefined();
    expect(session.logout).toHaveBeenCalledTimes(1);
  });
});

describe("createImapFlow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registra un listener de error para que un corte no tire el proceso", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const flow = createImapFlow({ host: "127.0.0.1", port: 1, secure: true, auth: { user: "u", pass: "p" }, logger: false });
    expect(flow.listenerCount("error")).toBe(1);
    expect(() => flow.emit("error", new Error("socket colgado"))).not.toThrow();
    expect(logged).toHaveBeenCalledWith("iCloud (IMAP): socket colgado");
  });
});
