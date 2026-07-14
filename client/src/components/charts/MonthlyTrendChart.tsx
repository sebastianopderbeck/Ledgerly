import { BarChart } from "@mui/x-charts/BarChart";
import { Typography, useTheme } from "@mui/material";
import { useMonthly, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";

export const MonthlyTrendChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useMonthly(filters);
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  return (
    <BarChart
      height={260}
      xAxis={[{ scaleType: "band", data: data.map((d) => d.month) }]}
      yAxis={[{ valueFormatter: (value: number) => formatMoneyCompact(value, filters.currency) }]}
      series={[{
        data: data.map((d) => d.total),
        label: "Gastado",
        color: seriesColor(theme.palette.mode, 0),
        valueFormatter: (value) => (value === null ? "" : formatMoney(value, filters.currency)),
      }]}
    />
  );
};
