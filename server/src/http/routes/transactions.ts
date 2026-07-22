import { Router } from "express";
import type { FilterQuery } from "mongoose";
import { HttpError, asyncHandler } from "../errors.js";
import { TransactionModel, type TransactionDoc } from "../../db/models.js";
import { toTransactionDTO } from "../mappers.js";

function buildFilter(q: Record<string, unknown>): FilterQuery<TransactionDoc> {
  const filter: FilterQuery<TransactionDoc> = {};
  if (typeof q.currency === "string") filter.currency = q.currency;
  if (typeof q.issuer === "string") filter.issuer = q.issuer;
  if (typeof q.cardLabel === "string") filter.cardLabel = q.cardLabel;
  const categories = Array.isArray(q.category)
    ? q.category.filter((c): c is string => typeof c === "string")
    : typeof q.category === "string" ? [q.category] : [];
  if (categories.length) filter.category = { $in: categories };
  if (typeof q.search === "string") filter.merchant = { $regex: q.search, $options: "i" };
  if (typeof q.from === "string" || typeof q.to === "string") {
    filter.date = {};
    if (typeof q.from === "string") filter.date.$gte = new Date(q.from);
    if (typeof q.to === "string") filter.date.$lte = new Date(q.to);
  }
  return filter;
}

export const transactionsRouter = Router();

transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const paginated = req.query.pageSize !== undefined;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));
    const filter = buildFilter(req.query as Record<string, unknown>);
    const cursor = TransactionModel.find(filter).sort({ date: -1 });
    const [items, total] = await Promise.all([
      paginated ? cursor.skip((page - 1) * pageSize).limit(pageSize) : cursor,
      TransactionModel.countDocuments(filter),
    ]);
    res.json({ items: items.map(toTransactionDTO), total, page: paginated ? page : 1, pageSize: paginated ? pageSize : total });
  }),
);

transactionsRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const categories = (await TransactionModel.distinct("category")) as string[];
    res.json([...categories].sort((a, b) => a.localeCompare(b)));
  }),
);

transactionsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const update: Record<string, unknown> = {};
    if (typeof req.body.category === "string") {
      update.category = req.body.category;
      update.categorySource = "manual";
    }
    if (typeof req.body.type === "string") update.type = req.body.type;
    const doc = await TransactionModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) throw new HttpError(404, "Transacción no encontrada");
    res.json(toTransactionDTO(doc));
  }),
);
