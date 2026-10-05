export interface MailPdfPart {
  partId: string;
  fileName: string;
  size: number;
}

export interface MailMessage<P extends MailPdfPart = MailPdfPart> {
  id: string;
  receivedAt: string;
  pdfParts: P[];
}

export interface MailClient<P extends MailPdfPart = MailPdfPart> {
  listMessageIds(limit: number): Promise<string[]>;
  getMessage(id: string): Promise<MailMessage<P>>;
  downloadPart(messageId: string, part: P): Promise<Uint8Array>;
  close(): Promise<void>;
}

export type OpenMailClient = () => Promise<MailClient>;
