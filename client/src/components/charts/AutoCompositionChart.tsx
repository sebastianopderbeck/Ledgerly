import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { useAutoCoupons } from "../../api/hooks.js";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { buildCompositionData, rawKey } from "../../autoConcepts.js";

export const AutoCompositionChart = () => {
  const theme = useTheme();
  const { data } = useAutoCoupons();
  if (!data || data.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const { labels, rows } = buildCompositionData(data);
  const colors = labels.map((_, index) => seriesColor(theme.palette.mode, index));
  const chartTheme = nivoTheme(theme);

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={chartTheme}
        keys={labels}
        indexBy="month"
        colors={colors}
        margin={{ top: 16, right: 24, bottom: 64, left: 64 }}
        padding={0.35}
        enableLabel={false}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        tooltip={({ id, color, data: row }) => (
          <div style={{ ...chartTheme.tooltip?.container, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: color, display: "inline-block" }} />
            <span>
              {id}: <strong>{formatMoney(Number(row[rawKey(String(id))] ?? 0), "ARS")}</strong>
            </span>
          </div>
        )}
        motionConfig="gentle"
      />
    </Box>
  );
};
