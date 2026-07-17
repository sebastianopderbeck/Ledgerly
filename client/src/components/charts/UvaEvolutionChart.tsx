import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import { useCreditCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const UvaEvolutionChart = () => {
  const theme = useTheme();
  const { data } = useCreditCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const points = [...data]
    .sort((a, b) => a.cuotaNro - b.cuotaNro)
    .map((c) => ({ x: c.fechaDebito.slice(0, 7), y: c.cotizacionUva }));
  const color = seriesColor(theme.palette.mode, 4);
  const series = [{ id: "Cotización UVA", data: points }];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveLine
        data={series}
        theme={nivoTheme(theme)}
        colors={[color]}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
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
        defs={[linearGradientDef("uvaArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "uvaArea" }]}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        yFormat={(value) => formatMoney(Number(value), "ARS")}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
