import type { ParsedStatement, PdfMeta, ReconciliationResult } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { detectParser } from "../parsers/registry.js";
import { reconcile } from "../parsers/reconcile.js";
import { NoTextError, NoTransactionsError, UnsupportedFormatError } from "./errors.js";

export async function parseStatement(data: Uint8Array): Promise<{
  statement: ParsedStatement;
  reconciliation: ReconciliationResult;
  meta: PdfMeta;
}> {
  const { text, meta } = await extractPdfText(data);
  if (text.trim().length < 20) throw new NoTextError();

  const parser = detectParser(text, meta);
  if (!parser) throw new UnsupportedFormatError();

  const statement = parser.parse(text, meta);
  if (statement.rows.length === 0) throw new NoTransactionsError();

  return { statement, reconciliation: reconcile(statement), meta };
}
