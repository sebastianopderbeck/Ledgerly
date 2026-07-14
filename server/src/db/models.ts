import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const moneyPair = { ars: { type: Number, required: true }, usd: { type: Number, required: true } };

const statementSchema = new Schema(
  {
    issuer: { type: String, required: true, enum: ["visa_signature", "icbc"] },
    cardLabel: { type: String, required: true },
    last4: { type: String, default: null },
    closingDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    totals: {
      totalConsumos: moneyPair,
      saldoActual: moneyPair,
      pagoMinimo: moneyPair,
      saldoAnterior: moneyPair,
    },
    sourceFileName: { type: String, required: true },
    sourceHash: { type: String, required: true, unique: true },
    pageCount: { type: Number, required: true },
    parserVersion: { type: String, required: true },
    needsReview: { type: Boolean, default: false },
    reconciliation: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: "uploadedAt", updatedAt: false } },
);

const transactionSchema = new Schema({
  statementId: { type: Schema.Types.ObjectId, ref: "Statement", required: true, index: true },
  issuer: { type: String, required: true },
  cardLabel: { type: String, required: true },
  date: { type: Date, required: true, index: true },
  descriptionRaw: { type: String, required: true },
  merchant: { type: String, required: true, index: true },
  category: { type: String, required: true, index: true },
  categorySource: { type: String, required: true, enum: ["rule", "manual"] },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, enum: ["ARS", "USD"], index: true },
  direction: { type: String, required: true, enum: ["debit", "credit"] },
  type: { type: String, required: true, index: true },
  isInstallment: { type: Boolean, required: true },
  installmentCurrent: { type: Number, default: null },
  installmentTotal: { type: Number, default: null },
  comprobante: { type: String, default: null },
  fingerprint: { type: String, required: true },
});

const categoryRuleSchema = new Schema({
  priority: { type: Number, required: true },
  matchType: { type: String, required: true, enum: ["contains", "regex"] },
  pattern: { type: String, required: true },
  category: { type: String, required: true },
  source: { type: String, required: true, enum: ["system", "user"] },
  enabled: { type: Boolean, default: true },
});

export type StatementDoc = InferSchemaType<typeof statementSchema>;
export type TransactionDoc = InferSchemaType<typeof transactionSchema>;
export type CategoryRuleDoc = InferSchemaType<typeof categoryRuleSchema>;

export const StatementModel: Model<StatementDoc> =
  mongoose.models.Statement ?? mongoose.model("Statement", statementSchema);
export const TransactionModel: Model<TransactionDoc> =
  mongoose.models.Transaction ?? mongoose.model("Transaction", transactionSchema);
export const CategoryRuleModel: Model<CategoryRuleDoc> =
  mongoose.models.CategoryRule ?? mongoose.model("CategoryRule", categoryRuleSchema);
