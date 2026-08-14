import { connectMongo, disconnectMongo } from "../db/connection.js";
import { MortgageCouponModel } from "../db/models.js";
import { createRateResolver } from "../fx/rateCache.js";
import { refreshDocRates, type RateRefreshCount } from "./refreshRates.js";

export async function backfillCouponRates(): Promise<RateRefreshCount> {
  const docs = await MortgageCouponModel.find({ tipoCambioUsd: null });
  return refreshDocRates(docs, (doc) => doc.fechaDebito, createRateResolver());
}

if (process.argv[1]?.endsWith("backfillRates.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillCouponRates();
  console.log(`TC backfill: ${r.updated} actualizados, ${r.skipped} sin dato`);
  await disconnectMongo();
}
