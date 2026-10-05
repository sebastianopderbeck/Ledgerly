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
  tasaRealMensual: z.number(),
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

export const payslipConceptoSchema = z.object({
  codigo: z.string(),
  label: z.string(),
  tipo: z.enum(["remunerativo", "no_remunerativo", "descuento"]),
  monto: z.number(),
});

export const payslipDtoSchema = z.object({
  id: z.string(),
  periodo: z.string(),
  tipo: z.enum(["mensual", "sac"]),
  fechaPago: z.string(),
  cuil: z.string(),
  conceptos: z.array(payslipConceptoSchema),
  remunerativo: z.number(),
  noRemunerativo: z.number(),
  descuentos: z.number(),
  brutoTotal: z.number(),
  neto: z.number(),
  costoTotalEmpleador: z.number().nullable(),
  tipoCambioUsd: z.number().nullable(),
  tipoCambioSource: z.enum(["api", "manual"]).nullable(),
  netoUsd: z.number().nullable(),
});

export const payslipSummaryDtoSchema = z.object({
  periodos: z.number().int(),
  ultimoPeriodo: z.string(),
  ultimoNeto: z.number(),
  ultimoNetoUsd: z.number().nullable(),
  ultimoBruto: z.number(),
  variacionNetoMensual: z.number(),
  porcentajeDescuentos: z.number(),
  netoAcumuladoAnio: z.number(),
  recibosAnio: z.number().int(),
});

export const oficialRateDtoSchema = z.object({
  date: z.string(),
  rate: z.number().nullable(),
  source: z.literal("oficial"),
});

export const inflationRateDtoSchema = z.object({
  periodo: z.string(),
  variacionMensual: z.number(),
});

export const monthlyUsdStatSchema = z.object({
  month: z.string(),
  totalArs: z.number(),
  rate: z.number().nullable(),
  totalUsd: z.number().nullable(),
});

export const macroMonthSchema = z.object({
  periodo: z.string(),
  usdOficial: z.number().nullable(),
  uva: z.number().nullable(),
  tasa30: z.number().nullable(),
  inflacion: z.number().nullable(),
});

export const macroSpotSchema = z.object({
  fecha: z.string(),
  usdOficial: z.number().nullable(),
  uva: z.number().nullable(),
  tasa30: z.number().nullable(),
});

export const macroSeriesDtoSchema = z.object({
  desde: z.string(),
  meses: z.array(macroMonthSchema),
  hoy: macroSpotSchema,
});

export const rateRefreshCountSchema = z.object({
  updated: z.number(),
  skipped: z.number(),
});

