import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Types } from "mongoose";
import { requireOwnerId } from "../auth/owner.js";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { importCoupon } from "./importCoupon.js";

export async function seedCoupons(dir: string, userId: Types.ObjectId): Promise<{ imported: number; duplicates: number }> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
  let imported = 0;
  let duplicates = 0;
  for (const file of files) {
    const data = new Uint8Array(readFileSync(`${dir}${file}`));
    const result = await importCoupon({ userId, data, fileName: file });
    if (result.status === "imported") imported += 1;
    else duplicates += 1;
  }
  return { imported, duplicates };
}

if (process.argv[1]?.endsWith("seedCoupons.ts")) {
  const dir = fileURLToPath(new URL("../../../examples/credito/", import.meta.url));
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const result = await seedCoupons(dir, await requireOwnerId(process.env));
  console.log(`Cupones: ${result.imported} importados, ${result.duplicates} duplicados`);
  await disconnectMongo();
}
