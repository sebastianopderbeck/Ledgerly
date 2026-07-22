import { Router } from "express";
import { HttpError, asyncHandler } from "../errors.js";
import { CategoryRuleModel, TransactionModel } from "../../db/models.js";
import { toCategoryRuleDTO } from "../mappers.js";
import { matchRule, type RuleInput } from "../../rules/categorize.js";

export const categoryRulesRouter = Router();

categoryRulesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rules = await CategoryRuleModel.find().sort({ priority: 1 });
    res.json(rules.map(toCategoryRuleDTO));
  }),
);

categoryRulesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { priority, matchType, pattern, category } = req.body;
    if (typeof pattern !== "string" || typeof category !== "string") {
      throw new HttpError(400, "pattern y category son requeridos");
    }
    const doc = await CategoryRuleModel.create({
      priority: Number(priority ?? 100), matchType: matchType === "regex" ? "regex" : "contains",
      pattern, category, source: "user", enabled: true,
    });
    res.status(201).json(toCategoryRuleDTO(doc));
  }),
);

categoryRulesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await CategoryRuleModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) throw new HttpError(404, "Regla no encontrada");
    res.json(toCategoryRuleDTO(doc));
  }),
);

categoryRulesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await CategoryRuleModel.deleteOne({ _id: req.params.id });
    res.status(204).end();
  }),
);

categoryRulesRouter.post(
  "/apply",
  asyncHandler(async (_req, res) => {
    const rules = (await CategoryRuleModel.find({ enabled: true }).lean()) as unknown as RuleInput[];
    const txs = await TransactionModel.find({});
    let updated = 0;
    for (const tx of txs) {
      const matched = matchRule(tx.descriptionRaw, tx.merchant, rules);
      if (matched === null && tx.categorySource === "manual") continue;
      const category = matched ?? "Sin categoría";
      if (category !== tx.category || tx.categorySource !== "rule") {
        tx.category = category;
        tx.categorySource = "rule";
        await tx.save();
        updated += 1;
      }
    }
    res.json({ updated });
  }),
);
