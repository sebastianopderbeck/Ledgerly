import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { InflationRateModel } from "../../db/models.js";
import { toInflationRateDTO } from "../mappers.js";

export const inflationRouter = Router();

inflationRouter.get("/", asyncHandler(async (_req, res) => {
  const docs = await InflationRateModel.find().sort({ periodo: 1 });
  res.json(docs.map(toInflationRateDTO));
}));
