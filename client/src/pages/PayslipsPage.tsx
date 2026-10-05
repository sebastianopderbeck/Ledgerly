import { useMemo } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { usePayslips, useInflation } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { PayslipKpiCards } from "../components/PayslipKpiCards.js";
import { PayslipCards } from "../components/PayslipCards.js";
import { PayslipsTable } from "../components/PayslipsTable.js";
import { PayslipDescuentoKpis } from "../components/PayslipDescuentoKpis.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { PayslipNetoUsdChart } from "../components/charts/PayslipNetoUsdChart.js";
import { PayslipNetoArsChart } from "../components/charts/PayslipNetoArsChart.js";
import { PayslipRealArsChart } from "../components/charts/PayslipRealArsChart.js";
import { InflationAccumulatedChart } from "../components/charts/InflationAccumulatedChart.js";
import { PayslipCompositionChart } from "../components/charts/PayslipCompositionChart.js";
import { PayslipGrossNetChart } from "../components/charts/PayslipGrossNetChart.js";
import { payslipYears } from "../payslipConcepts.js";
import { salaryRaises } from "../salaryRaises.js";
import { matchesYears } from "../filters/globalFilters.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useIsMobile } from "../useIsMobile.js";

const CHART_EXCLUDED_PERIODS = ["2023-12"];
const PAYSLIP_FIELDS: FilterField[] = ["year"];

export const PayslipsPage = () => {
  const { data, isLoading } = usePayslips();
  const { data: inflationData } = useInflation();
  const { yearSelection } = useGlobalFilters();
  const isMobile = useIsMobile();
  const inflation = useMemo(() => inflationData ?? [], [inflationData]);
  const payslips = useMemo(() => data ?? [], [data]);
  const raises = useMemo(() => salaryRaises(payslips, inflation), [payslips, inflation]);
  const years = useMemo(() => payslipYears(payslips), [payslips]);
  const inYears = useMemo(
    () => payslips.filter((payslip) => matchesYears(payslip.periodo, yearSelection)),
    [payslips, yearSelection],
  );
  const filtered = useMemo(
    () => inYears.filter((payslip) => payslip.tipo === "mensual" && !CHART_EXCLUDED_PERIODS.includes(payslip.periodo)),
    [inYears],
  );
  const scopeYears = yearSelection.kind === "all" ? years : yearSelection.years;
  const monthOnly = yearSelection.kind === "years" && yearSelection.years.length === 1;

  if (isLoading) {
    return (
      <>
        <Typography variant="h4" sx={{ mb: 3 }}>Sueldo</Typography>
        <CircularProgress />
      </>
    );
  }

  if (payslips.length === 0) {
    return (
      <>
        <Typography variant="h4" sx={{ mb: 3 }}>Sueldo</Typography>
        <Typography color="text.secondary">
          Todavía no importaste recibos de sueldo. Subilos desde la página Importar.
        </Typography>
      </>
    );
  }

  const payslipDetail = isMobile
    ? <PayslipCards payslips={inYears} raises={raises} />
    : <PayslipsTable payslips={inYears} raises={raises} />;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Sueldo</Typography>
      <FiltersBar fields={PAYSLIP_FIELDS} yearOptions={years} />

      <PayslipKpiCards />

      <MotionBox
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
      >
        <ChartCard title="Evolución del neto en USD"><PayslipNetoUsdChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Evolución del neto en pesos"><PayslipNetoArsChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Sueldo real (pesos de hoy)"><PayslipRealArsChart payslips={filtered} inflation={inflation} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Inflación acumulada"><InflationAccumulatedChart inflation={inflation} years={scopeYears} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Bruto vs neto por mes"><PayslipGrossNetChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Composición del recibo por mes"><PayslipCompositionChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
      </MotionBox>

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Descuentos acumulados</Typography>
      <PayslipDescuentoKpis payslips={payslips} />

      {inYears.length > 0 && <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>}
      {payslipDetail}
    </>
  );
};