export const macroRefreshDtoSchema = z.object({
  series: z.object({
    usdOficial: z.number(),
    uva: z.number(),
    tasa30: z.number(),
    inflacion: z.number(),
  }),
  tipoCambio: z.object({
    cupones: rateRefreshCountSchema,
    auto: rateRefreshCountSchema,
    sueldos: rateRefreshCountSchema,
  }),
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

export const payslipImportResultSchema = z.object({
  kind: z.literal("payslip"),
  status: z.enum(["imported", "duplicate"]),
  payslip: payslipDtoSchema,
});

export const importResultUnionSchema = z.discriminatedUnion("kind", [
  couponImportResultSchema,
  statementImportResultSchema,
  autoImportResultSchema,
  payslipImportResultSchema,
]);

export const importedFileKindSchema = z.enum(["statement", "coupon", "auto", "payslip"]);

export const importedFileDtoSchema = z.object({
  id: z.string(),
  kind: importedFileKindSchema,
  fileName: z.string(),
  uploadedAt: z.string(),
  documentDate: z.string().nullable(),
  description: z.string(),
  needsReview: z.boolean(),
});

export const cashFlowEstadoSchema = z.enum(["completo", "incompleto", "en_curso", "proyectado"]);

export const cashFlowMonthSchema = z.object({
  mes: z.string(),
  estado: cashFlowEstadoSchema,
  ingreso: z.number().nullable(),
  conSac: z.boolean(),
  tarjetas: z.number(),
  hipoteca: z.number(),
  auto: z.number(),
  egresos: z.number(),
  margen: z.number().nullable(),
  tasaAhorro: z.number().nullable(),
  faltantes: z.array(z.string()),
  estimados: z.array(z.string()),
});

export const cashFlowDtoSchema = z.object({
  mesActual: z.string(),
  meses: z.array(cashFlowMonthSchema),
});

export const subscriptionIncreaseSchema = z.object({
  variacion: z.number(),
  desde: z.string(),
  montoAnterior: z.number(),
});

export const subscriptionDtoSchema = z.object({
  key: z.string(),
  nombre: z.string(),
  busqueda: z.string(),
  categoria: z.string(),
  cardLabel: z.string(),
  moneda: currencySchema,
  montoActual: z.number(),
  montoMensualArs: z.number().nullable(),
  primerCobro: z.string(),
  ultimoCobro: z.string(),
  proximoCobro: z.string(),
  cobros: z.number().int().positive(),
  estado: z.enum(["activa", "cortada"]),
  oculta: z.boolean(),
  aumento: subscriptionIncreaseSchema.nullable(),
  monedaAnterior: currencySchema.nullable(),
});

export const subscriptionsReportDtoSchema = z.object({
  cotizacionOficial: z.number().nullable(),
  totalMensualArs: z.number(),
  totalMensualUsd: z.number(),
  totalAnualArs: z.number(),
  items: z.array(subscriptionDtoSchema),
});

export const reviewReasonSchema = z.enum(["duplicado", "usd", "nuevo", "sin-categoria"]);
export const reviewCheckSchema = z.enum(["duplicado", "usd", "nuevo", "categoria", "sin-categoria"]);

export const reviewDuplicateRefSchema = z.object({
  transactionId: z.string(),
  date: z.string(),
  sameStatement: z.boolean(),
});

export const reviewTransactionFindingSchema = z.object({
  kind: z.literal("transaction"),
  key: z.string(),
  transaction: transactionDtoSchema,
  reasons: z.array(reviewReasonSchema).min(1),
  duplicateOf: reviewDuplicateRefSchema.nullable(),
  usualUsd: z.number().nullable(),
});

export const reviewCategoryFindingSchema = z.object({
  kind: z.literal("category"),
  key: z.string(),
  category: z.string(),
  total: z.number(),
  average: z.number(),
  ratio: z.number().nullable(),
});

export const reviewFindingSchema = z.discriminatedUnion("kind", [
  reviewTransactionFindingSchema,
  reviewCategoryFindingSchema,
]);

export const statementReviewDtoSchema = z.object({
  statement: statementDtoSchema,
  previousStatements: z.number().int(),
  historyStatements: z.number().int(),
  skippedChecks: z.array(reviewCheckSchema),
  findings: z.array(reviewFindingSchema),
  reviewedKeys: z.array(z.string()),
});

export const statementReviewPatchSchema = z.object({
  keys: z.array(z.string().min(1)).min(1).max(500),
  reviewed: z.boolean(),
});

export const statementReviewKeysDtoSchema = z.object({ reviewedKeys: z.array(z.string()) });

export const installmentScheduleEntrySchema = z.object({
  number: z.number().int().positive(),
  amount: z.number(),
  paymentDate: z.string(),
});

export const installmentPurchaseDtoSchema = z.object({
  id: z.string(),
  cardLabel: z.string(),
  merchant: z.string(),
  category: z.string(),
  purchaseDate: z.string(),
  installmentTotal: z.number().int().positive(),
  installments: z.array(installmentScheduleEntrySchema),
});

const isCalendarDate = (value: string): boolean => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate, "Fecha inválida");

export const manualAssetTypeSchema = z.enum(["cuenta", "ahorro", "plazo_fijo", "inversion", "inmueble", "otro"]);

export const MANUAL_ASSET_TYPE_LABELS: Record<ManualAssetType, string> = {
  cuenta: "Cuenta",
  ahorro: "Ahorros",
  plazo_fijo: "Plazo fijo",
  inversion: "Inversiones",
  inmueble: "Inmueble",
  otro: "Otro",
};

export const assetValuationSchema = z.object({ fecha: isoDateSchema, monto: z.number().nonnegative() });

export const manualAssetDtoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: manualAssetTypeSchema,
  moneda: currencySchema,
  valuaciones: z.array(assetValuationSchema),
});

export const manualAssetCreateSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  tipo: manualAssetTypeSchema,
  moneda: currencySchema,
  valuacion: assetValuationSchema,
}).strict();

export const manualAssetUpdateSchema = z.object({
  nombre: z.string().trim().min(1).max(60).optional(),
  tipo: manualAssetTypeSchema.optional(),
  valuacion: assetValuationSchema.optional(),
}).strict();

