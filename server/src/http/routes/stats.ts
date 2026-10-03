import { Router } from "express";
import type { FilterQuery } from "mongoose";
import { asyncHandler } from "../errors.js";
import { StatementModel, TransactionModel, type TransactionDoc, type StatementDoc } from "../../db/models.js";
import { computeFutureInstallments, computeFutureInstallmentsDetail, remainingInstallmentDebt } from "../../stats/futureInstallments.js";
import { representativeRateDate, consumptionMonth } from "../../stats/monthlyUsd.js";
import { latestStatementIdsPerIssuer } from "../../stats/lastStatement.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import type { Currency, MonthlyUsdStat } from "@ledgerly/shared";
import { monthInYears, parseYears, yearExpr } from "../yearFilter.js";

function baseMatch(q: Record<string, unknown>): FilterQuery<TransactionDoc> {
  const currency = q.currency === "USD" ? "USD" : "ARS";
  const match: FilterQuery<TransactionDoc> = { type: "purchase", currency };
  if (typeof q.cardLabel === "string") match.cardLabel = q.cardLabel;
  if (typeof q.from === "string" || typeof q.to === "string") {
    match.date = {};
    if (typeof q.from === "string") match.date.$gte = new Date(q.from);
    if (typeof q.to === "string") match.date.$lte = new Date(q.to);
  }
  const years = parseYears(q.year);
  if (years) match.$expr = yearExpr("date", years);
  return match;
}

async function latestStatementInstallmentTxs(q: Record<string, unknown>) {
  const statementFilter = typeof q.cardLabel === "string" ? { cardLabel: q.cardLabel } : {};
  const statements = await StatementModel.find(statementFilter).lean();
  const ids = latestStatementIdsPerIssuer(
    statements.map((s) => ({
      id: s._id,
      issuer: s.issuer,
      closingDate: s.closingDate ?? null,
      uploadedAt: (s as unknown as { uploadedAt: Date }).uploadedAt,
    })),
  );
  return TransactionModel.find({ type: "purchase", isInstallment: true, statementId: { $in: ids } }).lean();
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

statsRouter.get("/last-statement/by-category", asyncHandler(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const currency = q.currency === "USD" ? "USD" : "ARS";
  const filter: FilterQuery<StatementDoc> = {};
  if (typeof q.cardLabel === "string") filter.cardLabel = q.cardLabel;
  const statements = await StatementModel.find(filter).lean();
  const ids = latestStatementIdsPerIssuer(
    statements.map((s) => ({
      id: s._id,
      issuer: s.issuer,
      closingDate: s.closingDate ?? null,
      uploadedAt: (s as unknown as { uploadedAt: Date }).uploadedAt,
    })),
  );
  if (ids.length === 0) {
    res.json([]);
    return;
  }
  const rows = await TransactionModel.aggregate([
    { $match: { type: "purchase", currency, statementId: { $in: ids } } },
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
  const fromMonth = typeof q.from === "string" ? q.from.slice(0, 7) : null;
  const toMonth = typeof q.to === "string" ? q.to.slice(0, 7) : null;
  const inMonthRange = (month: string): boolean =>
    (fromMonth === null || month >= fromMonth) && (toMonth === null || month <= toMonth);
  const statements = await StatementModel.find(filter).lean();
  const totalArsByMonth = new Map<string, number>();
  for (const statement of statements) {
    if (!statement.closingDate) continue;
    const month = consumptionMonth(statement.closingDate.toISOString().slice(0, 10));
    totalArsByMonth.set(month, (totalArsByMonth.get(month) ?? 0) + (statement.totals?.saldoActual?.ars ?? 0));
  }
  const years = parseYears(q.year);
  const months = [...totalArsByMonth.keys()].filter((month) => monthInYears(month, years) && inMonthRange(month)).sort();
  const today = new Date().toISOString().slice(0, 10);
  const result: MonthlyUsdStat[] = [];
  for (const month of months) {
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
  const txs = await latestStatementInstallmentTxs(req.query as Record<string, unknown>);
  const mapped = txs.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount, currency: t.currency as Currency,
    isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent ?? null, installmentTotal: t.installmentTotal ?? null,
  }));
  const years = parseYears(req.query.year);
  res.json(computeFutureInstallments(mapped, currency).filter((row) => monthInYears(row.month, years)));
}));

statsRouter.get("/future-installments/detail", asyncHandler(async (req, res) => {
  const currency: Currency = req.query.currency === "USD" ? "USD" : "ARS";
  const txs = await latestStatementInstallmentTxs(req.query as Record<string, unknown>);
  const mapped = txs.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount, currency: t.currency as Currency,
    isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent ?? null, installmentTotal: t.installmentTotal ?? null,
    merchant: t.merchant, category: t.category,
  }));
  const years = parseYears(req.query.year);
  res.json(computeFutureInstallmentsDetail(mapped, currency).filter((row) => monthInYears(row.month, years)));
}));

statsRouter.get("/summary", asyncHandler(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const currency: Currency = q.currency === "USD" ? "USD" : "ARS";
  const [agg] = await TransactionModel.aggregate([
    { $match: baseMatch(q) },
    { $group: { _id: null, totalPurchases: { $sum: "$amount" }, transactionCount: { $sum: 1 } } },
  ]);
  const cardLabel = q.cardLabel;
  const installmentTxs = await latestStatementInstallmentTxs(q);
  const installments = installmentTxs.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount, currency: t.currency as Currency,
    isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent ?? null, installmentTotal: t.installmentTotal ?? null,
  }));
  const years = parseYears(q.year);
  const futureInstallmentTotal = years === null
    ? remainingInstallmentDebt(installments, currency)
    : computeFutureInstallments(installments, currency)
      .filter((row) => monthInYears(row.month, years))
      .reduce((acc, row) => acc + row.total, 0);
  res.json({
    currency,
    totalPurchases: agg?.totalPurchases ?? 0,
    transactionCount: agg?.transactionCount ?? 0,
    statementCount: await StatementModel.countDocuments(typeof cardLabel === "string" ? { cardLabel } : {}),
    futureInstallmentTotal,
  });
}));
