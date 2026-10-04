import { ResponsiveBar, type BarDatum } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { formatMoney, formatMoneyCompact } from "../../format.js";
import { monthLabel } from "../../payslipConcepts.js";
import { cashFlowChartRows } from "../../cashFlow.js";
import { seriesColor } from "./palette.js";
import { nivoTheme } from "./nivoTheme.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { useChartLayout } from "./useChartLayout.js";
import { compactBarTooltip } from "./ChartTooltip.js";

const KEYS = ["Ingreso", "Egresos", "Margen"];
const DIMMED_ALPHA = 0.35;

export interface CashFlowColors {
  ingreso: string;
  egresos: string;
  positivo: string;
  negativo: string;
}

export interface CashFlowBar {
  id: string | number;
  value: number | null;
  data: BarDatum;
}

interface CashFlowChartProps {
  meses: CashFlowMonthDTO[];
  monthOnly?: boolean;
}

const MobileBarTooltip = compactBarTooltip({ showKey: true });

export const cashFlowBarColor = ({ ingreso, egresos, positivo, negativo }: CashFlowColors) => {
  const seriesColors: Record<string, string> = { Ingreso: ingreso, Egresos: egresos };
  return ({ id, value, data }: CashFlowBar): string => {
    const marginColor = (value ?? 0) < 0 ? negativo : positivo;
    const base = seriesColors[String(id)] ?? marginColor;
    return data.estado === "incompleto" ? alpha(base, DIMMED_ALPHA) : base;
  };
};

export const CashFlowChart = ({ meses, monthOnly = false }: CashFlowChartProps) => {
  const theme = useTheme();
  const { isMobile, seriesMargin, bottomTicks } = useChartLayout();

  if (meses.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = cashFlowChartRows(meses);
  const colors: CashFlowColors = {
    ingreso: seriesColor(theme.palette.mode, 0),
    egresos: seriesColor(theme.palette.mode, 3),
    positivo: theme.palette.success.main,
    negativo: theme.palette.error.main,
  };
  const legendItems: ChartLegendItem[] = [
    { id: "Ingreso", label: "Ingreso", color: colors.ingreso },
    { id: "Egresos", label: "Egresos", color: colors.egresos },
    { id: "Margen", label: "Margen", color: colors.positivo },
  ];
  const axisBottom = {
    tickSize: 0,
    tickPadding: 10,
    tickRotation: monthOnly ? 0 : -45,
    format: monthOnly ? (value: string | number) => monthLabel(String(value)) : undefined,
    tickValues: bottomTicks(rows.map((row) => String(row.month))),
  };

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsiveBar
          data={rows}
          theme={nivoTheme(theme)}
          keys={KEYS}
          indexBy="month"
          groupMode="grouped"
          colors={cashFlowBarColor(colors)}
          valueScale={{ type: "linear", min: "auto", max: "auto" }}
          margin={seriesMargin({ top: 16, right: 24, bottom: 64, left: 64 })}
          padding={0.3}
          innerPadding={2}
          borderRadius={4}
          enableLabel={false}
          enableGridX={false}
          valueFormat={(value) => formatMoney(value, "ARS")}
          axisBottom={axisBottom}
          axisLeft={{ tickSize: 0, tickPadding: 8, format: (value) => formatMoneyCompact(Number(value), "ARS") }}
          markers={[{
            axis: "y",
            value: 0,
            lineStyle: { stroke: theme.palette.text.secondary, strokeWidth: 1 },
          }]}
          {...(isMobile ? { tooltip: MobileBarTooltip } : {})}
          motionConfig="gentle"
        />
      </Box>
      <ChartLegend items={legendItems} />
    </>
  );
};
