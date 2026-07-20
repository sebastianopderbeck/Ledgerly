import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";

export const fxRouter = Router();

fxRouter.get(
  "/oficial",
  asyncHandler(async (_req, res) => {
    const date = new Date().toISOString().slice(0, 10);
    const rate = await fetchOficialRate(date);
    res.json({ date, rate, source: "oficial" });
  }),
);
