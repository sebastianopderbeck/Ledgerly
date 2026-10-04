import { describe, it, expect, vi, afterEach } from "vitest";
import {
  collectPdfParts, createGmailClient, GmailApiError, GmailAuthError, type GmailMessagePart,
} from "./gmailClient.js";

const credentials = { clientId: "id-sintetico", clientSecret: "secreto-sintetico", refreshToken: "refresh-sintetico" };
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokenOk = (expiresIn = 3599) => json({ access_token: "access-sintetico", expires_in: expiresIn, token_type: "Bearer" });
const isToken = (url: string) => url === "https://oauth2.googleapis.com/token";

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

const stubFetch = (route: Route) => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => route(String(url), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const tokenCalls = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.filter(([url]) => isToken(url));
const apiCalls = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls.filter(([url]) => !isToken(url));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("createGmailClient: token", () => {
  it("pide el access token una sola vez con el refresh token y lo reutiliza", async () => {
    const fetchMock = stubFetch((url) => (isToken(url) ? tokenOk() : json({ messages: [{ id: "msg-1" }] })));
    const client = createGmailClient(credentials);
    await client.listMessageIds("has:attachment", 10);
    await client.listMessageIds("has:attachment", 10);
    expect(tokenCalls(fetchMock)).toHaveLength(1);
    const [, tokenInit] = tokenCalls(fetchMock)[0];
    expect(tokenInit?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(tokenInit?.body)))).toEqual({
      client_id: "id-sintetico", client_secret: "secreto-sintetico", refresh_token: "refresh-sintetico", grant_type: "refresh_token",
    });
    const [, apiInit] = apiCalls(fetchMock)[0];
    expect(apiInit?.headers).toEqual({ Authorization: "Bearer access-sintetico" });
  });

  it("renueva el token 60 s antes de que venza", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"));
    const fetchMock = stubFetch((url) => (isToken(url) ? tokenOk(120) : json({ messages: [] })));
    const client = createGmailClient(credentials);
    await client.listMessageIds("q", 10);
    vi.setSystemTime(new Date("2026-10-03T12:00:59.000Z"));
    await client.listMessageIds("q", 10);
    expect(tokenCalls(fetchMock)).toHaveLength(1);
    vi.setSystemTime(new Date("2026-10-03T12:01:01.000Z"));
    await client.listMessageIds("q", 10);
    expect(tokenCalls(fetchMock)).toHaveLength(2);
  });

  it("invalid_grant es GmailAuthError y el mensaje no trae ni el refresh token ni el secreto", async () => {
    stubFetch((url) => (isToken(url)
      ? json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400)
      : json({})));
    const error = await createGmailClient(credentials).listMessageIds("q", 1).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(GmailAuthError);
    const message = (error as Error).message;
    expect(message).toContain("bun run gmail:auth");
    expect(message).not.toContain("refresh-sintetico");
    expect(message).not.toContain("secreto-sintetico");
    expect(message).not.toContain("expired or revoked");
  });

  it("invalid_client es GmailAuthError que apunta al .env", async () => {
    stubFetch((url) => (isToken(url) ? json({ error: "invalid_client" }, 401) : json({})));
    await expect(createGmailClient(credentials).listMessageIds("q", 1))
      .rejects.toThrow(new GmailAuthError("Gmail rechazó GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET. Revisalos en el .env."));
  });
});

