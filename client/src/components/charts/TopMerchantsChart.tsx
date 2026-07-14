import { BarChart } from "@mui/x-charts/BarChart";
import { Typography, useTheme } from "@mui/material";
import { useTopMerchants, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";

export const TopMerchantsChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useTopMerchants({ ...filters, limit: 8 });
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  return (
    <BarChart
      height={260}
      layout="horizontal"
      yAxis={[{ scaleType: "band", data: data.map((d) => d.merchant) }]}
      xAxis={[{ valueFormatter: (value: number) => formatMoneyCompact(value, filters.currency) }]}
      series={[{
        data: data.map((d) => d.total),
        label: "Gasto",
        color: seriesColor(theme.palette.mode, 1),
        valueFormatter: (value) => (value === null ? "" : formatMoney(value, filters.currency)),
      }]}
    />
  );
};
