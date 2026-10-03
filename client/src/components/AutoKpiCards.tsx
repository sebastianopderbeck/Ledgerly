import PaymentsIcon from "@mui/icons-material/Payments";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import DonutLargeIcon from "@mui/icons-material/DonutLarge";
import { useAutoSummary } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { KpiGrid } from "./KpiGrid.js";
import { Kpi } from "./Kpi.js";

export const AutoKpiCards = () => {
  const { data } = useAutoSummary();
  if (!data) return null;

  const money = (value: number) => formatMoney(value, "ARS");
  const usd = (value: number) => formatMoney(value, "USD");
  const percent = (value: number) => `${value.toFixed(1)}%`;
  const usdSub = data.totalPagadoUsd > 0 ? `en ${data.cuotasPagadas} cuotas` : undefined;

  return (
    <KpiGrid>
      <Kpi label="Total pagado" value={data.totalPagado} format={money} sub={`en ${data.cuotasPagadas} cuotas`} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Valor del auto" value={data.valorActualAuto} format={money} sub={data.modelo} icon={<DirectionsCarIcon />} color="secondary" />
      <Kpi label="Pagado en USD" value={data.totalPagadoUsd} format={usd} sub={usdSub} icon={<AttachMoneyIcon />} color="warning" />
      <Kpi label="Avance" value={data.porcentajeAvance * 100} format={percent} sub={`${data.cuotasPagadas}/${data.cuotasTotales} cuotas`} icon={<DonutLargeIcon />} color="success" />
    </KpiGrid>
  );
};
