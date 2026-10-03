import { ResponsivePie } from "@nivo/pie";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoSummary } from "../../api/hooks.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { useChartLayout } from "./useChartLayout.js";

const DESKTOP_MARGIN = { top: 16, right: 150, bottom: 16, left: 16 };
const MOBILE_MARGIN = { top: 16, right: 16, bottom: 16, left: 16 };

export const AutoProgressDonutChart = () => {
  const theme = useTheme();
  const { isMobile } = useChartLayout();
  const { data } = useAutoSummary();
  if (!data) return <Typography color="text.secondary">Sin datos</Typography>;

  const restantes = Math.max(0, data.cuotasTotales - data.cuotasPagadas);
  const chartData = [
    { id: "Pagadas", label: "Pagadas", value: data.cuotasPagadas },
    { id: "Restantes", label: "Restantes", value: restantes },
  ];
  const colors = [seriesColor(theme.palette.mode, 2), theme.palette.text.disabled];
  const legendItems: ChartLegendItem[] = chartData.map((slice, index) => ({
    id: slice.id,
    label: slice.label,
    color: colors[index],
    value: `${slice.value} cuotas`,
  }));

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsivePie
          data={chartData}
          theme={nivoTheme(theme)}
          colors={colors}
          margin={isMobile ? MOBILE_MARGIN : DESKTOP_MARGIN}
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
          legends={isMobile ? [] : [{
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
      {isMobile && <ChartLegend items={legendItems} />}
    </>
  );
};
