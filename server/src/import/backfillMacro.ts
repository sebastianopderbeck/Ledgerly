import { connectMongo, disconnectMongo } from "../db/connection.js";
import { MacroSeriesModel } from "../db/models.js";
import { fetchOficialSeries, fetchTasa30Series, fetchUvaSeries, type SeriePoint } from "../fx/macroSources.js";
import { backfillInflation } from "./backfillInflation.js";

export type MacroSerieName = "usd_oficial" | "uva" | "tasa30";

export interface MacroBackfillResult {
  usd_oficial: number;
  uva: number;
  tasa30: number;
  inflacion: number;
}

async function upsertSerie(serie: MacroSerieName, points: SeriePoint[]): Promise<number> {
  if (points.length === 0) return 0;
  await MacroSeriesModel.bulkWrite(
    points.map(({ fecha, valor }) => ({
      updateOne: { filter: { serie, fecha }, update: { $set: { serie, fecha, valor } }, upsert: true },
    })),
  );
  return points.length;
}

export async function backfillMacro(): Promise<MacroBackfillResult> {
  const [usd, uva, tasa30] = await Promise.all([fetchOficialSeries(), fetchUvaSeries(), fetchTasa30Series()]);
  const inflacion = await backfillInflation();
  return {
    usd_oficial: await upsertSerie("usd_oficial", usd),
    uva: await upsertSerie("uva", uva),
    tasa30: await upsertSerie("tasa30", tasa30),
    inflacion: inflacion.upserted,
  };
}

if (process.argv[1]?.endsWith("backfillMacro.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const r = await backfillMacro();
  console.log(`Macro backfill: dólar ${r.usd_oficial}, UVA ${r.uva}, tasa ${r.tasa30}, inflación ${r.inflacion}`);
  await disconnectMongo();
}
