import type { PdfMeta, StatementParser } from "@ledgerly/shared";
import { visaSignatureParser } from "./visaSignature.js";
import { icbcParser } from "./icbc.js";

export const parsers: StatementParser[] = [visaSignatureParser, icbcParser];

export function detectParser(text: string, meta: PdfMeta): StatementParser | null {
  return parsers.find((p) => p.detect(text, meta)) ?? null;
}
