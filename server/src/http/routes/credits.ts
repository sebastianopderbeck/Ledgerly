import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { MortgageCouponModel } from "../../db/models.js";
import { toMortgageCouponDTO } from "../mappers.js";
import { computeCreditProgress } from "../../stats/amortization.js";

export const creditsRouter = Router();

creditsRouter.get("/coupons", asyncHandler(async (_req, res) => {
  const docs = await MortgageCouponModel.find().sort({ cuotaNro: 1 });
  res.json(docs.map(toMortgageCouponDTO));
}));

creditsRouter.get("/summary", asyncHandler(async (_req, res) => {
  const docs = await MortgageCouponModel.find().sort({ cuotaNro: 1 }).lean();
  const progress = computeCreditProgress(
    docs.map((c) => ({
      prestamoNro: c.prestamoNro, cuotaNro: c.cuotaNro, capital: c.capital, intereses: c.intereses,
      seguroIncendio: c.seguroIncendio, totalDebitado: c.totalDebitado, cuotaPuraUva: c.cuotaPuraUva,
      cotizacionUva: c.cotizacionUva, tna: c.tna,
    })),
  );
  if (!progress) {
    res.status(204).end();
    return;
  }
  res.json(progress);
}));
