import type { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import {
  ImapFlow, type FetchMessageObject, type FetchQueryObject, type ImapFlowOptions, type MessageStructureObject,
} from "imapflow";
import type { MailClient, MailPdfPart } from "../mail/mailClient.js";
import { fetchCertisendCouponPdf, extractCertisendCouponIds, type CertisendDeps } from "./certisend.js";
import { ICLOUD_HOST, ICLOUD_PORT } from "./icloudConfig.js";
import { IcloudApiError, IcloudAuthError, ICLOUD_AUTH_FAILED_MESSAGE } from "./icloudErrors.js";

export interface IcloudAttachmentPart extends MailPdfPart {
  kind: "attachment";
  mailbox: string;
  uid: number;
}

export interface IcloudCertisendPart extends MailPdfPart {
  kind: "certisend";
  couponId: string;
}

export type IcloudPdfPart = IcloudAttachmentPart | IcloudCertisendPart;

export interface IcloudCandidate {
  id: string;
  mailbox: string;
  uid: number;
  receivedAt: string;
  pdfParts: IcloudPdfPart[];
}

export interface ImapSession {
  readonly mailbox: false | { uidValidity: bigint };
  connect(): Promise<void>;
  getMailboxLock(path: string, options: { readOnly: boolean }): Promise<{ release(): void }>;
  search(query: { since: Date; body?: string }, options: { uid: true }): Promise<number[] | false | undefined>;
  fetchAll(range: number[], query: FetchQueryObject, options: { uid: true }): Promise<FetchMessageObject[]>;
  download(range: string, part: string, options: { uid: true }): Promise<{ content?: Readable }>;
  logout(): Promise<void>;
}

export interface IcloudClientOptions {
  user: string;
  password: string;
  mailboxes: string[];
  since: Date;
  createSession?: (options: ImapFlowOptions) => ImapSession;
  certisend?: CertisendDeps;
}

const ROOT_PART_ID = "1";
const PDF_MIME = "application/pdf";
const PDF_FILE_NAME = /\.pdf$/i;
const UNEXPECTED_ERROR = "Error inesperado";
const HTML_MIME = "text/html";
const COUPON_BODY_QUERY = "go.certisend.com/coupon/";
const FETCH_QUERY: FetchQueryObject = { uid: true, envelope: true, internalDate: true, bodyStructure: true };

const messageOf = (err: unknown): string => (err instanceof Error && err.message ? err.message : UNEXPECTED_ERROR);

const isAuthFailure = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { authenticationFailed?: unknown }).authenticationFailed === true;

const fileNameOf = ({ dispositionParameters, parameters }: MessageStructureObject): string =>
  (dispositionParameters?.filename ?? parameters?.name ?? "").trim();

const isPdfLeaf = (node: MessageStructureObject): boolean =>
  !node.childNodes?.length && (node.type.toLowerCase() === PDF_MIME || PDF_FILE_NAME.test(fileNameOf(node)));

export function collectImapPdfParts(node: MessageStructureObject): MailPdfPart[] {
  const partId = node.part ?? ROOT_PART_ID;
  const own = isPdfLeaf(node)
    ? [{ partId, fileName: fileNameOf(node) || `adjunto-${partId}.pdf`, size: node.size ?? 0 }]
    : [];
  return [...own, ...(node.childNodes ?? []).flatMap(collectImapPdfParts)];
}

export function imapMessageId(mailbox: string, uidValidity: bigint, uid: number, headerId: string | undefined): string {
  const fromHeader = headerId?.trim().replace(/^<|>$/g, "") ?? "";
  return fromHeader || `${mailbox}/${uidValidity}/${uid}`;
}

const toIso = (value: Date | string | undefined): string => {
  const date = new Date(value ?? Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const isHtmlLeaf = (node: MessageStructureObject): boolean =>
  !node.childNodes?.length && node.type.toLowerCase() === HTML_MIME;

export function collectImapHtmlPartIds(node: MessageStructureObject): string[] {
  const own = isHtmlLeaf(node) ? [node.part ?? ROOT_PART_ID] : [];
  return [...own, ...(node.childNodes ?? []).flatMap(collectImapHtmlPartIds)];
}

const certisendPart = (couponId: string): IcloudCertisendPart => ({
  kind: "certisend",
  couponId,
  partId: `certisend:${couponId}`,
  fileName: `certisend-${couponId.slice(0, 8)}.pdf`,
  size: 0,
});

const toCandidate = (
  mailbox: string, uidValidity: bigint, message: FetchMessageObject, couponIds: string[] = [],
): IcloudCandidate | null => {
  if (!message.bodyStructure) return null;
  const attachments = collectImapPdfParts(message.bodyStructure)
    .map((part): IcloudPdfPart => ({ ...part, kind: "attachment", mailbox, uid: message.uid }));
  const pdfParts = [...attachments, ...couponIds.map(certisendPart)];
  if (pdfParts.length === 0) return null;
  return {
    id: imapMessageId(mailbox, uidValidity, message.uid, message.envelope?.messageId),
    mailbox,
    uid: message.uid,
    receivedAt: toIso(message.internalDate),
    pdfParts,
  };
};

const isCandidate = (candidate: IcloudCandidate | null): candidate is IcloudCandidate => candidate !== null;

export function newestFirst(candidates: IcloudCandidate[], limit: number): IcloudCandidate[] {
  const unique = new Map<string, IcloudCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.id)) unique.set(candidate.id, candidate);
  }
  return [...unique.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, limit);
}

