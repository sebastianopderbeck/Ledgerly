import type { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import {
  ImapFlow, type FetchMessageObject, type FetchQueryObject, type ImapFlowOptions, type MessageStructureObject,
} from "imapflow";
import type { MailClient, MailPdfPart } from "../mail/mailClient.js";
import { ICLOUD_HOST, ICLOUD_PORT } from "./icloudConfig.js";
import { IcloudApiError, IcloudAuthError, ICLOUD_AUTH_FAILED_MESSAGE } from "./icloudErrors.js";

export interface IcloudPdfPart extends MailPdfPart {
  mailbox: string;
  uid: number;
}

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
  search(query: { since: Date }, options: { uid: true }): Promise<number[] | false | undefined>;
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
}

const ROOT_PART_ID = "1";
const PDF_MIME = "application/pdf";
const PDF_FILE_NAME = /\.pdf$/i;
const UNEXPECTED_ERROR = "Error inesperado";
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

const toCandidate = (mailbox: string, uidValidity: bigint, message: FetchMessageObject): IcloudCandidate | null => {
  if (!message.bodyStructure) return null;
  const pdfParts = collectImapPdfParts(message.bodyStructure).map((part) => ({ ...part, mailbox, uid: message.uid }));
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
  user, password, mailboxes, since, createSession = createImapSession,
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

  const scan = (mailbox: string): Promise<IcloudCandidate[]> => inMailbox(mailbox, async (uidValidity) => {
    try {
      const uids = await session.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return [];
      const messages = await session.fetchAll(uids, FETCH_QUERY, { uid: true });
      return messages.map((message) => toCandidate(mailbox, uidValidity, message)).filter(isCandidate);
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
