import type { ParsedPayslip, PdfMeta } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { payslipParser } from "../parsers/payslip.js";
import { InvalidPayslipError, NoTextError, UnsupportedFormatError } from "./errors.js";

export async function parsePayslip(data: Uint8Array): Promise<{ payslip: ParsedPayslip; meta: PdfMeta }> {
  const { text, meta } = await extractPdfText(data);
  if (text.trim().length < 20) throw new NoTextError();
  if (!payslipParser.detect(text, meta)) throw new UnsupportedFormatError();
  try {
    return { payslip: payslipParser.parse(text, meta), meta };
  } catch {
    throw new InvalidPayslipError();
  }
}
