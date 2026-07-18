import { Router } from "express";
import { HttpError, asyncHandler } from "../errors.js";
import { AutoCouponModel } from "../../db/models.js";
import { toAutoCouponDTO } from "../mappers.js";
import { computeAutoProgress } from "../../stats/autoProgress.js";

export const autoRouter = Router();

autoRouter.get("/coupons", asyncHandler(async (_req, res) => {
  const docs = await AutoCouponModel.find().sort({ cuotaNro: 1 });
  res.json(docs.map(toAutoCouponDTO));
}));

autoRouter.get("/summary", asyncHandler(async (_req, res) => {
  const docs = await AutoCouponModel.find().sort({ cuotaNro: 1 }).lean();
  const progress = computeAutoProgress(
    docs.map((c) => ({
      grupo: c.grupo,
      orden: c.orden,
      plan: c.plan,
      modelo: c.modelo,
      cuotaNro: c.cuotaNro,
      fechaVencimiento: c.fechaVencimiento.toISOString().slice(0, 10),
      valorMovil: c.valorMovil,
      totalAPagar: c.totalAPagar,
      totalUsd: c.tipoCambioUsd ? c.totalAPagar / c.tipoCambioUsd : null,
    })),
  );
  if (!progress) {
    res.status(204).end();
    return;
  }
  res.json(progress);
}));

autoRouter.patch("/coupons/:id", asyncHandler(async (req, res) => {
  const { tipoCambioUsd } = req.body as { tipoCambioUsd?: unknown };
  if (typeof tipoCambioUsd !== "number" || !(tipoCambioUsd > 0)) {
    throw new HttpError(400, "tipoCambioUsd debe ser un número positivo");
  }
  const doc = await AutoCouponModel.findByIdAndUpdate(
    req.params.id,
    { tipoCambioUsd, tipoCambioSource: "manual" },
    { new: true },
  );
  if (!doc) throw new HttpError(404, "Cupón no encontrado");
  res.json(toAutoCouponDTO(doc));
}));
