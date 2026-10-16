import { Router } from "express";
import { isValidObjectId, type Types } from "mongoose";
import { importedFileKindSchema, type ImportedFileKind } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { userIdOf } from "../../auth/requireUser.js";
import {
  AutoCouponModel, MortgageCouponModel, PayslipModel, StatementModel, TransactionModel,
} from "../../db/models.js";
import {
  autoCouponToImportedFileDTO, mortgageCouponToImportedFileDTO, payslipToImportedFileDTO, statementToImportedFileDTO,
} from "../mappers.js";

export const importsRouter = Router();

const countTransactionsByStatement = async (userId: Types.ObjectId): Promise<Map<string, number>> => {
  const groups = await TransactionModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { userId } },
    { $group: { _id: "$statementId", count: { $sum: 1 } } },
  ]);
  return new Map(groups.map((group) => [group._id.toString(), group.count]));
};

const deleteStatement = async (userId: Types.ObjectId, id: string): Promise<number> => {
  const { deletedCount } = await StatementModel.deleteOne({ _id: id, userId });
  if (deletedCount > 0) await TransactionModel.deleteMany({ userId, statementId: id });
  return deletedCount;
};

const deleters: Record<ImportedFileKind, (userId: Types.ObjectId, id: string) => Promise<number>> = {
  statement: deleteStatement,
  coupon: async (userId, id) => (await MortgageCouponModel.deleteOne({ _id: id, userId })).deletedCount,
  auto: async (userId, id) => (await AutoCouponModel.deleteOne({ _id: id, userId })).deletedCount,
  payslip: async (userId, id) => (await PayslipModel.deleteOne({ _id: id, userId })).deletedCount,
};

importsRouter.get("/", asyncHandler(async (req, res) => {
  const userId = userIdOf(req);
  const [statements, counts, coupons, autoCoupons, payslips] = await Promise.all([
    StatementModel.find({ userId }),
    countTransactionsByStatement(userId),
    MortgageCouponModel.find({ userId }),
    AutoCouponModel.find({ userId }),
    PayslipModel.find({ userId }),
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
  const deleted = isValidObjectId(req.params.id) ? await deleters[kind.data](userIdOf(req), req.params.id) : 0;
  if (deleted === 0) throw new HttpError(404, "Archivo no encontrado");
  res.status(204).end();
}));
