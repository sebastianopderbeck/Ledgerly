import { Router, type Request } from "express";
import { isValidObjectId } from "mongoose";
import {
  manualSubscriptionInputSchema,
  subscriptionCadenceInputSchema,
  type SubscriptionsReportDTO,
} from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import {
  HiddenSubscriptionModel, ManualSubscriptionModel, SubscriptionCadenceModel, TransactionModel,
} from "../../db/models.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import { merchantKey } from "../../stats/merchantKey.js";
import { detectSubscriptions, summarizeSubscriptions } from "../../stats/subscriptions.js";
import { loadSubscriptionInputs } from "../loadSubscriptions.js";
import { userIdOf } from "../../auth/requireUser.js";

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

subscriptionsRouter.get("/", asyncHandler(async (req, res) => {
  const hoy = isoDay(new Date());
  const [{ txs, ctx }, cotizacion] = await Promise.all([loadSubscriptionInputs(hoy, userIdOf(req)), fetchOficialRate(hoy)]);
  const items = detectSubscriptions(txs, { ...ctx, cotizacion });
  const report: SubscriptionsReportDTO = { cotizacionOficial: cotizacion, ...summarizeSubscriptions(items), items };
  res.json(report);
}));

subscriptionsRouter.put("/hidden/:key", asyncHandler(async (req, res) => {
  const key = keyParamOf(req);
  await HiddenSubscriptionModel.updateOne({ userId: userIdOf(req), key }, { $setOnInsert: { key } }, { upsert: true });
  res.status(204).end();
}));

subscriptionsRouter.delete("/hidden/:key", asyncHandler(async (req, res) => {
  const key = keyParamOf(req);
  await HiddenSubscriptionModel.deleteOne({ userId: userIdOf(req), key });
  res.status(204).end();
}));

subscriptionsRouter.post("/manual", asyncHandler(async (req, res) => {
  const parsed = manualSubscriptionInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_TRANSACTION);
  const { transactionId } = parsed.data;
  const userId = userIdOf(req);
  const transaction = isValidObjectId(transactionId) ? await TransactionModel.findOne({ _id: transactionId, userId }).lean() : null;
  if (!transaction) throw new HttpError(404, TRANSACTION_NOT_FOUND);
  const key = merchantKey(transaction.merchant);
  if (key === "") throw new HttpError(400, UNRECOGNIZABLE_MERCHANT);
  const cobro = { date: isoDay(transaction.date), amount: transaction.amount, currency: transaction.currency };
  await Promise.all([
    ManualSubscriptionModel.updateOne({ userId, key }, { $setOnInsert: { key }, $addToSet: { cobros: cobro } }, { upsert: true }),
    HiddenSubscriptionModel.deleteOne({ userId, key }),
  ]);
  res.status(204).end();
}));

subscriptionsRouter.put("/cadence/:key", asyncHandler(async (req, res) => {
  const key = keyParamOf(req);
  const parsed = subscriptionCadenceInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_CADENCE);
  const { cadencia } = parsed.data;
  const userId = userIdOf(req);
  if (cadencia === "mensual") await SubscriptionCadenceModel.deleteOne({ userId, key });
  else await SubscriptionCadenceModel.updateOne({ userId, key }, { $set: { cadencia } }, { upsert: true });
  res.status(204).end();
}));
