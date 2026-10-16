import type { Types } from "mongoose";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { requireOwnerId } from "../auth/owner.js";
import { AutoCouponModel } from "../db/models.js";
import { createRateResolver } from "../fx/rateCache.js";
import { refreshDocRates, type RateRefreshCount } from "./refreshRates.js";

export async function backfillAutoRates(userId: Types.ObjectId): Promise<RateRefreshCount> {
  const docs = await AutoCouponModel.find({ userId, tipoCambioUsd: null });
  return refreshDocRates(docs, (doc) => doc.fechaVencimiento, createRateResolver());
}

if (process.argv[1]?.endsWith("backfillAutoRates.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillAutoRates(await requireOwnerId(process.env));
  console.log(`TC auto backfill: ${r.updated} actualizados, ${r.skipped} sin dato`);
  await disconnectMongo();
}
