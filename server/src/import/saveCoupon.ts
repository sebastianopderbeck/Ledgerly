import type { ParsedCoupon } from "@ledgerly/shared";
import { MortgageCouponModel } from "../db/models.js";
import { fetchOficialRate } from "../fx/dollarRate.js";

export interface SaveCouponInput {
  coupon: ParsedCoupon;
  fileName: string;
  sourceHash: string;
  replace?: boolean;
}

export interface SaveCouponResult {
  status: "imported" | "duplicate";
  couponId: string;
}

export async function saveCoupon({ coupon, fileName, sourceHash, replace = false }: SaveCouponInput): Promise<SaveCouponResult> {
  const existing = await MortgageCouponModel.findOne({
    prestamoNro: coupon.prestamoNro,
    cuotaNro: coupon.cuotaNro,
  });
  if (existing && !replace) return { status: "duplicate", couponId: existing._id.toString() };
  if (existing && replace) await MortgageCouponModel.deleteOne({ _id: existing._id });

  const tipoCambioUsd = await fetchOficialRate(coupon.fechaDebito).catch(() => null);

  const created = await MortgageCouponModel.create({
    prestamoNro: coupon.prestamoNro,
    cuotaNro: coupon.cuotaNro,
    fechaDebito: new Date(coupon.fechaDebito),
    capital: coupon.capital,
    intereses: coupon.intereses,
    seguroIncendio: coupon.seguroIncendio,
    totalDebitado: coupon.totalDebitado,
    cuotaPuraUva: coupon.cuotaPuraUva,
    cotizacionUva: coupon.cotizacionUva,
    tea: coupon.tea,
    tna: coupon.tna,
    cft: coupon.cft,
    sourceFileName: fileName,
    sourceHash,
    tipoCambioUsd,
    tipoCambioSource: tipoCambioUsd != null ? "api" : null,
  });
  return { status: "imported", couponId: created._id.toString() };
}
