import { MacroSeriesModel } from "../db/models.js";

export async function latestUsdOficial(): Promise<number | null> {
  const latest = await MacroSeriesModel.findOne({ serie: "usd_oficial" }).sort({ fecha: -1 }).lean();
  return latest?.valor ?? null;
}
