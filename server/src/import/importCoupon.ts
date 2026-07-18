import { createHash } from "node:crypto";
import { parseCoupon } from "../ingestion/parseCoupon.js";
import { MortgageCouponModel } from "../db/models.js";
import { fetchOficialRate } from "../fx/dollarRate.js";

export async function importCoupon(input: {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
}): Promise<{ status: "imported" | "duplicate"; couponId: string }> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");
  const { coupon } = await parseCoupon(input.data);

  const existing = await MortgageCouponModel.findOne({
    prestamoNro: coupon.prestamoNro,
    cuotaNro: coupon.cuotaNro,
  });
  if (existing && !input.replace) return { status: "duplicate", couponId: existing._id.toString() };
  if (existing && input.replace) await MortgageCouponModel.deleteOne({ _id: existing._id });

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
    sourceFileName: input.fileName,
    sourceHash,
    tipoCambioUsd,
    tipoCambioSource: tipoCambioUsd != null ? "api" : null,
  });
  return { status: "imported", couponId: created._id.toString() };
}
