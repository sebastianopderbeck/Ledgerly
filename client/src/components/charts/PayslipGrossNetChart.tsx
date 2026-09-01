import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import type { PayslipDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { byPeriodoAsc, monthLabel } from "../../payslipConcepts.js";

const KEYS = ["Bruto", "Neto"];

interface PayslipGrossNetChartProps {
  payslips: PayslipDTO[];
  monthOnly?: boolean;
}

export const PayslipGrossNetChart = ({ payslips, monthOnly = false }: PayslipGrossNetChartProps) => {
  const theme = useTheme();
  if (payslips.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = [...payslips]
    .sort(byPeriodoAsc)
    .map((p) => ({ month: p.periodo, Bruto: p.brutoTotal, Neto: p.neto }));
  const colors = [seriesColor(theme.palette.mode, 1), seriesColor(theme.palette.mode, 2)];

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveBar
        data={rows}
        theme={nivoTheme(theme)}
        keys={KEYS}
        indexBy="month"
        groupMode="grouped"
        colors={colors}
        margin={{ top: 16, right: 24, bottom: 76, left: 64 }}
        padding={0.3}
        innerPadding={2}
        borderRadius={4}
        enableLabel={false}
        enableGridX={false}
        valueFormat={(value) => formatMoney(value, "ARS")}
        axisBottom={{
          tickSize: 0,
          tickPadding: 10,
          tickRotation: monthOnly ? 0 : -45,
          format: monthOnly ? (value) => monthLabel(String(value)) : undefined,
        }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
        legends={[{
          dataFrom: "keys",
          anchor: "bottom",
          direction: "row",
          translateY: 68,
          itemWidth: 80,
          itemHeight: 16,
          symbolSize: 12,
          symbolShape: "circle",
        }]}
        motionConfig="gentle"
      />
    </Box>
  );
};
