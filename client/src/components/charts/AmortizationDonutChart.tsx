import { ResponsivePie } from "@nivo/pie";
import { Box, Typography, useTheme } from "@mui/material";
import { useCreditSummary } from "../../api/hooks.js";
import { formatUva } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { useChartLayout } from "./useChartLayout.js";

const DESKTOP_MARGIN = { top: 16, right: 150, bottom: 16, left: 16 };
const MOBILE_MARGIN = { top: 16, right: 16, bottom: 16, left: 16 };

export const AmortizationDonutChart = () => {
  const theme = useTheme();
  const { isMobile } = useChartLayout();
  const { data } = useCreditSummary();
  if (!data) return <Typography color="text.secondary">Sin datos</Typography>;

  const chartData = [
    { id: "Amortizado", label: "Amortizado", value: data.capitalAmortizadoUva },
    { id: "Pendiente", label: "Pendiente", value: data.capitalPendienteUva },
  ];
  const colors = [seriesColor(theme.palette.mode, 2), theme.palette.text.disabled];
  const legendItems: ChartLegendItem[] = chartData.map((slice, index) => ({
    id: slice.id,
    label: slice.label,
    color: colors[index],
    value: formatUva(slice.value),
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
          valueFormat={(value) => formatUva(value)}
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
