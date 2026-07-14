import { extractText, getDocumentProxy, getMeta } from "unpdf";
import type { ExtractedPdf, PdfMeta } from "@ledgerly/shared";

export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdf> {
  const bytes = new Uint8Array(data);
  const pdf = await getDocumentProxy(bytes, { password: "" });
  const { text } = await extractText(pdf, { mergePages: true });
  const { info } = await getMeta(pdf);

  const meta: PdfMeta = {
    producer: (info?.Producer as string) ?? null,
    creator: (info?.Creator as string) ?? null,
    pageCount: pdf.numPages,
    encrypted: Boolean((info as Record<string, unknown>)?.IsEncrypted ?? false),
  };

  return { text, meta };
}
