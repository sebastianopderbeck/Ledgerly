import type { GmailCredentials } from "./gmailConfig.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const LIST_PAGE_SIZE = 100;
const TOKEN_RENEW_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_TTL_SECONDS = 3600;
const ROOT_PART_ID = "0";
const PDF_FILE_NAME = /\.pdf$/i;

const INVALID_GRANT_MESSAGE =
  "Gmail rechazó el refresh token (venció o fue revocado). Volvé a correr bun run gmail:auth y reiniciá el server.";
const INVALID_CLIENT_MESSAGE = "Gmail rechazó GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET. Revisalos en el .env.";
const FORBIDDEN_MESSAGE =
  "Gmail respondió 403: revisá que la Gmail API esté habilitada en tu proyecto de Google Cloud.";
const NO_ACCESS_TOKEN_MESSAGE = "Gmail no devolvió un access token.";
const NO_CONTENT_MESSAGE = "El adjunto no tiene contenido para bajar.";

export interface GmailMessagePart {
  partId?: string;
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
}

export interface GmailPdfPart {
  partId: string;
  fileName: string;
  size: number;
  attachmentId: string | null;
  inlineData: string | null;
}

export interface GmailMessage {
  id: string;
  receivedAt: string;
  pdfParts: GmailPdfPart[];
}

export interface GmailClient {
  listMessageIds(query: string, limit: number): Promise<string[]>;
  getMessage(id: string): Promise<GmailMessage>;
  downloadPart(messageId: string, part: GmailPdfPart): Promise<Uint8Array>;
}

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

export class GmailApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailApiError";
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface ListResponse {
  messages?: { id: string }[];
  nextPageToken?: string;
}

interface MessageResponse {
  id?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

interface AttachmentResponse {
  data?: string;
}

const isPdfPart = ({ filename, mimeType }: GmailMessagePart): boolean =>
  PDF_FILE_NAME.test(filename ?? "") || mimeType === "application/pdf";

const hasContent = ({ body }: GmailMessagePart): boolean => Boolean(body?.attachmentId || body?.data);

const toPdfPart = ({ partId, filename, body }: GmailMessagePart): GmailPdfPart => {
  const id = partId || ROOT_PART_ID;
  return {
    partId: id,
    fileName: filename?.trim() || `adjunto-${id}.pdf`,
    size: body?.size ?? 0,
    attachmentId: body?.attachmentId ?? null,
    inlineData: body?.data ?? null,
  };
};

export function collectPdfParts(payload: GmailMessagePart): GmailPdfPart[] {
  const own = isPdfPart(payload) && hasContent(payload) ? [toPdfPart(payload)] : [];
  return [...own, ...(payload.parts ?? []).flatMap(collectPdfParts)];
}

const errorCodeOf = async (response: Response): Promise<string | null> => {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : null;
};

const tokenError = async (response: Response): Promise<Error> => {
  const code = await errorCodeOf(response);
  if (code === "invalid_grant") return new GmailAuthError(INVALID_GRANT_MESSAGE);
  if (code === "invalid_client" || code === "unauthorized_client" || response.status === 401) {
    return new GmailAuthError(INVALID_CLIENT_MESSAGE);
  }
  return new GmailApiError(`Gmail respondió ${response.status}.`);
};

const apiError = ({ status }: Response): GmailApiError =>
  new GmailApiError(status === 403 ? FORBIDDEN_MESSAGE : `Gmail respondió ${status}.`);

const send = async (url: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new GmailApiError(`No se pudo conectar con Gmail: ${err instanceof Error ? err.message : String(err)}`);
  }
};

const decodeBase64Url = (data: string): Uint8Array => new Uint8Array(Buffer.from(data, "base64url"));

const receivedAtOf = (internalDate: string | undefined): string => {
  const millis = Number(internalDate);
  return internalDate && Number.isFinite(millis) ? new Date(millis).toISOString() : new Date().toISOString();
};

const listPath = (query: string, pageToken: string | undefined): string => {
  const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
  return `/messages?q=${encodeURIComponent(query)}&maxResults=${LIST_PAGE_SIZE}${page}`;
};

const authorized = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });

export function createGmailClient({ clientId, clientSecret, refreshToken }: GmailCredentials): GmailClient {
  let accessToken: string | null = null;
  let renewAt = 0;

  const requestToken = async (): Promise<string> => {
    const response = await send(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw await tokenError(response);
    const { access_token: token, expires_in: ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS } = (await response.json()) as TokenResponse;
    if (!token) throw new GmailApiError(NO_ACCESS_TOKEN_MESSAGE);
    accessToken = token;
    renewAt = Date.now() + ttlSeconds * 1000 - TOKEN_RENEW_MARGIN_MS;
    return token;
  };

  const validToken = async (): Promise<string> =>
    (accessToken && Date.now() < renewAt ? accessToken : requestToken());

  const get = async <T>(path: string): Promise<T> => {
    const url = `${GMAIL_API_URL}${path}`;
    const first = await send(url, authorized(await validToken()));
    const response = first.status === 401 ? await send(url, authorized(await requestToken())) : first;
    if (!response.ok) throw apiError(response);
    return (await response.json()) as T;
  };

  return {
    async listMessageIds(query, limit) {
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const page = await get<ListResponse>(listPath(query, pageToken));
        ids.push(...(page.messages ?? []).map(({ id }) => id));
        pageToken = page.nextPageToken;
      } while (pageToken && ids.length < limit);
      return ids.slice(0, limit);
    },

    async getMessage(id) {
      const message = await get<MessageResponse>(`/messages/${encodeURIComponent(id)}?format=full`);
      return {
        id: message.id ?? id,
        receivedAt: receivedAtOf(message.internalDate),
        pdfParts: message.payload ? collectPdfParts(message.payload) : [],
      };
    },

    async downloadPart(messageId, part) {
      if (part.inlineData) return decodeBase64Url(part.inlineData);
      if (!part.attachmentId) throw new GmailApiError(NO_CONTENT_MESSAGE);
      const path = `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.attachmentId)}`;
      const attachment = await get<AttachmentResponse>(path);
      return decodeBase64Url(attachment.data ?? "");
    },
  };
}
