import { Box, Chip, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import type { InflationAssumption } from "../inflationIndex.js";
import type { InstallmentSavingsSummary, MerchantSaving } from "../installmentSavings.js";
import { useInstallmentSavings, type InstallmentSavingsState } from "../useInstallmentSavings.js";
import { yearsLabel } from "../filters/globalFilters.js";
import { formatMoney, formatMonthLabel, formatPercent } from "../format.js";
import { Kpi } from "./Kpi.js";
import { KpiGrid } from "./KpiGrid.js";
import { ChartCard } from "./charts/ChartCard.js";
import { ChartLegend } from "./charts/ChartLegend.js";
import { InstallmentSavingsByMerchantChart, savingsLegendItems } from "./charts/InstallmentSavingsByMerchantChart.js";
import { MotionBox } from "./motion/motion.js";
import { staggerContainer } from "./motion/variants.js";

interface InstallmentSavingsSectionProps {
  cardLabel?: string;
  years?: string[];
}

interface SavingsBodyProps extends InstallmentSavingsState {
  emptyText: string;
}

interface SavingsContentProps {
  summary: InstallmentSavingsSummary;
  merchants: MerchantSaving[];
}

const TITLE_ID = "ahorro-cuotas-titulo";
const ERROR_TEXT = "No se pudo calcular el ahorro de las cuotas.";
const NO_INFLATION_TEXT =
  "Para estimar el ahorro hace falta la inflación. Usá el botón de actualizar de la barra superior para traerla.";

const money = (value: number): string => formatMoney(value, "ARS");

const plural = (count: number, singular: string): string => `${count} ${singular}${count === 1 ? "" : "s"}`;

const savingSub = (savingPercent: number): string =>
  savingPercent < 0
    ? `${formatPercent(-savingPercent)} más que de contado`
    : `${formatPercent(savingPercent)} menos que de contado`;

const paidSub = ({ paidCount, estimatedPaidCount }: InstallmentSavingsSummary): string => {
  if (paidCount === 0) return "Sin cuotas pagadas";
  const inflationSource = estimatedPaidCount > 0 ? `${estimatedPaidCount} con IPC estimado` : "con IPC publicado";
  return `${plural(paidCount, "cuota")} · ${inflationSource}`;
};

const futureSub = ({ futureCount, assumption }: InstallmentSavingsSummary): string =>
  futureCount === 0
    ? "Sin cuotas a vencer"
    : `${plural(futureCount, "cuota")} · supone ${formatPercent(assumption.variacionMensual)} mensual`;

const footnote = ({ periodo, variacionMensual }: InflationAssumption): string =>
  "Estimación: cada cuota se lleva a pesos del mes de la compra con el IPC y se compara con pagar todo de contado. " +
  "Supone que las cuotas son sin interés (precio de contado = suma de las cuotas) y que pagás cada resumen al vencimiento. " +
  `Para los meses sin IPC publicado (después de ${formatMonthLabel(periodo).toLowerCase()}) usa el último dato: ` +
  `${formatPercent(variacionMensual)} mensual.`;

const SavingsContent = ({ summary, merchants }: SavingsContentProps) => {
  const theme = useTheme();
  const legendItems = savingsLegendItems(theme.palette.mode);

  return (
    <>
      <KpiGrid cardCount={3}>
        <Kpi
          label="Ahorro real"
          value={summary.saving}
          format={money}
          sub={savingSub(summary.savingPercent)}
          icon={<SavingsOutlinedIcon />}
          color="primary"
        />
        <Kpi
          label="En cuotas pagadas"
          value={summary.paidSaving}
          format={money}
          sub={paidSub(summary)}
          icon={<TaskAltOutlinedIcon />}
          color="success"
        />
        <Kpi
          label="En cuotas a vencer"
          value={summary.futureSaving}
          format={money}
          sub={futureSub(summary)}
          icon={<EventOutlinedIcon />}
          color="warning"
          subMultiline
        />
      </KpiGrid>
      <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={{ mb: 2 }}>
        <ChartCard title="Ahorro real por comercio">
          <InstallmentSavingsByMerchantChart merchants={merchants} />
          <ChartLegend items={legendItems} />
        </ChartCard>
      </MotionBox>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {footnote(summary.assumption)}
      </Typography>
    </>
  );
};

const SavingsBody = ({ summary, merchants, isLoading, isError, emptyText }: SavingsBodyProps) => {
  if (isLoading) return <CircularProgress size={24} />;
  if (isError) return <Typography color="text.secondary">{ERROR_TEXT}</Typography>;
  if (summary === null) return <Typography color="text.secondary">{NO_INFLATION_TEXT}</Typography>;
  if (summary.purchases.length === 0) return <Typography color="text.secondary">{emptyText}</Typography>;
  return <SavingsContent summary={summary} merchants={merchants} />;
};

export const InstallmentSavingsSection = ({ cardLabel, years }: InstallmentSavingsSectionProps) => {
  const savings = useInstallmentSavings({ cardLabel, years });
  const subtitle = years ? `Compras en cuotas en pesos hechas en ${yearsLabel(years)}` : "Todas tus compras en cuotas en pesos";
  const emptyText = years ? `No hay compras en cuotas en pesos hechas en ${yearsLabel(years)}` : "No hay compras en cuotas en pesos";

  return (
    <Box component="section" aria-labelledby={TITLE_ID} sx={{ mb: 3 }}>
      <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 0.5 }}>
        <Typography variant="h5" component="h2" id={TITLE_ID}>Cuánto te ahorran las cuotas</Typography>
        <Chip size="small" variant="outlined" label="Estimación" />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{subtitle}</Typography>
      <SavingsBody {...savings} emptyText={emptyText} />
    </Box>
  );
};
