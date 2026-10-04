import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme, type PaletteMode } from "@mui/material";
import type { MerchantSaving } from "../../installmentSavings.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { truncateLabel, useChartLayout } from "./useChartLayout.js";
import { compactBarTooltip } from "./ChartTooltip.js";
import type { ChartLegendItem } from "./ChartLegend.js";

interface InstallmentSavingsByMerchantChartProps {
  merchants: MerchantSaving[];
}

const PAID_LABEL = "Pagadas";
const FUTURE_LABEL = "A vencer";
const DESKTOP_MARGIN = { top: 8, right: 24, bottom: 32, left: 136 };
const MOBILE_MARGIN = { top: 8, right: 24, bottom: 8, left: 96 };
const DESKTOP_LABEL_MAX = 16;
const MOBILE_LABEL_MAX = 11;
const MobileBarTooltip = compactBarTooltip({ showKey: true });

const money = (value: number): string => formatMoney(value, "ARS");

export const savingsLegendItems = (mode: PaletteMode): ChartLegendItem[] => [
  { id: "paid", label: PAID_LABEL, color: seriesColor(mode, 2) },
  { id: "future", label: FUTURE_LABEL, color: seriesColor(mode, 3) },
];

export const InstallmentSavingsByMerchantChart = ({ merchants }: InstallmentSavingsByMerchantChartProps) => {
  const theme = useTheme();
  const { isMobile } = useChartLayout();

  if (merchants.length === 0) return <Typography color="text.secondary">Sin ahorro para mostrar</Typography>;

  const series = savingsLegendItems(theme.palette.mode);
  const rows = [...merchants]
    .sort((a, b) => a.saving - b.saving)
    .map(({ merchant, paidSaving, futureSaving }) => ({ merchant, [PAID_LABEL]: paidSaving, [FUTURE_LABEL]: futureSaving }));
  const labelMax = isMobile ? MOBILE_LABEL_MAX : DESKTOP_LABEL_MAX;

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={series.map(({ label }) => label)}
        indexBy="merchant"
        layout="horizontal"
        colors={series.map(({ color }) => color)}
        margin={isMobile ? MOBILE_MARGIN : DESKTOP_MARGIN}
        padding={0.3}
        innerPadding={2}
        borderRadius={4}
        enableLabel={false}
        enableGridY={false}
        valueFormat={money}
        axisBottom={isMobile ? null : { tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => truncateLabel(String(value), labelMax) }}
        {...(isMobile ? { tooltip: MobileBarTooltip } : {})}
        motionConfig="gentle"
      />
    </Box>
  );
};
