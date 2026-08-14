import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { InflationRateModel, MacroSeriesModel } from "../../db/models.js";
import { buildMonthlySeries } from "../../stats/macroSeries.js";
import { MACRO_START } from "../../fx/macroSources.js";

export const macroRouter = Router();

const DESDE = MACRO_START.slice(0, 7);

macroRouter.get("/series", asyncHandler(async (_req, res) => {
  const [points, inflation] = await Promise.all([
    MacroSeriesModel.find({ fecha: { $gte: MACRO_START } }).sort({ fecha: 1 }).lean(),
    InflationRateModel.find({ periodo: { $gte: DESDE } }).sort({ periodo: 1 }).lean(),
  ]);
  res.json(buildMonthlySeries(
    points.map((point) => ({ serie: point.serie, fecha: point.fecha, valor: point.valor })),
    inflation.map((row) => ({ periodo: row.periodo, variacionMensual: row.variacionMensual })),
    DESDE,
  ));
}));
