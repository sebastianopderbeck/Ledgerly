import { Router } from "express";
import type { FilterQuery } from "mongoose";
import { asyncHandler } from "../errors.js";
import { StatementModel, TransactionModel, type TransactionDoc, type StatementDoc } from "../../db/models.js";
import { computeFutureInstallments, computeFutureInstallmentsDetail } from "../../stats/futureInstallments.js";
import { representativeRateDate, consumptionMonth } from "../../stats/monthlyUsd.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import type { Currency, MonthlyUsdStat } from "@ledgerly/shared";

function baseMatch(q: Record<string, unknown>): FilterQuery<TransactionDoc> {
  const currency = q.currency === "USD" ? "USD" : "ARS";
  const match: FilterQuery<TransactionDoc> = { type: "purchase", currency };
  if (typeof q.cardLabel === "string") match.cardLabel = q.cardLabel;
  if (typeof q.from === "string" || typeof q.to === "string") {
    match.date = {};
    if (typeof q.from === "string") match.date.$gte = new Date(q.from);
    if (typeof q.to === "string") match.date.$lte = new Date(q.to);
  }
  return match;
}

function installmentMatch(q: Record<string, unknown>): FilterQuery<TransactionDoc> {
  const match: FilterQuery<TransactionDoc> = { type: "purchase", isInstallment: true };
  if (typeof q.cardLabel === "string") match.cardLabel = q.cardLabel;
  return match;
}

export const statsRouter = Router();

statsRouter.get("/by-category", asyncHandler(async (req, res) => {
  const rows = await TransactionModel.aggregate([
    { $match: baseMatch(req.query as Record<string, unknown>) },
    { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, category: "$_id", total: 1, count: 1 } },
    { $sort: { total: -1 } },
  ]);
  res.json(rows);
}));

statsRouter.get("/monthly", asyncHandler(async (req, res) => {
  const rows = await TransactionModel.aggregate([
    { $match: baseMatch(req.query as Record<string, unknown>) },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$date" } }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, month: "$_id", total: 1, count: 1 } },
    { $sort: { month: 1 } },
  ]);
  res.json(rows);
}));

statsRouter.get("/monthly-usd", asyncHandler(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const filter: FilterQuery<StatementDoc> = {};
  if (typeof q.cardLabel === "string") filter.cardLabel = q.cardLabel;
  if (typeof q.from === "string" || typeof q.to === "string") {
    filter.closingDate = {};
    if (typeof q.from === "string") filter.closingDate.$gte = new Date(q.from);
    if (typeof q.to === "string") filter.closingDate.$lte = new Date(q.to);
  }
  const statements = await StatementModel.find(filter).lean();
  const totalArsByMonth = new Map<string, number>();
  for (const statement of statements) {
    if (!statement.closingDate) continue;
    const month = consumptionMonth(statement.closingDate.toISOString().slice(0, 10));
    totalArsByMonth.set(month, (totalArsByMonth.get(month) ?? 0) + (statement.totals?.saldoActual?.ars ?? 0));
  }
  const today = new Date().toISOString().slice(0, 10);
  const result: MonthlyUsdStat[] = [];
  for (const month of [...totalArsByMonth.keys()].sort()) {
    const totalArs = totalArsByMonth.get(month)!;
    const rate = await fetchOficialRate(representativeRateDate(month, today));
    result.push({ month, totalArs, rate, totalUsd: rate ? totalArs / rate : null });
  }
  res.json(result);
}));

statsRouter.get("/top-merchants", asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
  const rows = await TransactionModel.aggregate([
    { $match: baseMatch(req.query as Record<string, unknown>) },
    { $group: { _id: "$merchant", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, merchant: "$_id", total: 1, count: 1 } },
    { $sort: { total: -1 } },
    { $limit: limit },
  ]);
  res.json(rows);
}));

statsRouter.get("/future-installments", asyncHandler(async (req, res) => {
  const currency: Currency = req.query.currency === "USD" ? "USD" : "ARS";
  const txs = await TransactionModel.find(installmentMatch(req.query as Record<string, unknown>)).lean();
  const mapped = txs.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount, currency: t.currency as Currency,
    isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent ?? null, installmentTotal: t.installmentTotal ?? null,
  }));
  res.json(computeFutureInstallments(mapped, currency));
}));

statsRouter.get("/future-installments/detail", asyncHandler(async (req, res) => {
  const currency: Currency = req.query.currency === "USD" ? "USD" : "ARS";
  const txs = await TransactionModel.find(installmentMatch(req.query as Record<string, unknown>)).lean();
  const mapped = txs.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount, currency: t.currency as Currency,
    isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent ?? null, installmentTotal: t.installmentTotal ?? null,
    merchant: t.merchant, category: t.category,
  }));
  res.json(computeFutureInstallmentsDetail(mapped, currency));
}));

statsRouter.get("/summary", asyncHandler(async (req, res) => {
  const currency: Currency = req.query.currency === "USD" ? "USD" : "ARS";
  const match = baseMatch(req.query as Record<string, unknown>);
  const [agg] = await TransactionModel.aggregate([
    { $match: match },
    { $group: { _id: null, totalPurchases: { $sum: "$amount" }, transactionCount: { $sum: 1 } } },
  ]);
  const installmentTxs = await TransactionModel.find(installmentMatch(req.query as Record<string, unknown>)).lean();
  const future = computeFutureInstallments(
    installmentTxs.map((t) => ({
      date: t.date.toISOString().slice(0, 10), amount: t.amount, currency: t.currency as Currency,
      isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent ?? null, installmentTotal: t.installmentTotal ?? null,
    })),
    currency,
  );
  const cardLabel = req.query.cardLabel;
  res.json({
    currency,
    totalPurchases: agg?.totalPurchases ?? 0,
    transactionCount: agg?.transactionCount ?? 0,
    statementCount: await StatementModel.countDocuments(typeof cardLabel === "string" ? { cardLabel } : {}),
    futureInstallmentTotal: future.reduce((acc, f) => acc + f.total, 0),
  });
}));
