import { PieChart } from "@mui/x-charts/PieChart";
import { Typography, useTheme } from "@mui/material";
import { useByCategory, type StatFilters } from "../../api/hooks.js";
import { formatMoney } from "../../format.js";
import { categoricalPalette } from "./palette.js";

export const CategoryBreakdownChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useByCategory(filters);
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const palette = categoricalPalette(theme.palette.mode);
  const series = data.map((d, i) => ({
    id: d.category,
    value: d.total,
    label: d.category,
    color: palette[i % palette.length],
  }));

  return (
    <PieChart
      series={[{
        data: series,
        innerRadius: 40,
        valueFormatter: (item) => formatMoney(item.value, filters.currency),
        highlightScope: { fade: "global", highlight: "item" },
      }]}
      height={260}
    />
  );
};
