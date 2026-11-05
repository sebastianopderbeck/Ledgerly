import type { Types } from "mongoose";
import type { Currency, Direction, Issuer, TxType } from "@ledgerly/shared";
import { CardServiceModel, TransactionModel } from "../db/models.js";
import { cardServiceGroups, type CardServiceGroup, type CardServiceTx } from "../stats/cardServices.js";
import { groupOf, merchantKey } from "../stats/merchantKey.js";

interface TransactionRow {
  statementId: unknown;
  date: Date;
  merchant: string;
  amount: number;
  currency: string;
  direction: string;
  type: string;
  isInstallment: boolean;
  issuer: string;
  cardLabel: string;
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export const toCardServiceTx = (t: TransactionRow): CardServiceTx => ({
  statementId: String(t.statementId),
  date: isoDay(t.date),
  merchant: t.merchant,
  amount: t.amount,
  currency: t.currency as Currency,
  direction: t.direction as Direction,
  type: t.type as TxType,
  isInstallment: t.isInstallment,
  issuer: t.issuer as Issuer,
  cardLabel: t.cardLabel,
});

const findCandidateCharges = (userId: Types.ObjectId) =>
  TransactionModel.find({ userId, type: "purchase", direction: "debit", isInstallment: false, currency: "ARS" }).lean();

export async function loadCardServiceGroups(userId: Types.ObjectId): Promise<CardServiceGroup[]> {
  const marks = await CardServiceModel.find({ userId }).lean();
  if (marks.length === 0) return [];
  const transactions = await findCandidateCharges(userId);
  return cardServiceGroups(transactions.map(toCardServiceTx), new Set(marks.map(({ key }) => key)));
}

export async function unmarkCardServiceGroup(userId: Types.ObjectId, key: string): Promise<void> {
  const transactions = await findCandidateCharges(userId);
  const group = groupOf(key, transactions.map((t) => merchantKey(t.merchant)));
  await CardServiceModel.deleteMany({ userId, key: { $in: [...group] } });
}
