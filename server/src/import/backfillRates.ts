import type { Types } from "mongoose";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { requireOwnerId } from "../auth/owner.js";
import { MortgageCouponModel } from "../db/models.js";
import { createRateResolver } from "../fx/rateCache.js";
import { refreshDocRates, type RateRefreshCount } from "./refreshRates.js";

export async function backfillCouponRates(userId: Types.ObjectId): Promise<RateRefreshCount> {
  const docs = await MortgageCouponModel.find({ userId, tipoCambioUsd: null });
  return refreshDocRates(docs, (doc) => doc.fechaDebito, createRateResolver());
}

if (process.argv[1]?.endsWith("backfillRates.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillCouponRates(await requireOwnerId(process.env));
  console.log(`TC backfill: ${r.updated} actualizados, ${r.skipped} sin dato`);
  await disconnectMongo();
}
