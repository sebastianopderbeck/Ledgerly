import type { Issuer, ParsedStatement } from "./schemas.js";

export interface PdfMeta {
  producer: string | null;
  creator: string | null;
  pageCount: number;
  encrypted: boolean;
}

export interface ExtractedPdf {
  text: string;
  meta: PdfMeta;
}

export interface StatementParser {
  issuer: Issuer;
  detect(text: string, meta: PdfMeta): boolean;
  parse(text: string, meta: PdfMeta): ParsedStatement;
}
