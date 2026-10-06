import { useMemo } from "react";
import { ResponsiveLine } from "@nivo/line";
import { Box, Typography, useTheme } from "@mui/material";
import type { Currency, NetWorthMonthDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { netWorthChartSeries, type NetWorthSerieId } from "../../netWorth.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { LineSliceTooltip } from "./ChartTooltip.js";
import { nivoTheme } from "./nivoTheme.js";
import { seriesColor } from "./palette.js";
import { useChartLayout } from "./useChartLayout.js";

interface NetWorthChartProps {
  months: NetWorthMonthDTO[];
  currency: Currency;
}

const SERIES_SLOTS: Record<NetWorthSerieId, number> = { Activos: 2, Pasivos: 5, "Patrimonio neto": 1 };

export const NetWorthChart = ({ months, currency }: NetWorthChartProps) => {
  const theme = useTheme();
  const { seriesMargin, bottomTicks } = useChartLayout();
  const series = useMemo(() => netWorthChartSeries(months, currency), [months, currency]);

  if (months.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const colors = series.map((serie) => seriesColor(theme.palette.mode, SERIES_SLOTS[serie.id]));
  const legendItems: ChartLegendItem[] = series.map((serie, position) => ({
    id: serie.id,
    label: serie.id,
    color: colors[position],
    value: formatMoney(serie.data[serie.data.length - 1].y, currency),
  }));
  const periodos = months.map((month) => month.periodo);
  const hasNegative = series.some((serie) => serie.data.some((point) => point.y < 0));
  const zeroLine = hasNegative
    ? [{
      axis: "y" as const,
      value: 0,
      lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1, strokeDasharray: "4 4" },
    }]
    : [];

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsiveLine
          data={series}
          theme={nivoTheme(theme)}
          colors={colors}
          margin={seriesMargin({ top: 16, right: 24, bottom: 56, left: 72 })}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: "auto", max: "auto" }}
          curve="monotoneX"
          lineWidth={2}
          pointSize={8}
          pointColor={theme.palette.background.paper}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          enableGridX={false}
          markers={zeroLine}
          axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(periodos) }}
          axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), currency) }}
          yFormat={(value) => formatMoney(Number(value), currency)}
          enableSlices="x"
          sliceTooltip={LineSliceTooltip}
          motionConfig="gentle"
        />
      </Box>
      <ChartLegend items={legendItems} />
    </>
  );
};
