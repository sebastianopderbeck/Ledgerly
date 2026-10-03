import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useFutureInstallmentsDetail, type StatFilters } from "../api/hooks.js";
import { FiltersBar, type FilterField } from "../components/FiltersBar.js";
import { yearsLabel } from "../filters/globalFilters.js";
import { useGlobalFilters } from "../filters/useGlobalFilters.js";
import { useInstallmentYearOptions } from "../filters/useYearOptions.js";
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
import { useIsMobile } from "../useIsMobile.js";

const INSTALLMENT_FIELDS: FilterField[] = ["year", "currency", "card"];

export const InstallmentsPage = () => {
  const isMobile = useIsMobile();
  const { years, currency, cardLabel } = useGlobalFilters();
  const yearOptions = useInstallmentYearOptions(currency, cardLabel);
  const filters: StatFilters = { currency, cardLabel, year: years };
  const { data, isLoading } = useFutureInstallmentsDetail(filters);
  const months = data ?? [];
  const totalFuturo = months.reduce((acc, m) => acc + m.total, 0);
  const totalCuotas = months.reduce((acc, m) => acc + m.count, 0);
  const plural = (n: number, singular: string) => `${n} ${singular}${n === 1 ? "" : "s"}`;
  const mesesLabel = months.length === 1 ? "1 mes" : `${months.length} meses`;
  const money = (value: number) => formatMoney(value, filters.currency);
  const emptyLabel = years ? `No hay cuotas que venzan en ${yearsLabel(years)}` : "Sin cuotas pendientes";

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Cuotas a vencer</Typography>
      <FiltersBar fields={INSTALLMENT_FIELDS} yearOptions={yearOptions} />

      {isLoading && <CircularProgress />}
      {!isLoading && months.length === 0 && <Typography color="text.secondary">{emptyLabel}</Typography>}

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
                    {m.items.map((item, index) => {
                      const chip = <Chip size="small" variant="outlined" label={`cuota ${item.installmentNumber}/${item.installmentTotal}`} />;
                      return (
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
                            {isMobile && <Box sx={{ mt: 0.5 }}>{chip}</Box>}
                          </Box>
                          <Stack direction="row" alignItems="center" gap={1.5} sx={{ flexShrink: 0 }}>
                            {!isMobile && chip}
                            <Typography sx={{ fontWeight: 600 }}>{formatMoney(item.amount, filters.currency)}</Typography>
                          </Stack>
                        </Stack>
                      );
                    })}
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
