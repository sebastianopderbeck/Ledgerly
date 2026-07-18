import { connectMongo, disconnectMongo } from "../db/connection.js";
import { MortgageCouponModel } from "../db/models.js";
import { fetchOficialRate } from "../fx/dollarRate.js";

export async function backfillCouponRates(): Promise<{ updated: number; skipped: number }> {
  const docs = await MortgageCouponModel.find({ tipoCambioUsd: null });
  let updated = 0;
  let skipped = 0;
  for (const doc of docs) {
    const rate = await fetchOficialRate(doc.fechaDebito.toISOString().slice(0, 10)).catch(() => null);
    if (rate == null) {
      skipped += 1;
      continue;
    }
    doc.tipoCambioUsd = rate;
    doc.tipoCambioSource = "api";
    await doc.save();
    updated += 1;
  }
  return { updated, skipped };
}

if (process.argv[1]?.endsWith("backfillRates.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillCouponRates();
  console.log(`TC backfill: ${r.updated} actualizados, ${r.skipped} sin dato`);
  await disconnectMongo();
}
