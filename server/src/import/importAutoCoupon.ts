import type { ExtractedPdf } from "@ledgerly/shared";
import { createHash } from "node:crypto";
import type { Types } from "mongoose";
import { parseAutoCoupon } from "../ingestion/parseAutoCoupon.js";
import { AutoCouponModel } from "../db/models.js";
import { fetchOficialRate } from "../fx/dollarRate.js";

export async function importAutoCoupon(input: {
  userId: Types.ObjectId;
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
  extracted?: ExtractedPdf;
}): Promise<{ status: "imported" | "duplicate"; couponId: string }> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");
  const { coupon } = await parseAutoCoupon(input.data, input.extracted);

  const existing = await AutoCouponModel.findOne({
    userId: input.userId,
    grupo: coupon.grupo,
    orden: coupon.orden,
    cuotaNro: coupon.cuotaNro,
  });
  if (existing && !input.replace) return { status: "duplicate", couponId: existing._id.toString() };
  if (existing && input.replace) await AutoCouponModel.deleteOne({ _id: existing._id, userId: input.userId });

  const tipoCambioUsd = await fetchOficialRate(coupon.fechaVencimiento).catch(() => null);

  const created = await AutoCouponModel.create({
    userId: input.userId,
    grupo: coupon.grupo,
    orden: coupon.orden,
    cuotaNro: coupon.cuotaNro,
    plan: coupon.plan,
    fechaEmision: new Date(coupon.fechaEmision),
    fechaVencimiento: new Date(coupon.fechaVencimiento),
    comprobante: coupon.comprobante,
    modelo: coupon.modelo,
    valorMovil: coupon.valorMovil,
    conceptos: coupon.conceptos,
    totalAPagar: coupon.totalAPagar,
    sourceFileName: input.fileName,
    sourceHash,
    tipoCambioUsd,
    tipoCambioSource: tipoCambioUsd != null ? "api" : null,
  });
  return { status: "imported", couponId: created._id.toString() };
}