export const netWorthItemDtoSchema = z.object({
  id: z.string(),
  lado: z.enum(["activo", "pasivo"]),
  fuente: z.enum(["auto", "plan_auto", "hipoteca", "tarjeta", "manual"]),
  label: z.string(),
  detalle: z.string(),
  fecha: z.string(),
  moneda: currencySchema,
  montoOriginal: z.number(),
  ars: z.number(),
  usd: z.number(),
  assetId: z.string().nullable(),
});

export const netWorthTotalsSchema = z.object({
  activosArs: z.number(),
  pasivosArs: z.number(),
  netoArs: z.number(),
  activosUsd: z.number(),
  pasivosUsd: z.number(),
  netoUsd: z.number(),
});

export const netWorthMonthDtoSchema = netWorthTotalsSchema.extend({ periodo: z.string() });

export const netWorthDtoSchema = z.object({
  fecha: z.string(),
  usdOficial: z.number(),
  usdOficialFecha: z.string(),
  uva: z.number().nullable(),
  uvaFecha: z.string().nullable(),
  totales: netWorthTotalsSchema,
  items: z.array(netWorthItemDtoSchema),
  evolucion: z.array(netWorthMonthDtoSchema),
  activosManuales: z.array(manualAssetDtoSchema),
});

export const budgetDtoSchema = z.object({
  id: z.string(),
  category: z.string(),
  topeArs: z.number(),
  ajustaInflacion: z.boolean(),
  periodoBase: z.string(),
});

export const budgetInputSchema = z.object({
  category: z.string().trim().min(1),
  topeArs: z.number().finite().positive(),
  ajustaInflacion: z.boolean().default(false),
});

export const budgetPatchSchema = z
  .object({ topeArs: z.number().finite().positive().optional(), ajustaInflacion: z.boolean().optional() })
  .refine((body) => body.topeArs !== undefined || body.ajustaInflacion !== undefined);

export const categoryMonthStatSchema = z.object({
  month: z.string(),
  category: z.string(),
  total: z.number(),
  count: z.number(),
});

export const budgetSpendingDtoSchema = z.object({
  ultimoMesCerrado: z.string().nullable(),
  gastos: z.array(categoryMonthStatSchema),
});

export const uncategorizedGroupSchema = z.object({
  pattern: z.string(),
  merchants: z.array(z.string()),
  count: z.number().int(),
  totalArs: z.number(),
  totalUsd: z.number(),
  equivalentArs: z.number(),
  lastDate: z.string(),
});

export const uncategorizedInboxDtoSchema = z.object({
  pendingCount: z.number().int(),
  usdRate: z.number().nullable(),
  groups: z.array(uncategorizedGroupSchema),
});

export const inboxRuleResultDtoSchema = z.object({
  rule: categoryRuleDtoSchema,
  categorized: z.number().int(),
});

export const mailSourceSchema = z.enum(["gmail", "icloud"]);
export const MAIL_SOURCE_LABELS: Record<MailSource, string> = { gmail: "Gmail", icloud: "iCloud" };

export const mailSyncOutcomeSchema = z.enum(["imported", "duplicate", "skipped", "failed"]);
export const mailSyncTriggerSchema = z.enum(["manual", "job"]);

export const mailSyncItemDtoSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  receivedAt: z.string(),
  outcome: mailSyncOutcomeSchema,
  kind: importedFileKindSchema.nullable(),
  documentId: z.string().nullable(),
  detail: z.string(),
});

export const mailSyncRunDtoSchema = z.object({
  source: mailSourceSchema,
  trigger: mailSyncTriggerSchema,
  startedAt: z.string(),
  finishedAt: z.string(),
  status: z.enum(["ok", "error"]),
  error: z.string().nullable(),
  messagesChecked: z.number().int(),
  hasMore: z.boolean(),
  items: z.array(mailSyncItemDtoSchema),
});

