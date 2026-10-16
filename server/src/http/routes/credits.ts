import { Router } from "express";
import { HttpError, asyncHandler } from "../errors.js";
import { userIdOf } from "../../auth/requireUser.js";
import { MortgageCouponModel } from "../../db/models.js";
import { toMortgageCouponDTO } from "../mappers.js";
import { computeCreditProgress } from "../../stats/amortization.js";

export const creditsRouter = Router();

creditsRouter.get("/coupons", asyncHandler(async (req, res) => {
  const docs = await MortgageCouponModel.find({ userId: userIdOf(req) }).sort({ cuotaNro: 1 });
  res.json(docs.map(toMortgageCouponDTO));
}));

creditsRouter.get("/summary", asyncHandler(async (req, res) => {
  const docs = await MortgageCouponModel.find({ userId: userIdOf(req) }).sort({ cuotaNro: 1 }).lean();
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

creditsRouter.patch("/coupons/:id", asyncHandler(async (req, res) => {
  const { tipoCambioUsd } = req.body as { tipoCambioUsd?: unknown };
  if (typeof tipoCambioUsd !== "number" || !(tipoCambioUsd > 0)) {
    throw new HttpError(400, "tipoCambioUsd debe ser un número positivo");
  }
  const doc = await MortgageCouponModel.findOneAndUpdate(
    { _id: req.params.id, userId: userIdOf(req) },
    { tipoCambioUsd, tipoCambioSource: "manual" },
    { new: true },
  );
  if (!doc) throw new HttpError(404, "Cupón no encontrado");
  res.json(toMortgageCouponDTO(doc));
}));
