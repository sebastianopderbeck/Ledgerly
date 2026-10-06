import { Router } from "express";
import type { Types } from "mongoose";
import { asyncHandler } from "../errors.js";
import {
  AutoCouponModel, MacroSeriesModel, MortgageCouponModel, PayslipModel, StatementModel, TransactionModel,
} from "../../db/models.js";
import { latestStatementIdsPerIssuer, type StatementRecency } from "../../stats/lastStatement.js";
import { computeCreditProgress, type CouponInput } from "../../stats/amortization.js";
import { AUTO_CUOTAS_TOTALES } from "../../stats/autoProgress.js";
import { autoMonthlyGrowth, mortgageMonthlyGrowth } from "../../stats/planGrowth.js";
import type { RatePoint } from "../../stats/rateOnDate.js";
import {
  buildCashFlow, toCashFlowCard,
  type CashFlowCard, type CashFlowCoupon, type CashFlowPayslip, type CashFlowStatement, type InstallmentTxInput,
} from "../../stats/cashFlow.js";

interface MoneyPairRow {
  ars: number;
  usd: number;
}

interface StatementRow {
  _id: Types.ObjectId;
  issuer: string;
  cardLabel: string;
  closingDate?: Date | null;
  dueDate?: Date | null;
  totals?: { saldoActual?: MoneyPairRow | null } | null;
}

interface PayslipRow {
  fechaPago: Date;
  tipo: CashFlowPayslip["tipo"];
  neto: number;
}

interface InstallmentRow {
  statementId: Types.ObjectId;
  amount: number;
  installmentCurrent?: number | null;
  installmentTotal?: number | null;
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const isoDayOrNull = (date: Date | null | undefined): string | null => (date ? isoDay(date) : null);

const uploadedAtOf = (statement: StatementRow): Date => (statement as unknown as { uploadedAt: Date }).uploadedAt;

const toRecency = (statement: StatementRow): StatementRecency<Types.ObjectId> => ({
  id: statement._id,
  issuer: statement.issuer,
  closingDate: statement.closingDate ?? null,
  uploadedAt: uploadedAtOf(statement),
});

const toFlowStatement = (statement: StatementRow): CashFlowStatement => ({
  issuer: statement.issuer,
  cardLabel: statement.cardLabel,
  closingDate: isoDayOrNull(statement.closingDate),
  dueDate: isoDayOrNull(statement.dueDate),
  saldoArs: statement.totals?.saldoActual?.ars ?? 0,
  saldoUsd: statement.totals?.saldoActual?.usd ?? 0,
  uploadedAt: uploadedAtOf(statement).toISOString(),
});

const toFlowPayslip = ({ fechaPago, tipo, neto }: PayslipRow): CashFlowPayslip => ({ fechaPago: isoDay(fechaPago), tipo, neto });

const toFlowCoupon = (fecha: Date, cuotaNro: number, monto: number): CashFlowCoupon => ({ fecha: isoDay(fecha), cuotaNro, monto });

const toCouponInput = (coupon: CouponInput): CouponInput => ({
  prestamoNro: coupon.prestamoNro,
  cuotaNro: coupon.cuotaNro,
  capital: coupon.capital,
  intereses: coupon.intereses,
  seguroIncendio: coupon.seguroIncendio,
  totalDebitado: coupon.totalDebitado,
  cuotaPuraUva: coupon.cuotaPuraUva,
  cotizacionUva: coupon.cotizacionUva,
  tna: coupon.tna,
});

const toRatePoint = ({ fecha, valor }: RatePoint): RatePoint => ({ fecha, valor });

const toInstallmentTx = (tx: InstallmentRow): InstallmentTxInput => ({
  amount: tx.amount,
  installmentCurrent: tx.installmentCurrent ?? null,
  installmentTotal: tx.installmentTotal ?? null,
});

const latestCards = (statements: StatementRow[], latestIds: Types.ObjectId[], txs: InstallmentRow[]): CashFlowCard[] => {
  const latest = new Set(latestIds.map(String));
  return statements
    .filter((statement) => latest.has(String(statement._id)))
    .flatMap((statement) => {
      const own = txs.filter((tx) => String(tx.statementId) === String(statement._id)).map(toInstallmentTx);
      const card = toCashFlowCard(toFlowStatement(statement), own);
      return card ? [card] : [];
    });
};

export const cashFlowRouter = Router();

cashFlowRouter.get("/", asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [payslips, statements, mortgageCoupons, autoCoupons, usdPoints, uvaPoints] = await Promise.all([
    PayslipModel.find().lean(),
    StatementModel.find().lean(),
    MortgageCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    AutoCouponModel.find().sort({ cuotaNro: 1 }).lean(),
    MacroSeriesModel.find({ serie: "usd_oficial" }).sort({ fecha: 1 }).lean(),
    MacroSeriesModel.find({ serie: "uva" }).sort({ fecha: 1 }).lean(),
  ]);
  const latestIds = latestStatementIdsPerIssuer(statements.map(toRecency));
  const installmentTxs = await TransactionModel.find({
    statementId: { $in: latestIds }, type: "purchase", isInstallment: true, currency: "ARS",
  }).lean();
  const credit = computeCreditProgress(mortgageCoupons.map(toCouponInput));
  res.json(buildCashFlow({
    today,
    payslips: payslips.map(toFlowPayslip),
    statements: statements.map(toFlowStatement),
    cards: latestCards(statements, latestIds, installmentTxs),
    mortgage: {
      coupons: mortgageCoupons.map((coupon) => toFlowCoupon(coupon.fechaDebito, coupon.cuotaNro, coupon.totalDebitado)),
      cuotasTotales: credit?.cuotasTotales ?? null,
      aumentoMensual: mortgageMonthlyGrowth(
        uvaPoints.map(toRatePoint),
        mortgageCoupons.map((coupon) => ({ cuotaNro: coupon.cuotaNro, valor: coupon.cotizacionUva })),
      ),
    },
    auto: {
      coupons: autoCoupons.map((coupon) => toFlowCoupon(coupon.fechaVencimiento, coupon.cuotaNro, coupon.totalAPagar)),
      cuotasTotales: AUTO_CUOTAS_TOTALES,
      aumentoMensual: autoMonthlyGrowth(autoCoupons.map((coupon) => ({ cuotaNro: coupon.cuotaNro, valor: coupon.valorMovil }))),
    },
    usdRates: usdPoints.map(toRatePoint),
  }));
}));
