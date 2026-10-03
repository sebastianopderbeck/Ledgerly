import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoCouponsInYears } from "../../filters/useInYears.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { byCuotaNro } from "../../autoConcepts.js";
import { useChartLayout } from "./useChartLayout.js";

export const AutoTotalPaidByMonthChart = () => {
  const theme = useTheme();
  const { seriesMargin, bottomTicks } = useChartLayout();
  const { data } = useAutoCouponsInYears();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = [...data]
    .sort(byCuotaNro)
    .map((c) => ({ month: c.fechaVencimiento.slice(0, 7), total: c.totalAPagar }));
  const color = seriesColor(theme.palette.mode, 6);

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={["total"]}
        indexBy="month"
        colors={[color]}
        margin={seriesMargin({ top: 16, right: 24, bottom: 64, left: 64 })}
        padding={0.35}
        borderRadius={6}
        enableLabel={false}
        enableGridX={false}
        valueFormat={(value) => formatMoney(value, "ARS")}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(rows.map((row) => row.month)) }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        motionConfig="gentle"
      />
    </Box>
  );
};
