import { z } from "zod";

export const issuerSchema = z.enum(["visa_signature", "icbc"]);
export const currencySchema = z.enum(["ARS", "USD"]);
export const directionSchema = z.enum(["debit", "credit"]);
export const txTypeSchema = z.enum([
  "purchase",
  "payment",
  "tax",
  "fee",
  "refund",
  "adjustment",
]);

const moneyPairSchema = z.object({ ars: z.number(), usd: z.number() });

export const parsedRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descriptionRaw: z.string(),
  merchant: z.string(),
  amount: z.number().nonnegative(),
  currency: currencySchema,
  direction: directionSchema,
  type: txTypeSchema,
  isInstallment: z.boolean(),
  installmentCurrent: z.number().int().positive().nullable(),
  installmentTotal: z.number().int().positive().nullable(),
  comprobante: z.string().nullable(),
});

export const parsedTotalsSchema = z.object({
  totalConsumos: moneyPairSchema,
  saldoActual: moneyPairSchema,
  pagoMinimo: moneyPairSchema,
  saldoAnterior: moneyPairSchema,
});

export const parsedHeaderSchema = z.object({
  issuer: issuerSchema,
  cardLabel: z.string(),
  last4: z.string().nullable(),
  closingDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  totals: parsedTotalsSchema,
});

export const parsedStatementSchema = z.object({
  header: parsedHeaderSchema,
  rows: z.array(parsedRowSchema),
});

export const reconciliationEntrySchema = z.object({
  currency: currencySchema,
  expected: z.number(),
  parsed: z.number(),
  diff: z.number(),
  ok: z.boolean(),
});

export const reconciliationResultSchema = z.object({
  ok: z.boolean(),
  entries: z.array(reconciliationEntrySchema),
});

export type Issuer = z.infer<typeof issuerSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type Direction = z.infer<typeof directionSchema>;
export type TxType = z.infer<typeof txTypeSchema>;
export type ParsedRow = z.infer<typeof parsedRowSchema>;
export type ParsedTotals = z.infer<typeof parsedTotalsSchema>;
export type ParsedHeader = z.infer<typeof parsedHeaderSchema>;
export type ParsedStatement = z.infer<typeof parsedStatementSchema>;
export type ReconciliationEntry = z.infer<typeof reconciliationEntrySchema>;
export type ReconciliationResult = z.infer<typeof reconciliationResultSchema>;
