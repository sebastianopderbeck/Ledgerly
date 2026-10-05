import { Box } from "@mui/material";
import { formatPercent, formatPercentOrDash } from "../format.js";
import { ipcWindowLabel, type SalaryRaise } from "../salaryRaises.js";
import { RecordCard, recordListSx, type RecordField } from "./RecordCard.js";
import { SalaryRaiseChip } from "./SalaryRaiseChip.js";

interface SalaryRaiseCardsProps {
  raises: SalaryRaise[];
}

const highlightsOf = (raise: SalaryRaise): RecordField[] => [
  { label: "Aumento básico", value: formatPercent(raise.basicoPct) },
  { label: "IPC acumulado", value: formatPercentOrDash(raise.ipcPct) },
];

const detailsOf = (raise: SalaryRaise): RecordField[] => [
  { label: "Aumento bruto", value: formatPercentOrDash(raise.brutoPct) },
  { label: "Meses IPC", value: ipcWindowLabel(raise) },
];

export const SalaryRaiseCards = ({ raises }: SalaryRaiseCardsProps) => {
  const cards = raises.map((raise) => (
    <RecordCard
      key={raise.periodo}
      title={raise.periodo}
      badge={<SalaryRaiseChip raise={raise} />}
      highlights={highlightsOf(raise)}
      details={detailsOf(raise)}
    />
  ));
  return <Box sx={recordListSx}>{cards}</Box>;
};
