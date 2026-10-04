import { Router, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { importPdf, MAX_PDF_BYTES } from "../../import/importPdf.js";
import { IngestionError } from "../../ingestion/errors.js";

export const MAX_UPLOAD_BYTES = MAX_PDF_BYTES;

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
  try {
    const { result } = await importPdf({
      data: req.file.buffer,
      fileName: req.file.originalname,
      replace: req.query.replace === "true",
    });
    res.status(result.status === "duplicate" ? 200 : 201).json(result);
  } catch (err) {
    if (err instanceof IngestionError) throw new HttpError(422, err.message);
    throw err;
  }
}));
