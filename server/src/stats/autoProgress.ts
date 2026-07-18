import type { AutoSummaryDTO } from "@ledgerly/shared";

export const AUTO_CUOTAS_TOTALES = 120;

export interface AutoCouponInput {
  grupo: string;
  orden: string;
  plan: string;
  modelo: string;
  cuotaNro: number;
  fechaVencimiento: string;
  valorMovil: number;
  totalAPagar: number;
  totalUsd: number | null;
}

export function computeAutoProgress(coupons: AutoCouponInput[]): AutoSummaryDTO | null {
  if (coupons.length === 0) return null;

  const sorted = [...coupons].sort((a, b) => a.cuotaNro - b.cuotaNro);
  const last = sorted[sorted.length - 1];
  const totalPagado = sorted.reduce((acc, c) => acc + c.totalAPagar, 0);
  const totalPagadoUsd = sorted.reduce((acc, c) => acc + (c.totalUsd ?? 0), 0);

  return {
    grupo: last.grupo,
    orden: last.orden,
    plan: last.plan,
    modelo: last.modelo,
    cuotasPagadas: sorted.length,
    cuotasTotales: AUTO_CUOTAS_TOTALES,
    porcentajeAvance: sorted.length / AUTO_CUOTAS_TOTALES,
    totalPagado,
    valorActualAuto: last.valorMovil,
    totalPagadoUsd,
    ultimaCuota: last.cuotaNro,
    fechaUltimoVencimiento: last.fechaVencimiento,
  };
}
