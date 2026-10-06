import { Router } from "express";
import { isValidObjectId, type FilterQuery } from "mongoose";
import { budgetInputSchema, budgetPatchSchema, type BudgetSpendingDTO, type CategoryMonthStat } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import {
  BudgetModel, InflationRateModel, StatementModel, TransactionModel, type TransactionDoc,
} from "../../db/models.js";
import { toBudgetDTO } from "../mappers.js";
import { parseYears, yearDateRanges } from "../yearFilter.js";
import { lastClosedMonth } from "../../stats/closedMonth.js";

export const budgetsRouter = Router();

const DUPLICATE_KEY = 11000;
const INVALID_INPUT = "Tope inválido: category no vacía y topeArs mayor a 0";
const INVALID_PATCH = "Tope inválido: mandá topeArs mayor a 0 o ajustaInflacion";
const NOT_FOUND = "Tope no encontrado";

const duplicated = (category: string): HttpError => new HttpError(409, `Ya hay un tope para «${category}»`);

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === DUPLICATE_KEY;

const basePeriod = async (): Promise<string> => {
  const latest = await InflationRateModel.findOne().sort({ periodo: -1 }).lean();
  return latest?.periodo ?? new Date().toISOString().slice(0, 7);
};

const validId = (id: string): string => {
  if (!isValidObjectId(id)) throw new HttpError(404, NOT_FOUND);
  return id;
};

budgetsRouter.get("/", asyncHandler(async (_req, res) => {
  const budgets = await BudgetModel.find().sort({ category: 1 });
  res.json(budgets.map(toBudgetDTO));
}));

const spendingByMonthAndCategory = (match: FilterQuery<TransactionDoc>) =>
  TransactionModel.aggregate<CategoryMonthStat>([
    { $match: match },
    {
      $group: {
        _id: { month: { $dateToString: { format: "%Y-%m", date: "$date" } }, category: "$category" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, month: "$_id.month", category: "$_id.category", total: 1, count: 1 } },
    { $sort: { month: 1, total: -1 } },
  ]);

budgetsRouter.get("/spending", asyncHandler(async (req, res) => {
  const match: FilterQuery<TransactionDoc> = { type: "purchase", currency: "ARS" };
  const years = parseYears(req.query.year);
  if (years) match.$or = yearDateRanges(years);
  const [gastos, statements] = await Promise.all([
    spendingByMonthAndCategory(match),
    StatementModel.find({}, { closingDate: 1 }).lean(),
  ]);
  const body: BudgetSpendingDTO = {
    ultimoMesCerrado: lastClosedMonth(statements.map((statement) => statement.closingDate ?? null)),
    gastos,
  };
  res.json(body);
}));

budgetsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = budgetInputSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_INPUT);
  const { category } = parsed.data;
  if (await BudgetModel.exists({ category })) throw duplicated(category);
  const periodoBase = await basePeriod();
  try {
    const doc = await BudgetModel.create({ ...parsed.data, periodoBase });
    res.status(201).json(toBudgetDTO(doc));
  } catch (error) {
    throw isDuplicateKey(error) ? duplicated(category) : error;
  }
}));

budgetsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const id = validId(req.params.id);
  const parsed = budgetPatchSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_PATCH);
  const periodoBase = await basePeriod();
  const doc = await BudgetModel.findByIdAndUpdate(id, { ...parsed.data, periodoBase }, { new: true });
  if (!doc) throw new HttpError(404, NOT_FOUND);
  res.json(toBudgetDTO(doc));
}));

budgetsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const id = validId(req.params.id);
  const { deletedCount } = await BudgetModel.deleteOne({ _id: id });
  if (deletedCount === 0) throw new HttpError(404, NOT_FOUND);
  res.status(204).end();
}));
