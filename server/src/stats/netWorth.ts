import {
  MANUAL_ASSET_TYPE_LABELS,
  type AssetValuationDTO, type Currency, type ManualAssetDTO, type NetWorthDTO, type NetWorthItemDTO,
  type NetWorthMonthDTO, type NetWorthTotals,
} from "@ledgerly/shared";
import { MACRO_START, type SeriePoint } from "../fx/macroSources.js";
import { computeCreditProgress, type CouponInput } from "./amortization.js";
import { computeAutoProgress, type AutoCouponInput } from "./autoProgress.js";
import { remainingInstallmentDebt } from "./futureInstallments.js";
import { latestStatementIdsPerIssuer } from "./lastStatement.js";
import { representativeRateDate } from "./monthlyUsd.js";
import { monthOf, monthRange } from "./months.js";
import { pointOnDate } from "./rateOnDate.js";

export interface NetWorthAutoCoupon extends AutoCouponInput {
  fechaEmision: string;
}

export interface NetWorthMortgageCoupon extends CouponInput {
  fechaDebito: string;
}

export interface NetWorthStatement {
  id: string;
  issuer: string;
  cardLabel: string;
  closingDate: string;
  uploadedAt: Date;
}

export interface NetWorthInstallment {
  statementId: string;
  amount: number;
  currency: Currency;
  isInstallment: boolean;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

export interface NetWorthInputs {
  hoy: string;
  autoCoupons: NetWorthAutoCoupon[];
  mortgageCoupons: NetWorthMortgageCoupon[];
  statements: NetWorthStatement[];
  installments: NetWorthInstallment[];
  assets: ManualAssetDTO[];
  usdSerie: SeriePoint[];
  uvaSerie: SeriePoint[];
}

export interface NetWorthSnapshot {
  items: NetWorthItemDTO[];
  totales: NetWorthTotals;
  uva: SeriePoint | null;
}

interface ItemBase {
  id: string;
  lado: NetWorthItemDTO["lado"];
  fuente: NetWorthItemDTO["fuente"];
  label: string;
  detalle: string;
  fecha: string;
  assetId: string | null;
}

interface MortgageValuation {
  item: NetWorthItemDTO;
  uva: SeriePoint;
}

export const NET_WORTH_START = monthOf(MACRO_START);

const UVA_UNITS = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

const SIDE_ORDER: Record<NetWorthItemDTO["lado"], number> = { activo: 0, pasivo: 1 };

const arsItem = (base: ItemBase, ars: number, usd: number): NetWorthItemDTO => ({
  ...base, moneda: "ARS", montoOriginal: ars, ars, usd: ars / usd,
});

const usdItem = (base: ItemBase, monto: number, usd: number): NetWorthItemDTO => ({
  ...base, moneda: "USD", montoOriginal: monto, ars: monto * usd, usd: monto,
});

const highestCuota = <Coupon extends { cuotaNro: number }>(coupons: Coupon[]): Coupon =>
  coupons.reduce((latest, coupon) => (coupon.cuotaNro > latest.cuotaNro ? coupon : latest));

const autoItems = (coupons: NetWorthAutoCoupon[], corte: string, usd: number): NetWorthItemDTO[] => {
  const emitidos = coupons.filter((coupon) => coupon.fechaEmision <= corte);
  const summary = computeAutoProgress(emitidos);
  if (!summary) return [];
  const fecha = highestCuota(emitidos).fechaEmision;
  const auto = arsItem({
    id: "auto", lado: "activo", fuente: "auto", label: "Auto",
    detalle: `${summary.modelo} · valor móvil de la cuota ${summary.ultimaCuota}`, fecha, assetId: null,
  }, summary.valorActualAuto, usd);
  const restantes = Math.max(0, summary.cuotasTotales - summary.ultimaCuota);
  if (restantes === 0) return [auto];
  const plan = arsItem({
    id: "plan-auto", lado: "pasivo", fuente: "plan_auto", label: "Plan de ahorro del auto",
    detalle: `${restantes} de ${summary.cuotasTotales} cuotas por pagar`, fecha, assetId: null,
  }, (summary.valorActualAuto * restantes) / summary.cuotasTotales, usd);
  return [auto, plan];
};

const mortgageValuation = (
  coupons: NetWorthMortgageCoupon[],
  corte: string,
  usd: number,
  uvaSpot: SeriePoint | null,
): MortgageValuation | null => {
  const debitados = coupons.filter((coupon) => coupon.fechaDebito <= corte);
  const progress = computeCreditProgress(debitados);
  if (!progress) return null;
  const delCupon: SeriePoint = { fecha: highestCuota(debitados).fechaDebito, valor: progress.cotizacionUvaActual };
  const uva = uvaSpot && uvaSpot.fecha >= delCupon.fecha ? uvaSpot : delCupon;
  const item = arsItem({
    id: "hipoteca", lado: "pasivo", fuente: "hipoteca", label: "Hipoteca UVA",
    detalle: `${UVA_UNITS.format(progress.capitalPendienteUva)} UVA pendientes`, fecha: uva.fecha, assetId: null,
  }, progress.capitalPendienteUva * uva.valor, usd);
  return { item, uva };
};

const installmentsByStatement = (installments: NetWorthInstallment[]): Map<string, NetWorthInstallment[]> => {
  const groups = new Map<string, NetWorthInstallment[]>();
  for (const installment of installments) {
    const group = groups.get(installment.statementId) ?? [];
    group.push(installment);
    groups.set(installment.statementId, group);
  }
  return groups;
};

const cardItems = (
  statements: NetWorthStatement[],
  installments: NetWorthInstallment[],
  corte: string,
  usd: number,
): NetWorthItemDTO[] => {
  const cerrados = statements.filter((statement) => statement.closingDate <= corte);
  const latestIds = new Set(latestStatementIdsPerIssuer(cerrados.map((statement) => ({
    id: statement.id,
    issuer: statement.issuer,
    closingDate: new Date(statement.closingDate),
    uploadedAt: statement.uploadedAt,
  }))));
  const cuotasPorResumen = installmentsByStatement(installments);
  return cerrados
    .filter((statement) => latestIds.has(statement.id))
    .flatMap((statement) => {
      const cuotas = cuotasPorResumen.get(statement.id) ?? [];
      const detalle = `Último resumen: cierre ${statement.closingDate}`;
      const base = { lado: "pasivo", fuente: "tarjeta", detalle, fecha: statement.closingDate, assetId: null } as const;
      const deudaArs = remainingInstallmentDebt(cuotas, "ARS");
      const deudaUsd = remainingInstallmentDebt(cuotas, "USD");
      const enPesos = deudaArs > 0
        ? [arsItem({ ...base, id: `tarjeta:${statement.issuer}:ARS`, label: `Cuotas ${statement.cardLabel}` }, deudaArs, usd)]
        : [];
      const enDolares = deudaUsd > 0
        ? [usdItem({ ...base, id: `tarjeta:${statement.issuer}:USD`, label: `Cuotas ${statement.cardLabel} en dólares` }, deudaUsd, usd)]
        : [];
      return [...enPesos, ...enDolares];
    });
};

const valuationAt = (asset: ManualAssetDTO, corte: string): AssetValuationDTO | null =>
  asset.valuaciones.reduce<AssetValuationDTO | null>(
    (latest, valuacion) => (valuacion.fecha <= corte && (!latest || valuacion.fecha > latest.fecha) ? valuacion : latest),
    null,
  );

const manualItems = (assets: ManualAssetDTO[], corte: string, usd: number): NetWorthItemDTO[] =>
  assets.flatMap((asset) => {
    const valuacion = valuationAt(asset, corte);
    if (!valuacion) return [];
    const base: ItemBase = {
      id: asset.id, lado: "activo", fuente: "manual", label: asset.nombre,
      detalle: MANUAL_ASSET_TYPE_LABELS[asset.tipo], fecha: valuacion.fecha, assetId: asset.id,
    };
    return [asset.moneda === "USD" ? usdItem(base, valuacion.monto, usd) : arsItem(base, valuacion.monto, usd)];
  });

const byPresentation = (a: NetWorthItemDTO, b: NetWorthItemDTO): number =>
  SIDE_ORDER[a.lado] - SIDE_ORDER[b.lado] || b.ars - a.ars || a.label.localeCompare(b.label, "es");

const sideTotal = (items: NetWorthItemDTO[], lado: NetWorthItemDTO["lado"], pick: (item: NetWorthItemDTO) => number): number =>
  items.reduce((total, item) => (item.lado === lado ? total + pick(item) : total), 0);

const totalsOf = (items: NetWorthItemDTO[]): NetWorthTotals => {
  const activosArs = sideTotal(items, "activo", (item) => item.ars);
  const pasivosArs = sideTotal(items, "pasivo", (item) => item.ars);
  const activosUsd = sideTotal(items, "activo", (item) => item.usd);
  const pasivosUsd = sideTotal(items, "pasivo", (item) => item.usd);
  return {
    activosArs, pasivosArs, netoArs: activosArs - pasivosArs,
    activosUsd, pasivosUsd, netoUsd: activosUsd - pasivosUsd,
  };
};

export function valuateAt(inputs: NetWorthInputs, corte: string, usd: number, uvaSpot: SeriePoint | null): NetWorthSnapshot {
  const hipoteca = mortgageValuation(inputs.mortgageCoupons, corte, usd, uvaSpot);
  const items = [
    ...autoItems(inputs.autoCoupons, corte, usd),
    ...(hipoteca ? [hipoteca.item] : []),
    ...cardItems(inputs.statements, inputs.installments, corte, usd),
    ...manualItems(inputs.assets, corte, usd),
  ].sort(byPresentation);
  return { items, totales: totalsOf(items), uva: hipoteca?.uva ?? null };
}

export function firstDataMonth(inputs: NetWorthInputs): string | null {
  const fechas = [
    ...inputs.autoCoupons.map((coupon) => coupon.fechaEmision),
    ...inputs.mortgageCoupons.map((coupon) => coupon.fechaDebito),
    ...inputs.statements.map((statement) => statement.closingDate),
    ...inputs.assets.flatMap((asset) => asset.valuaciones.map((valuacion) => valuacion.fecha)),
  ];
  if (fechas.length === 0) return null;
  return monthOf(fechas.reduce((oldest, fecha) => (fecha < oldest ? fecha : oldest)));
}

const monthPoint = (inputs: NetWorthInputs, periodo: string, usdHoy: SeriePoint): NetWorthMonthDTO[] => {
  const corte = representativeRateDate(periodo, inputs.hoy);
  const usd = periodo === monthOf(inputs.hoy) ? usdHoy.valor : pointOnDate(corte, inputs.usdSerie)?.valor;
  if (usd === undefined) return [];
  return [{ periodo, ...valuateAt(inputs, corte, usd, pointOnDate(corte, inputs.uvaSerie)).totales }];
};

const evolutionOf = (inputs: NetWorthInputs, usdHoy: SeriePoint): NetWorthMonthDTO[] => {
  const primero = firstDataMonth(inputs);
  if (primero === null) return [];
  const desde = primero > NET_WORTH_START ? primero : NET_WORTH_START;
  return monthRange(desde, monthOf(inputs.hoy)).flatMap((periodo) => monthPoint(inputs, periodo, usdHoy));
};

export function buildNetWorth(inputs: NetWorthInputs, usdHoy: SeriePoint): NetWorthDTO {
  const foto = valuateAt(inputs, inputs.hoy, usdHoy.valor, pointOnDate(inputs.hoy, inputs.uvaSerie));
  return {
    fecha: inputs.hoy,
    usdOficial: usdHoy.valor,
    usdOficialFecha: usdHoy.fecha,
    uva: foto.uva?.valor ?? null,
    uvaFecha: foto.uva?.fecha ?? null,
    totales: foto.totales,
    items: foto.items,
    evolucion: evolutionOf(inputs, usdHoy),
    activosManuales: inputs.assets,
  };
}
