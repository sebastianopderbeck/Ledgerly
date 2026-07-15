import { ResponsivePie } from "@nivo/pie";
import { Box, Typography, useTheme } from "@mui/material";
import { useByCategory, type StatFilters } from "../../api/hooks.js";
import { formatMoney } from "../../format.js";
import { categoricalPalette } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const CategoryBreakdownChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useByCategory(filters);
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const chartData = data.map((d) => ({ id: d.category, label: d.category, value: d.total }));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsivePie
        data={chartData}
        theme={nivoTheme(theme)}
        colors={categoricalPalette(theme.palette.mode)}
        margin={{ top: 16, right: 150, bottom: 16, left: 16 }}
        innerRadius={0.6}
        padAngle={1.2}
        cornerRadius={4}
        activeOuterRadiusOffset={8}
        borderWidth={1}
        borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        valueFormat={(value) => formatMoney(value, filters.currency)}
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
