import { Router } from "express";
import type { Currency, InboxRuleResultDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { CategoryRuleModel, TransactionModel } from "../../db/models.js";
import { toCategoryRuleDTO } from "../mappers.js";
import { idsMatchingRule, matchRule, UNCATEGORIZED, type RuleInput } from "../../rules/categorize.js";
import { MIN_RULE_PATTERN_LENGTH } from "../../rules/suggestPattern.js";
import { buildUncategorizedInbox, type PendingPurchase } from "../../stats/uncategorizedInbox.js";
import { latestUsdOficial } from "../../fx/latestUsdOficial.js";

export const categoryRulesRouter = Router();

const INBOX_RULE_PRIORITY = 100;

interface PendingRow {
  merchant: string;
  amount: number;
  currency: string;
  date: Date;
}

const toPendingPurchase = ({ merchant, amount, currency, date }: PendingRow): PendingPurchase => ({
  merchant,
  amount,
  currency: currency as Currency,
  date: date.toISOString().slice(0, 10),
});

const trimmedText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const categorizePending = async (ids: string[], category: string): Promise<number> => {
  if (ids.length === 0) return 0;
  const { modifiedCount } = await TransactionModel.updateMany(
    { _id: { $in: ids }, category: UNCATEGORIZED },
    { category, categorySource: "rule" },
  );
  return modifiedCount;
};

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
      const category = matched ?? UNCATEGORIZED;
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

categoryRulesRouter.get(
  "/inbox",
  asyncHandler(async (_req, res) => {
    const [pending, usdRate] = await Promise.all([
      TransactionModel.find({ category: UNCATEGORIZED, type: "purchase" })
        .select({ merchant: 1, amount: 1, currency: 1, date: 1 })
        .lean(),
      latestUsdOficial(),
    ]);
    res.json(buildUncategorizedInbox(pending.map(toPendingPurchase), usdRate));
  }),
);

categoryRulesRouter.post(
  "/inbox/rules",
  asyncHandler(async (req, res) => {
    const pattern = trimmedText(req.body?.pattern);
    const category = trimmedText(req.body?.category);
    if (pattern.length < MIN_RULE_PATTERN_LENGTH) {
      throw new HttpError(400, `El patrón tiene que tener al menos ${MIN_RULE_PATTERN_LENGTH} caracteres`);
    }
    if (category === "" || category === UNCATEGORIZED) throw new HttpError(400, "Elegí una categoría");

    const rule: RuleInput = { priority: INBOX_RULE_PRIORITY, matchType: "contains", pattern, category, enabled: true };
    const doc = await CategoryRuleModel.create({ ...rule, source: "user" });
    const candidates = await TransactionModel.find({ category: UNCATEGORIZED })
      .select({ descriptionRaw: 1, merchant: 1 })
      .lean();
    const ids = idsMatchingRule(
      candidates.map((tx) => ({ id: tx._id.toString(), descriptionRaw: tx.descriptionRaw, merchant: tx.merchant })),
      rule,
    );
    const result: InboxRuleResultDTO = { rule: toCategoryRuleDTO(doc), categorized: await categorizePending(ids, category) };
    res.status(201).json(result);
  }),
);
