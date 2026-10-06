import { addMonthsClamped, daysBetween } from "./months.js";
import { pointOnDate, type RatePoint } from "./rateOnDate.js";

const VENTANA_UVA_MESES = 3;
const VENTANA_AUTO_CUPONES = 6;

export interface CouponValue {
  cuotaNro: number;
  valor: number;
}

const growthPerStep = (desde: number, hasta: number, pasos: number): number | null =>
  desde > 0 && pasos > 0 ? (hasta / desde) ** (1 / pasos) - 1 : null;

export function seriesMonthlyGrowth(points: RatePoint[], meses: number): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const objetivo = addMonthsClamped(last.fecha, -meses);
  const desde = pointOnDate(objetivo, points);
  if (!desde) return null;
  const pasos = (meses * daysBetween(desde.fecha, last.fecha)) / daysBetween(objetivo, last.fecha);
  return growthPerStep(desde.valor, last.valor, pasos);
}

export function couponMonthlyGrowth(coupons: CouponValue[], ventana: number): number | null {
  const sorted = [...coupons].sort((a, b) => a.cuotaNro - b.cuotaNro);
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  const desde = sorted.find((coupon) => coupon.cuotaNro >= last.cuotaNro - ventana) ?? last;
  return growthPerStep(desde.valor, last.valor, last.cuotaNro - desde.cuotaNro);
}

export const mortgageMonthlyGrowth = (uva: RatePoint[], cotizaciones: CouponValue[]): number =>
  seriesMonthlyGrowth(uva, VENTANA_UVA_MESES) ?? couponMonthlyGrowth(cotizaciones, VENTANA_UVA_MESES) ?? 0;

export const autoMonthlyGrowth = (valoresMovil: CouponValue[]): number =>
  couponMonthlyGrowth(valoresMovil, VENTANA_AUTO_CUPONES) ?? 0;
