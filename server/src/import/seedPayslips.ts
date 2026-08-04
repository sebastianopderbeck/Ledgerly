import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { importPayslip } from "./importPayslip.js";

export async function seedPayslips(dir: string): Promise<{ imported: number; duplicates: number }> {
  const files = readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort();
  let imported = 0;
  let duplicates = 0;
  for (const file of files) {
    const data = new Uint8Array(readFileSync(`${dir}${file}`));
    const result = await importPayslip({ data, fileName: file });
    if (result.status === "imported") imported += 1;
    else duplicates += 1;
  }
  return { imported, duplicates };
}

if (process.argv[1]?.endsWith("seedPayslips.ts")) {
  const dir = fileURLToPath(new URL("../../../examples/recibos/", import.meta.url));
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const result = await seedPayslips(dir);
  console.log(`Recibos de sueldo: ${result.imported} importados, ${result.duplicates} duplicados`);
  await disconnectMongo();
}
