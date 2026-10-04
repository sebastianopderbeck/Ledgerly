import { Router, type Request } from "express";
import type { Currency, Direction, Issuer, SubscriptionsReportDTO, TxType } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { HiddenSubscriptionModel, StatementModel, TransactionModel } from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import {
  detectSubscriptions,
  latestClosingByIssuer,
  summarizeSubscriptions,
  type SubscriptionTx,
} from "../../stats/subscriptions.js";

const MAX_CLAVE = 60;

export const subscriptionsRouter = Router();

const hiddenKeyOf = (req: Request): string => {
  const key = String(req.params.key ?? "").trim();
  if (key === "" || key.length > MAX_CLAVE) throw new HttpError(400, "Clave inválida");
  return key;
};

subscriptionsRouter.get("/", asyncHandler(async (_req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const [transactions, statements, hidden, cotizacion] = await Promise.all([
    TransactionModel.find({ isInstallment: false, type: { $in: ["purchase", "refund"] } }).lean(),
    StatementModel.find({}, { issuer: 1, closingDate: 1 }).lean(),
    HiddenSubscriptionModel.find().lean(),
    fetchOficialRate(hoy),
  ]);
  const txs: SubscriptionTx[] = transactions.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    merchant: t.merchant,
    amount: t.amount,
    currency: t.currency as Currency,
    direction: t.direction as Direction,
    type: t.type as TxType,
    isInstallment: t.isInstallment,
    category: t.category,
    issuer: t.issuer as Issuer,
    cardLabel: t.cardLabel,
  }));
  const items = detectSubscriptions(txs, {
    hoy,
    ultimoCierre: latestClosingByIssuer(statements.map((s) => ({ issuer: s.issuer, closingDate: s.closingDate ?? null }))),
    ocultas: new Set(hidden.map((h) => h.key)),
    cotizacion,
  });
  const report: SubscriptionsReportDTO = { cotizacionOficial: cotizacion, ...summarizeSubscriptions(items), items };
  res.json(report);
}));

subscriptionsRouter.put("/hidden/:key", asyncHandler(async (req, res) => {
  const key = hiddenKeyOf(req);
  await HiddenSubscriptionModel.updateOne({ key }, { $setOnInsert: { key } }, { upsert: true });
  res.status(204).end();
}));

subscriptionsRouter.delete("/hidden/:key", asyncHandler(async (req, res) => {
  const key = hiddenKeyOf(req);
  await HiddenSubscriptionModel.deleteOne({ key });
  res.status(204).end();
}));
