import { Box, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { type StatFilters } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
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

const DASHBOARD_FIELDS: FilterField[] = ["year", "currency", "card", "month"];

export const DashboardPage = () => {
  const [params] = useSearchParams();
  const filters: StatFilters = {
    currency: (params.get("currency") as "ARS" | "USD") ?? "ARS",
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    cardLabel: params.get("cardLabel") ?? undefined,
  };
  const yearOptions = useTransactionYearOptions(filters.currency, filters.cardLabel);

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard</Typography>
      <CardCycleSummary />
      <FiltersBar fields={DASHBOARD_FIELDS} yearOptions={yearOptions} />
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
        <ChartCard title="Cuotas a vencer"><FutureInstallmentsChart {...filters} /></ChartCard>
        <ChartCard title="Top comercios"><TopMerchantsChart {...filters} /></ChartCard>
        <ChartCard title="A pagar por mes en USD (al oficial)"><MonthlyUsdChart {...filters} /></ChartCard>
      </MotionBox>
    </>
  );
};
