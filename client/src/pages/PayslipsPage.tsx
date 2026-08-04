import { CircularProgress, Typography } from "@mui/material";
import { usePayslips } from "../api/hooks.js";
import { PayslipKpiCards } from "../components/PayslipKpiCards.js";
import { PayslipsTable } from "../components/PayslipsTable.js";
import { MotionBox } from "../components/motion/motion.js";
import { staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { PayslipNetoUsdChart } from "../components/charts/PayslipNetoUsdChart.js";
import { PayslipCompositionChart } from "../components/charts/PayslipCompositionChart.js";
import { PayslipGrossNetChart } from "../components/charts/PayslipGrossNetChart.js";

export const PayslipsPage = () => {
  const { data, isLoading } = usePayslips();
  const payslips = data ?? [];

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Sueldo</Typography>

      {isLoading && <CircularProgress />}
      {!isLoading && payslips.length === 0 && (
        <Typography color="text.secondary">
          Todavía no importaste recibos de sueldo. Subilos desde la página Importar.
        </Typography>
      )}

      {!isLoading && payslips.length > 0 && (
        <>
          <PayslipKpiCards />
          <MotionBox
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
          >
            <ChartCard title="Evolución del neto en USD"><PayslipNetoUsdChart /></ChartCard>
            <ChartCard title="Bruto vs neto por mes"><PayslipGrossNetChart /></ChartCard>
            <ChartCard title="Composición del recibo por mes"><PayslipCompositionChart /></ChartCard>
          </MotionBox>

          <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
          <PayslipsTable />
        </>
      )}
    </>
  );
};
