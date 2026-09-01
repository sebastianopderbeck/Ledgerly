import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { importPayslip } from "./importPayslip.js";

export async function seedPayslips(dir: string): Promise<{ imported: number; duplicates: number; skipped: string[] }> {
  const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort();
  let imported = 0;
  let duplicates = 0;
  const skipped: string[] = [];
  for (const file of files) {
    const data = new Uint8Array(readFileSync(`${dir}${file}`));
    try {
      const result = await importPayslip({ data, fileName: file });
      if (result.status === "imported") imported += 1;
      else duplicates += 1;
    } catch (error) {
      skipped.push(`${file}: ${(error as Error).message}`);
    }
  }
  return { imported, duplicates, skipped };
}

if (process.argv[1]?.endsWith("seedPayslips.ts")) {
  const dir = fileURLToPath(new URL("../../../examples/recibos/", import.meta.url));
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const result = await seedPayslips(dir);
  console.log(`Recibos de sueldo: ${result.imported} importados, ${result.duplicates} duplicados, ${result.skipped.length} omitidos`);
  for (const skipped of result.skipped) console.log(`  omitido -> ${skipped}`);
  await disconnectMongo();
}
