import { Router } from "express";
import multer from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { importStatement } from "../../import/importStatement.js";
import { StatementModel, TransactionModel } from "../../db/models.js";
import { userIdOf } from "../../auth/requireUser.js";
import { toStatementDTO, toTransactionDTO } from "../mappers.js";
import {
  NoTextError, NoTransactionsError, UnsupportedFormatError,
} from "../../ingestion/errors.js";

const upload = multer({ storage: multer.memoryStorage() });
export const statementsRouter = Router();

statementsRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Falta el archivo (campo 'file')");
    const userId = userIdOf(req);
    const replace = req.query.replace === "true";
    try {
      const result = await importStatement({ userId, data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await StatementModel.findOne({ _id: result.statementId, userId });
      const body = {
        status: result.status,
        statement: toStatementDTO(doc!, result.transactionCount),
        transactionCount: result.transactionCount,
      };
      res.status(result.status === "duplicate" ? 200 : 201).json(body);
    } catch (err) {
      if (err instanceof NoTextError || err instanceof UnsupportedFormatError || err instanceof NoTransactionsError) {
        throw new HttpError(422, err.message);
      }
      throw err;
    }
  }),
);

statementsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const docs = await StatementModel.find({ userId }).sort({ closingDate: -1 });
    const dtos = await Promise.all(
      docs.map(async (d) => toStatementDTO(d, await TransactionModel.countDocuments({ userId, statementId: d._id }))),
    );
    res.json(dtos);
  }),
);

statementsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const doc = await StatementModel.findOne({ _id: req.params.id, userId });
    if (!doc) throw new HttpError(404, "Statement no encontrado");
    const txs = await TransactionModel.find({ userId, statementId: doc._id }).sort({ date: 1 });
    res.json({
      statement: toStatementDTO(doc, txs.length),
      transactions: txs.map(toTransactionDTO),
    });
  }),
);

statementsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    await TransactionModel.deleteMany({ userId, statementId: req.params.id });
    await StatementModel.deleteOne({ _id: req.params.id, userId });
    res.status(204).end();
  }),
);
