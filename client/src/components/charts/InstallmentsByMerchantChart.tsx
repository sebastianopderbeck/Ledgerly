import { useMemo } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useFutureInstallmentsDetail, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

const TOP_LIMIT = 8;

export const InstallmentsByMerchantChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useFutureInstallmentsDetail(filters);
  const truncate = (label: string) => (label.length > 16 ? `${label.slice(0, 15)}…` : label);

  const chartData = useMemo(() => {
    if (!data) return [];
    const merchantTotals = new Map<string, number>();
    for (const month of data) {
      for (const item of month.items) {
        merchantTotals.set(item.merchant, (merchantTotals.get(item.merchant) ?? 0) + item.amount);
      }
    }
    return [...merchantTotals.entries()]
      .map(([merchant, total]) => ({ merchant, total }))
      .sort((a, b) => a.total - b.total)
      .slice(-TOP_LIMIT);
  }, [data]);

  if (chartData.length === 0) return <Typography color="text.secondary">Sin cuotas pendientes</Typography>;

  const color = seriesColor(theme.palette.mode, 1);

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
