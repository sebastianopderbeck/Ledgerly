import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useSearchParams } from "react-router-dom";
import { useFutureInstallmentsDetail, type StatFilters } from "../api/hooks.js";
import { FiltersBar } from "../components/FiltersBar.js";
import { formatMoney, formatMonthLabel } from "../format.js";
import { MotionBox } from "../components/motion/motion.js";
import { fadeUpItem, staggerContainer } from "../components/motion/variants.js";
import { ChartCard } from "../components/charts/ChartCard.js";
import { FutureInstallmentsChart } from "../components/charts/FutureInstallmentsChart.js";
import { RemainingDebtChart } from "../components/charts/RemainingDebtChart.js";
import { InstallmentsByCategoryChart } from "../components/charts/InstallmentsByCategoryChart.js";
import { InstallmentsByMerchantChart } from "../components/charts/InstallmentsByMerchantChart.js";
import { PendingInstallmentsByCategoryChart } from "../components/charts/PendingInstallmentsByCategoryChart.js";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { Kpi } from "../components/Kpi.js";

export const InstallmentsPage = () => {
  const [params] = useSearchParams();
  const filters: StatFilters = {
    currency: params.get("currency") === "USD" ? "USD" : "ARS",
    cardLabel: params.get("cardLabel") ?? undefined,
  };
  const { data, isLoading } = useFutureInstallmentsDetail(filters);
  const months = data ?? [];
  const totalFuturo = months.reduce((acc, m) => acc + m.total, 0);
  const totalCuotas = months.reduce((acc, m) => acc + m.count, 0);
  const plural = (n: number, singular: string) => `${n} ${singular}${n === 1 ? "" : "s"}`;
  const mesesLabel = months.length === 1 ? "1 mes" : `${months.length} meses`;
  const money = (value: number) => formatMoney(value, filters.currency);

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Cuotas a vencer</Typography>
      <FiltersBar showMonth={false} />

      {isLoading && <CircularProgress />}
      {!isLoading && months.length === 0 && <Typography color="text.secondary">Sin cuotas pendientes</Typography>}

      {!isLoading && months.length > 0 && (
        <>
          <MotionBox variants={staggerContainer} initial="hidden" animate="visible" sx={{ mb: 3, maxWidth: { sm: 320 } }}>
            <Kpi label="Cuotas pendientes" value={totalFuturo} format={money} icon={<CreditCardIcon />} color="warning" />
          </MotionBox>
          <MotionBox
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 3 }}
          >
            <ChartCard title="Total por mes"><FutureInstallmentsChart {...filters} /></ChartCard>
            <ChartCard title="Deuda restante"><RemainingDebtChart {...filters} /></ChartCard>
            <ChartCard title="Por categoría"><InstallmentsByCategoryChart {...filters} /></ChartCard>
            <ChartCard title="Por comercio"><InstallmentsByMerchantChart {...filters} /></ChartCard>
            <ChartCard title="Cuotas pendientes por categoría"><PendingInstallmentsByCategoryChart {...filters} /></ChartCard>
          </MotionBox>

          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {plural(totalCuotas, "cuota")} por {formatMoney(totalFuturo, filters.currency)} en {mesesLabel}
          </Typography>
          <MotionBox variants={staggerContainer} initial="hidden" animate="visible">
            {months.map((m) => (
              <MotionBox key={m.month} variants={fadeUpItem} sx={{ mb: 1 }}>
                <Accordion disableGutters>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: "100%", pr: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{formatMonthLabel(m.month)}</Typography>
                      <Stack direction="row" alignItems="center" gap={2}>
                        <Typography variant="body2" color="text.secondary">{plural(m.count, "cuota")}</Typography>
                        <Typography sx={{ fontWeight: 700 }}>{formatMoney(m.total, filters.currency)}</Typography>
                      </Stack>
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    {m.items.map((item, index) => (
                      <Stack
                        key={`${item.merchant}-${item.purchaseDate}-${item.installmentNumber}`}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{ py: 1, borderTop: index === 0 ? "none" : "1px solid", borderColor: "divider", gap: 2 }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography noWrap>{item.merchant}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.category} · compra {item.purchaseDate}
                          </Typography>
                        </Box>
                        <Stack direction="row" alignItems="center" gap={1.5} sx={{ flexShrink: 0 }}>
                          <Chip size="small" variant="outlined" label={`cuota ${item.installmentNumber}/${item.installmentTotal}`} />
                          <Typography sx={{ fontWeight: 600 }}>{formatMoney(item.amount, filters.currency)}</Typography>
                        </Stack>
                      </Stack>
                    ))}
                  </AccordionDetails>
                </Accordion>
              </MotionBox>
            ))}
          </MotionBox>
        </>
      )}
    </>
  );
};
