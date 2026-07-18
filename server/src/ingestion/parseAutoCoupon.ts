import type { ParsedAutoCoupon, PdfMeta } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { autoPlanParser } from "../parsers/autoPlan.js";
import { InvalidAutoCouponError, NoTextError, UnsupportedFormatError } from "./errors.js";

export async function parseAutoCoupon(data: Uint8Array): Promise<{ coupon: ParsedAutoCoupon; meta: PdfMeta }> {
  const { text, meta } = await extractPdfText(data);
  if (text.trim().length < 20) throw new NoTextError();
  if (!autoPlanParser.detect(text, meta)) throw new UnsupportedFormatError();
  try {
    return { coupon: autoPlanParser.parse(text, meta), meta };
  } catch {
    throw new InvalidAutoCouponError();
  }
}
