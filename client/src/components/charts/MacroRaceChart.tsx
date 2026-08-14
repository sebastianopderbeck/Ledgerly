import { ResponsiveLine } from "@nivo/line";
import { Box, Typography, useTheme } from "@mui/material";
import type { RaceSerie } from "../../macroSignals.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

interface MacroRaceChartProps {
  series: RaceSerie[];
}

export const MacroRaceChart = ({ series }: MacroRaceChartProps) => {
  const theme = useTheme();

  if (series.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const colors = series.map((_serie, slot) => seriesColor(theme.palette.mode, slot));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme(theme)}
        colors={colors}
        margin={{ top: 16, right: 24, bottom: 84, left: 56 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: "auto", max: "auto" }}
        curve="monotoneX"
        lineWidth={3}
        pointSize={0}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8 }}
        yFormat={(value) => Number(value).toFixed(0)}
        legends={[{
          anchor: "bottom",
          direction: "row",
          translateY: 72,
          itemWidth: 110,
          itemHeight: 18,
          symbolSize: 10,
          symbolShape: "circle",
        }]}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
