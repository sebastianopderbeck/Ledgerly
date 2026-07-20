import { CircularProgress, Typography } from "@mui/material";
import { useAutoCoupons } from "../api/hooks.js";
import { AutoKpiCards } from "../components/AutoKpiCards.js";
import { AutoCouponsTable } from "../components/AutoCouponsTable.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { AutoCompositionChart } from "../components/charts/AutoCompositionChart.js";
import { AutoTotalPaidByMonthChart } from "../components/charts/AutoTotalPaidByMonthChart.js";
import { CarValueChart } from "../components/charts/CarValueChart.js";
import { AutoProgressDonutChart } from "../components/charts/AutoProgressDonutChart.js";
import { AutoCouponUsdChart } from "../components/charts/AutoCouponUsdChart.js";

export const AutoPage = () => {
  const { data, isLoading } = useAutoCoupons();
  const coupons = data ?? [];

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Auto</Typography>

      {isLoading && <CircularProgress />}
      {!isLoading && coupons.length === 0 && (
        <Typography color="text.secondary">
          Todavía no importaste cupones del plan de auto. Subilos desde la página Importar.
        </Typography>
      )}

      {!isLoading && coupons.length > 0 && (
        <>
          <AutoKpiCards />
          <MotionBox
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
          >
            <ChartCard title="Composición de la cuota por mes"><AutoCompositionChart /></ChartCard>
            <ChartCard title="Total pagado por mes"><AutoTotalPaidByMonthChart /></ChartCard>
            <ChartCard title="Evolución del valor del auto"><CarValueChart /></ChartCard>
            <ChartCard title="Avance del plan"><AutoProgressDonutChart /></ChartCard>
            <ChartCard title="Valor de la cuota en USD"><AutoCouponUsdChart /></ChartCard>
          </MotionBox>

          <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
          <AutoCouponsTable />
        </>
      )}
    </>
  );
};
