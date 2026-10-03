import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useTopMerchants, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { truncateLabel, useChartLayout } from "./useChartLayout.js";

const DESKTOP_MARGIN = { top: 8, right: 24, bottom: 32, left: 136 };
const MOBILE_MARGIN = { top: 8, right: 24, bottom: 8, left: 96 };
const DESKTOP_LABEL_MAX = 16;
const MOBILE_LABEL_MAX = 11;

export const TopMerchantsChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { isMobile } = useChartLayout();
  const { data } = useTopMerchants({ ...filters, limit: 8 });
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const color = seriesColor(theme.palette.mode, 1);
  const labelMax = isMobile ? MOBILE_LABEL_MAX : DESKTOP_LABEL_MAX;
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
