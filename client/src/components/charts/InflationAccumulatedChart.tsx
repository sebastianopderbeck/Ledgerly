import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import type { InflationRateDTO } from "@ledgerly/shared";
import { formatPercent } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { monthLabel } from "../../payslipConcepts.js";
import { accumulatedInflation } from "../../inflationStats.js";

interface InflationAccumulatedChartProps {
  inflation: InflationRateDTO[];
  year: string | null;
  years: string[];
  monthOnly?: boolean;
}

export const InflationAccumulatedChart = ({ inflation, year, years, monthOnly = false }: InflationAccumulatedChartProps) => {
  const theme = useTheme();
  const acc = accumulatedInflation(inflation, year, years);

  if (acc.length === 0) return <Typography color="text.secondary">Sin datos de inflación</Typography>;

  const points = acc.map((p) => ({ x: p.periodo, y: p.acumulado }));
  const color = seriesColor(theme.palette.mode, 6);
  const series = [{ id: "Inflación acumulada", data: points }];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme(theme)}
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: 0, max: "auto" }}
        curve="monotoneX"
        lineWidth={3}
        pointSize={8}
        pointColor={theme.palette.background.paper}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea
        areaOpacity={1}
        defs={[linearGradientDef("inflationAccArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "inflationAccArea" }]}
        enableGridX={false}
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickRotation: monthOnly ? 0 : -45,
          format: monthOnly ? (value) => monthLabel(String(value)) : undefined,
        }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatPercent(Number(value)) }}
        yFormat={(value) => formatPercent(Number(value))}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
