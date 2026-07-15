import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useTopMerchants, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const TopMerchantsChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useTopMerchants({ ...filters, limit: 8 });
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const color = seriesColor(theme.palette.mode, 1);
  const truncate = (label: string) => (label.length > 16 ? `${label.slice(0, 15)}…` : label);
  const chartData = [...data].reverse().map((d) => ({ merchant: d.merchant, total: d.total }));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={chartData}
        theme={nivoTheme(theme)}
        keys={["total"]}
        indexBy="merchant"
        layout="horizontal"
        colors={[color]}
        margin={{ top: 8, right: 24, bottom: 32, left: 136 }}
        padding={0.3}
        borderRadius={6}
        enableGridY={false}
        valueFormat={(value) => formatMoney(value, filters.currency)}
        label={(bar) => formatMoneyCompact(Number(bar.value), filters.currency)}
        labelSkipWidth={44}
        labelTextColor={theme.palette.background.paper}
        axisBottom={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), filters.currency) }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: truncate }}
        motionConfig="gentle"
      />
    </Box>
  );
};
