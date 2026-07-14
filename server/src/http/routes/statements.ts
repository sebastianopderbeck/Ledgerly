import { Router } from "express";
import multer from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { importStatement } from "../../import/importStatement.js";
import { StatementModel, TransactionModel } from "../../db/models.js";
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
    const replace = req.query.replace === "true";
    try {
      const result = await importStatement({ data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await StatementModel.findById(result.statementId);
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
  asyncHandler(async (_req, res) => {
    const docs = await StatementModel.find().sort({ closingDate: -1 });
    const dtos = await Promise.all(
      docs.map(async (d) => toStatementDTO(d, await TransactionModel.countDocuments({ statementId: d._id }))),
    );
    res.json(dtos);
  }),
);

statementsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await StatementModel.findById(req.params.id);
    if (!doc) throw new HttpError(404, "Statement no encontrado");
    const txs = await TransactionModel.find({ statementId: doc._id }).sort({ date: 1 });
    res.json({
      statement: toStatementDTO(doc, txs.length),
      transactions: txs.map(toTransactionDTO),
    });
  }),
);

statementsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await TransactionModel.deleteMany({ statementId: req.params.id });
    await StatementModel.deleteOne({ _id: req.params.id });
    res.status(204).end();
  }),
);
