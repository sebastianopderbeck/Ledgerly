import { Router, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { extractPdfText } from "../../pdf/extract.js";
import { detectDocumentKind } from "../../ingestion/detectDocumentKind.js";
import { importCoupon } from "../../import/importCoupon.js";
import { importStatement } from "../../import/importStatement.js";
import { importAutoCoupon } from "../../import/importAutoCoupon.js";
import { importPayslip } from "../../import/importPayslip.js";
import { AutoCouponModel, MortgageCouponModel, PayslipModel, StatementModel } from "../../db/models.js";
import { toAutoCouponDTO, toMortgageCouponDTO, toPayslipDTO, toStatementDTO } from "../mappers.js";
import {
  InvalidAutoCouponError, InvalidCouponError, InvalidPayslipError, NoTextError, NoTransactionsError, UnsupportedFormatError,
} from "../../ingestion/errors.js";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const isPdf = (file: Express.Multer.File): boolean =>
  file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isPdf(file)) {
      cb(new HttpError(400, "Sólo se aceptan archivos PDF"));
      return;
    }
    cb(null, true);
  },
});

const uploadPdf = (req: Request, res: Response, next: NextFunction): void => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new HttpError(413, `El archivo supera el máximo de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`));
        return;
      }
      next(new HttpError(400, "Subida inválida"));
      return;
    }
    next(err);
  });
};

export const importRouter = Router();

importRouter.post("/", uploadPdf, asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Falta el archivo (campo 'file')");
  const replace = req.query.replace === "true";
  try {
    const { text, meta } = await extractPdfText(req.file.buffer);
    if (text.trim().length < 20) throw new NoTextError();
    const kind = detectDocumentKind(text, meta);

    if (kind === "coupon") {
      const result = await importCoupon({ data: req.file.buffer, fileName: req.file.originalname, replace, extracted: { text, meta } });
      const doc = await MortgageCouponModel.findById(result.couponId);
      res.status(result.status === "duplicate" ? 200 : 201)
        .json({ kind: "coupon", status: result.status, coupon: toMortgageCouponDTO(doc!) });
      return;
    }
    if (kind === "auto") {
      const result = await importAutoCoupon({ data: req.file.buffer, fileName: req.file.originalname, replace, extracted: { text, meta } });
      const doc = await AutoCouponModel.findById(result.couponId);
      res.status(result.status === "duplicate" ? 200 : 201)
        .json({ kind: "auto", status: result.status, coupon: toAutoCouponDTO(doc!) });
      return;
    }
    if (kind === "payslip") {
      const result = await importPayslip({ data: req.file.buffer, fileName: req.file.originalname, replace, extracted: { text, meta } });
      const doc = await PayslipModel.findById(result.payslipId);
      res.status(result.status === "duplicate" ? 200 : 201)
        .json({ kind: "payslip", status: result.status, payslip: toPayslipDTO(doc!) });
      return;
    }
    if (kind === "statement") {
      const result = await importStatement({ data: req.file.buffer, fileName: req.file.originalname, replace, extracted: { text, meta } });
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
      || err instanceof InvalidAutoCouponError || err instanceof InvalidPayslipError) {
      throw new HttpError(422, err.message);
    }
    throw err;
  }
}));
