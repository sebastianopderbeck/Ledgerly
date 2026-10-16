import { Router } from "express";
import { isValidObjectId, type Types } from "mongoose";
import {
  statementReviewPatchSchema,
  type StatementReviewDTO,
  type StatementReviewKeysDTO,
  type TransactionDTO,
} from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { userIdOf } from "../../auth/requireUser.js";
import { StatementModel, TransactionModel } from "../../db/models.js";
import { toStatementDTO, toTransactionDTO } from "../mappers.js";
import { statementsBefore, type StatementRecency } from "../../stats/lastStatement.js";
import { REVIEW_WINDOW, buildStatementReview } from "../../stats/statementReview.js";

export const statementReviewRouter = Router({ mergeParams: true });

const NOT_FOUND = "Resumen no encontrado";
const INVALID_BODY = "Cuerpo inválido: se espera { keys: string[], reviewed: boolean }";

interface StatementRecencySource {
  _id: Types.ObjectId;
  issuer: string;
  closingDate?: Date | null;
}

const recencyOf = (doc: StatementRecencySource): StatementRecency<Types.ObjectId> => ({
  id: doc._id,
  issuer: doc.issuer,
  closingDate: doc.closingDate ?? null,
  uploadedAt: (doc as unknown as { uploadedAt: Date }).uploadedAt,
});

const findStatement = async (id: string, userId: Types.ObjectId) => {
  const statement = isValidObjectId(id) ? await StatementModel.findOne({ _id: id, userId }) : null;
  if (!statement) throw new HttpError(404, NOT_FOUND);
  return statement;
};

const groupByStatement = (transactions: TransactionDTO[], statementIds: string[]): TransactionDTO[][] => {
  const groups = new Map<string, TransactionDTO[]>(statementIds.map((id) => [id, []]));
  for (const transaction of transactions) groups.get(transaction.statementId)?.push(transaction);
  return statementIds.map((id) => groups.get(id) ?? []);
};

statementReviewRouter.get("/", asyncHandler(async (req, res) => {
  const userId = userIdOf(req);
  const statement = await findStatement(req.params.id, userId);
  const others = await StatementModel.find({ userId, issuer: statement.issuer, _id: { $ne: statement._id } }).lean();
  const previous = statementsBefore(recencyOf(statement), others.map(recencyOf));
  const previousIds = previous.map(({ id }) => id);
  const windowIds = previousIds.slice(0, REVIEW_WINDOW);
  const [currentDocs, windowDocs, knownMerchants] = await Promise.all([
    TransactionModel.find({ userId, statementId: statement._id }).sort({ date: 1 }),
    TransactionModel.find({ userId, statementId: { $in: windowIds } }),
    TransactionModel.distinct("merchant", { userId, statementId: { $in: previousIds }, type: "purchase" }),
  ]);
  const current = currentDocs.map(toTransactionDTO);
  const history = groupByStatement(windowDocs.map(toTransactionDTO), windowIds.map(String));
  const { findings, skippedChecks } = buildStatementReview({
    current,
    history,
    knownMerchants: knownMerchants.map(String),
    previousStatements: previous.length,
  });
  const body: StatementReviewDTO = {
    statement: toStatementDTO(statement, current.length),
    previousStatements: previous.length,
    historyStatements: history.length,
    skippedChecks,
    findings,
    reviewedKeys: [...statement.reviewedKeys],
  };
  res.json(body);
}));

statementReviewRouter.patch("/", asyncHandler(async (req, res) => {
  const parsed = statementReviewPatchSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_BODY);
  const { keys, reviewed } = parsed.data;
  const update = reviewed
    ? { $addToSet: { reviewedKeys: { $each: keys } } }
    : { $pull: { reviewedKeys: { $in: keys } } };
  const { id } = req.params;
  const statement = isValidObjectId(id) ? await StatementModel.findOneAndUpdate({ _id: id, userId: userIdOf(req) }, update, { new: true }) : null;
  if (!statement) throw new HttpError(404, NOT_FOUND);
  const body: StatementReviewKeysDTO = { reviewedKeys: [...statement.reviewedKeys] };
  res.json(body);
}));
