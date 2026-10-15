import type { Currency, Direction, Issuer, TxType } from "@ledgerly/shared";
import {
  HiddenSubscriptionModel, ManualSubscriptionModel, StatementModel, SubscriptionCadenceModel, TransactionModel,
} from "../db/models.js";
import { latestClosingByIssuer, type SubscriptionContext, type SubscriptionTx } from "../stats/subscriptions.js";

export interface SubscriptionInputs {
  txs: SubscriptionTx[];
  ctx: Omit<SubscriptionContext, "cotizacion">;
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export async function loadSubscriptionInputs(hoy: string): Promise<SubscriptionInputs> {
  const [transactions, statements, hidden, manual, cadences] = await Promise.all([
    TransactionModel.find({ isInstallment: false, type: { $in: ["purchase", "refund"] } }).lean(),
    StatementModel.find({}, { issuer: 1, closingDate: 1 }).lean(),
    HiddenSubscriptionModel.find().lean(),
    ManualSubscriptionModel.find().lean(),
    SubscriptionCadenceModel.find(),
  ]);
  const txs: SubscriptionTx[] = transactions.map((t) => ({
    date: isoDay(t.date),
    merchant: t.merchant,
    amount: t.amount,
    currency: t.currency as Currency,
    direction: t.direction as Direction,
    type: t.type as TxType,
    isInstallment: t.isInstallment,
    category: t.category,
    issuer: t.issuer as Issuer,
    cardLabel: t.cardLabel,
    statementId: String(t.statementId),
  }));
  return {
    txs,
    ctx: {
      hoy,
      ultimoCierre: latestClosingByIssuer(statements.map((s) => ({ issuer: s.issuer, closingDate: s.closingDate ?? null }))),
      ocultas: new Set(hidden.map((h) => h.key)),
      manuales: new Set(manual.map((m) => m.key)),
      cobrosMarcados: new Map(manual.map(({ key, cobros = [] }) => [
        key,
        cobros.map(({ date, amount, currency }) => ({ date, amount, currency: currency as Currency })),
      ])),
      cadencias: new Map(cadences.map(({ key, cadencia }) => [key, cadencia])),
    },
  };
}
