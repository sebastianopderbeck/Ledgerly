import type { ExtractedPdf, ImportedFileDTO, ImportedFileKind, ImportResultUnionDTO } from "@ledgerly/shared";
import { extractPdfText } from "../pdf/extract.js";
import { detectDocumentKind } from "../ingestion/detectDocumentKind.js";
import { EncryptedPdfError, NoTextError, UnsupportedFormatError } from "../ingestion/errors.js";
import { AutoCouponModel, MortgageCouponModel, PayslipModel, StatementModel } from "../db/models.js";
import {
  autoCouponToImportedFileDTO, mortgageCouponToImportedFileDTO, payslipToImportedFileDTO, statementToImportedFileDTO,
  toAutoCouponDTO, toMortgageCouponDTO, toPayslipDTO, toStatementDTO,
} from "../http/mappers.js";
import { importAutoCoupon } from "./importAutoCoupon.js";
import { importCoupon } from "./importCoupon.js";
import { importPayslip } from "./importPayslip.js";
import { importStatement } from "./importStatement.js";
import type { SaveCouponResult } from "./saveCoupon.js";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MIN_TEXT_LENGTH = 20;

export interface ImportPdfInput {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
}

export interface ImportPdfOutcome {
  result: ImportResultUnionDTO;
  file: ImportedFileDTO;
}

interface KindImportInput {
  data: Uint8Array;
  fileName: string;
  replace: boolean;
  extracted: ExtractedPdf;
}

type KindImporter = (input: KindImportInput) => Promise<ImportPdfOutcome>;

const isPasswordError = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { name?: unknown }).name === "PasswordException";

const extract = async (data: Uint8Array): Promise<ExtractedPdf> => {
  try {
    return await extractPdfText(data);
  } catch (err) {
    if (isPasswordError(err)) throw new EncryptedPdfError();
    throw err;
  }
};

const found = <T>(doc: T): NonNullable<T> => {
  if (!doc) throw new Error("No se encontró el documento recién importado");
  return doc;
};

const importStatementPdf: KindImporter = async (input) => {
  const { status, statementId, transactionCount } = await importStatement(input);
  const doc = found(await StatementModel.findById(statementId));
  return {
    result: { kind: "statement", status, statement: toStatementDTO(doc, transactionCount), transactionCount },
    file: statementToImportedFileDTO(doc, transactionCount),
  };
};

export const mortgageCouponOutcome = async ({ status, couponId }: SaveCouponResult): Promise<ImportPdfOutcome> => {
  const doc = found(await MortgageCouponModel.findById(couponId));
  return {
    result: { kind: "coupon", status, coupon: toMortgageCouponDTO(doc) },
    file: mortgageCouponToImportedFileDTO(doc),
  };
};

const importMortgageCouponPdf: KindImporter = async (input) => mortgageCouponOutcome(await importCoupon(input));

const importAutoCouponPdf: KindImporter = async (input) => {
  const { status, couponId } = await importAutoCoupon(input);
  const doc = found(await AutoCouponModel.findById(couponId));
  return {
    result: { kind: "auto", status, coupon: toAutoCouponDTO(doc) },
    file: autoCouponToImportedFileDTO(doc),
  };
};

const importPayslipPdf: KindImporter = async (input) => {
  const { status, payslipId } = await importPayslip(input);
  const doc = found(await PayslipModel.findById(payslipId));
  return {
    result: { kind: "payslip", status, payslip: toPayslipDTO(doc) },
    file: payslipToImportedFileDTO(doc),
  };
};

const importers: Record<ImportedFileKind, KindImporter> = {
  statement: importStatementPdf,
  coupon: importMortgageCouponPdf,
  auto: importAutoCouponPdf,
  payslip: importPayslipPdf,
};

export async function importPdf({ data, fileName, replace = false }: ImportPdfInput): Promise<ImportPdfOutcome> {
  const extracted = await extract(data);
  if (extracted.text.trim().length < MIN_TEXT_LENGTH) throw new NoTextError();
  const kind = detectDocumentKind(extracted.text, extracted.meta);
  if (kind === "unknown") throw new UnsupportedFormatError();
  return importers[kind]({ data, fileName, replace, extracted });
}
