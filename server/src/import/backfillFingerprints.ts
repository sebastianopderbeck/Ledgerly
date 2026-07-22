import { connectMongo, disconnectMongo } from "../db/connection.js";
import { TransactionModel } from "../db/models.js";
import { fingerprintOf } from "./importStatement.js";

export async function backfillFingerprints(): Promise<{ updated: number }> {
  const docs = await TransactionModel.find({});
  let updated = 0;
  for (const doc of docs) {
    const fingerprint = fingerprintOf(
      doc.issuer, doc.date.toISOString().slice(0, 10), doc.comprobante ?? null,
      doc.amount, doc.currency, doc.installmentCurrent ?? null, doc.installmentTotal ?? null,
    );
    if (fingerprint !== doc.fingerprint) {
      doc.fingerprint = fingerprint;
      await doc.save();
      updated += 1;
    }
  }
  return { updated };
}

if (process.argv[1]?.endsWith("backfillFingerprints.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const result = await backfillFingerprints();
  console.log(`Fingerprints backfill: ${result.updated} actualizados`);
  await disconnectMongo();
}
