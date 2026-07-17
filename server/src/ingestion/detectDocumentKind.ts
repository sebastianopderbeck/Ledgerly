import type { PdfMeta } from "@ledgerly/shared";
import { icbcMortgageParser } from "../parsers/icbcMortgage.js";
import { detectParser } from "../parsers/registry.js";

export type DocumentKind = "coupon" | "statement" | "unknown";

export function detectDocumentKind(text: string, meta: PdfMeta): DocumentKind {
  if (icbcMortgageParser.detect(text, meta)) return "coupon";
  if (detectParser(text, meta)) return "statement";
  return "unknown";
}
