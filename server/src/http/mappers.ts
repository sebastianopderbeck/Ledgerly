import type { CategoryRuleDTO, MortgageCouponDTO, StatementDTO, TransactionDTO } from "@ledgerly/shared";
import type { CategoryRuleDoc, MortgageCouponDoc, StatementDoc, TransactionDoc } from "../db/models.js";
import type { HydratedDocument } from "mongoose";

const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function toTransactionDTO(doc: HydratedDocument<TransactionDoc>): TransactionDTO {
  return {
    id: doc._id.toString(),
    statementId: doc.statementId.toString(),
    issuer: doc.issuer as TransactionDTO["issuer"],
    cardLabel: doc.cardLabel,
    date: doc.date.toISOString().slice(0, 10),
    descriptionRaw: doc.descriptionRaw,
    merchant: doc.merchant,
    category: doc.category,
    categorySource: doc.categorySource as TransactionDTO["categorySource"],
    amount: doc.amount,
    currency: doc.currency as TransactionDTO["currency"],
    direction: doc.direction as TransactionDTO["direction"],
    type: doc.type as TransactionDTO["type"],
    isInstallment: doc.isInstallment,
    installmentCurrent: doc.installmentCurrent ?? null,
    installmentTotal: doc.installmentTotal ?? null,
    comprobante: doc.comprobante ?? null,
  };
}

export function toStatementDTO(doc: HydratedDocument<StatementDoc>, transactionCount: number): StatementDTO {
  return {
    id: doc._id.toString(),
    issuer: doc.issuer as StatementDTO["issuer"],
    cardLabel: doc.cardLabel,
    last4: doc.last4 ?? null,
    closingDate: isoDate(doc.closingDate ?? null),
    dueDate: isoDate(doc.dueDate ?? null),
    totals: doc.totals as StatementDTO["totals"],
    sourceFileName: doc.sourceFileName,
    needsReview: doc.needsReview,
    reconciliation: doc.reconciliation as StatementDTO["reconciliation"],
    transactionCount,
    uploadedAt: (doc as unknown as { uploadedAt: Date }).uploadedAt.toISOString(),
  };
}

export function toCategoryRuleDTO(doc: HydratedDocument<CategoryRuleDoc>): CategoryRuleDTO {
  return {
    id: doc._id.toString(),
    priority: doc.priority,
    matchType: doc.matchType as CategoryRuleDTO["matchType"],
    pattern: doc.pattern,
    category: doc.category,
    source: doc.source as CategoryRuleDTO["source"],
    enabled: doc.enabled,
  };
}

export function toMortgageCouponDTO(doc: HydratedDocument<MortgageCouponDoc>): MortgageCouponDTO {
  return {
    id: doc._id.toString(),
    prestamoNro: doc.prestamoNro,
    cuotaNro: doc.cuotaNro,
    fechaDebito: doc.fechaDebito.toISOString().slice(0, 10),
    capital: doc.capital,
    intereses: doc.intereses,
    seguroIncendio: doc.seguroIncendio,
    totalDebitado: doc.totalDebitado,
    cuotaPuraUva: doc.cuotaPuraUva,
    cotizacionUva: doc.cotizacionUva,
    capitalUva: doc.capital / doc.cotizacionUva,
    interesUva: doc.intereses / doc.cotizacionUva,
    tea: doc.tea,
    tna: doc.tna,
    cft: doc.cft,
  };
}
