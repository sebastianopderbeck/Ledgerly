import { Box, Typography } from "@mui/material";
import type { CashFlowMonthDTO } from "@ledgerly/shared";
import { formatMoneyOrDash, formatMonthLabel } from "../format.js";
import { formatSavingsRate, isNegative, monthNotes } from "../cashFlow.js";
import { CashFlowStatusChip } from "./CashFlowStatusChip.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";

interface CashFlowCardsProps {
  meses: CashFlowMonthDTO[];
}

interface MarginValueProps {
  margen: number | null;
}

const money = (value: number | null): string => formatMoneyOrDash(value, "ARS");

const MarginValue = ({ margen }: MarginValueProps) => {
  const color = isNegative(margen) ? "error.main" : "inherit";
  return <Typography component="span" variant="inherit" sx={{ color }}>{money(margen)}</Typography>;
};

const ingresoText = ({ ingreso, conSac }: CashFlowMonthDTO): string =>
  conSac ? `${money(ingreso)} · con SAC` : money(ingreso);

const highlightsOf = (mes: CashFlowMonthDTO): RecordField[] => [
  { label: "Margen", value: <MarginValue margen={mes.margen} /> },
  { label: "Ahorro", value: formatSavingsRate(mes.tasaAhorro) },
];

const detailsOf = (mes: CashFlowMonthDTO): RecordField[] => [
  { label: "Ingreso", value: ingresoText(mes) },
  { label: "Tarjetas", value: money(mes.tarjetas) },
  { label: "Hipoteca", value: money(mes.hipoteca) },
  { label: "Auto", value: money(mes.auto) },
  { label: "Egresos", value: money(mes.egresos) },
  ...monthNotes(mes).map(({ label, text }) => ({ label, value: text })),
];

export const CashFlowCards = ({ meses }: CashFlowCardsProps) => {
  if (meses.length === 0) return null;

  const cards = meses.map((mes) => (
    <RecordCard
      key={mes.mes}
      title={formatMonthLabel(mes.mes)}
      badge={<CashFlowStatusChip estado={mes.estado} />}
      highlights={highlightsOf(mes)}
      details={detailsOf(mes)}
    />
  ));

  return <Box sx={recordListSx}>{cards}</Box>;
};
