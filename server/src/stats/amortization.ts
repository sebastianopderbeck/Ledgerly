import type { CreditSummaryDTO } from "@ledgerly/shared";

export interface CouponInput {
  prestamoNro: string;
  cuotaNro: number;
  capital: number;
  intereses: number;
  seguroIncendio: number;
  totalDebitado: number;
  cuotaPuraUva: number;
  cotizacionUva: number;
  tna: number;
}

export function computeCreditProgress(coupons: CouponInput[]): CreditSummaryDTO | null {
  if (coupons.length === 0) return null;

  const sorted = [...coupons].sort((a, b) => a.cuotaNro - b.cuotaNro);
  const withUva = sorted.map((c) => ({
    ...c,
    capitalUva: c.capital / c.cotizacionUva,
    interesUva: c.intereses / c.cotizacionUva,
  }));
  const first = withUva[0];
  const last = withUva[withUva.length - 1];

  let i = last.tna / 12 / 100;
  if (withUva.length >= 2 && last.cuotaNro !== first.cuotaNro) {
    const growth = last.capitalUva / first.capitalUva;
    const derived = growth ** (1 / (last.cuotaNro - first.cuotaNro)) - 1;
    if (derived > 0) i = derived;
  }

  const capitalPendienteUva = last.interesUva / i - last.capitalUva;
  const capitalAmortizadoUva = withUva.reduce((sum, c) => sum + c.capitalUva, 0);
  const capitalOriginalUva = capitalPendienteUva + capitalAmortizadoUva;
  const porcentajeAvanceCapital = capitalOriginalUva > 0 ? capitalAmortizadoUva / capitalOriginalUva : 0;

  const P = last.cuotaPuraUva;
  const ratio = 1 - (capitalOriginalUva * i) / P;
  const cuotasTotales = ratio > 0 ? Math.round(Math.log(ratio) / Math.log(1 / (1 + i))) : last.cuotaNro;

  const sum = (pick: (c: CouponInput) => number) => sorted.reduce((acc, c) => acc + pick(c), 0);

  return {
    prestamoNro: last.prestamoNro,
    cuotasPagadas: last.cuotaNro,
    cuotasTotales,
    totalPagado: sum((c) => c.totalDebitado),
    capitalPagado: sum((c) => c.capital),
    interesPagado: sum((c) => c.intereses),
    seguroPagado: sum((c) => c.seguroIncendio),
    capitalOriginalUva,
    capitalAmortizadoUva,
    capitalPendienteUva,
    capitalPendientePesos: capitalPendienteUva * last.cotizacionUva,
    porcentajeAvanceCapital,
    cotizacionUvaActual: last.cotizacionUva,
    cuotaPuraUva: P,
    tna: last.tna,
  };
}
