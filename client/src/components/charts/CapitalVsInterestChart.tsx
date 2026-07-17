import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useCreditCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";

export const CapitalVsInterestChart = () => {
  const theme = useTheme();
  const { data } = useCreditCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = [...data]
    .sort((a, b) => a.cuotaNro - b.cuotaNro)
    .map((c) => ({ month: c.fechaDebito.slice(0, 7), capital: c.capital, interes: c.intereses }));
  const colors = [seriesColor(theme.palette.mode, 2), seriesColor(theme.palette.mode, 5)];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={["capital", "interes"]}
        indexBy="month"
        colors={colors}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        padding={0.35}
        borderRadius={4}
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
