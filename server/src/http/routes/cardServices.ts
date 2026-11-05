import { Router, type Request } from "express";
import { isValidObjectId } from "mongoose";
import { cardServiceInputSchema } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { CardServiceModel, TransactionModel } from "../../db/models.js";
import { cardServiceList, isCardServiceCharge } from "../../stats/cardServices.js";
import { merchantKey } from "../../stats/merchantKey.js";
import { loadCardServiceGroups, toCardServiceTx, unmarkCardServiceGroup } from "../loadCardServices.js";
import { userIdOf } from "../../auth/requireUser.js";

const MAX_CLAVE = 60;
const INVALID_TRANSACTION = "Movimiento inválido";
const TRANSACTION_NOT_FOUND = "Movimiento no encontrado";
const UNRECOGNIZABLE_MERCHANT = "Este comercio no tiene un nombre reconocible";
const INVALID_KEY = "Clave inválida";

export const cardServicesRouter = Router();

const keyParamOf = (req: Request): string => {
  const key = String(req.params.key ?? "").trim();
  if (key === "" || key.length > MAX_CLAVE) throw new HttpError(400, INVALID_KEY);
  return key;
};

cardServicesRouter.get("/", asyncHandler(async (req, res) => {
  res.json(cardServiceList(await loadCardServiceGroups(userIdOf(req))));
}));

cardServicesRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = cardServiceInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_TRANSACTION);
  const { transactionId } = parsed.data;
  const userId = userIdOf(req);
  const transaction = isValidObjectId(transactionId) ? await TransactionModel.findOne({ _id: transactionId, userId }).lean() : null;
  if (!transaction) throw new HttpError(404, TRANSACTION_NOT_FOUND);
  if (!isCardServiceCharge(toCardServiceTx(transaction))) throw new HttpError(400, INVALID_TRANSACTION);
  const key = merchantKey(transaction.merchant);
  if (key === "") throw new HttpError(400, UNRECOGNIZABLE_MERCHANT);
  await CardServiceModel.updateOne({ userId, key }, { $setOnInsert: { key } }, { upsert: true });
  res.status(204).end();
}));

cardServicesRouter.delete("/:key", asyncHandler(async (req, res) => {
  await unmarkCardServiceGroup(userIdOf(req), keyParamOf(req));
  res.status(204).end();
}));
