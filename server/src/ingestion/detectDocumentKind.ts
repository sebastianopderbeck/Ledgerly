import type { PdfMeta } from "@ledgerly/shared";
import { icbcMortgageParser } from "../parsers/icbcMortgage.js";
import { autoPlanParser } from "../parsers/autoPlan.js";
import { payslipParser } from "../parsers/payslip.js";
import { detectParser } from "../parsers/registry.js";

export type DocumentKind = "coupon" | "auto" | "payslip" | "statement" | "unknown";

export function detectDocumentKind(text: string, meta: PdfMeta): DocumentKind {
  if (icbcMortgageParser.detect(text, meta)) return "coupon";
  if (autoPlanParser.detect(text, meta)) return "auto";
  if (payslipParser.detect(text, meta)) return "payslip";
  if (detectParser(text, meta)) return "statement";
  return "unknown";
}
