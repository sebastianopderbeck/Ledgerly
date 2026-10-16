import type { RequestHandler } from "express";
import multer, { MulterError, type Options } from "multer";
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE } from "@ledgerly/shared";
import { HttpError } from "./errors.js";

const FIRST_REJECTED_SIZE = MAX_UPLOAD_BYTES + 1;

export function uploadSingleFile(fileFilter?: Options["fileFilter"]): RequestHandler {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: FIRST_REJECTED_SIZE, files: 1 }, fileFilter });
  return (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof MulterError) {
        next(err.code === "LIMIT_FILE_SIZE" ? new HttpError(413, UPLOAD_TOO_LARGE) : new HttpError(400, "Subida inválida"));
        return;
      }
      next(err);
    });
  };
}
