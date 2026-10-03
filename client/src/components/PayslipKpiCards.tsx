import PaymentsIcon from "@mui/icons-material/Payments";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import PercentIcon from "@mui/icons-material/Percent";
import SavingsIcon from "@mui/icons-material/Savings";
import { usePayslipSummary } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { KpiGrid } from "./KpiGrid.js";
import { Kpi } from "./Kpi.js";

export const PayslipKpiCards = () => {
  const { data } = usePayslipSummary();
  if (!data) return null;

  const money = (value: number) => formatMoney(value, "ARS");
  const usd = (value: number) => formatMoney(value, "USD");
  const percent = (value: number) => `${value.toFixed(1)}%`;

  const variacion = data.variacionNetoMensual * 100;
  const variacionSub = data.periodos > 1
    ? `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}% vs mes anterior`
    : "primer recibo";
  const anio = data.ultimoPeriodo.slice(0, 4);

  return (
    <KpiGrid>
      <Kpi label="Último neto" value={data.ultimoNeto} format={money} sub={variacionSub} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Neto en USD" value={data.ultimoNetoUsd ?? 0} format={usd} sub={data.ultimoNetoUsd != null ? data.ultimoPeriodo : "sin tipo de cambio"} icon={<AttachMoneyIcon />} color="warning" />
      <Kpi label="Descuentos" value={data.porcentajeDescuentos * 100} format={percent} sub="sobre el bruto" icon={<PercentIcon />} color="secondary" />
      <Kpi label={`Acumulado ${anio}`} value={data.netoAcumuladoAnio} format={money} sub={`${data.recibosAnio} recibos`} icon={<SavingsIcon />} color="success" />
    </KpiGrid>
  );
};
