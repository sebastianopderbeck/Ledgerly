import { ResponsiveLine } from "@nivo/line";
import { Box, useTheme } from "@mui/material";
import type { RealSpendingPoint } from "../../realSpending.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { useChartLayout } from "./useChartLayout.js";
import { mobileLineTouch } from "./ChartTooltip.js";

interface RealSpendingChartProps {
  points: RealSpendingPoint[];
}

const REAL_SLOT = 4;
const NOMINAL_SLOT = 0;

export const RealSpendingChart = ({ points }: RealSpendingChartProps) => {
  const theme = useTheme();
  const { isMobile, seriesMargin, bottomTicks } = useChartLayout();

  const realColor = seriesColor(theme.palette.mode, REAL_SLOT);
  const nominalColor = seriesColor(theme.palette.mode, NOMINAL_SLOT);
  const series = [
    { id: "Real", data: points.map(({ month, real }) => ({ x: month, y: real })) },
    { id: "Nominal", data: points.map(({ month, nominal }) => ({ x: month, y: nominal })) },
  ];
  const legendItems: ChartLegendItem[] = [
    { id: "Real", label: "Real", color: realColor },
    { id: "Nominal", label: "Nominal", color: nominalColor },
  ];
  const months = points.map(({ month }) => month);

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsiveLine
          data={series}
          theme={nivoTheme(theme)}
          colors={[realColor, nominalColor]}
          margin={seriesMargin({ top: 16, right: 24, bottom: isMobile ? 64 : 84, left: 64 })}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: 0, max: "auto" }}
          curve="monotoneX"
          lineWidth={3}
          pointSize={8}
          pointColor={theme.palette.background.paper}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          enableGridX={false}
          axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(months) }}
          axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
          yFormat={(value) => formatMoney(Number(value), "ARS")}
          legends={isMobile ? [] : [{
            anchor: "bottom",
            direction: "row",
            translateY: 72,
            itemWidth: 110,
            itemHeight: 18,
            symbolSize: 10,
            symbolShape: "circle",
          }]}
          {...mobileLineTouch}
          motionConfig="gentle"
        />
      </Box>
      {isMobile && <ChartLegend items={legendItems} />}
    </>
  );
};
