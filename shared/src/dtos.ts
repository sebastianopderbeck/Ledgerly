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

export const mortgageCouponDtoSchema = z.object({
  id: z.string(),
  prestamoNro: z.string(),
  cuotaNro: z.number().int().positive(),
  fechaDebito: z.string(),
  capital: z.number(),
  intereses: z.number(),
  seguroIncendio: z.number(),
  totalDebitado: z.number(),
  cuotaPuraUva: z.number(),
  cotizacionUva: z.number(),
  capitalUva: z.number(),
  interesUva: z.number(),
  tea: z.number(),
  tna: z.number(),
  cft: z.number(),
  tipoCambioUsd: z.number().nullable(),
  tipoCambioSource: z.enum(["api", "manual"]).nullable(),
  totalUsd: z.number().nullable(),
});

export const creditSummaryDtoSchema = z.object({
  prestamoNro: z.string(),
  cuotasPagadas: z.number().int(),
  cuotasTotales: z.number().int(),
  totalPagado: z.number(),
  capitalPagado: z.number(),
  interesPagado: z.number(),
  seguroPagado: z.number(),
  capitalOriginalUva: z.number(),
  capitalAmortizadoUva: z.number(),
  capitalPendienteUva: z.number(),
  capitalPendientePesos: z.number(),
  porcentajeAvanceCapital: z.number(),
  cotizacionUvaActual: z.number(),
  cuotaPuraUva: z.number(),
  tna: z.number(),
});

export const autoConceptSchema = z.object({ label: z.string(), amount: z.number() });

export const autoCouponDtoSchema = z.object({
  id: z.string(),
  grupo: z.string(),
  orden: z.string(),
  cuotaNro: z.number().int().positive(),
  plan: z.string(),
  fechaEmision: z.string(),
  fechaVencimiento: z.string(),
  comprobante: z.string(),
  modelo: z.string(),
  valorMovil: z.number(),
  conceptos: z.array(autoConceptSchema),
  totalAPagar: z.number(),
  tipoCambioUsd: z.number().nullable(),
  tipoCambioSource: z.enum(["api", "manual"]).nullable(),
  totalUsd: z.number().nullable(),
});

export const autoSummaryDtoSchema = z.object({
  grupo: z.string(),
  orden: z.string(),
  plan: z.string(),
  modelo: z.string(),
  cuotasPagadas: z.number().int(),
  cuotasTotales: z.number().int(),
  porcentajeAvance: z.number(),
  totalPagado: z.number(),
  valorActualAuto: z.number(),
  totalPagadoUsd: z.number(),
  ultimaCuota: z.number().int(),
  fechaUltimoVencimiento: z.string(),
});

export const oficialRateDtoSchema = z.object({
  date: z.string(),
  rate: z.number().nullable(),
  source: z.literal("oficial"),
});

export const monthlyUsdStatSchema = z.object({
  month: z.string(),
  totalArs: z.number(),
  rate: z.number().nullable(),
  totalUsd: z.number().nullable(),
});

export const couponImportResultSchema = z.object({
  kind: z.literal("coupon"),
  status: z.enum(["imported", "duplicate"]),
  coupon: mortgageCouponDtoSchema,
});
export const statementImportResultSchema = z.object({
  kind: z.literal("statement"),
  status: z.enum(["imported", "duplicate"]),
  statement: statementDtoSchema,
  transactionCount: z.number(),
});

export const autoImportResultSchema = z.object({
  kind: z.literal("auto"),
  status: z.enum(["imported", "duplicate"]),
  coupon: autoCouponDtoSchema,
});

export const importResultUnionSchema = z.discriminatedUnion("kind", [
  couponImportResultSchema,
  statementImportResultSchema,
  autoImportResultSchema,
]);

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
export type MortgageCouponDTO = z.infer<typeof mortgageCouponDtoSchema>;
export type CreditSummaryDTO = z.infer<typeof creditSummaryDtoSchema>;
export type ImportResultUnionDTO = z.infer<typeof importResultUnionSchema>;
export type AutoConceptDTO = z.infer<typeof autoConceptSchema>;
export type AutoCouponDTO = z.infer<typeof autoCouponDtoSchema>;
export type AutoSummaryDTO = z.infer<typeof autoSummaryDtoSchema>;
export type OficialRateDTO = z.infer<typeof oficialRateDtoSchema>;
export type MonthlyUsdStat = z.infer<typeof monthlyUsdStatSchema>;
