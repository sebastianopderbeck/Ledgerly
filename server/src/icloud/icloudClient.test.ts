import { describe, it, expect, vi, afterEach } from "vitest";
import { Readable } from "node:stream";
import type { FetchMessageObject, MessageStructureObject } from "imapflow";
import {
  collectImapPdfParts, createImapFlow, imapMessageId, newestFirst, openIcloudClient,
  type IcloudCandidate, type ImapSession,
} from "./icloudClient.js";
import { isCertisendSender } from "./certisend.js";
import { IcloudApiError, IcloudAuthError, ICLOUD_AUTH_FAILED_MESSAGE } from "./icloudErrors.js";

const SINCE = new Date(2026, 8, 1);
const USER = "usuario-sintetico@icloud.com";
const PASSWORD = "clave-app-sintetica";

interface FakeMailbox {
  uidValidity: bigint;
  messages: FetchMessageObject[];
  html?: Record<number, string>;
}

const pdfNode = (part: string, filename: string, size = 2048): MessageStructureObject => ({
  part, type: "application/pdf", disposition: "attachment", dispositionParameters: { filename }, size,
});
const htmlNode = (part: string): MessageStructureObject => ({ part, type: "text/html", size: 900 });
const textNode = (part: string): MessageStructureObject => ({ part, type: "text/plain", size: 120 });
const multipart = (...childNodes: MessageStructureObject[]): MessageStructureObject => ({ type: "multipart/mixed", childNodes });

const message = (
  uid: number, receivedAt: string, bodyStructure: MessageStructureObject, messageId?: string,
  fromAddress?: string,
): FetchMessageObject => ({
  seq: uid,
  uid,
  internalDate: new Date(receivedAt),
  envelope: { messageId, ...(fromAddress ? { from: [{ address: fromAddress }] } : {}) },
  bodyStructure,
});

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
    download: vi.fn(async (range: string, part: string): Promise<{ content?: Readable }> => {
      const html = state.open?.html?.[Number(range)];
      const text = html !== undefined && part === "1" ? html : `pdf:${range}:${part}`;
      return { content: Readable.from([Buffer.from(text)]) };
    }),
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
const COUPON_ID = "0a1b2c3d-1111-4222-8333-444455556666";
const SECOND_COUPON_ID = "ffffffff-aaaa-4bbb-8ccc-000000000001";
const COUPON_LINK_HTML = `<a href="https://go.certisend.com/AbC123/xYz789">x</a><a href="https://go.certisend.com/coupon/${COUPON_ID}">cupón</a>`;
const PLAN_AUTO = message(
  21, "2026-10-02T07:00:00.000Z", multipart(htmlNode("1")), "<plan-auto@banco.example>", "cuotas@enviocertificado.com",
);
const LINK_AJENO = message(
  23, "2026-10-04T07:00:00.000Z", multipart(htmlNode("1")), "<ajeno@tienda.example>", "promo@tienda.example",
);
const PLAN_AUTO_CON_PDF = message(
  22, "2026-10-03T07:00:00.000Z", multipart(htmlNode("1"), pdfNode("2", "adjunto.pdf")), "<plan-auto-pdf@banco.example>", "cuotas@enviocertificado.com",
);
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

describe("isCertisendSender", () => {
  it("acepta solo el dominio exacto, sin importar mayúsculas", () => {
    expect(isCertisendSender("cuotas@enviocertificado.com")).toBe(true);
    expect(isCertisendSender("Cuotas@EnvioCertificado.COM")).toBe(true);
  });

  it("rechaza dominios parecidos y valores vacíos", () => {
    expect(isCertisendSender("x@evil-enviocertificado.com")).toBe(false);
    expect(isCertisendSender("x@enviocertificado.com.evil")).toBe(false);
    expect(isCertisendSender("x@sub.enviocertificado.com")).toBe(false);
    expect(isCertisendSender("enviocertificado.com")).toBe(false);
    expect(isCertisendSender(undefined)).toBe(false);
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

  it("un mail con solo el link de un cupón de certisend se lista con una parte certisend", async () => {
    const { session, client } = open({
      INBOX: { uidValidity: 5n, messages: [NEWSLETTER] },
      Auto: { uidValidity: 8n, messages: [PLAN_AUTO], html: { 21: COUPON_LINK_HTML } },
    });
    const mail = await client;
    expect(await mail.listMessageIds(500)).toEqual(["plan-auto@banco.example"]);
    expect(session.search).toHaveBeenCalledTimes(2);
    expect((await mail.getMessage("plan-auto@banco.example")).pdfParts).toEqual([{
      kind: "certisend", couponId: COUPON_ID, partId: `certisend:${COUPON_ID}`, fileName: "certisend-0a1b2c3d.pdf", size: 0,
    }]);
    expect(session.mailbox).toBe(false);
  });

  it("un mail de otro remitente con un link de cupón no genera parte ni se descarga", async () => {
    const { session, client } = open({
      Auto: { uidValidity: 8n, messages: [LINK_AJENO], html: { 23: COUPON_LINK_HTML } },
    });
    expect(await (await client).listMessageIds(500)).toEqual([]);
    expect(session.download).not.toHaveBeenCalled();
  });

  it("un mail con adjunto y link devuelve las dos partes, y un link repetido cuenta una vez", async () => {
    const { client } = open({
      Auto: {
        uidValidity: 8n,
        messages: [PLAN_AUTO_CON_PDF],
        html: { 22: `${COUPON_LINK_HTML}${COUPON_LINK_HTML}https://go.certisend.com/coupon/${SECOND_COUPON_ID}` },
      },
    });
    const mail = await client;
    await mail.listMessageIds(500);
    const { pdfParts } = await mail.getMessage("plan-auto-pdf@banco.example");
    expect(pdfParts.map((part) => part.kind)).toEqual(["attachment", "certisend", "certisend"]);
    expect(pdfParts[0]).toEqual({ kind: "attachment", partId: "2", fileName: "adjunto.pdf", size: 2048, mailbox: "Auto", uid: 22 });
  });

  it("las partes certisend se descargan con el fetch inyectado y sin abrir la carpeta", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const pageHtml = `<a href="https://html2pdf.certisend.com/convert/?key=k&amp;url=https://go.certisend.com/coupon_print/${COUPON_ID}">PDF</a>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(pageHtml, { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response(pdf, { status: 200, headers: { "content-type": "application/pdf" } }));
    const session = fakeSession({ Auto: { uidValidity: 8n, messages: [PLAN_AUTO], html: { 21: COUPON_LINK_HTML } } });
    const mail = await openIcloudClient({
      user: USER, password: PASSWORD, mailboxes: ["Auto"], since: SINCE, createSession: () => session, certisend: { fetch: fetchMock },
    });
    await mail.listMessageIds(500);
    const found = await mail.getMessage("plan-auto@banco.example");
    session.getMailboxLock.mockClear();
    session.download.mockClear();
    const bytes = await mail.downloadPart(found.id, found.pdfParts[0]);
    expect(Array.from(bytes)).toEqual(Array.from(pdf));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.getMailboxLock).not.toHaveBeenCalled();
    expect(session.download).not.toHaveBeenCalled();
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
      pdfParts: [{ kind: "attachment", partId: "1", fileName: "cupon.pdf", size: 2048, mailbox: "Bancos", uid: 3 }],
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
