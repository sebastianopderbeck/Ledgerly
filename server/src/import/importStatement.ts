import { createHash } from "node:crypto";
import { parseStatement } from "../ingestion/parseStatement.js";
import { CategoryRuleModel, StatementModel, TransactionModel } from "../db/models.js";
import { categorize, type RuleInput } from "../rules/categorize.js";

export const PARSER_VERSION = "1.0.0";

export function fingerprintOf(
  issuer: string, dateIso: string, comprobante: string | null, amount: number, currency: string,
): string {
  return createHash("sha256")
    .update(`${issuer}|${dateIso}|${comprobante ?? ""}|${amount}|${currency}`)
    .digest("hex");
}

export async function importStatement(input: {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
}): Promise<{ status: "imported" | "duplicate"; statementId: string; transactionCount: number }> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");

  const existing = await StatementModel.findOne({ sourceHash });
  if (existing && !input.replace) {
    return {
      status: "duplicate",
      statementId: existing._id.toString(),
      transactionCount: await TransactionModel.countDocuments({ statementId: existing._id }),
    };
  }
  if (existing && input.replace) {
    await TransactionModel.deleteMany({ statementId: existing._id });
    await StatementModel.deleteOne({ _id: existing._id });
  }

  const { statement, reconciliation, meta } = await parseStatement(input.data);
  const rules = (await CategoryRuleModel.find({ enabled: true }).lean()) as unknown as RuleInput[];

  const created = await StatementModel.create({
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
  });

  const docs = statement.rows.map((row) => {
    const { category, source } = categorize(row.descriptionRaw, row.merchant, rules);
    return {
      statementId: created._id,
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
      fingerprint: fingerprintOf(statement.header.issuer, row.date, row.comprobante, row.amount, row.currency),
    };
  });
  await TransactionModel.insertMany(docs);

  return { status: "imported", statementId: created._id.toString(), transactionCount: docs.length };
}
