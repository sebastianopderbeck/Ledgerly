import {
  MESES_SERVICIO,
  type Cadencia, type CashFlowDTO, type CashFlowMonthDTO, type Currency, type FixedServiceCadencia, type PayslipTipo,
} from "@ledgerly/shared";
import { addDays, addMonths, addMonthsClamped, monthOf, monthRange, monthsBetween } from "./months.js";
import { rateOnDate, type RatePoint } from "./rateOnDate.js";
import { raiseFactor, raisesBetween, type SalaryInflation, type SalaryRaise } from "./salaryRaise.js";
import { DIAS_CIERRE_A_VENCIMIENTO, statementDueDate } from "./statementDueDate.js";
import { MESES_CADENCIA } from "./subscriptions.js";

export const HORIZONTE_MESES = 6;

export const FALTA_RECIBO = "Recibo de sueldo";
export const FALTA_SAC = "Recibo del SAC";
export const FALTA_HIPOTECA = "Cuota de la hipoteca";
export const FALTA_AUTO = "Cupón del auto";
export const FALTA_COTIZACION = "Cotización del dólar";
export const faltaResumen = (cardLabel: string): string => `Resumen ${cardLabel}`;
export const ESTIMADO_SUELDO = "Sueldo (último neto)";
export const ESTIMADO_SAC = "SAC (½ del último neto)";
export const ESTIMADO_SAC_CON_AUMENTO = "SAC (½ del sueldo estimado)";
export const estimadoTarjeta = (cardLabel: string): string => `${cardLabel} (solo cuotas)`;
export const estimadoTarjetaConSuscripciones = (cardLabel: string): string => `${cardLabel} (cuotas y suscripciones)`;

const AUMENTO_MENSUAL = new Intl.NumberFormat("es-AR", {
  style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero",
});

const detalleAumento = (aumentoMensual: number): string =>
  aumentoMensual === 0 ? "" : ` ${AUMENTO_MENSUAL.format(aumentoMensual)} por mes`;

const MES_LARGO = new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC" });
const LISTA = new Intl.ListFormat("es", { type: "conjunction" });

const nombreMes = (mes: string): string => {
  const [year, monthNumber] = mes.split("-").map(Number);
  return MES_LARGO.format(new Date(Date.UTC(year, monthNumber - 1, 1)));
};

export const estimadoSueldo = (raises: SalaryRaise[]): string => {
  if (raises.length === 0) return ESTIMADO_SUELDO;
  const aumento = AUMENTO_MENSUAL.format(raiseFactor(raises) - 1);
  const cuales = `${raises.length === 1 ? "aumento" : "aumentos"} de ${LISTA.format(raises.map((raise) => nombreMes(raise.mes)))}`;
  const rem = raises.some((raise) => raise.conRem) ? " · IPC esperado del REM" : "";
  return `Sueldo (último neto ${aumento} por ${cuales}${rem})`;
};

export const estimadoSac = (raises: SalaryRaise[]): string => (raises.length === 0 ? ESTIMADO_SAC : ESTIMADO_SAC_CON_AUMENTO);

export const estimadoHipoteca = (aumentoMensual: number): string => `Hipoteca (última cuota${detalleAumento(aumentoMensual)})`;
export const estimadoAuto = (aumentoMensual: number): string => `Auto (último cupón${detalleAumento(aumentoMensual)})`;
export const estimadoServicios = (aumentoMensual: number): string => `Servicios (último monto${detalleAumento(aumentoMensual)})`;

export interface CashFlowPayslip {
  fechaPago: string;
  tipo: PayslipTipo;
  neto: number;
}

export interface CashFlowStatement {
  issuer: string;
  cardLabel: string;
  closingDate: string | null;
  dueDate: string | null;
  saldoArs: number;
  saldoUsd: number;
  uploadedAt: string;
}

export interface PendingInstallment {
  amount: number;
  remaining: number;
}

