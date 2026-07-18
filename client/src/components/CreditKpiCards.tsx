import type { ReactNode } from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import DonutLargeIcon from "@mui/icons-material/DonutLarge";
import { useCreditCoupons, useCreditSummary } from "../api/hooks.js";
import { formatMoney, formatUva } from "../format.js";
import { MotionBox } from "./motion/motion.js";
import { CountUp } from "./motion/CountUp.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

type KpiColor = "primary" | "secondary" | "success" | "warning";

interface KpiProps {
  label: string;
  value: number;
  format: (value: number) => string;
  sub?: string;
  icon: ReactNode;
  color: KpiColor;
}

const Kpi = ({ label, value, format, sub, icon, color }: KpiProps) => (
  <MotionBox variants={fadeUpItem}>
    <Card >
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, minHeight: 60 }}>
        <Box
          sx={{
            width: 46, height: 46, flexShrink: 0, borderRadius: 2.5, display: "grid", placeItems: "center",
            color: `${color}.main`, bgcolor: (theme) => `${theme.palette[color].main}1f`,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", lineHeight: 1.4 }}>
            {label}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }} noWrap>
            <CountUp value={value} format={format} />
          </Typography>
          {sub && <Typography variant="caption" color="text.secondary" noWrap>{sub}</Typography>}
        </Box>
      </CardContent>
    </Card>
  </MotionBox>
);

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
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}
    >
      <Kpi label="Total pagado" value={data.totalPagado} format={money} sub={`en ${data.cuotasPagadas} cuotas`} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Capital pendiente" value={data.capitalPendienteUva} format={formatUva} sub={`≈ ${money(data.capitalPendientePesos)}`} icon={<AccountBalanceIcon />} color="secondary" />
      <Kpi label="Interés pagado" value={data.interesPagado} format={money} sub={interesPagadoUsdSub} icon={<TrendingUpIcon />} color="warning" />
      <Kpi label="Avance" value={data.porcentajeAvanceCapital * 100} format={percent} sub={`${data.cuotasPagadas}/${data.cuotasTotales} cuotas`} icon={<DonutLargeIcon />} color="success" />
    </MotionBox>
  );
};
