import type { ParsedCoupon, ExtractedPdf, PdfMeta } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { icbcMortgageParser } from "../parsers/icbcMortgage.js";
import { InvalidCouponError, NoTextError, UnsupportedFormatError } from "./errors.js";

export async function parseCoupon(data: Uint8Array, extracted?: ExtractedPdf): Promise<{ coupon: ParsedCoupon; meta: PdfMeta }> {
  const { text, meta } = extracted ?? await extractPdfText(data);
  if (text.trim().length < 20) throw new NoTextError();
  if (!icbcMortgageParser.detect(text, meta)) throw new UnsupportedFormatError();
  try {
    return { coupon: icbcMortgageParser.parse(text, meta), meta };
  } catch {
    throw new InvalidCouponError();
  }
}
