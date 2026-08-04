import { ResponsiveLine } from "@nivo/line";
import { linearGradientDef } from "@nivo/core";
import { Box, Typography, useTheme } from "@mui/material";
import type { InflationRateDTO, PayslipDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { monthLabel } from "../../payslipConcepts.js";
import { deflateToLatest } from "../../realSalary.js";

interface PayslipRealArsChartProps {
  payslips: PayslipDTO[];
  inflation: InflationRateDTO[];
  monthOnly?: boolean;
}

export const PayslipRealArsChart = ({ payslips, inflation, monthOnly = false }: PayslipRealArsChartProps) => {
  const theme = useTheme();
  const real = deflateToLatest(payslips, inflation);

  if (real.length === 0) return <Typography color="text.secondary">Sin datos de inflación</Typography>;

  const points = real.map((p) => ({ x: p.periodo, y: p.netoReal }));
  const baseline = points[0].y;
  const color = seriesColor(theme.palette.mode, 4);
  const series = [{ id: "Sueldo real", data: points }];

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
        defs={[linearGradientDef("payslipRealArea", [
          { offset: 0, color: "inherit", opacity: 0.35 },
          { offset: 100, color: "inherit", opacity: 0 },
        ])]}
        fill={[{ match: "*", id: "payslipRealArea" }]}
        enableGridX={false}
        markers={[{
          axis: "y",
          value: baseline,
          legend: "Poder de compra inicial",
          legendPosition: "top-left",
          lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1, strokeDasharray: "4 4" },
          textStyle: { fill: theme.palette.text.secondary, fontSize: 10 },
        }]}
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickRotation: monthOnly ? 0 : -45,
          format: monthOnly ? (value) => monthLabel(String(value)) : undefined,
        }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        yFormat={(value) => formatMoney(Number(value), "ARS")}
        useMesh
        motionConfig="gentle"
      />
    </Box>
  );
};
