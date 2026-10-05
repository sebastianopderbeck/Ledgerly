import type { ParsedStatement, ExtractedPdf, PdfMeta, ReconciliationResult } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { detectParser } from "../parsers/registry.js";
import { reconcile } from "../parsers/reconcile.js";
import { InvalidStatementDatesError, NoTextError, NoTransactionsError, UnsupportedFormatError } from "./errors.js";
import { hasSaneRowDates } from "./statementSanity.js";

export async function parseStatement(data: Uint8Array, extracted?: ExtractedPdf): Promise<{
  statement: ParsedStatement;
  reconciliation: ReconciliationResult;
  meta: PdfMeta;
}> {
  const { text, meta } = extracted ?? await extractPdfText(data);
  if (text.trim().length < 20) throw new NoTextError();

  const parser = detectParser(text, meta);
  if (!parser) throw new UnsupportedFormatError();

  const statement = parser.parse(text, meta);
  if (statement.rows.length === 0) throw new NoTransactionsError();
  if (!hasSaneRowDates(statement)) throw new InvalidStatementDatesError();

  return { statement, reconciliation: reconcile(statement), meta };
}
