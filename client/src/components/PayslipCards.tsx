import { useCallback, type ReactNode } from "react";
import { Box, Chip } from "@mui/material";
import type { PayslipDTO } from "@ledgerly/shared";
import { usePatchPayslipRate } from "../api/hooks.js";
import { formatMoney, formatMoneyOrDash, formatPercent, formatPercentOrDash } from "../format.js";
import { byPeriodo, uniqueConceptLabels } from "../payslipConcepts.js";
import { ipcWindowLabel, raiseFor, type SalaryRaise } from "../salaryRaises.js";
import { RateSheet, RateValue } from "./RateSheet.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { SalaryRaiseChip } from "./SalaryRaiseChip.js";
import { useSheetTarget } from "./useSheetTarget.js";

interface PayslipCardsProps {
  payslips: PayslipDTO[];
  raises: Map<string, SalaryRaise>;
}

const sacBadge = <Chip label="SAC" size="small" color="secondary" variant="outlined" />;

const payslipName = (payslip: PayslipDTO): string =>
  payslip.tipo === "sac" ? `${payslip.periodo} SAC` : payslip.periodo;

const montoOf = (payslip: PayslipDTO, label: string): number | null =>
  payslip.conceptos.find((concepto) => concepto.label === label)?.monto ?? null;

const highlightsOf = (payslip: PayslipDTO): RecordField[] => [
  { label: "Neto", value: formatMoney(payslip.neto, "ARS") },
  { label: "Neto USD", value: formatMoneyOrDash(payslip.netoUsd, "USD") },
];

const raiseFieldsOf = (raise: SalaryRaise | undefined): RecordField[] => {
  if (!raise) return [];
  return [
    { label: "Aumento básico", value: formatPercent(raise.basicoPct) },
    { label: "Aumento bruto", value: formatPercentOrDash(raise.brutoPct) },
    { label: "IPC acumulado", value: formatPercentOrDash(raise.ipcPct) },
    { label: "Meses IPC", value: ipcWindowLabel(raise) },
  ];
};

const badgeOf = (payslip: PayslipDTO, raise: SalaryRaise | undefined): ReactNode => {
  if (payslip.tipo === "sac") return sacBadge;
  return raise ? <SalaryRaiseChip raise={raise} /> : undefined;
};

const detailsOf = (
  payslip: PayslipDTO,
  raise: SalaryRaise | undefined,
  conceptLabels: string[],
  onEditRate: () => void,
): RecordField[] => [
  { label: "Bruto", value: formatMoney(payslip.brutoTotal, "ARS") },
  ...raiseFieldsOf(raise),
  ...conceptLabels.map((label) => ({ label, value: formatMoneyOrDash(montoOf(payslip, label), "ARS") })),
  { label: "Descuentos", value: formatMoney(payslip.descuentos, "ARS") },
  {
    label: "TC oficial",
    value: <RateValue rate={payslip.tipoCambioUsd} editLabel={`editar TC recibo ${payslipName(payslip)}`} onEdit={onEditRate} />,
  },
];

export const PayslipCards = ({ payslips, raises }: PayslipCardsProps) => {
  const { mutate: patchRate } = usePatchPayslipRate();
  const { target, open, show, close } = useSheetTarget<PayslipDTO>();

  const saveRate = useCallback((rate: number) => {
    if (target) patchRate({ id: target.id, tipoCambioUsd: rate });
  }, [patchRate, target]);

  if (payslips.length === 0) return null;

  const sorted = [...payslips].sort(byPeriodo);
  const conceptLabels = uniqueConceptLabels(sorted);
  const cards = sorted.map((payslip) => {
    const raise = raiseFor(raises, payslip);
    return (
      <RecordCard
        key={payslip.id}
        title={payslip.periodo}
        label={payslipName(payslip)}
        badge={badgeOf(payslip, raise)}
        highlights={highlightsOf(payslip)}
        details={detailsOf(payslip, raise, conceptLabels, () => show(payslip))}
      />
    );
  });
  const sheetTitle = target ? `TC recibo ${payslipName(target)}` : "TC oficial";

  return (
    <>
      <Box sx={recordListSx}>{cards}</Box>
      <RateSheet
        open={open}
        title={sheetTitle}
        formKey={target?.id ?? ""}
        current={target?.tipoCambioUsd ?? null}
        onSave={saveRate}
        onClose={close}
      />
    </>
  );
};
