import type { ExtractedPdf, ParsedStatement } from "@ledgerly/shared";
import { Types } from "mongoose";
import { createHash } from "node:crypto";
import { parseStatement } from "../ingestion/parseStatement.js";
import { CategoryRuleModel, StatementModel, TransactionModel } from "../db/models.js";
import { categorize, type RuleInput } from "../rules/categorize.js";

export const PARSER_VERSION = "1.0.0";

export function fingerprintOf(
  issuer: string, dateIso: string, comprobante: string | null, amount: number, currency: string,
  installmentCurrent: number | null, installmentTotal: number | null,
): string {
  return createHash("sha256")
    .update(`${issuer}|${dateIso}|${comprobante ?? ""}|${amount}|${currency}|${installmentCurrent ?? ""}|${installmentTotal ?? ""}`)
    .digest("hex");
}

interface ImportStatementResult {
  status: "imported" | "duplicate";
  statementId: string;
  transactionCount: number;
}

const duplicateOf = async (statementId: Types.ObjectId): Promise<ImportStatementResult> => ({
  status: "duplicate",
  statementId: statementId.toString(),
  transactionCount: await TransactionModel.countDocuments({ statementId }),
});

const removeStatement = async (statementId: Types.ObjectId): Promise<void> => {
  await TransactionModel.deleteMany({ statementId });
  await StatementModel.deleteOne({ _id: statementId });
};

const findSameStatement = async (header: ParsedStatement["header"]) => {
  if (!header.closingDate) return null;
  return StatementModel.findOne({
    issuer: header.issuer,
    cardLabel: header.cardLabel,
    closingDate: new Date(header.closingDate),
  });
};

const assertValid = (doc: object, model: typeof StatementModel | typeof TransactionModel): void => {
  const error = new model(doc).validateSync();
  if (error) throw error;
};

export async function importStatement(input: {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
  extracted?: ExtractedPdf;
}): Promise<ImportStatementResult> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");

  const sameFile = await StatementModel.findOne({ sourceHash });
  if (sameFile && !input.replace) return duplicateOf(sameFile._id);

  const { statement, reconciliation, meta } = await parseStatement(input.data, input.extracted);
  const sameStatement = await findSameStatement(statement.header);
  if (sameStatement && !input.replace) return duplicateOf(sameStatement._id);

  const rules = (await CategoryRuleModel.find({ enabled: true }).lean()) as unknown as RuleInput[];
  const statementId = new Types.ObjectId();

  const statementDoc = {
    _id: statementId,
    issuer: statement.header.issuer,
    cardLabel: statement.header.cardLabel,
    last4: statement.header.last4,
    closingDate: statement.header.closingDate ? new Date(statement.header.closingDate) : null,
    dueDate: statement.header.dueDate ? new Date(statement.header.dueDate) : null,
    totals: statement.header.totals,
    sourceFileName: input.fileName,
    sourceHash,
    pageCount: meta.pageCount,
    parserVersion: PARSER_VERSION,
    needsReview: !reconciliation.ok,
    reconciliation,
  };

  const docs = statement.rows.map((row) => {
    const { category, source } = categorize(row.descriptionRaw, row.merchant, rules);
    return {
      statementId,
      issuer: statement.header.issuer,
      cardLabel: statement.header.cardLabel,
      date: new Date(row.date),
      descriptionRaw: row.descriptionRaw,
      merchant: row.merchant,
      category,
      categorySource: source,
      amount: row.amount,
      currency: row.currency,
      direction: row.direction,
      type: row.type,
      isInstallment: row.isInstallment,
      installmentCurrent: row.installmentCurrent,
      installmentTotal: row.installmentTotal,
      comprobante: row.comprobante,
      fingerprint: fingerprintOf(
        statement.header.issuer, row.date, row.comprobante, row.amount, row.currency,
        row.installmentCurrent, row.installmentTotal,
      ),
    };
  });

  assertValid(statementDoc, StatementModel);
  docs.forEach((doc) => assertValid(doc, TransactionModel));

  if (sameFile) await removeStatement(sameFile._id);
  if (sameStatement && !sameStatement._id.equals(sameFile?._id)) await removeStatement(sameStatement._id);

  try {
    await StatementModel.create(statementDoc);

    const existingFingerprints = new Set(
      (await TransactionModel.find({ fingerprint: { $in: docs.map((d) => d.fingerprint) } }).distinct("fingerprint")) as string[],
    );
    const seen = new Set<string>();
    const toInsert = docs.filter((doc) => {
      if (existingFingerprints.has(doc.fingerprint) || seen.has(doc.fingerprint)) return false;
      seen.add(doc.fingerprint);
      return true;
    });
    if (toInsert.length > 0) await TransactionModel.insertMany(toInsert);

    return { status: "imported", statementId: statementId.toString(), transactionCount: toInsert.length };
  } catch (error) {
    await removeStatement(statementId);
    throw error;
  }
}
