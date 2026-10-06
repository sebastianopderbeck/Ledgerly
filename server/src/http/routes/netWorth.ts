import { Router } from "express";
import { isValidObjectId } from "mongoose";
import {
  manualAssetCreateSchema, manualAssetUpdateSchema, type AssetValuationDTO, type Currency,
} from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import {
  AutoCouponModel, MacroSeriesModel, ManualAssetModel, MortgageCouponModel, StatementModel, TransactionModel,
} from "../../db/models.js";
import { toManualAssetDTO } from "../mappers.js";
import { buildNetWorth, firstDataMonth, type NetWorthInputs } from "../../stats/netWorth.js";
import { pointOnDate } from "../../stats/rateOnDate.js";
import { fetchOficialRate } from "../../fx/dollarRate.js";
import type { SeriePoint } from "../../fx/macroSources.js";

export const netWorthRouter = Router();

const INVALID_ASSET = "Datos del activo inválidos";
const FUTURE_VALUATION = "La fecha de valuación no puede ser futura";
const ASSET_NOT_FOUND = "Activo no encontrado";
const VALUATION_NOT_FOUND = "Valuación no encontrada";
const ONLY_VALUATION = "No se puede borrar la única valuación: borrá el activo";
const NO_USD = "No hay cotización del dólar oficial. Actualizá los datos con el botón de la barra superior.";

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const isoOf = (date: Date): string => date.toISOString().slice(0, 10);

const loadInputs = async (hoy: string): Promise<NetWorthInputs> => {
  const [autoCoupons, mortgageCoupons, statements, installments, assets, macro] = await Promise.all([
    AutoCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    MortgageCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    StatementModel.find({ closingDate: { $ne: null } }).lean(),
    TransactionModel.find({ type: "purchase", isInstallment: true }).lean(),
    ManualAssetModel.find().sort({ nombre: 1 }),
    MacroSeriesModel.find({ serie: { $in: ["usd_oficial", "uva"] } }).sort({ fecha: 1 }).lean(),
  ]);
  const serie = (name: string): SeriePoint[] =>
    macro.filter((point) => point.serie === name).map((point) => ({ fecha: point.fecha, valor: point.valor }));
  return {
    hoy,
    autoCoupons: autoCoupons.map((coupon) => ({
      grupo: coupon.grupo, orden: coupon.orden, plan: coupon.plan, modelo: coupon.modelo, cuotaNro: coupon.cuotaNro,
      fechaEmision: isoOf(coupon.fechaEmision), fechaVencimiento: isoOf(coupon.fechaVencimiento),
      valorMovil: coupon.valorMovil, totalAPagar: coupon.totalAPagar,
      totalUsd: coupon.tipoCambioUsd ? coupon.totalAPagar / coupon.tipoCambioUsd : null,
    })),
    mortgageCoupons: mortgageCoupons.map((coupon) => ({
      prestamoNro: coupon.prestamoNro, cuotaNro: coupon.cuotaNro, fechaDebito: isoOf(coupon.fechaDebito),
      capital: coupon.capital, intereses: coupon.intereses, seguroIncendio: coupon.seguroIncendio,
      totalDebitado: coupon.totalDebitado, cuotaPuraUva: coupon.cuotaPuraUva, cotizacionUva: coupon.cotizacionUva,
      tna: coupon.tna,
    })),
    statements: statements.flatMap((statement) => (statement.closingDate
      ? [{
        id: statement._id.toString(),
        issuer: statement.issuer,
        cardLabel: statement.cardLabel,
        closingDate: isoOf(statement.closingDate),
        uploadedAt: (statement as unknown as { uploadedAt: Date }).uploadedAt,
      }]
      : [])),
    installments: installments.map((tx) => ({
      statementId: tx.statementId.toString(), amount: tx.amount, currency: tx.currency as Currency,
      isInstallment: tx.isInstallment, installmentCurrent: tx.installmentCurrent ?? null,
      installmentTotal: tx.installmentTotal ?? null,
    })),
    assets: assets.map(toManualAssetDTO),
    usdSerie: serie("usd_oficial"),
    uvaSerie: serie("uva"),
  };
};

const usdOficialHoy = async (usdSerie: SeriePoint[], hoy: string): Promise<SeriePoint> => {
  const ultimo = pointOnDate(hoy, usdSerie);
  if (ultimo) return ultimo;
  const valor = await fetchOficialRate(hoy);
  if (valor === null) throw new HttpError(503, NO_USD);
  return { fecha: hoy, valor };
};

const assertNotFuture = (valuacion: AssetValuationDTO | undefined): void => {
  if (valuacion && valuacion.fecha > todayIso()) throw new HttpError(400, FUTURE_VALUATION);
};

const findAsset = async (id: string) => {
  const doc = isValidObjectId(id) ? await ManualAssetModel.findById(id) : null;
  if (!doc) throw new HttpError(404, ASSET_NOT_FOUND);
  return doc;
};

const upsertValuation = (valuaciones: AssetValuationDTO[], valuacion: AssetValuationDTO): AssetValuationDTO[] =>
  [...valuaciones.filter((current) => current.fecha !== valuacion.fecha), valuacion]
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

netWorthRouter.get("/", asyncHandler(async (_req, res) => {
  const hoy = todayIso();
  const inputs = await loadInputs(hoy);
  if (firstDataMonth(inputs) === null) {
    res.status(204).end();
    return;
  }
  res.json(buildNetWorth(inputs, await usdOficialHoy(inputs.usdSerie, hoy)));
}));

netWorthRouter.post("/assets", asyncHandler(async (req, res) => {
  const parsed = manualAssetCreateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, INVALID_ASSET);
  const { nombre, tipo, moneda, valuacion } = parsed.data;
  assertNotFuture(valuacion);
  const doc = await ManualAssetModel.create({ nombre, tipo, moneda, valuaciones: [valuacion] });
  res.status(201).json(toManualAssetDTO(doc));
}));

netWorthRouter.patch("/assets/:id", asyncHandler(async (req, res) => {
  const parsed = manualAssetUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, INVALID_ASSET);
  const { nombre, tipo, valuacion } = parsed.data;
  assertNotFuture(valuacion);
  const doc = await findAsset(req.params.id);
  if (nombre !== undefined) doc.nombre = nombre;
  if (tipo !== undefined) doc.tipo = tipo;
  if (valuacion) doc.set("valuaciones", upsertValuation(toManualAssetDTO(doc).valuaciones, valuacion));
  await doc.save();
  res.json(toManualAssetDTO(doc));
}));

netWorthRouter.delete("/assets/:id", asyncHandler(async (req, res) => {
  if (isValidObjectId(req.params.id)) await ManualAssetModel.deleteOne({ _id: req.params.id });
  res.status(204).end();
}));

netWorthRouter.delete("/assets/:id/valuations/:fecha", asyncHandler(async (req, res) => {
  const doc = await findAsset(req.params.id);
  const { fecha } = req.params;
  const { valuaciones } = toManualAssetDTO(doc);
  if (!valuaciones.some((valuacion) => valuacion.fecha === fecha)) throw new HttpError(404, VALUATION_NOT_FOUND);
  if (valuaciones.length === 1) throw new HttpError(409, ONLY_VALUATION);
  doc.set("valuaciones", valuaciones.filter((valuacion) => valuacion.fecha !== fecha));
  await doc.save();
  res.json(toManualAssetDTO(doc));
}));
