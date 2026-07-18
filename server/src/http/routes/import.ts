import { Router } from "express";
import multer from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { extractPdfText } from "../../pdf/extract.js";
import { detectDocumentKind } from "../../ingestion/detectDocumentKind.js";
import { importCoupon } from "../../import/importCoupon.js";
import { importStatement } from "../../import/importStatement.js";
import { importAutoCoupon } from "../../import/importAutoCoupon.js";
import { AutoCouponModel, MortgageCouponModel, StatementModel } from "../../db/models.js";
import { toAutoCouponDTO, toMortgageCouponDTO, toStatementDTO } from "../mappers.js";
import {
  InvalidAutoCouponError, InvalidCouponError, NoTextError, NoTransactionsError, UnsupportedFormatError,
} from "../../ingestion/errors.js";

const upload = multer({ storage: multer.memoryStorage() });
export const importRouter = Router();

importRouter.post("/", upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Falta el archivo (campo 'file')");
  const replace = req.query.replace === "true";
  try {
    const { text, meta } = await extractPdfText(req.file.buffer);
    if (text.trim().length < 20) throw new NoTextError();
    const kind = detectDocumentKind(text, meta);

    if (kind === "coupon") {
      const result = await importCoupon({ data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await MortgageCouponModel.findById(result.couponId);
      res.status(result.status === "duplicate" ? 200 : 201)
        .json({ kind: "coupon", status: result.status, coupon: toMortgageCouponDTO(doc!) });
      return;
    }
    if (kind === "auto") {
      const result = await importAutoCoupon({ data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await AutoCouponModel.findById(result.couponId);
      res.status(result.status === "duplicate" ? 200 : 201)
        .json({ kind: "auto", status: result.status, coupon: toAutoCouponDTO(doc!) });
      return;
    }
    if (kind === "statement") {
      const result = await importStatement({ data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await StatementModel.findById(result.statementId);
      res.status(result.status === "duplicate" ? 200 : 201).json({
        kind: "statement", status: result.status,
        statement: toStatementDTO(doc!, result.transactionCount), transactionCount: result.transactionCount,
      });
      return;
    }
    throw new UnsupportedFormatError();
  } catch (err) {
    if (err instanceof NoTextError || err instanceof UnsupportedFormatError
      || err instanceof NoTransactionsError || err instanceof InvalidCouponError
      || err instanceof InvalidAutoCouponError) {
      throw new HttpError(422, err.message);
    }
    throw err;
  }
}));