describe("createGmailClient: API", () => {
  it("listMessageIds pagina con nextPageToken y manda la consulta url-encodeada", async () => {
    const fetchMock = stubFetch((url) => {
      if (isToken(url)) return tokenOk();
      return url.includes("pageToken=p2")
        ? json({ messages: [{ id: "msg-3" }] })
        : json({ messages: [{ id: "msg-1" }, { id: "msg-2" }], nextPageToken: "p2" });
    });
    const ids = await createGmailClient(credentials).listMessageIds("has:attachment filename:pdf", 10);
    expect(ids).toEqual(["msg-1", "msg-2", "msg-3"]);
    expect(apiCalls(fetchMock).map(([url]) => url)).toEqual([
      `${API}/messages?q=has%3Aattachment%20filename%3Apdf&maxResults=100`,
      `${API}/messages?q=has%3Aattachment%20filename%3Apdf&maxResults=100&pageToken=p2`,
    ]);
  });

  it("listMessageIds corta en el límite", async () => {
    let page = 0;
    const fetchMock = stubFetch((url) => {
      if (isToken(url)) return tokenOk();
      page += 1;
      return json({ messages: [{ id: `msg-${page}-a` }, { id: `msg-${page}-b` }], nextPageToken: `p${page + 1}` });
    });
    const ids = await createGmailClient(credentials).listMessageIds("q", 3);
    expect(ids).toEqual(["msg-1-a", "msg-1-b", "msg-2-a"]);
    expect(apiCalls(fetchMock)).toHaveLength(2);
  });

  it("getMessage mapea internalDate y las partes PDF", async () => {
    const fetchMock = stubFetch((url) => (isToken(url) ? tokenOk() : json({
      id: "msg-1",
      internalDate: "1759500000000",
      payload: {
        partId: "", mimeType: "multipart/mixed",
        parts: [
          { partId: "0", mimeType: "text/plain", filename: "", body: { size: 4, data: "aG9sYQ" } },
          { partId: "1", mimeType: "application/pdf", filename: "resumen-sintetico.pdf", body: { attachmentId: "att-1", size: 2048 } },
        ],
      },
    })));
    expect(await createGmailClient(credentials).getMessage("msg-1")).toEqual({
      id: "msg-1",
      receivedAt: new Date(1759500000000).toISOString(),
      pdfParts: [{ partId: "1", fileName: "resumen-sintetico.pdf", size: 2048, attachmentId: "att-1", inlineData: null }],
    });
    expect(apiCalls(fetchMock)[0][0]).toBe(`${API}/messages/msg-1?format=full`);
  });

  it("downloadPart baja el adjunto y decodifica base64url", async () => {
    const fetchMock = stubFetch((url) => (isToken(url) ? tokenOk() : json({ size: 3, data: "-_-_" })));
    const part = { partId: "1", fileName: "a.pdf", size: 3, attachmentId: "att-1", inlineData: null };
    const bytes = await createGmailClient(credentials).downloadPart("msg-1", part);
    expect(Array.from(bytes)).toEqual([0xfb, 0xff, 0xbf]);
    expect(apiCalls(fetchMock)[0][0]).toBe(`${API}/messages/msg-1/attachments/att-1`);
  });

  it("downloadPart usa inlineData sin pedir nada", async () => {
    const fetchMock = stubFetch(() => json({}));
    const part = { partId: "1", fileName: "a.pdf", size: 3, attachmentId: null, inlineData: "-_-_" };
    const bytes = await createGmailClient(credentials).downloadPart("msg-1", part);
    expect(Array.from(bytes)).toEqual([0xfb, 0xff, 0xbf]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un 401 de la API renueva el token y reintenta una vez", async () => {
    let apiHits = 0;
    const fetchMock = stubFetch((url) => {
      if (isToken(url)) return tokenOk();
      apiHits += 1;
      return apiHits === 1 ? json({ error: { code: 401 } }, 401) : json({ messages: [{ id: "msg-1" }] });
    });
    expect(await createGmailClient(credentials).listMessageIds("q", 10)).toEqual(["msg-1"]);
    expect(tokenCalls(fetchMock)).toHaveLength(2);
    expect(apiCalls(fetchMock)).toHaveLength(2);
  });

  it("un 403 es GmailApiError que sugiere habilitar la Gmail API", async () => {
    stubFetch((url) => (isToken(url) ? tokenOk() : json({ error: { code: 403, message: "detalle de Google" } }, 403)));
    await expect(createGmailClient(credentials).listMessageIds("q", 1)).rejects.toThrow(new GmailApiError(
      "Gmail respondió 403: revisá que la Gmail API esté habilitada en tu proyecto de Google Cloud.",
    ));
  });

  it("otro error HTTP es GmailApiError con el status", async () => {
    stubFetch((url) => (isToken(url) ? tokenOk() : json({ error: { code: 500 } }, 500)));
    await expect(createGmailClient(credentials).getMessage("msg-1")).rejects.toThrow(new GmailApiError("Gmail respondió 500."));
  });

  it("una falla de red es GmailApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(createGmailClient(credentials).listMessageIds("q", 1))
      .rejects.toThrow(new GmailApiError("No se pudo conectar con Gmail: fetch failed"));
  });
});

describe("collectPdfParts", () => {
  it("encuentra PDFs en multipart anidado e ignora texto e imágenes", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "multipart/mixed",
      parts: [
        {
          partId: "0", mimeType: "multipart/alternative",
          parts: [
            { partId: "0.0", mimeType: "text/plain", filename: "", body: { size: 5, data: "aG9sYQ" } },
            { partId: "0.1", mimeType: "text/html", filename: "", body: { size: 5, data: "aG9sYQ" } },
          ],
        },
        {
          partId: "1", mimeType: "multipart/mixed",
          parts: [
            { partId: "1.0", mimeType: "application/pdf", filename: "a.pdf", body: { attachmentId: "att-a", size: 10 } },
            { partId: "1.1", mimeType: "image/png", filename: "logo.png", body: { attachmentId: "att-logo", size: 3 } },
          ],
        },
      ],
    };
    expect(collectPdfParts(payload)).toEqual([
      { partId: "1.0", fileName: "a.pdf", size: 10, attachmentId: "att-a", inlineData: null },
    ]);
  });

  it("acepta application/octet-stream con extensión .PDF", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "multipart/mixed",
      parts: [{ partId: "2", mimeType: "application/octet-stream", filename: "RESUMEN.PDF", body: { attachmentId: "att-2", size: 5 } }],
    };
    expect(collectPdfParts(payload).map(({ fileName }) => fileName)).toEqual(["RESUMEN.PDF"]);
  });

  it("nombra adjunto-<partId>.pdf a un PDF sin filename y conserva los datos inline", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "multipart/mixed",
      parts: [{ partId: "3", mimeType: "application/pdf", filename: "", body: { data: "JVBERi0", size: 5 } }],
    };
    expect(collectPdfParts(payload)).toEqual([
      { partId: "3", fileName: "adjunto-3.pdf", size: 5, attachmentId: null, inlineData: "JVBERi0" },
    ]);
  });

  it("ignora una parte PDF sin contenido", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "multipart/mixed",
      parts: [{ partId: "4", mimeType: "application/pdf", filename: "vacio.pdf", body: { size: 0 } }],
    };
    expect(collectPdfParts(payload)).toEqual([]);
  });

  it("detecta un mail cuyo cuerpo entero es el PDF y le da partId 0", () => {
    const payload: GmailMessagePart = {
      partId: "", mimeType: "application/pdf", filename: "resumen.pdf", body: { attachmentId: "att-root", size: 7 },
    };
    expect(collectPdfParts(payload)).toEqual([
      { partId: "0", fileName: "resumen.pdf", size: 7, attachmentId: "att-root", inlineData: null },
    ]);
  });
});
