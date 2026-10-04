import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import type { SubscriptionsReportDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { monthlyKpiSub, type SubscriptionSections } from "../subscriptions.js";
import { Kpi } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";

interface SubscriptionKpiCardsProps {
  report: SubscriptionsReportDTO;
  sections: SubscriptionSections;
}

const WINDOW_LABEL = "en los últimos 12 meses";

const money = (value: number): string => formatMoney(value, "ARS");

const count = (value: number): string => String(Math.round(value));

export const SubscriptionKpiCards = ({
  report: { cotizacionOficial, totalMensualArs, totalMensualUsd, totalAnualArs },
  sections: { activas, cortadas, subieron, ahorroMensualArs },
}: SubscriptionKpiCardsProps) => {
  const monthlySub = monthlyKpiSub(activas.length, totalMensualUsd, cotizacionOficial);
  const stoppedSub = ahorroMensualArs > 0 ? `${money(ahorroMensualArs)} menos por mes` : WINDOW_LABEL;

  return (
    <KpiGrid cardCount={4}>
      <Kpi label="Por mes" value={totalMensualArs} format={money} sub={monthlySub} subMultiline icon={<AutorenewOutlinedIcon />} color="primary" />
      <Kpi label="Por año" value={totalAnualArs} format={money} sub="al precio de hoy" icon={<EventRepeatOutlinedIcon />} color="secondary" />
      <Kpi label="Subieron" value={subieron} format={count} sub={WINDOW_LABEL} icon={<TrendingUpOutlinedIcon />} color="warning" />
      <Kpi label="Dejaron de cobrarse" value={cortadas.length} format={count} sub={stoppedSub} icon={<CancelOutlinedIcon />} color="success" />
    </KpiGrid>
  );
};
