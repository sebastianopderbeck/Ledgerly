import { Router } from "express";
import type { Options } from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { importPdf } from "../../import/importPdf.js";
import { importCouponImage } from "../../import/importCouponImage.js";
import { IngestionError } from "../../ingestion/errors.js";
import { userIdOf } from "../../auth/requireUser.js";
import { uploadSingleFile } from "../uploadFile.js";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/heic"]);
const IMAGE_EXTENSION = /\.(png|jpe?g|heic)$/i;
const UNSUPPORTED_FILE = "Sólo se aceptan PDF o imágenes (PNG, JPG, HEIC)";

const isPdf = (file: Express.Multer.File): boolean =>
  file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname);

const isImage = (file: Express.Multer.File): boolean =>
  IMAGE_TYPES.has(file.mimetype) || IMAGE_EXTENSION.test(file.originalname);

const acceptsPdfOrImage: Options["fileFilter"] = (_req, file, cb) => {
  if (!isPdf(file) && !isImage(file)) {
    cb(new HttpError(400, UNSUPPORTED_FILE));
    return;
  }
  cb(null, true);
};

export const importRouter = Router();

importRouter.post("/", uploadSingleFile(acceptsPdfOrImage), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Falta el archivo (campo 'file')");
  const importFile = isPdf(req.file) ? importPdf : importCouponImage;
  try {
    const { result } = await importFile({
      userId: userIdOf(req),
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
