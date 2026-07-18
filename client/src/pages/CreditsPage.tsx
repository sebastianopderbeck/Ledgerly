import { CircularProgress, Typography } from "@mui/material";
import { useCreditCoupons } from "../api/hooks.js";
import { CreditKpiCards } from "../components/CreditKpiCards.js";
import { MortgageCouponsTable } from "../components/MortgageCouponsTable.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { CapitalVsInterestChart } from "../components/charts/CapitalVsInterestChart.js";
import { TotalPaidByMonthChart } from "../components/charts/TotalPaidByMonthChart.js";
import { UvaEvolutionChart } from "../components/charts/UvaEvolutionChart.js";
import { AmortizationDonutChart } from "../components/charts/AmortizationDonutChart.js";
import { CouponUsdChart } from "../components/charts/CouponUsdChart.js";

export const CreditsPage = () => {
  const { data, isLoading } = useCreditCoupons();
  const coupons = data ?? [];

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Créditos</Typography>

      {isLoading && <CircularProgress />}
      {!isLoading && coupons.length === 0 && (
        <Typography color="text.secondary">
          Todavía no importaste cupones del crédito. Subilos desde la página Importar.
        </Typography>
      )}

      {!isLoading && coupons.length > 0 && (
        <>
          <CreditKpiCards />
          <MotionBox
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
          >
            <ChartCard title="Capital vs Interés por mes"><CapitalVsInterestChart /></ChartCard>
            <ChartCard title="Total pagado por mes"><TotalPaidByMonthChart /></ChartCard>
            <ChartCard title="Evolución de la UVA"><UvaEvolutionChart /></ChartCard>
            <ChartCard title="Amortizado vs pendiente"><AmortizationDonutChart /></ChartCard>
            <ChartCard title="Valor de la cuota en USD"><CouponUsdChart /></ChartCard>
          </MotionBox>

          <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
          <MortgageCouponsTable />
        </>
      )}
    </>
  );
};
