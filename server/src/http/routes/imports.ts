import { Router } from "express";
import { isValidObjectId, type Types } from "mongoose";
import { importedFileKindSchema, type ImportedFileKind } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import {
  AutoCouponModel, MortgageCouponModel, PayslipModel, StatementModel, TransactionModel,
} from "../../db/models.js";
import {
  autoCouponToImportedFileDTO, mortgageCouponToImportedFileDTO, payslipToImportedFileDTO, statementToImportedFileDTO,
} from "../mappers.js";

export const importsRouter = Router();

const countTransactionsByStatement = async (): Promise<Map<string, number>> => {
  const groups = await TransactionModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $group: { _id: "$statementId", count: { $sum: 1 } } },
  ]);
  return new Map(groups.map((group) => [group._id.toString(), group.count]));
};

const deleteStatement = async (id: string): Promise<number> => {
  const { deletedCount } = await StatementModel.deleteOne({ _id: id });
  if (deletedCount > 0) await TransactionModel.deleteMany({ statementId: id });
  return deletedCount;
};

const deleters: Record<ImportedFileKind, (id: string) => Promise<number>> = {
  statement: deleteStatement,
  coupon: async (id) => (await MortgageCouponModel.deleteOne({ _id: id })).deletedCount,
  auto: async (id) => (await AutoCouponModel.deleteOne({ _id: id })).deletedCount,
  payslip: async (id) => (await PayslipModel.deleteOne({ _id: id })).deletedCount,
};

importsRouter.get("/", asyncHandler(async (_req, res) => {
  const [statements, counts, coupons, autoCoupons, payslips] = await Promise.all([
    StatementModel.find(),
    countTransactionsByStatement(),
    MortgageCouponModel.find(),
    AutoCouponModel.find(),
    PayslipModel.find(),
  ]);
  const files = [
    ...statements.map((doc) => statementToImportedFileDTO(doc, counts.get(doc._id.toString()) ?? 0)),
    ...coupons.map(mortgageCouponToImportedFileDTO),
    ...autoCoupons.map(autoCouponToImportedFileDTO),
    ...payslips.map(payslipToImportedFileDTO),
  ];
  res.json(files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
}));

importsRouter.delete("/:kind/:id", asyncHandler(async (req, res) => {
  const kind = importedFileKindSchema.safeParse(req.params.kind);
  if (!kind.success) throw new HttpError(400, `Tipo de archivo desconocido: ${req.params.kind}`);
  const deleted = isValidObjectId(req.params.id) ? await deleters[kind.data](req.params.id) : 0;
  if (deleted === 0) throw new HttpError(404, "Archivo no encontrado");
  res.status(204).end();
}));
