import { connectMongo, disconnectMongo } from "../db/connection.js";
import { AutoCouponModel } from "../db/models.js";
import { createRateResolver } from "../fx/rateCache.js";
import { refreshDocRates, type RateRefreshCount } from "./refreshRates.js";

export async function backfillAutoRates(): Promise<RateRefreshCount> {
  const docs = await AutoCouponModel.find({ tipoCambioUsd: null });
  return refreshDocRates(docs, (doc) => doc.fechaVencimiento, createRateResolver());
}

if (process.argv[1]?.endsWith("backfillAutoRates.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillAutoRates();
  console.log(`TC auto backfill: ${r.updated} actualizados, ${r.skipped} sin dato`);
  await disconnectMongo();
}