export interface CashFlowCard {
  issuer: string;
  cardLabel: string;
  baseMonth: string;
  closingDate: string;
  installments: PendingInstallment[];
}

export interface CashFlowCoupon {
  fecha: string;
  cuotaNro: number;
  monto: number;
}

export interface CashFlowPlan {
  coupons: CashFlowCoupon[];
  cuotasTotales: number | null;
  aumentoMensual: number;
}

export interface CashFlowService {
  monto: number;
  cadencia: FixedServiceCadencia;
  desde: string;
  hasta: string | null;
  montoDesde: string;
}

export interface CashFlowSubscription {
  issuer: string;
  moneda: Currency;
  monto: number;
  cadencia: Cadencia;
  proximoCobro: string;
}

export interface InstallmentTxInput {
  amount: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

export interface CashFlowInput {
  today: string;
  payslips: CashFlowPayslip[];
  statements: CashFlowStatement[];
  cards: CashFlowCard[];
  mortgage: CashFlowPlan;
  auto: CashFlowPlan;
  usdRates: RatePoint[];
  inflacion?: SalaryInflation;
  services?: CashFlowService[];
  subscriptions?: CashFlowSubscription[];
  horizon?: number;
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

export function statementAmountArs(
  { saldoArs, saldoUsd }: Pick<CashFlowStatement, "saldoArs" | "saldoUsd">,
  rate: number | null,
): number {
  return Math.max(0, saldoArs + saldoUsd * (rate ?? 0));
}

const remainingOf = ({ installmentCurrent, installmentTotal }: InstallmentTxInput): number =>
  installmentCurrent === null || installmentTotal === null ? 0 : installmentTotal - installmentCurrent;

export function toCashFlowCard(statement: CashFlowStatement, txs: InstallmentTxInput[]): CashFlowCard | null {
  const dueDate = statementDueDate(statement);
  if (!dueDate) return null;
  const closingDate = statement.closingDate ?? addDays(dueDate, -DIAS_CIERRE_A_VENCIMIENTO);
  const installments = txs
    .map((tx) => ({ amount: tx.amount, remaining: remainingOf(tx) }))
    .filter((installment) => installment.remaining > 0);
  return { issuer: statement.issuer, cardLabel: statement.cardLabel, baseMonth: monthOf(dueDate), closingDate, installments };
}

export function installmentFloor(card: CashFlowCard, month: string): number {
  const offset = monthsBetween(card.baseMonth, month);
  if (offset < 1) return 0;
  return sum(card.installments.filter((installment) => installment.remaining >= offset).map((installment) => installment.amount));
}

const lastCoupon = (coupons: CashFlowCoupon[]): CashFlowCoupon | null =>
  coupons.reduce<CashFlowCoupon | null>((last, coupon) => (!last || coupon.cuotaNro > last.cuotaNro ? coupon : last), null);

export function projectPlanPayment(plan: CashFlowPlan, month: string): number {
  const last = lastCoupon(plan.coupons);
  if (!last) return 0;
  const offset = monthsBetween(monthOf(last.fecha), month);
  if (offset < 1) return 0;
  if (plan.cuotasTotales !== null && last.cuotaNro + offset > plan.cuotasTotales) return 0;
  return last.monto * (1 + plan.aumentoMensual) ** offset;
}

export function servicePays({ cadencia, desde, hasta }: CashFlowService, mes: string): boolean {
  if (mes < desde || (hasta !== null && mes > hasta)) return false;
  return monthsBetween(desde, mes) % MESES_SERVICIO[cadencia] === 0;
}

export function projectServiceAmount({ monto, montoDesde }: CashFlowService, mes: string, aumentoMensual: number): number {
  return monto * (1 + aumentoMensual) ** Math.max(0, monthsBetween(montoDesde, mes));
}

const statementOffset = (closingDate: string, cobro: string): number => {
  let offset = 1;
  while (addMonthsClamped(closingDate, offset) < cobro) offset += 1;
  return offset;
};

export function subscriptionPaymentMonths(
  card: Pick<CashFlowCard, "baseMonth" | "closingDate">,
  { proximoCobro, cadencia }: Pick<CashFlowSubscription, "proximoCobro" | "cadencia">,
  ultimoMes: string,
): string[] {
  const cobro = (index: number): string => addMonthsClamped(proximoCobro, index * MESES_CADENCIA[cadencia]);
  const mesDePago = (index: number): string => addMonths(card.baseMonth, statementOffset(card.closingDate, cobro(index)));
  let index = 0;
  while (cobro(index) <= card.closingDate) index += 1;
  const meses: string[] = [];
  for (let mes = mesDePago(index); mes <= ultimoMes; mes = mesDePago(index)) {
    meses.push(mes);
    index += 1;
  }
  return meses;
}

export function incomeByMonth(payslips: CashFlowPayslip[]): Map<string, CashFlowPayslip[]> {
  const byMonth = new Map<string, CashFlowPayslip[]>();
  for (const payslip of payslips) {
    const month = monthOf(payslip.fechaPago);
    byMonth.set(month, [...(byMonth.get(month) ?? []), payslip]);
  }
  return byMonth;
}

interface DatedStatement {
  statement: CashFlowStatement;
  vence: string;
  mes: string;
}

interface CardTrack {
  cardLabel: string;
  firstMonth: string;
  statements: DatedStatement[];
  card: CashFlowCard | null;
}

interface StatementTotal {
  monto: number;
  sinCotizacion: boolean;
}

interface TrackMonth {
  track: CardTrack;
  totals: StatementTotal[];
}

interface ClosedPlanMonth {
  monto: number;
  falta: boolean;
}

interface SubscriptionCharge {
  issuer: string;
  mes: string;
  moneda: Currency;
  monto: number;
}

interface EstimatedCard {
  cardLabel: string;
  monto: number;
  conSuscripciones: boolean;
  sinCotizacion: boolean;
}

interface FlowContext {
  today: string;
  mesActual: string;
  usdRates: RatePoint[];
  recibosPorMes: Map<string, CashFlowPayslip[]>;
  tracks: CardTrack[];
  mortgage: CashFlowPlan;
  auto: CashFlowPlan;
  ultimoNeto: number;
  mesUltimoRecibo: string | null;
  inflacion: SalaryInflation | null;
  services: CashFlowService[];
  charges: SubscriptionCharge[];
  cotizacionHoy: number | null;
}

const NO_PLAN_MONTH: ClosedPlanMonth = { monto: 0, falta: false };

const onlyIf = (condition: boolean, text: string): string[] => (condition ? [text] : []);

const isSacMonth = (month: string): boolean => month.endsWith("-06") || month.endsWith("-12");

const earliest = (values: string[]): string => values.reduce((first, value) => (value < first ? value : first));

const later = (a: string, b: string): string => (a > b ? a : b);

const savingsRate = (margen: number | null, ingreso: number | null): number | null =>
  margen !== null && ingreso !== null && ingreso > 0 ? margen / ingreso : null;

const isMensual = (payslip: CashFlowPayslip): boolean => payslip.tipo === "mensual";

const isSac = (payslip: CashFlowPayslip): boolean => payslip.tipo === "sac";

const netos = (payslips: CashFlowPayslip[]): number => sum(payslips.map((payslip) => payslip.neto));

function dedupeStatements(statements: CashFlowStatement[]): CashFlowStatement[] {
  const byKey = new Map<string, CashFlowStatement>();
  statements.forEach((statement, index) => {
    const key = statement.closingDate ? `${statement.issuer}|${statement.closingDate}` : `sin-cierre|${index}`;
    const current = byKey.get(key);
    if (!current || statement.uploadedAt > current.uploadedAt) byKey.set(key, statement);
  });
  return [...byKey.values()];
}

function datedStatements(statements: CashFlowStatement[]): DatedStatement[] {
  return statements
    .flatMap((statement) => {
      const vence = statementDueDate(statement);
      return vence ? [{ statement, vence, mes: monthOf(vence) }] : [];
    })
    .sort((a, b) => a.vence.localeCompare(b.vence));
}

function cardTracks(statements: DatedStatement[], cards: CashFlowCard[]): CardTrack[] {
  const byIssuer = new Map<string, DatedStatement[]>();
  for (const dated of statements) {
    const issuer = dated.statement.issuer;
    byIssuer.set(issuer, [...(byIssuer.get(issuer) ?? []), dated]);
  }
  return [...byIssuer.entries()].map(([issuer, list]) => ({
    cardLabel: list[list.length - 1].statement.cardLabel,
    firstMonth: list[0].mes,
    statements: list,
    card: cards.find((card) => card.issuer === issuer) ?? null,
  }));
}

function statementTotal({ statement, vence }: DatedStatement, ctx: FlowContext): StatementTotal {
  if (statement.saldoUsd <= 0) return { monto: statementAmountArs(statement, null), sinCotizacion: false };
  const rate = rateOnDate(vence < ctx.today ? vence : ctx.today, ctx.usdRates);
  return { monto: statementAmountArs(statement, rate), sinCotizacion: rate === null };
}

const trackMonths = (ctx: FlowContext, mes: string): TrackMonth[] =>
  ctx.tracks
    .filter((track) => track.firstMonth <= mes)
    .map((track) => ({
      track,
      totals: track.statements.filter((dated) => dated.mes === mes).map((dated) => statementTotal(dated, ctx)),
    }));

const couponsIn = (plan: CashFlowPlan, mes: string): CashFlowCoupon[] =>
  plan.coupons.filter((coupon) => monthOf(coupon.fecha) === mes);

const planFinished = (plan: CashFlowPlan, last: CashFlowCoupon, mes: string): boolean =>
  plan.cuotasTotales !== null && last.cuotaNro >= plan.cuotasTotales && mes > monthOf(last.fecha);

function closedPlanMonth(plan: CashFlowPlan, mes: string): ClosedPlanMonth {
  const last = lastCoupon(plan.coupons);
  if (!last) return NO_PLAN_MONTH;
  if (mes < earliest(plan.coupons.map((coupon) => monthOf(coupon.fecha)))) return NO_PLAN_MONTH;
  const delMes = couponsIn(plan, mes);
  if (delMes.length > 0) return { monto: sum(delMes.map((coupon) => coupon.monto)), falta: false };
  return { monto: 0, falta: !planFinished(plan, last, mes) };
}

const servicesDue = (ctx: FlowContext, mes: string): CashFlowService[] =>
  ctx.services.filter((service) => servicePays(service, mes));

const expectedInflation = ({ inflacion }: FlowContext): number => inflacion?.esperadaMensual ?? 0;

function closedMonth(ctx: FlowContext, mes: string): CashFlowMonthDTO {
  const recibos = ctx.recibosPorMes.get(mes) ?? [];
  const conSac = recibos.some(isSac);
  const ingreso = recibos.length > 0 ? netos(recibos) : null;
  const tracks = trackMonths(ctx, mes);
  const totals = tracks.flatMap((trackMonth) => trackMonth.totals);
  const hipoteca = closedPlanMonth(ctx.mortgage, mes);
  const auto = closedPlanMonth(ctx.auto, mes);
  const faltantes = [
    ...onlyIf(!recibos.some(isMensual), FALTA_RECIBO),
    ...onlyIf(isSacMonth(mes) && !conSac, FALTA_SAC),
    ...tracks.filter((trackMonth) => trackMonth.totals.length === 0).map((trackMonth) => faltaResumen(trackMonth.track.cardLabel)),
    ...onlyIf(hipoteca.falta, FALTA_HIPOTECA),
    ...onlyIf(auto.falta, FALTA_AUTO),
    ...onlyIf(totals.some((total) => total.sinCotizacion), FALTA_COTIZACION),
  ];
  const tarjetas = sum(totals.map((total) => total.monto));
  const servicios = sum(servicesDue(ctx, mes).map((service) => service.monto));
  const egresos = tarjetas + hipoteca.monto + auto.monto + servicios;
  const completo = faltantes.length === 0;
  const margen = completo && ingreso !== null ? ingreso - egresos : null;
  return {
    mes,
    estado: completo ? "completo" : "incompleto",
    ingreso,
    conSac,
    tarjetas,
    hipoteca: hipoteca.monto,
    auto: auto.monto,
    servicios,
    egresos,
    margen,
    tasaAhorro: savingsRate(margen, ingreso),
    faltantes,
    estimados: [],
  };
}

interface ProjectedPlanMonth {
  monto: number;
  estimado: boolean;
}

function projectedPlanMonth(plan: CashFlowPlan, mes: string): ProjectedPlanMonth {
  const delMes = couponsIn(plan, mes);
  if (delMes.length > 0) return { monto: sum(delMes.map((coupon) => coupon.monto)), estimado: false };
  const monto = projectPlanPayment(plan, mes);
  return { monto, estimado: monto > 0 };
}

const salaryRaises = ({ inflacion, mesUltimoRecibo }: FlowContext, mes: string): SalaryRaise[] =>
  inflacion && mesUltimoRecibo ? raisesBetween(mesUltimoRecibo, mes, inflacion) : [];

function subscriptionCharges(cards: CashFlowCard[], subscriptions: CashFlowSubscription[], ultimoMes: string): SubscriptionCharge[] {
  return cards.flatMap((card) => subscriptions
    .filter((subscription) => subscription.issuer === card.issuer)
    .flatMap((subscription) => subscriptionPaymentMonths(card, subscription, ultimoMes)
      .map((mes) => ({ issuer: card.issuer, mes, moneda: subscription.moneda, monto: subscription.monto }))));
}

const chargeArs = ({ moneda, monto }: SubscriptionCharge, cotizacion: number | null): number | null => {
  if (moneda === "ARS") return monto;
  return cotizacion === null ? null : monto * cotizacion;
};

function estimatedCard(ctx: FlowContext, { cardLabel, card }: CardTrack, mes: string): EstimatedCard {
  if (!card) return { cardLabel, monto: 0, conSuscripciones: false, sinCotizacion: false };
  const montos = ctx.charges
    .filter((charge) => charge.issuer === card.issuer && charge.mes === mes)
    .map((charge) => chargeArs(charge, ctx.cotizacionHoy));
  const convertidos = montos.filter((monto): monto is number => monto !== null);
  return {
    cardLabel,
    monto: installmentFloor(card, mes) + sum(convertidos),
    conSuscripciones: montos.length > 0,
    sinCotizacion: convertidos.length < montos.length,
  };
}

const estimatedCardNote = ({ cardLabel, conSuscripciones }: EstimatedCard): string =>
  (conSuscripciones ? estimadoTarjetaConSuscripciones(cardLabel) : estimadoTarjeta(cardLabel));

function projectedMonth(ctx: FlowContext, mes: string): CashFlowMonthDTO {
  const recibos = ctx.recibosPorMes.get(mes) ?? [];
  const mensuales = recibos.filter(isMensual);
  const sacs = recibos.filter(isSac);
  const sueldoEstimado = mensuales.length === 0;
  const sacEstimado = isSacMonth(mes) && sacs.length === 0;
  const raises = salaryRaises(ctx, mes);
  const sueldoProyectado = ctx.ultimoNeto * raiseFactor(raises);
  const sueldo = sueldoEstimado ? sueldoProyectado : netos(mensuales);
  const sac = sacEstimado ? sueldoProyectado / 2 : netos(sacs);
  const tracks = trackMonths(ctx, mes);
  const reales = tracks.flatMap((trackMonth) => trackMonth.totals);
  const estimadas = tracks
    .filter((trackMonth) => trackMonth.totals.length === 0)
    .map(({ track }) => estimatedCard(ctx, track, mes));
  const tarjetas = sum(reales.map((total) => total.monto)) + sum(estimadas.map((estimada) => estimada.monto));
  const sinCotizacion = reales.some((total) => total.sinCotizacion) || estimadas.some((estimada) => estimada.sinCotizacion);
  const hipoteca = projectedPlanMonth(ctx.mortgage, mes);
  const auto = projectedPlanMonth(ctx.auto, mes);
  const ingreso = sueldo + sac;
  const aumentoServicios = expectedInflation(ctx);
  const servicios = sum(servicesDue(ctx, mes).map((service) => projectServiceAmount(service, mes, aumentoServicios)));
  const egresos = tarjetas + hipoteca.monto + auto.monto + servicios;
  const margen = ingreso - egresos;
  return {
    mes,
    estado: mes === ctx.mesActual ? "en_curso" : "proyectado",
    ingreso,
    conSac: isSacMonth(mes) || sacs.length > 0,
    tarjetas,
    hipoteca: hipoteca.monto,
    auto: auto.monto,
    servicios,
    egresos,
    margen,
    tasaAhorro: savingsRate(margen, ingreso),
    faltantes: onlyIf(sinCotizacion, FALTA_COTIZACION),
    estimados: [
      ...onlyIf(sueldoEstimado, estimadoSueldo(raises)),
      ...onlyIf(sacEstimado, estimadoSac(raises)),
      ...estimadas.map(estimatedCardNote),
      ...onlyIf(hipoteca.estimado, estimadoHipoteca(ctx.mortgage.aumentoMensual)),
      ...onlyIf(auto.estimado, estimadoAuto(ctx.auto.aumentoMensual)),
      ...onlyIf(servicios > 0, estimadoServicios(aumentoServicios)),
    ],
  };
}

const latestMonthlyPayslip = (payslips: CashFlowPayslip[]): CashFlowPayslip | null =>
  payslips
    .filter(isMensual)
    .reduce<CashFlowPayslip | null>((latest, payslip) => (!latest || payslip.fechaPago > latest.fechaPago ? payslip : latest), null);

export function buildCashFlow(input: CashFlowInput): CashFlowDTO {
  const mesActual = monthOf(input.today);
  const statements = datedStatements(dedupeStatements(input.statements));
  if (input.payslips.length === 0 || statements.length === 0) return { mesActual, meses: [] };

  const recibosPorMes = incomeByMonth(input.payslips);
  const ultimoRecibo = latestMonthlyPayslip(input.payslips);
  const ultimoMes = addMonths(mesActual, (input.horizon ?? HORIZONTE_MESES) - 1);
  const ctx: FlowContext = {
    today: input.today,
    mesActual,
    usdRates: input.usdRates,
    recibosPorMes,
    tracks: cardTracks(statements, input.cards),
    mortgage: input.mortgage,
    auto: input.auto,
    ultimoNeto: ultimoRecibo?.neto ?? 0,
    mesUltimoRecibo: ultimoRecibo ? monthOf(ultimoRecibo.fechaPago) : null,
    inflacion: input.inflacion ?? null,
    services: input.services ?? [],
    charges: subscriptionCharges(input.cards, input.subscriptions ?? [], ultimoMes),
    cotizacionHoy: rateOnDate(input.today, input.usdRates),
  };
  const desde = later(earliest([...recibosPorMes.keys()]), statements[0].mes);
  const historia = monthRange(desde, addMonths(mesActual, -1));
  const proyeccion = monthRange(mesActual, ultimoMes);
  return {
    mesActual,
    meses: [...historia.map((mes) => closedMonth(ctx, mes)), ...proyeccion.map((mes) => projectedMonth(ctx, mes))],
  };
}
