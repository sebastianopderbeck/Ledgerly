import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import type { TasaRealPoint } from "../../macroSignals.js";
import { formatPercent } from "../../format.js";
import { nivoTheme } from "./nivoTheme.js";

interface TasaRealChartProps {
  points: TasaRealPoint[];
}

export const TasaRealChart = ({ points }: TasaRealChartProps) => {
  const theme = useTheme();

  if (points.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = points.map((punto) => ({ month: punto.periodo, tasaReal: punto.tasaReal }));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={["tasaReal"]}
        indexBy="month"
        colors={({ data }) => (data.tasaReal >= 0 ? theme.palette.success.main : theme.palette.error.main)}
        valueScale={{ type: "linear", min: "auto", max: "auto" }}
        margin={{ top: 16, right: 24, bottom: 64, left: 56 }}
        padding={0.35}
        borderRadius={4}
        enableLabel={false}
        enableGridX={false}
        valueFormat={(value) => formatPercent(value)}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatPercent(Number(value)) }}
        markers={[{
          axis: "y",
          value: 0,
          lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1 },
        }]}
        motionConfig="gentle"
      />
    </Box>
  );
};
