import { useCallback } from "react";
import { Box, Chip } from "@mui/material";
import type { PayslipDTO } from "@ledgerly/shared";
import { usePatchPayslipRate } from "../api/hooks.js";
import { formatMoney, formatMoneyOrDash } from "../format.js";
import { byPeriodo, uniqueConceptLabels } from "../payslipConcepts.js";
import { RateSheet, RateValue } from "./RateSheet.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { useSheetTarget } from "./useSheetTarget.js";

interface PayslipCardsProps {
  payslips: PayslipDTO[];
}

const sacBadge = <Chip label="SAC" size="small" color="secondary" variant="outlined" />;

const montoOf = (payslip: PayslipDTO, label: string): number | null =>
  payslip.conceptos.find((concepto) => concepto.label === label)?.monto ?? null;

const highlightsOf = (payslip: PayslipDTO): RecordField[] => [
  { label: "Neto", value: formatMoney(payslip.neto, "ARS") },
  { label: "Neto USD", value: formatMoneyOrDash(payslip.netoUsd, "USD") },
];

const detailsOf = (payslip: PayslipDTO, conceptLabels: string[], onEditRate: () => void): RecordField[] => [
  { label: "Bruto", value: formatMoney(payslip.brutoTotal, "ARS") },
  ...conceptLabels.map((label) => ({ label, value: formatMoneyOrDash(montoOf(payslip, label), "ARS") })),
  { label: "Descuentos", value: formatMoney(payslip.descuentos, "ARS") },
  {
    label: "TC oficial",
    value: <RateValue rate={payslip.tipoCambioUsd} editLabel={`editar TC recibo ${payslip.periodo}`} onEdit={onEditRate} />,
  },
];

export const PayslipCards = ({ payslips }: PayslipCardsProps) => {
  const { mutate: patchRate } = usePatchPayslipRate();
  const { target, open, show, close } = useSheetTarget<PayslipDTO>();

  const saveRate = useCallback((rate: number) => {
    if (target) patchRate({ id: target.id, tipoCambioUsd: rate });
  }, [patchRate, target]);

  if (payslips.length === 0) return null;

  const sorted = [...payslips].sort(byPeriodo);
  const conceptLabels = uniqueConceptLabels(sorted);
  const cards = sorted.map((payslip) => (
    <RecordCard
      key={payslip.id}
      title={payslip.periodo}
      badge={payslip.tipo === "sac" ? sacBadge : undefined}
      highlights={highlightsOf(payslip)}
      details={detailsOf(payslip, conceptLabels, () => show(payslip))}
    />
  ));
  const sheetTitle = target ? `TC recibo ${target.periodo}` : "TC oficial";

  return (
    <>
      <Box sx={recordListSx}>{cards}</Box>
      <RateSheet open={open} title={sheetTitle} current={target?.tipoCambioUsd ?? null} onSave={saveRate} onClose={close} />
    </>
  );
};
