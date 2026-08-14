import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import type { DolarReal } from "../../macroSignals.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

interface DolarRealChartProps {
  dolarReal: DolarReal;
}

export const DolarRealChart = ({ dolarReal }: DolarRealChartProps) => {
  const theme = useTheme();

  if (dolarReal.serie.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const points = dolarReal.serie.map((punto) => ({ x: punto.periodo, y: punto.indice }));
  const color = seriesColor(theme.palette.mode, 0);

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={[{ id: "Dólar real", data: points }]}
        theme={nivoTheme(theme)}
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 56 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: "auto", max: "auto" }}
        curve="monotoneX"
        lineWidth={3}
        pointSize={8}
        pointColor={theme.palette.background.paper}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea
        areaOpacity={1}
        defs={[linearGradientDef("dolarRealArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "dolarRealArea" }]}
        enableGridX={false}
        markers={[{
          axis: "y",
          value: 100,
          legend: "Promedio desde 2025",
          legendPosition: "top-left",
          lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1, strokeDasharray: "4 4" },
          textStyle: { fill: theme.palette.text.secondary, fontSize: 10 },
        }]}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8 }}
        yFormat={(value) => Number(value).toFixed(0)}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
