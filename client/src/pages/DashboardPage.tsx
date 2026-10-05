import { Typography } from "@mui/material";
import { type StatFilters } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useTransactionYearOptions } from "../filters/useYearOptions.js";
import { KpiCards } from "../components/KpiCards.js";
import { CardCycleSummary } from "../components/CardCycleSummary.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { CategoryBreakdownChart } from "../components/charts/CategoryBreakdownChart.js";
import { LastStatementCategoryChart } from "../components/charts/LastStatementCategoryChart.js";
import { MonthlyTrendChart } from "../components/charts/MonthlyTrendChart.js";
import { FutureInstallmentsChart } from "../components/charts/FutureInstallmentsChart.js";
import { TopMerchantsChart } from "../components/charts/TopMerchantsChart.js";
import { MonthlyUsdChart } from "../components/charts/MonthlyUsdChart.js";
import { RealSpendingPanel } from "../components/RealSpendingPanel.js";

const DASHBOARD_FIELDS: FilterField[] = ["year", "currency", "card", "month"];

export const DashboardPage = () => {
  const { years, currency, cardLabel, from, to } = useGlobalFilters();
  const yearOptions = useTransactionYearOptions(currency, cardLabel);
  const filters: StatFilters = { currency, cardLabel, from, to, year: years };

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard</Typography>
      <FiltersBar fields={DASHBOARD_FIELDS} yearOptions={yearOptions} />
      <CardCycleSummary />
      <KpiCards {...filters} />
      <MotionBox
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}
      >
        <ChartCard title="Gasto por categoría"><CategoryBreakdownChart {...filters} /></ChartCard>
        <ChartCard title="Gasto por categoría (último resumen)"><LastStatementCategoryChart {...filters} /></ChartCard>
        <ChartCard title="Evolución mensual"><MonthlyTrendChart {...filters} /></ChartCard>
        <ChartCard title="Gasto real (pesos de hoy)"><RealSpendingPanel {...filters} /></ChartCard>
        <ChartCard title="Cuotas a vencer"><FutureInstallmentsChart {...filters} /></ChartCard>
        <ChartCard title="Top comercios"><TopMerchantsChart {...filters} /></ChartCard>
        <ChartCard title="A pagar por mes en USD (al oficial)"><MonthlyUsdChart {...filters} /></ChartCard>
      </MotionBox>
    </>
  );
};
