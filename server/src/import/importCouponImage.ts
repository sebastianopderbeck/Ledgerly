import { createHash } from "node:crypto";
import type { ParsedCoupon, ParsedCouponImage } from "@ledgerly/shared";
import { MortgageCouponModel, type MortgageCouponDoc } from "../db/models.js";
import {
  CouponImageTotalsError, MissingPreviousCouponError, UnrecognizedCouponImageError,
} from "../ingestion/errors.js";
import { recognizeImage } from "../ocr/recognizeImage.js";
import { toLines } from "../ocr/toLines.js";
import { icbcMortgageImageParser, totalsMatch } from "../parsers/icbcMortgageImage.js";
import { mortgageCouponOutcome, type ImportPdfInput, type ImportPdfOutcome } from "./importPdf.js";
import { saveCoupon } from "./saveCoupon.js";

type LoanTerms = Pick<MortgageCouponDoc, "prestamoNro" | "tea" | "tna" | "cft">;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const readCoupon = (text: string): ParsedCouponImage => {
  if (!icbcMortgageImageParser.detect(text)) throw new UnrecognizedCouponImageError();
  try {
    return icbcMortgageImageParser.parse(text);
  } catch {
    throw new UnrecognizedCouponImageError();
  }
};

const latestLoanTerms = async (): Promise<LoanTerms> => {
  const latest = await MortgageCouponModel.findOne().sort({ fechaDebito: -1 });
  if (!latest) throw new MissingPreviousCouponError();
  const { prestamoNro, tea, tna, cft } = latest;
  return { prestamoNro, tea, tna, cft };
};

const toParsedCoupon = (image: ParsedCouponImage, terms: LoanTerms): ParsedCoupon => ({
  ...terms,
  cuotaNro: image.cuotaNro,
  fechaDebito: image.fechaDebito,
  capital: image.capital,
  intereses: image.intereses,
  seguroIncendio: image.seguros,
  totalDebitado: image.totalPagado,
  cuotaPuraUva: image.totalUva,
  cotizacionUva: round2((image.capital + image.intereses) / image.totalUva),
});

export async function importCouponImage({ data, fileName, replace = false }: ImportPdfInput): Promise<ImportPdfOutcome> {
  const image = readCoupon(toLines(await recognizeImage(data, fileName)));
  if (!totalsMatch(image)) throw new CouponImageTotalsError();
  const coupon = toParsedCoupon(image, await latestLoanTerms());
  const sourceHash = createHash("sha256").update(data).digest("hex");
  return mortgageCouponOutcome(await saveCoupon({ coupon, fileName, sourceHash, replace }));
}
