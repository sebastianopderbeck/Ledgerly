import { ResponsivePie } from "@nivo/pie";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoSummary } from "../../api/hooks.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const AutoProgressDonutChart = () => {
  const theme = useTheme();
  const { data } = useAutoSummary();
  if (!data) return <Typography color="text.secondary">Sin datos</Typography>;

  const restantes = Math.max(0, data.cuotasTotales - data.cuotasPagadas);
  const chartData = [
    { id: "Pagadas", label: "Pagadas", value: data.cuotasPagadas },
    { id: "Restantes", label: "Restantes", value: restantes },
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
        valueFormat={(value) => `${value} cuotas`}
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
