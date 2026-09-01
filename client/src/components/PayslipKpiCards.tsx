import type { ReactNode } from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import PercentIcon from "@mui/icons-material/Percent";
import SavingsIcon from "@mui/icons-material/Savings";
import { usePayslipSummary } from "../api/hooks.js";
import { formatMoney } from "../format.js";
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
    <Card>
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
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}
    >
      <Kpi label="Último neto" value={data.ultimoNeto} format={money} sub={variacionSub} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Neto en USD" value={data.ultimoNetoUsd ?? 0} format={usd} sub={data.ultimoNetoUsd != null ? data.ultimoPeriodo : "sin tipo de cambio"} icon={<AttachMoneyIcon />} color="warning" />
      <Kpi label="Descuentos" value={data.porcentajeDescuentos * 100} format={percent} sub="sobre el bruto" icon={<PercentIcon />} color="secondary" />
      <Kpi label={`Acumulado ${anio}`} value={data.netoAcumuladoAnio} format={money} sub={`${data.recibosAnio} recibos`} icon={<SavingsIcon />} color="success" />
    </MotionBox>
  );
};
