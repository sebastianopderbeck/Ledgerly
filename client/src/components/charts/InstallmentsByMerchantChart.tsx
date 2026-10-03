import { useMemo } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useFutureInstallmentsDetail, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { truncateLabel, useChartLayout } from "./useChartLayout.js";

const TOP_LIMIT = 8;
const DESKTOP_MARGIN = { top: 8, right: 24, bottom: 32, left: 136 };
const MOBILE_MARGIN = { top: 8, right: 24, bottom: 8, left: 96 };
const DESKTOP_LABEL_MAX = 16;
const MOBILE_LABEL_MAX = 11;

export const InstallmentsByMerchantChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { isMobile } = useChartLayout();
  const { data } = useFutureInstallmentsDetail(filters);

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
  const labelMax = isMobile ? MOBILE_LABEL_MAX : DESKTOP_LABEL_MAX;

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={chartData}
        theme={nivoTheme(theme)}
        keys={["total"]}
        indexBy="merchant"
        layout="horizontal"
        colors={[color]}
        margin={isMobile ? MOBILE_MARGIN : DESKTOP_MARGIN}
        padding={0.3}
        borderRadius={6}
        enableGridY={false}
        valueFormat={(value) => formatMoney(value, filters.currency)}
        label={(bar) => formatMoneyCompact(Number(bar.value), filters.currency)}
        labelSkipWidth={44}
        labelTextColor={theme.palette.background.paper}
        axisBottom={isMobile ? null : { tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), filters.currency) }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => truncateLabel(String(value), labelMax) }}
        motionConfig="gentle"
      />
    </Box>
  );
};
