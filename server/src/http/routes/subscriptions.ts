import { Router, type Request } from "express";
import { isValidObjectId } from "mongoose";
import {
  manualSubscriptionInputSchema,
  subscriptionCadenceInputSchema,
  type Currency,
  type Direction,
  type Issuer,
  type SubscriptionsReportDTO,
  type TxType,
} from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import {
  HiddenSubscriptionModel, ManualSubscriptionModel, StatementModel, SubscriptionCadenceModel, TransactionModel,
} from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import { merchantKey } from "../../stats/merchantKey.js";
import {
  detectSubscriptions,
  latestClosingByIssuer,
  summarizeSubscriptions,
  type SubscriptionTx,
} from "../../stats/subscriptions.js";

const MAX_CLAVE = 60;
const INVALID_TRANSACTION = "Movimiento inválido";
const TRANSACTION_NOT_FOUND = "Movimiento no encontrado";
const UNRECOGNIZABLE_MERCHANT = "Este comercio no tiene un nombre reconocible";
const INVALID_CADENCE = "Cadencia inválida";

export const subscriptionsRouter = Router();

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const keyParamOf = (req: Request): string => {
  const key = String(req.params.key ?? "").trim();
  if (key === "" || key.length > MAX_CLAVE) throw new HttpError(400, "Clave inválida");
  return key;
};

subscriptionsRouter.get("/", asyncHandler(async (_req, res) => {
  const hoy = isoDay(new Date());
  const [transactions, statements, hidden, manual, cadences, cotizacion] = await Promise.all([
    TransactionModel.find({ isInstallment: false, type: { $in: ["purchase", "refund"] } }).lean(),
    StatementModel.find({}, { issuer: 1, closingDate: 1 }).lean(),
    HiddenSubscriptionModel.find().lean(),
    ManualSubscriptionModel.find().lean(),
    SubscriptionCadenceModel.find(),
    fetchOficialRate(hoy),
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
  }));
  const items = detectSubscriptions(txs, {
    hoy,
    ultimoCierre: latestClosingByIssuer(statements.map((s) => ({ issuer: s.issuer, closingDate: s.closingDate ?? null }))),
    ocultas: new Set(hidden.map((h) => h.key)),
    manuales: new Set(manual.map((m) => m.key)),
    cobrosMarcados: new Map(manual.map(({ key, cobros = [] }) => [
      key,
      cobros.map(({ date, amount, currency }) => ({ date, amount, currency: currency as Currency })),
    ])),
    cadencias: new Map(cadences.map(({ key, cadencia }) => [key, cadencia])),
    cotizacion,
  });
  const report: SubscriptionsReportDTO = { cotizacionOficial: cotizacion, ...summarizeSubscriptions(items), items };
  res.json(report);
}));

subscriptionsRouter.put("/hidden/:key", asyncHandler(async (req, res) => {
  const key = keyParamOf(req);
  await HiddenSubscriptionModel.updateOne({ key }, { $setOnInsert: { key } }, { upsert: true });
  res.status(204).end();
}));

subscriptionsRouter.delete("/hidden/:key", asyncHandler(async (req, res) => {
  const key = keyParamOf(req);
  await HiddenSubscriptionModel.deleteOne({ key });
  res.status(204).end();
}));

subscriptionsRouter.post("/manual", asyncHandler(async (req, res) => {
  const parsed = manualSubscriptionInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_TRANSACTION);
  const { transactionId } = parsed.data;
  const transaction = isValidObjectId(transactionId) ? await TransactionModel.findById(transactionId).lean() : null;
  if (!transaction) throw new HttpError(404, TRANSACTION_NOT_FOUND);
  const key = merchantKey(transaction.merchant);
  if (key === "") throw new HttpError(400, UNRECOGNIZABLE_MERCHANT);
  const cobro = { date: isoDay(transaction.date), amount: transaction.amount, currency: transaction.currency };
  await Promise.all([
    ManualSubscriptionModel.updateOne({ key }, { $setOnInsert: { key }, $addToSet: { cobros: cobro } }, { upsert: true }),
    HiddenSubscriptionModel.deleteOne({ key }),
  ]);
  res.status(204).end();
}));

subscriptionsRouter.put("/cadence/:key", asyncHandler(async (req, res) => {
  const key = keyParamOf(req);
  const parsed = subscriptionCadenceInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_CADENCE);
  const { cadencia } = parsed.data;
  if (cadencia === "mensual") await SubscriptionCadenceModel.deleteOne({ key });
  else await SubscriptionCadenceModel.updateOne({ key }, { $set: { cadencia } }, { upsert: true });
  res.status(204).end();
}));
