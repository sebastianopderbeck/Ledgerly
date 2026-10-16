import { Router } from "express";
import { isValidObjectId, type Types } from "mongoose";
import { userIdOf } from "../../auth/requireUser.js";
import {
  fixedServiceCreateSchema, fixedServiceUpdateSchema, isActiveFixedService, type FixedServiceDTO,
} from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { FixedServiceModel } from "../../db/models.js";
import { toFixedServiceDTO } from "../mappers.js";

export const fixedServicesRouter = Router();

const INVALID_SERVICE = "Servicio inválido";
const SERVICE_NOT_FOUND = "Servicio no encontrado";

const currentMonth = (): string => new Date().toISOString().slice(0, 7);

const byActiveThenName = (mes: string) => (a: FixedServiceDTO, b: FixedServiceDTO): number =>
  Number(isActiveFixedService(b, mes)) - Number(isActiveFixedService(a, mes)) || a.nombre.localeCompare(b.nombre);

const findService = async (id: string, userId: Types.ObjectId) => {
  const doc = isValidObjectId(id) ? await FixedServiceModel.findOne({ _id: id, userId }) : null;
  if (!doc) throw new HttpError(404, SERVICE_NOT_FOUND);
  return doc;
};

fixedServicesRouter.get("/", asyncHandler(async (req, res) => {
  const docs = await FixedServiceModel.find({ userId: userIdOf(req) });
  res.json(docs.map(toFixedServiceDTO).sort(byActiveThenName(currentMonth())));
}));

fixedServicesRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = fixedServiceCreateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_SERVICE);
  const mes = currentMonth();
  const { nombre, monto, cadencia = "mensual", desde = mes } = parsed.data;
  const doc = await FixedServiceModel.create({ userId: userIdOf(req), nombre, monto, cadencia, desde, hasta: null, montoDesde: mes });
  res.status(201).json(toFixedServiceDTO(doc));
}));

fixedServicesRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = fixedServiceUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, INVALID_SERVICE);
  const doc = await findService(req.params.id, userIdOf(req));
  const actual = toFixedServiceDTO(doc);
  const { nombre, monto, cadencia, desde = actual.desde, hasta = actual.hasta } = parsed.data;
  if (hasta !== null && hasta < desde) throw new HttpError(400, INVALID_SERVICE);
  if (nombre !== undefined) doc.nombre = nombre;
  if (cadencia !== undefined) doc.cadencia = cadencia;
  if (monto !== undefined && monto !== actual.monto) {
    doc.monto = monto;
    doc.montoDesde = currentMonth();
  }
  doc.desde = desde;
  doc.hasta = hasta;
  await doc.save();
  res.json(toFixedServiceDTO(doc));
}));

fixedServicesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const userId = userIdOf(req);
  const doc = await findService(req.params.id, userId);
  await FixedServiceModel.deleteOne({ _id: doc._id, userId });
  res.status(204).end();
}));
