import { ResponsivePie } from "@nivo/pie";
import { Box, Typography, useTheme } from "@mui/material";
import { useCreditSummary } from "../../api/hooks.js";
import { formatUva } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const AmortizationDonutChart = () => {
  const theme = useTheme();
  const { data } = useCreditSummary();
  if (!data) return <Typography color="text.secondary">Sin datos</Typography>;

  const chartData = [
    { id: "Amortizado", label: "Amortizado", value: data.capitalAmortizadoUva },
    { id: "Pendiente", label: "Pendiente", value: data.capitalPendienteUva },
  ];
  const colors = [seriesColor(theme.palette.mode, 2), theme.palette.text.disabled];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsivePie
        data={chartData}
        theme={nivoTheme(theme)}
        colors={colors}
        margin={{ top: 16, right: 150, bottom: 16, left: 16 }}
        innerRadius={0.6}
        padAngle={1.2}
        cornerRadius={4}
        activeOuterRadiusOffset={8}
        borderWidth={1}
        borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        valueFormat={(value) => formatUva(value)}
        enableArcLabels={false}
        enableArcLinkLabels={false}
        motionConfig="gentle"
        legends={[{
          anchor: "right",
          direction: "column",
          translateX: 140,
          itemWidth: 132,
          itemHeight: 22,
          itemsSpacing: 2,
          symbolShape: "circle",
          symbolSize: 10,
          itemTextColor: theme.palette.text.secondary,
        }]}
      />
    </Box>
  );
};
