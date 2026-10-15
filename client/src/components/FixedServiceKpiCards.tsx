import ElectricalServicesOutlinedIcon from "@mui/icons-material/ElectricalServicesOutlined";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import FormatListBulletedOutlinedIcon from "@mui/icons-material/FormatListBulletedOutlined";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { monthlyTotal } from "../fixedServices.js";
import { Kpi } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";

interface FixedServiceKpiCardsProps {
  activos: FixedServiceDTO[];
}

const money = (value: number): string => formatMoney(value, "ARS");

const count = (value: number): string => String(Math.round(value));

export const FixedServiceKpiCards = ({ activos }: FixedServiceKpiCardsProps) => {
  const porMes = monthlyTotal(activos);

  return (
    <KpiGrid cardCount={3}>
      <Kpi label="Por mes" value={porMes} format={money} sub="los bimestrales, a la mitad" icon={<ElectricalServicesOutlinedIcon />} color="primary" />
      <Kpi label="Por año" value={porMes * 12} format={money} sub="al monto de hoy" icon={<EventRepeatOutlinedIcon />} color="secondary" />
      <Kpi label="Activos" value={activos.length} format={count} sub="se restan en el Flujo" icon={<FormatListBulletedOutlinedIcon />} color="warning" />
    </KpiGrid>
  );
};
