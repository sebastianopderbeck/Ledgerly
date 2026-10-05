import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip } from "@mui/material";
import { formatPercent, formatPercentOrDash } from "../format.js";
import type { PeriodoOrden } from "../payslipConcepts.js";
import { ipcWindowLabel, type SalaryRaise } from "../salaryRaises.js";
import { PeriodoSortHeader } from "./PeriodoSortHeader.js";
import { SalaryRaiseChip } from "./SalaryRaiseChip.js";

interface SalaryRaisesTableProps {
  raises: SalaryRaise[];
  orden: PeriodoOrden;
  onToggleOrden: () => void;
}

export const SalaryRaisesTable = ({ raises, orden, onToggleOrden }: SalaryRaisesTableProps) => {
  const rows = raises.map((raise) => (
    <TableRow key={raise.periodo}>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{raise.periodo}</TableCell>
      <TableCell align="right">{formatPercent(raise.basicoPct)}</TableCell>
      <TableCell align="right">{formatPercentOrDash(raise.brutoPct)}</TableCell>
      <TableCell align="right">
        <Tooltip title={`IPC de ${ipcWindowLabel(raise)}`} describeChild>
          <span>{formatPercentOrDash(raise.ipcPct)}</span>
        </Tooltip>
      </TableCell>
      <TableCell align="right"><SalaryRaiseChip raise={raise} /></TableCell>
    </TableRow>
  ));

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <PeriodoSortHeader orden={orden} onToggle={onToggleOrden} />
            <TableCell align="right">Aumento básico</TableCell>
            <TableCell align="right">Aumento bruto</TableCell>
            <TableCell align="right">IPC acumulado</TableCell>
            <TableCell align="right">vs IPC</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>{rows}</TableBody>
      </Table>
    </TableContainer>
  );
};
