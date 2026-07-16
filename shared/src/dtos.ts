import { z } from "zod";
import {
  currencySchema,
  directionSchema,
  issuerSchema,
  txTypeSchema,
  reconciliationResultSchema,
  parsedTotalsSchema,
} from "./schemas.js";

export const transactionDtoSchema = z.object({
  id: z.string(),
  statementId: z.string(),
  issuer: issuerSchema,
  cardLabel: z.string(),
  date: z.string(),
  descriptionRaw: z.string(),
  merchant: z.string(),
  category: z.string(),
  categorySource: z.enum(["rule", "manual"]),
  amount: z.number(),
  currency: currencySchema,
  direction: directionSchema,
  type: txTypeSchema,
  isInstallment: z.boolean(),
  installmentCurrent: z.number().nullable(),
  installmentTotal: z.number().nullable(),
  comprobante: z.string().nullable(),
});

export const statementDtoSchema = z.object({
  id: z.string(),
  issuer: issuerSchema,
  cardLabel: z.string(),
  last4: z.string().nullable(),
  closingDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  totals: parsedTotalsSchema,
  sourceFileName: z.string(),
  needsReview: z.boolean(),
  reconciliation: reconciliationResultSchema,
  transactionCount: z.number(),
  uploadedAt: z.string(),
});

export const categoryRuleDtoSchema = z.object({
  id: z.string(),
  priority: z.number(),
  matchType: z.enum(["contains", "regex"]),
  pattern: z.string(),
  category: z.string(),
  source: z.enum(["system", "user"]),
  enabled: z.boolean(),
});

export const importResultDtoSchema = z.object({
  status: z.enum(["imported", "duplicate"]),
  statement: statementDtoSchema,
  transactionCount: z.number(),
});

export const categoryStatSchema = z.object({ category: z.string(), total: z.number(), count: z.number() });
export const monthlyStatSchema = z.object({ month: z.string(), total: z.number(), count: z.number() });
export const merchantStatSchema = z.object({ merchant: z.string(), total: z.number(), count: z.number() });
export const futureInstallmentStatSchema = z.object({ month: z.string(), total: z.number() });
export const futureInstallmentItemSchema = z.object({
  merchant: z.string(),
  category: z.string(),
  amount: z.number(),
  installmentNumber: z.number().int().positive(),
  installmentTotal: z.number().int().positive(),
  purchaseDate: z.string(),
});
export const futureInstallmentMonthSchema = z.object({
  month: z.string(),
  total: z.number(),
  count: z.number(),
  items: z.array(futureInstallmentItemSchema),
});
export const summaryStatSchema = z.object({
  currency: currencySchema,
  totalPurchases: z.number(),
  transactionCount: z.number(),
  statementCount: z.number(),
  futureInstallmentTotal: z.number(),
});

export type TransactionDTO = z.infer<typeof transactionDtoSchema>;
export type StatementDTO = z.infer<typeof statementDtoSchema>;
export type CategoryRuleDTO = z.infer<typeof categoryRuleDtoSchema>;
export type ImportResultDTO = z.infer<typeof importResultDtoSchema>;
export type CategoryStat = z.infer<typeof categoryStatSchema>;
export type MonthlyStat = z.infer<typeof monthlyStatSchema>;
export type MerchantStat = z.infer<typeof merchantStatSchema>;
export type FutureInstallmentStat = z.infer<typeof futureInstallmentStatSchema>;
export type FutureInstallmentItem = z.infer<typeof futureInstallmentItemSchema>;
export type FutureInstallmentMonth = z.infer<typeof futureInstallmentMonthSchema>;
export type SummaryStat = z.infer<typeof summaryStatSchema>;
