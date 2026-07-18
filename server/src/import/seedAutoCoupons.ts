import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { importAutoCoupon } from "./importAutoCoupon.js";

export async function seedAutoCoupons(dir: string): Promise<{ imported: number; duplicates: number }> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
  let imported = 0;
  let duplicates = 0;
  for (const file of files) {
    const data = new Uint8Array(readFileSync(`${dir}${file}`));
    const result = await importAutoCoupon({ data, fileName: file });
    if (result.status === "imported") imported += 1;
    else duplicates += 1;
  }
  return { imported, duplicates };
}

if (process.argv[1]?.endsWith("seedAutoCoupons.ts")) {
  const dir = fileURLToPath(new URL("../../../examples/auto/", import.meta.url));
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const result = await seedAutoCoupons(dir);
  console.log(`Cupones auto: ${result.imported} importados, ${result.duplicates} duplicados`);
  await disconnectMongo();
}
