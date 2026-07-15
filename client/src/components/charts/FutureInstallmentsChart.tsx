import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useFutureInstallments, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const FutureInstallmentsChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useFutureInstallments(filters);
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin cuotas pendientes</Typography>;

  const color = seriesColor(theme.palette.mode, 7);
  const chartData = data.map((d) => ({ month: d.month, total: d.total }));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={chartData}
        theme={nivoTheme(theme)}
        keys={["total"]}
        indexBy="month"
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        padding={0.35}
        borderRadius={6}
        enableLabel={false}
        enableGridX={false}
        valueFormat={(value) => formatMoney(value, filters.currency)}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), filters.currency) }}
        motionConfig="gentle"
      />
    </Box>
  );
};
