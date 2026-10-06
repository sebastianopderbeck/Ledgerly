import { createHash } from "node:crypto";
import type { ParsedCoupon, ParsedCouponImage } from "@ledgerly/shared";
import type { HydratedDocument } from "mongoose";
import { MortgageCouponModel, type MortgageCouponDoc } from "../db/models.js";
import {
  CouponImageMismatchError, CouponImageTotalsError, MissingPreviousCouponError, UnrecognizedCouponImageError,
} from "../ingestion/errors.js";
import { recognizeImage } from "../ocr/recognizeImage.js";
import { toLines } from "../ocr/toLines.js";
import { icbcMortgageImageParser, totalsMatch } from "../parsers/icbcMortgageImage.js";
import { monthOf, monthsBetween } from "../stats/months.js";
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

const latestCoupon = async (): Promise<HydratedDocument<MortgageCouponDoc>> => {
  const latest = await MortgageCouponModel.findOne().sort({ fechaDebito: -1 });
  if (!latest) throw new MissingPreviousCouponError();
  return latest;
};

const matchesLatest = (image: ParsedCouponImage, latest: MortgageCouponDoc): boolean => {
  const elapsedMonths = monthsBetween(monthOf(latest.fechaDebito.toISOString()), monthOf(image.fechaDebito));
  const sameUva = Math.round(image.totalUva * 100) === Math.round(latest.cuotaPuraUva * 100);
  return image.cuotaNro - latest.cuotaNro === elapsedMonths && sameUva;
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
  const latest = await latestCoupon();
  if (!matchesLatest(image, latest)) throw new CouponImageMismatchError();
  const { prestamoNro, tea, tna, cft } = latest;
  const coupon = toParsedCoupon(image, { prestamoNro, tea, tna, cft });
  const sourceHash = createHash("sha256").update(data).digest("hex");
  return mortgageCouponOutcome(await saveCoupon({ coupon, fileName, sourceHash, replace }));
}