export const mailSourceStatusDtoSchema = z.object({
  source: mailSourceSchema,
  enabled: z.boolean(),
  missing: z.array(z.string()),
  scope: z.string().nullable(),
  intervalMinutes: z.number().int().nullable(),
  lastRun: mailSyncRunDtoSchema.nullable(),
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
export type MortgageCouponDTO = z.infer<typeof mortgageCouponDtoSchema>;
export type CreditSummaryDTO = z.infer<typeof creditSummaryDtoSchema>;
export type ImportResultUnionDTO = z.infer<typeof importResultUnionSchema>;
export type ImportedFileKind = z.infer<typeof importedFileKindSchema>;
export type ImportedFileDTO = z.infer<typeof importedFileDtoSchema>;
export type AutoConceptDTO = z.infer<typeof autoConceptSchema>;
export type AutoCouponDTO = z.infer<typeof autoCouponDtoSchema>;
export type AutoSummaryDTO = z.infer<typeof autoSummaryDtoSchema>;
export type OficialRateDTO = z.infer<typeof oficialRateDtoSchema>;
export type MonthlyUsdStat = z.infer<typeof monthlyUsdStatSchema>;
export type MacroMonth = z.infer<typeof macroMonthSchema>;
export type MacroSpot = z.infer<typeof macroSpotSchema>;
export type MacroSeriesDTO = z.infer<typeof macroSeriesDtoSchema>;
export type RateRefreshCount = z.infer<typeof rateRefreshCountSchema>;
export type MacroRefreshDTO = z.infer<typeof macroRefreshDtoSchema>;
export type PayslipConceptoDTO = z.infer<typeof payslipConceptoSchema>;
export type PayslipDTO = z.infer<typeof payslipDtoSchema>;
export type PayslipSummaryDTO = z.infer<typeof payslipSummaryDtoSchema>;
export type InflationRateDTO = z.infer<typeof inflationRateDtoSchema>;
export type CashFlowEstado = z.infer<typeof cashFlowEstadoSchema>;
export type CashFlowMonthDTO = z.infer<typeof cashFlowMonthSchema>;
export type CashFlowDTO = z.infer<typeof cashFlowDtoSchema>;
export type SubscriptionIncrease = z.infer<typeof subscriptionIncreaseSchema>;
export type SubscriptionDTO = z.infer<typeof subscriptionDtoSchema>;
export type SubscriptionsReportDTO = z.infer<typeof subscriptionsReportDtoSchema>;
export type ReviewReason = z.infer<typeof reviewReasonSchema>;
export type ReviewCheck = z.infer<typeof reviewCheckSchema>;
export type ReviewDuplicateRef = z.infer<typeof reviewDuplicateRefSchema>;
export type ReviewTransactionFinding = z.infer<typeof reviewTransactionFindingSchema>;
export type ReviewCategoryFinding = z.infer<typeof reviewCategoryFindingSchema>;
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type StatementReviewDTO = z.infer<typeof statementReviewDtoSchema>;
export type StatementReviewPatch = z.infer<typeof statementReviewPatchSchema>;
export type StatementReviewKeysDTO = z.infer<typeof statementReviewKeysDtoSchema>;
export type InstallmentScheduleEntry = z.infer<typeof installmentScheduleEntrySchema>;
export type InstallmentPurchaseDTO = z.infer<typeof installmentPurchaseDtoSchema>;
export type ManualAssetType = z.infer<typeof manualAssetTypeSchema>;
export type AssetValuationDTO = z.infer<typeof assetValuationSchema>;
export type ManualAssetDTO = z.infer<typeof manualAssetDtoSchema>;
export type ManualAssetCreateDTO = z.infer<typeof manualAssetCreateSchema>;
export type ManualAssetUpdateDTO = z.infer<typeof manualAssetUpdateSchema>;
export type NetWorthItemDTO = z.infer<typeof netWorthItemDtoSchema>;
export type NetWorthTotals = z.infer<typeof netWorthTotalsSchema>;
export type NetWorthMonthDTO = z.infer<typeof netWorthMonthDtoSchema>;
export type NetWorthDTO = z.infer<typeof netWorthDtoSchema>;
export type BudgetDTO = z.infer<typeof budgetDtoSchema>;
export type BudgetInput = z.infer<typeof budgetInputSchema>;
export type BudgetPatch = z.infer<typeof budgetPatchSchema>;
export type CategoryMonthStat = z.infer<typeof categoryMonthStatSchema>;
export type BudgetSpendingDTO = z.infer<typeof budgetSpendingDtoSchema>;
export type UncategorizedGroupDTO = z.infer<typeof uncategorizedGroupSchema>;
export type UncategorizedInboxDTO = z.infer<typeof uncategorizedInboxDtoSchema>;
export type InboxRuleResultDTO = z.infer<typeof inboxRuleResultDtoSchema>;
export type MailSyncOutcome = z.infer<typeof mailSyncOutcomeSchema>;
export type MailSource = z.infer<typeof mailSourceSchema>;
export type MailSyncTrigger = z.infer<typeof mailSyncTriggerSchema>;
export type MailSyncItemDTO = z.infer<typeof mailSyncItemDtoSchema>;
export type MailSyncRunDTO = z.infer<typeof mailSyncRunDtoSchema>;
export type MailSourceStatusDTO = z.infer<typeof mailSourceStatusDtoSchema>;
