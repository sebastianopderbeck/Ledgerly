import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { importCoupon } from "./importCoupon.js";

export async function seedCoupons(dir: string): Promise<{ imported: number; duplicates: number }> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
  let imported = 0;
  let duplicates = 0;
  for (const file of files) {
    const data = new Uint8Array(readFileSync(`${dir}${file}`));
    const result = await importCoupon({ data, fileName: file });
    if (result.status === "imported") imported += 1;
    else duplicates += 1;
  }
  return { imported, duplicates };
}

if (import.meta.main) {
  const dir = fileURLToPath(new URL("../../../examples/credito/", import.meta.url));
  await mongoose.connect(process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly");
  const result = await seedCoupons(dir);
  console.log(`Cupones: ${result.imported} importados, ${result.duplicates} duplicados`);
  await mongoose.disconnect();
}
