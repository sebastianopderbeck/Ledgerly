import { CircularProgress, Typography } from "@mui/material";
import { useAutoCoupons } from "../api/hooks.js";
import { AutoKpiCards } from "../components/AutoKpiCards.js";
import { AutoCouponsTable } from "../components/AutoCouponsTable.js";

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
          <Typography variant="h6" sx={{ mb: 1 }}>Detalle mes a mes</Typography>
          <AutoCouponsTable />
        </>
      )}
    </>
  );
};
