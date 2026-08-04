import { connectMongo, disconnectMongo } from "../db/connection.js";
import { InflationRateModel } from "../db/models.js";
import { fetchInflationSeries } from "../fx/inflationRate.js";

export async function backfillInflation(): Promise<{ upserted: number }> {
  const series = await fetchInflationSeries();
  let upserted = 0;
  for (const { periodo, variacionMensual } of series) {
    await InflationRateModel.updateOne(
      { periodo },
      { $set: { periodo, variacionMensual } },
      { upsert: true },
    );
    upserted += 1;
  }
  return { upserted };
}

if (process.argv[1]?.endsWith("backfillInflation.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillInflation();
  console.log(`Inflación backfill: ${r.upserted} períodos`);
  await disconnectMongo();
}
