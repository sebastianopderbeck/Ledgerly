import { vi } from "vitest";
import { GmailApiError, type GmailClient, type GmailMessage, type GmailPdfPart } from "../gmail/gmailClient.js";

export interface FakeGmailMessage {
  id: string;
  receivedAt?: string;
  pdfParts: GmailPdfPart[];
}

export const FAKE_RECEIVED_AT = "2026-09-28T12:00:00.000Z";

export const pdfPart = (partId: string, fileName: string, size = 2048): GmailPdfPart => ({
  partId, fileName, size, attachmentId: `att-${partId}`, inlineData: null,
});

export const fakePdfBytes = (messageId: string, partId: string): Uint8Array =>
  new TextEncoder().encode(`pdf-sintetico:${messageId}:${partId}`);

export function fakeGmailClient(messages: FakeGmailMessage[]) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return {
    listMessageIds: vi.fn(async (_query: string, limit: number): Promise<string[]> =>
      messages.map(({ id }) => id).slice(0, limit)),
    getMessage: vi.fn(async (id: string): Promise<GmailMessage> => {
      const message = byId.get(id);
      if (!message) throw new GmailApiError("Gmail respondió 404.");
      return { id, receivedAt: message.receivedAt ?? FAKE_RECEIVED_AT, pdfParts: message.pdfParts };
    }),
    downloadPart: vi.fn(async (messageId: string, part: GmailPdfPart): Promise<Uint8Array> =>
      fakePdfBytes(messageId, part.partId)),
  } satisfies GmailClient;
}
