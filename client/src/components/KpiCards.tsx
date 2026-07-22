import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import DescriptionIcon from "@mui/icons-material/Description";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import { useSummary, useOficialRate, type StatFilters } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { MotionBox } from "./motion/motion.js";
import { staggerContainer } from "./motion/variants.js";
import { Kpi } from "./Kpi.js";

export const KpiCards = (filters: StatFilters) => {
  const { data } = useSummary(filters);
  const { data: fx } = useOficialRate();
  if (!data) return null;

  const rate = fx?.rate ?? null;
  const totalGastadoSub = filters.currency === "ARS" && rate
    ? `≈ ${formatMoney(data.totalPurchases / rate, "USD")}`
    : undefined;
  const money = (value: number) => formatMoney(value, filters.currency);
  const integer = (value: number) => String(Math.round(value));

  return (
    <MotionBox
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}
    >
      <Kpi label="Total gastado" value={data.totalPurchases} format={money} sub={totalGastadoSub} icon={<PaymentsIcon />} color="primary" />
      <Kpi label="Movimientos" value={data.transactionCount} format={integer} icon={<ReceiptLongIcon />} color="secondary" />
      <Kpi label="Resúmenes" value={data.statementCount} format={integer} icon={<DescriptionIcon />} color="success" />
      <Kpi label="Deuda en cuotas" value={data.futureInstallmentTotal} format={money} icon={<CreditCardIcon />} color="warning" />
    </MotionBox>
  );
};
