import { useMemo, useState } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { useCreditSummary, useMacroSeries } from "../api/hooks.js";
import { buildMacroView, defaultAssumptions, raceSeries, type MacroAssumptions } from "../macroSignals.js";
import { VerdictCard } from "../components/VerdictCard.js";
import { MacroSignalCards } from "../components/MacroSignalCards.js";
import { MacroAssumptionsBar } from "../components/MacroAssumptionsBar.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { DolarRealChart } from "../components/charts/DolarRealChart.js";
import { MacroRaceChart } from "../components/charts/MacroRaceChart.js";
import { TasaRealChart } from "../components/charts/TasaRealChart.js";

const Title = () => <Typography variant="h4" sx={{ mb: 3 }}>Contexto</Typography>;

export const MacroPage = () => {
  const { data: series, isLoading } = useMacroSeries();
  const { data: credit } = useCreditSummary();
  const [override, setOverride] = useState<MacroAssumptions | null>(null);

  const assumptions = useMemo(
    () => override ?? (series ? defaultAssumptions(series) : null),
    [override, series],
  );

  const view = useMemo(
    () => (series && assumptions ? buildMacroView(series, credit, assumptions) : null),
    [series, credit, assumptions],
  );

  const race = useMemo(() => (series ? raceSeries(series) : []), [series]);

  if (isLoading) {
    return (
      <>
        <Title />
        <CircularProgress />
      </>
    );
  }

  if (!series || series.meses.length === 0 || !view || !assumptions) {
    return (
      <>
        <Title />
        <Typography color="text.secondary">
          Todavía no cargaste las series macro. Usá el botón de actualizar de la barra superior para traer dólar, UVA, tasa e inflación.
        </Typography>
      </>
    );
  }

  return (
    <>
      <Title />
      <VerdictCard verdict={view.verdict} />
      <MacroAssumptionsBar assumptions={assumptions} onChange={setOverride} />
      <MacroSignalCards signals={view.signals} />
      <MotionBox
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
      >
        <ChartCard title="Dólar real vs su promedio desde 2025"><DolarRealChart dolarReal={view.dolarReal} /></ChartCard>
        <ChartCard title="Carrera: UVA vs dólar vs inflación"><MacroRaceChart series={race} /></ChartCard>
        <ChartCard title="Tasa real en pesos, mes a mes"><TasaRealChart points={view.tasaReal} /></ChartCard>
      </MotionBox>
    </>
  );
};
