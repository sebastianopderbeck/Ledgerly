import { useMemo, useState, type MouseEvent } from "react";
import { Box, CircularProgress, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { usePayslips } from "../api/hooks.js";
import { PayslipKpiCards } from "../components/PayslipKpiCards.js";
import { PayslipsTable } from "../components/PayslipsTable.js";
import { PayslipDescuentoKpis } from "../components/PayslipDescuentoKpis.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { PayslipNetoUsdChart } from "../components/charts/PayslipNetoUsdChart.js";
import { PayslipNetoArsChart } from "../components/charts/PayslipNetoArsChart.js";
import { PayslipCompositionChart } from "../components/charts/PayslipCompositionChart.js";
import { PayslipGrossNetChart } from "../components/charts/PayslipGrossNetChart.js";
import { payslipYears } from "../payslipConcepts.js";

const ALL = "Todos";
const CHART_EXCLUDED_PERIODS = ["2023-12"];

export const PayslipsPage = () => {
  const { data, isLoading } = usePayslips();
  const payslips = data ?? [];
  const years = useMemo(() => payslipYears(payslips), [payslips]);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const activeYear = selectedYear ?? years[years.length - 1] ?? ALL;
  const filtered = useMemo(() => {
    const base = payslips.filter((p) => !CHART_EXCLUDED_PERIODS.includes(p.periodo));
    return activeYear === ALL ? base : base.filter((p) => p.periodo.slice(0, 4) === activeYear);
  }, [payslips, activeYear]);
  const monthOnly = activeYear !== ALL;

  const handleYearChange = (_event: MouseEvent<HTMLElement>, value: string | null) => {
    if (value !== null) setSelectedYear(value);
  };

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

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Sueldo</Typography>

      <PayslipKpiCards />

      <ToggleButtonGroup
        size="small"
        exclusive
        value={activeYear}
        onChange={handleYearChange}
        aria-label="Filtrar gráficos por año"
        sx={{ mb: 2, flexWrap: "wrap" }}
      >
        {years.map((year) => (
          <ToggleButton key={year} value={year}>{year}</ToggleButton>
        ))}
        <ToggleButton key={ALL} value={ALL}>Todos</ToggleButton>
      </ToggleButtonGroup>

      <MotionBox
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
      >
        <ChartCard title="Evolución del neto en USD"><PayslipNetoUsdChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Evolución del neto en pesos"><PayslipNetoArsChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Bruto vs neto por mes"><PayslipGrossNetChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
        <ChartCard title="Composición del recibo por mes"><PayslipCompositionChart payslips={filtered} monthOnly={monthOnly} /></ChartCard>
      </MotionBox>

      <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
      <PayslipsTable />

      <Typography variant="h6" sx={{ mt: 4, mb: 1 }}>Descuentos acumulados</Typography>
      <PayslipDescuentoKpis payslips={payslips} />
    </>
  );
};
