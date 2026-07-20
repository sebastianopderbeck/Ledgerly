import type { ReactNode } from "react";
import { Card, CardContent, Box, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import DescriptionIcon from "@mui/icons-material/Description";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { useSummary, useOficialRate, type StatFilters } from "../api/hooks.js";
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
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box
          sx={{
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: 2.5,
            display: "grid",
            placeItems: "center",
            color: `${color}.main`,
            bgcolor: (theme) => `${theme.palette[color].main}1f`,
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

export const KpiCards = (filters: StatFilters) => {
  const { data } = useSummary(filters);
  const { data: fx } = useOficialRate();
  if (!data) return null;

  const rate = fx?.rate ?? null;
  const totalGastadoSub = filters.currency === "ARS" && rate
    ? `≈ ${formatMoney(data.totalPurchases / rate, "USD")}`
    : undefined;
  const money = (value: number) => formatMoney(value, filters.currency);
  const integer = (value: number) => String(Math.round(value));

  return (
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}
    >
      <Kpi label="Total gastado" value={data.totalPurchases} format={money} sub={totalGastadoSub} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Movimientos" value={data.transactionCount} format={integer} icon={<ReceiptLongIcon />} color="secondary" />
      <Kpi label="Resúmenes" value={data.statementCount} format={integer} icon={<DescriptionIcon />} color="success" />
      <Kpi label="Deuda en cuotas" value={data.futureInstallmentTotal} format={money} icon={<CreditCardIcon />} color="warning" />
    </MotionBox>
  );
};