export function createImapFlow(options: ImapFlowOptions): ImapFlow {
  const flow = new ImapFlow(options);
  flow.on("error", (err: Error) => {
    console.error(`iCloud (IMAP): ${err.message}`);
  });
  return flow;
}

export function createImapSession(options: ImapFlowOptions): ImapSession {
  const flow = createImapFlow(options);
  return {
    get mailbox(): false | { uidValidity: bigint } {
      return flow.mailbox;
    },
    connect: () => flow.connect(),
    getMailboxLock: (path, lockOptions) => flow.getMailboxLock(path, lockOptions),
    search: (query, searchOptions) => flow.search(query, searchOptions),
    fetchAll: (range, query, fetchOptions) => flow.fetchAll(range, query, fetchOptions),
    download: (range, part, downloadOptions) => flow.download(range, part, downloadOptions),
    logout: () => flow.logout(),
  };
}

const connectError = (err: unknown): Error =>
  (isAuthFailure(err)
    ? new IcloudAuthError(ICLOUD_AUTH_FAILED_MESSAGE)
    : new IcloudApiError(`No se pudo conectar con iCloud: ${messageOf(err)}`));

export async function openIcloudClient({
  user, password, mailboxes, since, createSession = createImapSession, certisend,
}: IcloudClientOptions): Promise<MailClient<IcloudPdfPart>> {
  const session = createSession({ host: ICLOUD_HOST, port: ICLOUD_PORT, secure: true, auth: { user, pass: password }, logger: false });
  await session.connect().catch((err: unknown) => {
    throw connectError(err);
  });
  const known = new Map<string, IcloudCandidate>();

  const inMailbox = async <T>(mailbox: string, work: (uidValidity: bigint) => Promise<T>): Promise<T> => {
    const lock = await session.getMailboxLock(mailbox, { readOnly: true }).catch((err: unknown) => {
      throw new IcloudApiError(`No pude abrir la carpeta «${mailbox}» de iCloud: ${messageOf(err)}`);
    });
    try {
      return await work(session.mailbox ? session.mailbox.uidValidity : 0n);
    } finally {
      lock.release();
    }
  };

  const htmlOf = async (uid: number, partId: string): Promise<string> => {
    const { content } = await session.download(String(uid), partId, { uid: true });
    return content ? (await buffer(content)).toString("utf8") : "";
  };

  const couponIdsOf = async ({ uid, bodyStructure }: FetchMessageObject): Promise<string[]> => {
    const ids: string[] = [];
    for (const partId of bodyStructure ? collectImapHtmlPartIds(bodyStructure) : []) {
      ids.push(...extractCertisendCouponIds(await htmlOf(uid, partId)));
    }
    return [...new Set(ids)];
  };

  const scan = (mailbox: string): Promise<IcloudCandidate[]> => inMailbox(mailbox, async (uidValidity) => {
    try {
      const uids = await session.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return [];
      const fetched = await session.fetchAll(uids, FETCH_QUERY, { uid: true });
      const withLinks = (await session.search({ since, body: COUPON_BODY_QUERY }, { uid: true })) || [];
      const fetchedUids = new Set(fetched.map(({ uid }) => uid));
      const missing = withLinks.filter((uid) => !fetchedUids.has(uid));
      const extra = missing.length > 0 ? await session.fetchAll(missing, FETCH_QUERY, { uid: true }) : [];
      const messages = [...fetched, ...extra];
      const linked = new Set(withLinks);
      const couponIds = new Map<number, string[]>();
      for (const message of messages.filter(({ uid }) => linked.has(uid))) {
        couponIds.set(message.uid, await couponIdsOf(message));
      }
      return messages
        .map((message) => toCandidate(mailbox, uidValidity, message, couponIds.get(message.uid)))
        .filter(isCandidate);
    } catch (err) {
      throw new IcloudApiError(`iCloud falló al revisar «${mailbox}»: ${messageOf(err)}`);
    }
  });

  return {
    async listMessageIds(limit) {
      const found: IcloudCandidate[] = [];
      for (const mailbox of mailboxes) found.push(...(await scan(mailbox)));
      const selected = newestFirst(found, limit);
      for (const candidate of selected) known.set(candidate.id, candidate);
      return selected.map(({ id }) => id);
    },

    async getMessage(id) {
      const candidate = known.get(id);
      if (!candidate) throw new IcloudApiError(`iCloud no encontró el mail ${id}.`);
      return { id, receivedAt: candidate.receivedAt, pdfParts: candidate.pdfParts };
    },

    async downloadPart(_messageId, part) {
      if (part.kind === "certisend") return fetchCertisendCouponPdf(part.couponId, certisend);
      return inMailbox(part.mailbox, async () => {
        const { content } = await session.download(String(part.uid), part.partId, { uid: true });
        if (!content) throw new IcloudApiError(`iCloud no devolvió el adjunto ${part.fileName}.`);
        return new Uint8Array(await buffer(content));
      });
    },

    async close() {
      await session.logout().catch(() => undefined);
    },
  };
}
