import { ResponsiveBar } from "@nivo/bar";
import { Box, useTheme } from "@mui/material";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { buildCardCycleBarData, type CardCycleEntry } from "../../cardCycle.js";
import { LegendSwatch } from "./ChartLegend.js";
import { useChartLayout } from "./useChartLayout.js";

const MOBILE_VALUE_TICKS = 4;

interface CardCycleChartProps {
  cards: CardCycleEntry[];
}

export const CardCycleChart = ({ cards }: CardCycleChartProps) => {
  const theme = useTheme();
  const { isMobile } = useChartLayout();
  if (cards.length === 0) return null;

  const { keys, row } = buildCardCycleBarData(cards);
  const colors = keys.map((_, index) => seriesColor(theme.palette.mode, index));
  const chartTheme = nivoTheme(theme);

  return (
    <Box sx={{ height: 120 }}>
      <ResponsiveBar
        data={[row]}
        theme={chartTheme}
        keys={keys}
        indexBy="label"
        layout="horizontal"
        colors={colors}
        margin={{ top: 8, right: 16, bottom: 40, left: 16 }}
        padding={0.3}
        enableLabel={false}
        enableGridY={false}
        axisLeft={null}
        axisBottom={{
          tickSize: 0,
          tickPadding: 8,
          format: (value) => formatMoneyCompact(Number(value), "ARS"),
          tickValues: isMobile ? MOBILE_VALUE_TICKS : undefined,
        }}
        tooltip={({ id, color, value }) => (
          <div style={{ ...chartTheme.tooltip?.container, display: "flex", alignItems: "center", gap: 8 }}>
            <LegendSwatch color={color} />
            <span>
              {id}: <strong>{formatMoney(Number(value), "ARS")}</strong>
            </span>
          </div>
        )}
        motionConfig="gentle"
      />
    </Box>
  );
};
