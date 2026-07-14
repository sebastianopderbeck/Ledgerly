import { Box, Card, CardContent, Typography } from "@mui/material";
import { useSummary, type StatFilters } from "../api/hooks.js";
import { formatMoney } from "../format.js";

const Kpi = ({ label, value }: { label: string; value: string }) => (
  <Card><CardContent>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="h5">{value}</Typography>
  </CardContent></Card>
);

export const KpiCards = (filters: StatFilters) => {
  const { data } = useSummary(filters);
  if (!data) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
      <Kpi label="Total gastado" value={formatMoney(data.totalPurchases, filters.currency)} />
      <Kpi label="Movimientos" value={String(data.transactionCount)} />
      <Kpi label="Resúmenes" value={String(data.statementCount)} />
      <Kpi label="Deuda en cuotas" value={formatMoney(data.futureInstallmentTotal, filters.currency)} />
    </Box>
  );
};
