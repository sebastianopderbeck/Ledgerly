import { ResponsiveBar } from "@nivo/bar";
import { Box, Typography, useTheme } from "@mui/material";
import {
  BUDGET_STATUSES, BUDGET_STATUS_COLOR, BUDGET_STATUS_LABEL, type BudgetMonthSummary, type BudgetStatus,
} from "../../budgets.js";
import { formatMonthLabel } from "../../format.js";
import { nivoTheme } from "./nivoTheme.js";
import { ChartLegend, type ChartLegendItem } from "./ChartLegend.js";
import { ChartTooltip, type ChartTooltipRow } from "./ChartTooltip.js";
import { useChartLayout } from "./useChartLayout.js";

type ListKey = `${BudgetStatus}Lista`;

export type ComplianceRow = Record<"month" | ListKey, string> & Record<BudgetStatus, number>;

interface BudgetComplianceChartProps {
  history: BudgetMonthSummary[];
}

interface BudgetComplianceTooltipProps {
  id: string | number;
  color: string;
  data: ComplianceRow;
}

const MAX_COUNT_STEPS = 5;

const LIST_KEY: Record<BudgetStatus, ListKey> = { ok: "okLista", cerca: "cercaLista", pasado: "pasadoLista" };

const isBudgetStatus = (value: string | number): value is BudgetStatus =>
  BUDGET_STATUSES.some((status) => status === value);

const complianceRow = ({ month, ok, cerca, pasado }: BudgetMonthSummary): ComplianceRow => ({
  month,
  ok: ok.length,
  cerca: cerca.length,
  pasado: pasado.length,
  okLista: ok.join(", "),
  cercaLista: cerca.join(", "),
  pasadoLista: pasado.join(", "),
});

export const countTicks = (max: number): number[] => {
  const step = Math.max(1, Math.ceil(max / MAX_COUNT_STEPS));
  return Array.from({ length: Math.floor(max / step) + 1 }, (_unused, index) => index * step);
};

export const BudgetComplianceTooltip = ({ id, color, data }: BudgetComplianceTooltipProps) => {
  if (!isBudgetStatus(id)) return null;
  const rows: ChartTooltipRow[] = [{ id, color, label: `${BUDGET_STATUS_LABEL[id]}:`, value: data[LIST_KEY[id]] }];
  return <ChartTooltip title={formatMonthLabel(data.month)} rows={rows} />;
};

export const BudgetComplianceChart = ({ history }: BudgetComplianceChartProps) => {
  const theme = useTheme();
  const { seriesMargin, bottomTicks } = useChartLayout();

  if (history.length === 0) return <Typography color="text.secondary">Sin datos</Typography>;

  const rows = history.map(complianceRow);
  const colors = BUDGET_STATUSES.map((status) => theme.palette[BUDGET_STATUS_COLOR[status]].main);
  const ticks = countTicks(Math.max(...rows.map((row) => row.ok + row.cerca + row.pasado)));
  const legendItems: ChartLegendItem[] = BUDGET_STATUSES.map((status, slot) => ({
    id: status,
    label: BUDGET_STATUS_LABEL[status],
    color: colors[slot],
  }));

  return (
    <>
      <Box sx={{ height: 260 }}>
        <ResponsiveBar
          data={rows}
          theme={nivoTheme(theme)}
          keys={BUDGET_STATUSES}
          indexBy="month"
          colors={colors}
          margin={seriesMargin({ top: 16, right: 24, bottom: 64, left: 40 })}
          padding={0.35}
          borderRadius={2}
          borderWidth={1}
          borderColor={theme.palette.background.paper}
          enableLabel={false}
          enableGridX={false}
          gridYValues={ticks}
          axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -45, tickValues: bottomTicks(rows.map((row) => row.month)) }}
          axisLeft={{ tickSize: 0, tickPadding: 8, tickValues: ticks }}
          tooltip={BudgetComplianceTooltip}
          motionConfig="gentle"
        />
      </Box>
      <ChartLegend items={legendItems} />
    </>
  );
};
