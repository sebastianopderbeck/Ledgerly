import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { fixedServiceCreateSchema, fixedServiceUpdateSchema, type FixedServiceDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { FixedServiceModel } from "../../db/models.js";
import { toFixedServiceDTO } from "../mappers.js";

export const fixedServicesRouter = Router();

const INVALID_SERVICE = "Servicio inválido";
const SERVICE_NOT_FOUND = "Servicio no encontrado";

const currentMonth = (): string => new Date().toISOString().slice(0, 7);

const isActive = ({ hasta }: FixedServiceDTO, mes: string): boolean => hasta === null || hasta >= mes;

const byActiveThenName = (mes: string) => (a: FixedServiceDTO, b: FixedServiceDTO): number =>
  Number(isActive(b, mes)) - Number(isActive(a, mes)) || a.nombre.localeCompare(b.nombre);

const findService = async (id: string) => {
  const doc = isValidObjectId(id) ? await FixedServiceModel.findById(id) : null;
  if (!doc) throw new HttpError(404, SERVICE_NOT_FOUND);
  return doc;
};

fixedServicesRouter.get("/", asyncHandler(async (_req, res) => {
  const docs = await FixedServiceModel.find();
  res.json(docs.map(toFixedServiceDTO).sort(byActiveThenName(currentMonth())));
}));

fixedServicesRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = fixedServiceCreateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_SERVICE);
  const mes = currentMonth();
  const { nombre, monto, cadencia = "mensual", desde = mes } = parsed.data;
  const doc = await FixedServiceModel.create({ nombre, monto, cadencia, desde, hasta: null, montoDesde: mes });
  res.status(201).json(toFixedServiceDTO(doc));
}));

fixedServicesRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = fixedServiceUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, INVALID_SERVICE);
  const doc = await findService(req.params.id);
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
  const doc = await findService(req.params.id);
  await doc.deleteOne();
  res.status(204).end();
}));
