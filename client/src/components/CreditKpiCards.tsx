import PaymentsIcon from "@mui/icons-material/Payments";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import DonutLargeIcon from "@mui/icons-material/DonutLarge";
import { useCreditCoupons, useCreditSummary } from "../api/hooks.js";
import { formatMoney, formatUva } from "../format.js";
import { KpiGrid } from "./KpiGrid.js";
import { Kpi } from "./Kpi.js";

export const CreditKpiCards = () => {
  const { data } = useCreditSummary();
  const { data: coupons } = useCreditCoupons();
  if (!data) return null;

  const money = (value: number) => formatMoney(value, "ARS");
  const percent = (value: number) => `${value.toFixed(1)}%`;

  const interesPagadoUsd = (coupons ?? []).reduce(
    (total, { intereses, tipoCambioUsd }) => (tipoCambioUsd ? total + intereses / tipoCambioUsd : total),
    0,
  );
  const interesPagadoUsdSub = interesPagadoUsd > 0 ? `≈ ${formatMoney(interesPagadoUsd, "USD")}` : undefined;

  return (
    <KpiGrid>
      <Kpi label="Total pagado" value={data.totalPagado} format={money} sub={`en ${data.cuotasPagadas} cuotas`} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Capital pendiente" value={data.capitalPendienteUva} format={formatUva} sub={`≈ ${money(data.capitalPendientePesos)}`} icon={<AccountBalanceIcon />} color="secondary" />
      <Kpi label="Interés pagado" value={data.interesPagado} format={money} sub={interesPagadoUsdSub} icon={<TrendingUpIcon />} color="warning" />
      <Kpi label="Avance" value={data.porcentajeAvanceCapital * 100} format={percent} sub={`${data.cuotasPagadas}/${data.cuotasTotales} cuotas`} icon={<DonutLargeIcon />} color="success" />
    </KpiGrid>
  );
};
