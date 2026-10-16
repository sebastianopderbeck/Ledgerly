import { Router } from "express";
import { HttpError, asyncHandler } from "../errors.js";
import { userIdOf } from "../../auth/requireUser.js";
import { PayslipModel } from "../../db/models.js";
import { toPayslipDTO } from "../mappers.js";
import { computePayslipSummary } from "../../stats/payslipSummary.js";

export const payslipsRouter = Router();

payslipsRouter.get("/", asyncHandler(async (req, res) => {
  const docs = await PayslipModel.find({ userId: userIdOf(req) }).sort({ periodo: 1 });
  res.json(docs.map(toPayslipDTO));
}));

payslipsRouter.get("/summary", asyncHandler(async (req, res) => {
  const docs = await PayslipModel.find({ userId: userIdOf(req) }).sort({ periodo: 1 }).lean();
  const summary = computePayslipSummary(
    docs.map((p) => ({
      periodo: p.periodo,
      tipo: p.tipo as "mensual" | "sac",
      neto: p.neto,
      brutoTotal: p.brutoTotal,
      descuentos: p.descuentos,
      netoUsd: p.tipoCambioUsd ? p.neto / p.tipoCambioUsd : null,
    })),
  );
  if (!summary) {
    res.status(204).end();
    return;
  }
  res.json(summary);
}));

payslipsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const { tipoCambioUsd } = req.body as { tipoCambioUsd?: unknown };
  if (typeof tipoCambioUsd !== "number" || !(tipoCambioUsd > 0)) {
    throw new HttpError(400, "tipoCambioUsd debe ser un número positivo");
  }
  const doc = await PayslipModel.findOneAndUpdate(
    { _id: req.params.id, userId: userIdOf(req) },
    { tipoCambioUsd, tipoCambioSource: "manual" },
    { new: true },
  );
  if (!doc) throw new HttpError(404, "Recibo no encontrado");
  res.json(toPayslipDTO(doc));
}));
