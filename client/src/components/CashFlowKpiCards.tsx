import { Box, Typography } from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import SavingsIcon from "@mui/icons-material/Savings";
import PercentIcon from "@mui/icons-material/Percent";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { formatMoney, formatMonthLabel, formatPercent } from "../format.js";
import { averageSavingsRate, lastClosedMonth, lastCompleteMonth, savingsAverageLabel } from "../cashFlow.js";
import { KpiGrid } from "./KpiGrid.js";
import { Kpi, type KpiColor } from "./Kpi.js";

interface CashFlowKpiCardsProps {
  meses: CashFlowMonthDTO[];
}

const money = (value: number): string => formatMoney(value, "ARS");

const faltantesDe = (mes: CashFlowMonthDTO): string => mes.faltantes.join(", ");

export const CashFlowKpiCards = ({ meses }: CashFlowKpiCardsProps) => {
  const completo = lastCompleteMonth(meses);
  const cerrado = lastClosedMonth(meses);

  if (!completo) {
    const pendiente = cerrado ? ` En ${formatMonthLabel(cerrado.mes)} falta: ${faltantesDe(cerrado)}.` : "";
    return (
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {`Todavía no hay un mes cerrado completo.${pendiente}`}
      </Typography>
    );
  }

  const posterior = cerrado && cerrado.mes !== completo.mes ? cerrado : null;
  const aviso = posterior ? `${formatMonthLabel(posterior.mes)} todavía está incompleto: falta ${faltantesDe(posterior)}.` : null;
  const margen = completo.margen ?? 0;
  const margenColor: KpiColor = margen >= 0 ? "success" : "error";
  const ingresoSub = completo.conSac ? "neto, con SAC" : "neto de recibos";
  const promedio = savingsAverageLabel(averageSavingsRate(meses));

  return (
    <>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {`Último mes completo: ${formatMonthLabel(completo.mes)}`}
      </Typography>
      {aviso && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {aviso}
        </Typography>
      )}
      <Box sx={{ mt: 1.5 }}>
        <KpiGrid>
          <Kpi label="Ingreso" value={completo.ingreso ?? 0} format={money} sub={ingresoSub} icon={<PaymentsIcon />} color="primary" />
          <Kpi label="Egresos conocidos" value={completo.egresos} format={money} sub="tarjetas, hipoteca y auto" icon={<ReceiptLongIcon />} color="warning" />
          <Kpi label="Margen libre" value={margen} format={money} sub="lo que quedó del mes" icon={<SavingsIcon />} color={margenColor} />
          <Kpi label="Tasa de ahorro" value={(completo.tasaAhorro ?? 0) * 100} format={formatPercent} sub={promedio} icon={<PercentIcon />} color="secondary" />
        </KpiGrid>
      </Box>
    </>
  );
};
