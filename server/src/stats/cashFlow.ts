import type { CashFlowDTO, CashFlowMonthDTO, PayslipTipo } from "@ledgerly/shared";
import { addMonths, monthOf, monthRange, monthsBetween } from "./months.js";
import { rateOnDate, type RatePoint } from "./rateOnDate.js";
import { statementDueDate } from "./statementDueDate.js";

export const HORIZONTE_MESES = 6;

export const FALTA_RECIBO = "Recibo de sueldo";
export const FALTA_SAC = "Recibo del SAC";
export const FALTA_HIPOTECA = "Cuota de la hipoteca";
export const FALTA_AUTO = "Cupón del auto";
export const FALTA_COTIZACION = "Cotización del dólar";
export const faltaResumen = (cardLabel: string): string => `Resumen ${cardLabel}`;
export const ESTIMADO_SUELDO = "Sueldo (último neto)";
export const ESTIMADO_SAC = "SAC (½ del último neto)";
export const ESTIMADO_HIPOTECA = "Hipoteca (última cuota)";
export const ESTIMADO_AUTO = "Auto (último cupón)";
export const estimadoTarjeta = (cardLabel: string): string => `${cardLabel} (solo cuotas)`;

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
  const installments = txs
    .map((tx) => ({ amount: tx.amount, remaining: remainingOf(tx) }))
    .filter((installment) => installment.remaining > 0);
  return { issuer: statement.issuer, cardLabel: statement.cardLabel, baseMonth: monthOf(dueDate), installments };
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
  return last.monto;
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

interface FlowContext {
  today: string;
  mesActual: string;
  usdRates: RatePoint[];
  recibosPorMes: Map<string, CashFlowPayslip[]>;
  tracks: CardTrack[];
  mortgage: CashFlowPlan;
  auto: CashFlowPlan;
  ultimoNeto: number;
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
  const egresos = tarjetas + hipoteca.monto + auto.monto;
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
    egresos,
    margen,
    tasaAhorro: savingsRate(margen, ingreso),
    faltantes,
    estimados: [],
  };
}

function projectedMonth(ctx: FlowContext, mes: string): CashFlowMonthDTO {
  return { ...closedMonth(ctx, mes), estado: mes === ctx.mesActual ? "en_curso" : "proyectado" };
}

const latestMonthlyNet = (payslips: CashFlowPayslip[]): number =>
  payslips
    .filter(isMensual)
    .reduce<CashFlowPayslip | null>((latest, payslip) => (!latest || payslip.fechaPago > latest.fechaPago ? payslip : latest), null)
    ?.neto ?? 0;

export function buildCashFlow(input: CashFlowInput): CashFlowDTO {
  const mesActual = monthOf(input.today);
  const statements = datedStatements(dedupeStatements(input.statements));
  if (input.payslips.length === 0 || statements.length === 0) return { mesActual, meses: [] };

  const recibosPorMes = incomeByMonth(input.payslips);
  const ctx: FlowContext = {
    today: input.today,
    mesActual,
    usdRates: input.usdRates,
    recibosPorMes,
    tracks: cardTracks(statements, input.cards),
    mortgage: input.mortgage,
    auto: input.auto,
    ultimoNeto: latestMonthlyNet(input.payslips),
  };
  const desde = later(earliest([...recibosPorMes.keys()]), statements[0].mes);
  const historia = monthRange(desde, addMonths(mesActual, -1));
  const proyeccion = monthRange(mesActual, addMonths(mesActual, (input.horizon ?? HORIZONTE_MESES) - 1));
  return {
    mesActual,
    meses: [...historia.map((mes) => closedMonth(ctx, mes)), ...proyeccion.map((mes) => projectedMonth(ctx, mes))],
  };
}
