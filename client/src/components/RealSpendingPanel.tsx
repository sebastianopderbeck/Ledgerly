import { Box, CircularProgress, Typography } from "@mui/material";
import type { StatFilters } from "../api/hooks.js";
import { formatMonthLabel } from "../format.js";
import type { RealSpendingScope } from "../realSpending.js";
import { useRealSpending } from "../useRealSpending.js";
import { RealSpendingStats } from "./RealSpendingStats.js";
import { RealSpendingChart } from "./charts/RealSpendingChart.js";

export type RealSpendingPanelProps = StatFilters;

const RealSpendingBody = ({ cardLabel, years, from, to }: RealSpendingScope) => {
  const { isLoading, isError, view } = useRealSpending({ cardLabel, years, from, to });

  if (isLoading) {
    return (
      <Box sx={{ height: 260, display: "grid", placeItems: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (isError) return <Typography color="text.secondary">No se pudo calcular el gasto real</Typography>;
  if (view.pesosDe === null) return <Typography color="text.secondary">Sin datos de inflación</Typography>;
  if (view.points.length === 0) {
    return <Typography color="text.secondary">Sin meses cerrados con IPC publicado en este período</Typography>;
  }

  const note = `En pesos de ${formatMonthLabel(view.pesosDe).toLowerCase()} (último IPC publicado). Incluye las cuotas que faltan facturar.`;

  return (
    <>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{note}</Typography>
      {view.summary && <RealSpendingStats summary={view.summary} />}
      <RealSpendingChart points={view.points} />
    </>
  );
};

export const RealSpendingPanel = ({ currency, cardLabel, year, from, to }: RealSpendingPanelProps) => {
  if (currency === "USD") {
    return <Typography color="text.secondary">El gasto real se calcula sobre los consumos en pesos.</Typography>;
  }
  return <RealSpendingBody cardLabel={cardLabel} years={year} from={from} to={to} />;
};
