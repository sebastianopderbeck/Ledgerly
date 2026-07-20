import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { byCuotaNro, uniqueConceptLabels } from "../../autoConcepts.js";

export const AutoCompositionChart = () => {
  const theme = useTheme();
  const { data } = useAutoCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = [...data].sort(byCuotaNro);
  const labels = uniqueConceptLabels(rows);
  const chartData = rows.map((c) => {
    const row: Record<string, number | string> = { month: c.fechaVencimiento.slice(0, 7) };
    for (const label of labels) row[label] = c.conceptos.find((x) => x.label === label)?.amount ?? 0;
    return row;
  });
  const colors = labels.map((_, index) => seriesColor(theme.palette.mode, index));

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={chartData}
        theme={nivoTheme(theme)}
        keys={labels}
        indexBy="month"
        colors={colors}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        padding={0.35}
        enableLabel={false}
        enableGridX={false}
        valueFormat={(value) => formatMoney(value, "ARS")}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        motionConfig="gentle"
      />
    </Box>
  );
};
