import { BarChart } from "@mui/x-charts/BarChart";
import { Typography, useTheme } from "@mui/material";
import { useFutureInstallments, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";

export const FutureInstallmentsChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useFutureInstallments(filters);
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin cuotas pendientes</Typography>;

  return (
    <BarChart
      height={260}
      xAxis={[{ scaleType: "band", data: data.map((d) => d.month) }]}
      yAxis={[{ valueFormatter: (value: number) => formatMoneyCompact(value, filters.currency) }]}
      series={[{
        data: data.map((d) => d.total),
        label: "Cuotas a vencer",
        color: seriesColor(theme.palette.mode, 7),
        valueFormatter: (value) => (value === null ? "" : formatMoney(value, filters.currency)),
      }]}
    />
  );
};
