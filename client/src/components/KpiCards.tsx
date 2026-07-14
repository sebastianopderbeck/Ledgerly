import type { ReactNode } from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import DescriptionIcon from "@mui/icons-material/Description";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { useSummary, type StatFilters } from "../api/hooks.js";
import { formatMoney } from "../format.js";

type KpiColor = "primary" | "secondary" | "success" | "warning";

interface KpiProps {
  label: string;
  value: string;
  icon: ReactNode;
  color: KpiColor;
}

const Kpi = ({ label, value, icon, color }: KpiProps) => (
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
          {value}
        </Typography>
      </Box>
    </CardContent>
  </Card>
);

export const KpiCards = (filters: StatFilters) => {
  const { data } = useSummary(filters);
  if (!data) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
      <Kpi label="Total gastado" value={formatMoney(data.totalPurchases, filters.currency)} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Movimientos" value={String(data.transactionCount)} icon={<ReceiptLongIcon />} color="secondary" />
      <Kpi label="Resúmenes" value={String(data.statementCount)} icon={<DescriptionIcon />} color="success" />
      <Kpi label="Deuda en cuotas" value={formatMoney(data.futureInstallmentTotal, filters.currency)} icon={<CreditCardIcon />} color="warning" />
    </Box>
  );
};
