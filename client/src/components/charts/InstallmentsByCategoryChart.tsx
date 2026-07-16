import { useMemo } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useFutureInstallmentsDetail, type StatFilters } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { categoricalPalette } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

const MAX_CATEGORIES = 7;
const OTHER_LABEL = "Otras";

export const InstallmentsByCategoryChart = (filters: StatFilters) => {
  const theme = useTheme();
  const { data } = useFutureInstallmentsDetail(filters);

  const { rows, keys } = useMemo(() => {
    if (!data || data.length === 0) return { rows: [], keys: [] as string[] };
    const categoryTotals = new Map<string, number>();
    for (const month of data) {
      for (const item of month.items) {
        categoryTotals.set(item.category, (categoryTotals.get(item.category) ?? 0) + item.amount);
      }
    }
    const ranked = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);
    const top = ranked.slice(0, MAX_CATEGORIES);
    const topSet = new Set(top);
    const keys = ranked.length > MAX_CATEGORIES ? [...top, OTHER_LABEL] : top;
    const sorted = [...data].sort((a, b) => a.month.localeCompare(b.month));
    const rows = sorted.map((month) => {
      const row: Record<string, string | number> = { month: month.month };
      for (const key of keys) row[key] = 0;
      for (const item of month.items) {
        const key = topSet.has(item.category) ? item.category : OTHER_LABEL;
        row[key] = (row[key] as number) + item.amount;
      }
      return row;
    });
    return { rows, keys };
  }, [data]);

  if (rows.length === 0) return <Typography color="text.secondary">Sin cuotas pendientes</Typography>;

  const palette = categoricalPalette(theme.palette.mode);
  const colors = keys.map((key, index) => (key === OTHER_LABEL ? theme.palette.text.disabled : palette[index % palette.length]));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={keys}
        indexBy="month"
        colors={colors}
        margin={{ top: 8, right: 128, bottom: 56, left: 64 }}
        padding={0.3}
        borderRadius={3}
        enableLabel={false}
        enableGridX={false}
        valueFormat={(value) => formatMoney(value, filters.currency)}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), filters.currency) }}
        legends={[{
          dataFrom: "keys",
          anchor: "right",
          direction: "column",
          translateX: 120,
          itemWidth: 110,
          itemHeight: 20,
          itemsSpacing: 2,
          symbolShape: "circle",
          symbolSize: 10,
          itemTextColor: theme.palette.text.secondary,
        }]}
        motionConfig="gentle"
      />
    </Box>
  );
};
