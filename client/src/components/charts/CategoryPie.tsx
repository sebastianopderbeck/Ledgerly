import { ResponsivePie } from "@nivo/pie";
import { Box, Typography, useTheme } from "@mui/material";
import type { CategoryStat, Currency } from "@ledgerly/shared";
import { formatMoney } from "../../format.js";
import { categoricalPalette } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { useChartLayout } from "./useChartLayout.js";

const DESKTOP_MARGIN = { top: 16, right: 150, bottom: 16, left: 16 };
const MOBILE_MARGIN = { top: 16, right: 16, bottom: 16, left: 16 };

interface CategoryPieProps {
  data: CategoryStat[] | undefined;
  currency: Currency;
}

export const CategoryPie = ({ data, currency }: CategoryPieProps) => {
  const theme = useTheme();
  const { isMobile } = useChartLayout();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const palette = categoricalPalette(theme.palette.mode);
  const chartData = data.map((d) => ({ id: d.category, label: d.category, value: d.total }));
  const legendItems: ChartLegendItem[] = chartData.map((slice, index) => ({
    id: slice.id,
    label: slice.label,
    color: palette[index % palette.length],
    value: formatMoney(slice.value, currency),
  }));

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsivePie
          data={chartData}
          theme={nivoTheme(theme)}
          colors={palette}
          margin={isMobile ? MOBILE_MARGIN : DESKTOP_MARGIN}
          innerRadius={0.6}
          padAngle={1.2}
          cornerRadius={4}
          activeOuterRadiusOffset={8}
          borderWidth={1}
          borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
          valueFormat={(value) => formatMoney(value, currency)}
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
