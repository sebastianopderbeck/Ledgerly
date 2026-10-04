import type { PayslipTipo } from "@ledgerly/shared";
import { monthOf, monthsBetween } from "./months.js";
import type { RatePoint } from "./rateOnDate.js";
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
